const elements = { path: document.querySelector('#requestPath'), scenarios: document.querySelector('#scenarios'), results: document.querySelector('#results'), connection: document.querySelector('#connection'), scenarioTemplate: document.querySelector('#scenarioTemplate'), ruleTemplate: document.querySelector('#ruleTemplate') };

function addRule(container, rule = {}) {
  const node = elements.ruleTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector('.rule-path').value = rule.keyPath || '';
  node.querySelector('.rule-mode').value = rule.mode || 'strict';
  node.querySelector('.rule-expected').value = rule.expected || '';
  node.querySelector('.remove-rule').onclick = () => node.remove();
  container.append(node);
}
function addScenario(scenario = { name: '', rules: [{}] }) {
  const node = elements.scenarioTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector('.scenario-name').value = scenario.name || '';
  const rules = node.querySelector('.rules');
  (scenario.rules?.length ? scenario.rules : [{}]).forEach((rule) => addRule(rules, rule));
  node.querySelector('.add-rule').onclick = () => addRule(rules);
  node.querySelector('.remove-scenario').onclick = () => node.remove();
  elements.scenarios.append(node);
}
function settingsFromForm() {
  return { requestPath: elements.path.value.trim(), scenarios: [...elements.scenarios.children].map((node) => ({ name: node.querySelector('.scenario-name').value.trim(), rules: [...node.querySelectorAll('.rule')].map((rule) => ({ keyPath: rule.querySelector('.rule-path').value.trim(), mode: rule.querySelector('.rule-mode').value, expected: rule.querySelector('.rule-expected').value.trim() })) })) };
}
async function loadSettings() {
  const settings = await fetch('/api/settings').then((response) => response.json());
  elements.path.value = settings.requestPath || '';
  elements.scenarios.replaceChildren();
  settings.scenarios.forEach(addScenario);
}
async function saveSettings() { await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settingsFromForm()) }); }
function renderResults(records) {
  if (!records.length) { elements.results.textContent = 'Ожидание трафика…'; return; }
  elements.results.replaceChildren(...records.map((record) => {
    const node = document.createElement('details'); node.className = 'result';
    const matched = record.scenarios.some((scenario) => scenario.matched);
    const summary = document.createElement('summary'); summary.className = matched ? 'match' : 'mismatch';
    summary.textContent = `${matched ? 'Совпало' : 'Нет совпадения'} · ${record.method} · ${record.url}`;
    node.append(summary);
    const content = document.createElement('div');
    record.scenarios.forEach((scenario) => { const item = document.createElement('p'); item.textContent = `${scenario.name}: ${scenario.matched ? 'совпало' : 'не совпало'} — ${scenario.checks.map((check) => `${check.keyPath}: ${check.actual.join(', ') || 'нет значения'}`).join('; ')}`; content.append(item); });
    const body = document.createElement('pre'); body.textContent = JSON.stringify(record.body, null, 2); content.append(body); node.append(content); return node;
  }));
}
async function poll() {
  try { const data = await fetch('/api/results').then((response) => response.json()); renderResults(data.results); elements.connection.textContent = 'Сервер подключён'; elements.connection.className = 'online'; }
  catch { elements.connection.textContent = 'Сервер недоступен'; elements.connection.className = 'offline'; }
}
document.querySelector('#addScenario').onclick = () => addScenario();
document.querySelector('#saveSettings').onclick = saveSettings;
document.querySelector('#clearResults').onclick = async () => { await fetch('/api/results', { method: 'DELETE' }); await poll(); };
loadSettings().then(poll); setInterval(poll, 1000);
