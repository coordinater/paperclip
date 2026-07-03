/**
 * Plugin manifest for @ai-company/paperclip-plugin-lark.
 *
 * Skeleton only. Generated at W3-D7 per handoff/03-施工手册-M1.md §W3.3
 * (W3-D7: "飞书 plugin 生产版 scaffold"). Full manifest fields填于 W4-D5
 * per handoff/03 §W4.3 (W4-D5: "飞书 plugin 生产 M1 版本发布").
 *
 * Uses `@paperclipai/plugin-sdk` types directly per handoff/06-规范.md §2.3
 * (Plugin SDK 层 = 稳定契约层，不需要额外缓冲).
 *
 * TODO(W4-D5):
 *   - Declare `entities`: lark_chat / lark_approval_instance (映射到 plugin_ai_company_* 表, 见 06 §5.5)
 *   - Declare `actions`: lark.sendMessage / lark.postApprovalCard / lark.replyToThread
 *   - Declare `webhooks`: /webhooks/lark/event / /webhooks/lark/approval-callback
 *   - Declare `jobs`: refresh-tenant-access-token (cron 1h30m, 飞书 token 2h 有效)
 *   - Declare `capabilities`: events.subscribe / plugin.state.read+write /
 *                            issues.read / approvals.read+write / activity_log.write
 *   - Declare `ui.slots`: sidebar widget (approval status) + settings page
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
    "Bidirectional bridge between PaperClip approvals and Lark approval cards. Skeleton at W3-D7; wire up in M1 W4-D5.",
  author: "ai-company",
  categories: ["connector"],
  capabilities: [
    // Skeleton set; W4-D5 will refine per actual needs.
    "events.subscribe",
    "plugin.state.read",
    "plugin.state.write",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "../ui/dist/",
  },
};

export default manifest;
