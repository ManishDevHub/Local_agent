import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs/promises';
import { config } from './config.js';
import { httpError, safePath } from './sandbox.js';

let browser = null;
let context = null;
let page = null;
let lastUsed = 0;
const IDLE_MS = 5 * 60 * 1000;
setInterval(() => { if (browser && Date.now() - lastUsed > IDLE_MS) closeBrowser().catch(() => {}); }, 30_000).unref();

/** Only http(s). If BROWSER_ALLOWED_DOMAINS is set, hostname must match one (or be a subdomain). */
export function checkUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw httpError(400, 'Invalid URL'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw httpError(400, 'Only http(s) URLs are allowed');
  const allowed = config.browserAllowedDomains;
  if (allowed.length && !allowed.some(d => u.hostname === d || u.hostname.endsWith('.' + d))) {
    throw httpError(403, `Domain not allowed: ${u.hostname}`);
  }
  return u.toString();
}

async function ensurePage() {
  lastUsed = Date.now();
  if (page && !page.isClosed()) return page;
  try {
    browser ??= await chromium.launch({ headless: config.browserHeadless });
  } catch (e) {
    throw httpError(500, `Could not launch Chromium (${e.message.split('\n')[0]}). Run: npx playwright install chromium`);
  }
  context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  context.setDefaultTimeout(10_000);
  // Re-check every top-level navigation (redirects, link clicks) against the domain policy.
  await context.route('**/*', route => {
    const req = route.request();
    if (req.isNavigationRequest()) { try { checkUrl(req.url()); } catch { return route.abort('blockedbyclient'); } }
    return route.continue();
  });
  page = await context.newPage();
  return page;
}

export async function closeBrowser() {
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  browser = context = page = null;
}

const summary = async p => ({ url: p.url(), title: await p.title() });

export async function open(url) {
  const p = await ensurePage();
  await p.goto(checkUrl(url), { waitUntil: 'domcontentloaded', timeout: 20_000 });
  return summary(p);
}

/** Compact, LLM-friendly view: visible text + interactive elements with stable selectors. */
export async function inspect() {
  const p = await ensurePage();
  const elements = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('a[href],button,input,select,textarea,[role=button]').forEach((el, i) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const sel = el.id ? `#${CSS.escape(el.id)}` : el.name ? `${el.tagName.toLowerCase()}[name="${el.name}"]` : null;
      out.push({
        selector: sel,
        tag: el.tagName.toLowerCase(),
        type: el.type || undefined,
        label: (el.labels?.[0]?.innerText || el.getAttribute('aria-label') || el.placeholder || el.innerText || el.value || '').trim().slice(0, 80),
        text_hint: sel ? undefined : `use text="${(el.innerText || '').trim().slice(0, 40)}"`,
      });
    });
    return out.slice(0, 80);
  });
  const text = (await p.innerText('body').catch(() => '')).slice(0, 4000);
  return { ...(await summary(p)), text, elements };
}

export async function click(target) {
  const p = await ensurePage();
  await p.locator(target).first().click();
  await p.waitForLoadState('domcontentloaded').catch(() => {});
  return summary(p);
}

export async function fill(target, value) {
  const p = await ensurePage();
  await p.locator(target).first().fill(String(value));
  return { filled: target };
}

export async function select(target, value) {
  const p = await ensurePage();
  await p.locator(target).first().selectOption(String(value));
  return { selected: target, value };
}

export async function press(key) {
  const p = await ensurePage();
  await p.keyboard.press(key);
  return summary(p);
}

export async function screenshot(name = 'screenshot.png') {
  const p = await ensurePage();
  if (!/\.png$/i.test(name)) name += '.png';
  const abs = await safePath(path.join('screenshots', name));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await p.screenshot({ path: abs });
  return { saved: path.relative(config.workspace, abs) };
}
