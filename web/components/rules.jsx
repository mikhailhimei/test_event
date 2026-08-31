function RulesEditor({ rules, setRules }) {
  const updateRule = (index, patch) => {
    setRules(rules.map((rule, current) => (
      current === index ? { ...rule, ...patch } : rule
    )));
  };

  const removeRule = (index) => {
    setRules(rules.length > 1
      ? rules.filter((_, current) => current !== index)
      : [{ ...ruleTemplate }]);
  };

  return (
    <div>
      {rules.map((rule, index) => (
        <RuleEditor
          key={index}
          rule={rule}
          onChange={(patch) => updateRule(index, patch)}
          onRemove={() => removeRule(index)}
        />
      ))}
      <button type="button" className="secondary" onClick={() => setRules([...rules, { ...ruleTemplate }])}>
        Добавить правило
      </button>
    </div>
  );
}

function RuleEditor({ rule, onChange, onRemove }) {
  return (
    <div className="rule">
      <FormField label="Путь ключа">
        <input value={rule.keyPath || ''} placeholder="event.name" onChange={(event) => onChange({ keyPath: event.target.value })} />
      </FormField>
      <FormField label="Сравнение">
        <select value={rule.mode || 'strict'} onChange={(event) => onChange({ mode: event.target.value })}>
          <option value="strict">Строгое</option>
          <option value="loose">Не строгое</option>
          <option value="exists">Должно быть</option>
        </select>
      </FormField>
      <FormField label="Значение">
        <input value={rule.expected || ''} placeholder="auth_click" onChange={(event) => onChange({ expected: event.target.value })} />
      </FormField>
      <FormField label="Описание">
        <input value={rule.description || ''} placeholder="ФЛ|ЮЛ" onChange={(event) => onChange({ description: event.target.value })} />
      </FormField>
      <label className="check">
        <input type="checkbox" checked={Boolean(rule.showInSearch)} onChange={(event) => onChange({ showInSearch: event.target.checked })} />
        В поиске
      </label>
      <button type="button" className="secondary remove-rule" onClick={onRemove}>Удалить</button>
    </div>
  );
}
