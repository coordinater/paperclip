/**
 * Plugin manifest for @ai-company/paperclip-plugin-cold-email.
 *
 * M4-02 MVP · handbook §M4-02 · issue 状态机 + routines cron + question HITL
 * · v0.1 走 draft + 手动发降级模式（D-M4-07）· 无真接 email API
 *
 * SDK 契约：走 manifest.webhooks + onWebhook 分发（D-M2-05 · Pattern-2）
 * + routines cron 4 项 + http.outbound 通过 safeOutbound 装饰（C8 · errata E-6）.
 */
import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "ai-company.paperclip-plugin-cold-email";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: "0.0.1-alpha.0",
  displayName: "Cold Email Outreach (E4)",
  description:
    "Open-source cold-email outreach agent · issue state machine + routines cron + GDPR/CAN-SPAM/PIPL compliance. M4-02.",
  author: "ai-company",
  categories: ["automation"],
  capabilities: [
    "webhooks.receive",
    "plugin.state.read",
    "plugin.state.write",
    "activity.log.write",
    "http.outbound",
    "secrets.read-ref",
    "issues.read",
    "issues.create",
    "issues.update",
    "routines.managed",
    "ui.action.register",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  webhooks: [
    {
      endpointKey: "create-sequence",
      displayName: "Create cold-email outreach sequence",
      description:
        "POST body { seed_list_id, target_industry, template_id, sender_email, channel, pacing } → parent issue + child sequence steps",
    },
    {
      endpointKey: "handle-reply",
      displayName: "Inbound reply webhook (from email provider)",
      description:
        "POST body { message_id, sender, body, headers } → match to sequence · move state to replied · question HITL",
    },
    {
      endpointKey: "handle-bounce",
      displayName: "Inbound bounce/complaint webhook",
      description:
        "POST body { message_id, bounce_kind } → move state to bounced · trigger unsubscribe",
    },
    {
      endpointKey: "unsubscribe",
      displayName: "Public unsubscribe endpoint (GDPR/CAN-SPAM required)",
      description:
        "GET /unsubscribe?token=<hmac> → mark recipient as unsubscribed · idempotent",
    },
  ],
  // NOTE(M5+ wire-up): routines schedule declarations moved to worker install-time.
  // See PluginManagedRoutineDeclaration in shared/src/types/plugin.ts for the full shape
  // (routineKey + title + triggers[] with cronExpression + assigneeRef + projectRef).
  // Current dispatchRoutine() in worker.ts handles the 4 tick semantics · manifest wire-up
  // at real install-time (M5+ · P1-14 shopping list unlocks).
  // Ticks: warmup-tick */15 · reply-sweep 0 * · bounce-sweep 0 6 · compliance-audit 0 0 * * 0
};

export default manifest;
