const emptySettings = {
  requestPath: '',
  scenarios: [],
  commonElements: [],
};

const ruleTemplate = {
  keyPath: '',
  mode: 'strict',
  expected: '',
  description: '',
  showInSearch: false,
};

const tabs = [
  ['search', 'Поиск'],
  ['scenarios', 'Сценарии'],
  ['common', 'Общие элементы'],
  ['settings', 'Настройки'],
];

const normalizeSettings = (settings = {}) => ({
  ...emptySettings,
  ...settings,
  commonElements: settings.commonElements || [],
  scenarios: settings.scenarios || [],
});

const makeScenario = (count) => ({
  name: `Сценарий ${count + 1}`,
  description: '',
  commonElementIds: [],
  enabled: true,
  rules: [{ ...ruleTemplate }],
});

const makeCommon = (count) => ({
  id: crypto.randomUUID(),
  name: `Общий элемент ${count + 1}`,
  rules: [{ ...ruleTemplate }],
});

const splitValues = (value) => String(value || 'любое значение')
  .split(/[|;]/)
  .map((item) => item.trim())
  .filter(Boolean);

const validRules = (rules) => rules.filter((rule) => (
  rule.keyPath && (rule.expected || rule.mode === 'exists')
));
