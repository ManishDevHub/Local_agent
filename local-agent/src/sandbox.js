import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

/** Resolve a user-supplied path inside the workspace, or throw. Blocks ../ and symlink escapes. */
export async function safePath(rel = '.') {
  if (typeof rel !== 'string' || rel.includes('\0')) throw httpError(400, 'Invalid path');
  const root = await fs.realpath(config.workspace);
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw httpError(403, 'Path escapes workspace');

  // Resolve symlinks on the deepest existing ancestor and re-check.
  let probe = abs;
  while (true) {
    try {
      const real = await fs.realpath(probe);
      if (real !== root && !real.startsWith(root + path.sep)) throw httpError(403, 'Symlink escapes workspace');
      break;
    } catch (e) {
      if (e.status) throw e;
      const parent = path.dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }
  }
  return abs;
}

export const rel = abs => path.relative(config.workspace, abs) || '.';

export async function listDir(relPath = '.') {
  const abs = await safePath(relPath);
  const entries = await fs.readdir(abs, { withFileTypes: true });
  return entries.map(e => ({ name: e.name, type: e.isDirectory() ? 'dir' : 'file' }));
}

export async function readFile(relPath) {
  const abs = await safePath(relPath);
  const stat = await fs.stat(abs);
  if (stat.size > config.maxFileBytes) throw httpError(413, 'File too large');
  return fs.readFile(abs, 'utf8');
}

export async function writeFile(relPath, content = '') {
  if (Buffer.byteLength(content) > config.maxFileBytes) throw httpError(413, 'Content too large');
  const abs = await safePath(relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, 'utf8');
  return rel(abs);
}

export async function makeDir(relPath) {
  const abs = await safePath(relPath);
  await fs.mkdir(abs, { recursive: true });
  return rel(abs);
}

export function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
