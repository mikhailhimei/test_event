const DEFAULT_SETTINGS = {
  requestPath: '',
  rules: [{ keyPath: 'extra_data.visual_object.id', mode: 'strict', expected: 'auth_click' }],
  blockExternal: false,
};

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
});

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

  const results = cachedSettings.rules.map((rule) => compareRule(rule, json));
  const meaningfulResults = results.filter((result) => result.found || result.matched || result.mode === 'loose');
  if (!meaningfulResults.length) return;

  const record = {
    id: crypto.randomUUID(),
    url: details.url,
    method: details.method,
    tabId: details.tabId,
    frameId: details.frameId,
    at: new Date().toISOString(),
    results: meaningfulResults,
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

function compareRule(rule, json) {
  const actualValues = getValuesByPath(json, rule.keyPath).map(stringifyComparable);
  const expectedValues = parseExpected(rule.expected);
  const matched = rule.mode === 'strict'
    ? actualValues.length === expectedValues.length && expectedValues.every((value, index) => actualValues[index] === value)
    : expectedValues.every((value) => actualValues.includes(value));

  return {
    keyPath: rule.keyPath,
    mode: rule.mode,
    expected: expectedValues,
    actual: actualValues,
    found: actualValues.length > 0,
    matched,
    extra: rule.mode === 'loose' ? actualValues.filter((value) => !expectedValues.includes(value)) : [],
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
  return value.split(',').map((part) => part.trim()).filter(Boolean).map(stringifyComparable);
}

function stringifyComparable(value) {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function warnAboutExternalNavigation(details) {
  if (details.type !== 'main_frame' || !cachedSettings.blockExternal || details.tabId < 0) {
    return;
  }

  chrome.tabs.get(details.tabId, (tab) => {
    if (chrome.runtime.lastError || !tab?.url) {
      return;
    }

    const currentHost = safeHost(tab.url);
    const nextHost = safeHost(details.url);
    if (currentHost && nextHost && currentHost !== nextHost) {
      chrome.scripting.executeScript({
        target: { tabId: details.tabId },
        func: (from, to) => alert(`Переход на сторонний ресурс: ${from} → ${to}`),
        args: [currentHost, nextHost],
      });
    }
  });
}

function normalizeSettings(settings) {
  return {
    ...DEFAULT_SETTINGS,
    ...(settings || {}),
    rules: settings?.rules?.length ? settings.rules : DEFAULT_SETTINGS.rules,
  };
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}
