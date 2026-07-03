import { describe, expect, it, vi } from "vitest";
import {
  handleApprovalCreated,
  handleLarkApprovalCallback,
  type ApprovalCreatedEvent,
  type LarkClientFactory,
} from "./approval-sync.js";
import type { LarkClientHandle, LarkPostApprovalCardParams } from "./lark-client.js";
import { createMockCtx } from "./test-mock-ctx.js";

const fakeClient: LarkClientHandle = {
  appId: "cli_test",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sdk: {} as any,
};
const fakeFactory: LarkClientFactory = async () => fakeClient;

describe("handleApprovalCreated", () => {
  it("skips non-hire_agent approval types", async () => {
    const ctx = createMockCtx({
      secrets: { LARK_BOUND_CHAT_ID: "oc_test" },
    });
    const postCard = vi.fn();
    const event: ApprovalCreatedEvent = {
      approvalId: "approval-x",
      approvalType: "spawn_run",
      companyId: "co-1",
      requestedBy: "user-1",
      payload: {},
    };
    await handleApprovalCreated(ctx, event, {
      clientFactory: fakeFactory,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      postApprovalCard: postCard as any,
    });
    expect(postCard).not.toHaveBeenCalled();
    // No approval link stored
    const stored = await ctx.state.get({
      scopeKind: "instance",
      stateKey: "lark:approval:approval-x",
    });
    expect(stored).toBeNull();
    const debug = ctx.__logs.find(
      (l) => l.level === "debug" && l.message.includes("skipped"),
    );
    expect(debug).toBeDefined();
  });

  it("posts a card and stores link state for hire_agent", async () => {
    const ctx = createMockCtx({
      secrets: { LARK_BOUND_CHAT_ID: "oc_test" },
    });
    const postCard = vi
      .fn<[LarkClientHandle, LarkPostApprovalCardParams], Promise<{ instanceCode: string; messageId: string }>>()
      .mockResolvedValue({ instanceCode: "card-om_123", messageId: "om_123" });
    const event: ApprovalCreatedEvent = {
      approvalId: "approval-1",
      approvalType: "hire_agent",
      companyId: "co-1",
      requestedBy: "user-1",
      payload: { candidateAgentId: "agent-x" },
    };
    await handleApprovalCreated(ctx, event, {
      clientFactory: fakeFactory,
      postApprovalCard: postCard,
    });
    expect(postCard).toHaveBeenCalledTimes(1);
    expect(postCard.mock.calls[0][1]).toMatchObject({
      chatId: "oc_test",
      approvalId: "approval-1",
    });

    // approval link stored
    const link = (await ctx.state.get({
      scopeKind: "instance",
      stateKey: "lark:approval:approval-1",
    })) as { instanceCode: string; status: string; chatId: string };
    expect(link).toMatchObject({
      instanceCode: "card-om_123",
      status: "pending",
      chatId: "oc_test",
    });
    // reverse index stored
    const index = (await ctx.state.get({
      scopeKind: "instance",
      stateKey: "lark:instance:card-om_123",
    })) as { approvalId: string };
    expect(index).toEqual({ approvalId: "approval-1" });
    // activity log written
    expect(ctx.__activityLog.length).toBe(1);
    expect(ctx.__activityLog[0]).toMatchObject({
      companyId: "co-1",
      entityType: "approval",
      entityId: "approval-1",
    });
  });

  it("is idempotent — second call with same approvalId does not repost", async () => {
    const ctx = createMockCtx({
      secrets: { LARK_BOUND_CHAT_ID: "oc_test" },
    });
    const postCard = vi
      .fn<[LarkClientHandle, LarkPostApprovalCardParams], Promise<{ instanceCode: string; messageId: string }>>()
      .mockResolvedValue({ instanceCode: "card-om_123", messageId: "om_123" });
    const event: ApprovalCreatedEvent = {
      approvalId: "approval-1",
      approvalType: "hire_agent",
      companyId: "co-1",
      requestedBy: "user-1",
      payload: {},
    };
    await handleApprovalCreated(ctx, event, {
      clientFactory: fakeFactory,
      postApprovalCard: postCard,
    });
    await handleApprovalCreated(ctx, event, {
      clientFactory: fakeFactory,
      postApprovalCard: postCard,
    });
    expect(postCard).toHaveBeenCalledTimes(1);
  });

  it("uses bound chat from plugin state when configured", async () => {
    const ctx = createMockCtx({});
    // No secret; state has the bound chat
    await ctx.state.set(
      { scopeKind: "instance", stateKey: "lark:bound-chat" },
      "oc_from_state",
    );
    const postCard = vi
      .fn<[LarkClientHandle, LarkPostApprovalCardParams], Promise<{ instanceCode: string; messageId: string }>>()
      .mockResolvedValue({ instanceCode: "card-1", messageId: "om_1" });
    await handleApprovalCreated(
      ctx,
      {
        approvalId: "approval-2",
        approvalType: "hire_agent",
        companyId: "co-1",
        requestedBy: "user-1",
        payload: {},
      },
      { clientFactory: fakeFactory, postApprovalCard: postCard },
    );
    expect(postCard.mock.calls[0][1].chatId).toBe("oc_from_state");
  });

  it("logs an error when no bound chat is configured", async () => {
    const ctx = createMockCtx({});
    const postCard = vi.fn();
    await handleApprovalCreated(
      ctx,
      {
        approvalId: "approval-3",
        approvalType: "hire_agent",
        companyId: "co-1",
        requestedBy: "user-1",
        payload: {},
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { clientFactory: fakeFactory, postApprovalCard: postCard as any },
    );
    expect(postCard).not.toHaveBeenCalled();
    const err = ctx.__logs.find((l) => l.level === "error");
    expect(err?.message).toMatch(/no bound 飞书 chatId/);
  });
});

describe("handleLarkApprovalCallback", () => {
  async function seedApproval(ctx: ReturnType<typeof createMockCtx>) {
    await ctx.state.set(
      { scopeKind: "instance", stateKey: "lark:approval:approval-1" },
      {
        approvalId: "approval-1",
        approvalType: "hire_agent",
        companyId: "co-1",
        instanceCode: "card-om_1",
        chatId: "oc_test",
        cardMessageId: "om_1",
        createdAt: new Date().toISOString(),
        status: "pending",
      },
    );
    await ctx.state.set(
      { scopeKind: "instance", stateKey: "lark:instance:card-om_1" },
      { approvalId: "approval-1" },
    );
  }

  it("updates the link status on first callback", async () => {
    const ctx = createMockCtx({});
    await seedApproval(ctx);
    await handleLarkApprovalCallback(ctx, {
      instanceCode: "card-om_1",
      status: "approved",
      operator: "ou_operator",
      operatedAt: "2026-07-03T00:00:00Z",
    });
    const link = (await ctx.state.get({
      scopeKind: "instance",
      stateKey: "lark:approval:approval-1",
    })) as { status: string; decidedBy: string };
    expect(link.status).toBe("approved");
    expect(link.decidedBy).toBe("ou_operator");
    expect(ctx.__activityLog.length).toBe(1);
  });

  it("is idempotent — second callback for already-decided approval is skipped", async () => {
    const ctx = createMockCtx({});
    await seedApproval(ctx);
    await handleLarkApprovalCallback(ctx, {
      instanceCode: "card-om_1",
      status: "approved",
      operator: "ou_operator",
      operatedAt: "2026-07-03T00:00:00Z",
    });
    await handleLarkApprovalCallback(ctx, {
      instanceCode: "card-om_1",
      status: "rejected", // even if 飞书 double-fires with a different status
      operator: "ou_operator2",
      operatedAt: "2026-07-03T00:00:01Z",
    });
    const link = (await ctx.state.get({
      scopeKind: "instance",
      stateKey: "lark:approval:approval-1",
    })) as { status: string; decidedBy: string };
    // Still the first decision
    expect(link.status).toBe("approved");
    expect(link.decidedBy).toBe("ou_operator");
    expect(ctx.__activityLog.length).toBe(1);
  });

  it("warns when instanceCode has no matching link", async () => {
    const ctx = createMockCtx({});
    await handleLarkApprovalCallback(ctx, {
      instanceCode: "card-unknown",
      status: "approved",
      operator: "ou_x",
      operatedAt: "2026-07-03T00:00:00Z",
    });
    const warn = ctx.__logs.find(
      (l) => l.level === "warn" && l.message.includes("no matching"),
    );
    expect(warn).toBeDefined();
  });
});
