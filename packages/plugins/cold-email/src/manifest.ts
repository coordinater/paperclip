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
  categories: ["agent"],
  capabilities: [
    "webhooks.receive",
    "plugin.state.read",
    "plugin.state.write",
    "activity.log.write",
    "http.outbound",
    "secrets.read-ref",
    "issues.read",
    "issues.write",
    "routines.register",
    "actions.register",
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
  routines: [
    {
      key: "warmup-tick",
      cron: "*/15 * * * *",
      displayName: "Warmup pool tick",
      description:
        "Sends the next drop from warmup pool per pacing rules (max N/day/domain)",
    },
    {
      key: "reply-sweep",
      cron: "0 * * * *",
      displayName: "Reply sweep",
      description:
        "Sweeps IMAP or email API for replies not caught via webhook · idempotent",
    },
    {
      key: "bounce-sweep",
      cron: "0 6 * * *",
      displayName: "Bounce sweep",
      description:
        "Aggregates bounces from provider · updates recipient state",
    },
    {
      key: "compliance-audit",
      cron: "0 0 * * 0",
      displayName: "Compliance retention audit",
      description:
        "Runs GDPR/PIPL retention audit · removes records beyond retention window",
    },
  ],
};

export default manifest;
