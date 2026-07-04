/**
 * Meridian MMM plugin worker.
 *
 * Wires webhook inputs to MeridianClient + persists run_id → status mapping
 * to plugin_state so the caller can poll get-mmm-report cheaply.
 */

import { MeridianClient } from "./client.js";
import type { MmmReport, RunMmmRequest } from "./client.js";
export { default as manifest } from "./manifest.js";
export { MeridianClient, MeridianHttpError } from "./client.js";

export interface WebhookInput {
  endpointKey: string;
  method?: string;
  body?: unknown;
  query?: Record<string, string>;
}

export interface WebhookResponse {
  status: number;
  body?: unknown;
}

export interface MeridianPluginCtx {
  /** Return a configured MeridianClient. In production wire this to plugin config. */
  getClient: () => Promise<MeridianClient> | MeridianClient;
  /** Persist run tracking. Optional in tests. */
  saveRunTracking?: (run_id: string, request: RunMmmRequest) => Promise<void>;
  logActivity?: (action: string, details: Record<string, unknown>) => Promise<void>;
}

export async function onWebhook(
  input: WebhookInput,
  ctx: MeridianPluginCtx,
): Promise<WebhookResponse> {
  switch (input.endpointKey) {
    case "run-mmm":
      return await handleRunMmm(input, ctx);
    case "get-mmm-report":
      return await handleGetReport(input, ctx);
    default:
      return {
        status: 404,
        body: { error: "unknown_endpoint", endpointKey: input.endpointKey },
      };
  }
}

async function handleRunMmm(
  input: WebhookInput,
  ctx: MeridianPluginCtx,
): Promise<WebhookResponse> {
  if (input.method && input.method.toUpperCase() !== "POST") {
    return { status: 405, body: { error: "method_not_allowed", allowed: ["POST"] } };
  }
  const parsed = parseRunRequest(input.body);
  if (!parsed.ok) {
    return { status: 400, body: { error: "invalid_body", detail: parsed.error } };
  }
  const req = parsed.value;

  try {
    const client = await ctx.getClient();
    const resp = await client.runMmm(req);
    await ctx.saveRunTracking?.(resp.run_id, req);
    await ctx.logActivity?.("meridian_run_started", {
      run_id: resp.run_id,
      dataset_id: req.dataset_id,
      date_range: req.date_range,
    });
    return { status: 200, body: resp };
  } catch (err) {
    return {
      status: 502,
      body: {
        error: "meridian_upstream_error",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

async function handleGetReport(
  input: WebhookInput,
  ctx: MeridianPluginCtx,
): Promise<WebhookResponse> {
  const run_id = readRunIdFromRequest(input);
  if (!run_id) return { status: 400, body: { error: "run_id required" } };

  try {
    const client = await ctx.getClient();
    const report: MmmReport = await client.getReport(run_id);
    return { status: 200, body: report };
  } catch (err) {
    if (err instanceof Error && "status" in err && (err as { status?: number }).status === 404) {
      return { status: 404, body: { error: "run_not_found", run_id } };
    }
    return {
      status: 502,
      body: {
        error: "meridian_upstream_error",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseRunRequest(raw: unknown): ParseResult<RunMmmRequest> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const obj = raw as Record<string, unknown>;
  const dataset_id = typeof obj.dataset_id === "string" ? obj.dataset_id.trim() : "";
  if (!dataset_id) return { ok: false, error: "dataset_id required" };

  const dateRange = obj.date_range;
  if (!dateRange || typeof dateRange !== "object" || Array.isArray(dateRange)) {
    return { ok: false, error: "date_range required { start, end }" };
  }
  const dr = dateRange as Record<string, unknown>;
  if (typeof dr.start !== "string" || typeof dr.end !== "string") {
    return { ok: false, error: "date_range.start + end required (ISO strings)" };
  }
  if (!isIsoDate(dr.start) || !isIsoDate(dr.end)) {
    return { ok: false, error: "date_range.start/end must be ISO 8601 dates" };
  }

  let seed: number | undefined;
  if (obj.seed !== undefined) {
    if (typeof obj.seed !== "number" || !Number.isFinite(obj.seed)) {
      return { ok: false, error: "seed must be a number" };
    }
    seed = obj.seed;
  }

  let channels: string[] | undefined;
  if (obj.channels !== undefined) {
    if (!Array.isArray(obj.channels)) return { ok: false, error: "channels must be array" };
    channels = [];
    for (const c of obj.channels) {
      if (typeof c !== "string" || c.length === 0) {
        return { ok: false, error: "channels[] must be non-empty strings" };
      }
      channels.push(c);
    }
  }

  let fit_options: Record<string, unknown> | undefined;
  if (obj.fit_options !== undefined) {
    if (!obj.fit_options || typeof obj.fit_options !== "object" || Array.isArray(obj.fit_options)) {
      return { ok: false, error: "fit_options must be an object" };
    }
    fit_options = obj.fit_options as Record<string, unknown>;
  }

  return {
    ok: true,
    value: {
      dataset_id,
      date_range: { start: dr.start, end: dr.end },
      ...(seed !== undefined ? { seed } : {}),
      ...(channels ? { channels } : {}),
      ...(fit_options ? { fit_options } : {}),
    },
  };
}

function readRunIdFromRequest(input: WebhookInput): string | null {
  if (input.query && typeof input.query.run_id === "string") {
    return input.query.run_id.trim() || null;
  }
  if (input.body && typeof input.body === "object" && !Array.isArray(input.body)) {
    const rid = (input.body as Record<string, unknown>).run_id;
    if (typeof rid === "string") return rid.trim() || null;
  }
  return null;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(value);
}

export default { onWebhook };
