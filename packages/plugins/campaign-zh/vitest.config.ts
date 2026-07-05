import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    passWithNoTests: true, // kick-off scaffold · no tests until装配 (D-M5-02)
  },
});
