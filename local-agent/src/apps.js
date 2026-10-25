import { spawn } from 'node:child_process';
import { httpError } from './sandbox.js';

// Only apps listed here can be launched. Names map to fixed argv per OS; user text never reaches a shell.
const win = (...a) => ['cmd', '/c', 'start', '', ...a];
const mac = name => ['open', '-a', name];
const APPS = {
  chrome:     { win32: win('chrome'),   darwin: mac('Google Chrome'),      linux: ['google-chrome'] },
  firefox:    { win32: win('firefox'),  darwin: mac('Firefox'),            linux: ['firefox'] },
  edge:       { win32: win('msedge'),   darwin: mac('Microsoft Edge'),     linux: ['microsoft-edge'] },
  vscode:     { win32: win('code'),     darwin: mac('Visual Studio Code'), linux: ['code'] },
  terminal:   { win32: win('cmd'),      darwin: mac('Terminal'),           linux: ['x-terminal-emulator'] },
  calculator: { win32: win('calc'),     darwin: mac('Calculator'),         linux: ['gnome-calculator'] },
  notepad:    { win32: win('notepad'),  darwin: mac('TextEdit'),           linux: ['gedit'] },
  files:      { win32: win('explorer'), darwin: mac('Finder'),             linux: ['xdg-open', '.'] },
};
const ALIASES = {
  'google chrome': 'chrome', 'visual studio code': 'vscode', 'vs code': 'vscode', code: 'vscode',
  'command prompt': 'terminal', console: 'terminal', 'text editor': 'notepad', textedit: 'notepad',
  'file explorer': 'files', explorer: 'files', finder: 'files', 'microsoft edge': 'edge',
};

export const knownApps = () => Object.keys(APPS);

export function resolveApp(name) {
  const n = String(name || '').toLowerCase().trim().replace(/^the\s+/, '').replace(/\s+(app|application)$/, '');
  const key = ALIASES[n] || n;
  return Object.hasOwn(APPS, key) ? key : null;
}

/** "Open Chrome." -> "chrome";  "open youtube" -> null (let the agent handle it) */
export function matchOpenCommand(text) {
  const m = /^(?:please\s+)?(?:open|launch|start)\s+(.+?)[.!?]*$/i.exec(String(text || '').trim());
  return m ? resolveApp(m[1]) : null;
}

export function openApp(name) {
  const key = resolveApp(name);
  if (!key) throw httpError(400, `Unknown app "${name}". Known: ${knownApps().join(', ')}`);
  const argv = APPS[key][process.platform];
  if (!argv) throw httpError(501, `${key} is not supported on ${process.platform}`);
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), { detached: true, stdio: 'ignore' });
    child.once('error', e => reject(httpError(500, `Could not launch ${key}: ${e.message}`)));
    child.once('spawn', () => { child.unref(); resolve({ opened: key }); });
  });
}
