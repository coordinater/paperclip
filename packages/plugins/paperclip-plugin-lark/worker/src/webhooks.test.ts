import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  verifyLarkSignature,
  verifyAndDispatchLarkEvent,
  handleLarkApprovalCallbackWebhook,
  type LarkWebhookRequest,
} from "./webhooks.js";
import { createMockCtx } from "./test-mock-ctx.js";

const ENCRYPT_KEY = "test-encrypt-key-abcdef123456";
const VERIFICATION_TOKEN = "test-verification-token-xyz";

function signedRequest(body: Record<string, unknown>, opts?: {
  timestamp?: string;
  nonce?: string;
  encryptKey?: string;
}): LarkWebhookRequest {
  const timestamp = opts?.timestamp ?? String(Math.floor(Date.now() / 1000));
  const nonce = opts?.nonce ?? "test-nonce-1";
  const encryptKey = opts?.encryptKey ?? ENCRYPT_KEY;
  const rawBody = JSON.stringify(body);
  const sig = createHmac("sha256", encryptKey)
    .update(timestamp + nonce + encryptKey + rawBody)
    .digest("base64");
  return {
    headers: {
      "X-Lark-Request-Timestamp": timestamp,
      "X-Lark-Request-Nonce": nonce,
      "X-Lark-Signature": sig,
    },
    rawBody,
    parsedBody: body,
  };
}

describe("verifyLarkSignature", () => {
  it("passes for a correctly signed body", () => {
    const rawBody = JSON.stringify({ hello: "world" });
    const timestamp = "1720000000";
    const nonce = "n1";
    const sig = createHmac("sha256", ENCRYPT_KEY)
      .update(timestamp + nonce + ENCRYPT_KEY + rawBody)
      .digest("base64");
    const headers = {
      "X-Lark-Request-Timestamp": timestamp,
      "X-Lark-Request-Nonce": nonce,
      "X-Lark-Signature": sig,
    };
    expect(verifyLarkSignature(headers, rawBody, ENCRYPT_KEY)).toBe(true);
  });

  it("fails for a tampered body", () => {
    const rawBody = JSON.stringify({ hello: "world" });
    const timestamp = "1720000000";
    const nonce = "n1";
    const sig = createHmac("sha256", ENCRYPT_KEY)
      .update(timestamp + nonce + ENCRYPT_KEY + rawBody)
      .digest("base64");
    const headers = {
      "X-Lark-Request-Timestamp": timestamp,
      "X-Lark-Request-Nonce": nonce,
      "X-Lark-Signature": sig,
    };
    // Tamper the body
    expect(verifyLarkSignature(headers, rawBody + "TAMPER", ENCRYPT_KEY)).toBe(false);
  });

  it("fails when the signature header is missing", () => {
    expect(
      verifyLarkSignature(
        { "X-Lark-Request-Timestamp": "t", "X-Lark-Request-Nonce": "n" },
        "body",
        ENCRYPT_KEY,
      ),
    ).toBe(false);
  });

  it("handles case-insensitive headers", () => {
    const rawBody = "{}";
    const timestamp = "1720000000";
    const nonce = "n1";
    const sig = createHmac("sha256", ENCRYPT_KEY)
      .update(timestamp + nonce + ENCRYPT_KEY + rawBody)
      .digest("base64");
    const headers = {
      "x-lark-request-timestamp": timestamp,
      "x-lark-request-nonce": nonce,
      "x-lark-signature": sig,
    };
    expect(verifyLarkSignature(headers, rawBody, ENCRYPT_KEY)).toBe(true);
  });
});

describe("verifyAndDispatchLarkEvent — url_verification", () => {
  it("returns the challenge for url_verification handshake", async () => {
    const ctx = createMockCtx({
      secrets: {
        LARK_ENCRYPT_KEY: ENCRYPT_KEY,
        LARK_VERIFICATION_TOKEN: VERIFICATION_TOKEN,
      },
    });
    const body = {
      type: "url_verification",
      challenge: "abc123",
      token: VERIFICATION_TOKEN,
    };
    const req: LarkWebhookRequest = {
      headers: {},
      rawBody: JSON.stringify(body),
      parsedBody: body,
    };
    const resp = await verifyAndDispatchLarkEvent(ctx, req);
    expect(resp.status).toBe(200);
    expect(resp.body).toEqual({ challenge: "abc123" });
  });

  it("rejects url_verification with a mismatched token", async () => {
    const ctx = createMockCtx({
      secrets: {
        LARK_ENCRYPT_KEY: ENCRYPT_KEY,
        LARK_VERIFICATION_TOKEN: VERIFICATION_TOKEN,
      },
    });
    const body = {
      type: "url_verification",
      challenge: "abc123",
      token: "wrong-token",
    };
    const req: LarkWebhookRequest = {
      headers: {},
      rawBody: JSON.stringify(body),
      parsedBody: body,
    };
    const resp = await verifyAndDispatchLarkEvent(ctx, req);
    expect(resp.status).toBe(401);
  });
});

describe("verifyAndDispatchLarkEvent — dispatch + dedupe", () => {
  it("skips duplicate events based on event_id", async () => {
    const ctx = createMockCtx({
      secrets: {
        LARK_ENCRYPT_KEY: ENCRYPT_KEY,
        LARK_VERIFICATION_TOKEN: VERIFICATION_TOKEN,
      },
    });
    const eventBody = {
      schema: "2.0",
      header: {
        event_id: "evt-1",
        event_type: "im.message.receive_v1",
        token: VERIFICATION_TOKEN,
        create_time: "1720000000",
      },
      event: {
        sender: { sender_id: { open_id: "ou_test" } },
        message: {
          message_id: "om_test",
          chat_id: "oc_test",
          message_type: "text",
          content: '{"text":"hi"}',
        },
      },
    };
    const req = signedRequest(eventBody);
    const resp1 = await verifyAndDispatchLarkEvent(ctx, req);
    expect(resp1.status).toBe(200);
    // dedupe hit — same event_id
    const req2 = signedRequest(eventBody);
    const resp2 = await verifyAndDispatchLarkEvent(ctx, req2);
    expect(resp2.status).toBe(200);
    const debugLogs = ctx.__logs.filter((l) => l.level === "debug");
    const dedupeHit = debugLogs.find(
      (l) => l.message === "skip duplicate 飞书 event",
    );
    expect(dedupeHit).toBeDefined();
    expect(dedupeHit?.meta).toEqual({ eventId: "evt-1" });
  });

  it("rejects requests with an invalid signature", async () => {
    const ctx = createMockCtx({
      secrets: {
        LARK_ENCRYPT_KEY: ENCRYPT_KEY,
        LARK_VERIFICATION_TOKEN: VERIFICATION_TOKEN,
      },
    });
    const eventBody = {
      schema: "2.0",
      header: {
        event_id: "evt-2",
        event_type: "im.message.receive_v1",
        token: VERIFICATION_TOKEN,
      },
      event: {},
    };
    const req = signedRequest(eventBody);
    // Tamper the sig
    req.headers["X-Lark-Signature"] = "not-a-real-sig";
    const resp = await verifyAndDispatchLarkEvent(ctx, req);
    expect(resp.status).toBe(401);
  });
});

describe("handleLarkApprovalCallbackWebhook", () => {
  it("routes an 'approve' card action to approval-sync", async () => {
    const ctx = createMockCtx({
      secrets: {
        LARK_ENCRYPT_KEY: ENCRYPT_KEY,
      },
    });
    // Seed the approval link + instance index so callback can resolve
    await ctx.state.set(
      { scopeKind: "instance", stateKey: "lark:approval:approval-1" },
      {
        approvalId: "approval-1",
        approvalType: "hire_agent",
        companyId: "co-1",
        instanceCode: "card-om_test",
        chatId: "oc_test",
        cardMessageId: "om_test",
        createdAt: new Date().toISOString(),
        status: "pending",
      },
    );
    await ctx.state.set(
      { scopeKind: "instance", stateKey: "lark:instance:card-om_test" },
      { approvalId: "approval-1" },
    );

    const callbackBody = {
      action: {
        value: { action: "approve", approvalId: "approval-1" },
      },
      open_id: "ou_operator",
      operate_time: "2026-07-03T00:00:00Z",
    };
    const req = signedRequest(callbackBody);
    const resp = await handleLarkApprovalCallbackWebhook(ctx, req);
    expect(resp.status).toBe(200);
    // approval link should now be `approved`
    const link = await ctx.state.get({
      scopeKind: "instance",
      stateKey: "lark:approval:approval-1",
    });
    expect((link as { status: string }).status).toBe("approved");
    expect(ctx.__activityLog.length).toBeGreaterThanOrEqual(1);
  });
});
