import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { CopyController, COPIED_MESSAGE, COPY_FAILED_MESSAGE, shouldFocusCopy, type CopyStatus } from "./copyButton.ts";

// S-32 S-33 S-41 #32-6: コピーボタン。偽のタイマーで時間を進める
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
function setup(write: (t: string) => Promise<void>) {
  mock.timers.enable({ apis: ["setTimeout"] });
  const states: CopyStatus[] = [];
  const written: string[] = [];
  const ctl = new CopyController((s) => states.push(s), async (t) => {
    written.push(t);
    await write(t);
  });
  return { ctl, states, written, now: () => states[states.length - 1] };
}

test("copyButton S-32: 成功すると「コピーしました」が出て、2秒で消える", async () => {
  const { ctl, now, written } = setup(async () => {});
  await ctl.copy("https://x.example/s/abc");
  assert.deepEqual(written, ["https://x.example/s/abc"]);
  assert.equal(now(), "copied");
  assert.equal(COPIED_MESSAGE, "コピーしました");
  mock.timers.tick(1999);
  assert.equal(now(), "copied");
  mock.timers.tick(1);
  assert.equal(now(), "idle");
  mock.timers.reset();
});

test("copyButton S-33 #32-6: 失敗すると案内が出て、時間が経っても残る。次に押して成功すると切り替わる", async () => {
  let fail = true;
  const { ctl, now } = setup(async () => {
    if (fail) throw new Error("denied");
  });
  await ctl.copy("u");
  assert.equal(now(), "failed");
  assert.equal(COPY_FAILED_MESSAGE, "コピーできませんでした。リンクを長押ししてコピーしてください");
  mock.timers.tick(60000);
  assert.equal(now(), "failed");
  fail = false;
  await ctl.copy("u");
  assert.equal(now(), "copied");
  mock.timers.reset();
});

test("copyButton S-33: クリップボードを使えない環境（同期の例外）も失敗として扱う", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const states: CopyStatus[] = [];
  const ctl = new CopyController((s) => states.push(s), () => {
    throw new TypeError("clipboard is undefined");
  });
  await ctl.copy("u");
  assert.equal(states[states.length - 1], "failed");
  mock.timers.reset();
});

test("copyButton S-41: 1.5秒の時点で押し直すと、コピーし直して、そこから2秒数え直す（1.9秒で消えず、2.1秒で消える）", async () => {
  const { ctl, now, written } = setup(async () => {});
  await ctl.copy("u");
  mock.timers.tick(1500);
  assert.equal(now(), "copied");
  await ctl.copy("u");
  await flush();
  assert.equal(written.length, 2); // コピーし直した
  mock.timers.tick(1900);
  assert.equal(now(), "copied"); // 再押下から 1.9 秒
  mock.timers.tick(200);
  assert.equal(now(), "idle"); // 再押下から 2.1 秒
  mock.timers.reset();
});

// NF-27 #591（SP-05。PM 決定 2026-11-21 A-3・2026-11-22）: 作成に成功するたび「コピー」へフォーカスを移す。押し方によらない。作り直しも。失敗は動かさない
test("NF-27 shouldFocusCopy: 新しいリンクができたときだけ true（初回・作り直し）。同じリンクの再描画・失敗（リンクが変わらない）・リンクなしは false", () => {
  assert.equal(shouldFocusCopy(null, "A"), true); // 初めて作った
  assert.equal(shouldFocusCopy("A", "B"), true); // 作り直した（別のリンク）
  assert.equal(shouldFocusCopy("A", "A"), false); // 同じリンクのまま（再描画・コピーの結果の表示）
  assert.equal(shouldFocusCopy("A", "A"), false); // 失敗してもリンクは変わらない
  assert.equal(shouldFocusCopy("A", null), false); // 消えたとき
  assert.equal(shouldFocusCopy(null, null), false);
  assert.equal(shouldFocusCopy(undefined, undefined), false);
});

test("NF-27 ShareLinkResult は新しいリンクのとき「コピー」ボタンへ focus する（失敗の分岐では動かさない）", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../components/ShareLinkResult.tsx", import.meta.url), "utf8");
  assert.match(src, /shouldFocusCopy\(/);
  assert.match(src, /copyBtn\.current\?\.focus\(\)/);
  assert.match(src, /ref=\{copyBtn\}/);
});
