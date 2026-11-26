// 使い方: node load.mjs <base> <path> <同時数> <合計回数> [visitor]
import { execSync } from "node:child_process";
const [base, path, conc, total, mode] = process.argv.slice(2);
const pid = execSync("lsof -nP -iTCP:" + new URL(base).port + " -sTCP:LISTEN -t").toString().trim().split("\n")[0];
const ps = () => { const [rss, cpu] = execSync(`ps -o rss=,cputime= -p ${pid}`).toString().trim().split(/\s+/); return { rssMB: +(rss/1024).toFixed(0), cpu }; };
const lat = []; let fail = 0, reqs = 0, done = 0, next = 0;
async function get(u) { const t = performance.now(); try { const r = await fetch(base + u); const b = await r.text(); reqs++; if (!r.ok) fail++; return { t: performance.now() - t, b }; } catch { fail++; reqs++; return { t: performance.now()-t, b: "" }; } }
async function visitor() {
  const t0 = performance.now();
  const { b } = await get(path);
  if (mode === "visitor") {
    const refs = [...new Set([...b.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css|png|svg|ico)[^"]*)"/g)].map(m => m[1]))];
    await Promise.all(refs.map(get));
  }
  lat.push(performance.now() - t0);
}
const before = ps(); const T = performance.now(); let peak = before.rssMB;
const mon = setInterval(() => { peak = Math.max(peak, ps().rssMB); }, 200);
await Promise.all(Array.from({ length: +conc }, async () => { while (next++ < +total) await visitor(); }));
clearInterval(mon);
const el = (performance.now() - T) / 1000; lat.sort((a, b) => a - b);
const q = p => lat[Math.min(lat.length - 1, Math.floor(lat.length * p))].toFixed(0);
const after = ps();
console.log(JSON.stringify({ path, mode: mode||"html", conc: +conc, visitors: +total, httpReqs: reqs, fail, sec: +el.toFixed(2), visitorsPerSec: +(total/el).toFixed(0), p50ms: +q(.5), p95ms: +q(.95), maxms: +q(.999), rssBefore: before.rssMB, rssPeak: peak, rssAfter: after.rssMB, cpuBefore: before.cpu, cpuAfter: after.cpu }));
