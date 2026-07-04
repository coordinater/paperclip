/**
 * Plugin manifest for @ai-company/paperclip-plugin-twenty-crm.
 *
 * M4-03 MVP · handbook §M4-03 · Twenty CRM 深度集成
 * · 走 GraphQL client · shadow 表存 id 映射 · D-M4-05
 * · Pattern-2 (manifest.webhooks + onWebhook) + Pattern-3 (fetchImpl)
 * · v0.1 单向同步（paperclip → Twenty） · 反向 M6+（D-M4-06）
 */
import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "ai-company.paperclip-plugin-twenty-crm";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: "0.0.1-alpha.0",
  displayName: "Twenty CRM (deep integration)",
  description:
    "Deep integration with self-hosted Twenty CRM · GraphQL-first · bidirectional mapping. M4-03.",
  author: "ai-company",
  categories: ["connector"],
  capabilities: [
    "webhooks.receive",
    "plugin.state.read",
    "plugin.state.write",
    "activity.log.write",
    "http.outbound",
    "secrets.read-ref",
    "entities.read",
    "entities.write",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  webhooks: [
    {
      endpointKey: "sync-agent-to-company",
      displayName: "Sync agent hierarchy to Twenty Company",
      description:
        "POST body { agent_id, workspace_context } → Twenty Company create/update + shadow id映射",
    },
    {
      endpointKey: "sync-issue-to-opportunity",
      displayName: "Sync issue to Twenty Opportunity",
      description:
        "POST body { issue_id, stage_override? } → Twenty Opportunity create/update + status mapping",
    },
    {
      endpointKey: "sync-user-to-person",
      displayName: "Sync user to Twenty Person",
      description:
        "POST body { user_id } → Twenty Person create/update",
    },
    {
      endpointKey: "upsert-note",
      displayName: "Upsert activity log entry as note",
      description:
        "POST body { activity_log_id, opportunity_id } → Twenty Note (audit view)",
    },
    {
      endpointKey: "twenty-inbound",
      displayName: "Inbound Twenty webhook (M5+ 反向同步)",
      description:
        "POST body { event, twenty_object_id, payload } → paperclip 反向映射 · M6+ 完成 · v0.1 stub only",
    },
  ],
};

export default manifest;
