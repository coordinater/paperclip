import { describe, expect, it, vi } from "vitest";
import { EmailClient, type EmailMessage } from "./email-client.js";

const msg: EmailMessage = {
  to: "target@example.com",
  from: "sender@ai-company.com",
  subject: "Hi",
  body_html: "<p>Hi</p>",
  body_text: "Hi",
};

describe("EmailClient · draft-only (D-M4-07 v0.1 default)", () => {
  it("returns draft status without network I/O", async () => {
    const client = new EmailClient({ channel: "draft-only" });
    const result = await client.send(msg);
    expect(result.status).toBe("draft");
    expect(result.provider).toBe("draft-only");
    expect(result.message_id).toMatch(/^draft-/);
  });

  it("does not require API key for draft-only", async () => {
    const client = new EmailClient({ channel: "draft-only" });
    const result = await client.send(msg);
    expect(result.status).toBe("draft");
  });
});

describe("EmailClient · SendGrid (fetchImpl injection · Pattern-3)", () => {
  it("returns queued when SendGrid returns 202", async () => {
    const fakeFetch = vi.fn(async () =>
      new Response("", {
        status: 202,
        headers: new Headers({ "x-message-id": "sg-msg-123" }),
      }),
    );
    const client = new EmailClient({
      channel: "sendgrid",
      apiKey: "sg-key",
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });
    const result = await client.send(msg);
    expect(result.status).toBe("queued");
    expect(result.provider).toBe("sendgrid");
    expect(result.message_id).toBe("sg-msg-123");
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it("returns failed when SendGrid returns 4xx", async () => {
    const fakeFetch = vi.fn(async () => new Response("bad", { status: 400 }));
    const client = new EmailClient({
      channel: "sendgrid",
      apiKey: "sg-key",
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });
    const result = await client.send(msg);
    expect(result.status).toBe("failed");
    expect(result.error).toContain("400");
  });

  it("fails without API key", async () => {
    const client = new EmailClient({ channel: "sendgrid" });
    const result = await client.send(msg);
    expect(result.status).toBe("failed");
    expect(result.error).toContain("SENDGRID_API_KEY missing");
  });

  it("uses default baseUrl if not overridden", async () => {
    let capturedUrl = "";
    const fakeFetch = vi.fn(async (url: string | URL) => {
      capturedUrl = String(url);
      return new Response("", { status: 202 });
    });
    const client = new EmailClient({
      channel: "sendgrid",
      apiKey: "sg-key",
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });
    await client.send(msg);
    expect(capturedUrl).toContain("sendgrid.com");
    expect(capturedUrl).toContain("/v3/mail/send");
  });
});

describe("EmailClient · SES / aliyun / tencent / smtp (scaffold M5+)", () => {
  it.each(["ses", "aliyun", "tencent", "smtp"] as const)(
    "%s returns failed with scaffold error",
    async (channel) => {
      const client = new EmailClient({ channel });
      const result = await client.send(msg);
      expect(result.status).toBe("failed");
      expect(result.error).toContain("scaffold only");
      expect(result.provider).toBe(channel);
    },
  );
});

describe("EmailClient · custom baseUrl override", () => {
  it("uses provided baseUrl instead of default", async () => {
    let capturedUrl = "";
    const fakeFetch = vi.fn(async (url: string | URL) => {
      capturedUrl = String(url);
      return new Response("", { status: 202 });
    });
    const client = new EmailClient({
      channel: "sendgrid",
      apiKey: "k",
      baseUrl: "https://custom.example.com",
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });
    await client.send(msg);
    expect(capturedUrl).toContain("custom.example.com");
  });
});
