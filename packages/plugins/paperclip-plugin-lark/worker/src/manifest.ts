/**
 * Plugin manifest for @ai-company/paperclip-plugin-lark.
 *
 * Wired at W4-D5 per handoff/03-施工手册-M1.md §W4.3 (W4-D5: "飞书 plugin 生产
 * M1 版本发布").
 *
 * Uses `@paperclipai/plugin-sdk` types directly per handoff/06-规范.md §2.3
 * (Plugin SDK 层 = 稳定契约层，不需要额外缓冲).
 *
 * M1 scope: **only 1 approval type bound (hire_agent)**; only 1 chat pinned
 * (bootstrapped from `LARK_BOUND_CHAT_ID` secret or `lark:bound-chat` state).
 * Real 飞书审批 (approval.v4) is stubbed as interactive card (see lark-client).
 * M2 wires the real approval API + per-company chat map.
 */
import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "ai-company.paperclip-plugin-lark";
export const APPROVAL_TYPE_HIRE_AGENT = "hire_agent";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: "0.1.0-alpha.0",
  displayName: "Lark (Feishu) Bridge",
  description:
    "Bidirectional bridge between PaperClip approvals and Lark interactive cards. M1: hire_agent 双向绑定 + webhook 收 event.",
  author: "ai-company",
  categories: ["connector"],
  capabilities: [
    // Event subscription (approval.created)
    "events.subscribe",
    // Plugin state (approval link, dedupe, bound chat)
    "plugin.state.read",
    "plugin.state.write",
    // Outbound HTTP to 飞书 open APIs (SDK uses fetch internally; declaring
    // the capability is belt-and-suspenders because the SDK doesn't route
    // through ctx.http, but the host still audits us)
    "http.outbound",
    // Secrets resolve (LARK_APP_ID / LARK_APP_SECRET / LARK_ENCRYPT_KEY /
    //   LARK_VERIFICATION_TOKEN / LARK_BOUND_CHAT_ID)
    "secrets.read-ref",
    // Inbound webhooks (event + card callback)
    "webhooks.receive",
    // Scheduled cron (refresh-pending-approvals)
    "jobs.schedule",
    // Activity log for approval decisions
    "activity.log.write",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "../ui/dist/",
  },
  webhooks: [
    {
      endpointKey: "event",
      displayName: "Lark event webhook",
      description:
        "Receives 飞书 event pushes (im.message.receive_v1, im.chat.enter, etc). Verifies signature + decrypts encrypted payload.",
    },
    {
      endpointKey: "approval-callback",
      displayName: "Lark approval card callback",
      description:
        "Receives 飞书 interactive card button clicks (approve/reject). Routes to approval-sync.handleLarkApprovalCallback.",
    },
  ],
  jobs: [
    {
      jobKey: "refresh-pending-approvals",
      displayName: "Reconcile pending 飞书 approvals",
      description:
        "Cron-driven reconcile: scans locally-tracked pending approvals and fetches 飞书 status to detect out-of-band decisions. M1 skeleton — full reconcile in M2.",
      // Every hour, on the hour.
      schedule: "0 * * * *",
    },
    {
      jobKey: "refresh-tenant-access-token",
      displayName: "Refresh 飞书 tenant access token",
      description:
        "Belt-and-suspenders: the @larksuiteoapi/node-sdk carries a built-in tenant token cache (2h TTL); this job is a no-op in M1 but is declared so operators see one place to trigger a manual refresh.",
      // 1h30m mark: 5400 seconds. Cron granularity is minutes, so use every 90 min.
      schedule: "*/90 * * * *",
    },
  ],
};

export default manifest;
