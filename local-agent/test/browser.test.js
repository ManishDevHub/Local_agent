import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.AGENT_TOKEN = 'test-token-0123456789';
process.env.WORKSPACE_DIR = './workspace-test';
process.env.BROWSER_ALLOWED_DOMAINS = '127.0.0.1,example.com';
const { checkUrl } = await import('../src/browser.js');

test('rejects non-http schemes', () => {
  assert.throws(() => checkUrl('file:///etc/passwd'), /http/);
  assert.throws(() => checkUrl('javascript:alert(1)'), /http/);
});
test('domain allowlist incl. subdomains', () => {
  assert.ok(checkUrl('https://example.com/a'));
  assert.ok(checkUrl('https://www.example.com'));
  assert.throws(() => checkUrl('https://evil-example.com'), /not allowed/);
  assert.throws(() => checkUrl('https://example.com.evil.io'), /not allowed/);
});
