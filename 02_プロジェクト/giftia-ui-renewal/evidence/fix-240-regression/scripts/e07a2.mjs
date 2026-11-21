import { open, go, sleep, ds, enc, body, click, total, cards, storage } from './lib.mjs';
const R = {}; const rec = (id, ok, d) => { (R[id] ||= []).push({ ok: !!ok, d }); console.log('..', id, ok ? 'ok' : 'NG', String(d).slice(0, 200)); };
const CATS = ['食品', '飲料', '生活雑貨', 'フラワー', 'コスメ', '酒類', 'インテリア', '家電', 'ビジネス小物', 'カタログギフト'];
const R02 = '/search?category=' + enc('生活雑貨'), R02all = '/search', R01 = '/search?scene=' + enc('送別');
async function fresh(w, dataset, path, h = 900, wait = 4000) { ds(dataset); const o = await open({ w, h }); await go(o.p, path, wait); return o; }
try {
  // S-20 / S-65(ヘッダー)
  for (const w of [375, 1280]) for (const [nm, path, dsn] of [['top', '/', 'fd9'], ['R', R01, 'fd1']]) {
    const { b, p } = await fresh(w, dsn, path);
    const h = await p.evaluate(() => { const e = document.querySelector('header'); return e ? e.innerText.replace(/\s+/g, ' ') : ''; });
    rec('S-20', /お気に入り/.test(h) && /ログイン/.test(h) && /準備中/.test(h) && /カート/.test(h) && !/取引先へのお礼|ギフトを探す|カートに入れる/.test(h), `${nm}_${w}: ${h}`);
    await b.close();
  }
  // S-21
  { const { b, p } = await fresh(1280, 'fd9', '/');
    const t = await p.evaluate((C) => { const sec = [...document.querySelectorAll('section,div')].find((e) => /カテゴリーから探す/.test(e.innerText) && e.querySelectorAll('a,button').length >= 10 && e.querySelectorAll('a,button').length < 14); const els = [...sec.querySelectorAll('a,button')].filter((e) => C.some((c) => e.innerText.includes(c))); return { names: els.map((e) => e.innerText.trim()), icons: els.map((e) => !!e.querySelector('svg,img') ) }; }, CATS);
    rec('S-21', JSON.stringify(t.names) === JSON.stringify(CATS) && t.icons.every(Boolean), `top: ${t.names.length}件 アイコン付き${t.icons.filter(Boolean).length}`); await b.close(); }
  { const { b, p } = await fresh(1280, 'fd9', R02);
    const t = await p.evaluate((C) => { const els = [...document.querySelectorAll('button')].filter((e) => C.some((c) => e.innerText.replace('✓', '').trim() === c)); return { names: els.map((e) => e.innerText.replace('✓', '').trim()), icons: els.map((e) => !!e.querySelector('svg,img')) }; }, CATS);
    rec('S-21', JSON.stringify(t.names) === JSON.stringify(CATS) && !t.icons.some(Boolean), `結果: ${t.names.length}件 アイコン${t.icons.filter(Boolean).length}`); await b.close(); }
  // S-22 配置 1280
  { const { b, p } = await fresh(1280, 'fd9', R02);
    const t = await p.evaluate(() => { const top = (re) => { const e = [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && re.test(e.textContent.trim())); return e.map((x) => Math.round(x.getBoundingClientRect().top)); }; const btn = (t) => Math.round([...document.querySelectorAll('button')].find((b) => b.innerText.trim() === t).getBoundingClientRect().top); return { sceneH: top(/^シーン$/)[0], priceH: top(/^価格帯/)[0], catH: top(/^カテゴリー/)[0], sceneBtn: btn('お礼'), priceBtn: btn('〜2,999円'), catBtn: btn('食品') }; });
    rec('S-22', Math.abs(t.sceneH - t.priceH) <= 4 && Math.abs(t.sceneBtn - t.priceBtn) <= 4 && t.catBtn > t.sceneBtn + 20, JSON.stringify(t)); await b.close(); }
  // S-23 / S-24 / S-28 / S-57 の一部
  { const { b, p } = await fresh(1280, 'fd9', R02all);
    const n0 = await total(p); const c0 = await cards(p);
    rec('S-24', c0 === 12 && n0 && n0.a === 1 && n0.b === 12 && /イメージ/.test(await body(p)), `cards=${c0} total=${JSON.stringify(n0)}`);
    await click(p, /^3,000〜4,999円$/); const n1 = await total(p);
    const sel = await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find((b) => b.innerText.trim().includes('3,000〜4,999円')); return { pressed: b.getAttribute('aria-pressed'), text: b.innerText.trim(), searchBtn: [...document.querySelectorAll('button')].some((b) => /^検索する$|^この条件で検索/.test(b.innerText.trim())) }; });
    rec('S-23', n1 && n1.n === 31 && (sel.pressed === 'true' || /✓/.test(sel.text)) && !sel.searchBtn, `帯のみ: 全${n1 && n1.n}件 選択=${sel.pressed || sel.text}`);
    await click(p, /^〜2,999円$/); const n2 = await total(p); const sel2 = await p.evaluate(() => [...document.querySelectorAll('button')].filter((b) => /円/.test(b.innerText) && (b.getAttribute('aria-pressed') === 'true' || /✓/.test(b.innerText))).length);
    rec('S-23', sel2 === 1, `価格帯は単一選択: 選択中 ${sel2}、全${n2 && n2.n}件`);
    await click(p, /^食品$/); await click(p, /^飲料$/); const cs = await p.evaluate(() => [...document.querySelectorAll('button')].filter((b) => /^✓/.test(b.innerText.trim())).map((b) => b.innerText.trim()));
    rec('S-23', cs.length >= 2, `カテゴリーは複数選択: ${cs.join(',')}`);
    await b.close(); }
  // S-28 素早く
  { const { b, p } = await fresh(1280, 'fd9', R02all);
    for (const t of [/^〜2,999円$/, /^3,000〜4,999円$/, /^5,000円〜$/, /^3,000〜4,999円$/]) { await (async () => { const pos = await p.evaluate((s) => { const e = [...document.querySelectorAll('button')].find((b) => new RegExp(s.replace(/^\^|\$$/g,'').replace(/\$$/,'')).test(b.innerText.trim())); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, t.source); await p.mouse.click(pos.x, pos.y); })(); }
    await sleep(2500); const n = await total(p);
    rec('S-28', n && n.n === 31, `素早く 4 回押した最後は 3,000〜4,999円 → 全${n && n.n}件（31 が正）`); await b.close(); }
  // S-25 詳細・S-61
  for (const w of [375, 1280]) { const { b, p } = await fresh(w, 'fd9', R02all);
    await click(p, /^Z30の商品$/); await sleep(1200);
    const d = await p.evaluate(() => { const dlg = [...document.querySelectorAll('[role=dialog],aside,[aria-modal=true]')].find((e) => e.getBoundingClientRect().width > 0 && !e.hidden && /カートに入れる/.test(e.innerText)); if (!dlg) return null; const r = dlg.getBoundingClientRect(); const txt = dlg.innerText.replace(/\s+/g, ' '); return { inView: r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], hasCart: /カートに入れる/.test(txt), hasFav: /お気に入り/.test(txt), price: /税込/.test(txt), rating: /★/.test(txt), delivery: /届く|日/.test(txt), wrap: /ラッピング/.test(txt), hscroll: dlg.scrollWidth > dlg.clientWidth + 1 }; });
    rec('S-25', d && d.inView && d.hasCart && d.hasFav && !d.hscroll, `${w}px: ${JSON.stringify(d)}`);
    rec('S-61', d && d.price && d.rating && d.delivery && d.wrap, `${w}px: 項目 価格${d && d.price} 評価${d && d.rating} 配送${d && d.delivery} ラッピング${d && d.wrap}`);
    await b.close(); }
  // S-26 / S-62 お気に入り
  { const { b, p } = await fresh(1280, 'fd9', R02all);
    const heart = /Z30の商品をお気に入り/;
    await click(p, heart); let s1 = JSON.parse((await storage(p, 'giftia:favorites')) || '[]');
    await click(p, heart); let s2 = JSON.parse((await storage(p, 'giftia:favorites')) || '[]');
    await click(p, heart); await click(p, /Z30の商品をお気に入り/); await click(p, heart); const s3 = JSON.parse((await storage(p, 'giftia:favorites')) || '[]');
    await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(3500); const s4 = JSON.parse((await storage(p, 'giftia:favorites')) || '[]');
    const pressed = await p.evaluate(() => [...document.querySelectorAll('button')].filter((b) => /Z30の商品をお気に入り/.test(b.getAttribute('aria-label') || '')).map((b) => b.getAttribute('aria-pressed')));
    rec('S-26', s1.length === 1 && s2.length === 0 && s4.length === s3.length && pressed.includes('true'), `登録${s1.length} → 解除${s2.length} → 連打後${s3.length} → 再読込後${s4.length} 押した状態${pressed}（保存形式 ${JSON.stringify(s4).slice(0, 40)}）`);
    // パネル
    await click(p, /^お気に入り$/); await sleep(800); const panel = await p.evaluate(() => { const d = [...document.querySelectorAll('[role=dialog],aside,[aria-modal=true]')].find((e) => e.getBoundingClientRect().width > 0 && /お気に入り/.test(e.innerText)); return d ? d.innerText.replace(/\s+/g, ' ').slice(0, 120) : null; });
    rec('S-62', panel && /Z30/.test(panel), `パネル: ${panel}`);
    await b.close(); }
  { // 保存が使えない
    ds('fd9'); const { b, p } = await open({ w: 1280, h: 900 });
    await p.evaluateOnNewDocument(() => { for (const n of ['localStorage', 'sessionStorage']) Object.defineProperty(window, n, { get() { throw new DOMException('denied', 'SecurityError'); }, configurable: true }); });
    await go(p, R02all, 4000); const ok = await click(p, /Z30の商品をお気に入り/); await sleep(500); const t = await body(p);
    rec('S-62', ok && /Z30の商品/.test(t) && p.errors.length === 0, `保存不可でハートを押す: 画面は残る、pageerror=${p.errors.length}`); await b.close(); }
  // S-27 評価
  { const { b, p } = await fresh(1280, 'fd27', '/search?scene=' + enc('送別'));
    const r = await p.evaluate(() => [...document.querySelectorAll('li')].filter((l) => /カートに入れる/.test(l.innerText)).map((l) => ({ n: (l.innerText.match(/[A-Z0-9]+の商品/) || [''])[0], rate: (l.innerText.match(/★\s*([\d.]+)/) || [])[1] || null, high: /高評価/.test(l.innerText) })));
    rec('S-27', r.length > 0 && r.every((x) => x.high === (x.rate !== null && parseFloat(x.rate) >= 4.5)), JSON.stringify(r.slice(0, 8))); await b.close(); }
  // S-30 カート
  { const { b, p } = await fresh(1280, 'fd9', R02all);
    await click(p, /^カートに入れる （Z30の商品）$/); await click(p, /^カートに入れる （Z30の商品）$/);
    await click(p, /^カート$/); await sleep(900);
    const panel = await p.evaluate(() => { const d = [...document.querySelectorAll('[role=dialog],aside,[aria-modal=true]')].find((e) => e.getBoundingClientRect().width > 0 && /合計/.test(e.innerText)); return d ? d.innerText.replace(/\s+/g, ' ') : null; });
    rec('S-30', panel && /Z30の商品/.test(panel) && /6,600/.test(panel) && /Z30の商品/.test(panel), `カート: ${panel && panel.slice(0, 140)}`);
    const q = await p.evaluate(() => { const i = [...document.querySelectorAll('input')].find((e) => e.offsetParent && /number|text/.test(e.type) && /数量|^\d+$/.test((e.getAttribute('aria-label') || '') + e.value)); return i ? { label: i.getAttribute('aria-label'), v: i.value } : null; });
    rec('S-30', !!q, `数量の欄: ${JSON.stringify(q)}`);
    await click(p, /注文へ進む/); await sleep(600); const t = await body(p); rec('S-30', /デモのため、注文はできません/.test(t), '注文へ進む → ' + ((t.match(/デモのため[^ ]*/) || [''])[0]));
    await b.close(); }
  // S-29 左端
  for (const [w, want] of [[1280, 40], [375, 16]]) { const { b, p } = await fresh(w, 'fd9', '/');
    const t = await p.evaluate(() => { const hdr = document.querySelector('header'); const first = [...hdr.querySelectorAll('a,button,img,svg,span')].find((e) => e.getBoundingClientRect().width > 0); const h1 = [...document.querySelectorAll('h1,h2,h3')].find((e) => /シーンから探す/.test(e.innerText)); return { logo: Math.round(first.getBoundingClientRect().left), body: Math.round(h1.getBoundingClientRect().left), tag: first.tagName + ':' + (first.innerText || '').slice(0, 8) }; });
    rec('S-29', t.logo === want && t.body === want, `${w}px: ロゴ左 ${t.logo} 本文左 ${t.body}（期待 ${want}）${t.tag}`); await b.close(); }
} catch (e) { console.log('ERR', e.message); process.exit(0); }
process.exit(0);
for (const [k, v] of Object.entries(R)) console.log(k, v.every((x) => x.ok) ? '○' : '× ←', v.map((x) => (x.ok ? 'ok ' : 'NG ') + x.d).join(' ‖ ').slice(0, 520));
