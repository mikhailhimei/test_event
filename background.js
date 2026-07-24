const DEFAULT_SCENARIO = {
  name: 'Сценарий 1',
  rules: [{ keyPath: 'extra_data.visual_object.id', mode: 'strict', expected: 'auth_click', required: true }],
};
const DEFAULT_SETTINGS = {
  requestPath: '',
  scenarios: [DEFAULT_SCENARIO],
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
    const blocked = warnAboutExternalNavigation(details);
    void inspectOutgoingRequest(details);
    return blocked || {};
  },
  { urls: ['<all_urls>'] },
  ['requestBody', 'blocking']
);

async function inspectOutgoingRequest(details) {
  if (!cachedSettings.requestPath || !details.url.includes(cachedSettings.requestPath)) return;

  const json = parseRequestBody(details.requestBody);
  if (!json) return;

  const meaningfulResults = cachedSettings.scenarios.flatMap((scenario) => {
    if (scenario.enabled === false) return [];

    const results = scenario.rules.map((rule) => compareRule(rule, json, scenario.name));
    const requiredResults = results.filter((result) => result.required);
    const requiredPassed = requiredResults.length
      ? requiredResults.every((result) => result.matched)
      : results.some((result) => result.found || result.matched || result.mode === 'loose');

    return requiredPassed ? results : [];
  });

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

function compareRule(rule, json, scenarioName) {
  const actualValues = getValuesByPath(json, rule.keyPath).map(stringifyComparable);
  const expectedGroups = parseExpected(rule.expected);
  const matched = rule.mode === 'exists'
    ? actualValues.length > 0
    : rule.mode === 'strict'
      ? actualValues.length === expectedGroups.length && expectedGroups.every((values, index) => values.includes(actualValues[index]))
      : expectedGroups.every((values) => actualValues.some((actualValue) => values.includes(actualValue)));
  const expectedFlatValues = expectedGroups.flat();

  return {
    scenarioName,
    keyPath: rule.keyPath,
    required: Boolean(rule.required),
    mode: rule.mode,
    expected: expectedGroups.map((values) => values.join(' | ')),
    actual: actualValues,
    found: actualValues.length > 0,
    matched,
    extra: rule.mode === 'loose' ? actualValues.filter((value) => !expectedFlatValues.includes(value)) : [],
  };
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
        const parsed = parseJsonLikeValue(variant);
        return stringifyComparable(parsed !== null ? parsed : variant);
      }))
    .filter((variants) => variants.length);
}

function splitTopLevel(value, separator) {
  const parts = [];
  let current = '';
  let depth = 0;
  let inString = false;
  let escape = false;

  for (const char of value) {
    if (escape) {
      current += char;
      escape = false;
      continue;
    }

    if (char === '\\' && inString) {
      current += char;
      escape = true;
      continue;
    }

    if (char === '"') {
      current += char;
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{' || char === '[') {
        depth += 1;
      } else if (char === '}' || char === ']') {
        depth = Math.max(0, depth - 1);
      }

      if (depth === 0 && char === separator) {
        parts.push(current.trim());
        current = '';
        continue;
      }
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function stringifyComparable(value) {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
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

  return { cancel: true };
}

function normalizeSettings(settings) {
  return {
    ...DEFAULT_SETTINGS,
    ...(settings || {}),
    scenarios: normalizeScenarios(settings),
  };
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
