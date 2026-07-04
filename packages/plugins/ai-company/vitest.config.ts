import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "middleware/**/*.test.ts",
      "runtime-config/**/*.test.ts",
      "scripts/**/*.test.ts",
    ],
    environment: "node",
  },
});
