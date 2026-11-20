import fs from 'fs';
import { open, go, sleep } from './lib.mjs';
const MODE = process.env.KZ + '/gen_mode';
const out = {};
const label = `(e) => (e.getAttribute('aria-label') || e.innerText || e.tagName).trim().replace(/\\s+/g,' ').slice(0,28)`;
async function run(name, ds, path, w, h) {
  fs.writeFileSync(MODE, JSON.stringify({ dataset: ds }));
  const { b, p } = await open({ w, h });
  await go(p, path, 4500);
  // 1 枚目のカードの li と、その直前の tab 可能要素
  const info = await p.evaluate((lab) => {
    const L = eval(lab);
    const tabbable = [...document.querySelectorAll('a[href],button,input,select,[tabindex]')].filter((e) => e.tabIndex >= 0 && !e.disabled && e.offsetParent !== null);
    const li = [...document.querySelectorAll('li')].find((l) => l.querySelector('button[aria-label*="カートに入れる"]') || /カートに入れる/.test(l.innerText));
    if (!li) return { err: 'no card' };
    const inCard = tabbable.filter((e) => li.contains(e));
    const first = inCard[0];
    const idx = tabbable.indexOf(first);
    const before = tabbable[idx - 1];
    before.focus();
    return { domOrder: inCard.map(L), before: L(before), liImgLinks: [...li.querySelectorAll('a')].map((a) => ({ label: L(a), tab: a.tabIndex, hidden: a.getAttribute('aria-hidden') })) };
  }, label);
  if (info.err) { out[name] = info; await b.close(); return; }
  const seq = [];
  for (let i = 0; i < info.domOrder.length; i++) { await p.keyboard.press('Tab'); seq.push(await p.evaluate((lab) => eval(lab)(document.activeElement), label)); }
  out[name] = { w, domOrder: info.domOrder, tabSeq: seq, imageLinks: info.liImgLinks };
  await b.close();
}
for (const w of [375, 1280]) {
  await run('R-02_' + w, 'fd9', '/search?category=' + encodeURIComponent('生活雑貨'), w, 900);
  await run('R-01_' + w, 'fd1', '/search?scene=' + encodeURIComponent('送別'), w, 900);
  await run('top_' + w, 'fd9', '/', w, 900);
}
console.log(JSON.stringify(out, null, 1));
