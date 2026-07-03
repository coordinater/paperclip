/**
 * Wrapper around `@larksuite/node-sdk` — tenant token cache + retry + typed responses.
 *
 * Skeleton only. Generated at W3-D7 per handoff/03-施工手册-M1.md §W3.3.
 * Wire up in W4-D5 装配日 per handoff/03 §W4.3.
 *
 * 依赖引入（handoff/06-规范.md §1.6）: `@larksuite/node-sdk` 是飞书官方 SDK
 * (MIT, > 1000 star, 最近 commit 在 3 个月内)，符合红线。W3-D7 skeleton 阶段
 * 只声明 TODO，不做 `pnpm add` — 由 W4-D5 装配日统一引入.
 *
 * Secrets（handoff/06 §6.1）: LARK_APP_ID / LARK_APP_SECRET 走 `ctx.secrets.get(...)`,
 * 从 `company_secrets` 表读，不落盘、不入日志.
 *
 * 为什么单独一个 wrapper 层：飞书 SDK 每次 SDK 升级都可能 breaking，用 wrapper
 * 隔离一次，避免 approval-sync.ts / webhooks.ts 里散布 SDK 直调.
 *
 * TODO(W4-D5):
 *   - createLarkClient(ctx) → 返回 tenant token 自动刷新的 client instance
 *   - larkSendMessage(client, { chatId, msgType, content }) → 发群消息
 *   - larkPostApprovalCard(client, { chatId, template, formData }) → 发审批卡片
 *   - larkGetApprovalInstance(client, instanceCode) → 拉审批详情（对账用）
 *   - larkReplyToThread(client, { rootMessageId, content }) → 线程内回复
 *   - Rate limit: tenant token 5 req/s（飞书官方文档），wrapper 内加令牌桶.
 *   - Retry: 429/500 自动指数退避（3 次），SDK 内置，wrapper 只暴露 config.
 */

// TODO(W4-D5): pnpm add @larksuite/node-sdk 后取消注释
// import * as lark from "@larksuite/node-sdk";
import type { PluginContext } from "@paperclipai/plugin-sdk";

export interface LarkClientHandle {
  readonly appId: string;
  // TODO(W4-D5): 添加 readonly sdk: lark.Client;
}

export interface LarkSendMessageParams {
  chatId: string;
  msgType: "text" | "post" | "interactive";
  content: string | Record<string, unknown>;
}

export interface LarkPostApprovalCardParams {
  chatId: string;
  approvalCode: string;
  formData: Record<string, unknown>;
}

export async function createLarkClient(_ctx: PluginContext): Promise<LarkClientHandle> {
  throw new Error("paperclip-plugin-lark: skeleton only, wire up in M1 W4");
}

export async function larkSendMessage(
  _client: LarkClientHandle,
  _params: LarkSendMessageParams,
): Promise<{ messageId: string }> {
  throw new Error("paperclip-plugin-lark: skeleton only, wire up in M1 W4");
}

export async function larkPostApprovalCard(
  _client: LarkClientHandle,
  _params: LarkPostApprovalCardParams,
): Promise<{ instanceCode: string }> {
  throw new Error("paperclip-plugin-lark: skeleton only, wire up in M1 W4");
}

export async function larkGetApprovalInstance(
  _client: LarkClientHandle,
  _instanceCode: string,
): Promise<{ status: string; approvers: string[] }> {
  throw new Error("paperclip-plugin-lark: skeleton only, wire up in M1 W4");
}
