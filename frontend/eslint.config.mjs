// N-05 D-14: HTML の直差し込みを lint で止める（react/no-danger を error）
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "react/no-danger": "error",
      "no-restricted-properties": [
        "error",
        { property: "innerHTML", message: "HTML の直差し込みは禁止（N-05）" },
        { property: "outerHTML", message: "HTML の直差し込みは禁止（N-05）" },
        { property: "insertAdjacentHTML", message: "HTML の直差し込みは禁止（N-05）" },
        { object: "document", property: "write", message: "HTML の直差し込みは禁止（N-05）" },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
