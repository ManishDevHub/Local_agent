import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { config } from './config.js';
import { safePath, httpError, rel } from './sandbox.js';

/** Split a command line into argv. Supports quotes; NO shell is ever involved. */
export function tokenize(line) {
  const out = []; let cur = ''; let q = null; let has = false;
  for (const ch of line) {
    if (q) { if (ch === q) q = null; else cur += ch; }
    else if (ch === '"' || ch === "'") { q = ch; has = true; }
    else if (/\s/.test(ch)) { if (cur || has) { out.push(cur); cur = ''; has = false; } }
    else cur += ch;
  }
  if (q) throw httpError(400, 'Unterminated quote');
  if (cur || has) out.push(cur);
  return out;
}

const pending = new Map(); // id -> { command, cwd, createdAt }

function execute(argv, cwd) {
  return new Promise(resolve => {
    const started = Date.now();
    let stdout = '', stderr = '', truncated = false, timedOut = false;
    const child = spawn(argv[0], argv.slice(1), { cwd, shell: false, env: { ...process.env } });
    const cap = (cur, chunk) => {
      if (cur.length + chunk.length > config.maxOutputBytes) { truncated = true; return cur; }
      return cur + chunk;
    };
    child.stdout.on('data', d => (stdout = cap(stdout, d.toString())));
    child.stderr.on('data', d => (stderr = cap(stderr, d.toString())));
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, config.timeoutMs);
    child.on('error', err => { clearTimeout(timer); resolve({ status: 'error', error: err.message }); });
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ status: 'completed', exitCode: code, stdout, stderr, truncated, timedOut, durationMs: Date.now() - started });
    });
  });
}

/** Run a command if its program is on the auto-approve list; otherwise queue it for approval. */
export async function runCommand(command, cwdRel = '.') {
  const argv = tokenize(command);
  if (!argv.length) throw httpError(400, 'Empty command');
  const cwd = await safePath(cwdRel);
  const program = argv[0];
  if (program.includes('/') || program.includes('\\')) throw httpError(400, 'Use a bare program name, not a path');

  if (config.autoApprove.has(program)) return { ...(await execute(argv, cwd)), command, cwd: rel(cwd) };

  const id = crypto.randomUUID();
  pending.set(id, { command, argv, cwd, createdAt: Date.now() });
  return { status: 'approval_required', approvalId: id, command, message: `"${program}" is not auto-approved. POST /approvals/${id}/approve to run it.` };
}

export const listPending = () => [...pending].map(([id, p]) => ({ id, command: p.command, createdAt: p.createdAt }));

export async function approve(id) {
  const p = pending.get(id);
  if (!p) throw httpError(404, 'No such pending approval');
  pending.delete(id);
  return { ...(await execute(p.argv, p.cwd)), command: p.command, cwd: rel(p.cwd) };
}

export function deny(id) {
  if (!pending.delete(id)) throw httpError(404, 'No such pending approval');
  return { status: 'denied' };
}
