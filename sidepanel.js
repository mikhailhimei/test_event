const DEFAULT_RULE = { keyPath: '', mode: 'strict', expected: '' };
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

const state = {
  settings: DEFAULT_SETTINGS,
  matches: [],
  history: [],
  editingScenarioIndex: null,
  editingCommonElementIndex: null,
  scenariosCollapsed: true,
};

const els = {
  requestPath: document.querySelector('#requestPath'),
  saveRequestPath: document.querySelector('#saveRequestPath'),
  settingsStatus: document.querySelector('#settingsStatus'),
  scenarios: document.querySelector('#scenarios'),
  scenarioTemplate: document.querySelector('#scenarioTemplate'),
  ruleTemplate: document.querySelector('#ruleTemplate'),
  variables: document.querySelector('#variables'),
  variableTemplate: document.querySelector('#variableTemplate'),
  addScenario: document.querySelector('#addScenario'),
  deleteAllScenarios: document.querySelector('#deleteAllScenarios'),
  addVariable: document.querySelector('#addVariable'),
  deleteAllVariables: document.querySelector('#deleteAllVariables'),
  downloadVariables: document.querySelector('#downloadVariables'),
  uploadVariables: document.querySelector('#uploadVariables'),
  variablesJson: document.querySelector('#variablesJson'),
  variablesUploadStatus: document.querySelector('#variablesUploadStatus'),
  variablesStatus: document.querySelector('#variablesStatus'),
  addCommonElement: document.querySelector('#addCommonElement'),
  deleteAllCommonElements: document.querySelector('#deleteAllCommonElements'),
  commonElements: document.querySelector('#commonElements'),
  downloadCommonElements: document.querySelector('#downloadCommonElements'),
  uploadCommonElements: document.querySelector('#uploadCommonElements'),
  commonElementsJson: document.querySelector('#commonElementsJson'),
  commonElementsUploadStatus: document.querySelector('#commonElementsUploadStatus'),
  commonElementsStatus: document.querySelector('#commonElementsStatus'),
  toggleScenarios: document.querySelector('#toggleScenarios'),
  clearMatches: document.querySelector('#clearMatches'),
  matches: document.querySelector('#matches'),
  history: document.querySelector('#history'),
  blockExternal: document.querySelector('#blockExternal'),
  downloadScenarios: document.querySelector('#downloadScenarios'),
  uploadScenarios: document.querySelector('#uploadScenarios'),
  scenariosJson: document.querySelector('#scenariosJson'),
  scenariosUploadStatus: document.querySelector('#scenariosUploadStatus'),
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
  commonElementModal: document.querySelector('#commonElementModal'),
  commonElementModalTitle: document.querySelector('#commonElementModalTitle'),
  commonElementForm: document.querySelector('#commonElementForm'),
  modalCommonElementName: document.querySelector('#modalCommonElementName'),
  modalCommonElementRules: document.querySelector('#modalCommonElementRules'),
  modalAddCommonElementRule: document.querySelector('#modalAddCommonElementRule'),
  modalSaveCommonElement: document.querySelector('#modalSaveCommonElement'),
  modalDeleteCommonElement: document.querySelector('#modalDeleteCommonElement'),
  commonElementModalCancelButtons: document.querySelectorAll('[data-close-common-element-modal]'),
};

init();

async function init() {
  const data = await chrome.storage.local.get(['settings', 'matches', 'history']);
  state.settings = normalizeSettings(data.settings);
  state.matches = data.matches || [];
  state.history = data.history || [];

  renderSettings();
  renderMatches();
  renderVariables();
  renderCommonElements();
  bindUi();
  chrome.storage.onChanged.addListener(handleStorageChanges);
}

function bindUi() {
  els.addScenario.addEventListener('click', () => openScenarioModal(createScenarioDraft()));
  els.deleteAllScenarios.addEventListener('click', deleteAllScenarios);
  els.addVariable.addEventListener('click', () => addVariable(createVariableDraft()));
  els.deleteAllVariables.addEventListener('click', deleteAllVariables);
  els.downloadVariables.addEventListener('click', downloadVariables);
  els.uploadVariables.addEventListener('click', uploadVariables);
  els.addCommonElement.addEventListener('click', () => openCommonElementModal(createCommonElementDraft()));
  els.deleteAllCommonElements.addEventListener('click', deleteAllCommonElements);
  els.downloadCommonElements.addEventListener('click', downloadCommonElements);
  els.uploadCommonElements.addEventListener('click', uploadCommonElements);
  els.openDocs.addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('documentation.html') }));
  els.saveRequestPath.addEventListener('click', saveSettingsWithStatus);
  els.requestPath.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') saveSettingsWithStatus();
  });
  els.blockExternal.addEventListener('change', saveSettings);
  els.downloadScenarios.addEventListener('click', downloadScenarios);
  els.uploadScenarios.addEventListener('click', uploadScenarios);
  els.toggleScenarios.addEventListener('click', handleToggleScenarios);
  els.clearMatches.addEventListener('click', async () => {
    state.matches = [];
    await chrome.storage.local.set({ matches: [] });
    renderMatches();
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
  els.modalAddCommonElementRule.addEventListener('click', () => addRule(els.modalCommonElementRules, DEFAULT_RULE));
  els.commonElementForm.addEventListener('submit', handleCommonElementSubmit);
  els.modalDeleteCommonElement.addEventListener('click', handleCommonElementDelete);
  els.commonElementModalCancelButtons.forEach((button) => button.addEventListener('click', closeCommonElementModal));
  els.commonElementModal.addEventListener('click', (event) => {
    if (event.target === els.commonElementModal) closeCommonElementModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !els.scenarioModal.hidden) closeScenarioModal();
    if (event.key === 'Escape' && !els.commonElementModal.hidden) closeCommonElementModal();
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
  els.scenarios.classList.toggle('empty', state.settings.scenarios.length === 0);
  if (!state.settings.scenarios.length) {
    els.scenarios.textContent = 'Сценарии пока не заданы.';
    updateScenarioVisibility();
    return;
  }

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
      // node.querySelector('.variable-name').addEventListener('input', () => saveVariablesFromUi());
      // node.querySelector('.variable-expression').addEventListener('input', () => saveVariablesFromUi());
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

async function saveVariablesFromUi() {
  readVariablesFromUi();
  await saveSettings();
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
    const node = document.createElement('button');
    node.className = 'scenario-card common-card';
    node.type = 'button';
    node.innerHTML = `<span class="scenario-card-name">${escapeHtml(element.name || `Общий элемент ${index + 1}`)}</span><span class="scenario-card-meta">${formatRulesCount(element.rules?.length || 0)}</span>`;
    node.addEventListener('click', () => openCommonElementModal(element, index));
    return node;
  }));
}

function createCommonElementDraft() {
  return {
    id: crypto.randomUUID(),
    name: `Общий элемент ${state.settings.commonElements.length + 1}`,
    rules: [{ ...DEFAULT_RULE }],
  };
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

function openCommonElementModal(element, index = null) {
  state.editingCommonElementIndex = index;
  els.commonElementModalTitle.textContent = index === null ? 'Добавить общий элемент' : 'Редактировать общий элемент';
  els.modalCommonElementName.value = element.name || `Общий элемент ${state.settings.commonElements.length + 1}`;
  els.modalCommonElementRules.replaceChildren();
  (element.rules?.length ? element.rules : [DEFAULT_RULE]).forEach((rule) => addRule(els.modalCommonElementRules, rule));
  els.modalDeleteCommonElement.hidden = index === null;
  els.commonElementModal.hidden = false;
  document.body.classList.add('modal-open');
  els.modalCommonElementName.focus();
}

function closeCommonElementModal() {
  els.commonElementModal.hidden = true;
  document.body.classList.remove('modal-open');
  state.editingCommonElementIndex = null;
  els.commonElementForm.reset();
  els.modalCommonElementRules.replaceChildren();
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
  readVariablesFromUi();
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
  renderScenarios();
  closeScenarioModal();
  await saveSettings();
}

async function deleteAllScenarios() {
  state.settings.scenarios = [];
  renderScenarios();
  await saveSettings();
}

async function deleteAllVariables() {
  state.settings.variables = [];
  renderVariables();
  setVariablesStatus('Все переменные удалены.');
  await saveSettings();
}

async function deleteAllCommonElements() {
  state.settings.commonElements = [];
  state.settings.scenarios = state.settings.scenarios.map((scenario) => ({ ...scenario, commonElementId: '' }));
  renderCommonElements();
  renderScenarios();
  els.commonElementsStatus.textContent = 'Все общие элементы удалены.';
  await saveSettings();
}

async function handleCommonElementSubmit(event) {
  event.preventDefault();
  const commonElement = readCommonElementFromModal();
  if (!commonElement.rules.length) return;

  if (state.editingCommonElementIndex === null) {
    state.settings.commonElements = [...state.settings.commonElements, commonElement];
  } else {
    state.settings.commonElements = state.settings.commonElements.map((item, index) => (
      index === state.editingCommonElementIndex ? { ...commonElement, id: item.id || commonElement.id } : item
    ));
  }

  renderCommonElements();
  closeCommonElementModal();
  await saveSettings();
}

async function handleCommonElementDelete() {
  if (state.editingCommonElementIndex === null) return;
  const removedElementId = state.settings.commonElements[state.editingCommonElementIndex]?.id;
  state.settings.commonElements = state.settings.commonElements.filter((_, index) => index !== state.editingCommonElementIndex);
  state.settings.scenarios = state.settings.scenarios.map((scenario) => (
    scenario.commonElementId === removedElementId ? { ...scenario, commonElementId: '' } : scenario
  ));
  renderCommonElements();
  renderScenarios();
  closeCommonElementModal();
  await saveSettings();
}

function readRulesFromContainer(container) {
  return [...container.querySelectorAll('.rule')].map((rule) => ({
    keyPath: rule.querySelector('.rule-path').value.trim(),
    mode: rule.querySelector('.rule-mode').value,
    expected: rule.querySelector('.rule-value').value.trim(),
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

function readCommonElementFromModal() {
  const fallbackName = state.editingCommonElementIndex === null
    ? `Общий элемент ${state.settings.commonElements.length + 1}`
    : `Общий элемент ${state.editingCommonElementIndex + 1}`;

  return {
    id: state.editingCommonElementIndex === null
      ? crypto.randomUUID()
      : state.settings.commonElements[state.editingCommonElementIndex]?.id || crypto.randomUUID(),
    name: els.modalCommonElementName.value.trim() || fallbackName,
    rules: readRulesFromContainer(els.modalCommonElementRules),
  };
}

async function saveSettingsWithStatus() {
  await saveSettings();
  setSettingsStatus('Путь запроса сохранён.');
}

function setSettingsStatus(message) {
  els.settingsStatus.textContent = message;
}

async function saveSettings() {
  state.settings = {
    requestPath: els.requestPath.value.trim(),
    scenarios: state.settings.scenarios || [],
    variables: state.settings.variables || [],
    commonElements: state.settings.commonElements || [],
    blockExternal: els.blockExternal.checked,
  };

  await chrome.storage.local.set({ settings: state.settings });
}

function formatScenarioMeta(scenario) {
  const rulesCount = scenario.rules?.length || 0;
  const commonName = state.settings.commonElements.find((element) => element.id === scenario.commonElementId)?.name;
  return commonName ? `${formatRulesCount(rulesCount)} + ${commonName}` : formatRulesCount(rulesCount);
}

function formatRulesCount(rulesCount) {
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
  const newMatches = changes.matches.newValue || [];

  // Если список еще не построен или был очищен
  if (
    !els.matches.querySelector(".item") ||
    newMatches.length < state.matches.length
  ) {
    state.matches = newMatches;
    renderMatches();
    return;
  }

  appendNewMatches(newMatches);
  state.matches = newMatches;
}

  if (changes.history) {
  const newHistory = changes.history.newValue || [];

  if (!els.history.querySelector(".item") ||
      newHistory.length < state.history.length) {
    state.history = newHistory;
    renderHistory();
    return;
  }

  appendNewHistory(newHistory);
  state.history = newHistory;
}
}

function renderMatches() {
  renderList(els.matches, state.matches, 'Совпадений пока нет.');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function appendNewHistory(newHistory) {
  const existingKeys = new Set(
    [...els.history.querySelectorAll(".item")]
      .map(el => el.dataset.key)
  );

  const key = (record) => `${record.at}|${record.url}|${record.method}`;

  const added = newHistory.filter(record => !existingKeys.has(key(record)));

  if (!added.length) {
    return;
  }

  if (els.history.classList.contains("empty")) {
    els.history.classList.remove("empty");
    els.history.replaceChildren();
  }

  for (let i = added.length - 1; i >= 0; i--) {
    const item = createMatchItem(added[i]);
    item.dataset.key = key(added[i]);
    els.history.prepend(item);
  }

  while (els.history.children.length > newHistory.length) {
    els.history.lastElementChild.remove();
  }
}

function createMatchItem(record) {
  const item = document.createElement('details');

  const results = Array.isArray(record.results) ? record.results : [];

  const allMatched = results.every(r => r.matched);

  const scenarioNames = Array.from(
    new Set(results.map(r => r.scenarioName).filter(Boolean))
  );

  let titleText = allMatched
    ? `Совпало`
    : 'Есть несовпадения';

  titleText = `${titleText} — ${scenarioNames.join(', ') || 'Сценарий'}`

  item.className = `item ${allMatched ? 'match' : 'mismatch'}`;
  item.dataset.key = `${record.at}|${record.url}|${record.method}`;

  item.innerHTML = `
    <summary class="item-summary">
      <span class="item-title">${escapeHtml(titleText)}</span>
      <span>${escapeHtml(record.url)}</span>
      <span class="item-meta">
        ${new Date(record.at).toLocaleString()} · ${record.method || 'REQUEST'}
      </span>
    </summary>

    <div class="item-details">
      <div class="result-list">
        ${results.length ? formatResults(results) : ""}
      </div>
      ${formatRequestDetails(record.request)}
    </div>
  `;

  return item;
}

function appendNewMatches(newMatches) {
  const getKey = (record) =>
    `${record.at}|${record.url}|${record.method}`;

  const existingKeys = new Set(
    [...els.matches.querySelectorAll(".item")]
      .map(el => el.dataset.key)
  );

  const added = newMatches.filter(
    record => !existingKeys.has(getKey(record))
  );

  if (!added.length) {
    return;
  }

  if (els.matches.classList.contains("empty")) {
    els.matches.classList.remove("empty");
    els.matches.replaceChildren();
  }

  for (let i = added.length - 1; i >= 0; i--) {
    const item = createMatchItem(added[i]);
    item.dataset.key = getKey(added[i]);
    els.matches.prepend(item);
  }

  while (els.matches.children.length > newMatches.length) {
    els.matches.lastElementChild.remove();
  }
}

function renderList(container, records, emptyText) {
  container.classList.toggle('empty', records.length === 0);

  if (!records.length) {
    container.textContent = emptyText;
    return;
  }

  container.replaceChildren(
    ...records.map(createMatchItem)
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

    return `
      <div class="result-block ${result.matched ? 'match' : 'mismatch'}">
        <div class="result-block-header">
          <span>${escapeHtml(result.scenarioName || 'Сценарий')} → ${escapeHtml(result.keyPath)}</span>
          <span class="result-meta">${mode}</span>
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
    setUploadStatus(els.scenariosUploadStatus, 'Сценарии загружены из JSON.');
  } catch (error) {
    setUploadStatus(els.scenariosUploadStatus, `Не удалось загрузить сценарии: ${error.message}`);
  }
}

function setTransferStatus(message) {
  els.transferStatus.textContent = message;
}

function setUploadStatus(element, message) {
  element.textContent = message;
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
    setUploadStatus(els.commonElementsUploadStatus, 'Общие элементы загружены из JSON.');
  } catch (error) {
    setUploadStatus(els.commonElementsUploadStatus, `Не удалось загрузить общие элементы: ${error.message}`);
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
    setUploadStatus(els.variablesUploadStatus, 'Переменные загружены из JSON.');
  } catch (error) {
    setUploadStatus(els.variablesUploadStatus, `Не удалось загрузить переменные: ${error.message}`);
  }
}

function readScenariosFromForm() {
  return [...els.scenarios.querySelectorAll('.scenario')].map((scenario, index) => ({
    name: scenario.querySelector('.scenario-name').value.trim() || `Сценарий ${index + 1}`,
    rules: [...scenario.querySelectorAll('.rule')].map((rule) => ({
      keyPath: rule.querySelector('.rule-path').value.trim(),
      mode: rule.querySelector('.rule-mode').value,
      expected: rule.querySelector('.rule-value').value.trim(),
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
  if (Array.isArray(settings?.scenarios)) {
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
