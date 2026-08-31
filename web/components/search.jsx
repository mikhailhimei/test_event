function SearchTab({
  settings,
  matches,
  checkedRules,
  setCheckedRules,
  expandedSearch,
  visibleDescriptions,
  toggleExpandedSearch,
  toggleDescription,
  updateAndSave,
  clearMatches,
}) {
  const updateRuleCheck = (key, checked) => {
    const next = new Set(checkedRules);
    checked ? next.add(key) : next.delete(key);
    setCheckedRules(next);
  };

  const visibleMatches = matches.flatMap((record) => (
    record.scenarios || []
  ).filter((scenario) => (
    scenario.matched || scenario.partial
  )).map((scenario) => ({ record, scenario })));

  return (
    <TabPanel>
      <Card>
        <TitleRow title="Найденные совпадения">
          <button className="secondary" onClick={clearMatches}>Очистить поиск</button>
        </TitleRow>

        <SearchScenarioList
          settings={settings}
          checkedRules={checkedRules}
          updateRuleCheck={updateRuleCheck}
          expandedSearch={expandedSearch}
          visibleDescriptions={visibleDescriptions}
          toggleExpandedSearch={toggleExpandedSearch}
          toggleDescription={toggleDescription}
          updateAndSave={updateAndSave}
        />

        <div className="list">
          {visibleMatches.length ? (
            visibleMatches.map(({ record, scenario }) => (
              <MatchItem
                key={`${record.at}|${record.url}|${scenario.index}`}
                record={record}
                scenario={scenario}
              />
            ))
          ) : (
            <span className="hint">Совпадений пока нет.</span>
          )}
        </div>
      </Card>
    </TabPanel>
  );
}

function SearchScenarioList({
  settings,
  checkedRules,
  updateRuleCheck,
  expandedSearch,
  visibleDescriptions,
  toggleExpandedSearch,
  toggleDescription,
  updateAndSave,
}) {
  return (
    <details className="search-scenarios" open>
      <summary>Сценарии поиска</summary>
      <div className="search-scenario-list">
        {settings.scenarios.map((scenario, index) => (
          <SearchScenarioOption
            key={index}
            scenario={scenario}
            index={index}
            checkedRules={checkedRules}
            updateRuleCheck={updateRuleCheck}
            expanded={expandedSearch.has(index)}
            descriptionVisible={visibleDescriptions.has(index)}
            toggleExpandedSearch={toggleExpandedSearch}
            toggleDescription={toggleDescription}
            updateAndSave={updateAndSave}
          />
        ))}
      </div>
    </details>
  );
}

function SearchScenarioOption({
  scenario,
  index,
  checkedRules,
  updateRuleCheck,
  expanded,
  descriptionVisible,
  toggleExpandedSearch,
  toggleDescription,
  updateAndSave,
}) {
  const values = (scenario.rules || [])
    .filter((rule) => rule.showInSearch)
    .flatMap((rule) => splitValues(rule.expected).map((value) => ({ rule, value })));

  const toggleScenario = (event) => updateAndSave((next) => {
    next.scenarios[index].enabled = event.target.checked;
    return next;
  });

  return (
    <div className="search-scenario-option">
      <input type="checkbox" checked={scenario.enabled !== false} onChange={toggleScenario} />
      <button type="button" className="search-scenario-name" onClick={() => toggleExpandedSearch(index)}>
        {scenario.name || `Сценарий ${index + 1}`}
      </button>

      {expanded && (
        <div className="search-scenario-rules">
          {values.map((item, itemIndex) => (
            <SearchRuleOption
              key={itemIndex}
              item={item}
              checked={checkedRules.has(`${index}:${itemIndex}`)}
              onChange={(checked) => updateRuleCheck(`${index}:${itemIndex}`, checked)}
            />
          ))}
        </div>
      )}

      {expanded && (
        <button type="button" className="secondary search-description-toggle" onClick={() => toggleDescription(index)}>
          {descriptionVisible ? 'Скрыть описание' : 'Описание'}
        </button>
      )}

      {expanded && descriptionVisible && (
        <div className="search-scenario-description">{scenario.description || 'Описание не задано.'}</div>
      )}
    </div>
  );
}

function SearchRuleOption({ item, checked, onChange }) {
  return (
    <label className={`search-rule-option ${checked ? 'checked' : ''}`}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{item.rule.keyPath}: {item.value}</span>
    </label>
  );
}

function MatchItem({ record, scenario }) {
  const matched = (scenario.checks || []).length > 0 && scenario.checks.every((check) => check.matched);
  const partial = !matched && scenario.partial;
  const status = matched ? 'Совпало' : partial ? 'Совпало частично' : 'Есть несовпадения';

  return (
    <details className={`item ${partial ? 'partial' : matched ? 'match' : 'mismatch'}`}>
      <summary className="item-summary">
        <span>{status}</span>
        <span>{record.url}</span>
        <span className="item-meta">{new Date(record.at).toLocaleString()} · {record.method}</span>
      </summary>
      <div className="item-details">
        <div className="matched-request-title">Совпавший запрос</div>
        <section className="scenario-result">
          <div className="result-block-header">
            <span>{scenario.name || 'Сценарий'}</span>
            <span>{status}</span>
          </div>
          <ScenarioChecks checks={scenario.checks || []} />
        </section>
        <details className="request-details">
          <summary>Весь запрос</summary>
          <pre>{JSON.stringify(record.body, null, 2)}</pre>
        </details>
      </div>
    </details>
  );
}

function ScenarioChecks({ checks }) {
  const count = Math.max(1, ...checks.map((check) => check.actual?.length || 0));
  const groups = Array.from({ length: count }, (_, index) => (
    <ArrayGroup key={index} index={index} checks={checks} />
  ));

  if (count < 2) return groups;

  return (
    <details className="array-accordion">
      <summary>Показать массивы ({count})</summary>
      {groups}
    </details>
  );
}

function ArrayGroup({ index, checks }) {
  return (
    <div className="array-group">
      <div className="array-group-title">Массив {index + 1}</div>
      {checks.map((check, checkIndex) => (
        <CheckBlock key={checkIndex} check={check} index={index} />
      ))}
    </div>
  );
}

function CheckBlock({ check, index }) {
  const actual = check.actual?.[index];
  if (actual === undefined && check.actual?.length) return null;

  const expectedGroup = check.expectedGroups?.[index];
  const expected = expectedGroup?.length
    ? expectedGroup.join(' | ')
    : check.expected?.length === check.actual?.length
      ? check.expected[index]
      : check.expected?.includes(actual)
        ? actual
        : check.expected?.join(' | ');
  const matched = actual !== undefined && (check.matchedByIndex?.[index] ?? (check.matchedExpected || []).includes(actual));
  const descriptions = String(check.description || '').split(/[;|]/).map((value) => value.trim()).filter(Boolean);
  const description = descriptions.length === 1
    ? descriptions[0]
    : expectedGroup?.indexOf(actual) >= 0
      ? descriptions[expectedGroup.indexOf(actual)] || ''
      : '';

  return (
    <div className={`result-block ${matched ? 'check-match' : 'check-mismatch'}`}>
      <ResultRow label="путь" value={check.keyPath} />
      <ResultRow label="ожидали" value={expected || (check.mode === 'exists' ? 'непустое значение' : 'значение не задано')} />
      <ResultRow label="получили" value={actual ?? 'путь не найден'} />
      <ResultRow label="результат" value={matched ? 'совпало' : 'не совпало'} />
      {matched && description && <ResultRow className="check-description" label="описание" value={description} />}
    </div>
  );
}
