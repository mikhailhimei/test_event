const DEFAULT_RULE = { keyPath: '', mode: 'strict', expected: '', required: false };
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

const state = {
  settings: DEFAULT_SETTINGS,
  matches: [],
  history: [],
  editingScenarioIndex: null,
  scenariosCollapsed: true,
  commonElementsCollapsed: false,
};

const els = {
  requestPath: document.querySelector('#requestPath'),
  scenarios: document.querySelector('#scenarios'),
  scenarioTemplate: document.querySelector('#scenarioTemplate'),
  ruleTemplate: document.querySelector('#ruleTemplate'),
  variables: document.querySelector('#variables'),
  variableTemplate: document.querySelector('#variableTemplate'),
  addScenario: document.querySelector('#addScenario'),
  addVariable: document.querySelector('#addVariable'),
  downloadVariables: document.querySelector('#downloadVariables'),
  uploadVariables: document.querySelector('#uploadVariables'),
  variablesJson: document.querySelector('#variablesJson'),
  variablesStatus: document.querySelector('#variablesStatus'),
  addCommonElement: document.querySelector('#addCommonElement'),
  commonElements: document.querySelector('#commonElements'),
  downloadCommonElements: document.querySelector('#downloadCommonElements'),
  uploadCommonElements: document.querySelector('#uploadCommonElements'),
  commonElementsJson: document.querySelector('#commonElementsJson'),
  commonElementsStatus: document.querySelector('#commonElementsStatus'),
  toggleScenarios: document.querySelector('#toggleScenarios'),
  clearMatches: document.querySelector('#clearMatches'),
  clearHistory: document.querySelector('#clearHistory'),
  matches: document.querySelector('#matches'),
  history: document.querySelector('#history'),
  blockExternal: document.querySelector('#blockExternal'),
  downloadScenarios: document.querySelector('#downloadScenarios'),
  uploadScenarios: document.querySelector('#uploadScenarios'),
  scenariosJson: document.querySelector('#scenariosJson'),
  transferStatus: document.querySelector('#transferStatus'),
  openDocs: document.querySelector('#openDocs'),
  tabs: document.querySelectorAll('.tab'),
  panels: document.querySelectorAll('.tab-panel'),
  scenarioModal: document.querySelector('#scenarioModal'),
  scenarioModalTitle: document.querySelector('#scenarioModalTitle'),
  scenarioForm: document.querySelector('#scenarioForm'),
  modalScenarioName: document.querySelector('#modalScenarioName'),
  modalCommonElement: document.querySelector('#modalCommonElement'),
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
  renderVariables();
  renderCommonElements();
  bindUi();
  chrome.storage.onChanged.addListener(handleStorageChanges);
}

function bindUi() {
  els.addScenario.addEventListener('click', () => openScenarioModal(createScenarioDraft()));
  els.addVariable.addEventListener('click', () => addVariable(createVariableDraft()));
  els.downloadVariables.addEventListener('click', downloadVariables);
  els.uploadVariables.addEventListener('click', uploadVariables);
  els.addCommonElement.addEventListener('click', () => addCommonElement());
  els.downloadCommonElements.addEventListener('click', downloadCommonElements);
  els.uploadCommonElements.addEventListener('click', uploadCommonElements);
  els.openDocs.addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('documentation.html') }));
  // els.requestPath.addEventListener('change', saveSettings);
  els.blockExternal.addEventListener('change', saveSettings);
  els.downloadScenarios.addEventListener('click', downloadScenarios);
  els.uploadScenarios.addEventListener('click', uploadScenarios);
  els.toggleScenarios.addEventListener('click', handleToggleScenarios);
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
  document.querySelector('#burgerButton').addEventListener('click', () => {
    document.querySelector('.menu').classList.toggle('open');
    document.querySelector('#burgerButton').setAttribute('aria-expanded', document.querySelector('.menu').classList.contains('open'));
  });
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
  document.querySelector('.menu').classList.remove('open');
  document.querySelector('#burgerButton').setAttribute('aria-expanded', 'false');
  els.tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === name));
  els.panels.forEach((panel) => panel.classList.toggle('active', panel.id === `${name}Tab`));
}

function renderSettings() {
  els.requestPath.value = state.settings.requestPath;
  els.blockExternal.checked = Boolean(state.settings.blockExternal);
  renderScenarios();
  renderVariables();
  renderCommonElements();
}

function renderScenarios() {
  els.scenarios.replaceChildren();
  state.settings.scenarios.forEach((scenario, index) => {
    const node = els.scenarioTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector('.scenario-card-name').textContent = scenario.name || `Сценарий ${index + 1}`;
    node.querySelector('.scenario-card-meta').textContent = formatScenarioMeta(scenario);

    const enabledToggle = node.querySelector('.scenario-enabled');
    enabledToggle.checked = scenario.enabled !== false;
    enabledToggle.addEventListener('click', (event) => event.stopPropagation());
    enabledToggle.addEventListener('change', async (event) => {
      event.stopPropagation();
      await setScenarioEnabled(index, enabledToggle.checked);
    });

    node.addEventListener('click', () => openScenarioModal(scenario, index));
    node.classList.toggle('disabled', scenario.enabled === false);
    els.scenarios.append(node);
  });
  updateScenarioVisibility();
}

function renderVariables() {
  els.variables.classList.toggle('empty', state.settings.variables.length === 0);
  if (!state.settings.variables.length) {
    els.variables.textContent = 'Переменные пока не заданы.';
    return;
  }

  els.variables.replaceChildren(
    ...state.settings.variables.map((variable, index) => {
      const node = els.variableTemplate.content.firstElementChild.cloneNode(true);
      node.querySelector('.variable-name').value = variable.name || '';
      node.querySelector('.variable-expression').value = variable.expression || '';
      node.querySelector('.remove-variable').addEventListener('click', async () => {
        state.settings.variables.splice(index, 1);
        await saveSettings();
        renderVariables();
      });
      node.querySelector('.variable-name').addEventListener('change', async (event) => {
        state.settings.variables[index].name = event.target.value.trim();
        await saveSettings();
      });
      node.querySelector('.variable-expression').addEventListener('change', async (event) => {
        state.settings.variables[index].expression = event.target.value.trim();
        await saveSettings();
      });
      node.querySelector('.apply-variable').addEventListener('click', async () => {
        readVariablesFromUi();
        await saveSettings();
        renderVariables();
        setVariablesStatus(`Переменная «${state.settings.variables[index]?.name || 'без имени'}» применена.`);
      });
      return node;
    })
  );
}

function readVariablesFromUi() {
  state.settings.variables = [...els.variables.querySelectorAll('.variable-card')].map((node) => ({
    name: node.querySelector('.variable-name').value.trim(),
    expression: node.querySelector('.variable-expression').value.trim(),
  }));
}

function createVariableDraft() {
  return { name: '', expression: '' };
}

function renderCommonElements() {
  els.commonElements.classList.toggle('empty', state.settings.commonElements.length === 0);
  if (!state.settings.commonElements.length) {
    els.commonElements.textContent = 'Общие элементы пока не заданы.';
    return;
  }
  els.commonElements.replaceChildren(...state.settings.commonElements.map((element, index) => {
    const node = document.createElement('div');
    node.className = 'common-card';
    node.innerHTML = `<div class="variable-row"><label class="field"><span>Название</span><input class="common-name" value="${escapeHtml(element.name || '')}" placeholder="Общий элемент" /></label><div class="button-group"><button class="secondary save-common" type="button">Сохранить</button><button class="secondary danger-text remove-common" type="button">Удалить</button></div></div><div class="scenario-rules"></div><div class="actions"><button class="secondary add-common-rule" type="button">Добавить правило</button><span class="common-save-status hint" role="status"></span></div>`;
    const rules = node.querySelector('.scenario-rules');
    (element.rules?.length ? element.rules : [DEFAULT_RULE]).forEach((rule) => addRule(rules, rule));
    node.querySelector('.common-name').addEventListener('change', async (event) => { state.settings.commonElements[index].name = event.target.value.trim(); await saveCommonElement(index, node); });
    node.querySelector('.add-common-rule').addEventListener('click', () => addRule(rules, DEFAULT_RULE));
    node.querySelector('.save-common').addEventListener('click', async () => { await saveCommonElement(index, node); setCommonElementStatus(node, 'Общий элемент сохранен.'); });
    node.querySelector('.remove-common').addEventListener('click', async () => { state.settings.commonElements.splice(index, 1); await saveSettings(); renderCommonElements(); });
    node.addEventListener('change', async () => saveCommonElement(index, node));
    return node;
  }));
}

async function saveCommonElement(index, node) {
  state.settings.commonElements[index] = { id: state.settings.commonElements[index]?.id || crypto.randomUUID(), name: node.querySelector('.common-name').value.trim() || `Общий элемент ${index + 1}`, rules: readRulesFromContainer(node.querySelector('.scenario-rules')) };
  await saveSettings();
}

function setCommonElementStatus(node, message) {
  node.querySelector('.common-save-status').textContent = message;
}

function addCommonElement() {
  state.settings.commonElements = [...state.settings.commonElements, { id: crypto.randomUUID(), name: `Общий элемент ${state.settings.commonElements.length + 1}`, rules: [{ ...DEFAULT_RULE }] }];
  renderCommonElements();
  saveSettings();
}

function addVariable(variable) {
  state.settings.variables = [...state.settings.variables, variable];
  renderVariables();
  saveSettings();
}

function updateScenarioVisibility() {
  els.scenarios.querySelectorAll('.scenario-card').forEach((card) => {
    card.style.display = state.scenariosCollapsed ? 'none' : '';
  });
  els.toggleScenarios.textContent = state.scenariosCollapsed ? 'Показать все' : 'Скрыть все';
}

async function setScenarioEnabled(index, enabled) {
  state.settings.scenarios = state.settings.scenarios.map((scenario, scenarioIndex) => (
    scenarioIndex === index ? { ...scenario, enabled } : scenario
  ));
  await saveSettings();
  renderScenarios();
}


function openScenarioModal(scenario, index = null) {
  state.editingScenarioIndex = index;
  els.scenarioModalTitle.textContent = index === null ? 'Добавить сценарий' : 'Редактировать сценарий';
  els.modalScenarioName.value = scenario.name || `Сценарий ${state.settings.scenarios.length + 1}`;
  renderCommonElementOptions(scenario.commonElementId || '');
  els.modalScenarioRules.replaceChildren();
  (scenario.rules?.length ? scenario.rules : [DEFAULT_RULE]).forEach((rule) => addRule(els.modalScenarioRules, rule));
  els.modalDeleteScenario.hidden = index === null;
  els.scenarioModal.hidden = false;
  document.body.classList.add('modal-open');
  els.modalScenarioName.focus();
}

function closeScenarioModal() {
  els.scenarioModal.hidden = true;
  document.body.classList.remove('modal-open');
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
  if (!scenario.rules.length && !scenario.commonElementId) return;

  if (state.editingScenarioIndex === null) {
    state.settings.scenarios = [...state.settings.scenarios, { ...scenario, enabled: true }];
  } else {
    const existingEnabled = state.settings.scenarios[state.editingScenarioIndex]?.enabled;
    state.settings.scenarios = state.settings.scenarios.map((item, index) => (
      index === state.editingScenarioIndex ? { ...scenario, enabled: existingEnabled !== false } : item
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

function readRulesFromContainer(container) {
  return [...container.querySelectorAll('.rule')].map((rule) => ({
    keyPath: rule.querySelector('.rule-path').value.trim(),
    mode: rule.querySelector('.rule-mode').value,
    expected: rule.querySelector('.rule-value').value.trim(),
    required: rule.querySelector('.rule-required-input').checked,
  })).filter((rule) => rule.keyPath && (rule.expected || rule.mode === 'exists'));
}

function readScenarioFromModal() {
  const rules = readRulesFromContainer(els.modalScenarioRules);

  const fallbackName = state.editingScenarioIndex === null
    ? `Сценарий ${state.settings.scenarios.length + 1}`
    : `Сценарий ${state.editingScenarioIndex + 1}`;

  return {
    name: els.modalScenarioName.value.trim() || fallbackName,
    commonElementId: els.modalCommonElement.value,
    rules,
  };
}

async function saveSettings() {
  state.settings = {
    requestPath: els.requestPath.value.trim(),
    scenarios: state.settings.scenarios.length ? state.settings.scenarios : [DEFAULT_SCENARIO],
    variables: state.settings.variables || [],
    commonElements: state.settings.commonElements || [],
    blockExternal: els.blockExternal.checked,
  };

  await chrome.storage.local.set({ settings: state.settings });
}

function formatScenarioMeta(scenario) {
  const rulesCount = scenario.rules?.length || 0;
  const word = rulesCount === 1 ? 'правило' : rulesCount > 1 && rulesCount < 5 ? 'правила' : 'правил';
  const commonName = state.settings.commonElements.find((element) => element.id === scenario.commonElementId)?.name;
  return commonName ? `${rulesCount} ${word} + ${commonName}` : `${rulesCount} ${word}`;
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

      const allMatched = record.results.every((r) => r.matched);

        const scenarioNames = Array.from(new Set(record.results.map((r) => r.scenarioName).filter(Boolean)));
        const titleText = allMatched ? `Совпало — ${scenarioNames.join(', ') || 'Сценарий'}` : 'Есть несовпадения';

        item.className = `item ${allMatched ? 'match' : 'mismatch'}`;

        item.innerHTML = `
          <summary class="item-summary">
            <span class="item-title">
              ${escapeHtml(titleText)}
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
    const blocks = [
      { label: 'ожидали', value: result.expected?.length ? result.expected.join(', ') : 'любое значение' },
      { label: 'получили', value: result.actual.length ? result.actual.join(', ') : 'путь не найден' },
      { label: 'путь', value: result.found ? 'найден' : 'не найден' },
      { label: 'результат', value: result.matched ? 'совпало' : 'не совпало' },
    ];
    if (result.extra.length) {
      blocks.push({ label: 'доп. поля', value: result.extra.join(', ') });
    }

    return `
      <div class="result-block ${result.matched ? 'match' : 'mismatch'}">
        <div class="result-block-header">
          <span>${escapeHtml(result.scenarioName || 'Сценарий')} → ${escapeHtml(result.keyPath)}</span>
          <span class="result-meta">${mode}${result.required ? ' | 100%' : ''}</span>
        </div>
        <div class="result-block-body">
          ${blocks.map((block) => `
            <div class="result-block-row">
              <span class="result-block-label">${escapeHtml(block.label)}</span>
              <span class="result-block-value">${escapeHtml(block.value)}</span>
            </div>
          `).join('')}
        </div>
      </div>
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
  const scenarios = state.settings.scenarios || [];
  const blob = new Blob([JSON.stringify({ scenarios }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `response-match-scenarios-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  setTransferStatus('Сценарии скачаны.');
}

async function uploadScenarios() {
  try {
    const data = parseJsonFromTextarea(els.scenariosJson, 'JSON сценариев не заполнен.');
    const scenarios = normalizeScenarios(data);
    state.settings = { ...state.settings, scenarios };
    await chrome.storage.local.set({ settings: state.settings });
    renderSettings();
    setTransferStatus('Сценарии загружены из JSON.');
  } catch (error) {
    setTransferStatus(`Не удалось загрузить сценарии: ${error.message}`);
  }
}

function setTransferStatus(message) {
  els.transferStatus.textContent = message;
}

function parseJsonFromTextarea(textarea, emptyMessage) {
  const rawJson = textarea.value.trim();
  if (!rawJson) throw new Error(emptyMessage);
  return JSON.parse(rawJson);
}

function setVariablesStatus(message) {
  els.variablesStatus.textContent = message;
}

function downloadCommonElements() {
  const blob = new Blob([JSON.stringify({ commonElements: state.settings.commonElements || [] }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `response-match-common-elements-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  els.commonElementsStatus.textContent = 'Общие элементы скачаны.';
}

async function uploadCommonElements() {
  try {
    const data = parseJsonFromTextarea(els.commonElementsJson, 'JSON общих элементов не заполнен.');
    state.settings.commonElements = normalizeCommonElements(data);
    await saveSettings();
    renderCommonElements();
    els.commonElementsStatus.textContent = 'Общие элементы загружены из JSON.';
  } catch (error) {
    els.commonElementsStatus.textContent = `Не удалось загрузить общие элементы: ${error.message}`;
  }
}

function downloadVariables() {
  const blob = new Blob([JSON.stringify({ variables: state.settings.variables || [] }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `response-match-variables-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  setVariablesStatus('Переменные скачаны.');
}

async function uploadVariables() {
  try {
    const data = parseJsonFromTextarea(els.variablesJson, 'JSON переменных не заполнен.');
    state.settings.variables = normalizeVariables(data);
    await saveSettings();
    renderVariables();
    setVariablesStatus('Переменные загружены из JSON.');
  } catch (error) {
    setVariablesStatus(`Не удалось загрузить переменные: ${error.message}`);
  }
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
    variables: normalizeVariables(settings),
    commonElements: normalizeCommonElements(settings),
  };
}

function normalizeVariables(settings) {
  const sourceVariables = Array.isArray(settings) ? settings : settings?.variables;
  if (Array.isArray(sourceVariables)) {
    return sourceVariables.map((variable) => ({ name: variable.name || '', expression: variable.expression || '' }));
  }
  return [];
}

function normalizeCommonElements(settings) {
  const sourceCommonElements = Array.isArray(settings) ? settings : settings?.commonElements;
  if (Array.isArray(sourceCommonElements)) {
    return sourceCommonElements.map((element, index) => ({ id: element.id || `common-${Date.now()}-${index}`, name: element.name || `Общий элемент ${index + 1}`, rules: Array.isArray(element.rules) ? element.rules : [] }));
  }
  return [];
}

function renderCommonElementOptions(selectedId) {
  els.modalCommonElement.replaceChildren(new Option('Не использовать', ''), ...state.settings.commonElements.map((element) => new Option(element.name, element.id)));
  els.modalCommonElement.value = selectedId;
}

function normalizeScenarios(settings) {
  if (Array.isArray(settings) && settings.length) {
    return settings.map((scenario) => ({ enabled: true, ...scenario }));
  }
  if (Array.isArray(settings?.scenarios) && settings.scenarios.length) {
    return settings.scenarios.map((scenario) => ({ enabled: true, ...scenario }));
  }
  if (settings?.rules?.length) return [{ name: 'Сценарий 1', rules: settings.rules, enabled: true }];
  return DEFAULT_SETTINGS.scenarios.map((scenario) => ({ enabled: true, ...scenario }));
}

function handleToggleScenarios() {
  state.scenariosCollapsed = !state.scenariosCollapsed;
  els.toggleScenarios.textContent = state.scenariosCollapsed ? 'Показать все' : 'Скрыть все';
  updateScenarioVisibility();
}
