/**
 * Plugin manifest for @ai-company/paperclip-plugin-campaign-workflow.
 *
 * M2 W7-D1（最高战略杠杆）· 手册 §W7.D1.
 *
 * 用途：营销 Scale 骨架 · 抄 Jasper campaign workflow 语义 —— 用户提交 brief
 * → orchestrator 拆 3 child (blog / social[] / ads[]) → 每个 child hire agent
 * + skill (claude-blog / claude-seo / adcreative) → parent aggregate.
 *
 * 与 M1/M2 已装 skill 的组合：
 *   - claude-blog (M1 W3-D5)：blog child 用
 *   - claude-seo (M1 W3-D4)：blog SEO refine
 *   - Buffer MCP (M1 W4-D2)：social child 发送
 *   - AdCreative (M1 W4-D3)：ads child（若装了）
 *   - code-reviewer (M1 W4-D1)：可选内容 review
 *
 * SDK 契约：走 manifest.webhooks + onWebhook 分发（per D-M2-05，与 codemod 一致）
 *          + plugin_entities（8 scope brand_asset · 见 entities.ts D-M2-08）
 *          + plugin_state（campaign_id → {status, outputs}）
 */
import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "ai-company.paperclip-plugin-campaign-workflow";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: "0.0.1-alpha.0",
  displayName: "Campaign Workflow",
  description:
    "Marketing campaign orchestrator · brief → blog + social + ads sub-issues. M2 W7-D1 最高战略杠杆.",
  author: "ai-company",
  categories: ["automation"],
  capabilities: [
    // Inbound webhook (submit brief · get status)
    "webhooks.receive",
    // Plugin state (campaign_id → status/outputs · brand_asset entities)
    "plugin.state.read",
    "plugin.state.write",
    // Activity log (每个 orchestration 步骤落一条)
    "activity.log.write",
    // Secrets read-ref (Buffer / AdCreative / etc 后续供 sub-agent 用)
    "secrets.read-ref",
    // Event subscription (child issue closed → parent aggregate)
    "events.subscribe",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  webhooks: [
    {
      endpointKey: "submit-brief",
      displayName: "Submit campaign brief",
      description:
        "POST body `CampaignBrief`. Orchestrator plans the parent + child issues; returns `OrchestratorPlan`. Actual issue creation is done by paperclip core via a separate call (this webhook is planning-only for clean testing).",
    },
    {
      endpointKey: "campaign-status",
      displayName: "Fetch campaign status",
      description:
        "GET/POST endpoint returning current status of a campaign_id (in_progress / completed / partial / failed) plus its outputs so far. Reads from plugin_state.",
    },
  ],
};

export default manifest;
