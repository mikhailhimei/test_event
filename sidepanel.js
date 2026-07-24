const { useEffect, useMemo, useState } = React;
const h = React.createElement;

const DEFAULT_RULE = { keyPath: '', mode: 'strict', expected: '', required: false };
const DEFAULT_SCENARIO = {
  name: 'Сценарий 1',
  enabled: true,
  rules: [{ keyPath: 'extra_data.visual_object.id', mode: 'strict', expected: 'auth_click', required: true }],
};
const DEFAULT_SETTINGS = {
  requestPath: '',
  scenarios: [DEFAULT_SCENARIO],
  variables: [],
  blockExternal: false,
};

const clone = (value) => JSON.parse(JSON.stringify(value));

function App() {
  const [settings, setSettings] = useState(clone(DEFAULT_SETTINGS));
  const [matches, setMatches] = useState([]);
  const [history, setHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('search');
  const [collapsed, setCollapsed] = useState(true);
  const [editingIndex, setEditingIndex] = useState(null);
  const [draft, setDraft] = useState(null);
  const [transferStatus, setTransferStatus] = useState('');

  useEffect(() => {
    let mounted = true;
    chrome.storage.local.get(['settings', 'matches', 'history']).then((data) => {
      if (!mounted) return;
      setSettings(normalizeSettings(data.settings));
      setMatches(data.matches || []);
      setHistory(data.history || []);
    });

    const listener = (changes, areaName) => {
      if (areaName !== 'local') return;
      if (changes.settings) setSettings(normalizeSettings(changes.settings.newValue));
      if (changes.matches) setMatches(changes.matches.newValue || []);
      if (changes.history) setHistory(changes.history.newValue || []);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      mounted = false;
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);

  useEffect(() => {
    const docsButton = document.querySelector('#openDocs');
    const openDocs = () => chrome.tabs.create({ url: chrome.runtime.getURL('documentation.html') });
    docsButton?.addEventListener('click', openDocs);
    return () => docsButton?.removeEventListener('click', openDocs);
  }, []);

  const saveSettings = async (nextSettings) => {
    const normalized = normalizeSettings(nextSettings);
    setSettings(normalized);
    await chrome.storage.local.set({ settings: normalized });
  };

  const updateSettings = (patch) => saveSettings({ ...settings, ...patch });
  const openScenarioModal = (scenario, index = null) => {
    setEditingIndex(index);
    setDraft(clone(scenario));
  };
  const closeScenarioModal = () => {
    setEditingIndex(null);
    setDraft(null);
  };

  return h(React.Fragment, null,
    h('header', { className: 'header' },
      h('div', null,
        h('h1', null, 'Response Match'),
        h('p', null, 'Отлавливайте отправляемые JSON-запросы и сравнивайте значения по путям.')
      ),
      h(BurgerMenu, { activeTab, onSelect: setActiveTab })
    ),
    h('main', null,
      activeTab === 'search' && h(SearchTab, {
        settings, matches, collapsed,
        setCollapsed,
        saveSettings,
        updateSettings,
        openScenarioModal,
        setMatches,
      }),
      activeTab === 'history' && h(HistoryTab, { history, setHistory }),
      activeTab === 'variables' && h(VariablesTab, { settings, saveSettings, setTransferStatus }),
      activeTab === 'scenariosTransfer' && h(TransferTab, { settings, saveSettings, transferStatus, setTransferStatus })
    ),
    draft && h(ScenarioModal, {
      draft,
      setDraft,
      editingIndex,
      settings,
      saveSettings,
      closeScenarioModal,
    })
  );
}

function BurgerMenu({ activeTab, onSelect }) {
  const [open, setOpen] = useState(false);
  const tabs = [
    ['search', 'Поиск'],
    ['history', 'История'],
    ['variables', 'Переменные'],
    ['scenariosTransfer', 'Сценарии'],
  ];
  return h('nav', { className: 'burger', 'aria-label': 'Меню вкладок' },
    h('button', { className: 'burger-button', type: 'button', onClick: () => setOpen(!open), 'aria-expanded': open }, '☰'),
    open && h('div', { className: 'burger-menu' }, tabs.map(([id, label]) =>
      h('button', {
        key: id,
        className: `tab ${activeTab === id ? 'active' : ''}`,
        type: 'button',
        onClick: () => { onSelect(id); setOpen(false); },
      }, label)
    ))
  );
}

function SearchTab({ settings, matches, collapsed, setCollapsed, saveSettings, updateSettings, openScenarioModal, setMatches }) {
  return h('section', { className: 'tab-panel active' },
    h('div', { className: 'card' },
      h('label', { className: 'field' }, h('span', null, 'Путь запроса'),
        h('input', { value: settings.requestPath, onChange: (e) => updateSettings({ requestPath: e.target.value.trim() }), placeholder: '/api/events или часть URL' })),
      h('p', { className: 'hint' }, 'Расширение проверяет тело отправляемых запросов, URL которых содержит этот путь.')
    ),
    h('label', { className: 'toggle card' },
      h('input', { type: 'checkbox', checked: Boolean(settings.blockExternal), onChange: (e) => updateSettings({ blockExternal: e.target.checked }) }),
      h('span', null, 'Блокировать переход на сторонние ресурсы')
    ),
    h('div', { className: 'card' },
      h('div', { className: 'card-title-row' }, h('h2', null, 'Сценарии'), h('div', { className: 'button-group' },
        h('button', { className: 'secondary', type: 'button', onClick: () => setCollapsed(!collapsed) }, collapsed ? 'Показать все' : 'Скрыть все'),
        h('button', { className: 'secondary', type: 'button', onClick: () => openScenarioModal(createScenarioDraft(settings)) }, 'Добавить сценарий'))),
      h('div', { className: 'scenarios' }, !collapsed && settings.scenarios.map((scenario, index) =>
        h('div', { key: index, className: `scenario-card ${scenario.enabled === false ? 'disabled' : ''}`, role: 'button', tabIndex: 0, onClick: () => openScenarioModal(scenario, index) },
          h('span', { className: 'scenario-card-toggle' },
            h('input', { className: 'scenario-enabled', type: 'checkbox', checked: scenario.enabled !== false, onClick: (e) => e.stopPropagation(), onChange: (e) => {
              const scenarios = settings.scenarios.map((item, i) => i === index ? { ...item, enabled: e.target.checked } : item);
              saveSettings({ ...settings, scenarios });
            }}),
            h('span', { className: 'scenario-card-name' }, scenario.name || `Сценарий ${index + 1}`)),
          h('span', { className: 'scenario-card-meta' }, formatScenarioMeta(scenario))
        )))
    ),
    h('section', { className: 'card' },
      h('div', { className: 'actions' }, h('h2', null, 'Найденные совпадения'), h('button', { className: 'secondary', type: 'button', onClick: async () => { setMatches([]); await chrome.storage.local.set({ matches: [] }); } }, 'Очистить поиск')),
      h(RecordList, { records: matches, emptyText: 'Совпадений пока нет.' })
    )
  );
}

function HistoryTab({ history, setHistory }) {
  return h('section', { className: 'tab-panel active' },
    h('div', { className: 'actions top-actions' }, h('button', { className: 'danger', type: 'button', onClick: async () => { setHistory([]); await chrome.storage.local.set({ history: [] }); } }, 'Удалить историю')),
    h('section', { className: 'card' }, h('h2', null, 'История совпадений'), h(RecordList, { records: history, emptyText: 'История пуста.' }))
  );
}

function VariablesTab({ settings, saveSettings, setTransferStatus }) {
  const [selectedVariable, setSelectedVariable] = useState('');
  const applyVariable = () => {
    const variable = settings.variables.find((item) => item.name === selectedVariable) || settings.variables.find((item) => item.name);
    if (!variable?.name) return;
    const scenarios = settings.scenarios.map((scenario, scenarioIndex) => scenarioIndex === 0 ? {
      ...scenario,
      rules: (scenario.rules || []).map((rule, ruleIndex) => ruleIndex === 0 ? { ...rule, expected: `<<${variable.name}>>` } : rule),
    } : scenario);
    saveSettings({ ...settings, scenarios });
    setTransferStatus(`Переменная <<${variable.name}>> применена к первому правилу первого сценария.`);
  };
  return h('section', { className: 'tab-panel active' }, h('div', { className: 'card' },
    h('div', { className: 'card-title-row' }, h('h2', null, 'Переменные'), h('button', { className: 'secondary', type: 'button', onClick: () => saveSettings({ ...settings, variables: [...settings.variables, { name: '', expression: '' }] }) }, 'Добавить переменную')),
    h('p', { className: 'hint' }, 'Используйте строгую проверку == или мягкую проверку ~= / contains: ', h('code', null, '<<path>> == \'/\' : <<cookie(name)>> || : 1')),
    h('div', { className: 'actions variable-actions' },
      h('select', { value: selectedVariable, onChange: (e) => setSelectedVariable(e.target.value) }, h('option', { value: '' }, 'Выберите переменную'), settings.variables.map((v, i) => h('option', { key: i, value: v.name }, v.name || `Переменная ${i + 1}`))),
      h('button', { type: 'button', onClick: applyVariable, disabled: !settings.variables.length }, 'Применить переменную')
    ),
    h('div', { className: `variables ${settings.variables.length ? '' : 'empty'}` }, settings.variables.length ? settings.variables.map((variable, index) =>
      h('div', { className: 'variable-card', key: index },
        h('div', { className: 'variable-row' },
          h('label', { className: 'field' }, h('span', null, 'Имя переменной'), h('input', { value: variable.name || '', placeholder: 'test', onChange: (e) => updateVariable(settings, saveSettings, index, { name: e.target.value.trim() }) })),
          h('button', { className: 'secondary danger-text remove-variable', type: 'button', onClick: () => saveSettings({ ...settings, variables: settings.variables.filter((_, i) => i !== index) }) }, 'Удалить')),
        h('label', { className: 'field' }, h('span', null, 'Выражение'), h('input', { value: variable.expression || '', placeholder: "<<path>> == '/' : <<cookie(name)>> || : 1", onChange: (e) => updateVariable(settings, saveSettings, index, { expression: e.target.value.trim() }) }))
      )) : 'Переменные пока не заданы.')
  ));
}

function updateVariable(settings, saveSettings, index, patch) {
  const variables = settings.variables.map((variable, i) => i === index ? { ...variable, ...patch } : variable);
  saveSettings({ ...settings, variables });
}

function TransferTab({ settings, saveSettings, transferStatus, setTransferStatus }) {
  return h('section', { className: 'tab-panel active' }, h('section', { className: 'card' },
    h('h2', null, 'Скачать и загрузить сценарии и переменные'),
    h('p', { className: 'hint' }, 'Экспортируйте сценарии/переменные в JSON-файл или загрузите ранее сохраненный файл.'),
    h('div', { className: 'actions transfer-actions' },
      h('button', { type: 'button', onClick: () => downloadJson('scenarios', { scenarios: settings.scenarios }, setTransferStatus) }, 'Скачать сценарии'),
      h(UploadButton, { label: 'Загрузить сценарии', onLoad: async (data) => { await saveSettings({ ...settings, scenarios: normalizeScenarios(data) }); setTransferStatus('Сценарии загружены.'); } }),
      h('button', { type: 'button', onClick: () => downloadJson('variables', { variables: settings.variables }, setTransferStatus) }, 'Скачать переменные'),
      h(UploadButton, { label: 'Загрузить переменные', onLoad: async (data) => { await saveSettings({ ...settings, variables: normalizeVariables(data) }); setTransferStatus('Переменные загружены.'); } })
    ),
    h('p', { className: 'hint', role: 'status' }, transferStatus)
  ));
}

function UploadButton({ label, onLoad }) {
  return h('label', { className: 'secondary upload-button' },
    h('input', { type: 'file', accept: 'application/json,.json', onChange: async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try { await onLoad(JSON.parse(await file.text())); } catch (error) { alert(`Не удалось загрузить файл: ${error.message}`); }
      event.target.value = '';
    }}), h('span', null, label));
}

function ScenarioModal({ draft, setDraft, editingIndex, settings, saveSettings, closeScenarioModal }) {
  const save = async (event) => {
    event.preventDefault();
    const scenario = { ...draft, name: draft.name?.trim() || `Сценарий ${(editingIndex ?? settings.scenarios.length) + 1}`, rules: (draft.rules || []).filter((rule) => rule.keyPath && (rule.expected || rule.mode === 'exists')) };
    if (!scenario.rules.length) return;
    const scenarios = editingIndex === null ? [...settings.scenarios, { ...scenario, enabled: true }] : settings.scenarios.map((item, i) => i === editingIndex ? { ...scenario, enabled: item.enabled !== false } : item);
    await saveSettings({ ...settings, scenarios });
    closeScenarioModal();
  };
  const updateRule = (index, patch) => setDraft({ ...draft, rules: draft.rules.map((rule, i) => i === index ? { ...rule, ...patch } : rule) });
  return h('div', { className: 'modal-backdrop', onClick: (e) => { if (e.currentTarget === e.target) closeScenarioModal(); } }, h('div', { className: 'modal' }, h('form', { onSubmit: save },
    h('div', { className: 'modal-header' }, h('h2', null, editingIndex === null ? 'Добавить сценарий' : 'Редактировать сценарий'), h('button', { className: 'icon modal-close', type: 'button', onClick: closeScenarioModal }, '×')),
    h('label', { className: 'field' }, h('span', null, 'Название сценария'), h('input', { value: draft.name || '', onChange: (e) => setDraft({ ...draft, name: e.target.value }) })),
    h('div', { className: 'modal-rules-header' }, h('h3', null, 'Правила'), h('button', { className: 'secondary', type: 'button', onClick: () => setDraft({ ...draft, rules: [...(draft.rules || []), { ...DEFAULT_RULE }] }) }, 'Добавить правило')),
    h('div', { className: 'scenario-rules modal-rules' }, (draft.rules || [DEFAULT_RULE]).map((rule, index) => h('div', { className: 'rule', key: index },
      h('label', { className: 'field compact' }, h('span', null, 'Путь ключа'), h('input', { value: rule.keyPath || '', onChange: (e) => updateRule(index, { keyPath: e.target.value.trim() }), placeholder: 'extra_data.visual_object.id' })),
      h('label', { className: 'field compact' }, h('span', null, 'Сравнение'), h('select', { value: rule.mode || 'strict', onChange: (e) => updateRule(index, { mode: e.target.value }) }, h('option', { value: 'strict' }, 'Строгое'), h('option', { value: 'loose' }, 'Не строгое'))),
      h('label', { className: 'field compact' }, h('span', null, 'Значение'), h('input', { value: rule.expected || '', onChange: (e) => updateRule(index, { expected: e.target.value.trim() }), placeholder: 'auth_click, a|b,c или <<cookie(name)>> / <<url>> / <<path>>' })),
      h('div', { className: 'rule-footer' }, h('label', { className: 'rule-required' }, h('input', { type: 'checkbox', checked: Boolean(rule.required), onChange: (e) => updateRule(index, { required: e.target.checked }) }), h('span', null, '100% обязательно')), h('button', { className: 'secondary danger-text remove-rule', type: 'button', onClick: () => setDraft({ ...draft, rules: draft.rules.filter((_, i) => i !== index) }) }, 'Удалить правило'))
    ))),
    h('div', { className: 'modal-actions' }, editingIndex !== null && h('button', { className: 'danger', type: 'button', onClick: async () => { const scenarios = settings.scenarios.filter((_, i) => i !== editingIndex); await saveSettings({ ...settings, scenarios: scenarios.length ? scenarios : [DEFAULT_SCENARIO] }); closeScenarioModal(); } }, 'Удалить'), h('span', { className: 'modal-actions-spacer' }), h('button', { className: 'secondary', type: 'button', onClick: closeScenarioModal }, 'Отмена'), h('button', { type: 'submit' }, 'Сохранить сценарий'))
  )));
}

function RecordList({ records, emptyText }) {
  if (!records.length) return h('div', { className: 'list empty' }, emptyText);
  return h('div', { className: 'list' }, records.map((record) => h('details', { key: record.id, className: `item ${record.results.every((r) => r.matched) ? 'match' : 'mismatch'}` },
    h('summary', { className: 'item-summary' }, h('span', { className: 'item-title' }, record.results.every((r) => r.matched) ? `Совпало — ${[...new Set(record.results.map((r) => r.scenarioName).filter(Boolean))].join(', ') || 'Сценарий'}` : 'Есть несовпадения'), h('span', null, record.url), h('span', { className: 'item-meta' }, `${new Date(record.at).toLocaleString()} · ${record.method || 'REQUEST'}`)),
    h('div', { className: 'item-details' }, h('div', { className: 'result-list' }, record.results.map((result, i) => h(ResultBlock, { key: i, result }))), record.request !== undefined && h('details', { className: 'request-details' }, h('summary', null, 'Весь запрос'), h('pre', { className: 'request-payload' }, JSON.stringify(record.request, null, 2))))
  )));
}

function ResultBlock({ result }) {
  const mode = result.mode === 'strict' ? 'строго' : result.mode === 'exists' ? 'должно быть' : 'не строго';
  const rows = [['ожидали', result.expected?.length ? result.expected.join(', ') : 'любое значение'], ['получили', result.actual.length ? result.actual.join(', ') : 'путь не найден'], ['путь', result.found ? 'найден' : 'не найден'], ['результат', result.matched ? 'совпало' : 'не совпало']];
  if (result.extra?.length) rows.push(['доп. поля', result.extra.join(', ')]);
  return h('div', { className: `result-block ${result.matched ? 'match' : 'mismatch'}` }, h('div', { className: 'result-block-header' }, h('span', null, `${result.scenarioName || 'Сценарий'} → ${result.keyPath}`), h('span', { className: 'result-meta' }, `${mode}${result.required ? ' | 100%' : ''}`)), h('div', { className: 'result-block-body' }, rows.map(([label, value]) => h('div', { className: 'result-block-row', key: label }, h('span', { className: 'result-block-label' }, label), h('span', { className: 'result-block-value' }, value)))));
}

function createScenarioDraft(settings) { return { name: `Сценарий ${settings.scenarios.length + 1}`, enabled: true, rules: [{ ...DEFAULT_RULE }] }; }
function formatScenarioMeta(scenario) { const count = scenario.rules?.length || 0; return `${count} ${count === 1 ? 'правило' : count > 1 && count < 5 ? 'правила' : 'правил'}`; }
function normalizeSettings(settings) { return { ...DEFAULT_SETTINGS, ...(settings || {}), scenarios: normalizeScenarios(settings), variables: normalizeVariables(settings) }; }
function normalizeVariables(settings) { return Array.isArray(settings?.variables) ? settings.variables.map((v) => ({ name: v.name || '', expression: v.expression || '' })) : []; }
function normalizeScenarios(settings) { if (Array.isArray(settings) && settings.length) return settings.map((s) => ({ enabled: true, ...s })); if (Array.isArray(settings?.scenarios) && settings.scenarios.length) return settings.scenarios.map((s) => ({ enabled: true, ...s })); if (settings?.rules?.length) return [{ name: 'Сценарий 1', rules: settings.rules, enabled: true }]; return clone(DEFAULT_SETTINGS.scenarios); }
function downloadJson(kind, payload, setTransferStatus) { const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `response-match-${kind}-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url); setTransferStatus(kind === 'variables' ? 'Переменные скачаны.' : 'Сценарии скачаны.'); }

ReactDOM.createRoot(document.querySelector('#root')).render(h(App));
