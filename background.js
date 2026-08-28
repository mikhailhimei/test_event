const DEFAULT_SCENARIO = {
  name: 'Сценарий 1',
  rules: [{ keyPath: 'extra_data.visual_object.id', mode: 'strict', expected: 'auth_click' }],
};
const DEFAULT_SETTINGS = {
  requestPath: '',
  scenarios: [DEFAULT_SCENARIO],
  variables: [],
  commonElements: [],
  blockExternal: false,
};

const tabHostById = new Map();
const tabUrlById = new Map();
const pendingRequests = new Map();
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
    tabUrlById.set(tabId, changeInfo.url);
  } else if (typeof tab.url === 'string') {
    tabHostById.set(tabId, safeHost(tab.url));
    tabUrlById.set(tabId, tab.url);
  }
});
chrome.tabs.onRemoved.addListener((tabId) => tabHostById.delete(tabId));
chrome.tabs.onRemoved.addListener((tabId) => tabUrlById.delete(tabId));

async function initTabHosts() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (typeof tab.id === 'number') {
      tabHostById.set(tab.id, safeHost(tab.url));
      if (typeof tab.url === 'string') tabUrlById.set(tab.id, tab.url);
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
    if (cachedSettings.requestPath && details.url.includes(cachedSettings.requestPath)) {
      const json = parseRequestBody(details.requestBody);
      if (json) pendingRequests.set(details.requestId, { details, json });
    }
    return {};
  },
  { urls: ['<all_urls>'] },
  ['requestBody']
);

chrome.webRequest.onCompleted.addListener((details) => {
  const pendingRequest = pendingRequests.get(details.requestId);
  pendingRequests.delete(details.requestId);
  if (!pendingRequest) return;

  void inspectOutgoingRequest(pendingRequest.details, pendingRequest.json, details.statusCode);
}, { urls: ['<all_urls>'] });

chrome.webRequest.onErrorOccurred.addListener((details) => {
  const pendingRequest = pendingRequests.get(details.requestId);
  pendingRequests.delete(details.requestId);
  if (!pendingRequest) return;

  void saveErrorRecord(pendingRequest.details, pendingRequest.json, details.error);
}, { urls: ['<all_urls>'] });

async function inspectOutgoingRequest(details, json, statusCode) {
  if (statusCode !== 200) {
    await saveErrorRecord(details, json, `HTTP ${statusCode}`);
    return;
  }

  const meaningfulResults = [];
  const variableValues = await evaluateVariables(details);

  for (const [scenarioIndex, scenario] of cachedSettings.scenarios.entries()) {
    if (scenario.enabled === false) continue;

    const commonElementIds = scenario.commonElementIds || (scenario.commonElementId ? [scenario.commonElementId] : []);
    const commonRules = cachedSettings.commonElements
      .filter((element) => commonElementIds.includes(element.id))
      .flatMap((element) => element.rules || []);
    const rules = [...commonRules, ...(scenario.rules || [])];
    const results = await Promise.all(
      rules.map((rule, ruleIndex) => compareRule(rule, json, details, scenario.name, variableValues).then((result) => ({
        ...result,
        scenarioIndex,
        ruleIndex,
      })))
    );

    const hasBlockingMismatch = results.some((result) => (
      (result.mode === 'strict' || result.expectedArrayLength !== null && result.expectedArrayLength !== undefined)
      && !result.matched
    ));
    const hasMatchedRule = results.some((result) => result.matched);

    if (!hasBlockingMismatch && hasMatchedRule) meaningfulResults.push(...results);
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

async function saveErrorRecord(details, json, error) {
  const record = {
    id: crypto.randomUUID(),
    url: details.url,
    method: details.method,
    tabId: details.tabId,
    frameId: details.frameId,
    at: new Date().toISOString(),
    error: `Запрос завершился с ошибкой: ${error}`,
    request: json,
    results: [],
  };
  const { matches = [] } = await chrome.storage.local.get('matches');
  await chrome.storage.local.set({ matches: [record, ...matches].slice(0, 100) });
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
  const actualRawValues = getValuesByPath(json, rule.keyPath);
  const actualValues = actualRawValues.map(stringifyComparable);
  const expectedGroups = parseExpected(rule.expected);
  const resolvedExpectedGroups = await resolveExpectedGroups(expectedGroups, details, variableValues);
  const expectedArrayLength = resolvedExpectedGroups.length > 1 ? resolvedExpectedGroups.length : null;
  const actualArrayLength = expectedArrayLength === null ? null : actualValues.length;
  const arrayLengthValid = expectedArrayLength === null || actualArrayLength === expectedArrayLength;
  const matched = rule.mode === 'exists'
    ? actualRawValues.some(isNonEmptyValue)
      : matchExpectedValues(actualValues, resolvedExpectedGroups, rule.mode);
  const actualMatches = resolvedExpectedGroups.length > 1 && actualValues.length === resolvedExpectedGroups.length
    ? actualValues.map((actualValue, index) => resolvedExpectedGroups[index]?.includes(actualValue) || false)
    : null;
  const expectedFlatValues = resolvedExpectedGroups.flat();
  const descriptions = String(rule.description || '').split('|').map((description) => description.trim());

  return {
    scenarioName,
    keyPath: rule.keyPath,
    mode: rule.mode,
    expected: resolvedExpectedGroups.map((values) => values.join(' | ')),
    actual: actualValues,
    actualMatches,
    expectedArrayLength,
    actualArrayLength,
    arrayLengthValid,
    actualDescriptions: actualValues.map((actualValue) => {
      const expectedIndex = expectedFlatValues.indexOf(actualValue);
      return expectedIndex >= 0 ? descriptions[expectedIndex] || '' : '';
    }),
    found: actualValues.length > 0,
    matched,
    extra: rule.mode === 'loose' ? actualValues.filter((value) => !expectedFlatValues.includes(value)) : [],
  };
}

function isNonEmptyValue(value) {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function matchExpectedValues(actualValues, expectedGroups, mode) {
  if (!actualValues.length || !expectedGroups.length) return false;

  if (expectedGroups.length > 1) {
    return matchPositionally(actualValues, expectedGroups);
  }

  return mode === 'strict'
    ? actualValues.every((actualValue) => expectedGroups[0].includes(actualValue))
    : actualValues.some((actualValue) => expectedGroups[0].includes(actualValue));
}

function matchPositionally(actualValues, expectedGroups) {
  const hasSameValuesCount = actualValues.length === expectedGroups.length;
  if (!hasSameValuesCount) return false;

  return expectedGroups.every((values, index) => values.includes(actualValues[index]));
}

async function resolveExpectedGroups(expectedGroups, details, variableValues) {
  return await Promise.all(expectedGroups.map(async (variants) => {
    return await Promise.all(variants.map(async (entry) => {
      if (entry.type === 'cookie') {
        console.log(details)
        const cookie = await chrome.cookies.get({ url: details.initiator, name: entry.name });
        return stringifyComparable(cookie?.value ?? '');
      }
      if (entry.type === 'httpBody') {
        return stringifyComparable(await fetchHttpBody(entry.url, details, entry.responsePath));
      }
      if (entry.type === 'url') {
        return stringifyComparable(getPageUrl(details));
      }
      if (entry.type === 'path') {
        try {
          return stringifyComparable(new URL(getPageUrl(details)).pathname || '');
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
    .flatMap((part) => splitTopLevel(part, ';'))
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

  const httpBodyMatch = value.match(/^<<\s*http\(\s*(.+?)\s*\)\.body\s*>>$/i);
  if (httpBodyMatch) {
    return { type: 'httpBody', url: httpBodyMatch[1], responsePath: '' };
  }

  const httpValueMatch = value.match(/^<<\s*http\(\s*(.+?)\s*\)\.body\.([a-zA-Z0-9_.-]+)\s*>>$/i);
  if (httpValueMatch) {
    return { type: 'httpBody', url: httpValueMatch[1], responsePath: httpValueMatch[2] };
  }

  if (/^<<\s*(?:url|full_url)\s*>>$/i.test(value)) {
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
    if (token.type === 'httpBody') {
      return stringifyComparable(await fetchHttpBody(token.url, details, token.responsePath));
    }
    if (token.type === 'url') return getPageUrl(details);
    if (token.type === 'path') {
      try {
        return new URL(getPageUrl(details)).pathname || '';
      } catch {
        return '';
      }
    }
    if (token.type === 'cookie') {
      try {
        const cookie = await chrome.cookies.get({ url: details.initiator, name: token.name });
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

async function fetchHttpBody(url, details, responsePath = '') {
  try {
    const requestUrl = resolveHttpUrl(url, details);
    if (!requestUrl) return '';

    const response = await fetch(requestUrl, {
      method: 'GET',
      credentials: 'include',
    });
    if (!response.ok) return '';

    const bodyText = await response.text();
    const body = parseJsonLikeValue(bodyText) ?? bodyText;
    if (!responsePath) return body;

    let values = getValuesByPath(body, responsePath);
    if (!values.length && body && typeof body === 'object' && body.body !== undefined) {
      values = getValuesByPath(body.body, responsePath);
    }
    if (!values.length) return '';
    return values.length === 1 ? values[0] : values;
  } catch {
    return '';
  }
}

function resolveHttpUrl(url, details) {
  try {
    if (/^https?:\/\//i.test(url)) return url;

    const pageUrl = new URL(getPageUrl(details));
    return new URL(`/${url.replace(/^\/+/, '')}`, pageUrl.origin).toString();
  } catch {
    return '';
  }
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

function getPageUrl(details) {
  return details.documentUrl || tabUrlById.get(details.tabId) || details.initiator || '';
}


function normalizeScenarios(settings) {
  if (Array.isArray(settings?.scenarios)) {
    return settings.scenarios.map((scenario) => ({
      enabled: true,
      ...scenario,
      commonElementIds: normalizeCommonElementIds(scenario),
    }));
  }
  if (settings?.rules?.length) return [{ name: 'Сценарий 1', rules: settings.rules, enabled: true }];
  return DEFAULT_SETTINGS.scenarios;
}

function normalizeCommonElementIds(scenario) {
  const ids = Array.isArray(scenario.commonElementIds)
    ? scenario.commonElementIds
    : scenario.commonElementId ? [scenario.commonElementId] : [];
  return ids.flat(Infinity).filter((id) => typeof id === 'string' && id);
}
