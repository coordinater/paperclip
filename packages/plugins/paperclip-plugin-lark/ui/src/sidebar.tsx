/**
 * Sidebar widget — 显示当前 approval 在飞书审批卡片端的状态.
 *
 * Skeleton only. Generated at W3-D7 per handoff/03-施工手册-M1.md §W3.3.
 * Wire up in W4-D5 装配日 per handoff/03 §W4.3.
 *
 * Plugin SDK 层（handoff/06-规范.md §2.3）: 直接 import `@paperclipai/plugin-sdk/ui`
 * 的 usePluginData / usePluginAction hooks，不做二次封装.
 *
 * TODO(W4-D5):
 *   - usePluginData("approval-lark-status", { approvalId }) 拉映射数据:
 *       { instanceCode, larkStatus, chatId, cardMessageId }
 *   - 展示状态徽章 (pending / approved / rejected)
 *   - 展示 "打开飞书" 按钮 → 跳 `applink.feishu.cn/client/message/link/open?token=...`
 *   - usePluginAction("lark.resendApprovalCard") 兜底重发按钮
 *   - 空状态：还没绑定飞书审批卡片时显示 "尚未推送到飞书" + Resend 按钮
 */

import type { PluginWidgetProps } from "@paperclipai/plugin-sdk/ui";

export function LarkApprovalSidebar(_props: PluginWidgetProps): never {
  throw new Error("paperclip-plugin-lark: skeleton only, wire up in M1 W4");
}

// TODO(W4-D5): default export 或 named export 按 manifest.ui.slots.exportName 对齐.
export default LarkApprovalSidebar;
