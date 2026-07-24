const DEFAULT_RULE = { keyPath: '', mode: 'strict', expected: '', required: false };
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
  editingScenarioIndex: null,
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
  scenarioModal: document.querySelector('#scenarioModal'),
  scenarioModalTitle: document.querySelector('#scenarioModalTitle'),
  scenarioForm: document.querySelector('#scenarioForm'),
  modalScenarioName: document.querySelector('#modalScenarioName'),
  modalScenarioRules: document.querySelector('#modalScenarioRules'),
  modalAddRule: document.querySelector('#modalAddRule'),
  modalSaveScenario: document.querySelector('#modalSaveScenario'),
  modalDeleteScenario: document.querySelector('#modalDeleteScenario'),
  modalCancelButtons: document.querySelectorAll('[data-close-scenario-modal]'),
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
  els.addScenario.addEventListener('click', () => openScenarioModal(createScenarioDraft()));
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
  els.modalAddRule.addEventListener('click', () => addRule(els.modalScenarioRules, DEFAULT_RULE));
  els.scenarioForm.addEventListener('submit', handleScenarioSubmit);
  els.modalDeleteScenario.addEventListener('click', handleScenarioDelete);
  els.modalCancelButtons.forEach((button) => button.addEventListener('click', closeScenarioModal));
  els.scenarioModal.addEventListener('click', (event) => {
    if (event.target === els.scenarioModal) closeScenarioModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !els.scenarioModal.hidden) closeScenarioModal();
  });
}

function activateTab(name) {
  els.tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === name));
  els.panels.forEach((panel) => panel.classList.toggle('active', panel.id === `${name}Tab`));
}

function renderSettings() {
  els.requestPath.value = state.settings.requestPath;
  els.blockExternal.checked = Boolean(state.settings.blockExternal);
  renderScenarios();
}

function renderScenarios() {
  els.scenarios.replaceChildren();
  state.settings.scenarios.forEach((scenario, index) => {
    const node = els.scenarioTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector('.scenario-card-name').textContent = scenario.name || `Сценарий ${index + 1}`;
    node.querySelector('.scenario-card-meta').textContent = formatScenarioMeta(scenario);
    node.addEventListener('click', () => openScenarioModal(scenario, index));
    els.scenarios.append(node);
  });
}

function openScenarioModal(scenario, index = null) {
  state.editingScenarioIndex = index;
  els.scenarioModalTitle.textContent = index === null ? 'Добавить сценарий' : 'Редактировать сценарий';
  els.modalScenarioName.value = scenario.name || `Сценарий ${state.settings.scenarios.length + 1}`;
  els.modalScenarioRules.replaceChildren();
  (scenario.rules?.length ? scenario.rules : [DEFAULT_RULE]).forEach((rule) => addRule(els.modalScenarioRules, rule));
  els.modalDeleteScenario.hidden = index === null;
  els.scenarioModal.hidden = false;
  els.modalScenarioName.focus();
}

function closeScenarioModal() {
  els.scenarioModal.hidden = true;
  state.editingScenarioIndex = null;
  els.scenarioForm.reset();
  els.modalScenarioRules.replaceChildren();
}

function createScenarioDraft() {
  return {
    name: `Сценарий ${state.settings.scenarios.length + 1}`,
    rules: [{ ...DEFAULT_RULE }],
  };
}


function addRule(container, rule) {
  const node = els.ruleTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector('.rule-path').value = rule.keyPath || '';
  node.querySelector('.rule-mode').value = rule.mode || 'strict';
  node.querySelector('.rule-value').value = rule.expected || '';
  node.querySelector('.rule-required-input').checked = Boolean(rule.required);
  node.querySelector('.remove-rule').addEventListener('click', () => {
    node.remove();

    if (!container.querySelector('.rule')) {
      addRule(container, DEFAULT_RULE);
    }
  });
  container.append(node);
}

async function handleScenarioSubmit(event) {
  event.preventDefault();
  const scenario = readScenarioFromModal();
  if (!scenario.rules.length) return;

  if (state.editingScenarioIndex === null) {
    state.settings.scenarios = [...state.settings.scenarios, scenario];
  } else {
    state.settings.scenarios = state.settings.scenarios.map((item, index) => (
      index === state.editingScenarioIndex ? scenario : item
    ));
  }

  renderScenarios();
  closeScenarioModal();
  await saveSettings();
}

async function handleScenarioDelete() {
  if (state.editingScenarioIndex === null) return;
  state.settings.scenarios = state.settings.scenarios.filter((_, index) => index !== state.editingScenarioIndex);
  if (!state.settings.scenarios.length) state.settings.scenarios = [DEFAULT_SCENARIO];
  renderScenarios();
  closeScenarioModal();
  await saveSettings();
}

function readScenarioFromModal() {
  const rules = [...els.modalScenarioRules.querySelectorAll('.rule')].map((rule) => ({
    keyPath: rule.querySelector('.rule-path').value.trim(),
    mode: rule.querySelector('.rule-mode').value,
    expected: rule.querySelector('.rule-value').value.trim(),
    required: rule.querySelector('.rule-required-input').checked,
  })).filter((rule) => rule.keyPath && (rule.expected || rule.mode === 'exists'));

  const fallbackName = state.editingScenarioIndex === null
    ? `Сценарий ${state.settings.scenarios.length + 1}`
    : `Сценарий ${state.editingScenarioIndex + 1}`;

  return {
    name: els.modalScenarioName.value.trim() || fallbackName,
    rules,
  };
}

async function saveSettings() {
  state.settings = {
    requestPath: els.requestPath.value.trim(),
    scenarios: state.settings.scenarios.length ? state.settings.scenarios : [DEFAULT_SCENARIO],
    blockExternal: els.blockExternal.checked,
  };

  await chrome.storage.local.set({ settings: state.settings });
}

function formatScenarioMeta(scenario) {
  const rulesCount = scenario.rules?.length || 0;
  const word = rulesCount === 1 ? 'правило' : rulesCount > 1 && rulesCount < 5 ? 'правила' : 'правил';
  return `${rulesCount} ${word}`;
}

function handleStorageChanges(changes, areaName) {
  if (areaName !== 'local') return;

  if (changes.settings) {
    state.settings = normalizeSettings(changes.settings.newValue);
    renderSettings();
  }

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
