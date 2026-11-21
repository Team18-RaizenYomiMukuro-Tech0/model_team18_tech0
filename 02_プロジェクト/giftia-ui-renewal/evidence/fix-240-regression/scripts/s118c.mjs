import fs from 'fs';
import { open, go, sleep } from './lib.mjs';
fs.writeFileSync(process.env.KZ + '/gen_mode', JSON.stringify({ dataset: 'fd9' }));
const out = {};
const P = '/search?category=' + encodeURIComponent('生活雑貨');
const Q = `(li, sel) => sel.startsWith('text:') ? [...li.querySelectorAll('button')].find((b) => b.innerText.includes(sel.slice(5))) : li.querySelector(sel)`;
const cardJS = `(i) => [...document.querySelectorAll('li')].filter((l) => /カートに入れる/.test(l.innerText))[i]`;
for (const w of [375, 1280]) {
  const o = (out['w' + w] = {});
  const { b, p } = await open({ w, h: 900 });
  const act = async (i, sel, mode) => {
    await go(p, P, 3500);
    const r = await p.evaluate((cj, i, sel, q) => { const li = eval(cj)(i); const e = eval(q)(li, sel); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: Math.round(r.width), h: Math.round(r.height) }; }, cardJS, i, sel, Q);
    if (mode === 'click') await p.mouse.click(r.x, r.y);
    else { await p.evaluate((cj, i, sel, q) => eval(q)(eval(cj)(i), sel).focus(), cardJS, i, sel, Q); await p.keyboard.press('Enter'); }
    await sleep(900);
    const s = await p.evaluate((cj, i, sel, q) => ({ product: new URL(location.href).searchParams.get('product'), pressed: eval(cj)(i).querySelector('button[aria-label*="お気に入り"]')?.getAttribute('aria-pressed'), cartText: eval(q)(eval(cj)(i), 'text:カート')?.innerText.replace(/\s+/g,' '), toast: (document.body.innerText.match(/カートに入れました[^\n]*/) || [''])[0].slice(0, 30), cartBand: (document.body.innerText.match(/カート[^\n]{0,6}点[^\n]*/) || [''])[0] }), cardJS, i, sel, Q);
    return { size: r.w + 'x' + r.h, ...s };
  };
  o['①画像'] = await act(0, 'a[aria-hidden=true]', 'click');
  o['②商品名(2枚目)'] = await act(1, 'a:not([aria-hidden=true])', 'click');
  o['③ハート'] = await act(2, 'button[aria-label*="お気に入り"]', 'click');
  o['④カート'] = await act(3, 'text:カートに入れる', 'click');
  o['⑤Enter商品名'] = await act(0, 'a:not([aria-hidden=true])', 'enter');
  o['⑤Enterハート'] = await act(1, 'button[aria-label*="お気に入り"]', 'enter');
  o['⑤Enterカート'] = await act(2, 'text:カートに入れる', 'enter');
  await b.close();
}
for (const [k, v] of Object.entries(out)) { console.log(k); for (const [a, b] of Object.entries(v)) console.log('  ', a, JSON.stringify(b)); }
