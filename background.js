const DEFAULT_SETTINGS = {
  requestPath: '',
  rules: [{ keyPath: 'extra_data.visual_object.id', mode: 'strict', expected: 'auth_click' }],
  blockExternal: false,
};

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  const { settings } = await chrome.storage.local.get('settings');
  if (!settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS, matches: [], history: [] });
  }
});

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.type !== 'main_frame') {
      return {};
    }

    chrome.storage.local.get('settings').then(({ settings = DEFAULT_SETTINGS }) => {
      if (!settings.blockExternal) {
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
    });

    return {};
  },
  { urls: ['<all_urls>'] }
);

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}
