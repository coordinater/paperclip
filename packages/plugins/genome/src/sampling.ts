/**
 * Genome candidate sampling · M5-03 core code.
 *
 * Pure functions · scans activity_log entries · extracts candidate patterns.
 * No I/O · caller provides activity_log slice.
 */

import { newPatternId, type GenomePattern, type PatternCategory } from "./pattern.js";

export interface ActivityLogEntry {
  id: string;
  action: string;
  kind?: string;
  issue_id?: string;
  actor_type: "agent" | "user" | "system";
  actor_id?: string;
  metadata?: Record<string, unknown>;
  ts: string;
}

export interface SamplingConfig {
  category: PatternCategory;
  min_evidence: number; // minimum activity log entries required to emit candidate
  now?: Date;
}

export interface SamplingResult {
  candidates: GenomePattern[];
  discarded: Array<{ reason: string; sample_ids: string[] }>;
}

const CODE_TRIGGERS = new Set([
  "issue.closed",
  "test_run.pass",
  "code_edit.applied",
]);
const MARKETING_TRIGGERS = new Set([
  "campaign.published",
  "email.replied",
  "campaign.completed",
]);
const ORG_TRIGGERS = new Set([
  "hire_reviewer.approved",
  "escalation.triggered",
  "sub_issue.closed",
]);

export function sampleCandidates(
  entries: ActivityLogEntry[],
  config: SamplingConfig,
): SamplingResult {
  const triggers = triggerSetFor(config.category);
  const filtered = entries.filter((e) => triggers.has(e.action));
  if (filtered.length < config.min_evidence) {
    return {
      candidates: [],
      discarded: [
        {
          reason: `insufficient evidence · need ${config.min_evidence} got ${filtered.length}`,
          sample_ids: filtered.map((e) => e.id),
        },
      ],
    };
  }

  // Group by issue_id (code) / campaign_id (marketing) / parent_issue_id (org)
  const groups = new Map<string, ActivityLogEntry[]>();
  for (const e of filtered) {
    const groupKey = groupKeyOf(e, config.category);
    if (!groupKey) continue;
    const list = groups.get(groupKey) ?? [];
    list.push(e);
    groups.set(groupKey, list);
  }

  const now = config.now ?? new Date();
  const candidates: GenomePattern[] = [];
  const discarded: Array<{ reason: string; sample_ids: string[] }> = [];

  for (const [groupKey, entriesInGroup] of groups) {
    if (entriesInGroup.length < config.min_evidence) {
      discarded.push({
        reason: `group ${groupKey} has ${entriesInGroup.length} < ${config.min_evidence}`,
        sample_ids: entriesInGroup.map((e) => e.id),
      });
      continue;
    }
    const candidate = extractPattern(entriesInGroup, config.category, now);
    if (candidate) candidates.push(candidate);
  }

  return { candidates, discarded };
}

function triggerSetFor(category: PatternCategory): Set<string> {
  switch (category) {
    case "code":
      return CODE_TRIGGERS;
    case "marketing":
      return MARKETING_TRIGGERS;
    case "organization":
      return ORG_TRIGGERS;
  }
}

function groupKeyOf(e: ActivityLogEntry, category: PatternCategory): string | null {
  if (category === "code" || category === "organization") {
    return e.issue_id ?? null;
  }
  if (category === "marketing") {
    const md = e.metadata as { campaign_id?: string } | undefined;
    return md?.campaign_id ?? e.issue_id ?? null;
  }
  return null;
}

function extractPattern(
  entries: ActivityLogEntry[],
  category: PatternCategory,
  now: Date,
): GenomePattern | null {
  // Pick most informative entry (last one · highest signal in agent lifecycle)
  const last = entries[entries.length - 1];
  const first = entries[0];

  const slug = `${category}-${first.issue_id ?? "grouped"}-${last.ts.slice(0, 10)}`;
  const id = newPatternId(category, slug);

  return {
    id,
    category,
    version: 1,
    feature: {
      activity_kind: Array.from(new Set(entries.map((e) => e.action))),
      keywords: extractKeywords(entries),
      surrounding_context: `Extracted from ${entries.length} log entries between ${first.ts} and ${last.ts}`,
    },
    action: {
      kind: "prompt_template",
      template: derivePromptTemplate(entries, category),
      references: category === "marketing" ? ["content-marketer", "wewrite"] : [],
    },
    evidence: entries.map((e) => ({
      activity_log_id: e.id,
      issue_id: e.issue_id ?? "unknown",
      outcome: "success" as const,
      ts: e.ts,
    })),
    score: {
      current: 0.5,
      updated_at: now.toISOString(),
      reason: "initial · pending evaluator",
      application_count: 0,
      success_rate: 0,
    },
    metadata: {
      created_by: "sampling",
      origin_activity_log_id: last.id,
      tags: [category],
    },
  };
}

function extractKeywords(entries: ActivityLogEntry[]): string[] {
  const kw = new Set<string>();
  for (const e of entries) {
    const md = e.metadata as { keywords?: string[]; label?: string } | undefined;
    if (md?.keywords) for (const k of md.keywords) kw.add(k);
    if (md?.label) kw.add(md.label);
  }
  return Array.from(kw).slice(0, 20);
}

function derivePromptTemplate(
  entries: ActivityLogEntry[],
  category: PatternCategory,
): string {
  const summary = `Auto-derived pattern from ${entries.length} success events.`;
  switch (category) {
    case "code":
      return `${summary}\n\nWhen: encountering similar issue signals\nDo: reuse the successful action sequence from evidence\nTemplate: reference activity_log entries {{evidence}}`;
    case "marketing":
      return `${summary}\n\nWhen: campaign with similar audience/pipeline\nDo: apply the winning content skeleton + timing\nTemplate: {{content_marketer_skeleton}}`;
    case "organization":
      return `${summary}\n\nWhen: sub-issue coordination pattern\nDo: escalate/delegate per Manager rules\nTemplate: reports_to chain reference`;
  }
}
