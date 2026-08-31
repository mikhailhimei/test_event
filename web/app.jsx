const { useCallback, useEffect, useState } = React;

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
