import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.AGENT_TOKEN = 'test-token-0123456789';
process.env.WORKSPACE_DIR = './workspace-test';
const { safePath } = await import('../src/sandbox.js');
const { tokenize, runCommand } = await import('../src/commands.js');

test('blocks path traversal', async () => {
  await assert.rejects(() => safePath('../etc/passwd'), /escapes/);
  await assert.rejects(() => safePath('/etc/passwd'), /escapes/);
});
test('tokenizer handles quotes', () => {
  assert.deepEqual(tokenize('python3 -c "print(1 + 2)"'), ['python3', '-c', 'print(1 + 2)']);
});
test('unlisted command needs approval', async () => {
  const r = await runCommand('rm -rf x');
  assert.equal(r.status, 'approval_required');
});
test('shell metacharacters are not interpreted', async () => {
  const r = await runCommand('echo hi; echo pwned');
  assert.equal(r.stdout.trim(), 'hi; echo pwned');
});
