/**
 * Worker entrypoint for @ai-company/paperclip-plugin-lark.
 *
 * Skeleton only. Generated at W3-D7 per handoff/03-施工手册-M1.md §W3.3.
 * Business logic填于 W4-D5 装配日 (handoff/03 §W4.3).
 *
 * Directly imports `@paperclipai/plugin-sdk` per handoff/06-规范.md §2.3
 * (Plugin SDK 是唯一有 6-month deprecation SLA 的稳定契约层).
 *
 * TODO(W4-D5):
 *   - definePlugin({ setup(ctx) { ... } }) 里注册:
 *       * ctx.events.on("approval.created", ...) → 触发 approval-sync.ts
 *       * ctx.actions.register("lark.sendMessage", ...)
 *       * ctx.http.register("/webhooks/lark/event", webhooksLarkEvent)
 *       * ctx.http.register("/webhooks/lark/approval-callback", ...)
 *       * ctx.jobs.register("refresh-tenant-token", ...)
 *   - onHealth() 返回 tenant token cache 状态 + last webhook timestamp
 *   - runWorker(plugin, import.meta.url) 挂 host RPC
 */

// TODO(W4-D5): 取消下面 import 的注释，导入 SDK
// import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
// import manifest, { PLUGIN_ID } from "./manifest.js";
// import { larkSendMessage } from "./lark-client.js";
// import { handleApprovalCreated } from "./approval-sync.js";
// import { verifyAndDispatchLarkEvent } from "./webhooks.js";

export function bootstrapWorker(): never {
  throw new Error("paperclip-plugin-lark: skeleton only, wire up in M1 W4");
}

// TODO(W4-D5): 替换为:
//   const plugin = definePlugin({ ... });
//   export default plugin;
//   runWorker(plugin, import.meta.url);
