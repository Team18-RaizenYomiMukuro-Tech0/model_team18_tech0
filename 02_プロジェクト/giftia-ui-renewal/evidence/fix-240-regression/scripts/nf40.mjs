import fs from 'fs';
import { open, go, sleep } from './lib.mjs';
const out = {};
const measure = () => {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const over = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  const bgOf = (e) => { const stack = []; for (let n = e; n; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.backgroundImage !== 'none') return null; const c = parse(cs.backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a === 1) break; } } let base = { r: 255, g: 255, b: 255, a: 1 }; for (const c of stack.reverse()) base = over(c, base); return base; };
  const res = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const t = walker.currentNode; if (!t.textContent.trim()) continue; const e = t.parentElement; if (seen.has(e)) continue; seen.add(e);
    const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || e.getBoundingClientRect().width === 0) continue;
    if (e.closest('script,style,noscript')) continue;
    const bg = bgOf(e); if (!bg) { res.push({ t: t.textContent.trim().slice(0, 14), skip: 'gradient/image' }); continue; }
    let fg = parse(cs.color); fg = over({ ...fg, a: fg.a * parseFloat(cs.opacity) }, bg);
    const L1 = lum(fg), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const px = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 700; const large = px >= 24 || (px >= 18.66 && bold);
    res.push({ t: t.textContent.trim().slice(0, 14), ratio: Math.round(ratio * 100) / 100, need: large ? 3 : 4.5, px, fg: cs.color, bg: `rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})` });
  }
  return res;
};
async function pg(name, ds, path, w, h, act) {
  fs.writeFileSync(process.env.KZ + '/gen_mode', JSON.stringify({ dataset: ds }));
  const { b, p } = await open({ w, h }); await go(p, path, 4500);
  if (act) await act(p);
  const r = await p.evaluate(measure);
  const checked = r.filter((x) => x.ratio); const bad = checked.filter((x) => x.ratio < x.need);
  out[name] = { n: checked.length, skipped: r.filter((x) => x.skip).length, min: Math.min(...checked.map((x) => x.ratio)), bad: bad.slice(0, 8) };
  await b.close();
}
const click = (txt) => async (p) => { const r = await p.evaluate((t) => { const e = [...document.querySelectorAll('button')].find((b) => b.innerText.includes(t) && b.offsetParent); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, txt); await p.mouse.click(r.x, r.y); await sleep(1500); };
const SH = process.env.SHARE;
for (const w of [375, 1280]) {
  await pg('top_' + w, 'fd9', '/', w, 900);
  await pg('R-01_' + w, 'fd1', '/search?scene=' + encodeURIComponent('送別'), w, 900);
  await pg('R-02_' + w, 'fd9', '/search?category=' + encodeURIComponent('生活雑貨'), w, 900);
  await pg('share_' + w, 'fd1', SH, w, 900);
  await pg('share_missing_' + w, 'fd1', '/s/AAAAAAAAAAAAAAAAAAAAAA', w, 900);
}
await pg('R-01_375_toast', 'fd1', '/search?scene=' + encodeURIComponent('送別'), 375, 812, click('カートに入れる'));
fs.writeFileSync(process.env.KZ + '/nf40.json', JSON.stringify(out, null, 1));
for (const [k, v] of Object.entries(out)) console.log(k, 'n=' + v.n, 'skip=' + v.skipped, 'min=' + v.min, 'bad=' + v.bad.length, JSON.stringify(v.bad.slice(0, 3)));
