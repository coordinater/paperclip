import { describe, expect, it, vi } from "vitest";
import { MeridianClient, MeridianHttpError } from "./client.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("MeridianClient", () => {
  it("health returns { ok: true } when upstream is healthy", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ meridian_version: "1.0.5" }),
    );
    const c = new MeridianClient({ baseUrl: "http://svc", fetchImpl });
    const h = await c.health();
    expect(h.ok).toBe(true);
    expect(h.meridian_version).toBe("1.0.5");
  });

  it("health returns { ok: false } on non-2xx", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));
    const c = new MeridianClient({ baseUrl: "http://svc", fetchImpl });
    const h = await c.health();
    expect(h.ok).toBe(false);
  });

  it("runMmm posts to /runs with json body and returns response", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(url).toBe("http://svc/runs");
      expect(init?.method).toBe("POST");
      expect(init?.body).toContain('"dataset_id":"campaign-2027"');
      return jsonResponse({ run_id: "run-123", status: "queued" });
    });
    const c = new MeridianClient({ baseUrl: "http://svc", fetchImpl });
    const r = await c.runMmm({
      dataset_id: "campaign-2027",
      date_range: { start: "2026-01-01", end: "2026-06-30" },
    });
    expect(r.run_id).toBe("run-123");
    expect(r.status).toBe("queued");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("runMmm throws MeridianHttpError on 4xx/5xx", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad", { status: 400 }));
    const c = new MeridianClient({ baseUrl: "http://svc", fetchImpl });
    await expect(
      c.runMmm({
        dataset_id: "x",
        date_range: { start: "2026-01-01", end: "2026-02-01" },
      }),
    ).rejects.toBeInstanceOf(MeridianHttpError);
  });

  it("getReport returns a running report when Meridian is still training", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ run_id: "run-123", status: "running" }),
    );
    const c = new MeridianClient({ baseUrl: "http://svc", fetchImpl });
    const rep = await c.getReport("run-123");
    expect(rep.status).toBe("running");
    expect(rep.report).toBeUndefined();
  });

  it("getReport returns full report when Meridian is completed", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        run_id: "run-123",
        status: "completed",
        finished_at: "2026-07-03T05:00:00Z",
        report: {
          channel_roi: [
            { channel: "tv", roi: 1.4 },
            { channel: "search", roi: 3.2 },
          ],
        },
      }),
    );
    const c = new MeridianClient({ baseUrl: "http://svc", fetchImpl });
    const rep = await c.getReport("run-123");
    expect(rep.status).toBe("completed");
    expect(rep.report?.channel_roi).toHaveLength(2);
  });

  it("getReport throws with status=404 for unknown run_id", async () => {
    const fetchImpl = vi.fn(async () => new Response("not found", { status: 404 }));
    const c = new MeridianClient({ baseUrl: "http://svc", fetchImpl });
    await expect(c.getReport("missing"))
      .rejects.toMatchObject({ status: 404 });
  });

  it("getReport rejects empty run_id", async () => {
    const c = new MeridianClient({ baseUrl: "http://svc" });
    await expect(c.getReport("")).rejects.toThrow(/run_id required/);
  });

  it("includes bearer token when authToken configured", async () => {
    const fetchImpl = vi.fn(async (_url, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string>)?.authorization;
      expect(auth).toBe("Bearer secret-token");
      return jsonResponse({ ok: true });
    });
    const c = new MeridianClient({
      baseUrl: "http://svc",
      authToken: "secret-token",
      fetchImpl,
    });
    await c.health();
  });

  it("strips trailing slashes from baseUrl", async () => {
    const fetchImpl = vi.fn(async (url) => {
      expect(url).toBe("http://svc/health");
      return jsonResponse({});
    });
    const c = new MeridianClient({ baseUrl: "http://svc///", fetchImpl });
    await c.health();
  });
});
