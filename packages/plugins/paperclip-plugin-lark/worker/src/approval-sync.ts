/**
 * Approval sync — PaperClip `approvals` ↔ 飞书审批实例双向映射.
 *
 * Skeleton only. Generated at W3-D7 per handoff/03-施工手册-M1.md §W3.3.
 * Wire up in W4-D5 装配日 per handoff/03 §W4.3.
 *
 * M1 scope（handoff/03 §W4.3）: **只做 1 类 approval 双向绑定** = `hire_agent`.
 * 其他 approval type (spawn_run / install_skill / connect_env) 推到 M2.
 *
 * Data 层缓冲（handoff/06-规范.md §2.1）: 新映射字段进 `plugin_ai_company_lark_approval_link`
 * 表（migration 见 worker/../../migrations, 由 W4-D5 添加）——绝不改主线 `approvals` 表。
 *
 * TODO(W4-D5):
 *   - handleApprovalCreated(ctx, event): 收 PaperClip approval.created (type=hire_agent) →
 *     调 lark-client.postApprovalCard → 存 lark_instance_code 到 plugin state.
 *   - handleLarkApprovalCallback(ctx, payload): 收飞书审批回调 (approve/reject) →
 *     lookup lark_instance_code → 更新 PaperClip approvals.status → activity_log.write.
 *   - 幂等性：以 `lark_instance_code` 为 dedupe key，防飞书 at-least-once webhook.
 *   - 补偿：refreshPendingApprovals() cron job 对账兜底 (每小时扫 pending > 30min).
 */

import type { PluginContext } from "@paperclipai/plugin-sdk";
import { APPROVAL_TYPE_HIRE_AGENT } from "./manifest.js";

export interface ApprovalCreatedEvent {
  approvalId: string;
  approvalType: string;
  companyId: string;
  requestedBy: string;
  payload: Record<string, unknown>;
}

export interface LarkApprovalCallbackPayload {
  instanceCode: string;
  status: "approved" | "rejected" | "pending" | "canceled";
  operator: string;
  operatedAt: string;
}

export async function handleApprovalCreated(
  _ctx: PluginContext,
  _event: ApprovalCreatedEvent,
): Promise<void> {
  // Only bind hire_agent in M1 per handoff/03 §W4.3.
  void APPROVAL_TYPE_HIRE_AGENT;
  throw new Error("paperclip-plugin-lark: skeleton only, wire up in M1 W4");
}

export async function handleLarkApprovalCallback(
  _ctx: PluginContext,
  _payload: LarkApprovalCallbackPayload,
): Promise<void> {
  throw new Error("paperclip-plugin-lark: skeleton only, wire up in M1 W4");
}

export async function refreshPendingApprovals(_ctx: PluginContext): Promise<void> {
  throw new Error("paperclip-plugin-lark: skeleton only, wire up in M1 W4");
}
