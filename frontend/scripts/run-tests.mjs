// `npm test` は src の *.test.ts をすべて、`npm test -- formatPrice` は名前に formatPrice を含むものだけ動かす。
// 道具は Node 標準の node:test（新しいライブラリは足さない）。テストの道具の最終決定は T1（#）。
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const filter = process.argv[2] ?? "";
const found = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith(".test.ts") && p.includes(filter)) found.push(p);
  }
};
walk("src");
if (found.length === 0) {
  console.error(`テストが見つかりません: ${filter || "(すべて)"}`);
  process.exit(1);
}
const r = spawnSync(process.execPath, ["--test", "--experimental-strip-types", ...found], { stdio: "inherit" });
process.exit(r.status ?? 1);
