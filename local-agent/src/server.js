import express from 'express';
import crypto from 'node:crypto';
import { config } from './config.js';
import * as fsx from './sandbox.js';
import { runCommand, approve, deny, listPending } from './commands.js';
import { runAgent } from './agent.js';
import * as browser from './browser.js';
import { openApp, matchOpenCommand, knownApps } from './apps.js';
import { voicePageHtml } from './voice-page.js';
import { demoFormHtml } from './demo-form.js';

if (config.token.length < 16) {
  console.error('Refusing to start: set AGENT_TOKEN (16+ chars) in .env');
  process.exit(1);
}

export const app = express();
app.use(express.json({ limit: '2mb' }));

// Public test page for browser demos (harmless, static, no side effects)
app.get('/demo/form', (_req, res) => res.type('html').send(demoFormHtml));
app.post('/demo/form', express.urlencoded({ extended: false }), (req, res) =>
  res.type('html').send(`<h1 id="result">Submitted</h1><pre id="data">${JSON.stringify(req.body).replace(/</g, '&lt;')}</pre>`));

// Voice UI shell (static; every API call it makes still needs the bearer token)
app.get('/voice', (_req, res) => res.type('html').send(voicePageHtml));

// Bearer-token auth on everything
app.use((req, res, next) => {
  const given = Buffer.from((req.headers.authorization || '').replace(/^Bearer /, ''));
  const want = Buffer.from(config.token);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

const h = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

app.get('/health', (_req, res) => res.json({ ok: true, workspace: config.workspace, agentEnabled: !!config.anthropicKey }));

app.get('/files', h(async (req, res) => res.json({ path: req.query.path || '.', entries: await fsx.listDir(req.query.path || '.') })));
app.get('/files/read', h(async (req, res) => res.json({ path: req.query.path, content: await fsx.readFile(req.query.path) })));
app.post('/files', h(async (req, res) => {
  const { path, type = 'file', content = '' } = req.body;
  const created = type === 'dir' ? await fsx.makeDir(path) : await fsx.writeFile(path, content);
  res.status(201).json({ created, type });
}));

app.post('/run', h(async (req, res) => {
  const { command, cwd = '.' } = req.body;
  const result = await runCommand(command, cwd);
  res.status(result.status === 'approval_required' ? 202 : 200).json(result);
}));
app.get('/approvals', (_req, res) => res.json({ pending: listPending() }));
app.post('/approvals/:id/approve', h(async (req, res) => res.json(await approve(req.params.id))));
app.post('/approvals/:id/deny', (req, res) => res.json(deny(req.params.id)));

// Browser control (Phase 2)
app.post('/browser/open', h(async (req, res) => res.json(await browser.open(req.body.url))));
app.get('/browser/inspect', h(async (_req, res) => res.json(await browser.inspect())));
app.post('/browser/click', h(async (req, res) => res.json(await browser.click(req.body.target))));
app.post('/browser/fill', h(async (req, res) => res.json(await browser.fill(req.body.target, req.body.value))));
app.post('/browser/select', h(async (req, res) => res.json(await browser.select(req.body.target, req.body.value))));
app.post('/browser/press', h(async (req, res) => res.json(await browser.press(req.body.key))));
app.post('/browser/screenshot', h(async (req, res) => res.json(await browser.screenshot(req.body?.name))));
app.post('/browser/close', h(async (_req, res) => { await browser.closeBrowser(); res.json({ closed: true }); }));

// Natural-language instructions (needs ANTHROPIC_API_KEY)
const abortOnDisconnect = res => {
  const ac = new AbortController();
  res.on('close', () => { if (!res.writableFinished) ac.abort(); });
  return ac.signal;
};
app.post('/agent', h(async (req, res) => res.json(await runAgent(req.body.instruction, { signal: abortOnDisconnect(res) }))));

// Desktop apps + voice (Phase 3)
app.get('/apps', (_req, res) => res.json({ apps: knownApps() }));
app.post('/apps/open', h(async (req, res) => res.json(await openApp(req.body.name))));
app.post('/voice/command', h(async (req, res) => {
  const text = String(req.body.text || '').trim().slice(0, 500);
  if (!text) return res.json({ reply: 'I did not catch that.' });
  const signal = abortOnDisconnect(res);          // browser aborting the fetch = "stop"
  const appKey = matchOpenCommand(text);          // fast path: no LLM needed for "open chrome"
  if (appKey) { await openApp(appKey); return res.json({ reply: 'Opening ' + appKey + '.' }); }
  if (!config.anthropicKey) return res.json({ reply: 'I can open apps without an API key, but I need one for anything else.' });
  const out = await runAgent(text, { signal });
  res.json({ reply: out.reply, trace: out.trace });
}));

app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.message }));

if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  // Bind to loopback only: nothing on your network can reach it.
  app.listen(config.port, '127.0.0.1', () => console.log(`Agent listening on http://127.0.0.1:${config.port}  workspace=${config.workspace}`));
}
