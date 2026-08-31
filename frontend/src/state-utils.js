import { splitValues } from './constants';

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

      if (check) {
        values.forEach((value, offset) => {
          if (check.actual?.includes(value)) matched.add(`${scenarioIndex}:${valueIndex + offset}`);
        });
      }

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
    next.scenarios.push({
      ...scenario,
      name: `${scenario.name || 'Сценарий'} (копия)`,
      rules: (scenario.rules || []).map((rule) => ({ ...rule })),
    });
    return next;
  });
}

export { collectMatchedSearchRules, saveEntity, deleteEntity, duplicateScenario };
