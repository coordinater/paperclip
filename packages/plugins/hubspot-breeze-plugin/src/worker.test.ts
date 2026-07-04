import { describe, expect, it, vi } from "vitest";
import {
  HubspotClient,
  onWebhook,
  parseCreateContact,
  parseUpsertDeal,
  parseTriggerWorkflow,
} from "./worker.js";
import type { HubspotPluginCtx } from "./worker.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("parsers", () => {
  it("parseCreateContact accepts valid", () => {
    const r = parseCreateContact({ properties: { email: "a@x.com", firstname: "A" } });
    expect(r.ok).toBe(true);
  });
  it("parseCreateContact rejects missing/invalid email", () => {
    expect(parseCreateContact({ properties: {} }).ok).toBe(false);
    expect(parseCreateContact({ properties: { email: "no-at-sign" } }).ok).toBe(false);
    expect(parseCreateContact({}).ok).toBe(false);
  });
  it("parseUpsertDeal rejects missing dealname", () => {
    expect(parseUpsertDeal({}).ok).toBe(false);
    expect(parseUpsertDeal({ dealname: "" }).ok).toBe(false);
  });
  it("parseUpsertDeal preserves amount + pipeline", () => {
    const r = parseUpsertDeal({ dealname: "Acme", amount: 1000, pipeline: "sales" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.amount).toBe(1000);
      expect(r.value.pipeline).toBe("sales");
    }
  });
  it("parseTriggerWorkflow validates both fields", () => {
    expect(parseTriggerWorkflow({}).ok).toBe(false);
    expect(parseTriggerWorkflow({ workflow_id: "x" }).ok).toBe(false);
    expect(parseTriggerWorkflow({ workflow_id: "x", contact_email: "no-at" }).ok).toBe(false);
    expect(
      parseTriggerWorkflow({ workflow_id: "x", contact_email: "a@x.com" }).ok,
    ).toBe(true);
  });
});

describe("onWebhook", () => {
  const makeCtx = (client: HubspotClient): HubspotPluginCtx => ({
    getClient: () => client,
  });

  it("returns 405 on non-POST", async () => {
    const client = new HubspotClient({ apiKey: "k", fetchImpl: vi.fn() });
    const r = await onWebhook(
      { endpointKey: "create-contact", method: "GET", body: {} },
      makeCtx(client),
    );
    expect(r.status).toBe(405);
  });

  it("returns 404 on unknown endpoint", async () => {
    const client = new HubspotClient({ apiKey: "k", fetchImpl: vi.fn() });
    const r = await onWebhook(
      { endpointKey: "does-not-exist", method: "POST", body: {} },
      makeCtx(client),
    );
    expect(r.status).toBe(404);
  });

  it("create-contact returns 200 + logs activity", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ id: "c-1", properties: { email: "u@x.com" } }),
    );
    const client = new HubspotClient({ apiKey: "k", fetchImpl });
    const logActivity = vi.fn(async () => {});

    const r = await onWebhook(
      {
        endpointKey: "create-contact",
        method: "POST",
        body: { properties: { email: "u@x.com" } },
      },
      { getClient: () => client, logActivity },
    );
    expect(r.status).toBe(200);
    expect((r.body as { contact_id: string }).contact_id).toBe("c-1");
    expect(logActivity).toHaveBeenCalledWith(
      "hubspot_contact_created",
      expect.objectContaining({ contact_id: "c-1", email: "u@x.com" }),
    );
  });

  it("upsert-deal returns 200 + deal_id", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: "d-42" }));
    const client = new HubspotClient({ apiKey: "k", fetchImpl });
    const r = await onWebhook(
      {
        endpointKey: "upsert-deal",
        method: "POST",
        body: { dealname: "Q4 launch" },
      },
      makeCtx(client),
    );
    expect(r.status).toBe(200);
    expect((r.body as { deal_id: string }).deal_id).toBe("d-42");
  });

  it("trigger-workflow returns 200 + enrollment record", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}));
    const client = new HubspotClient({ apiKey: "k", fetchImpl });
    const r = await onWebhook(
      {
        endpointKey: "trigger-workflow",
        method: "POST",
        body: { workflow_id: "wf-1", contact_email: "u@x.com" },
      },
      makeCtx(client),
    );
    expect(r.status).toBe(200);
    expect((r.body as { workflow_id: string }).workflow_id).toBe("wf-1");
  });

  it("returns 400 on invalid body", async () => {
    const client = new HubspotClient({ apiKey: "k", fetchImpl: vi.fn() });
    const r = await onWebhook(
      { endpointKey: "create-contact", method: "POST", body: {} },
      makeCtx(client),
    );
    expect(r.status).toBe(400);
  });

  it("maps HubspotHttpError to 502", async () => {
    const fetchImpl = vi.fn(async () => new Response("boom", { status: 502 }));
    const client = new HubspotClient({ apiKey: "k", fetchImpl });
    const r = await onWebhook(
      {
        endpointKey: "create-contact",
        method: "POST",
        body: { properties: { email: "a@x.com" } },
      },
      makeCtx(client),
    );
    expect(r.status).toBe(502);
  });
});
