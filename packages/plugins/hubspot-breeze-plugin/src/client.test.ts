import { describe, expect, it, vi } from "vitest";
import { HubspotClient, HubspotHttpError } from "./client.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("HubspotClient · constructor", () => {
  it("requires apiKey", () => {
    expect(() => new HubspotClient({ apiKey: "" })).toThrow(/apiKey required/);
  });
  it("strips trailing slashes from baseUrl", async () => {
    const fetchImpl = vi.fn(async (url) => {
      expect(url).toBe("https://api.hubapi.com/crm/v3/objects/contacts");
      return jsonResponse({ id: "1" });
    });
    const c = new HubspotClient({ apiKey: "k", baseUrl: "https://api.hubapi.com/", fetchImpl });
    await c.createContact({ properties: { email: "a@x.com" } });
  });
});

describe("HubspotClient · createContact", () => {
  it("posts flattened properties + returns id + url", async () => {
    const fetchImpl = vi.fn(async (url, init?: RequestInit) => {
      expect(url).toContain("/crm/v3/objects/contacts");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(init?.body as string);
      expect(body.properties.email).toBe("mark@ai");
      expect(body.properties.firstname).toBe("Mark");
      return jsonResponse({ id: "42", properties: { email: "mark@ai" } });
    });
    const c = new HubspotClient({ apiKey: "k", fetchImpl });
    const r = await c.createContact({
      properties: { email: "mark@ai", firstname: "Mark" },
    });
    expect(r.contact_id).toBe("42");
    expect(r.hubspot_url).toContain("/contacts/42");
  });

  it("merges extra properties", async () => {
    const fetchImpl = vi.fn(async (_url, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string);
      expect(body.properties.utm_source).toBe("blog");
      return jsonResponse({ id: "1", properties: { email: "a@x.com" } });
    });
    const c = new HubspotClient({ apiKey: "k", fetchImpl });
    await c.createContact({
      properties: { email: "a@x.com", extra: { utm_source: "blog" } },
    });
  });

  it("throws HubspotHttpError on non-2xx (non-idempotent)", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad", { status: 500 }));
    const c = new HubspotClient({ apiKey: "k", fetchImpl });
    await expect(
      c.createContact({ properties: { email: "a@x.com" } }),
    ).rejects.toBeInstanceOf(HubspotHttpError);
  });

  it("returns existing contact on 409 when idempotent=true", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async (url, init?: RequestInit) => {
      call++;
      if (call === 1) {
        // first: create → 409 conflict
        return new Response("conflict", { status: 409 });
      }
      // second: search → returns existing
      expect(url).toContain("/contacts/search");
      const body = JSON.parse(init?.body as string);
      expect(body.filterGroups[0].filters[0].value).toBe("dup@x.com");
      return jsonResponse({
        results: [{ id: "existing-99", properties: { email: "dup@x.com" } }],
      });
    });
    const c = new HubspotClient({ apiKey: "k", fetchImpl });
    const r = await c.createContact({
      properties: { email: "dup@x.com" },
      idempotent: true,
    });
    expect(r.contact_id).toBe("existing-99");
  });

  it("still throws on 409 when idempotent=false (default)", async () => {
    const fetchImpl = vi.fn(async () => new Response("conflict", { status: 409 }));
    const c = new HubspotClient({ apiKey: "k", fetchImpl });
    await expect(
      c.createContact({ properties: { email: "dup@x.com" } }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("findContactByEmail returns null on empty results", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ results: [] }));
    const c = new HubspotClient({ apiKey: "k", fetchImpl });
    expect(await c.findContactByEmail("nobody@x.com")).toBeNull();
  });
});

describe("HubspotClient · upsertDeal", () => {
  it("creates a deal with dealname + optional amount", async () => {
    const fetchImpl = vi.fn(async (url, init?: RequestInit) => {
      expect(url).toContain("/crm/v3/objects/deals");
      const body = JSON.parse(init?.body as string);
      expect(body.properties.dealname).toBe("Acme Q1");
      expect(body.properties.amount).toBe("50000");
      return jsonResponse({ id: "deal-1" });
    });
    const c = new HubspotClient({ apiKey: "k", fetchImpl });
    const r = await c.upsertDeal({ dealname: "Acme Q1", amount: 50000 });
    expect(r.deal_id).toBe("deal-1");
    expect(r.dealname).toBe("Acme Q1");
  });

  it("throws on 5xx", async () => {
    const fetchImpl = vi.fn(async () => new Response("boom", { status: 502 }));
    const c = new HubspotClient({ apiKey: "k", fetchImpl });
    await expect(c.upsertDeal({ dealname: "x" })).rejects.toBeInstanceOf(HubspotHttpError);
  });
});

describe("HubspotClient · triggerWorkflow", () => {
  it("enrolls a contact and returns enrollment record", async () => {
    const fetchImpl = vi.fn(async (url) => {
      expect(url).toContain("/automation/v2/workflows/wf-42/enrollments/contacts/");
      expect(url).toContain(encodeURIComponent("user@ai-company.example"));
      return jsonResponse({});
    });
    const c = new HubspotClient({ apiKey: "k", fetchImpl });
    const r = await c.triggerWorkflow({
      workflow_id: "wf-42",
      contact_email: "user@ai-company.example",
    });
    expect(r.workflow_id).toBe("wf-42");
    expect(r.enrolled_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("throws on 404 (workflow not found)", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 404 }));
    const c = new HubspotClient({ apiKey: "k", fetchImpl });
    await expect(
      c.triggerWorkflow({ workflow_id: "missing", contact_email: "x@y.com" }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("HubspotClient · auth headers", () => {
  it("sends Authorization: Bearer <apiKey>", async () => {
    const fetchImpl = vi.fn(async (_url, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string>)?.authorization;
      expect(auth).toBe("Bearer test-key-abc");
      return jsonResponse({ id: "x", properties: { email: "a@x.com" } });
    });
    const c = new HubspotClient({ apiKey: "test-key-abc", fetchImpl });
    await c.createContact({ properties: { email: "a@x.com" } });
  });
});
