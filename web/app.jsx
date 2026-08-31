const { useCallback, useEffect, useMemo, useState } = React;

const emptySettings = { requestPath: '', scenarios: [], commonElements: [] };
const ruleTemplate = { keyPath: '', mode: 'strict', expected: '', description: '', showInSearch: false };
const makeScenario = (count) => ({ name: `Сценарий ${count + 1}`, description: '', commonElementIds: [], enabled: true, rules: [{ ...ruleTemplate }] });
const makeCommon = (count) => ({ id: crypto.randomUUID(), name: `Общий элемент ${count + 1}`, rules: [{ ...ruleTemplate }] });
const splitValues = (value) => String(value || 'любое значение').split(/[|;]/).map((item) => item.trim()).filter(Boolean);

function App() {
  const [settings, setSettings] = useState(emptySettings);
  const [activeTab, setActiveTab] = useState('search');
  const [menuOpen, setMenuOpen] = useState(false);
  const [matches, setMatches] = useState([]);
  const [proxy, setProxy] = useState({ running: false, port: 8080 });
  const [proxyInfo, setProxyInfo] = useState({ host: '...', port: 8080, certificatePath: '...' });
  const [scenarioEditor, setScenarioEditor] = useState(null);
  const [commonEditor, setCommonEditor] = useState(null);
  const [scenariosJson, setScenariosJson] = useState('');
  const [commonJson, setCommonJson] = useState('');
  const [message, setMessage] = useState('');
  const [commonMessage, setCommonMessage] = useState('');
  const [checkedRules, setCheckedRules] = useState(() => new Set(JSON.parse(localStorage.getItem('checkedSearchRules') || '[]')));
  const [expandedSearch, setExpandedSearch] = useState(() => new Set(JSON.parse(localStorage.getItem('searchExpanded') || '[]')));
  const [visibleDescriptions, setVisibleDescriptions] = useState(() => new Set(JSON.parse(localStorage.getItem('searchDescriptions') || '[]')));
  const [skipSearchSync, setSkipSearchSync] = useState(false);

  const saveSettings = useCallback(async (next) => {
    const normalized = await eel.ui_save_settings(next)();
    setSettings({ ...emptySettings, ...normalized, commonElements: normalized.commonElements || [] });
  }, []);

  const refresh = useCallback(async () => {
    const [records, status] = await Promise.all([eel.ui_results()(), eel.ui_proxy_status()()]);
    setMatches(records || []);
    setProxy(status || { running: false, port: 8080 });
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      const initial = await eel.ui_settings()();
      if (!active) return;
      setSettings({ ...emptySettings, ...initial, commonElements: initial.commonElements || [] });
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
    const matched = new Set();
    matches.forEach((record) => (record.scenarios || []).forEach((scenario) => {
      const scenarioIndex = (settings.scenarios || []).findIndex((item) => (item.name || '') === (scenario.name || ''));
      if (scenarioIndex < 0 || settings.scenarios[scenarioIndex].enabled === false) return;
      let valueIndex = 0;
      (settings.scenarios[scenarioIndex].rules || []).forEach((rule) => {
        if (!rule.showInSearch) return;
        const values = splitValues(rule.expected);
        const check = (scenario.checks || []).find((item) => item.keyPath === rule.keyPath && item.matched);
        if (check) values.forEach((value, offset) => { if (check.actual?.includes(value)) matched.add(`${scenarioIndex}:${valueIndex + offset}`); });
        valueIndex += values.length || 1;
      });
    }));
    setCheckedRules(matched);
    localStorage.setItem('checkedSearchRules', JSON.stringify([...matched]));
  }, [matches, settings.scenarios, skipSearchSync]);

  const updateAndSave = (producer) => {
    const next = producer(structuredClone(settings));
    setSettings(next);
    return saveSettings(next);
  };

  const toggleSet = (setter, storageKey, value) => setter((prev) => {
    const next = new Set(prev);
    next.has(value) ? next.delete(value) : next.add(value);
    localStorage.setItem(storageKey, JSON.stringify([...next]));
    return next;
  });

  const openCertificateFolder = async () => {
    const result = await eel.ui_open_certificate_folder()();
    if (!result.ok) alert(result.message);
  };

  const download = (name, data) => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify({ [name]: data }, null, 2)], { type: 'application/json' }));
    link.download = `${name}.json`;
    link.click();
  };

  const clearMatches = async () => {
    setSkipSearchSync(true);
    await eel.ui_clear_results()();
    setMatches([]);
  };

  return <>
    <header>
      <div><h1>Mobile Traffic Check</h1><p>Проверка мобильного трафика</p></div>
      <span className={proxy.running ? 'online' : 'offline'}>{proxy.running ? `mitmproxy: порт ${proxy.port}` : 'mitmproxy остановлен'}</span>
    </header>
    <div className={`menu ${menuOpen ? 'open' : ''}`}>
      <button className="burger" onClick={() => setMenuOpen(!menuOpen)}>☰ Меню</button>
      <nav className="tabs">{[['search','Поиск'],['scenarios','Сценарии'],['common','Общие элементы'],['settings','Настройки']].map(([id,label]) => <button key={id} className={`tab ${activeTab === id ? 'active' : ''}`} onClick={() => setActiveTab(id)}>{label}</button>)}</nav>
    </div>
    <main>
      {activeTab === 'search' && <SearchTab settings={settings} matches={matches} checkedRules={checkedRules} setCheckedRules={setCheckedRules} expandedSearch={expandedSearch} setExpandedSearch={setExpandedSearch} visibleDescriptions={visibleDescriptions} setVisibleDescriptions={setVisibleDescriptions} toggleSet={toggleSet} updateAndSave={updateAndSave} clearMatches={clearMatches} />}
      {activeTab === 'scenarios' && <ListTab title="Сценарии" items={settings.scenarios || []} empty="Сценарии пока не заданы." addLabel="Добавить сценарий" onAdd={() => setScenarioEditor({ index: null, value: makeScenario((settings.scenarios || []).length) })} onOpen={(value, index) => setScenarioEditor({ index, value: structuredClone(value) })} onDeleteAll={() => updateAndSave((next) => ({ ...next, scenarios: [] }))} />}
      {activeTab === 'common' && <ListTab title="Общие элементы" hint="Набор правил, который можно подключить к сценарию." items={settings.commonElements || []} empty="Общие элементы пока не заданы." addLabel="Добавить общий элемент" onAdd={() => setCommonEditor({ index: null, value: makeCommon((settings.commonElements || []).length) })} onOpen={(value, index) => setCommonEditor({ index, value: structuredClone(value) })} onDeleteAll={() => updateAndSave((next) => ({ ...next, commonElements: [] }))} />}
      {activeTab === 'settings' && <SettingsTab settings={settings} setSettings={setSettings} saveSettings={saveSettings} proxyInfo={proxyInfo} openCertificateFolder={openCertificateFolder} download={download} scenariosJson={scenariosJson} setScenariosJson={setScenariosJson} commonJson={commonJson} setCommonJson={setCommonJson} message={message} setMessage={setMessage} commonMessage={commonMessage} setCommonMessage={setCommonMessage} />}
    </main>
    {scenarioEditor && <ScenarioModal editor={scenarioEditor} commonElements={settings.commonElements || []} onClose={() => setScenarioEditor(null)} onSave={(scenario) => updateAndSave((next) => { scenarioEditor.index === null ? next.scenarios.push(scenario) : next.scenarios[scenarioEditor.index] = scenario; return next; }).then(() => setScenarioEditor(null))} onDelete={() => updateAndSave((next) => { next.scenarios.splice(scenarioEditor.index, 1); return next; }).then(() => setScenarioEditor(null))} onDuplicate={() => updateAndSave((next) => { next.scenarios.push({ ...scenarioEditor.value, name: `${scenarioEditor.value.name || 'Сценарий'} (копия)`, rules: (scenarioEditor.value.rules || []).map((rule) => ({ ...rule })) }); return next; }).then(() => setScenarioEditor(null))} />}
    {commonEditor && <CommonModal editor={commonEditor} onClose={() => setCommonEditor(null)} onSave={(element) => updateAndSave((next) => { commonEditor.index === null ? next.commonElements.push(element) : next.commonElements[commonEditor.index] = element; return next; }).then(() => setCommonEditor(null))} onDelete={() => updateAndSave((next) => { next.commonElements.splice(commonEditor.index, 1); return next; }).then(() => setCommonEditor(null))} />}
  </>;
}

function ListTab({ title, hint, items, empty, addLabel, onAdd, onOpen, onDeleteAll }) {
  return <section className="tab-panel active"><div className="card"><div className="title-row"><h2>{title}</h2><button onClick={onAdd}>{addLabel}</button></div>{hint && <p className="hint">{hint}</p>}<div className="scenarios">{items.length ? items.map((item, index) => <button key={item.id || index} className="scenario-card" onClick={() => onOpen(item, index)}><span>{item.name || `${title} ${index + 1}`}</span><small>{item.rules?.length || 0} правил</small></button>) : <span className="hint">{empty}</span>}</div><button className="secondary danger-text" onClick={onDeleteAll}>Удалить все</button></div></section>;
}

function SearchTab({ settings, matches, checkedRules, setCheckedRules, expandedSearch, setExpandedSearch, visibleDescriptions, setVisibleDescriptions, toggleSet, updateAndSave, clearMatches }) {
  const updateRuleCheck = (key, checked) => setCheckedRules((prev) => { const next = new Set(prev); checked ? next.add(key) : next.delete(key); localStorage.setItem('checkedSearchRules', JSON.stringify([...next])); return next; });
  return <section className="tab-panel active"><div className="card"><div className="title-row"><h2>Найденные совпадения</h2><button className="secondary" onClick={clearMatches}>Очистить поиск</button></div><details className="search-scenarios" open><summary>Сценарии поиска</summary><div className="search-scenario-list">{(settings.scenarios || []).map((scenario, index) => <div className="search-scenario-option" key={index}><input type="checkbox" checked={scenario.enabled !== false} onChange={(e) => updateAndSave((next) => { next.scenarios[index].enabled = e.target.checked; return next; })} /><button type="button" className="search-scenario-name" onClick={() => toggleSet(setExpandedSearch, 'searchExpanded', index)}>{scenario.name || `Сценарий ${index + 1}`}</button>{expandedSearch.has(index) && <div className="search-scenario-rules">{(scenario.rules || []).filter((rule) => rule.showInSearch).flatMap((rule) => splitValues(rule.expected).map((value, valueIndex) => ({ rule, value, valueIndex }))).map((item, itemIndex) => <label className={`search-rule-option ${checkedRules.has(`${index}:${itemIndex}`) ? 'checked' : ''}`} key={itemIndex}><input type="checkbox" checked={checkedRules.has(`${index}:${itemIndex}`)} onChange={(e) => updateRuleCheck(`${index}:${itemIndex}`, e.target.checked)} /><span>{item.rule.keyPath}: {item.value}</span></label>)}</div>}{expandedSearch.has(index) && <button type="button" className="secondary search-description-toggle" onClick={() => toggleSet(setVisibleDescriptions, 'searchDescriptions', index)}>{visibleDescriptions.has(index) ? 'Скрыть описание' : 'Описание'}</button>}{expandedSearch.has(index) && visibleDescriptions.has(index) && <div className="search-scenario-description">{scenario.description || 'Описание не задано.'}</div>}</div>)}</div></details><div className="list">{matches.length ? matches.flatMap((record) => (record.scenarios || []).filter((scenario) => scenario.matched || scenario.partial).map((scenario) => <MatchItem key={`${record.at}|${record.url}|${scenario.index}`} record={record} scenario={scenario} />)) : <span className="hint">Совпадений пока нет.</span>}</div></div></section>;
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
const ResultRow = ({ label, value, className = '' }) => <div className={`result-block-row ${className}`}><span>{label}</span><span>{value}</span></div>;

function RulesEditor({ rules, setRules }) {
  const update = (index, patch) => setRules(rules.map((rule, current) => current === index ? { ...rule, ...patch } : rule));
  return <div>{rules.map((rule, index) => <div className="rule" key={index}><label className="field"><span>Путь ключа</span><input value={rule.keyPath || ''} placeholder="event.name" onChange={(e) => update(index, { keyPath: e.target.value })} /></label><label className="field"><span>Сравнение</span><select value={rule.mode || 'strict'} onChange={(e) => update(index, { mode: e.target.value })}><option value="strict">Строгое</option><option value="loose">Не строгое</option><option value="exists">Должно быть</option></select></label><label className="field"><span>Значение</span><input value={rule.expected || ''} placeholder="auth_click" onChange={(e) => update(index, { expected: e.target.value })} /></label><label className="field"><span>Описание</span><input value={rule.description || ''} placeholder="ФЛ|ЮЛ" onChange={(e) => update(index, { description: e.target.value })} /></label><label className="check"><input type="checkbox" checked={Boolean(rule.showInSearch)} onChange={(e) => update(index, { showInSearch: e.target.checked })} /> В поиске</label><button type="button" className="secondary remove-rule" onClick={() => setRules(rules.length > 1 ? rules.filter((_, current) => current !== index) : [{ ...ruleTemplate }])}>Удалить</button></div>)}<button type="button" className="secondary" onClick={() => setRules([...rules, { ...ruleTemplate }])}>Добавить правило</button></div>;
}

function ScenarioModal({ editor, commonElements, onClose, onSave, onDelete, onDuplicate }) {
  const [draft, setDraft] = useState(editor.value);
  const [rules, setRules] = useState(editor.value.rules?.length ? editor.value.rules : [{ ...ruleTemplate }]);
  const submit = (e) => { e.preventDefault(); onSave({ ...draft, name: draft.name?.trim() || 'Сценарий', rules: rules.filter((rule) => rule.keyPath && (rule.expected || rule.mode === 'exists')) }); };
  return <Modal onClose={onClose}><form onSubmit={submit}><div className="modal-header"><h2>{editor.index === null ? 'Добавить сценарий' : 'Редактировать сценарий'}</h2><button type="button" className="secondary" onClick={onClose}>×</button></div><label className="field"><span>Название</span><input value={draft.name || ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label><label className="field"><span>Общие элементы</span><select multiple size="4" value={draft.commonElementIds || []} onChange={(e) => setDraft({ ...draft, commonElementIds: [...e.target.selectedOptions].map((option) => option.value) })}>{commonElements.map((element) => <option key={element.id} value={element.id}>{element.name}</option>)}</select></label><label className="field"><span>Описание</span><textarea rows="2" value={draft.description || ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label><div className="title-row"><h3>Правила</h3></div><RulesEditor rules={rules} setRules={setRules} /><div className="modal-actions">{editor.index !== null && <button type="button" className="danger" onClick={onDelete}>Удалить</button>}{editor.index !== null && <button type="button" className="secondary" onClick={onDuplicate}>Дублировать</button>}<button type="button" className="secondary" onClick={onClose}>Отмена</button><button>Сохранить</button></div></form></Modal>;
}

function CommonModal({ editor, onClose, onSave, onDelete }) {
  const [draft, setDraft] = useState(editor.value);
  const [rules, setRules] = useState(editor.value.rules?.length ? editor.value.rules : [{ ...ruleTemplate }]);
  const submit = (e) => { e.preventDefault(); onSave({ ...draft, id: draft.id || crypto.randomUUID(), name: draft.name?.trim() || 'Общий элемент', rules: rules.filter((rule) => rule.keyPath && (rule.expected || rule.mode === 'exists')) }); };
  return <Modal onClose={onClose}><form onSubmit={submit}><div className="modal-header"><h2>Общий элемент</h2><button type="button" className="secondary" onClick={onClose}>×</button></div><label className="field"><span>Название</span><input value={draft.name || ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label><div className="title-row"><h3>Правила</h3></div><RulesEditor rules={rules} setRules={setRules} /><div className="modal-actions">{editor.index !== null && <button type="button" className="danger" onClick={onDelete}>Удалить</button>}<button type="button" className="secondary" onClick={onClose}>Отмена</button><button>Сохранить</button></div></form></Modal>;
}
const Modal = ({ children, onClose }) => <div className="modal-backdrop" onClick={(e) => e.target.className === 'modal-backdrop' && onClose()}><div className="modal">{children}</div></div>;

function SettingsTab({ settings, setSettings, saveSettings, proxyInfo, openCertificateFolder, download, scenariosJson, setScenariosJson, commonJson, setCommonJson, message, setMessage, commonMessage, setCommonMessage }) {
  const updatePath = (value) => { const next = { ...settings, requestPath: value }; setSettings(next); saveSettings(next); };
  const uploadScenarios = async () => { try { const data = JSON.parse(scenariosJson); await saveSettings({ ...settings, scenarios: Array.isArray(data) ? data : data.scenarios || [] }); setMessage('Сценарии загружены.'); } catch (_) { setMessage('Некорректный JSON.'); } };
  const uploadCommon = async () => { try { const data = JSON.parse(commonJson); await saveSettings({ ...settings, commonElements: Array.isArray(data) ? data : data.commonElements || [] }); setCommonMessage('Общие элементы загружены.'); } catch (_) { setCommonMessage('Некорректный JSON.'); } };
  return <section className="tab-panel active"><div className="card"><section className="proxy-info card"><div className="proxy-info-title">Подключение телефона</div><div className="proxy-info-grid"><span>Хост</span><strong>{proxyInfo.host}</strong><span>Порт</span><strong>{proxyInfo.port}</strong><span>Сертификат на ПК</span><code>{proxyInfo.certificatePath}</code><button className="secondary" type="button" onClick={openCertificateFolder}>Открыть папку</button></div></section><label className="field"><span>Путь запроса</span><input value={settings.requestPath || ''} placeholder="/api/events или часть URL" onChange={(e) => updatePath(e.target.value)} /></label><p className="hint">Пустое поле принимает запросы с любым URL.</p><div className="actions"><button className="secondary" onClick={() => download('scenarios', settings.scenarios || [])}>Скачать сценарии</button><button className="secondary" onClick={uploadScenarios}>Загрузить сценарии JSON</button></div><textarea rows="6" value={scenariosJson} onChange={(e) => setScenariosJson(e.target.value)} placeholder='{"scenarios":[]}' /><p className="hint">{message}</p><div className="json-upload-card"><div className="title-row"><h3>Общие элементы</h3><div><button className="secondary" type="button" onClick={() => download('commonElements', settings.commonElements || [])}>Скачать</button> <button className="secondary" type="button" onClick={uploadCommon}>Загрузить JSON</button></div></div><textarea rows="6" value={commonJson} onChange={(e) => setCommonJson(e.target.value)} placeholder='{"commonElements":[]}' /><p className="hint">{commonMessage}</p></div></div></section>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
