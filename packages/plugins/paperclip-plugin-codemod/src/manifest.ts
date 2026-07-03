/**
 * Plugin manifest for @ai-company/paperclip-plugin-codemod.
 *
 * M2 W6-D3 · JS 栈选择路径（vs openrewrite JVM 栈）· 手册 §W6.D3.
 *
 * 用途：给 Paperclip 底座暴露一个 codemod runner —— agent / 用户通过 webhook
 * 提交 `{ recipe, paths[] }` · 插件在 execution workspace cwd 里 spawn
 * jscodeshift（或 `codemod` CLI）跑 transform · 返回 diff。
 *
 * 与 mini-swe-agent / SWE-agent adapter 组合：agent 可在自己的执行循环里
 * 决定 "先跑一个 rename-symbol codemod 再让 LLM patch 剩下的"，从而降本。
 */
import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "ai-company.paperclip-plugin-codemod";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: "0.0.1-alpha.0",
  displayName: "Codemod Runner",
  description:
    "Run jscodeshift / codemod transforms on the workspace via webhook. M2 W6-D3 (JS/TS 栈选择路径).",
  author: "ai-company",
  categories: ["automation"],
  capabilities: [
    // Webhook inbound（agent 或 user 触发 codemod 跑）
    "webhooks.receive",
    // Plugin state（可选：缓存 recipe metadata / recent runs）
    "plugin.state.read",
    "plugin.state.write",
    // Activity log（记录每次 codemod run 到 activity_log）
    "activity.log.write",
    // Secrets read-ref（未来支持私有 codemod registry 时用）
    "secrets.read-ref",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  webhooks: [
    {
      endpointKey: "apply",
      displayName: "Apply codemod transform",
      description:
        "POST body `{ recipe: string, paths: string[], dryRun?: boolean }`. Spawns jscodeshift with the recipe and returns { changed: string[], diff, exitCode }. If dryRun=true, only prints diff without writing.",
    },
  ],
};

export default manifest;

// ---------------------------------------------------------------------------
// Input / output contracts (exported for shared use with server route mount if
// ever wired up, and for typed tests).
// ---------------------------------------------------------------------------

export interface ApplyCodemodRequest {
  /** Recipe name (jscodeshift transform module path OR published codemod name) */
  recipe: string;
  /** Absolute or workspace-relative file paths to run the transform on */
  paths: string[];
  /** If true, print diff without modifying files (jscodeshift --dry) */
  dryRun?: boolean;
  /** Extra CLI args passed through to jscodeshift */
  extraArgs?: string[];
  /** Optional command override (defaults to `jscodeshift`) */
  command?: string;
}

export interface ApplyCodemodResult {
  changed: string[];
  diff: string;
  exitCode: number | null;
  timedOut: boolean;
  errorMessage: string | null;
}
