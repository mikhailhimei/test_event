function ScenarioModal({ editor, commonElements, onClose, onSave, onDelete, onDuplicate }) {
  const renderScenarioFields = (draft, setDraft) => (
    <>
      <FormField label="Общие элементы">
        <select
          multiple
          size="4"
          value={draft.commonElementIds || []}
          onChange={(event) => setDraft({
            ...draft,
            commonElementIds: [...event.target.selectedOptions].map((option) => option.value),
          })}
        >
          {commonElements.map((element) => (
            <option key={element.id} value={element.id}>{element.name}</option>
          ))}
        </select>
      </FormField>
      <FormField label="Описание">
        <textarea
          rows="2"
          value={draft.description || ''}
          onChange={(event) => setDraft({ ...draft, description: event.target.value })}
        />
      </FormField>
    </>
  );

  return (
    <EntityModal
      editor={editor}
      title={editor.index === null ? 'Добавить сценарий' : 'Редактировать сценарий'}
      fallbackName="Сценарий"
      onClose={onClose}
      onSave={onSave}
      onDelete={onDelete}
      extraFields={renderScenarioFields}
      extraActions={editor.index !== null && (
        <button type="button" className="secondary" onClick={onDuplicate}>Дублировать</button>
      )}
    />
  );
}

function CommonModal({ editor, onClose, onSave, onDelete }) {
  const saveCommon = (element) => onSave({ ...element, id: element.id || crypto.randomUUID() });

  return (
    <EntityModal
      editor={editor}
      title="Общий элемент"
      fallbackName="Общий элемент"
      onClose={onClose}
      onSave={saveCommon}
      onDelete={onDelete}
    />
  );
}

function EntityModal({ editor, title, fallbackName, onClose, onSave, onDelete, extraFields, extraActions }) {
  const [draft, setDraft] = React.useState(editor.value);
  const [rules, setRules] = React.useState(editor.value.rules?.length ? editor.value.rules : [{ ...ruleTemplate }]);

  const submit = (event) => {
    event.preventDefault();
    onSave({ ...draft, name: draft.name?.trim() || fallbackName, rules: validRules(rules) });
  };

  return (
    <Modal onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="secondary" onClick={onClose}>×</button>
        </div>

        <FormField label="Название">
          <input value={draft.name || ''} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </FormField>
        {extraFields?.(draft, setDraft)}

        <div className="title-row"><h3>Правила</h3></div>
        <RulesEditor rules={rules} setRules={setRules} />

        <div className="modal-actions">
          {editor.index !== null && <button type="button" className="danger" onClick={onDelete}>Удалить</button>}
          {extraActions}
          <button type="button" className="secondary" onClick={onClose}>Отмена</button>
          <button>Сохранить</button>
        </div>
      </form>
    </Modal>
  );
}
