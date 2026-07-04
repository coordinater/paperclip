/**
 * HTTP client for the team-side Meridian FastAPI wrapper.
 *
 * Assumed Python-side surface (team implements per side-car/meridian/README.md):
 *   POST /runs            → { run_id, status: "queued" }
 *   GET  /runs/:run_id    → { run_id, status: "running"|"completed"|"failed", report? }
 *   GET  /health          → { ok: true, meridian_version }
 *
 * The client is HTTP-only + zero-dep — swap it for a smarter one (retries,
 * circuit breaker) once we understand real usage patterns.
 */

export interface RunMmmRequest {
  dataset_id: string;
  date_range: { start: string; end: string };
  seed?: number;
  /** e.g. ["tv", "search", "social", "email"] */
  channels?: string[];
  /** e.g. { n_iter: 500 } — pass-through to Meridian fit() */
  fit_options?: Record<string, unknown>;
}

export interface RunMmmResponse {
  run_id: string;
  status: "queued" | "running";
}

export type MmmRunStatus = "queued" | "running" | "completed" | "failed";

export interface MmmReport {
  run_id: string;
  status: MmmRunStatus;
  finished_at?: string;
  report?: {
    channel_roi: Array<{ channel: string; roi: number }>;
    saturation_curves?: Array<{ channel: string; curve: Array<[number, number]> }>;
    budget_allocation_recommendation?: Array<{ channel: string; recommended_share: number }>;
  };
  error?: string;
}

export interface MeridianClientConfig {
  /** Base URL of the FastAPI wrapper (e.g. http://localhost:8005 or ngrok URL). */
  baseUrl: string;
  /** Optional bearer token, if the wrapper is protected. */
  authToken?: string;
  /** Default fetch timeout in milliseconds. */
  timeoutMs?: number;
  /** Injected fetch — defaults to global fetch. Tests inject a stub. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export class MeridianClient {
  private readonly baseUrl: string;
  private readonly authToken: string | undefined;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: MeridianClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.authToken = config.authToken;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async health(): Promise<{ ok: boolean; meridian_version?: string }> {
    const res = await this.request("GET", "/health");
    if (!res.ok) return { ok: false };
    const body = (await res.json()) as { meridian_version?: string };
    return { ok: true, ...body };
  }

  async runMmm(req: RunMmmRequest): Promise<RunMmmResponse> {
    const res = await this.request("POST", "/runs", req);
    if (!res.ok) {
      throw new MeridianHttpError(`Meridian /runs returned ${res.status}`, res.status);
    }
    return (await res.json()) as RunMmmResponse;
  }

  async getReport(run_id: string): Promise<MmmReport> {
    if (!run_id) throw new Error("run_id required");
    const res = await this.request("GET", `/runs/${encodeURIComponent(run_id)}`);
    if (res.status === 404) {
      throw new MeridianHttpError(`run ${run_id} not found`, 404);
    }
    if (!res.ok) {
      throw new MeridianHttpError(`Meridian /runs/${run_id} returned ${res.status}`, res.status);
    }
    return (await res.json()) as MmmReport;
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<Response> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.authToken) headers.authorization = `Bearer ${this.authToken}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      return res;
    } finally {
      clearTimeout(timer);
    }
  }
}

export class MeridianHttpError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "MeridianHttpError";
  }
}
