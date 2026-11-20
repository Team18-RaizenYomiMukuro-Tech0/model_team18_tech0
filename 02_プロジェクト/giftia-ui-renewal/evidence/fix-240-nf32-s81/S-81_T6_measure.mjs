import fs from 'fs';
import { open, go } from './lib.mjs';
const out = {};
async function page(name, ds, path, w) {
  fs.writeFileSync(process.env.KZ + '/gen_mode', JSON.stringify({ dataset: ds }));
  const { b, p } = await open({ w, h: 900 });
  await go(p, path, 4500);
  out[name] = await p.evaluate(() => {
    const li = [...document.querySelectorAll('li')].filter((l) => /カートに入れる/.test(l.innerText)).slice(0, 2);
    return li.map((l) => {
      const leaves = [...l.querySelectorAll('*')].filter((e) => e.children.length === 0 && e.innerText && e.innerText.trim());
      return leaves.map((e) => { const c = getComputedStyle(e); return { t: e.innerText.trim().slice(0, 24), tag: e.tagName, px: c.fontSize, w: c.fontWeight, color: c.color }; });
    });
  });
  await b.close();
}
await page('top_1280', 'fd1', '/', 1280); await page('top_375', 'fd1', '/', 375);
await page('search_1280', 'fd1', '/search?scene=' + encodeURIComponent('送別'), 1280);
await page('search_375', 'fd9', '/search?category=' + encodeURIComponent('生活雑貨'), 375);
fs.writeFileSync(process.env.KZ + '/s81_t6.json', JSON.stringify(out, null, 1)); console.log('ok');
