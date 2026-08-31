import React from 'react';
import { Card, TabPanel, TitleRow } from './layout';

function EntityList({ title, hint, items, empty, addLabel, onAdd, onOpen, onDeleteAll }) {
  return (
    <TabPanel>
      <Card>
        <TitleRow title={title}>
          <button onClick={onAdd}>{addLabel}</button>
        </TitleRow>

        {hint && <p className="hint">{hint}</p>}

        <div className="scenarios">
          {items.length ? (
            items.map((item, index) => (
              <EntityCard
                key={item.id || index}
                item={item}
                title={title}
                index={index}
                onOpen={onOpen}
              />
            ))
          ) : (
            <span className="hint">{empty}</span>
          )}
        </div>

        <button className="secondary danger-text" onClick={onDeleteAll}>
          Удалить все
        </button>
      </Card>
    </TabPanel>
  );
}

function EntityCard({ item, title, index, onOpen }) {
  return (
    <button className="scenario-card" onClick={() => onOpen(item, index)}>
      <span>{item.name || `${title} ${index + 1}`}</span>
      <small>{item.rules?.length || 0} правил</small>
    </button>
  );
}


export { EntityList };
