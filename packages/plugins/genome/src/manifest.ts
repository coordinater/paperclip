/**
 * Genome plugin manifest · M5-03.
 */
import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "ai-company.paperclip-plugin-genome";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: "0.0.1-alpha.0",
  displayName: "Genome + AlphaEvolve loop (L4)",
  description:
    "L4 evolution layer · Genome library + AlphaEvolve loop · sampling / evaluator / decay routines. M5-03.",
  author: "ai-company",
  categories: ["agent"],
  capabilities: [
    "webhooks.receive",
    "plugin.state.read",
    "plugin.state.write",
    "activity.log.write",
    "activity.log.read",
    "entities.read",
    "entities.write",
    "routines.register",
    "issues.read",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  webhooks: [
    {
      endpointKey: "report-candidate",
      displayName: "Report a candidate pattern",
      description:
        "agent 完成 issue 后主动上报 candidate pattern（feature/action/evidence）· 进 candidate 队列",
    },
    {
      endpointKey: "query-pattern",
      displayName: "Query Genome library for applicable patterns",
      description:
        "agent 开工前查询这类 issue 有哪些 pattern 可复用 · return top-K sorted by score",
    },
  ],
  routines: [
    {
      key: "sampling-tick",
      cron: "*/30 * * * *",
      displayName: "Sampling tick",
      description: "扫 activity_log 抽 candidate pattern",
    },
    {
      key: "evaluation-tick",
      cron: "*/60 * * * *",
      displayName: "Evaluation tick",
      description: "evaluator 打分 candidate · 高分入库 · 低分丢弃",
    },
    {
      key: "decay-tick",
      cron: "0 0 * * *",
      displayName: "Decay tick",
      description: "Genome 库 pattern score 衰减",
    },
    {
      key: "swe-bench-cl-tick",
      cron: "0 3 * * 0",
      displayName: "SWE-Bench-CL weekly tick",
      description: "定期跑 SWE-Bench-CL 子集 · 验证 L4 环有效性",
    },
  ],
};

export default manifest;
