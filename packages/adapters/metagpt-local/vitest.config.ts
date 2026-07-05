import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    passWithNoTests: true, // kick-off skeleton · no tests until 装配 (M5+ rules-gated)
  },
});
