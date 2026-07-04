/**
 * Genome pattern entity types · M5-03 core code.
 *
 * Pure types + validators + serializers · deterministic.
 * Storage: plugin_entities(entity_type='genome_pattern') · Pattern-11 shadow.
 */

export type PatternCategory = "code" | "marketing" | "organization";

export type ScoreDimension =
  | "specificity"
  | "transferability"
  | "evidence_strength"
  | "risk"
  | "novelty";

export interface GenomePatternFeature {
  activity_kind: string[]; // e.g. ['issue.closed', 'test_run.pass']
  issue_labels?: string[];
  keywords?: string[];
  surrounding_context?: string;
}

export interface GenomePatternAction {
  kind: "prompt_template" | "tool_call_sequence" | "skill_invocation";
  template: string;
  references?: string[];
}

export interface GenomePatternEvidence {
  activity_log_id: string;
  issue_id: string;
  outcome: "success" | "partial" | "failure";
  ts: string;
}

export interface GenomePatternScore {
  current: number; // [0, 1]
  updated_at: string;
  reason: string;
  application_count: number;
  success_rate: number; // [0, 1]
  by_dimension?: Partial<Record<ScoreDimension, number>>;
}

export interface GenomePatternMetadata {
  created_by: "sampling" | "user_manual" | "evaluator";
  origin_activity_log_id?: string;
  tags?: string[];
  archived?: boolean;
}

export interface GenomePattern {
  id: string;
  category: PatternCategory;
  version: number;
  feature: GenomePatternFeature;
  action: GenomePatternAction;
  evidence: GenomePatternEvidence[];
  score: GenomePatternScore;
  metadata: GenomePatternMetadata;
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validatePattern(p: unknown): ValidationResult {
  const errors: string[] = [];
  if (!p || typeof p !== "object") return { ok: false, errors: ["not an object"] };
  const o = p as Record<string, unknown>;

  if (typeof o.id !== "string" || !o.id) errors.push("id must be non-empty string");
  if (typeof o.category !== "string" || !["code", "marketing", "organization"].includes(o.category)) {
    errors.push("category must be code / marketing / organization");
  }
  if (typeof o.version !== "number" || o.version < 1) errors.push("version must be number >= 1");

  const feature = o.feature as GenomePatternFeature | undefined;
  if (!feature || typeof feature !== "object") errors.push("feature missing");
  else {
    if (!Array.isArray(feature.activity_kind) || feature.activity_kind.length === 0) {
      errors.push("feature.activity_kind must be non-empty array");
    }
  }

  const action = o.action as GenomePatternAction | undefined;
  if (!action || typeof action !== "object") errors.push("action missing");
  else {
    if (!["prompt_template", "tool_call_sequence", "skill_invocation"].includes(action.kind)) {
      errors.push("action.kind must be one of prompt_template / tool_call_sequence / skill_invocation");
    }
    if (typeof action.template !== "string" || action.template.length === 0) {
      errors.push("action.template must be non-empty string");
    }
  }

  const score = o.score as GenomePatternScore | undefined;
  if (!score || typeof score !== "object") errors.push("score missing");
  else {
    if (typeof score.current !== "number" || score.current < 0 || score.current > 1) {
      errors.push("score.current must be [0, 1]");
    }
    if (typeof score.application_count !== "number" || score.application_count < 0) {
      errors.push("score.application_count must be >= 0");
    }
  }

  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Constructors / helpers
// ---------------------------------------------------------------------------

export function newPatternId(category: PatternCategory, slug: string): string {
  const safe = slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `pattern_${category}_${safe || "untitled"}`;
}

export function initScore(now: Date = new Date()): GenomePatternScore {
  return {
    current: 0.5,
    updated_at: now.toISOString(),
    reason: "initial · pending evaluation",
    application_count: 0,
    success_rate: 0,
  };
}

/**
 * Apply a decay factor to a pattern's score · called by decay-tick.
 * Pattern-4 pure · returns new score object.
 */
export function decayScore(
  score: GenomePatternScore,
  factor: number,
  now: Date = new Date(),
): GenomePatternScore {
  const clampedFactor = Math.max(0, Math.min(1, factor));
  return {
    ...score,
    current: score.current * clampedFactor,
    updated_at: now.toISOString(),
    reason: `decayed by factor ${clampedFactor.toFixed(3)}`,
  };
}
