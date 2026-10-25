import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
process.env.AGENT_TOKEN = 'test-token-0123456789';
process.env.WORKSPACE_DIR = './workspace-test';
process.env.ANTHROPIC_API_KEY = '';
const { matchOpenCommand, resolveApp } = await import('../src/apps.js');
const { app } = await import('../src/server.js');

test('open-command matching', () => {
  assert.equal(matchOpenCommand('Open Chrome'), 'chrome');
  assert.equal(matchOpenCommand('please open the Visual Studio Code.'), 'vscode');
  assert.equal(matchOpenCommand('launch file explorer'), 'files');
  assert.equal(matchOpenCommand('open youtube'), null);
  assert.equal(matchOpenCommand('open chrome; rm -rf /'), null);
  assert.equal(resolveApp('constructor'), null);
});

let server, base;
before(() => new Promise(r => { server = app.listen(0, '127.0.0.1', () => { base = 'http://127.0.0.1:' + server.address().port; r(); }); }));
after(() => server.close());

test('voice page is public, API is not', async () => {
  const page = await fetch(base + '/voice');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Agent Voice/);
  assert.equal((await fetch(base + '/voice/command', { method: 'POST' })).status, 401);
});
test('non-app command without API key degrades gracefully', async () => {
  const r = await fetch(base + '/voice/command', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token-0123456789' },
    body: JSON.stringify({ text: 'do something complicated' }),
  });
  assert.match((await r.json()).reply, /API key/);
});
