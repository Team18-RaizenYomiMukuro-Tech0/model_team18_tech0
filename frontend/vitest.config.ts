// 画面部品の描画テスト（V-01〜V-24。テスト設計・ADR-024）。Vitest ＋ Testing Library ＋ jsdom。
// 動かすのは *.test.tsx だけ。今の node:test の *.test.ts（scripts/run-tests.mjs）はそのまま。
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.tsx"],
    setupFiles: ["src/test/setup.ts"],
    restoreMocks: true,
  },
});
