import { describe, expect, it } from "vitest";
import {
  initialState,
  isTerminal,
  nextState,
  stateLabel,
  type SequenceEvent,
} from "./state-machine.js";

describe("initialState", () => {
  it("returns draft state with sensible defaults", () => {
    const ctx = initialState();
    expect(ctx.state).toBe("draft");
    expect(ctx.warmup_target_sent).toBe(50);
    expect(ctx.warmup_deliverability_threshold).toBe(0.8);
    expect(ctx.total_sent).toBe(0);
  });

  it("respects overrides", () => {
    const ctx = initialState({ warmup_target_sent: 100 });
    expect(ctx.warmup_target_sent).toBe(100);
    expect(ctx.state).toBe("draft");
  });
});

describe("nextState · draft transitions", () => {
  it("approve_draft moves to warmup", () => {
    const ctx = initialState();
    const next = nextState(ctx, { kind: "approve_draft" });
    expect(next.state).toBe("warmup");
  });

  it("ignores non-approval events", () => {
    const ctx = initialState();
    const next = nextState(ctx, { kind: "all_sent" });
    expect(next.state).toBe("draft");
  });
});

describe("nextState · warmup transitions", () => {
  const warmupCtx = () => nextState(initialState(), { kind: "approve_draft" });

  it("warmup_complete with deliverability score above threshold moves to sending", () => {
    const ctx = warmupCtx();
    const next = nextState(ctx, {
      kind: "warmup_complete",
      deliverability_score: 0.85,
    });
    expect(next.state).toBe("sending");
  });

  it("warmup_complete with sent target reached moves to sending", () => {
    const ctx = { ...warmupCtx(), total_sent: 50 };
    const next = nextState(ctx, {
      kind: "warmup_complete",
      deliverability_score: 0.5, // low
    });
    expect(next.state).toBe("sending"); // sent target passes
  });

  it("warmup_complete with low deliverability + low sent stays in warmup", () => {
    const ctx = warmupCtx();
    const next = nextState(ctx, {
      kind: "warmup_complete",
      deliverability_score: 0.5,
    });
    expect(next.state).toBe("warmup");
  });

  it("send_batch_complete accumulates total_sent", () => {
    const ctx = warmupCtx();
    const next = nextState(ctx, { kind: "send_batch_complete", total_sent: 10 });
    expect(next.total_sent).toBe(10);
    expect(next.state).toBe("warmup");
  });

  it("bounce_received increments bounce_count", () => {
    const ctx = warmupCtx();
    const next = nextState(ctx, {
      kind: "bounce_received",
      message_id: "m1",
      bounce_kind: "hard",
    });
    expect(next.bounce_count).toBe(1);
    expect(next.state).toBe("warmup");
  });

  it("timeout in warmup moves to completed", () => {
    const ctx = warmupCtx();
    const next = nextState(ctx, { kind: "timeout" });
    expect(next.state).toBe("completed");
  });
});

describe("nextState · sending transitions", () => {
  const sendingCtx = () => {
    const c1 = nextState(initialState(), { kind: "approve_draft" });
    return nextState(
      { ...c1, total_sent: 50 },
      { kind: "warmup_complete", deliverability_score: 0.9 },
    );
  };

  it("send_batch_complete accumulates total_sent", () => {
    const ctx = sendingCtx();
    const next = nextState(ctx, { kind: "send_batch_complete", total_sent: 30 });
    expect(next.total_sent).toBe(80); // 50 warmup + 30 sending
  });

  it("reply_received without unsubscribe increments reply_count", () => {
    const ctx = sendingCtx();
    const next = nextState(ctx, {
      kind: "reply_received",
      message_id: "m1",
      is_unsubscribe: false,
    });
    expect(next.reply_count).toBe(1);
    expect(next.unsubscribe_count).toBe(0);
    expect(next.state).toBe("sending"); // continues
  });

  it("reply_received with unsubscribe increments both counters", () => {
    const ctx = sendingCtx();
    const next = nextState(ctx, {
      kind: "reply_received",
      message_id: "m1",
      is_unsubscribe: true,
    });
    expect(next.reply_count).toBe(1);
    expect(next.unsubscribe_count).toBe(1);
  });

  it("all_sent moves to completed", () => {
    const ctx = sendingCtx();
    const next = nextState(ctx, { kind: "all_sent" });
    expect(next.state).toBe("completed");
  });

  it("timeout in sending moves to completed", () => {
    const ctx = sendingCtx();
    const next = nextState(ctx, { kind: "timeout" });
    expect(next.state).toBe("completed");
  });
});

describe("nextState · terminal states", () => {
  const completedCtx = () => {
    const c = nextState(initialState(), { kind: "approve_draft" });
    const w = nextState(
      { ...c, total_sent: 50 },
      { kind: "warmup_complete", deliverability_score: 0.9 },
    );
    return nextState(w, { kind: "all_sent" });
  };

  it("completed state ignores all events (idempotent)", () => {
    const ctx = completedCtx();
    const evts: SequenceEvent[] = [
      { kind: "approve_draft" },
      { kind: "send_batch_complete", total_sent: 10 },
      { kind: "reply_received", message_id: "m1", is_unsubscribe: false },
      { kind: "timeout" },
    ];
    for (const e of evts) {
      expect(nextState(ctx, e).state).toBe("completed");
    }
  });
});

describe("isTerminal", () => {
  it("only completed is terminal", () => {
    expect(isTerminal("draft")).toBe(false);
    expect(isTerminal("warmup")).toBe(false);
    expect(isTerminal("sending")).toBe(false);
    expect(isTerminal("replied")).toBe(false);
    expect(isTerminal("bounced")).toBe(false);
    expect(isTerminal("completed")).toBe(true);
  });
});

describe("stateLabel", () => {
  it("returns human-readable label for all states", () => {
    expect(stateLabel("draft")).toContain("Draft");
    expect(stateLabel("warmup")).toContain("Warmup");
    expect(stateLabel("sending")).toContain("Sending");
    expect(stateLabel("completed")).toContain("Completed");
  });
});
