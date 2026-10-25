// Fills and submits the built-in test form through the HTTP API.
// Usage: AGENT_TOKEN=... node scripts/demo-form.mjs   (server must be running; set BROWSER_HEADLESS=false to watch)
const U = process.env.AGENT_URL || 'http://127.0.0.1:8787';
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.AGENT_TOKEN}` };
const call = async (path, body) => {
  const r = await fetch(U + path, { method: body ? 'POST' : 'GET', headers: H, body: body && JSON.stringify(body) });
  const j = await r.json(); if (!r.ok) throw new Error(`${path}: ${j.error}`); return j;
};
await call('/browser/open', { url: `${U}/demo/form` });
await call('/browser/fill', { target: '#name', value: 'Manish Kumar' });
await call('/browser/fill', { target: '#email', value: 'test@example.com' });
await call('/browser/select', { target: '#role', value: 'Developer' });
await call('/browser/fill', { target: '#msg', value: 'Hello from my agent' });
await call('/browser/click', { target: '#agree' });
await call('/browser/click', { target: '#submit' });
const page = await call('/browser/inspect');
console.log(page.text);
console.log(await call('/browser/screenshot', { name: 'form-result' }));
await call('/browser/close', {});
