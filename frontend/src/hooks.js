import React from 'react';

function useStoredSet(storageKey) {
  const [values, setValues] = React.useState(() => new Set(JSON.parse(localStorage.getItem(storageKey) || '[]')));
  const replace = React.useCallback((nextValues) => {
    const next = nextValues instanceof Set ? nextValues : new Set(nextValues);
    localStorage.setItem(storageKey, JSON.stringify([...next]));
    setValues(next);
  }, [storageKey]);
  const toggle = React.useCallback((value) => {
    const next = new Set(values);
    next.has(value) ? next.delete(value) : next.add(value);
    replace(next);
  }, [replace, values]);
  return [values, replace, toggle];
}

export { useStoredSet };
