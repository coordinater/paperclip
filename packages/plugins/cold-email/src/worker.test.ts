import { describe, expect, it } from "vitest";
import { detectUnsubscribeIntent, dispatchRoutine, dispatchWebhook } from "./worker.js";

describe("dispatchWebhook · create-sequence", () => {
  const validBody = {
    seed_list_id: "seed-1",
    seed_recipients: ["a@example.com"],
    target_industry: "B2B-SaaS-dev",
    template_id: "onb-1",
    sender_email: "hello@ai-company.com",
    channel: "draft-only",
    pacing: {
      max_per_day_per_domain: 50,
      warmup_target_sent: 50,
      warmup_deliverability_threshold: 0.8,
    },
  };

  it("returns 202 with sequence_id for valid body", () => {
    const res = dispatchWebhook({ endpointKey: "create-sequence", body: validBody });
    expect(res.status).toBe(202);
    const body = res.body as Record<string, unknown>;
    expect(body.sequence_id).toBeTypeOf("string");
    expect(body.steps_count).toBe(6);
  });

  it("returns 400 for non-object body", () => {
    const res = dispatchWebhook({ endpointKey: "create-sequence", body: "invalid" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing field", () => {
    const partial = { ...validBody };
    delete (partial as Record<string, unknown>).seed_list_id;
    const res = dispatchWebhook({ endpointKey: "create-sequence", body: partial });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("seed_list_id");
  });
});

describe("dispatchWebhook · handle-reply", () => {
  it("returns 200 with event when body has message_id + is_unsubscribe", () => {
    const res = dispatchWebhook({
      endpointKey: "handle-reply",
      body: { message_id: "msg-1", is_unsubscribe: false, sender: "s@example.com" },
    });
    expect(res.status).toBe(200);
    const body = res.body as { event: { kind: string; is_unsubscribe: boolean } };
    expect(body.event.kind).toBe("reply_received");
    expect(body.event.is_unsubscribe).toBe(false);
  });

  it("detects unsubscribe intent from body text when flag missing", () => {
    const res = dispatchWebhook({
      endpointKey: "handle-reply",
      body: {
        message_id: "msg-1",
        body: "Please unsubscribe me",
        sender: "s@example.com",
      },
    });
    const body = res.body as { event: { is_unsubscribe: boolean } };
    expect(body.event.is_unsubscribe).toBe(true);
  });

  it("returns 400 for invalid body", () => {
    const res = dispatchWebhook({ endpointKey: "handle-reply", body: {} });
    expect(res.status).toBe(400);
  });
});

describe("dispatchWebhook · handle-bounce", () => {
  it("returns 200 for hard bounce", () => {
    const res = dispatchWebhook({
      endpointKey: "handle-bounce",
      body: { message_id: "msg-1", bounce_kind: "hard" },
    });
    expect(res.status).toBe(200);
    const body = res.body as { event: { bounce_kind: string } };
    expect(body.event.bounce_kind).toBe("hard");
  });

  it("rejects unknown bounce_kind", () => {
    const res = dispatchWebhook({
      endpointKey: "handle-bounce",
      body: { message_id: "msg-1", bounce_kind: "weird" },
    });
    expect(res.status).toBe(400);
  });
});

describe("dispatchWebhook · unsubscribe", () => {
  it("returns 200 for valid token", () => {
    const res = dispatchWebhook({
      endpointKey: "unsubscribe",
      query: { token: "unsub_abc123" },
    });
    expect(res.status).toBe(200);
    const body = res.body as { unsubscribed: boolean };
    expect(body.unsubscribed).toBe(true);
  });

  it("returns 400 for missing token", () => {
    const res = dispatchWebhook({ endpointKey: "unsubscribe", query: {} });
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid token format", () => {
    const res = dispatchWebhook({
      endpointKey: "unsubscribe",
      query: { token: "not_a_token" },
    });
    expect(res.status).toBe(400);
  });
});

describe("dispatchWebhook · unknown endpoint", () => {
  it("returns 404 with error message", () => {
    const res = dispatchWebhook({ endpointKey: "unknown-key" });
    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toContain("unknown");
  });
});

describe("dispatchRoutine", () => {
  it("dispatches all 4 known routine keys", () => {
    const keys = ["warmup-tick", "reply-sweep", "bounce-sweep", "compliance-audit"];
    for (const k of keys) {
      const res = dispatchRoutine({ key: k });
      expect(res.status).toBe("ok");
    }
  });

  it("returns error for unknown routine key", () => {
    const res = dispatchRoutine({ key: "wat" });
    expect(res.status).toBe("error");
  });
});

describe("detectUnsubscribeIntent", () => {
  it.each([
    "please unsubscribe me",
    "STOP",
    "退订",
    "取消订阅",
    "please stop",
    "remove me from your list",
  ])("detects: %s", (text) => {
    expect(detectUnsubscribeIntent(text)).toBe(true);
  });

  it.each([
    "hello, thanks for reaching out!",
    "sure, tell me more",
    "interested · please share",
    "请介绍一下贵公司",
  ])("passes: %s", (text) => {
    expect(detectUnsubscribeIntent(text)).toBe(false);
  });
});
