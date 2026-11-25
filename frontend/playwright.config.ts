import { defineConfig, devices } from "@playwright/test";

// 通しの確認 VE-01〜VE-06（テスト設計.md「画面の通し確認」・ADR-024）。
// 画面は本番ビルド（next build ＋ next start -p 3100）。NEXT_PUBLIC_API_BASE は空にして、/api/* を同じ送信元へ呼ばせ、Playwright で全部差し替える。
// Chromium だけ・1 本 30 秒・再試行 0・並列 1。
const PORT = Number(process.env.E2E_PORT ?? 3100); // 手元で 3100 が埋まっているときだけ E2E_PORT で変える

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  timeout: 30_000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  outputDir: "test-results",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }],
  webServer: {
    command: `npm run build && npx next start -p ${PORT} -H 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: { NEXT_PUBLIC_API_BASE: "" },
  },
});
