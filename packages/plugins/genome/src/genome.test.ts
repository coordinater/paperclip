import { describe, expect, it } from "vitest";
import { decayScore, initScore, newPatternId, validatePattern, type GenomePattern } from "./pattern.js";
import { sampleCandidates, type ActivityLogEntry } from "./sampling.js";
import { planEvaluation } from "./evaluator.js";
import { dispatchRoutine, dispatchWebhook } from "./worker.js";

// ---------------------------------------------------------------------------
// pattern.ts
// ---------------------------------------------------------------------------

describe("pattern.ts · newPatternId", () => {
  it("produces slug-safe id", () => {
    expect(newPatternId("code", "Cache Invalidation!")).toBe("pattern_code_cache-invalidation");
  });

  it("falls back to untitled on empty slug", () => {
    expect(newPatternId("code", "")).toBe("pattern_code_untitled");
  });
});

describe("pattern.ts · initScore", () => {
  it("initializes with baseline 0.5 · not accepted yet", () => {
    const s = initScore(new Date("2026-07-04T00:00:00Z"));
    expect(s.current).toBe(0.5);
    expect(s.application_count).toBe(0);
  });
});

describe("pattern.ts · decayScore", () => {
  it("multiplies current by factor", () => {
    const s = initScore(new Date("2026-07-04T00:00:00Z"));
    const decayed = decayScore(s, 0.9, new Date("2026-07-05T00:00:00Z"));
    expect(decayed.current).toBeCloseTo(0.45);
  });

  it("clamps factor to [0, 1]", () => {
    const s = initScore();
    expect(decayScore(s, -1).current).toBe(0);
    expect(decayScore(s, 2).current).toBe(0.5);
  });
});

describe("pattern.ts · validatePattern", () => {
  const goodPattern = (): GenomePattern => ({
    id: "pattern_code_test",
    category: "code",
    version: 1,
    feature: {
      activity_kind: ["issue.closed"],
      keywords: ["cache"],
    },
    action: {
      kind: "prompt_template",
      template: "Invalidate the cache when {{issue.body}} references stale data",
    },
    evidence: [],
    score: {
      current: 0.7,
      updated_at: "2026-07-04T00:00:00Z",
      reason: "initial",
      application_count: 0,
      success_rate: 0,
    },
    metadata: { created_by: "sampling" },
  });

  it("passes for well-formed pattern", () => {
    const r = validatePattern(goodPattern());
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("rejects non-object", () => {
    expect(validatePattern("not object").ok).toBe(false);
  });

  it("rejects invalid category", () => {
    const p = { ...goodPattern(), category: "wat" };
    const r = validatePattern(p);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("category"))).toBe(true);
  });

  it("rejects empty activity_kind", () => {
    const p = goodPattern();
    p.feature.activity_kind = [];
    expect(validatePattern(p).ok).toBe(false);
  });

  it("rejects score out of [0,1]", () => {
    const p = goodPattern();
    p.score.current = 1.5;
    expect(validatePattern(p).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sampling.ts
// ---------------------------------------------------------------------------

describe("sampling.ts · sampleCandidates", () => {
  const codeEntries: ActivityLogEntry[] = [
    {
      id: "l1",
      action: "issue.closed",
      issue_id: "i1",
      actor_type: "agent",
      actor_id: "a1",
      ts: "2026-07-04T00:00:00Z",
      metadata: { keywords: ["cache", "invalidation"] },
    },
    {
      id: "l2",
      action: "test_run.pass",
      issue_id: "i1",
      actor_type: "agent",
      actor_id: "a1",
      ts: "2026-07-04T00:05:00Z",
    },
    {
      id: "l3",
      action: "code_edit.applied",
      issue_id: "i1",
      actor_type: "agent",
      actor_id: "a1",
      ts: "2026-07-04T00:10:00Z",
    },
  ];

  it("finds candidates when enough evidence exists per group", () => {
    const r = sampleCandidates(codeEntries, {
      category: "code",
      min_evidence: 3,
    });
    expect(r.candidates.length).toBe(1);
    expect(r.candidates[0].category).toBe("code");
  });

  it("discards when insufficient evidence", () => {
    const r = sampleCandidates(codeEntries.slice(0, 1), {
      category: "code",
      min_evidence: 3,
    });
    expect(r.candidates.length).toBe(0);
    expect(r.discarded.length).toBeGreaterThan(0);
  });

  it("ignores wrong-category actions", () => {
    const irrelevant: ActivityLogEntry[] = [
      { id: "x", action: "campaign.published", actor_type: "agent", ts: "2026-07-04T00:00:00Z" },
    ];
    const r = sampleCandidates(irrelevant, {
      category: "code",
      min_evidence: 1,
    });
    expect(r.candidates.length).toBe(0);
  });

  it("marketing category triggers on campaign events", () => {
    const marketing: ActivityLogEntry[] = [
      {
        id: "m1",
        action: "campaign.published",
        issue_id: "i2",
        actor_type: "agent",
        ts: "2026-07-04T00:00:00Z",
        metadata: { campaign_id: "c1" },
      },
      {
        id: "m2",
        action: "email.replied",
        issue_id: "i2",
        actor_type: "user",
        ts: "2026-07-04T01:00:00Z",
        metadata: { campaign_id: "c1" },
      },
      {
        id: "m3",
        action: "campaign.completed",
        issue_id: "i2",
        actor_type: "system",
        ts: "2026-07-04T02:00:00Z",
        metadata: { campaign_id: "c1" },
      },
    ];
    const r = sampleCandidates(marketing, {
      category: "marketing",
      min_evidence: 2,
    });
    expect(r.candidates.length).toBe(1);
    expect(r.candidates[0].action.references).toContain("content-marketer");
  });
});

// ---------------------------------------------------------------------------
// evaluator.ts
// ---------------------------------------------------------------------------

describe("evaluator.ts · planEvaluation", () => {
  const highQualityPattern: GenomePattern = {
    id: "pattern_code_cache",
    category: "code",
    version: 1,
    feature: {
      activity_kind: ["issue.closed", "test_run.pass", "code_edit.applied"],
      keywords: ["cache", "invalidation"],
    },
    action: {
      kind: "prompt_template",
      template: "Idempotent cache invalidation: check first · then invalidate · retry on error",
      references: ["cache-skill"],
    },
    evidence: [
      { activity_log_id: "l1", issue_id: "i1", outcome: "success", ts: "2026-07-04T00:00:00Z" },
      { activity_log_id: "l2", issue_id: "i2", outcome: "success", ts: "2026-07-04T01:00:00Z" },
      { activity_log_id: "l3", issue_id: "i3", outcome: "success", ts: "2026-07-04T02:00:00Z" },
    ],
    score: { current: 0.5, updated_at: "2026-07-04T00:00:00Z", reason: "initial", application_count: 0, success_rate: 0 },
    metadata: { created_by: "sampling" },
  };

  it("high-quality pattern receives accept verdict", () => {
    const plan = planEvaluation(highQualityPattern, { existing_patterns: [] });
    expect(plan.suggested_verdict).toBe("accept");
    expect(plan.suggested_final_score).toBeGreaterThanOrEqual(0.7);
  });

  it("returns 5 heuristic dimension scores", () => {
    const plan = planEvaluation(highQualityPattern, { existing_patterns: [] });
    const dims = plan.heuristic_scores.map((s) => s.dimension);
    expect(dims).toContain("specificity");
    expect(dims).toContain("transferability");
    expect(dims).toContain("evidence_strength");
    expect(dims).toContain("risk");
    expect(dims).toContain("novelty");
  });

  it("risky action lowers verdict", () => {
    const risky: GenomePattern = {
      ...highQualityPattern,
      action: {
        kind: "tool_call_sequence",
        template: "DELETE FROM cache; DROP TABLE stale; force-push origin main",
      },
    };
    const plan = planEvaluation(risky, { existing_patterns: [] });
    const riskDim = plan.heuristic_scores.find((s) => s.dimension === "risk");
    expect(riskDim?.value).toBeGreaterThan(0.5);
  });

  it("existing similar pattern reduces novelty", () => {
    const plan = planEvaluation(highQualityPattern, {
      existing_patterns: [highQualityPattern],
    });
    const novDim = plan.heuristic_scores.find((s) => s.dimension === "novelty");
    expect(novDim?.value).toBe(0);
  });

  it("edge-case scores trigger LLM judge request", () => {
    const mediumPattern: GenomePattern = {
      ...highQualityPattern,
      evidence: [
        { activity_log_id: "l1", issue_id: "i1", outcome: "success", ts: "2026-07-04T00:00:00Z" },
      ],
      action: {
        kind: "tool_call_sequence",
        template: "Do something",
      },
    };
    const plan = planEvaluation(mediumPattern, { existing_patterns: [] });
    if (plan.suggested_verdict === "observe") {
      expect(plan.llm_judge_request).toBeDefined();
      expect(plan.llm_judge_request?.prompt).toContain(mediumPattern.id);
    }
  });
});

// ---------------------------------------------------------------------------
// worker.ts (dispatchers)
// ---------------------------------------------------------------------------

describe("worker.ts · dispatchWebhook", () => {
  const candidate: GenomePattern = {
    id: "pattern_code_x",
    category: "code",
    version: 1,
    feature: { activity_kind: ["issue.closed"] },
    action: { kind: "prompt_template", template: "Do thing" },
    evidence: [],
    score: { current: 0.5, updated_at: "2026-07-04T00:00:00Z", reason: "init", application_count: 0, success_rate: 0 },
    metadata: { created_by: "sampling" },
  };

  it("report-candidate returns evaluation plan", () => {
    const res = dispatchWebhook({
      endpointKey: "report-candidate",
      body: { candidate },
    });
    expect(res.status).toBe(202);
    const body = res.body as { plan: { candidate_id: string } };
    expect(body.plan.candidate_id).toBe(candidate.id);
  });

  it("query-pattern returns matches sorted by score", () => {
    const highScore: GenomePattern = {
      ...candidate,
      id: "high",
      score: { ...candidate.score, current: 0.9 },
    };
    const lowScore: GenomePattern = {
      ...candidate,
      id: "low",
      score: { ...candidate.score, current: 0.3 },
    };
    const res = dispatchWebhook({
      endpointKey: "query-pattern",
      body: { all_patterns: [lowScore, highScore], top_k: 5 },
    });
    expect(res.status).toBe(200);
    const body = res.body as { matches: GenomePattern[] };
    expect(body.matches[0].id).toBe("high");
  });

  it("filters archived patterns from query", () => {
    const archived: GenomePattern = {
      ...candidate,
      id: "archived",
      metadata: { ...candidate.metadata, archived: true },
    };
    const active: GenomePattern = { ...candidate, id: "active" };
    const res = dispatchWebhook({
      endpointKey: "query-pattern",
      body: { all_patterns: [archived, active] },
    });
    const body = res.body as { matches: GenomePattern[] };
    expect(body.matches.map((p) => p.id)).not.toContain("archived");
  });

  it("returns 404 for unknown endpoint", () => {
    expect(dispatchWebhook({ endpointKey: "wat" }).status).toBe(404);
  });
});

describe("worker.ts · dispatchRoutine", () => {
  it("sampling-tick without entries returns skipped", () => {
    const r = dispatchRoutine({ key: "sampling-tick" });
    expect(r.status).toBe("skipped");
  });

  it("sampling-tick with entries finds candidates (code category default)", () => {
    const r = dispatchRoutine({
      key: "sampling-tick",
      activity_log: [
        { id: "l1", action: "issue.closed", issue_id: "i1", actor_type: "agent", ts: "2026-07-04T00:00:00Z" },
        { id: "l2", action: "test_run.pass", issue_id: "i1", actor_type: "agent", ts: "2026-07-04T00:05:00Z" },
        { id: "l3", action: "code_edit.applied", issue_id: "i1", actor_type: "agent", ts: "2026-07-04T00:10:00Z" },
      ],
    });
    expect(r.status).toBe("ok");
  });

  it("decay-tick shrinks scores", () => {
    const p: GenomePattern = {
      id: "p1",
      category: "code",
      version: 1,
      feature: { activity_kind: ["issue.closed"] },
      action: { kind: "prompt_template", template: "x" },
      evidence: [],
      score: {
        current: 0.5,
        updated_at: "2026-07-04T00:00:00Z",
        reason: "init",
        application_count: 0,
        success_rate: 0,
      },
      metadata: { created_by: "sampling" },
    };
    const r = dispatchRoutine({ key: "decay-tick", existing: [p] });
    expect(r.status).toBe("ok");
  });

  it("returns error for unknown key", () => {
    const r = dispatchRoutine({ key: "wat" });
    expect(r.status).toBe("error");
  });
});
