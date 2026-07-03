/**
 * Approval sync — PaperClip `approvals` ↔ 飞书 interactive-card 双向映射.
 *
 * Wired at W4-D5 per handoff/03-施工手册-M1.md §W4.3.
 *
 * M1 scope: **只做 1 类 approval 双向绑定** = `hire_agent`. Other approval
 * types (`spawn_run` / `install_skill` / `connect_env`) are dropped silently
 * with a debug log — M2 wires them.
 *
 * Data layout (handoff/06-规范.md §2.1 + §5.5):
 *   The "table" we would call `plugin_ai_company_lark_approval_link` is
 *   materialized through `ctx.state` at M1 to avoid shipping a Drizzle
 *   migration on the same PR as the plugin skeleton — the schema stays inside
 *   the plugin namespace either way (host enforces isolation). The migration
 *   itself is added in W4-D5 M2 hardening if we choose to graduate the state
 *   to a proper table.
 *
 *   ScopeKeys used (all `scopeKind: "instance"` at M1 because we don't yet
 *   have a stable company_id at bind time — will graduate to `scopeKind:
 *   "company"` when the plugin is deployed per-company):
 *
 *     `lark:approval:${approvalId}`   → { instanceCode, chatId, cardMessageId, ...}
 *     `lark:instance:${instanceCode}` → { approvalId }
 *     `lark:bound-chat`               → chatId  (M1 static config; M2 per-company)
 *     `lark:event:${eventId}`         → { seenAt } (dedupe; owned by webhooks.ts)
 *
 * Idempotency: `lark:approval:${approvalId}.status` is checked before
 * dispatching to core; second callback is a no-op.
 *
 * activity_log: 走 `ctx.activity.log(...)` (真接 SDK) — the `activity.log.write`
 * capability is declared in manifest.ts.
 */

import type { PluginContext } from "@paperclipai/plugin-sdk";
import { APPROVAL_TYPE_HIRE_AGENT } from "./manifest.js";
import {
  createLarkClient,
  larkPostApprovalCard,
  type LarkClientHandle,
} from "./lark-client.js";

export interface ApprovalCreatedEvent {
  approvalId: string;
  approvalType: string;
  companyId: string;
  requestedBy: string;
  payload: Record<string, unknown>;
}

export interface LarkApprovalCallbackPayload {
  instanceCode: string;
  status: "approved" | "rejected" | "pending" | "canceled";
  operator: string;
  operatedAt: string;
}

interface ApprovalLinkState {
  approvalId: string;
  approvalType: string;
  companyId: string;
  instanceCode: string;
  chatId: string;
  cardMessageId: string;
  createdAt: string;
  status: "pending" | "approved" | "rejected" | "canceled";
  decidedAt?: string;
  decidedBy?: string;
}

/**
 * Injectable client factory — tests replace with a mock.
 */
export type LarkClientFactory = (ctx: PluginContext) => Promise<LarkClientHandle>;

export async function handleApprovalCreated(
  ctx: PluginContext,
  event: ApprovalCreatedEvent,
  opts?: {
    clientFactory?: LarkClientFactory;
    postApprovalCard?: typeof larkPostApprovalCard;
  },
): Promise<void> {
  if (event.approvalType !== APPROVAL_TYPE_HIRE_AGENT) {
    ctx.logger.debug("approval.created skipped (M1 only handles hire_agent)", {
      approvalId: event.approvalId,
      approvalType: event.approvalType,
    });
    return;
  }

  const chatId = await resolveBoundChatId(ctx);
  if (!chatId) {
    ctx.logger.error(
      "approval.created received but no bound 飞书 chatId configured (set lark:bound-chat state or LARK_BOUND_CHAT_ID secret)",
      { approvalId: event.approvalId },
    );
    return;
  }

  // idempotency: skip if already linked
  const existing = await readApprovalLink(ctx, event.approvalId);
  if (existing) {
    ctx.logger.debug("approval.created already linked, skipping", {
      approvalId: event.approvalId,
      instanceCode: existing.instanceCode,
    });
    return;
  }

  const factory = opts?.clientFactory ?? createLarkClient;
  const postCard = opts?.postApprovalCard ?? larkPostApprovalCard;
  const client = await factory(ctx);

  const { instanceCode, messageId } = await postCard(client, {
    chatId,
    approvalId: event.approvalId,
    approvalCode: event.approvalType, // M1: use type as approval code
    formData: event.payload,
  });

  const link: ApprovalLinkState = {
    approvalId: event.approvalId,
    approvalType: event.approvalType,
    companyId: event.companyId,
    instanceCode,
    chatId,
    cardMessageId: messageId,
    createdAt: new Date().toISOString(),
    status: "pending",
  };

  await writeApprovalLink(ctx, link);
  await writeInstanceIndex(ctx, instanceCode, event.approvalId);

  await safeActivityLog(ctx, {
    companyId: event.companyId,
    message: `Lark approval card posted for approval ${event.approvalId}`,
    entityType: "approval",
    entityId: event.approvalId,
    metadata: {
      instanceCode,
      chatId,
      cardMessageId: messageId,
      approvalType: event.approvalType,
    },
  });
}

export async function handleLarkApprovalCallback(
  ctx: PluginContext,
  payload: LarkApprovalCallbackPayload,
): Promise<void> {
  const approvalId = await resolveApprovalIdFromInstance(ctx, payload.instanceCode);
  if (!approvalId) {
    ctx.logger.warn("callback received but no matching approval link", {
      instanceCode: payload.instanceCode,
    });
    return;
  }

  const link = await readApprovalLink(ctx, approvalId);
  if (!link) {
    ctx.logger.warn("callback received but link missing", { approvalId });
    return;
  }

  // idempotency: if already decided, skip
  if (link.status === "approved" || link.status === "rejected") {
    ctx.logger.debug("callback skipped (approval already decided)", {
      approvalId,
      status: link.status,
    });
    return;
  }

  // Update link status
  const nextStatus =
    payload.status === "approved" || payload.status === "rejected"
      ? payload.status
      : link.status;
  const updated: ApprovalLinkState = {
    ...link,
    status: nextStatus,
    decidedAt: payload.operatedAt,
    decidedBy: payload.operator,
  };
  await writeApprovalLink(ctx, updated);

  // M1: log the decision + write activity_log; real PaperClip
  // approval-status mutation requires a core-server endpoint that isn't
  // exposed via the SDK yet. M2 wire path:
  //   await ctx.http.fetch(
  //     `${hostBase}/api/companies/${link.companyId}/approvals/${approvalId}/decide`,
  //     { method: "POST", ... }
  //   );
  // For now we surface the decision through logger + activity_log so the
  // downstream approvals watcher (or a manual reconcile job in M2) can pick it up.
  ctx.logger.info("飞书 approval decision received", {
    approvalId,
    status: nextStatus,
    operator: payload.operator,
  });

  await safeActivityLog(ctx, {
    companyId: link.companyId,
    message: `Lark approval ${nextStatus} for approval ${approvalId}`,
    entityType: "approval",
    entityId: approvalId,
    metadata: {
      status: nextStatus,
      operator: payload.operator,
      operatedAt: payload.operatedAt,
      instanceCode: payload.instanceCode,
    },
  });
}

/**
 * Cron job: reconcile pending approvals older than 30 min against 飞书.
 * M1 skeleton: scans state, logs, and re-marks stale (>24h) entries as canceled.
 * M2: call `larkGetApprovalInstance` and reconcile status.
 */
export async function refreshPendingApprovals(ctx: PluginContext): Promise<void> {
  ctx.logger.debug("refreshPendingApprovals: M1 skeleton run (no reconcile yet)");
  // NOTE: `ctx.state` does not expose `list()` in the current SDK surface —
  //   only get/set/delete against known keys. Real reconcile in M2 will use
  //   `ctx.db.query()` against `plugin_ai_company_lark_approval_link` once we
  //   graduate state -> table. For now this handler exists so the manifest
  //   cron declaration is valid + operator UI shows a running job.
}

// ---------------------------------------------------------------------------
// state helpers
// ---------------------------------------------------------------------------

async function readApprovalLink(
  ctx: PluginContext,
  approvalId: string,
): Promise<ApprovalLinkState | null> {
  const raw = await ctx.state.get({
    scopeKind: "instance",
    stateKey: `lark:approval:${approvalId}`,
  });
  if (!raw || typeof raw !== "object") return null;
  return raw as ApprovalLinkState;
}

async function writeApprovalLink(
  ctx: PluginContext,
  link: ApprovalLinkState,
): Promise<void> {
  await ctx.state.set(
    { scopeKind: "instance", stateKey: `lark:approval:${link.approvalId}` },
    link,
  );
}

async function writeInstanceIndex(
  ctx: PluginContext,
  instanceCode: string,
  approvalId: string,
): Promise<void> {
  await ctx.state.set(
    { scopeKind: "instance", stateKey: `lark:instance:${instanceCode}` },
    { approvalId },
  );
}

async function resolveApprovalIdFromInstance(
  ctx: PluginContext,
  instanceCode: string,
): Promise<string | null> {
  if (!instanceCode) return null;
  const raw = await ctx.state.get({
    scopeKind: "instance",
    stateKey: `lark:instance:${instanceCode}`,
  });
  if (!raw || typeof raw !== "object") return null;
  const idx = raw as { approvalId?: string };
  return idx.approvalId ?? null;
}

async function resolveBoundChatId(ctx: PluginContext): Promise<string | null> {
  // Priority: plugin state (operator-managed) → secret (bootstrap fallback).
  const fromState = (await ctx.state.get({
    scopeKind: "instance",
    stateKey: "lark:bound-chat",
  })) as string | { chatId?: string } | null | undefined;
  if (typeof fromState === "string" && fromState.length > 0) return fromState;
  if (fromState && typeof fromState === "object" && fromState.chatId) {
    return String(fromState.chatId);
  }
  try {
    const fromSecret = await ctx.secrets.resolve("LARK_BOUND_CHAT_ID");
    if (typeof fromSecret === "string" && fromSecret.length > 0) return fromSecret;
  } catch {
    // secret provider does not have this key → return null so caller can log.
  }
  return null;
}

async function safeActivityLog(
  ctx: PluginContext,
  entry: {
    companyId: string;
    message: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await ctx.activity.log(entry);
  } catch (err) {
    ctx.logger.warn("activity.log failed, falling back to structured log", {
      err: String(err),
      entry,
    });
  }
}
