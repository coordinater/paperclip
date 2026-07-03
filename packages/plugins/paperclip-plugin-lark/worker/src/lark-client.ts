/**
 * Wrapper around `@larksuiteoapi/node-sdk` — tenant token cache + typed responses.
 *
 * Wired at W4-D5 per handoff/03-施工手册-M1.md §W4.3.
 *
 * Package name deviation (from handoff/06 §1.6 sanction):
 *   The handoff sanctions "@larksuite/node-sdk" but the actual published package
 *   on npm is `@larksuiteoapi/node-sdk` (still MIT, > 600 dependents, ~2M weekly
 *   downloads, last release within 3 months). Same repository (larksuite/node-sdk)
 *   — the docs just used the shorter GitHub org name. Sanction still applies.
 *
 * M1 audio simplification: **approval cards are simulated with 飞书 interactive
 * cards, not real 飞书审批 (approval.v4)**. Rationale:
 *   1. Real 飞书审批 requires an approval definition (`approvalCode`) that is
 *      created + reviewed inside the 飞书 admin console — that provisioning is
 *      out of scope for a code-level bootstrap.
 *   2. Interactive cards support the same "batch/reject button + callback" UX
 *      end-to-end using just the `im.v1.message.create` API, which we already
 *      confirmed works at W3 (see reports/status-w3-partial.md).
 *   3. M2 upgrade path: swap `larkPostApprovalCard` to call
 *      `client.approval.v4.instance.create` + register 飞书审批 definitions.
 *
 * Secrets (handoff/06 §6.1): LARK_APP_ID / LARK_APP_SECRET go through
 * `ctx.secrets.resolve(...)` — SDK naming deviation from TODO (`.get` doesn't
 * exist; the actual SDK surface is `PluginSecretsClient.resolve`).
 */

import * as lark from "@larksuiteoapi/node-sdk";
import type { PluginContext } from "@paperclipai/plugin-sdk";

export interface LarkClientHandle {
  readonly appId: string;
  readonly sdk: lark.Client;
}

export interface LarkSendMessageParams {
  chatId: string;
  msgType: "text" | "post" | "interactive";
  content: string | Record<string, unknown>;
}

export interface LarkPostApprovalCardParams {
  chatId: string;
  approvalId: string;
  approvalCode: string;
  formData: Record<string, unknown>;
}

/**
 * Build a fresh `lark.Client` for the current plugin context. The SDK carries
 * a built-in tenant-access-token cache internally (see IClientParams.cache),
 * so caller-side caching is not needed — every call re-uses the SDK's default
 * `internalCache`.
 */
export async function createLarkClient(
  ctx: PluginContext,
): Promise<LarkClientHandle> {
  const appId = await ctx.secrets.resolve("LARK_APP_ID");
  const appSecret = await ctx.secrets.resolve("LARK_APP_SECRET");
  if (!appId || !appSecret) {
    throw new Error(
      "paperclip-plugin-lark: LARK_APP_ID / LARK_APP_SECRET missing in company secrets",
    );
  }
  const sdk = new lark.Client({
    appId,
    appSecret,
    // Default: Feishu domain. Lark international deployments swap via config.
    // W3 verified with cli_aacd9209b1fa5bd7 on feishu.cn (see reports/status-w3-partial.md).
    domain: lark.Domain.Feishu,
    // SelfBuild: match the W3 authenticated app (see reports/status-w3-partial.md).
    appType: lark.AppType.SelfBuild,
    disableTokenCache: false,
  });
  return { appId, sdk };
}

export async function larkSendMessage(
  client: LarkClientHandle,
  params: LarkSendMessageParams,
): Promise<{ messageId: string }> {
  const contentStr =
    typeof params.content === "string"
      ? params.content
      : JSON.stringify(params.content);
  const resp = await client.sdk.im.v1.message.create({
    params: { receive_id_type: "chat_id" },
    data: {
      receive_id: params.chatId,
      msg_type: params.msgType,
      content: contentStr,
    },
  });
  const messageId = (resp as { data?: { message_id?: string } })?.data?.message_id;
  if (!messageId) {
    throw new Error(
      `paperclip-plugin-lark: im.v1.message.create returned no message_id (resp=${JSON.stringify(resp)})`,
    );
  }
  return { messageId };
}

/**
 * M1: emit an interactive card ("approval card") into the bound 飞书 chat.
 * M2: swap to real 飞书审批 (`client.approval.v4.instance.create`).
 *
 * The instanceCode is a synthetic string `card-${messageId}` so downstream
 * lookups still work through the same reverse index. When we switch to real
 * 飞书审批 in M2, this returns the real instance_code from that API and the
 * rest of `approval-sync.ts` doesn't need to change.
 */
export async function larkPostApprovalCard(
  client: LarkClientHandle,
  params: LarkPostApprovalCardParams,
): Promise<{ instanceCode: string; messageId: string }> {
  const card = {
    config: { wide_screen_mode: true },
    header: {
      title: {
        tag: "plain_text",
        content: `PaperClip approval: ${params.approvalCode}`,
      },
      template: "blue",
    },
    elements: [
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: `**Approval ID**: ${params.approvalId}\n**Payload**:\n\`\`\`json\n${JSON.stringify(
            params.formData,
            null,
            2,
          )}\n\`\`\``,
        },
      },
      {
        tag: "action",
        actions: [
          {
            tag: "button",
            text: { tag: "plain_text", content: "批准" },
            type: "primary",
            value: {
              action: "approve",
              approvalId: params.approvalId,
            },
          },
          {
            tag: "button",
            text: { tag: "plain_text", content: "拒绝" },
            type: "danger",
            value: {
              action: "reject",
              approvalId: params.approvalId,
            },
          },
        ],
      },
    ],
  };

  const { messageId } = await larkSendMessage(client, {
    chatId: params.chatId,
    msgType: "interactive",
    content: card,
  });
  return { instanceCode: `card-${messageId}`, messageId };
}

/**
 * M1: since the "instance" is really a card + local plugin state, we resolve
 * status from `ctx.state` at the caller (see approval-sync.ts). This stub
 * exists so M2 can swap in a real client.approval.v4.instance.get without
 * touching approval-sync's signature.
 */
export async function larkGetApprovalInstance(
  _client: LarkClientHandle,
  _instanceCode: string,
): Promise<{ status: string; approvers: string[] }> {
  return { status: "pending", approvers: [] };
}
