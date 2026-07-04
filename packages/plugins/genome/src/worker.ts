/**
 * Genome plugin worker · onWebhook + onRoutine dispatch · Pattern-2.
 *
 * M5-03 core code · scaffold-tight · real ctx.entities.* calls left to
 * caller/manifest wire-up at install-time.
 */

import { planEvaluation, type EvaluationPlan } from "./evaluator.js";
import { sampleCandidates, type ActivityLogEntry, type SamplingConfig } from "./sampling.js";
import { decayScore, type GenomePattern } from "./pattern.js";

// ---------------------------------------------------------------------------
// Webhook dispatch
// ---------------------------------------------------------------------------

export interface WebhookInput {
  endpointKey: string;
  body?: unknown;
}

export interface WebhookResponse {
  status: number;
  body: unknown;
}

export function dispatchWebhook(input: WebhookInput): WebhookResponse {
  switch (input.endpointKey) {
    case "report-candidate":
      return handleReportCandidate(input.body);
    case "query-pattern":
      return handleQueryPattern(input.body);
    default:
      return {
        status: 404,
        body: { error: `unknown endpoint: ${input.endpointKey}` },
      };
  }
}

function handleReportCandidate(body: unknown): WebhookResponse {
  if (!body || typeof body !== "object") {
    return { status: 400, body: { error: "body must be object" } };
  }
  const b = body as {
    candidate?: GenomePattern;
    existing?: GenomePattern[];
  };
  if (!b.candidate) return { status: 400, body: { error: "missing candidate" } };
  const plan = planEvaluation(b.candidate, {
    existing_patterns: b.existing ?? [],
  });
  return { status: 202, body: { plan } };
}

function handleQueryPattern(body: unknown): WebhookResponse {
  if (!body || typeof body !== "object") {
    return { status: 400, body: { error: "body must be object" } };
  }
  const b = body as {
    all_patterns?: GenomePattern[];
    context?: { activity_kind?: string; category?: string };
    top_k?: number;
  };
  const all = b.all_patterns ?? [];
  const ctx = b.context ?? {};
  const k = b.top_k ?? 5;

  const matches = all
    .filter((p) => !p.metadata.archived)
    .filter((p) => (ctx.category ? p.category === ctx.category : true))
    .filter((p) =>
      ctx.activity_kind
        ? p.feature.activity_kind.includes(ctx.activity_kind)
        : true,
    )
    .sort((a, b) => b.score.current - a.score.current)
    .slice(0, k);

  return {
    status: 200,
    body: { matches, matched_count: matches.length, total_scanned: all.length },
  };
}

// ---------------------------------------------------------------------------
// Routine dispatch
// ---------------------------------------------------------------------------

export interface RoutineInput {
  key: string;
  activity_log?: ActivityLogEntry[];
  existing?: GenomePattern[];
  now?: Date;
  category?: SamplingConfig["category"];
}

export interface RoutineResponse {
  status: "ok" | "skipped" | "error";
  message: string;
  data?: unknown;
}

export function dispatchRoutine(input: RoutineInput): RoutineResponse {
  switch (input.key) {
    case "sampling-tick":
      return handleSamplingTick(input);
    case "evaluation-tick":
      return handleEvaluationTick(input);
    case "decay-tick":
      return handleDecayTick(input);
    case "swe-bench-cl-tick":
      return {
        status: "ok",
        message:
          "swe-bench-cl-tick scaffold · calls benchmarks/swe-bench-cl/run-cl.py in real impl",
      };
    default:
      return { status: "error", message: `unknown routine key: ${input.key}` };
  }
}

function handleSamplingTick(input: RoutineInput): RoutineResponse {
  const entries = input.activity_log ?? [];
  if (entries.length === 0) {
    return { status: "skipped", message: "no activity log entries provided" };
  }
  const category = input.category ?? "code";
  const result = sampleCandidates(entries, {
    category,
    min_evidence: 3,
    now: input.now,
  });
  return {
    status: "ok",
    message: `sampling-tick · found ${result.candidates.length} candidates · discarded ${result.discarded.length}`,
    data: result,
  };
}

function handleEvaluationTick(input: RoutineInput): RoutineResponse {
  const candidates = input.existing ?? [];
  if (candidates.length === 0) {
    return { status: "skipped", message: "no candidates to evaluate" };
  }
  const plans: EvaluationPlan[] = [];
  for (const c of candidates) {
    plans.push(planEvaluation(c, { existing_patterns: [], now: input.now }));
  }
  const accepted = plans.filter((p) => p.suggested_verdict === "accept").length;
  const observed = plans.filter((p) => p.suggested_verdict === "observe").length;
  const rejected = plans.filter((p) => p.suggested_verdict === "reject").length;
  return {
    status: "ok",
    message: `evaluation-tick · accept=${accepted} observe=${observed} reject=${rejected}`,
    data: { plans },
  };
}

function handleDecayTick(input: RoutineInput): RoutineResponse {
  const patterns = input.existing ?? [];
  const decayFactor = 0.95; // 5% decay per day per tick
  const decayed = patterns.map((p) => ({
    ...p,
    score: decayScore(p.score, decayFactor, input.now),
  }));
  const archived = decayed.filter((p) => p.score.current < 0.1);
  return {
    status: "ok",
    message: `decay-tick · decayed ${decayed.length} patterns · ${archived.length} would be archived (<0.1)`,
    data: { decayed_ids: decayed.map((p) => p.id), archived_ids: archived.map((p) => p.id) },
  };
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export { planEvaluation, sampleCandidates, decayScore };
