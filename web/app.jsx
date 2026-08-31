const { useCallback, useEffect, useState } = React;

const emptySettings = { requestPath: '', scenarios: [], commonElements: [] };
const ruleTemplate = { keyPath: '', mode: 'strict', expected: '', description: '', showInSearch: false };
const tabs = [['search', 'Поиск'], ['scenarios', 'Сценарии'], ['common', 'Общие элементы'], ['settings', 'Настройки']];
const normalizeSettings = (settings = {}) => ({ ...emptySettings, ...settings, commonElements: settings.commonElements || [], scenarios: settings.scenarios || [] });
const makeScenario = (count) => ({ name: `Сценарий ${count + 1}`, description: '', commonElementIds: [], enabled: true, rules: [{ ...ruleTemplate }] });
const makeCommon = (count) => ({ id: crypto.randomUUID(), name: `Общий элемент ${count + 1}`, rules: [{ ...ruleTemplate }] });
const splitValues = (value) => String(value || 'любое значение').split(/[|;]/).map((item) => item.trim()).filter(Boolean);
const validRules = (rules) => rules.filter((rule) => rule.keyPath && (rule.expected || rule.mode === 'exists'));

function useStoredSet(storageKey) {
  const [values, setValues] = useState(() => new Set(JSON.parse(localStorage.getItem(storageKey) || '[]')));
  const replace = useCallback((nextValues) => {
    const next = nextValues instanceof Set ? nextValues : new Set(nextValues);
    localStorage.setItem(storageKey, JSON.stringify([...next]));
    setValues(next);
  }, [storageKey]);
  const toggle = useCallback((value) => {
    const next = new Set(values);
    next.has(value) ? next.delete(value) : next.add(value);
    replace(next);
  }, [replace, values]);
  return [values, replace, toggle];
}

function App() {
  const [settings, setSettings] = useState(emptySettings);
  const [activeTab, setActiveTab] = useState('search');
  const [menuOpen, setMenuOpen] = useState(false);
  const [matches, setMatches] = useState([]);
  const [proxy, setProxy] = useState({ running: false, port: 8080 });
  const [proxyInfo, setProxyInfo] = useState({ host: '...', port: 8080, certificatePath: '...' });
  const [scenarioEditor, setScenarioEditor] = useState(null);
  const [commonEditor, setCommonEditor] = useState(null);
  const [checkedRules, setCheckedRules] = useStoredSet('checkedSearchRules');
  const [expandedSearch, , toggleExpandedSearch] = useStoredSet('searchExpanded');
  const [visibleDescriptions, , toggleDescription] = useStoredSet('searchDescriptions');
  const [skipSearchSync, setSkipSearchSync] = useState(false);

  const saveSettings = useCallback(async (next) => {
    const normalized = normalizeSettings(await eel.ui_save_settings(next)());
    setSettings(normalized);
  }, []);

  const updateAndSave = useCallback((producer) => {
    const next = producer(structuredClone(settings));
    setSettings(next);
    return saveSettings(next);
  }, [saveSettings, settings]);

  const refresh = useCallback(async () => {
    const [records, status] = await Promise.all([eel.ui_results()(), eel.ui_proxy_status()()]);
    setMatches(records || []);
    setProxy(status || { running: false, port: 8080 });
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      const initial = normalizeSettings(await eel.ui_settings()());
      if (!active) return;
      setSettings(initial);
      await refresh();
    }
    load();
    const timer = setInterval(refresh, 1000);
    return () => { active = false; clearInterval(timer); };
  }, [refresh]);

  useEffect(() => {
    async function loadProxyInfo() {
      try { setProxyInfo(await eel.ui_proxy_info()()); } catch (_) {}
    }
    loadProxyInfo();
    const timer = setInterval(loadProxyInfo, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (skipSearchSync || !matches.length) return;
    setCheckedRules(collectMatchedSearchRules(matches, settings.scenarios));
  }, [matches, settings.scenarios, setCheckedRules, skipSearchSync]);

  const openCertificateFolder = async () => {
    const result = await eel.ui_open_certificate_folder()();
    if (!result.ok) alert(result.message);
  };

  const clearMatches = async () => {
    setSkipSearchSync(true);
    await eel.ui_clear_results()();
    setMatches([]);
  };

  return <>
    <AppHeader proxy={proxy} />
    <TabMenu activeTab={activeTab} setActiveTab={setActiveTab} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
    <main>
      {activeTab === 'search' && <SearchTab settings={settings} matches={matches} checkedRules={checkedRules} setCheckedRules={setCheckedRules} expandedSearch={expandedSearch} visibleDescriptions={visibleDescriptions} toggleExpandedSearch={toggleExpandedSearch} toggleDescription={toggleDescription} updateAndSave={updateAndSave} clearMatches={clearMatches} />}
      {activeTab === 'scenarios' && <EntityList title="Сценарии" items={settings.scenarios} empty="Сценарии пока не заданы." addLabel="Добавить сценарий" onAdd={() => setScenarioEditor({ index: null, value: makeScenario(settings.scenarios.length) })} onOpen={(value, index) => setScenarioEditor({ index, value: structuredClone(value) })} onDeleteAll={() => updateAndSave((next) => ({ ...next, scenarios: [] }))} />}
      {activeTab === 'common' && <EntityList title="Общие элементы" hint="Набор правил, который можно подключить к сценарию." items={settings.commonElements} empty="Общие элементы пока не заданы." addLabel="Добавить общий элемент" onAdd={() => setCommonEditor({ index: null, value: makeCommon(settings.commonElements.length) })} onOpen={(value, index) => setCommonEditor({ index, value: structuredClone(value) })} onDeleteAll={() => updateAndSave((next) => ({ ...next, commonElements: [] }))} />}
      {activeTab === 'settings' && <SettingsTab settings={settings} setSettings={setSettings} saveSettings={saveSettings} proxyInfo={proxyInfo} openCertificateFolder={openCertificateFolder} />}
    </main>
    {scenarioEditor && <ScenarioModal editor={scenarioEditor} commonElements={settings.commonElements} onClose={() => setScenarioEditor(null)} onSave={(scenario) => saveEntity(updateAndSave, 'scenarios', scenarioEditor.index, scenario).then(() => setScenarioEditor(null))} onDelete={() => deleteEntity(updateAndSave, 'scenarios', scenarioEditor.index).then(() => setScenarioEditor(null))} onDuplicate={() => duplicateScenario(updateAndSave, scenarioEditor.value).then(() => setScenarioEditor(null))} />}
    {commonEditor && <CommonModal editor={commonEditor} onClose={() => setCommonEditor(null)} onSave={(element) => saveEntity(updateAndSave, 'commonElements', commonEditor.index, element).then(() => setCommonEditor(null))} onDelete={() => deleteEntity(updateAndSave, 'commonElements', commonEditor.index).then(() => setCommonEditor(null))} />}
  </>;
}

function collectMatchedSearchRules(matches, scenarios) {
  const matched = new Set();
  matches.forEach((record) => (record.scenarios || []).forEach((scenario) => {
    const scenarioIndex = scenarios.findIndex((item) => (item.name || '') === (scenario.name || ''));
    if (scenarioIndex < 0 || scenarios[scenarioIndex].enabled === false) return;
    let valueIndex = 0;
    (scenarios[scenarioIndex].rules || []).forEach((rule) => {
      if (!rule.showInSearch) return;
      const values = splitValues(rule.expected);
      const check = (scenario.checks || []).find((item) => item.keyPath === rule.keyPath && item.matched);
      if (check) values.forEach((value, offset) => { if (check.actual?.includes(value)) matched.add(`${scenarioIndex}:${valueIndex + offset}`); });
      valueIndex += values.length || 1;
    });
  }));
  return matched;
}

function saveEntity(updateAndSave, collection, index, entity) {
  return updateAndSave((next) => {
    if (index === null) next[collection].push(entity);
    else next[collection][index] = entity;
    return next;
  });
}

function deleteEntity(updateAndSave, collection, index) {
  return updateAndSave((next) => {
    next[collection].splice(index, 1);
    return next;
  });
}

function duplicateScenario(updateAndSave, scenario) {
  return updateAndSave((next) => {
    next.scenarios.push({ ...scenario, name: `${scenario.name || 'Сценарий'} (копия)`, rules: (scenario.rules || []).map((rule) => ({ ...rule })) });
    return next;
  });
}

function AppHeader({ proxy }) {
  return <header><div><h1>Mobile Traffic Check</h1><p>Проверка мобильного трафика</p></div><span className={proxy.running ? 'online' : 'offline'}>{proxy.running ? `mitmproxy: порт ${proxy.port}` : 'mitmproxy остановлен'}</span></header>;
}

function TabMenu({ activeTab, setActiveTab, menuOpen, setMenuOpen }) {
  return <div className={`menu ${menuOpen ? 'open' : ''}`}><button className="burger" onClick={() => setMenuOpen(!menuOpen)}>☰ Меню</button><nav className="tabs">{tabs.map(([id, label]) => <button key={id} className={`tab ${activeTab === id ? 'active' : ''}`} onClick={() => setActiveTab(id)}>{label}</button>)}</nav></div>;
}

const TabPanel = ({ children }) => <section className="tab-panel active">{children}</section>;
const Card = ({ children, className = '' }) => <div className={`card ${className}`.trim()}>{children}</div>;
const TitleRow = ({ title, children }) => <div className="title-row"><h2>{title}</h2>{children}</div>;
const FormField = ({ label, children }) => <label className="field"><span>{label}</span>{children}</label>;
const ResultRow = ({ label, value, className = '' }) => <div className={`result-block-row ${className}`.trim()}><span>{label}</span><span>{value}</span></div>;

function EntityList({ title, hint, items, empty, addLabel, onAdd, onOpen, onDeleteAll }) {
  return <TabPanel><Card><TitleRow title={title}><button onClick={onAdd}>{addLabel}</button></TitleRow>{hint && <p className="hint">{hint}</p>}<div className="scenarios">{items.length ? items.map((item, index) => <EntityCard key={item.id || index} item={item} title={title} index={index} onOpen={onOpen} />) : <span className="hint">{empty}</span>}</div><button className="secondary danger-text" onClick={onDeleteAll}>Удалить все</button></Card></TabPanel>;
}

function EntityCard({ item, title, index, onOpen }) {
  return <button className="scenario-card" onClick={() => onOpen(item, index)}><span>{item.name || `${title} ${index + 1}`}</span><small>{item.rules?.length || 0} правил</small></button>;
}

function SearchTab({ settings, matches, checkedRules, setCheckedRules, expandedSearch, visibleDescriptions, toggleExpandedSearch, toggleDescription, updateAndSave, clearMatches }) {
  const updateRuleCheck = (key, checked) => {
    const next = new Set(checkedRules);
    checked ? next.add(key) : next.delete(key);
    setCheckedRules(next);
  };
  const visibleMatches = matches.flatMap((record) => (record.scenarios || []).filter((scenario) => scenario.matched || scenario.partial).map((scenario) => ({ record, scenario })));
  return <TabPanel><Card><TitleRow title="Найденные совпадения"><button className="secondary" onClick={clearMatches}>Очистить поиск</button></TitleRow><SearchScenarioList settings={settings} checkedRules={checkedRules} updateRuleCheck={updateRuleCheck} expandedSearch={expandedSearch} visibleDescriptions={visibleDescriptions} toggleExpandedSearch={toggleExpandedSearch} toggleDescription={toggleDescription} updateAndSave={updateAndSave} /><div className="list">{visibleMatches.length ? visibleMatches.map(({ record, scenario }) => <MatchItem key={`${record.at}|${record.url}|${scenario.index}`} record={record} scenario={scenario} />) : <span className="hint">Совпадений пока нет.</span>}</div></Card></TabPanel>;
}

function SearchScenarioList({ settings, checkedRules, updateRuleCheck, expandedSearch, visibleDescriptions, toggleExpandedSearch, toggleDescription, updateAndSave }) {
  return <details className="search-scenarios" open><summary>Сценарии поиска</summary><div className="search-scenario-list">{settings.scenarios.map((scenario, index) => <SearchScenarioOption key={index} scenario={scenario} index={index} checkedRules={checkedRules} updateRuleCheck={updateRuleCheck} expanded={expandedSearch.has(index)} descriptionVisible={visibleDescriptions.has(index)} toggleExpandedSearch={toggleExpandedSearch} toggleDescription={toggleDescription} updateAndSave={updateAndSave} />)}</div></details>;
}

function SearchScenarioOption({ scenario, index, checkedRules, updateRuleCheck, expanded, descriptionVisible, toggleExpandedSearch, toggleDescription, updateAndSave }) {
  const values = (scenario.rules || []).filter((rule) => rule.showInSearch).flatMap((rule) => splitValues(rule.expected).map((value) => ({ rule, value })));
  return <div className="search-scenario-option"><input type="checkbox" checked={scenario.enabled !== false} onChange={(event) => updateAndSave((next) => { next.scenarios[index].enabled = event.target.checked; return next; })} /><button type="button" className="search-scenario-name" onClick={() => toggleExpandedSearch(index)}>{scenario.name || `Сценарий ${index + 1}`}</button>{expanded && <div className="search-scenario-rules">{values.map((item, itemIndex) => <SearchRuleOption key={itemIndex} item={item} checked={checkedRules.has(`${index}:${itemIndex}`)} onChange={(checked) => updateRuleCheck(`${index}:${itemIndex}`, checked)} />)}</div>}{expanded && <button type="button" className="secondary search-description-toggle" onClick={() => toggleDescription(index)}>{descriptionVisible ? 'Скрыть описание' : 'Описание'}</button>}{expanded && descriptionVisible && <div className="search-scenario-description">{scenario.description || 'Описание не задано.'}</div>}</div>;
}

function SearchRuleOption({ item, checked, onChange }) {
  return <label className={`search-rule-option ${checked ? 'checked' : ''}`}><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{item.rule.keyPath}: {item.value}</span></label>;
}

function MatchItem({ record, scenario }) {
  const matched = (scenario.checks || []).length > 0 && scenario.checks.every((check) => check.matched);
  const partial = !matched && scenario.partial;
  const status = matched ? 'Совпало' : partial ? 'Совпало частично' : 'Есть несовпадения';
  return <details className={`item ${partial ? 'partial' : matched ? 'match' : 'mismatch'}`}><summary className="item-summary"><span>{status}</span><span>{record.url}</span><span className="item-meta">{new Date(record.at).toLocaleString()} · {record.method}</span></summary><div className="item-details"><div className="matched-request-title">Совпавший запрос</div><section className="scenario-result"><div className="result-block-header"><span>{scenario.name || 'Сценарий'}</span><span>{status}</span></div><ScenarioChecks checks={scenario.checks || []} /></section><details className="request-details"><summary>Весь запрос</summary><pre>{JSON.stringify(record.body, null, 2)}</pre></details></div></details>;
}

function ScenarioChecks({ checks }) {
  const count = Math.max(1, ...checks.map((check) => check.actual?.length || 0));
  const groups = Array.from({ length: count }, (_, index) => <ArrayGroup key={index} index={index} checks={checks} />);
  return count >= 2 ? <details className="array-accordion"><summary>Показать массивы ({count})</summary>{groups}</details> : groups;
}

function ArrayGroup({ index, checks }) {
  return <div className="array-group"><div className="array-group-title">Массив {index + 1}</div>{checks.map((check, checkIndex) => <CheckBlock key={checkIndex} check={check} index={index} />)}</div>;
}

function CheckBlock({ check, index }) {
  const actual = check.actual?.[index];
  if (actual === undefined && check.actual?.length) return null;
  const expectedGroup = check.expectedGroups?.[index];
  const expected = expectedGroup?.length ? expectedGroup.join(' | ') : check.expected?.length === check.actual?.length ? check.expected[index] : check.expected?.includes(actual) ? actual : check.expected?.join(' | ');
  const matched = actual !== undefined && (check.matchedByIndex?.[index] ?? (check.matchedExpected || []).includes(actual));
  const descriptions = String(check.description || '').split(/[;|]/).map((value) => value.trim()).filter(Boolean);
  const description = descriptions.length === 1 ? descriptions[0] : expectedGroup?.indexOf(actual) >= 0 ? descriptions[expectedGroup.indexOf(actual)] || '' : '';
  return <div className={`result-block ${matched ? 'check-match' : 'check-mismatch'}`}><ResultRow label="путь" value={check.keyPath} /><ResultRow label="ожидали" value={expected || (check.mode === 'exists' ? 'непустое значение' : 'значение не задано')} /><ResultRow label="получили" value={actual ?? 'путь не найден'} /><ResultRow label="результат" value={matched ? 'совпало' : 'не совпало'} />{matched && description && <ResultRow className="check-description" label="описание" value={description} />}</div>;
}

function RulesEditor({ rules, setRules }) {
  const update = (index, patch) => setRules(rules.map((rule, current) => current === index ? { ...rule, ...patch } : rule));
  return <div>{rules.map((rule, index) => <RuleEditor key={index} rule={rule} onChange={(patch) => update(index, patch)} onRemove={() => setRules(rules.length > 1 ? rules.filter((_, current) => current !== index) : [{ ...ruleTemplate }])} />)}<button type="button" className="secondary" onClick={() => setRules([...rules, { ...ruleTemplate }])}>Добавить правило</button></div>;
}

function RuleEditor({ rule, onChange, onRemove }) {
  return <div className="rule"><FormField label="Путь ключа"><input value={rule.keyPath || ''} placeholder="event.name" onChange={(event) => onChange({ keyPath: event.target.value })} /></FormField><FormField label="Сравнение"><select value={rule.mode || 'strict'} onChange={(event) => onChange({ mode: event.target.value })}><option value="strict">Строгое</option><option value="loose">Не строгое</option><option value="exists">Должно быть</option></select></FormField><FormField label="Значение"><input value={rule.expected || ''} placeholder="auth_click" onChange={(event) => onChange({ expected: event.target.value })} /></FormField><FormField label="Описание"><input value={rule.description || ''} placeholder="ФЛ|ЮЛ" onChange={(event) => onChange({ description: event.target.value })} /></FormField><label className="check"><input type="checkbox" checked={Boolean(rule.showInSearch)} onChange={(event) => onChange({ showInSearch: event.target.checked })} /> В поиске</label><button type="button" className="secondary remove-rule" onClick={onRemove}>Удалить</button></div>;
}

function ScenarioModal({ editor, commonElements, onClose, onSave, onDelete, onDuplicate }) {
  return <EntityModal editor={editor} title={editor.index === null ? 'Добавить сценарий' : 'Редактировать сценарий'} fallbackName="Сценарий" onClose={onClose} onSave={onSave} onDelete={onDelete} extraActions={editor.index !== null && <button type="button" className="secondary" onClick={onDuplicate}>Дублировать</button>} extraFields={(draft, setDraft) => <><FormField label="Общие элементы"><select multiple size="4" value={draft.commonElementIds || []} onChange={(event) => setDraft({ ...draft, commonElementIds: [...event.target.selectedOptions].map((option) => option.value) })}>{commonElements.map((element) => <option key={element.id} value={element.id}>{element.name}</option>)}</select></FormField><FormField label="Описание"><textarea rows="2" value={draft.description || ''} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></FormField></>} />;
}

function CommonModal({ editor, onClose, onSave, onDelete }) {
  return <EntityModal editor={editor} title="Общий элемент" fallbackName="Общий элемент" onClose={onClose} onSave={(element) => onSave({ ...element, id: element.id || crypto.randomUUID() })} onDelete={onDelete} />;
}

function EntityModal({ editor, title, fallbackName, onClose, onSave, onDelete, extraFields, extraActions }) {
  const [draft, setDraft] = useState(editor.value);
  const [rules, setRules] = useState(editor.value.rules?.length ? editor.value.rules : [{ ...ruleTemplate }]);
  const submit = (event) => {
    event.preventDefault();
    onSave({ ...draft, name: draft.name?.trim() || fallbackName, rules: validRules(rules) });
  };
  return <Modal onClose={onClose}><form onSubmit={submit}><div className="modal-header"><h2>{title}</h2><button type="button" className="secondary" onClick={onClose}>×</button></div><FormField label="Название"><input value={draft.name || ''} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></FormField>{extraFields?.(draft, setDraft)}<div className="title-row"><h3>Правила</h3></div><RulesEditor rules={rules} setRules={setRules} /><div className="modal-actions">{editor.index !== null && <button type="button" className="danger" onClick={onDelete}>Удалить</button>}{extraActions}<button type="button" className="secondary" onClick={onClose}>Отмена</button><button>Сохранить</button></div></form></Modal>;
}

const Modal = ({ children, onClose }) => <div className="modal-backdrop" onClick={(event) => event.target.className === 'modal-backdrop' && onClose()}><div className="modal">{children}</div></div>;

function SettingsTab({ settings, setSettings, saveSettings, proxyInfo, openCertificateFolder }) {
  const updatePath = (value) => {
    const next = { ...settings, requestPath: value };
    setSettings(next);
    saveSettings(next);
  };
  return <TabPanel><Card><ProxyInfo info={proxyInfo} openCertificateFolder={openCertificateFolder} /><FormField label="Путь запроса"><input value={settings.requestPath || ''} placeholder="/api/events или часть URL" onChange={(event) => updatePath(event.target.value)} /></FormField><p className="hint">Пустое поле принимает запросы с любым URL.</p><JsonTransfer title="Сценарии" name="scenarios" data={settings.scenarios} settings={settings} saveSettings={saveSettings} /><JsonTransfer title="Общие элементы" name="commonElements" data={settings.commonElements} settings={settings} saveSettings={saveSettings} /></Card></TabPanel>;
}

function ProxyInfo({ info, openCertificateFolder }) {
  return <section className="proxy-info card"><div className="proxy-info-title">Подключение телефона</div><div className="proxy-info-grid"><span>Хост</span><strong>{info.host}</strong><span>Порт</span><strong>{info.port}</strong><span>Сертификат на ПК</span><code>{info.certificatePath}</code><button className="secondary" type="button" onClick={openCertificateFolder}>Открыть папку</button></div></section>;
}

function JsonTransfer({ title, name, data, settings, saveSettings }) {
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  const download = () => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify({ [name]: data }, null, 2)], { type: 'application/json' }));
    link.download = `${name}.json`;
    link.click();
  };
  const upload = async () => {
    try {
      const parsed = JSON.parse(text);
      await saveSettings({ ...settings, [name]: Array.isArray(parsed) ? parsed : parsed[name] || [] });
      setMessage(`${title} загружены.`);
    } catch (_) {
      setMessage('Некорректный JSON.');
    }
  };
  return <div className="json-upload-card"><div className="title-row"><h3>{title}</h3><div><button className="secondary" type="button" onClick={download}>Скачать</button> <button className="secondary" type="button" onClick={upload}>Загрузить JSON</button></div></div><textarea rows="6" value={text} onChange={(event) => setText(event.target.value)} placeholder={`{"${name}":[]}`} /><p className="hint">{message}</p></div>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
