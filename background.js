const DEFAULT_SCENARIO = {
  name: 'Сценарий 1',
  rules: [{ keyPath: 'extra_data.visual_object.id', mode: 'strict', expected: 'auth_click', required: true }],
};
const DEFAULT_SETTINGS = {
  requestPath: '',
  scenarios: [DEFAULT_SCENARIO],
  variables: [],
  commonElements: [],
  blockExternal: false,
};

const tabHostById = new Map();
let cachedSettings = DEFAULT_SETTINGS;
const decoder = new TextDecoder('utf-8');

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  const { settings, matches, history } = await chrome.storage.local.get(['settings', 'matches', 'history']);
  cachedSettings = normalizeSettings(settings);
  await chrome.storage.local.set({
    settings: cachedSettings,
    matches: matches || [],
    history: history || [],
  });
  await initTabHosts();
});

chrome.runtime.onStartup.addListener(initTabHosts);
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (typeof changeInfo.url === 'string') {
    tabHostById.set(tabId, safeHost(changeInfo.url));
  } else if (typeof tab.url === 'string') {
    tabHostById.set(tabId, safeHost(tab.url));
  }
});
chrome.tabs.onRemoved.addListener((tabId) => tabHostById.delete(tabId));

async function initTabHosts() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (typeof tab.id === 'number') {
      tabHostById.set(tab.id, safeHost(tab.url));
    }
  }
}

chrome.storage.local.get('settings').then(({ settings }) => {
  cachedSettings = normalizeSettings(settings);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.settings) {
    cachedSettings = normalizeSettings(changes.settings.newValue);
  }
});

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    warnAboutExternalNavigation(details);
    void inspectOutgoingRequest(details);
    return {};
  },
  { urls: ['<all_urls>'] },
  ['requestBody']
);

async function inspectOutgoingRequest(details) {
  if (!cachedSettings.requestPath || !details.url.includes(cachedSettings.requestPath)) return;

  const json = parseRequestBody(details.requestBody);
  if (!json) return;

  const meaningfulResults = [];
  const variableValues = await evaluateVariables(details);

  for (const scenario of cachedSettings.scenarios) {
    if (scenario.enabled === false) continue;

    const commonElement = cachedSettings.commonElements.find((element) => element.id === scenario.commonElementId);
    const rules = [...(commonElement?.rules || []), ...(scenario.rules || [])];
    const results = await Promise.all(
      rules.map((rule) => compareRule(rule, json, details, scenario.name, variableValues))
    );

    const requiredResults = results.filter((result) => result.required);
    const requiredPassed = requiredResults.length
      ? requiredResults.every((result) => result.matched)
      : results.some((result) => result.found || result.matched || result.mode === 'loose');

    if (requiredPassed) {
      meaningfulResults.push(...results);
    }
  }

  if (!meaningfulResults.length) return;

  const record = {
    id: crypto.randomUUID(),
    url: details.url,
    method: details.method,
    tabId: details.tabId,
    frameId: details.frameId,
    at: new Date().toISOString(),
    results: meaningfulResults,
    request: json,
  };

  const { matches = [], history = [] } = await chrome.storage.local.get(['matches', 'history']);
  const nextMatches = [record, ...matches].slice(0, 100);
  const nextHistory = meaningfulResults.some((result) => result.matched)
    ? [record, ...history].slice(0, 300)
    : history;

  await chrome.storage.local.set({ matches: nextMatches, history: nextHistory });
}

function parseRequestBody(requestBody) {
  if (!requestBody) return null;

  const rawPayload = readRawPayload(requestBody.raw);
  if (rawPayload) {
    const parsedRaw = parseJsonLikeValue(rawPayload);
    if (parsedRaw) return parsedRaw;
  }

  if (requestBody.formData) {
    const formObject = Object.fromEntries(
      Object.entries(requestBody.formData).map(([key, values]) => [key, values.length === 1 ? values[0] : values])
    );
    const nestedJson = ['payload', 'data', 'json'].map((key) => requestBody.formData[key]?.[0]).find(Boolean);
    return parseJsonLikeValue(nestedJson) || formObject;
  }

  return null;
}

function readRawPayload(rawParts = []) {
  return rawParts
    .map((part) => part.bytes ? decoder.decode(part.bytes) : '')
    .join('')
    .trim();
}

function parseJsonLikeValue(value) {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function compareRule(rule, json, details, scenarioName, variableValues) {
  const actualValues = getValuesByPath(json, rule.keyPath).map(stringifyComparable);
  const expectedGroups = parseExpected(rule.expected);
  const resolvedExpectedGroups = await resolveExpectedGroups(expectedGroups, details, variableValues);
  const matched = rule.mode === 'exists'
    ? actualValues.length > 0
    : rule.mode === 'strict'
      ? actualValues.length === resolvedExpectedGroups.length && resolvedExpectedGroups.every((values, index) => values.includes(actualValues[index]))
      : resolvedExpectedGroups.every((values) => actualValues.some((actualValue) => values.includes(actualValue)));
  const expectedFlatValues = resolvedExpectedGroups.flat();

  return {
    scenarioName,
    keyPath: rule.keyPath,
    required: Boolean(rule.required),
    mode: rule.mode,
    expected: resolvedExpectedGroups.map((values) => values.join(' | ')),
    actual: actualValues,
    found: actualValues.length > 0,
    matched,
    extra: rule.mode === 'loose' ? actualValues.filter((value) => !expectedFlatValues.includes(value)) : [],
  };
}

async function resolveExpectedGroups(expectedGroups, details, variableValues) {
  return await Promise.all(expectedGroups.map(async (variants) => {
    return await Promise.all(variants.map(async (entry) => {
      if (entry.type === 'cookie') {
        const cookie = await chrome.cookies.get({ url: details.url, name: entry.name });
        return stringifyComparable(cookie?.value ?? '');
      }
      if (entry.type === 'url') {
        return stringifyComparable(details.url || '');
      }
      if (entry.type === 'path') {
        try {
          return stringifyComparable(new URL(details.url).pathname || '');
        } catch {
          return '';
        }
      }
      if (entry.type === 'variable') {
        return stringifyComparable(variableValues[entry.name] ?? '');
      }
      return stringifyComparable(entry.value);
    }));
  }));
}

function getValuesByPath(source, path) {
  return path.split('.').reduce((values, key) => values.flatMap((value) => {
    if (Array.isArray(value)) {
      return value.map((item) => item?.[key]).filter((item) => item !== undefined);
    }

    const nextValue = value?.[key];
    return nextValue === undefined ? [] : [nextValue];
  }), [source]).flatMap((value) => Array.isArray(value) ? value : [value]);
}

function parseExpected(value) {
  return splitTopLevel(value, ',')
    .map((part) => splitTopLevel(part, '|')
      .map((variant) => variant.trim())
      .filter(Boolean)
      .map((variant) => {
        const token = parseDynamicToken(variant);
        if (token) return token;
        const parsed = parseJsonLikeValue(variant);
        return { type: 'literal', value: parsed !== null ? parsed : variant };
      }))
    .filter((variants) => variants.length);
}

function parseDynamicToken(value) {
  const cookieMatch = value.match(/^<<\s*cookie\(\s*([^\)]+?)\s*\)\s*>>$/i);
  if (cookieMatch) {
    return { type: 'cookie', name: cookieMatch[1] };
  }

  if (/^<<\s*url\s*>>$/i.test(value)) {
    return { type: 'url' };
  }

  if (/^<<\s*path\s*>>$/i.test(value)) {
    return { type: 'path' };
  }

  const variableMatch = value.match(/^<<\s*([a-zA-Z0-9_]+)\s*>>$/);
  if (variableMatch) {
    return { type: 'variable', name: variableMatch[1] };
  }

  return null;
}

function stringifyComparable(value) {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

async function evaluateVariables(details) {
  const variableValues = {};

  for (const variable of cachedSettings.variables || []) {
    const name = variable.name?.trim();
    if (!name) continue;
    variableValues[name] = await evaluateVariableExpression(variable.expression, details, variableValues);
  }

  return variableValues;
}

async function evaluateVariableExpression(expression, details, currentValues) {
  if (!expression) return '';

  const branches = splitTopLevel(expression, '||').map((branch) => branch.trim()).filter(Boolean);
  for (const branch of branches) {
    const [conditionPiece, valuePiece] = splitOnce(branch, ':');
    if (valuePiece === undefined) {
      return evaluateExpressionValue(conditionPiece.trim(), details, currentValues);
    }

    const condition = conditionPiece.trim();
    if (!condition || evaluateCondition(condition, details, currentValues)) {
      return evaluateExpressionValue(valuePiece.trim(), details, currentValues);
    }
  }

  return '';
}

function splitOnce(value, separator) {
  let quote = null;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (quote) {
      if (char === quote && value[i - 1] !== '\\') quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (value.slice(i, i + separator.length) === separator) {
      return [value.slice(0, i), value.slice(i + separator.length)];
    }
  }
  return [value];
}

async function evaluateCondition(condition, details, currentValues) {
  const orParts = splitTopLevel(condition, '||').map((part) => part.trim()).filter(Boolean);
  for (const part of orParts) {
    const andParts = splitTopLevel(part, '&&').map((operand) => operand.trim()).filter(Boolean);
    const allTrue = await Promise.all(andParts.map((subPart) => evaluateComparison(subPart, details, currentValues)));
    if (allTrue.every(Boolean)) return true;
  }
  return false;
}

async function evaluateComparison(expression, details, currentValues) {
  const operatorMatch = expression.match(/(==|!=|>=|<=|>|<)/);
  if (!operatorMatch) {
    return Boolean(await evaluateExpressionValue(expression, details, currentValues));
  }

  const operator = operatorMatch[1];
  const index = expression.indexOf(operator);
  const leftRaw = expression.slice(0, index).trim();
  const rightRaw = expression.slice(index + operator.length).trim();
  const left = await evaluateExpressionValue(leftRaw, details, currentValues);
  const right = await evaluateExpressionValue(rightRaw, details, currentValues);

  if (operator === '==') return left === right || hasSimilarWord(left, right);
  if (operator === '!=') return left !== right && !hasSimilarWord(left, right);
  if (operator === '>') return left > right;
  if (operator === '<') return left < right;
  if (operator === '>=') return left >= right;
  if (operator === '<=') return left <= right;
  return false;
}

async function evaluateExpressionValue(value, details, currentValues) {
  const token = parseDynamicToken(value);
  if (token) {
    if (token.type === 'url') return details.url || '';
    if (token.type === 'path') {
      try {
        return new URL(details.url).pathname || '';
      } catch {
        return '';
      }
    }
    if (token.type === 'cookie') {
      try {
        const cookie = await chrome.cookies.get({ url: details.url, name: token.name });
        return stringifyComparable(cookie?.value ?? '');
      } catch {
        return '';
      }
    }
    if (token.type === 'variable') {
      return currentValues[token.name] ?? '';
    }
  }

  const literal = parseJsonLikeValue(value);
  if (literal !== null) return stringifyComparable(literal);

  const stringMatch = value.match(/^(['"])(.*)\1$/);
  if (stringMatch) return stringMatch[2];

  return value;
}

function splitTopLevel(value, separator) {
  const parts = [];
  let current = '';
  let depth = 0;
  let quote = null;

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];

    if (quote) {
      current += char;
      if (char === quote && value[i - 1] !== '\\') quote = null;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }

    if (char === '{' || char === '[' || char === '(') {
      depth += 1;
      current += char;
      continue;
    }

    if (char === '}' || char === ']' || char === ')') {
      depth = Math.max(0, depth - 1);
      current += char;
      continue;
    }

    if (depth === 0 && value.slice(i, i + separator.length) === separator) {
      parts.push(current.trim());
      current = '';
      i += separator.length - 1;
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function warnAboutExternalNavigation(details) {
  if (details.type !== 'main_frame' || !cachedSettings.blockExternal || details.tabId < 0) {
    return null;
  }

  const currentHost =
    tabHostById.get(details.tabId) || safeHost(details.initiator || details.originUrl);
  const nextHost = safeHost(details.url);

  if (!currentHost || !nextHost || currentHost === nextHost) {
    return null;
  }

  chrome.scripting.executeScript({
    target: { tabId: details.tabId },
    func: (from, to) => alert(`Переход на сторонний ресурс: ${from} → ${to}`),
    args: [currentHost, nextHost],
  });

  return null;
}

function normalizeSettings(settings) {
  return {
    ...DEFAULT_SETTINGS,
    ...(settings || {}),
    scenarios: normalizeScenarios(settings),
    variables: normalizeVariables(settings),
    commonElements: normalizeCommonElements(settings),
  };
}

function normalizeVariables(settings) {
  if (Array.isArray(settings?.variables)) {
    return settings.variables.map((variable) => ({
      name: variable.name?.trim() || '',
      expression: variable.expression?.trim() || '',
    })).filter((variable) => variable.name && variable.expression);
  }
  return [];
}

function hasSimilarWord(left, right) {
  const leftWords = String(left).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  const rightWords = String(right).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  return leftWords.some((leftWord) => rightWords.some((rightWord) => leftWord.includes(rightWord) || rightWord.includes(leftWord)));
}

function normalizeCommonElements(settings) {
  if (Array.isArray(settings?.commonElements)) {
    return settings.commonElements.map((element, index) => ({
      id: element.id || `common-${index}`,
      name: element.name?.trim() || `Общий элемент ${index + 1}`,
      rules: Array.isArray(element.rules) ? element.rules : [],
    }));
  }
  return [];
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}


function normalizeScenarios(settings) {
  if (settings?.scenarios?.length) {
    return settings.scenarios.map((scenario) => ({ enabled: true, ...scenario }));
  }
  if (settings?.rules?.length) return [{ name: 'Сценарий 1', rules: settings.rules, enabled: true }];
  return DEFAULT_SETTINGS.scenarios;
}
