/**
 * Plugin manifest for @ai-company/paperclip-plugin-hubspot-breeze.
 *
 * M2 W8-D3 · 手册 §W8.D3.
 *
 * 用途：agent 通过 webhook 触发 HubSpot Contacts / Deals / Workflow 操作
 * · 用于营销 Scale 阶段 Campaign Workflow 产出的线索沉淀到 CRM.
 *
 * SDK 契约：走 manifest.webhooks + onWebhook 分发（D-M2-05 pattern）+ http.outbound
 * 通过 safeOutbound 装饰（C8 middleware · errata E-6）.
 */
import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "ai-company.paperclip-plugin-hubspot-breeze";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: "0.0.1-alpha.0",
  displayName: "HubSpot Breeze CRM",
  description:
    "Create contacts, upsert deals, trigger workflows on HubSpot. M2 W8-D3.",
  author: "ai-company",
  categories: ["connector"],
  capabilities: [
    "webhooks.receive",
    "plugin.state.read",
    "plugin.state.write",
    "activity.log.write",
    "http.outbound",
    "secrets.read-ref",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  webhooks: [
    {
      endpointKey: "create-contact",
      displayName: "Create HubSpot contact",
      description:
        "POST body `CreateContactRequest` → creates a new HubSpot contact. Returns `contact_id` + `hubspot_url`.",
    },
    {
      endpointKey: "upsert-deal",
      displayName: "Upsert HubSpot deal",
      description:
        "POST body `UpsertDealRequest` → creates or updates a deal by `dealname`. Returns `deal_id`.",
    },
    {
      endpointKey: "trigger-workflow",
      displayName: "Trigger a HubSpot workflow",
      description:
        "POST body `TriggerWorkflowRequest` → enrolls a contact into a HubSpot workflow by workflow_id.",
    },
  ],
};

export default manifest;
