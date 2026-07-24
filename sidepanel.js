const DEFAULT_RULE = { keyPath: '', mode: 'strict', expected: '' };
const DEFAULT_SCENARIO = {
  name: 'Сценарий 1',
  rules: [{ keyPath: 'extra_data.visual_object.id', mode: 'strict', expected: 'auth_click', required: true }],
};
const DEFAULT_SETTINGS = {
  requestPath: '',
  scenarios: [DEFAULT_SCENARIO],
  blockExternal: false,
};

const state = {
  settings: DEFAULT_SETTINGS,
  matches: [],
  history: [],
};

const els = {
  requestPath: document.querySelector('#requestPath'),
  scenarios: document.querySelector('#scenarios'),
  scenarioTemplate: document.querySelector('#scenarioTemplate'),
  ruleTemplate: document.querySelector('#ruleTemplate'),
  addScenario: document.querySelector('#addScenario'),
  toggleScenarios: document.querySelector('#toggleScenarios'),
  saveSettings: document.querySelector('#saveSettings'),
  clearMatches: document.querySelector('#clearMatches'),
  clearHistory: document.querySelector('#clearHistory'),
  matches: document.querySelector('#matches'),
  history: document.querySelector('#history'),
  blockExternal: document.querySelector('#blockExternal'),
  downloadScenarios: document.querySelector('#downloadScenarios'),
  uploadScenarios: document.querySelector('#uploadScenarios'),
  transferStatus: document.querySelector('#transferStatus'),
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
  els.addScenario.addEventListener('click', () => addScenario({ name: `Сценарий ${els.scenarios.children.length + 1}`, rules: [DEFAULT_RULE] }));
  els.toggleScenarios.addEventListener('click', toggleAllScenarios);
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
  els.downloadScenarios.addEventListener('click', downloadScenarios);
  els.uploadScenarios.addEventListener('change', uploadScenarios);
}

function activateTab(name) {
  els.tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === name));
  els.panels.forEach((panel) => panel.classList.toggle('active', panel.id === `${name}Tab`));
}

function renderSettings() {
  els.requestPath.value = state.settings.requestPath;
  els.blockExternal.checked = Boolean(state.settings.blockExternal);
  els.scenarios.replaceChildren();
  state.settings.scenarios.forEach(addScenario);
}

function addScenario(scenario) {
  const node = els.scenarioTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector('.scenario-name').value = scenario.name || `Сценарий ${els.scenarios.children.length + 1}`;
  node.querySelector('.scenario-name').addEventListener('click', (event) => event.stopPropagation());
  node.querySelector('.scenario-name').addEventListener('keydown', (event) => event.stopPropagation());
  node.addEventListener('toggle', updateScenarioToggleButton);
  node.querySelector('.add-rule').addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    addRule(node.querySelector('.scenario-rules'), DEFAULT_RULE);
  });
  const rulesContainer = node.querySelector('.scenario-rules');
  (scenario.rules?.length ? scenario.rules : [DEFAULT_RULE]).forEach((rule) => addRule(rulesContainer, rule));
  els.scenarios.append(node);
  updateScenarioToggleButton();
}

function toggleAllScenarios() {
  const scenarios = [...els.scenarios.querySelectorAll('.scenario')];
  const shouldOpen = scenarios.some((scenario) => !scenario.open);
  scenarios.forEach((scenario) => { scenario.open = shouldOpen; });
  updateScenarioToggleButton();
}

function updateScenarioToggleButton() {
  const scenarios = [...els.scenarios.querySelectorAll('.scenario')];
  const allOpen = scenarios.length > 0 && scenarios.every((scenario) => scenario.open);
  els.toggleScenarios.textContent = allOpen ? 'Скрыть все' : 'Показать все';
}


function addRule(container, rule) {
  const node = els.ruleTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector('.rule-path').value = rule.keyPath || '';
  node.querySelector('.rule-mode').value = rule.mode || 'strict';
  node.querySelector('.rule-value').value = rule.expected || '';
  node.querySelector('.rule-required-input').checked = Boolean(rule.required);
  node.querySelector('.remove-rule').addEventListener('click', () => {
    const scenario = container.closest('.scenario');
    node.remove();

    if (scenario && !container.querySelector('.rule')) {
      scenario.remove();
      updateScenarioToggleButton();
    }
  });
  container.append(node);
}

async function saveSettings() {
  const scenarios = readScenariosFromForm();

  state.settings = {
    requestPath: els.requestPath.value.trim(),
    scenarios: scenarios.length ? scenarios : [DEFAULT_SCENARIO],
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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderList(container, records, emptyText) {
  container.classList.toggle('empty', records.length === 0);

  if (!records.length) {
    container.textContent = emptyText;
    return;
  }

  container.replaceChildren(
    ...records.map((record) => {
      const item = document.createElement('details');
      item.open = true;

      const allMatched = record.results.every((r) => r.matched);

      item.className = `item ${allMatched ? 'match' : 'mismatch'}`;

      item.innerHTML = `
        <summary class="item-summary">
          <span class="item-title">
            ${allMatched ? 'Совпало' : 'Есть несовпадения'}
          </span>
          <span>${escapeHtml(record.url)}</span>
          <span class="item-meta">
            ${new Date(record.at).toLocaleString()} · ${record.method || 'REQUEST'}
          </span>
        </summary>

        <div class="item-details">
          <div class="result-list">${formatResults(record.results)}</div>
          ${formatRequestDetails(record.request)}
        </div>
      `;

      return item;
    })
  );
}
function formatResults(results) {
  return results.map((result) => {
    const mode = result.mode === 'strict' ? 'строго' : result.mode === 'exists' ? 'должно быть' : 'не строго';
    const lines = [
      `ожидали: ${result.expected?.length ? result.expected.join(', ') : 'любое значение'}`,
      `получили: ${result.actual.length ? result.actual.join(', ') : 'путь не найден'}`,
      `путь: ${result.found ? 'найден' : 'не найден'}`,
      `результат: ${result.matched ? 'совпало' : 'не совпало'}`,
    ];
    if (result.extra.length) {
      lines.push(`доп. поля: ${result.extra.join(', ')}`);
    }

    return `
      <details class="result-block" open>
        <summary>
          <span>${escapeHtml(result.scenarioName || 'Сценарий')} → ${escapeHtml(result.keyPath)}</span>
          <span class="result-meta">${mode}${result.required ? ' | 100%' : ''}</span>
        </summary>
        <pre>${escapeHtml(lines.join('\n'))}</pre>
      </details>
    `;
  }).join('');
}

function formatRequestDetails(request) {
  if (request === undefined) return '';

  return `
    <details class="request-details">
      <summary>Весь запрос</summary>
      <pre class="request-payload">${escapeHtml(formatJson(request))}</pre>
    </details>
  `;
}

function formatJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function downloadScenarios() {
  const scenarios = readScenariosFromForm();
  const blob = new Blob([JSON.stringify({ scenarios }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `response-match-scenarios-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  setTransferStatus('Сценарии скачаны.');
}

async function uploadScenarios(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const data = JSON.parse(await file.text());
    const scenarios = normalizeScenarios(data);
    state.settings = { ...state.settings, scenarios };
    await chrome.storage.local.set({ settings: state.settings });
    renderSettings();
    setTransferStatus('Сценарии загружены. Нажмите «Сохранить», если измените их вручную.');
  } catch (error) {
    setTransferStatus(`Не удалось загрузить сценарии: ${error.message}`);
  } finally {
    event.target.value = '';
  }
}

function setTransferStatus(message) {
  els.transferStatus.textContent = message;
}

function readScenariosFromForm() {
  return [...els.scenarios.querySelectorAll('.scenario')].map((scenario, index) => ({
    name: scenario.querySelector('.scenario-name').value.trim() || `Сценарий ${index + 1}`,
    rules: [...scenario.querySelectorAll('.rule')].map((rule) => ({
      keyPath: rule.querySelector('.rule-path').value.trim(),
      mode: rule.querySelector('.rule-mode').value,
      expected: rule.querySelector('.rule-value').value.trim(),
      required: rule.querySelector('.rule-required-input').checked,
    })).filter((rule) => rule.keyPath && (rule.mode === 'exists' || rule.expected)),
  })).filter((scenario) => scenario.rules.length);
}

function normalizeSettings(settings) {
  return {
    ...DEFAULT_SETTINGS,
    ...(settings || {}),
    scenarios: normalizeScenarios(settings),
  };
}

function normalizeScenarios(settings) {
  if (Array.isArray(settings) && settings.length) return settings;
  if (Array.isArray(settings?.scenarios) && settings.scenarios.length) return settings.scenarios;
  if (settings?.rules?.length) return [{ name: 'Сценарий 1', rules: settings.rules }];
  return DEFAULT_SETTINGS.scenarios;
}