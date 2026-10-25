import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import * as fsx from './sandbox.js';
import { runCommand } from './commands.js';
import * as browser from './browser.js';
import { openApp, knownApps } from './apps.js';

const tools = [
  { name: 'list_files', description: 'List files/folders in a workspace directory.',
    input_schema: { type: 'object', properties: { path: { type: 'string', description: 'Relative path, default "."' } } } },
  { name: 'read_file', description: 'Read a text file from the workspace.',
    input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'make_dir', description: 'Create a folder (recursive).',
    input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'write_file', description: 'Create or overwrite a text file. Parent folders are created.',
    input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
  { name: 'run_command', description: 'Run a command (no shell, e.g. "python3 hello.py") inside the workspace. Non-allowlisted programs need human approval.',
    input_schema: { type: 'object', properties: { command: { type: 'string' }, cwd: { type: 'string' } }, required: ['command'] } },
  { name: 'open_app', description: 'Launch a desktop application. Allowed: ' + knownApps().join(', '),
    input_schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
  { name: 'browser_open', description: 'Open a URL in the browser (http/https only).',
    input_schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
  { name: 'browser_inspect', description: 'See the current page: visible text plus clickable/fillable elements with selectors. Call after every navigation or action.',
    input_schema: { type: 'object', properties: {} } },
  { name: 'browser_click', description: 'Click an element. target is a Playwright selector, e.g. "#submit", "button[name=go]", or text="Sign in".',
    input_schema: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] } },
  { name: 'browser_fill', description: 'Type into an input/textarea (replaces existing value).',
    input_schema: { type: 'object', properties: { target: { type: 'string' }, value: { type: 'string' } }, required: ['target', 'value'] } },
  { name: 'browser_select', description: 'Choose an option in a <select>.',
    input_schema: { type: 'object', properties: { target: { type: 'string' }, value: { type: 'string' } }, required: ['target', 'value'] } },
  { name: 'browser_press', description: 'Press a keyboard key, e.g. Enter, Tab.',
    input_schema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] } },
  { name: 'browser_screenshot', description: 'Save a screenshot into workspace/screenshots.',
    input_schema: { type: 'object', properties: { name: { type: 'string' } } } },
];

async function callTool(name, input) {
  switch (name) {
    case 'list_files': return fsx.listDir(input.path || '.');
    case 'read_file': return fsx.readFile(input.path);
    case 'make_dir': return { created: await fsx.makeDir(input.path) };
    case 'write_file': return { written: await fsx.writeFile(input.path, input.content) };
    case 'run_command': return runCommand(input.command, input.cwd || '.');
    case 'open_app': return openApp(input.name);
    case 'browser_open': return browser.open(input.url);
    case 'browser_inspect': return browser.inspect();
    case 'browser_click': return browser.click(input.target);
    case 'browser_fill': return browser.fill(input.target, input.value);
    case 'browser_select': return browser.select(input.target, input.value);
    case 'browser_press': return browser.press(input.key);
    case 'browser_screenshot': return browser.screenshot(input.name);
    default: throw new Error(`Unknown tool ${name}`);
  }
}

const SYSTEM = `You are a local computer agent working inside a sandboxed workspace folder.
For short spoken requests keep your final reply to one or two plain sentences (it may be read aloud).
Use the tools to complete the user's instruction. Use relative paths only. Run one step at a time, inspect results, and fix errors.
For web tasks: browser_open, then browser_inspect to see selectors, act, and inspect again to verify. Never enter real credentials or payment details; stop and ask the user instead.
If a command returns approval_required, stop and tell the user which approval is pending. When done, summarise what you did and any program output.`;

export async function runAgent(instruction, { maxSteps = 12, signal } = {}) {
  if (!config.anthropicKey) throw fsx.httpError(501, 'Set ANTHROPIC_API_KEY to enable /agent');
  const client = new Anthropic({ apiKey: config.anthropicKey });
  const messages = [{ role: 'user', content: instruction }];
  const trace = [];

  for (let step = 0; step < maxSteps; step++) {
    if (signal?.aborted) return { reply: 'Cancelled.', trace };
    let res;
    try {
      res = await client.messages.create({ model: config.model, max_tokens: 2048, system: SYSTEM, tools, messages }, { signal });
    } catch (e) {
      if (signal?.aborted) return { reply: 'Cancelled.', trace };
      throw e;
    }
    messages.push({ role: 'assistant', content: res.content });
    const calls = res.content.filter(b => b.type === 'tool_use');
    if (!calls.length) {
      return { reply: res.content.filter(b => b.type === 'text').map(b => b.text).join('\n'), trace };
    }
    const results = [];
    for (const c of calls) {
      let out, isError = false;
      try { out = await callTool(c.name, c.input); } catch (e) { out = { error: e.message }; isError = true; }
      trace.push({ tool: c.name, input: c.input, output: out });
      results.push({ type: 'tool_result', tool_use_id: c.id, is_error: isError, content: JSON.stringify(out) });
    }
    messages.push({ role: 'user', content: results });
  }
  return { reply: 'Stopped: step limit reached.', trace };
}
