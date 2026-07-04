/**
 * Plugin manifest for @ai-company/paperclip-plugin-magis-lite. M3-02.
 */
import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "ai-company.paperclip-plugin-magis-lite";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: "0.0.1-alpha.0",
  displayName: "MAGIS-lite (4-agent org)",
  description:
    "POC · 4-agent org tree (Manager / Repository Custodian / Developer / QA) with sequential decomposition and plugin_state shared memory. M3-02.",
  author: "ai-company",
  categories: ["automation"],
  capabilities: [
    "webhooks.receive",
    "plugin.state.read",
    "plugin.state.write",
    "activity.log.write",
    "events.subscribe",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  webhooks: [
    {
      endpointKey: "plan-issue",
      displayName: "Plan a MAGIS-lite decomposition",
      description:
        "POST body `MagisIssueInput` → returns `MagisPlan`. Caller materializes the parent + sub-issues to paperclip core.",
    },
    {
      endpointKey: "get-plan",
      displayName: "Fetch a MAGIS plan by issue_id",
      description: "GET/POST with `issue_id` → returns the last plan cached in plugin_state.",
    },
  ],
};

export default manifest;
