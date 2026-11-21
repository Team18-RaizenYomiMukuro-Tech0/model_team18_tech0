import fs from 'fs';
import { open, go, sleep } from './lib.mjs';
const out = {};
async function scenario(name, ds, path, w, h, shot) {
  fs.writeFileSync(process.env.KZ + '/gen_mode', JSON.stringify({ dataset: ds }));
  const { b, p } = await open({ w, h });
  await go(p, path, 4500);
  const clickText = async (txt, idx = 0) => { const r = await p.evaluate((t, idx) => { const bs = [...document.querySelectorAll('button')].filter((b) => b.innerText.includes(t) && b.offsetParent !== null); const e = bs[idx]; if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, txt, idx); if (r) await p.mouse.click(r.x, r.y); await sleep(400); return !!r; };
  const o = { w, h };
  o.click1 = await clickText('共有リストに入れる');
  o.click2 = await clickText('カートに入れる', 1);
  await sleep(300);
  o.measure = await p.evaluate(() => {
    const t = [...document.querySelectorAll('[role=status],[role=alert],[aria-live]')].find((e) => /カートに入れました/.test(e.innerText) && e.offsetParent !== null) || [...document.querySelectorAll('div')].reverse().find((e) => e.children.length < 6 && /^カートに入れました/.test(e.innerText.trim()) && getComputedStyle(e).position === 'fixed');
    const vh = innerHeight; const res = { vh };
    if (t) { const r = t.getBoundingClientRect(); res.toast = { text: t.innerText.trim().slice(0, 20), bottomGap: Math.round((vh - r.bottom) * 10) / 10, top: Math.round(r.top), h: Math.round(r.height) }; }
    const bands = [...document.querySelectorAll('button')].filter((b) => /^(共有リスト|カート)(\s|（|\d|$)/.test(b.innerText.trim().replace(/\s+/g, ' ')) && b.getBoundingClientRect().top > vh - 140 && b.getBoundingClientRect().height > 0);
    res.band = bands.map((bt) => { const r = bt.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { text: bt.innerText.trim().replace(/\s+/g, ' ').slice(0, 14), top: Math.round(r.top), h: Math.round(r.height), reachable: bt.contains(top) || top === bt }; });
    return res;
  });
  if (shot) await p.screenshot({ path: shot });
  out[name] = o; await b.close();
}
const E = process.env.EV;
await scenario('R-01_375', 'fd1', '/search?scene=' + encodeURIComponent('送別'), 375, 812, E + '/S-108_375_R-01_通知72px.png');
await scenario('R-02_375', 'fd9', '/search?category=' + encodeURIComponent('生活雑貨'), 375, 812);
await scenario('top_375', 'fd9', '/', 375, 812);
await scenario('R-01_898', 'fd1', '/search?scene=' + encodeURIComponent('送別'), 898, 800);
await scenario('R-01_1280', 'fd1', '/search?scene=' + encodeURIComponent('送別'), 1280, 800);
console.log(JSON.stringify(out, null, 1));
