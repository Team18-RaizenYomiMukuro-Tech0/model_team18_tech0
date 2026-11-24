// `npm test` は 2 つの道具を続けて動かす。どちらかが失敗したら失敗にする。
//  1. node:test … src の *.test.ts（関数と状態の単体テスト。新しいライブラリは足さない。T1・#54）
//  2. Vitest   … src の *.test.tsx（画面部品の描画テスト V-01〜V-24。ADR-024）
// `npm test -- formatPrice` は、名前に formatPrice を含むファイルだけを両方から探して動かす。
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const filter = process.argv[2] ?? "";
const nodeTests = [];
const renderTests = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.includes(filter)) {
      if (name.endsWith(".test.ts")) nodeTests.push(p);
      else if (name.endsWith(".test.tsx")) renderTests.push(p);
    }
  }
};
walk("src");
if (nodeTests.length === 0 && renderTests.length === 0) {
  console.error(`テストが見つかりません: ${filter || "(すべて)"}`);
  process.exit(1);
}

let status = 0;
if (nodeTests.length > 0) {
  const r = spawnSync(process.execPath, ["--test", "--experimental-strip-types", ...nodeTests], { stdio: "inherit" });
  status ||= r.status ?? 1;
}
if (renderTests.length > 0) {
  // vitest の実行ファイルは node_modules の中。filter を渡すと、名前に含むファイルだけ動く
  const vitest = join("node_modules", "vitest", "vitest.mjs");
  const r = spawnSync(process.execPath, [vitest, "run", ...(filter ? [filter] : [])], { stdio: "inherit" });
  status ||= r.status ?? 1;
}
process.exit(status);
