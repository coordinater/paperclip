/**
 * Genome pattern evaluator · M5-03 core code.
 *
 * Pattern-4 pure orchestrator planEvaluation(candidate, context) → evaluation.
 * Heuristic + LLM-judge signals combined. LLM call is left to caller (via
 * `EvaluationRequest.needsLlmJudge` in the plan).
 */

import type { GenomePattern, ScoreDimension } from "./pattern.js";

export interface EvaluationContext {
  existing_patterns: GenomePattern[]; // for novelty check
  now?: Date;
}

export interface DimensionScore {
  dimension: ScoreDimension;
  value: number; // [0, 1]
  reason: string;
}

export interface EvaluationPlan {
  candidate_id: string;
  heuristic_scores: DimensionScore[];
  llm_judge_request?: {
    prompt: string;
    focus_dimensions: ScoreDimension[];
  };
  suggested_verdict: "accept" | "observe" | "reject";
  suggested_final_score: number;
  reasoning: string;
}

const DIMENSION_WEIGHTS: Record<ScoreDimension, number> = {
  specificity: 0.2,
  transferability: 0.25,
  evidence_strength: 0.25,
  risk: 0.15, // higher risk score is worse · we invert internally
  novelty: 0.15,
};

const ACCEPT_THRESHOLD = 0.7;
const OBSERVE_THRESHOLD = 0.4;

/**
 * Plan the evaluation of a candidate pattern.
 * Pure · deterministic given inputs.
 */
export function planEvaluation(
  candidate: GenomePattern,
  ctx: EvaluationContext,
): EvaluationPlan {
  const specificity = scoreSpecificity(candidate);
  const transferability = scoreTransferability(candidate);
  const evidenceStrength = scoreEvidenceStrength(candidate);
  const risk = scoreRisk(candidate);
  const novelty = scoreNovelty(candidate, ctx.existing_patterns);

  const heuristic_scores: DimensionScore[] = [
    specificity,
    transferability,
    evidenceStrength,
    risk,
    novelty,
  ];

  const weighted =
    specificity.value * DIMENSION_WEIGHTS.specificity +
    transferability.value * DIMENSION_WEIGHTS.transferability +
    evidenceStrength.value * DIMENSION_WEIGHTS.evidence_strength +
    (1 - risk.value) * DIMENSION_WEIGHTS.risk + // invert risk
    novelty.value * DIMENSION_WEIGHTS.novelty;

  const suggested_verdict: EvaluationPlan["suggested_verdict"] =
    weighted >= ACCEPT_THRESHOLD
      ? "accept"
      : weighted >= OBSERVE_THRESHOLD
        ? "observe"
        : "reject";

  // Include LLM judge request for edge cases · human-audit-friendly
  const needsLlmJudge =
    weighted >= OBSERVE_THRESHOLD && weighted < ACCEPT_THRESHOLD;

  return {
    candidate_id: candidate.id,
    heuristic_scores,
    llm_judge_request: needsLlmJudge
      ? {
          prompt: buildLlmJudgePrompt(candidate),
          focus_dimensions: identifyWeakDimensions(heuristic_scores),
        }
      : undefined,
    suggested_verdict,
    suggested_final_score: weighted,
    reasoning: buildReasoning(heuristic_scores, weighted, suggested_verdict),
  };
}

// ---------------------------------------------------------------------------
// Dimension scoring functions (heuristic)
// ---------------------------------------------------------------------------

function scoreSpecificity(p: GenomePattern): DimensionScore {
  // Higher activity_kind count · more specific = better · but too many is overfit
  const count = p.feature.activity_kind.length;
  const value = count === 0 ? 0 : Math.min(1, count / 5); // 5 kinds is sweet spot
  const reason =
    count === 0
      ? "no activity_kind · no specificity"
      : count > 8
        ? `high count ${count} may overfit`
        : `${count} activity_kind`;
  return { dimension: "specificity", value, reason };
}

function scoreTransferability(p: GenomePattern): DimensionScore {
  // Prompt-template kind is more transferable than tool_call_sequence
  let value = 0.5;
  if (p.action.kind === "prompt_template") value = 0.7;
  else if (p.action.kind === "skill_invocation") value = 0.6;
  else if (p.action.kind === "tool_call_sequence") value = 0.4;

  const hasReferences =
    Array.isArray(p.action.references) && p.action.references.length > 0;
  if (hasReferences) value = Math.min(1, value + 0.2);

  return {
    dimension: "transferability",
    value,
    reason: `action.kind=${p.action.kind}${hasReferences ? " · has references" : ""}`,
  };
}

function scoreEvidenceStrength(p: GenomePattern): DimensionScore {
  const successCount = p.evidence.filter((e) => e.outcome === "success").length;
  const failureCount = p.evidence.filter((e) => e.outcome === "failure").length;
  const total = p.evidence.length;
  if (total === 0) return { dimension: "evidence_strength", value: 0, reason: "no evidence" };

  const successRatio = successCount / total;
  // Cap at 5 evidence · past that not much marginal signal
  const volumeFactor = Math.min(1, total / 5);
  const value = successRatio * volumeFactor;
  return {
    dimension: "evidence_strength",
    value,
    reason: `${successCount}/${total} success${failureCount > 0 ? ` · ${failureCount} failures reduce weight` : ""}`,
  };
}

function scoreRisk(p: GenomePattern): DimensionScore {
  // Detect risky patterns · higher = more risky (worse)
  let risk = 0.2; // baseline safe

  const template = p.action.template.toLowerCase();

  // Hardcoded values / secrets patterns
  if (/api[_-]?key|secret|password|bearer/.test(template)) risk += 0.4;

  // Destructive verbs
  if (/\b(delete|drop|rm |truncate|force[- ]?push)\b/.test(template)) risk += 0.3;

  // No idempotency signal
  if (!/idempotent|retry|check[- ]?first/.test(template)) risk += 0.1;

  const value = Math.min(1, risk);
  return {
    dimension: "risk",
    value,
    reason: value < 0.3 ? "low risk" : value < 0.6 ? "medium risk" : "high risk · review",
  };
}

function scoreNovelty(p: GenomePattern, existing: GenomePattern[]): DimensionScore {
  if (existing.length === 0) {
    return { dimension: "novelty", value: 1, reason: "no existing patterns · novel" };
  }
  // Simple novelty: does any existing pattern share > 50% activity_kind?
  const candidateKinds = new Set(p.feature.activity_kind);
  let maxOverlap = 0;
  for (const ex of existing) {
    if (ex.category !== p.category) continue;
    const exKinds = new Set(ex.feature.activity_kind);
    const overlap = intersectSize(candidateKinds, exKinds);
    const relSize = overlap / Math.max(candidateKinds.size, 1);
    if (relSize > maxOverlap) maxOverlap = relSize;
  }
  const value = 1 - maxOverlap;
  return {
    dimension: "novelty",
    value,
    reason:
      maxOverlap === 0
        ? "no overlap with existing"
        : `${(maxOverlap * 100).toFixed(0)}% overlap with existing pattern`,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function intersectSize<T>(a: Set<T>, b: Set<T>): number {
  let n = 0;
  for (const v of a) if (b.has(v)) n++;
  return n;
}

function identifyWeakDimensions(scores: DimensionScore[]): ScoreDimension[] {
  return scores
    .filter((s) => s.value < 0.5)
    .map((s) => s.dimension);
}

function buildLlmJudgePrompt(candidate: GenomePattern): string {
  return `You are evaluating a candidate Genome pattern for Category=${candidate.category}.

Pattern id: ${candidate.id}
Feature: ${JSON.stringify(candidate.feature, null, 2)}
Action: ${JSON.stringify(candidate.action, null, 2)}
Evidence count: ${candidate.evidence.length}

Judge on 5 dimensions [0,1] each:
1. specificity · precise trigger conditions
2. transferability · reusable across contexts
3. evidence_strength · consistent success
4. risk · destructive verbs / idempotency
5. novelty · distinct from existing patterns

Return JSON: { "final_score": number, "verdict": "accept" | "observe" | "reject", "reasoning": string }`;
}

function buildReasoning(
  scores: DimensionScore[],
  final: number,
  verdict: EvaluationPlan["suggested_verdict"],
): string {
  const summary = scores
    .map((s) => `${s.dimension}=${s.value.toFixed(2)}(${s.reason})`)
    .join(" · ");
  return `Verdict: ${verdict} @ final_score=${final.toFixed(3)} · ${summary}`;
}
