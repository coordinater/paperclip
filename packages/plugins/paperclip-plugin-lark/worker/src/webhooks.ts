/**
 * Webhook receivers for 飞书 (Lark) event dispatcher + approval callback.
 *
 * Skeleton only. Generated at W3-D7 per handoff/03-施工手册-M1.md §W3.3.
 * Wire up in W4-D5 装配日 per handoff/03 §W4.3.
 *
 * API 层缓冲（handoff/06-规范.md §2.2）: 所有对外 HTTP endpoint 走
 * `/api/plugins/paperclip-plugin-lark/webhooks/*`，不注入到 core route table.
 * plugin worker 通过 `ctx.http.register()` 声明，host 会自动挂载到 plugin 前缀路径.
 *
 * 安全（handoff/06 §6）: verification token / encrypt_key 走 `ctx.secrets.get()`,
 * 不 hardcode，不写 .env. 校验流程：
 *   1. 校验 `X-Lark-Signature` (HMAC-SHA256 of timestamp+nonce+encrypt_key+body)
 *   2. 校验 payload.token === LARK_VERIFICATION_TOKEN
 *   3. 如果配置了 encrypt_key，解密 AES-256-CBC payload.encrypt 字段
 *
 * TODO(W4-D5):
 *   - verifyLarkSignature(headers, rawBody, encryptKey) — HMAC-SHA256 校验
 *   - decryptLarkPayload(encrypted, encryptKey) — AES-256-CBC 解密
 *   - handleLarkEvent(ctx, event) — 路由到 message.receive / p2p_chat_create / bot.add / ...
 *   - handleLarkApprovalCallback(ctx, payload) — 调 approval-sync.handleLarkApprovalCallback
 *   - 处理飞书 URL 验证握手 (payload.type === "url_verification" → 返回 { challenge }).
 *   - 幂等：以 event_id 为 key 去重（30 天 TTL）.
 */

import type { PluginContext } from "@paperclipai/plugin-sdk";

export interface LarkWebhookRequest {
  headers: Record<string, string>;
  rawBody: string;
  parsedBody: Record<string, unknown>;
}

export interface LarkWebhookResponse {
  status: number;
  body?: Record<string, unknown>;
}

export async function verifyAndDispatchLarkEvent(
  _ctx: PluginContext,
  _req: LarkWebhookRequest,
): Promise<LarkWebhookResponse> {
  throw new Error("paperclip-plugin-lark: skeleton only, wire up in M1 W4");
}

export async function handleLarkApprovalCallbackWebhook(
  _ctx: PluginContext,
  _req: LarkWebhookRequest,
): Promise<LarkWebhookResponse> {
  throw new Error("paperclip-plugin-lark: skeleton only, wire up in M1 W4");
}

export function verifyLarkSignature(
  _headers: Record<string, string>,
  _rawBody: string,
  _encryptKey: string,
): boolean {
  throw new Error("paperclip-plugin-lark: skeleton only, wire up in M1 W4");
}
