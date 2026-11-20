import puppeteer from 'puppeteer-core';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const B = 'http://localhost:3100';
export async function open({ w = 375, h = 812 } = {}) {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500 });
  p.errors = []; p.setDefaultTimeout(15000);
  p.on('pageerror', (e) => p.errors.push(String(e).slice(0, 120)));
  return { b, p };
}
export async function go(p, path, wait = 3500) { await p.goto(B + path, { waitUntil: 'domcontentloaded' }); await sleep(wait); }
import fs from 'fs';
export const ds = (name) => fs.writeFileSync(process.env.KZ + '/gen_mode', JSON.stringify({ dataset: name }));
export const enc = encodeURIComponent;
export const body = (p) => p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
// 表示中のボタン・リンクを文字で探して本物のマウスで押す。re は RegExp（innerText を空白 1 つに整えたもの）
export async function click(p, re, { idx = 0, scope = null, nth = null } = {}) {
  const pos = await p.evaluate((src, idx, scope) => {
    const R = new RegExp(src);
    const root = scope ? document.querySelector(scope) || document : document;
    const els = [...root.querySelectorAll('button,a,[role=button],summary')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && (R.test((e.innerText || '').replace(/\s+/g, ' ').trim().replace(/^✓ /, '')) || R.test((e.getAttribute('aria-label') || '').trim())); });
    const e = els[idx]; if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, n: els.length };
  }, re.source, idx, scope);
  if (!pos) return false; await p.mouse.click(pos.x, pos.y); await sleep(700); return true;
}
export const total = async (p) => { const t = await body(p); const m = t.match(/全\s*(\d+)\s*件中\s*(\d+)\s*[〜~]\s*(\d+)\s*件/); return m ? { n: +m[1], a: +m[2], b: +m[3] } : null; };
export const cards = (p) => p.evaluate(() => [...document.querySelectorAll('li')].filter((l) => /カートに入れる/.test(l.innerText)).length);
export const storage = (p, k) => p.evaluate((k) => localStorage.getItem(k), k);
