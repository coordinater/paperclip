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
  categories: ["automation"],
  capabilities: [
    "webhooks.receive",
    "plugin.state.read",
    "plugin.state.write",
    "activity.log.write",
    "activity.read",
    "routines.managed",
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
  // NOTE(M5+ wire-up): routines schedule declarations moved to install-time
  // per PluginManagedRoutineDeclaration full shape (routineKey + title + triggers[]
  // with cronExpression). dispatchRoutine() in worker.ts handles the 4 tick semantics.
  // Ticks: sampling-tick */30 · evaluation-tick */60 · decay-tick daily · swe-bench-cl-tick weekly
};

export default manifest;
