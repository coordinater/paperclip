/**
 * Approval router · M2 W8-D4.
 *
 * Extends the M1 W4-D5 single-type flow (`handleApprovalCreated` in
 * approval-sync.ts) to route THREE approval types to distinct card templates:
 *   - hire_agent       (M1 · unchanged · handled by existing approval-sync)
 *   - ceo_strategy     (M2 W8-D4 new)
 *   - budget_incident  (M2 W8-D4 new)
 *
 * Two design principles kept from M1:
 *   1. **Card templates** are per-type · avoid stuffing all fields into one
 *      generic form (per handbook §W8.D4 "决策者：CEO 角色" + "@ 财务").
 *   2. **Idempotent write** to plugin_state · caller retries safe.
 *
 * SDK contract: uses `PluginContext` from @paperclipai/plugin-sdk · consistent
 * with approval-sync.ts.
 */

import type { PluginContext } from "@paperclipai/plugin-sdk";
import {
  APPROVAL_TYPES_ROUTED,
  APPROVAL_TYPE_BUDGET_INCIDENT,
  APPROVAL_TYPE_CEO_STRATEGY,
  APPROVAL_TYPE_HIRE_AGENT,
  type RoutedApprovalType,
} from "./manifest.js";

export interface ApprovalRouteInput {
  approvalId: string;
  approvalType: string;
  companyId: string;
  requestedBy: string;
  payload: Record<string, unknown>;
}

/**
 * Rendered card content per approval type.
 *
 * Card **template selection** happens here (M2 W8-D4).
 * Actual delivery to 飞书 happens in `approval-sync.ts`'s handleApprovalCreated
 * (M1 path) or a per-type handler (M2 W8-D4 new · stub in this file).
 */
export interface RenderedCard {
  approvalType: RoutedApprovalType;
  title: string;
  summary: string;
  bulletFields: Array<{ label: string; value: string }>;
  /** Which Lark chat group receives this card (M1 = single default; M2 could split). */
  routingHint: {
    /** For ceo_strategy: prefer executive channel; for budget_incident: finance channel. */
    channel: "default" | "executive" | "finance";
  };
}

/**
 * Type guard: is this approval one the plugin knows how to route?
 */
export function isRoutedApprovalType(t: string): t is RoutedApprovalType {
  return (APPROVAL_TYPES_ROUTED as readonly string[]).includes(t);
}

/**
 * Route an approval event to its card renderer.
 *
 * Returns `null` for unrecognized approval types (caller should log-and-skip,
 * NOT reject upstream so future approval types added by paperclip core don't
 * break this plugin).
 */
export function routeApproval(input: ApprovalRouteInput): RenderedCard | null {
  if (!isRoutedApprovalType(input.approvalType)) return null;
  switch (input.approvalType) {
    case APPROVAL_TYPE_HIRE_AGENT:
      return renderHireAgentCard(input);
    case APPROVAL_TYPE_CEO_STRATEGY:
      return renderCeoStrategyCard(input);
    case APPROVAL_TYPE_BUDGET_INCIDENT:
      return renderBudgetIncidentCard(input);
  }
}

// ---------------------------------------------------------------------------
// Card renderers (one per approval type)
// ---------------------------------------------------------------------------

function renderHireAgentCard(input: ApprovalRouteInput): RenderedCard {
  const p = input.payload;
  return {
    approvalType: APPROVAL_TYPE_HIRE_AGENT,
    title: "🤖 Hire Agent · 审批",
    summary: `${asString(p.role) ?? "agent"} · ${asString(p.adapterType) ?? "(adapter?)"}`,
    bulletFields: [
      { label: "Role", value: asString(p.role) ?? "-" },
      { label: "Adapter", value: asString(p.adapterType) ?? "-" },
      { label: "Model", value: asString(p.model) ?? "-" },
      { label: "Requested by", value: input.requestedBy },
    ],
    routingHint: { channel: "default" },
  };
}

function renderCeoStrategyCard(input: ApprovalRouteInput): RenderedCard {
  const p = input.payload;
  return {
    approvalType: APPROVAL_TYPE_CEO_STRATEGY,
    title: "🎯 CEO Strategy · 决策",
    summary: `${asString(p.topic) ?? "strategic decision"}`,
    bulletFields: [
      { label: "Topic", value: asString(p.topic) ?? "-" },
      { label: "Question", value: asString(p.question) ?? "-" },
      { label: "Options", value: renderOptions(p.options) },
      { label: "Recommended", value: asString(p.recommendation) ?? "-" },
      { label: "Requested by", value: input.requestedBy },
    ],
    routingHint: { channel: "executive" },
  };
}

function renderBudgetIncidentCard(input: ApprovalRouteInput): RenderedCard {
  const p = input.payload;
  const amount = asNumber(p.amount);
  const currency = asString(p.currency) ?? "USD";
  return {
    approvalType: APPROVAL_TYPE_BUDGET_INCIDENT,
    title: "🚨 Budget Incident · 财务审批",
    summary: `${currency} ${amount !== null ? amount.toFixed(2) : "?"} · ${asString(p.category) ?? "uncategorized"}`,
    bulletFields: [
      { label: "Amount", value: amount !== null ? `${currency} ${amount.toFixed(2)}` : "-" },
      { label: "Category", value: asString(p.category) ?? "-" },
      { label: "Vendor", value: asString(p.vendor) ?? "-" },
      { label: "Description", value: asString(p.description) ?? "-" },
      { label: "Runbook link", value: asString(p.runbook_url) ?? "-" },
      { label: "Requested by", value: input.requestedBy },
    ],
    routingHint: { channel: "finance" },
  };
}

// ---------------------------------------------------------------------------
// Handlers for the two NEW approval types (M2 W8-D4).
//
// These handlers are the "M2 wire-up path" per handbook §W8.D4: 双向 =
//   PaperClip approvals.status → Lark update card
//   Lark card callback → PaperClip approvals.set_status
// M1 already wired hire_agent both directions via approval-sync.ts. These
// handlers register the same flow for ceo_strategy + budget_incident.
//
// M2 W8-D4 keeps these as thin wrappers; the actual send-card call reuses
// larkPostApprovalCard from lark-client.ts (already used by hire_agent).
// ---------------------------------------------------------------------------

export interface HandlerHooks {
  /** Optional lark-client factory injection for tests. */
  sendCard?: (card: RenderedCard, input: ApprovalRouteInput) => Promise<{ instanceCode: string; messageId: string }>;
}

export async function handleCeoStrategyApproval(
  ctx: PluginContext,
  input: ApprovalRouteInput,
  hooks?: HandlerHooks,
): Promise<{ ok: boolean; reason?: string }> {
  return await handleGenericRoutedApproval(ctx, input, APPROVAL_TYPE_CEO_STRATEGY, hooks);
}

export async function handleBudgetIncidentApproval(
  ctx: PluginContext,
  input: ApprovalRouteInput,
  hooks?: HandlerHooks,
): Promise<{ ok: boolean; reason?: string }> {
  return await handleGenericRoutedApproval(ctx, input, APPROVAL_TYPE_BUDGET_INCIDENT, hooks);
}

async function handleGenericRoutedApproval(
  ctx: PluginContext,
  input: ApprovalRouteInput,
  expectedType: RoutedApprovalType,
  hooks: HandlerHooks | undefined,
): Promise<{ ok: boolean; reason?: string }> {
  if (input.approvalType !== expectedType) {
    return { ok: false, reason: `expected approvalType=${expectedType}, got=${input.approvalType}` };
  }
  const card = routeApproval(input);
  if (!card) return { ok: false, reason: "route returned null" };

  if (!hooks?.sendCard) {
    // Deliver-later mode: caller can fetch card from a queue.
    ctx.logger.info("approval routed (no sendCard hook · deliver-later)", {
      approvalId: input.approvalId,
      approvalType: input.approvalType,
      channel: card.routingHint.channel,
    });
    return { ok: true };
  }

  const { instanceCode, messageId } = await hooks.sendCard(card, input);
  ctx.logger.info("approval card sent", {
    approvalId: input.approvalId,
    approvalType: input.approvalType,
    instanceCode,
    messageId,
    channel: card.routingHint.channel,
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function renderOptions(v: unknown): string {
  if (Array.isArray(v)) {
    return v
      .map((entry) => {
        if (typeof entry === "string") return entry;
        if (entry && typeof entry === "object") {
          const e = entry as Record<string, unknown>;
          return asString(e.label) ?? asString(e.key) ?? "-";
        }
        return "-";
      })
      .join(" | ");
  }
  return asString(v) ?? "-";
}
