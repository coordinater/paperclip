import { describe, expect, it, vi } from "vitest";
import { onWebhook, parseRunRequest } from "./worker.js";
import { MeridianClient, MeridianHttpError } from "./client.js";
import type { MeridianPluginCtx } from "./worker.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("parseRunRequest", () => {
  it("accepts a minimal valid request", () => {
    const r = parseRunRequest({
      dataset_id: "campaign-2027",
      date_range: { start: "2026-01-01", end: "2026-06-30" },
    });
    expect(r.ok).toBe(true);
  });

  it("rejects non-object body", () => {
    expect(parseRunRequest(null).ok).toBe(false);
    expect(parseRunRequest([]).ok).toBe(false);
  });

  it("rejects missing dataset_id", () => {
    expect(
      parseRunRequest({ date_range: { start: "2026-01-01", end: "2026-02-01" } }).ok,
    ).toBe(false);
  });

  it("rejects missing/broken date_range", () => {
    expect(parseRunRequest({ dataset_id: "x" }).ok).toBe(false);
    expect(
      parseRunRequest({ dataset_id: "x", date_range: { start: "2026" } }).ok,
    ).toBe(false);
  });

  it("rejects non-ISO date_range values", () => {
    const r = parseRunRequest({
      dataset_id: "x",
      date_range: { start: "jan 1", end: "feb 1" },
    });
    expect(r.ok).toBe(false);
  });

  it("passes through optional seed/channels/fit_options", () => {
    const r = parseRunRequest({
      dataset_id: "x",
      date_range: { start: "2026-01-01", end: "2026-02-01" },
      seed: 42,
      channels: ["tv", "search"],
      fit_options: { n_iter: 200 },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.seed).toBe(42);
      expect(r.value.channels).toEqual(["tv", "search"]);
      expect(r.value.fit_options).toEqual({ n_iter: 200 });
    }
  });
});

describe("onWebhook", () => {
  const makeCtx = (client: MeridianClient): MeridianPluginCtx => ({
    getClient: () => client,
  });

  it("returns 404 for unknown endpoint", async () => {
    const client = new MeridianClient({ baseUrl: "http://svc", fetchImpl: vi.fn() });
    const r = await onWebhook({ endpointKey: "does-not-exist" }, makeCtx(client));
    expect(r.status).toBe(404);
  });

  it("run-mmm returns 405 for non-POST", async () => {
    const client = new MeridianClient({ baseUrl: "http://svc", fetchImpl: vi.fn() });
    const r = await onWebhook(
      { endpointKey: "run-mmm", method: "GET" },
      makeCtx(client),
    );
    expect(r.status).toBe(405);
  });

  it("run-mmm returns 400 for invalid body", async () => {
    const client = new MeridianClient({ baseUrl: "http://svc", fetchImpl: vi.fn() });
    const r = await onWebhook(
      { endpointKey: "run-mmm", method: "POST", body: {} },
      makeCtx(client),
    );
    expect(r.status).toBe(400);
  });

  it("run-mmm returns 200 + run_id on success + persists tracking", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ run_id: "run-99", status: "queued" }),
    );
    const client = new MeridianClient({ baseUrl: "http://svc", fetchImpl });
    const saveRunTracking = vi.fn(async () => {});
    const logActivity = vi.fn(async () => {});

    const r = await onWebhook(
      {
        endpointKey: "run-mmm",
        method: "POST",
        body: {
          dataset_id: "campaign-2027",
          date_range: { start: "2026-01-01", end: "2026-06-30" },
        },
      },
      { getClient: () => client, saveRunTracking, logActivity },
    );
    expect(r.status).toBe(200);
    expect((r.body as { run_id: string }).run_id).toBe("run-99");
    expect(saveRunTracking).toHaveBeenCalledOnce();
    expect(logActivity).toHaveBeenCalledWith("meridian_run_started", expect.any(Object));
  });

  it("run-mmm returns 502 when upstream errors", async () => {
    const fetchImpl = vi.fn(async () => new Response("boom", { status: 500 }));
    const client = new MeridianClient({ baseUrl: "http://svc", fetchImpl });
    const r = await onWebhook(
      {
        endpointKey: "run-mmm",
        method: "POST",
        body: {
          dataset_id: "x",
          date_range: { start: "2026-01-01", end: "2026-02-01" },
        },
      },
      makeCtx(client),
    );
    expect(r.status).toBe(502);
  });

  it("get-mmm-report returns 400 without run_id", async () => {
    const client = new MeridianClient({ baseUrl: "http://svc", fetchImpl: vi.fn() });
    const r = await onWebhook({ endpointKey: "get-mmm-report" }, makeCtx(client));
    expect(r.status).toBe(400);
  });

  it("get-mmm-report returns 200 for a completed run", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        run_id: "run-99",
        status: "completed",
        report: { channel_roi: [{ channel: "tv", roi: 1.5 }] },
      }),
    );
    const client = new MeridianClient({ baseUrl: "http://svc", fetchImpl });
    const r = await onWebhook(
      { endpointKey: "get-mmm-report", query: { run_id: "run-99" } },
      makeCtx(client),
    );
    expect(r.status).toBe(200);
    expect((r.body as { status: string }).status).toBe("completed");
  });

  it("get-mmm-report returns 404 for unknown run_id", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 404 }));
    const client = new MeridianClient({ baseUrl: "http://svc", fetchImpl });
    const r = await onWebhook(
      { endpointKey: "get-mmm-report", query: { run_id: "missing" } },
      makeCtx(client),
    );
    expect(r.status).toBe(404);
  });

  it("get-mmm-report also honors body.run_id when query missing", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ run_id: "run-42", status: "running" }),
    );
    const client = new MeridianClient({ baseUrl: "http://svc", fetchImpl });
    const r = await onWebhook(
      {
        endpointKey: "get-mmm-report",
        method: "POST",
        body: { run_id: "run-42" },
      },
      makeCtx(client),
    );
    expect(r.status).toBe(200);
  });
});
