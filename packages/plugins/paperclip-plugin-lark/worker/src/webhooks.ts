/**
 * Webhook receivers for 飞书 (Lark) event dispatcher + approval-card callback.
 *
 * Wired at W4-D5 per handoff/03-施工手册-M1.md §W4.3.
 *
 * SDK-surface deviation: `ctx.http` is `PluginHttpClient` with only `.fetch()`
 * for outbound requests — there is no `ctx.http.register()` for HTTP endpoints.
 * Inbound webhooks are declared in the manifest (`webhooks: [...]`) and routed
 * to the plugin's single `onWebhook(input: PluginWebhookInput)` lifecycle hook,
 * which dispatches on `input.endpointKey`. We keep two exported handlers here
 * for testability + separation-of-concerns; `worker.ts` glues them into
 * `onWebhook` in a single switch.
 *
 * 安全（handoff/06 §6）: verification token / encrypt_key are 走 `ctx.secrets.resolve()`,
 * 不 hardcode, 不写 .env.
 *
 * Signature spec (飞书官方):
 *   sig = base64(hmac_sha256(encrypt_key, timestamp + nonce + encrypt_key + body))
 *   headers: X-Lark-Signature / X-Lark-Request-Timestamp / X-Lark-Request-Nonce
 *
 * Decrypt spec (飞书官方):
 *   key = sha256(encrypt_key)   // 32 bytes
 *   iv  = ciphertext[0..15]     // AES-256-CBC IV
 *   plaintext = AES-256-CBC-decrypt(ciphertext[16..], key, iv)
 *
 * Dedupe: event_id 存 ctx.state with TTL 30 天 (M1 用 state key + timestamp;
 * M2 换 real kv w/ TTL). The state read cost is low because 飞书 headers
 * carry a stable UUID and repeat within the same UUID is our re-delivery signal.
 */

import { createHmac, createHash, createDecipheriv } from "node:crypto";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { handleLarkApprovalCallback } from "./approval-sync.js";

export interface LarkWebhookRequest {
  headers: Record<string, string>;
  rawBody: string;
  parsedBody: Record<string, unknown>;
}

export interface LarkWebhookResponse {
  status: number;
  body?: Record<string, unknown>;
}

const DEDUPE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * 飞书 signature verification.
 *
 * `sig = base64(hmac_sha256(encrypt_key as key, timestamp + nonce + encrypt_key + body))`
 *
 * The client puts the sig into `X-Lark-Signature` (also matched case-insensitively).
 */
export function verifyLarkSignature(
  headers: Record<string, string>,
  rawBody: string,
  encryptKey: string,
): boolean {
  const timestamp = pickHeader(headers, "x-lark-request-timestamp");
  const nonce = pickHeader(headers, "x-lark-request-nonce");
  const sig = pickHeader(headers, "x-lark-signature");
  if (!timestamp || !nonce || !sig) return false;
  const hmac = createHmac("sha256", encryptKey);
  hmac.update(timestamp + nonce + encryptKey + rawBody);
  const expected = hmac.digest("base64");
  return timingSafeEq(expected, sig);
}

/**
 * AES-256-CBC decrypt per 飞书官方 encrypt_key spec.
 *
 * The base64 payload has the IV prepended:
 *   ciphertext = base64_decode(payload.encrypt)
 *   iv = ciphertext[0..15]
 *   body = AES-256-CBC-decrypt(ciphertext[16..], sha256(encrypt_key), iv)
 *
 * (The 飞书 docs describe this as `AES.CBC/PKCS7`. Node's default CBC padding
 * is PKCS7-compatible.)
 */
export function decryptLarkPayload(encrypted: string, encryptKey: string): string {
  const key = createHash("sha256").update(encryptKey).digest(); // 32 bytes
  const ciphertext = Buffer.from(encrypted, "base64");
  if (ciphertext.length < 32) {
    throw new Error("paperclip-plugin-lark: encrypted payload too short");
  }
  const iv = ciphertext.subarray(0, 16);
  const body = ciphertext.subarray(16);
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([decipher.update(body), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Main webhook: handshake, verify, decrypt, dedupe, dispatch.
 *
 * Response contract:
 *   - url_verification: `{ status: 200, body: { challenge } }`
 *   - normal event:     `{ status: 200 }` (飞书 requires 2xx within 3s)
 *   - signature fail:   `{ status: 401 }`
 *   - dedupe hit:       `{ status: 200 }` (silent skip)
 */
export async function verifyAndDispatchLarkEvent(
  ctx: PluginContext,
  req: LarkWebhookRequest,
): Promise<LarkWebhookResponse> {
  const encryptKey = safeSecret(ctx, "LARK_ENCRYPT_KEY");
  const verificationToken = safeSecret(ctx, "LARK_VERIFICATION_TOKEN");

  // 1. Payload materialization (decrypt if configured)
  let payload: Record<string, unknown> = req.parsedBody;
  if (typeof payload.encrypt === "string") {
    const key = await encryptKey;
    if (!key) {
      ctx.logger.error("Encrypted 飞书 payload received but LARK_ENCRYPT_KEY not configured");
      return { status: 400 };
    }
    try {
      const plaintext = decryptLarkPayload(payload.encrypt, key);
      payload = JSON.parse(plaintext) as Record<string, unknown>;
    } catch (err) {
      ctx.logger.error("Failed to decrypt 飞书 payload", { err: String(err) });
      return { status: 400 };
    }
  }

  // 2. URL verification handshake (飞书 sends {type: "url_verification", challenge, token})
  if (payload.type === "url_verification") {
    const token = await verificationToken;
    if (token && payload.token && payload.token !== token) {
      ctx.logger.warn("飞书 url_verification token mismatch");
      return { status: 401 };
    }
    return {
      status: 200,
      body: { challenge: String(payload.challenge ?? "") },
    };
  }

  // 3. Signature verification (skip if no encrypt_key configured; V2 events
  //    only sign when encryption is enabled, so this matches 飞书 behavior)
  const key = await encryptKey;
  if (key) {
    if (!verifyLarkSignature(req.headers, req.rawBody, key)) {
      ctx.logger.warn("飞书 signature check failed", {
        sig: pickHeader(req.headers, "x-lark-signature"),
      });
      return { status: 401 };
    }
  }

  // 4. Token check (V2 header schema stores token inside payload.header.token)
  const token = await verificationToken;
  const eventHeader = (payload.header ?? {}) as Record<string, unknown>;
  if (token && eventHeader.token && eventHeader.token !== token) {
    ctx.logger.warn("飞书 event token mismatch");
    return { status: 401 };
  }

  // 5. Dedupe by event_id (30-day TTL)
  const eventId =
    (eventHeader.event_id as string | undefined) ??
    (payload.uuid as string | undefined) ??
    "";
  if (eventId) {
    const scopeKey = { scopeKind: "instance" as const, stateKey: `lark:event:${eventId}` };
    const seen = (await ctx.state.get(scopeKey)) as
      | { seenAt: string }
      | null
      | undefined;
    if (seen && typeof seen === "object" && "seenAt" in seen) {
      const seenMs = Date.parse(seen.seenAt);
      if (Number.isFinite(seenMs) && Date.now() - seenMs < DEDUPE_TTL_MS) {
        ctx.logger.debug("skip duplicate 飞书 event", { eventId });
        return { status: 200 };
      }
    }
    await ctx.state.set(scopeKey, { seenAt: new Date().toISOString() });
  }

  // 6. Dispatch by event type
  const eventType = (eventHeader.event_type as string | undefined) ?? (payload.type as string | undefined);
  const eventBody = (payload.event ?? {}) as Record<string, unknown>;
  try {
    switch (eventType) {
      case "im.message.receive_v1":
        await handleMessageReceive(ctx, eventBody);
        break;
      case "im.chat.enter":
      case "im.chat.member.bot.added_v1":
      case "im.chat.member.user.added_v1":
        ctx.logger.info("飞书 event received (M1 skip)", { eventType });
        break;
      default:
        ctx.logger.debug("飞书 event unhandled (M1 skip)", { eventType });
        break;
    }
  } catch (err) {
    ctx.logger.error("飞书 event dispatch failed", {
      eventType,
      err: String(err),
    });
    return { status: 500 };
  }
  return { status: 200 };
}

/**
 * M1: log receipt + surface "已收到" back to the sender. Real message-driven
 * business flows (spawn issue / assign agent / ...) land in M2.
 */
async function handleMessageReceive(
  ctx: PluginContext,
  event: Record<string, unknown>,
): Promise<void> {
  const message = (event.message ?? {}) as Record<string, unknown>;
  const messageId = String(message.message_id ?? "");
  const chatId = String(message.chat_id ?? "");
  ctx.logger.info("飞书 message received", { messageId, chatId });
  // M1: no reply loop yet — replying triggers our own bot receipt without
  // an event.type filter, which needs a dedupe policy that respects our own
  // sender. Landing that fully in M2 as part of the message-driven flows.
}

/**
 * Interactive-card action callback. 飞书 posts card actions to a separate
 * callback URL that carries `{ action: { value }, open_id, operate_time, ... }`.
 * The `value` is the JSON we packed into the card button (see lark-client
 * `larkPostApprovalCard`).
 */
export async function handleLarkApprovalCallbackWebhook(
  ctx: PluginContext,
  req: LarkWebhookRequest,
): Promise<LarkWebhookResponse> {
  const encryptKey = await safeSecret(ctx, "LARK_ENCRYPT_KEY");

  let payload: Record<string, unknown> = req.parsedBody;
  if (typeof payload.encrypt === "string") {
    if (!encryptKey) return { status: 400 };
    try {
      payload = JSON.parse(decryptLarkPayload(payload.encrypt, encryptKey)) as Record<
        string,
        unknown
      >;
    } catch (err) {
      ctx.logger.error("Failed to decrypt 飞书 card callback", { err: String(err) });
      return { status: 400 };
    }
  }

  if (encryptKey && !verifyLarkSignature(req.headers, req.rawBody, encryptKey)) {
    ctx.logger.warn("飞书 card callback signature check failed");
    return { status: 401 };
  }

  // 飞书 URL verification also happens on card callback endpoint.
  if (payload.type === "url_verification") {
    return {
      status: 200,
      body: { challenge: String(payload.challenge ?? "") },
    };
  }

  const action = (payload.action ?? {}) as Record<string, unknown>;
  const rawValue = action.value;
  let value: Record<string, unknown> = {};
  if (typeof rawValue === "string") {
    try {
      value = JSON.parse(rawValue) as Record<string, unknown>;
    } catch {
      value = {};
    }
  } else if (rawValue && typeof rawValue === "object") {
    value = rawValue as Record<string, unknown>;
  }

  const approvalId = value.approvalId as string | undefined;
  const decision = value.action as "approve" | "reject" | undefined;
  const operator = String(payload.open_id ?? payload.user_id ?? "");
  const operatedAt =
    typeof payload.operate_time === "string"
      ? payload.operate_time
      : new Date().toISOString();

  if (!approvalId || !decision) {
    ctx.logger.warn("飞书 card callback missing approvalId/action", { value });
    return { status: 400 };
  }

  // Look up instanceCode via reverse index in approval-sync
  const scopeKey = { scopeKind: "instance" as const, stateKey: `lark:approval:${approvalId}` };
  const approvalState = (await ctx.state.get(scopeKey)) as
    | { instanceCode?: string }
    | null;
  const instanceCode = approvalState?.instanceCode ?? "";

  try {
    await handleLarkApprovalCallback(ctx, {
      instanceCode,
      status: decision === "approve" ? "approved" : "rejected",
      operator,
      operatedAt,
    });
  } catch (err) {
    ctx.logger.error("approval callback failed", { err: String(err), approvalId });
    return { status: 500 };
  }
  return { status: 200 };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function pickHeader(headers: Record<string, string>, name: string): string {
  const lname = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lname) return v;
  }
  return "";
}

function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

async function safeSecret(ctx: PluginContext, ref: string): Promise<string | null> {
  try {
    const value = await ctx.secrets.resolve(ref);
    return typeof value === "string" && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}
