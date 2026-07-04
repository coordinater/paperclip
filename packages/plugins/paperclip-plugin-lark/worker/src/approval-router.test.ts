import { describe, expect, it, vi } from "vitest";
import {
  handleBudgetIncidentApproval,
  handleCeoStrategyApproval,
  isRoutedApprovalType,
  routeApproval,
} from "./approval-router.js";
import { createMockCtx as createMockPluginContext } from "./test-mock-ctx.js";

describe("isRoutedApprovalType", () => {
  it("recognizes the 3 M2 W8-D4 types", () => {
    expect(isRoutedApprovalType("hire_agent")).toBe(true);
    expect(isRoutedApprovalType("ceo_strategy")).toBe(true);
    expect(isRoutedApprovalType("budget_incident")).toBe(true);
  });
  it("rejects unknown types", () => {
    expect(isRoutedApprovalType("random_type")).toBe(false);
    expect(isRoutedApprovalType("")).toBe(false);
  });
});

describe("routeApproval · hire_agent", () => {
  it("renders hire_agent card with role + adapter + model bullets", () => {
    const card = routeApproval({
      approvalId: "a1",
      approvalType: "hire_agent",
      companyId: "c1",
      requestedBy: "board:mark",
      payload: { role: "swe-baseline", adapterType: "mini_swe_local", model: "claude-sonnet-4-5" },
    });
    expect(card?.approvalType).toBe("hire_agent");
    expect(card?.title).toContain("Hire Agent");
    expect(card?.routingHint.channel).toBe("default");
    const labels = card!.bulletFields.map((b) => b.label);
    expect(labels).toContain("Role");
    expect(labels).toContain("Adapter");
    expect(labels).toContain("Model");
  });
});

describe("routeApproval · ceo_strategy", () => {
  it("renders ceo_strategy card + routes to executive channel", () => {
    const card = routeApproval({
      approvalId: "a2",
      approvalType: "ceo_strategy",
      companyId: "c1",
      requestedBy: "board:mark",
      payload: {
        topic: "Pricing pivot",
        question: "Should we drop the free tier?",
        options: [
          { key: "keep", label: "Keep free tier" },
          { key: "drop", label: "Drop free tier" },
        ],
        recommendation: "keep",
      },
    });
    expect(card?.approvalType).toBe("ceo_strategy");
    expect(card?.title).toContain("CEO Strategy");
    expect(card?.routingHint.channel).toBe("executive");
    const opts = card?.bulletFields.find((b) => b.label === "Options");
    expect(opts?.value).toContain("Keep free tier");
    expect(opts?.value).toContain("Drop free tier");
  });

  it("gracefully renders when options is a plain string", () => {
    const card = routeApproval({
      approvalId: "a2",
      approvalType: "ceo_strategy",
      companyId: "c1",
      requestedBy: "board:mark",
      payload: { topic: "quick", options: "yes | no" },
    });
    expect(card?.bulletFields.find((b) => b.label === "Options")?.value).toBe("yes | no");
  });
});

describe("routeApproval · budget_incident", () => {
  it("renders finance card + routes to finance channel", () => {
    const card = routeApproval({
      approvalId: "a3",
      approvalType: "budget_incident",
      companyId: "c1",
      requestedBy: "system:c8_middleware",
      payload: {
        amount: 4200,
        currency: "USD",
        category: "unexpected_egress",
        vendor: "AWS",
        description: "Data transfer spike on S3",
        runbook_url: "https://github.com/x/runbooks/aws-egress",
      },
    });
    expect(card?.approvalType).toBe("budget_incident");
    expect(card?.title).toContain("Budget Incident");
    expect(card?.routingHint.channel).toBe("finance");
    expect(card?.summary).toContain("USD");
    expect(card?.summary).toContain("4200.00");
    const desc = card?.bulletFields.find((b) => b.label === "Description")?.value;
    expect(desc).toBe("Data transfer spike on S3");
  });

  it("handles missing amount without throwing", () => {
    const card = routeApproval({
      approvalId: "a3",
      approvalType: "budget_incident",
      companyId: "c1",
      requestedBy: "sys",
      payload: { category: "unknown" },
    });
    expect(card?.summary).toContain("?");
  });
});

describe("routeApproval · unknown type", () => {
  it("returns null for unknown approvalType (log-and-skip semantics)", () => {
    expect(
      routeApproval({
        approvalId: "a4",
        approvalType: "brand_new_future_type",
        companyId: "c1",
        requestedBy: "sys",
        payload: {},
      }),
    ).toBeNull();
  });
});

describe("handleCeoStrategyApproval", () => {
  it("rejects when approvalType mismatches", async () => {
    const ctx = createMockPluginContext();
    const r = await handleCeoStrategyApproval(ctx, {
      approvalId: "a2",
      approvalType: "hire_agent", // wrong
      companyId: "c1",
      requestedBy: "sys",
      payload: {},
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("expected approvalType");
  });

  it("logs deliver-later mode when no sendCard hook", async () => {
    const ctx = createMockPluginContext();
    const infoLog = vi.spyOn(ctx.logger, "info");
    const r = await handleCeoStrategyApproval(ctx, {
      approvalId: "a2",
      approvalType: "ceo_strategy",
      companyId: "c1",
      requestedBy: "sys",
      payload: { topic: "x" },
    });
    expect(r.ok).toBe(true);
    expect(infoLog).toHaveBeenCalled();
  });

  it("calls sendCard hook and returns ok=true", async () => {
    const ctx = createMockPluginContext();
    const sendCard = vi.fn(async () => ({ instanceCode: "ic-1", messageId: "m-1" }));
    const r = await handleCeoStrategyApproval(
      ctx,
      {
        approvalId: "a2",
        approvalType: "ceo_strategy",
        companyId: "c1",
        requestedBy: "sys",
        payload: { topic: "x" },
      },
      { sendCard },
    );
    expect(r.ok).toBe(true);
    expect(sendCard).toHaveBeenCalledOnce();
    const [renderedCard] = sendCard.mock.calls[0]!;
    expect(renderedCard.approvalType).toBe("ceo_strategy");
    expect(renderedCard.routingHint.channel).toBe("executive");
  });
});

describe("handleBudgetIncidentApproval", () => {
  it("rejects on approvalType mismatch", async () => {
    const ctx = createMockPluginContext();
    const r = await handleBudgetIncidentApproval(ctx, {
      approvalId: "a3",
      approvalType: "ceo_strategy",
      companyId: "c1",
      requestedBy: "sys",
      payload: {},
    });
    expect(r.ok).toBe(false);
  });

  it("routes card to finance channel and calls sendCard", async () => {
    const ctx = createMockPluginContext();
    const sendCard = vi.fn(async () => ({ instanceCode: "ic-2", messageId: "m-2" }));
    const r = await handleBudgetIncidentApproval(
      ctx,
      {
        approvalId: "a3",
        approvalType: "budget_incident",
        companyId: "c1",
        requestedBy: "sys",
        payload: { amount: 100, currency: "USD" },
      },
      { sendCard },
    );
    expect(r.ok).toBe(true);
    const [renderedCard] = sendCard.mock.calls[0]!;
    expect(renderedCard.routingHint.channel).toBe("finance");
  });
});
