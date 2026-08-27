#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 8787);
const webRoot = path.join(__dirname, 'web');
const state = {
  settings: { requestPath: '', scenarios: [{ name: 'Сценарий 1', rules: [{ keyPath: 'event', mode: 'strict', expected: 'auth_click' }] }] },
  results: [],
};

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) reject(new Error('Размер запроса превышает 10 МБ.'));
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function entriesFrom(payload) {
  if (Array.isArray(payload?.entries)) return payload.entries;
  if (Array.isArray(payload?.log?.entries)) return payload.log.entries;
  if (Array.isArray(payload)) return payload;
  return [payload];
}

function getValuesByPath(source, keyPath) {
  return keyPath.split('.').reduce((values, key) => values.flatMap((value) => {
    if (Array.isArray(value)) return value.map((item) => item?.[key]).filter((item) => item !== undefined);
    const next = value?.[key];
    return next === undefined ? [] : [next];
  }), [source]).flatMap((value) => Array.isArray(value) ? value : [value]);
}

function asComparable(value) {
  return value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
}

function evaluateRule(rule, body) {
  const actual = getValuesByPath(body, rule.keyPath).map(asComparable);
  const expected = String(rule.expected || '').split(',').map((group) => group.split('|').map((item) => item.trim()).filter(Boolean)).filter(Boolean);
  const expectedFlat = expected.flat();
  const matched = rule.mode === 'exists'
    ? actual.some((value) => value.trim() !== '')
    : rule.mode === 'loose'
      ? actual.some((value) => expectedFlat.includes(value))
      : actual.length > 0 && actual.every((value) => expectedFlat.includes(value));
  return { keyPath: rule.keyPath, mode: rule.mode, expected: expectedFlat, actual, matched };
}

function evaluateEntry(entry) {
  const request = entry?.request || entry;
  const url = request?.url;
  const rawBody = request?.postData?.text ?? request?.body ?? entry?.requestBody;
  let body;
  try { body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody; } catch { return null; }
  if (!url || !body || (state.settings.requestPath && !url.includes(state.settings.requestPath))) return null;

  const scenarios = state.settings.scenarios.map((scenario) => {
    const rules = (scenario.rules || []).filter((rule) => rule.keyPath && (rule.expected || rule.mode === 'exists'));
    const checks = rules.map((rule) => evaluateRule(rule, body));
    return { name: scenario.name || 'Сценарий', checks, matched: checks.length > 0 && checks.every((check) => check.matched) };
  }).filter((scenario) => scenario.checks.length);
  return { id: crypto.randomUUID(), at: new Date().toISOString(), url, method: request.method || 'REQUEST', status: Number(entry?.response?.status ?? entry?.status ?? 0), body, scenarios };
}

function serveAsset(request, response) {
  const assetName = request.url === '/' ? 'index.html' : request.url.slice(1);
  if (!['index.html', 'app.js', 'styles.css'].includes(assetName)) return sendJson(response, 404, { error: 'Не найдено.' });
  const contentType = assetName.endsWith('.js') ? 'text/javascript; charset=utf-8' : assetName.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8';
  response.writeHead(200, { 'Content-Type': contentType });
  response.end(fs.readFileSync(path.join(webRoot, assetName)));
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') return sendJson(response, 204, {});
  if (request.method === 'GET' && (request.url === '/' || request.url === '/app.js' || request.url === '/styles.css')) return serveAsset(request, response);
  if (request.method === 'GET' && request.url === '/health') return sendJson(response, 200, { ok: true, results: state.results.length });
  if (request.method === 'GET' && request.url === '/api/settings') return sendJson(response, 200, state.settings);
  if (request.method === 'PUT' && request.url === '/api/settings') {
    try {
      const settings = JSON.parse(await readBody(request));
      state.settings = { requestPath: String(settings.requestPath || ''), scenarios: Array.isArray(settings.scenarios) ? settings.scenarios : [] };
      return sendJson(response, 200, state.settings);
    } catch (error) { return sendJson(response, 400, { error: error.message }); }
  }
  if (request.method === 'GET' && request.url === '/api/results') return sendJson(response, 200, { results: state.results });
  if (request.method === 'DELETE' && request.url === '/api/results') { state.results = []; return sendJson(response, 204, {}); }
  if (request.method === 'POST' && request.url === '/api/captures') {
    try {
      const records = entriesFrom(JSON.parse(await readBody(request))).map(evaluateEntry).filter(Boolean);
      state.results = [...records, ...state.results].slice(0, 300);
      return sendJson(response, 202, { ok: true, accepted: records.length });
    } catch (error) { return sendJson(response, 400, { ok: false, error: error.message || 'Некорректный JSON.' }); }
  }
  return sendJson(response, 404, { error: 'Не найдено.' });
});

server.listen(port, host, () => console.log(`Mobile Traffic Check: http://${host}:${port}`));
