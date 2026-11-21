import fs from 'fs';
import { open, go, sleep } from './lib.mjs';
const out = {};
const EMO = /[♡👤🛒📦🎀♥]/;
async function page(name, ds, path, w, h) {
  fs.writeFileSync(process.env.KZ + '/gen_mode', JSON.stringify({ dataset: ds }));
  const { b, p } = await open({ w, h });
  await go(p, path, 4500);
  const r = await p.evaluate((emo) => {
    const E = new RegExp(emo);
    const R = (e) => getComputedStyle(e).borderTopLeftRadius;
    const vis = (e) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed';
    const btn = [...document.querySelectorAll('button,a')].filter(vis);
    const by = (re) => btn.filter((b) => re.test((b.innerText || '').trim().replace(/\s+/g, ' ')));
    const dim = (e) => { const r = e.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); };
    const o = {};
    o.cart = by(/カートに入れる/).slice(0, 2).map((e) => ({ r: R(e), size: dim(e), card: dim(e.closest('li') || e.parentElement) }));
    o.share = by(/共有リストに入れる/).slice(0, 1).map((e) => ({ r: R(e), size: dim(e) }));
    o.scenes = by(/^(お礼|誕生日|送別|✓ 送別)$/).slice(0, 3).map((e) => ({ t: e.innerText.trim(), r: R(e), size: dim(e) }));
    o.price = by(/円/).filter((e) => /〜/.test(e.innerText)).slice(0, 3).map((e) => ({ t: e.innerText.trim(), r: R(e), top: Math.round(e.getBoundingClientRect().top), size: dim(e) }));
    o.cards = [...document.querySelectorAll('li')].filter((l) => /カートに入れる/.test(l.innerText)).slice(0, 1).map((e) => ({ r: R(e), size: dim(e) }));
    const hdr = document.querySelector('header'); o.header = hdr ? { h: Math.round(hdr.getBoundingClientRect().height), items: [...hdr.querySelectorAll('a,button')].filter(vis).map((e) => ({ t: (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 12), svg: !!e.querySelector('svg'), top: Math.round(e.getBoundingClientRect().top) })) } : null;
    const cur = document.querySelector('[aria-current=page],[aria-current=true]'); o.currentPage = cur ? { t: cur.innerText.trim(), bg: getComputedStyle(cur).backgroundColor, color: getComputedStyle(cur).color, r: R(cur), size: dim(cur) } : null;
    const txt = document.body.innerText + [...document.querySelectorAll('[aria-label],[title],[alt]')].map((e) => e.getAttribute('aria-label') + (e.title || '') + (e.alt || '')).join('');
    o.emoji = (txt.match(new RegExp(emo, 'g')) || []).length;
    o.small = btn.filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.height < 44 || r.width < 44) && !/^\s*$/.test(e.innerText + (e.getAttribute('aria-label') || '')); }).slice(0, 12).map((e) => (e.innerText || e.getAttribute('aria-label')).trim().replace(/\s+/g, ' ').slice(0, 14) + ' ' + dim(e));
    return o;
  }, EMO.source);
  out[name] = r; await b.close();
}
const R01 = '/search?scene=' + encodeURIComponent('送別'), R02 = '/search?category=' + encodeURIComponent('生活雑貨');
for (const w of [375, 480, 481, 1280]) await page('R-02_' + w, 'fd9', R02, w, 900);
for (const w of [375, 1280]) await page('R-01_' + w, 'fd1', R01, w, 900);
for (const w of [375, 1280]) await page('top_' + w, 'fd9', '/', w, 900);
fs.writeFileSync(process.env.KZ + '/nf56.json', JSON.stringify(out, null, 1));
console.log('ok');
