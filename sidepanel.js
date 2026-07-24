const DEFAULT_RULE = { keyPath: '', mode: 'strict', expected: '' };
const DEFAULT_SETTINGS = {
  requestPath: '',
  rules: [{ keyPath: 'extra_data.visual_object.id', mode: 'strict', expected: 'auth_click' }],
  blockExternal: false,
};

const state = {
  settings: DEFAULT_SETTINGS,
  matches: [],
  history: [],
};

const els = {
  requestPath: document.querySelector('#requestPath'),
  rules: document.querySelector('#rules'),
  ruleTemplate: document.querySelector('#ruleTemplate'),
  addRule: document.querySelector('#addRule'),
  saveSettings: document.querySelector('#saveSettings'),
  clearMatches: document.querySelector('#clearMatches'),
  clearHistory: document.querySelector('#clearHistory'),
  matches: document.querySelector('#matches'),
  history: document.querySelector('#history'),
  blockExternal: document.querySelector('#blockExternal'),
  tabs: document.querySelectorAll('.tab'),
  panels: document.querySelectorAll('.tab-panel'),
};

init();

async function init() {
  const data = await chrome.storage.local.get(['settings', 'matches', 'history']);
  state.settings = normalizeSettings(data.settings);
  state.matches = data.matches || [];
  state.history = data.history || [];

  renderSettings();
  renderMatches();
  renderHistory();
  bindUi();
  chrome.storage.onChanged.addListener(handleStorageChanges);
}

function bindUi() {
  els.addRule.addEventListener('click', () => addRule(DEFAULT_RULE));
  els.saveSettings.addEventListener('click', saveSettings);
  els.blockExternal.addEventListener('change', saveSettings);
  els.clearMatches.addEventListener('click', async () => {
    state.matches = [];
    await chrome.storage.local.set({ matches: [] });
    renderMatches();
  });
  els.clearHistory.addEventListener('click', async () => {
    state.history = [];
    await chrome.storage.local.set({ history: [] });
    renderHistory();
  });
  els.tabs.forEach((tab) => tab.addEventListener('click', () => activateTab(tab.dataset.tab)));
}

function activateTab(name) {
  els.tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === name));
  els.panels.forEach((panel) => panel.classList.toggle('active', panel.id === `${name}Tab`));
}

function renderSettings() {
  els.requestPath.value = state.settings.requestPath;
  els.blockExternal.checked = Boolean(state.settings.blockExternal);
  els.rules.replaceChildren();
  state.settings.rules.forEach(addRule);
}

function addRule(rule) {
  const node = els.ruleTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector('.rule-path').value = rule.keyPath || '';
  node.querySelector('.rule-mode').value = rule.mode || 'strict';
  node.querySelector('.rule-value').value = rule.expected || '';
  node.querySelector('.remove-rule').addEventListener('click', () => node.remove());
  els.rules.append(node);
}

async function saveSettings() {
  const rules = [...els.rules.querySelectorAll('.rule')].map((rule) => ({
    keyPath: rule.querySelector('.rule-path').value.trim(),
    mode: rule.querySelector('.rule-mode').value,
    expected: rule.querySelector('.rule-value').value.trim(),
  })).filter((rule) => rule.keyPath && rule.expected);

  state.settings = {
    requestPath: els.requestPath.value.trim(),
    rules: rules.length ? rules : [DEFAULT_RULE],
    blockExternal: els.blockExternal.checked,
  };

  await chrome.storage.local.set({ settings: state.settings });
}

function handleStorageChanges(changes, areaName) {
  if (areaName !== 'local') return;

  if (changes.matches) {
    state.matches = changes.matches.newValue || [];
    renderMatches();
  }

  if (changes.history) {
    state.history = changes.history.newValue || [];
    renderHistory();
  }
}

function renderMatches() {
  renderList(els.matches, state.matches, 'Совпадений пока нет.');
}

function renderHistory() {
  renderList(els.history, state.history, 'История пуста.');
}

function renderList(container, records, emptyText) {
  container.classList.toggle('empty', records.length === 0);
  if (!records.length) {
    container.textContent = emptyText;
    return;
  }

  container.replaceChildren(...records.map((record) => {
    const item = document.createElement('article');
    const allMatched = record.results.every((result) => result.matched);
    item.className = `item ${allMatched ? 'match' : 'mismatch'}`;
    item.innerHTML = `
      <div class="item-title">${allMatched ? 'Совпало' : 'Есть несовпадения'}</div>
      <div>${escapeHtml(record.url)}</div>
      <div class="item-meta">${new Date(record.at).toLocaleString()} · ${record.method || 'REQUEST'}</div>
      <pre>${escapeHtml(formatResults(record.results))}</pre>
    `;
    return item;
  }));
}

function formatResults(results) {
  return results.map((result) => {
    const lines = [
      `${result.keyPath} | ${result.mode === 'strict' ? 'строго' : 'не строго'}`,
      `ожидали: ${result.expected.join(', ')}`,
      `получили: ${result.actual.join(', ')}`,
      `результат: ${result.matched ? 'совпало' : 'не совпало'}`,
    ];
    if (result.extra.length) {
      lines.push(`доп. поля: ${result.extra.join(', ')}`);
    }
    return lines.join('\n');
  }).join('\n\n');
}

function normalizeSettings(settings) {
  return {
    ...DEFAULT_SETTINGS,
    ...(settings || {}),
    rules: settings?.rules?.length ? settings.rules : DEFAULT_SETTINGS.rules,
  };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[char]));
}
