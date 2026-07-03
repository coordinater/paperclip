/**
 * Worker entrypoint for @ai-company/paperclip-plugin-lark.
 *
 * Wired at W4-D5 per handoff/03-施工手册-M1.md §W4.3.
 *
 * SDK surface deviations from the W3-D7 TODO assumptions:
 *   - `ctx.http` is `PluginHttpClient` (only `.fetch()`), not `.register()`.
 *     Inbound webhooks are declared in the manifest and land in `onWebhook`.
 *     We keep the `webhooks.ts` `verifyAndDispatchLarkEvent` /
 *     `handleLarkApprovalCallbackWebhook` handlers separate for testability
 *     and switch on `endpointKey` inside `onWebhook`.
 *   - `ctx.actions.register` is for `usePluginAction()` from the plugin UI,
 *     not for arbitrary named actions callable from other workers. We keep
 *     `lark.sendMessage` reachable to the UI via `actions.register("send-message", ...)`.
 *   - `ctx.secrets.get` doesn't exist; the correct name is `ctx.secrets.resolve(ref)`.
 *   - `ctx.state.get/set` takes a `ScopeKey` object, not a string.
 *   - `ctx.jobs.register(key, fn)` — matches the TODO shape.
 *
 * Directly imports `@paperclipai/plugin-sdk` per handoff/06-规范.md §2.3
 * (Plugin SDK 是唯一有 6-month deprecation SLA 的稳定契约层).
 */

import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import type { PluginContext, PluginWebhookInput } from "@paperclipai/plugin-sdk";
import { createLarkClient, larkSendMessage } from "./lark-client.js";
import {
  handleApprovalCreated,
  refreshPendingApprovals,
  type ApprovalCreatedEvent,
} from "./approval-sync.js";
import {
  verifyAndDispatchLarkEvent,
  handleLarkApprovalCallbackWebhook,
  type LarkWebhookRequest,
} from "./webhooks.js";

// Capture ctx during setup so the lifecycle hooks that don't take ctx
// (onWebhook / onHealth / cron jobs) can still reach it. The host guarantees
// setup completes before any of those fire.
let capturedCtx: PluginContext | null = null;

const plugin = definePlugin({
  async setup(ctx) {
    capturedCtx = ctx;
    ctx.logger.info("paperclip-plugin-lark worker starting", {
      pluginId: ctx.manifest.id,
      version: ctx.manifest.version,
    });

    // 1. Subscribe to approval.created → post interactive approval card
    ctx.events.on("approval.created", async (event) => {
      // Event payload for approval.created carries { approvalId, approvalType,
      // requestedBy, payload }; envelope carries companyId + entityId.
      const rawPayload = (event.payload ?? {}) as Record<string, unknown>;
      const domainEvent: ApprovalCreatedEvent = {
        approvalId:
          (rawPayload.approvalId as string | undefined) ??
          (event.entityId as string | undefined) ??
          "",
        approvalType:
          (rawPayload.approvalType as string | undefined) ??
          (rawPayload.type as string | undefined) ??
          "",
        companyId: event.companyId,
        requestedBy:
          (rawPayload.requestedBy as string | undefined) ??
          (event.actorId as string | undefined) ??
          "",
        payload:
          (rawPayload.payload as Record<string, unknown> | undefined) ?? rawPayload,
      };
      await handleApprovalCreated(ctx, domainEvent);
    });

    // 2. Expose "send-message" as a UI-callable performAction
    ctx.actions.register("send-message", async (params) => {
      const client = await createLarkClient(ctx);
      const result = await larkSendMessage(client, {
        chatId: String(params.chatId ?? ""),
        msgType: (params.msgType as "text" | "post" | "interactive") ?? "text",
        content: (params.content as string | Record<string, unknown>) ?? "",
      });
      return result;
    });

    // 3. Register scheduled reconcile jobs
    ctx.jobs.register("refresh-pending-approvals", async () => {
      await refreshPendingApprovals(ctx);
    });
    ctx.jobs.register("refresh-tenant-access-token", async () => {
      // SDK-side cache handles it; touch the client so lazy init runs before
      // 飞书 rejects a stale token.
      try {
        await createLarkClient(ctx);
      } catch (err) {
        ctx.logger.warn("tenant-token refresh probe failed", { err: String(err) });
      }
    });

    // 4. UI data endpoint: expose bound-chat status
    ctx.data.register("bound-chat-status", async () => {
      const chatIdState = await ctx.state.get({
        scopeKind: "instance",
        stateKey: "lark:bound-chat",
      });
      return { boundChatId: chatIdState ?? null };
    });
  },

  async onWebhook(input: PluginWebhookInput) {
    const req: LarkWebhookRequest = {
      headers: normalizeHeaders(input.headers),
      rawBody: input.rawBody,
      parsedBody:
        (input.parsedBody as Record<string, unknown> | undefined) ??
        safeJson(input.rawBody),
    };
    const ctx = capturedCtx;
    if (!ctx) {
      // onWebhook may arrive before setup fully resolves in edge cases; the
      // host retries, but log so operators see the race.
      // eslint-disable-next-line no-console
      console.warn("[paperclip-plugin-lark] onWebhook invoked before setup captured ctx");
      return;
    }
    switch (input.endpointKey) {
      case "event":
        await verifyAndDispatchLarkEvent(ctx, req);
        return;
      case "approval-callback":
        await handleLarkApprovalCallbackWebhook(ctx, req);
        return;
      default:
        ctx.logger.warn("unknown webhook endpointKey", { endpointKey: input.endpointKey });
        return;
    }
  },

  async onHealth() {
    const boundChatId = capturedCtx
      ? await capturedCtx.state.get({
          scopeKind: "instance",
          stateKey: "lark:bound-chat",
        })
      : null;
    return {
      status: "ok" as const,
      message: "paperclip-plugin-lark healthy",
      details: {
        boundChatId: Boolean(boundChatId),
      },
    };
  },
});

function normalizeHeaders(
  raw: Record<string, string | string[]>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = Array.isArray(v) ? v.join(",") : v;
  }
  return out;
}

function safeJson(body: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(body);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export default plugin;

runWorker(plugin, import.meta.url);
