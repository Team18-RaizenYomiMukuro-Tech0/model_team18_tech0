import { open, go, sleep, ds, enc, body, click, total, cards, storage } from './lib.mjs';
const R = {}; const rec = (id, ok, d) => { (R[id] ||= []).push({ ok: !!ok, d }); console.log('..', id, ok ? 'ok' : 'NG', String(d).slice(0, 200)); };
const R02all = '/search', R01 = '/search?scene=' + enc('送別');
async function fresh(w, dataset, path, h = 900, wait = 4000) { ds(dataset); const o = await open({ w, h }); await go(o.p, path, wait); return o; }
const url = (p) => p.evaluate(() => location.pathname + location.search);
try {
  // S-52 / S-56 トップ
  for (const w of [1280, 375]) { const { b, p } = await fresh(w, 'fd9', '/');
    const t = await p.evaluate(() => { const pos = (re) => { const e = [...document.querySelectorAll('h1,h2,h3,p,div,span')].filter((e) => e.children.length < 3 && re.test(e.textContent.trim())).map((e) => e.getBoundingClientRect().top + scrollY); return e.length ? Math.min(...e) : null; }; const order = { hero: pos(/^ありがとうに/), scene: pos(/^シーンから探す$/), budget: pos(/^予算から探す$/), cat: pos(/^カテゴリーから探す$/), rec: pos(/^おすすめの商品$/) }; const lis = [...document.querySelectorAll('li')].filter((l) => /カートに入れる/.test(l.innerText)); const tops = lis.map((l) => Math.round(l.getBoundingClientRect().top)); const txt = document.body.innerText; return { order, n: lis.length, sameRow: new Set(tops).size === 1, bad: /候補を出す|取引先へのお礼/.test(txt), catOpen: (() => { const c = [...document.querySelectorAll('a,button')].filter((e) => e.innerText.trim() === '食品'); return c.map((e) => e.getBoundingClientRect().height); })() }; });
    const o = t.order; const inOrder = o.hero < o.scene && o.scene < o.budget && o.budget < o.cat && o.cat < o.rec;
    rec('S-52', inOrder && t.n === 4 && !t.bad && (w === 375 || t.sameRow), `${w}px: 順=${inOrder} おすすめ${t.n}件 1行=${t.sameRow} 候補ボタン等=${t.bad} カテゴリー高さ=${t.catOpen}`);
    if (w === 1280) rec('S-56', t.n === 4 && t.sameRow, `1280px: おすすめ ${t.n} 件が 1 行=${t.sameRow}`);
    await b.close(); }
  // S-56 押した結果（文書の食い違いの確認）
  { const { b, p } = await fresh(1280, 'fd9', '/'); const u0 = await url(p); await click(p, /^Z30の商品$/); await sleep(1000);
    const u1 = await url(p); const hasHeading = /絞り込み結果/.test(await body(p));
    R['S-56'].push({ ok: true, d: `押した後の URL: ${u0} → ${u1}、見出し「絞り込み結果」=${hasHeading}（S-56 は検索結果へ移ると書き、S-124 は移らないと書く。食い違い）` }); await b.close(); }
  // S-53
  { const { b, p } = await fresh(1280, 'fd9', '/');
    const t = await p.evaluate(() => { const btn = [...document.querySelectorAll('button')].filter((b) => /円/.test(b.innerText) && /〜/.test(b.innerText)).map((b) => b.innerText.trim()); return { btn, bad: /3,000〜5,000円/.test(document.body.innerText), input: [...document.querySelectorAll('input')].filter((i) => /number|text/.test(i.type)).length }; });
    const st = () => p.evaluate(() => [...document.querySelectorAll('button')].filter((b) => /〜/.test(b.innerText) && /円/.test(b.innerText)).map((b) => b.getAttribute('aria-pressed') === 'true' || /✓/.test(b.innerText)));
    const a = await st(); await click(p, /^3,000〜4,999円$/); const b1 = await st(); await click(p, /^3,000〜4,999円$/); const c = await st();
    rec('S-53', t.btn.length === 3 && !t.bad && t.input === 0 && !a.some(Boolean) && b1.filter(Boolean).length === 1 && !c.some(Boolean), `ボタン${JSON.stringify(t.btn)} 旧文言${t.bad} 入力欄${t.input} 押す前${a} 押す${b1} もう一度${c}`); await b.close(); }
  // S-54
  { const { b, p } = await fresh(1280, 'fd1', '/'); await click(p, /^送別$/); await sleep(2500);
    const u = await url(p), n = await total(p), c = await cards(p), t = await body(p);
    rec('S-54', /\/search/.test(u) && !!n && c > 0 && /共有リストに入れる|選ぶ/.test(t), `① ${u} 全${n && n.n}件 ${c}枚`);
    await b.close(); }
  { const { b, p } = await fresh(1280, 'fd1', '/'); await click(p, /^3,000〜4,999円$/); await click(p, /^送別$/); await sleep(2500);
    const n = await total(p); const t = await body(p);
    rec('S-54', !!n, `② 価格帯つき 全${n && n.n}件（期待 8）`); rec('S-54', !/取引先へのお礼/.test(t), '③ 取引先へのお礼のタイル無し'); await b.close(); }
  // S-55（FD-10）
  { const { b, p } = await fresh(1280, 'fd10', '/'); await click(p, /^食品$/); await sleep(2000); const u = await url(p);
    const sel = await p.evaluate(() => [...document.querySelectorAll('button')].filter((b) => /^✓/.test(b.innerText.trim())).map((b) => b.innerText.trim()));
    rec('S-55', /\/search/.test(u) && sel.some((s) => /食品/.test(s)) && true, `① ${decodeURIComponent(u)} 選択=${sel}`);
    await click(p, /^酒類$/); await sleep(1500); const sel2 = await p.evaluate(() => [...document.querySelectorAll('button')].filter((b) => /^✓/.test(b.innerText.trim())).map((b) => b.innerText.trim()));
    rec('S-55', sel2.length >= 1, `② 酒類を押した後の選択=${sel2}`);
    await click(p, /^食品$/); await click(p, /^誕生日$/); await sleep(1500); const t3 = await body(p);
    rec('S-55', /この条件に合う商品がありません。カテゴリーを変えてみてください/.test(t3), `③ ${(t3.match(/この条件に合う商品がありません[^ ]*/) || ['(文言なし)'])[0]}`);
    await b.close(); }
  // S-57 / S-58 / S-59
  { const { b, p } = await fresh(1280, 'fd1', R01);
    const sel = () => p.evaluate(() => [...document.querySelectorAll('button')].filter((b) => /^✓/.test(b.innerText.trim()) || b.getAttribute('aria-pressed') === 'true').map((b) => b.innerText.trim().replace(/^✓\s*/, '')));
    await click(p, /^3,000〜4,999円$/); const s1 = await sel(); const n1 = await total(p);
    await click(p, /^お礼$/); await sleep(1500); const s2 = await sel();
    await click(p, /お礼$/); await sleep(1500); const s3 = await sel(); const t = await body(p);
    rec('S-57', s1.includes('送別') && s1.some((s) => /3,000/.test(s)) && s2.includes('お礼') && !s2.includes('送別') && !s3.includes('お礼') && /条件を選ぶと自動で検索されます/.test(t), `選択: ${JSON.stringify([s1, s2, s3])}`);
    await b.close(); }
  { const { b, p } = await fresh(1280, 'fd9', R02all);
    await click(p, /^共有リストに入れる （Z30の商品）$/); await click(p, /^共有リストに入れる （Z29の商品）$/);
    await click(p, /^3,000〜4,999円$/); await click(p, /^食品$/); await click(p, /^飲料$/); await click(p, /^お礼$/);
    await click(p, /条件をクリア/); await sleep(1500);
    const sel = await p.evaluate(() => [...document.querySelectorAll('button')].filter((b) => /^✓/.test(b.innerText.trim()) || b.getAttribute('aria-pressed') === 'true').map((b) => b.innerText.trim())); const n = await total(p); const t = await body(p);
    rec('S-58', !sel.some((s) => /送別|お礼|誕生日|円|食品|飲料/.test(s)) && n && n.n === 34 && /共有リスト\s*\S*\s*2|選んだ候補.{0,10}2/.test(t + ''), `クリア後の選択=${JSON.stringify(sel)} 全${n && n.n}件（34）`); await b.close(); }
  { const { b, p } = await fresh(1280, 'fd1', '/'); await click(p, /^3,000〜4,999円$/); await click(p, /^送別$/); await sleep(2500); const t1 = await body(p); const h = (t1.match(/候補（\d+件）/) || [''])[0];
    await click(p, /^〜2,999円$/); await sleep(1500); const h2 = ((await body(p)).match(/候補（\d+件）/) || [''])[0];
    await click(p, /条件をクリア/); await sleep(1500); const n = await total(p);
    await click(p, /^誕生日$/); await sleep(1500); const h3 = ((await body(p)).match(/候補（\d+件）/) || [''])[0];
    rec('S-59', !!h && h !== h2 && n && h3, `見出し ${h} → 価格帯変更 ${h2} → クリア 全${n && n.n}件 → 誕生日 ${h3}`); await b.close(); }
  // S-60
  { const { b, p } = await fresh(1280, 'fd9', R02all); await click(p, /^3,000〜4,999円$/); await sleep(1500);
    const r = []; r.push([await total(p), await cards(p)]);
    await click(p, /^2$/); await sleep(1500); r.push([await total(p), await cards(p)]); await click(p, /^3$/); await sleep(1500); r.push([await total(p), await cards(p)]);
    rec('S-60', r[0][0].n === 31 && r[0][0].b === 12 && r[1][0].a === 13 && r[1][0].b === 24 && r[2][0].a === 25 && r[2][0].b === 31 && r[2][1] === 7, JSON.stringify(r));
    await p.goto('http://localhost:3100/search?price_band=3000to4999&page=99', { waitUntil: 'domcontentloaded' }); await sleep(3000); const ob = await total(p);
    rec('S-60', ob && ob.a === 1, `範囲外のページ → ${JSON.stringify(ob)}`);
    await b.close(); }
  // S-64 状態
  { ds('fd9'); const { b, p } = await open({ w: 1280, h: 900 }); let mode = 'ok'; await p.setRequestInterception(true);
    p.on('request', (rq) => { if (!/\/api\/products\?/.test(rq.url()) || mode === 'ok') return rq.continue(); if (mode === 'empty') return rq.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ items: [], count: 0, total: 0, page: 1, page_size: 12 }) }); if (mode === 'fail') return rq.respond({ status: 500, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: { code: 'internal_error', message: 'x' } }) }); if (mode === 'hang') return; rq.continue(); });
    await go(p, R02all, 4000);
    mode = 'empty'; await click(p, /^〜2,999円$/); await sleep(1500); const t2 = await body(p); rec('S-64', /条件に合う商品がありません。価格帯を変えてみてください/.test(t2), '② ' + ((t2.match(/条件に合う商品がありません[^ ]*/) || ['(なし)'])[0]));
    mode = 'fail'; await click(p, /^3,000〜4,999円$/); await sleep(2000); const t3 = await body(p); const retry = /もう一度/.test(t3);
    rec('S-64', /失敗しました。もう一度お試しください/.test(t3) && retry, '③ ' + ((t3.match(/失敗しました[^ ]*/) || ['(なし)'])[0]) + ' 再試行=' + retry);
    mode = 'ok'; await click(p, /もう一度/); await sleep(3000); const n = await total(p); console.log('   dbg', (await body(p)).slice(0, 200)); rec('S-64', n && n.n > 0, `③ 復旧後の再試行 全${n && n.n}件`);
    mode = 'hang'; await click(p, /^5,000円〜$/); await sleep(1200); const t1 = await p.evaluate(() => ({ busy: !!document.querySelector('[aria-busy=true],[role=status]'), text: document.body.innerText.replace(/\s+/g, ' ').match(/検索中[^ ]*|読み込み中[^ ]*/)?.[0] || null })); rec('S-64', t1.text || t1.busy, '① 検索中 ' + JSON.stringify(t1));
    await sleep(10000); const t4 = await body(p); rec('S-64', /失敗しました。もう一度お試しください/.test(t4), '④ 応答なし 10 秒後 ' + ((t4.match(/失敗しました[^ ]*/) || ['(なし)'])[0]));
    await b.close(); }
  // S-65 ヘッダー・ログイン・パネル
  { const { b, p } = await fresh(375, 'fd1', '/'); await click(p, /ログイン/); await sleep(500); const a = /ログインは準備中です/.test(await body(p)); await sleep(2600); const c = !/ログインは準備中です/.test(await body(p));
    rec('S-65', a && c, `ログイン: 押した直後=${a} 約2秒後に消える=${c}`);
    const lbl = await p.evaluate(() => { const e = [...document.querySelectorAll('header *')].find((e) => e.children.length === 0 && /準備中/.test(e.textContent)); if (!e) return null; const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), vis: r.width > 0 && getComputedStyle(e).visibility !== 'hidden' }; }); rec('S-65', lbl && lbl.vis, '準備中の札 ' + JSON.stringify(lbl));
    await click(p, /^お気に入り$/); await sleep(800); const f = await p.evaluate(() => [...document.querySelectorAll('[role=dialog],aside,[aria-modal=true]')].some((e) => e.getBoundingClientRect().width > 0 && /お気に入り/.test(e.innerText))); rec('S-65', f, 'お気に入りでパネル=' + f);
    await b.close(); }
  for (const [nm, path] of [['検索結果', R01], ['共有', '/s/z73PTMgpatRwL1bC4P5OOg']]) { const { b, p } = await fresh(1280, 'fd1', path);
    const h = await p.evaluate(() => (document.querySelector('header') || {}).innerText); rec('S-65', /お気に入り/.test(h) && /ログイン/.test(h) && /カート/.test(h) && !/取引先へのお礼|ギフトを探す/.test(h), `${nm}: ${(h || '').replace(/\s+/g, ' ')}`);
    await click(p, /^カート$/); await sleep(800); const cp = await p.evaluate(() => [...document.querySelectorAll('[role=dialog],aside,[aria-modal=true]')].some((e) => e.getBoundingClientRect().width > 0 && /カート/.test(e.innerText))); rec('S-65', cp, `${nm}: カートでパネル=${cp}`); await b.close(); }
} catch (e) { console.log('ERR', e.stack.split('\n').slice(0, 3).join(' ')); }
for (const [k, v] of Object.entries(R)) console.log(k, v.every((x) => x.ok) ? '○' : '× ←', v.map((x) => (x.ok ? 'ok ' : 'NG ') + x.d).join(' ‖ ').slice(0, 560));
