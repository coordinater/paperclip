/**
 * Cold-email sequence state machine · M4-02 MVP.
 *
 * Pure functions · deterministic · Pattern-4.
 * States: draft → warmup → sending → replied / bounced / completed
 */

export type SequenceState =
  | "draft"
  | "warmup"
  | "sending"
  | "replied"
  | "bounced"
  | "completed";

export type SequenceEvent =
  | { kind: "approve_draft" }
  | { kind: "warmup_complete"; deliverability_score: number }
  | { kind: "send_batch_complete"; total_sent: number }
  | { kind: "reply_received"; message_id: string; is_unsubscribe: boolean }
  | { kind: "bounce_received"; message_id: string; bounce_kind: "hard" | "soft" | "complaint" }
  | { kind: "all_sent" }
  | { kind: "timeout" };

export type StateContext = {
  state: SequenceState;
  warmup_target_sent: number;
  warmup_deliverability_threshold: number;
  total_sent: number;
  bounce_count: number;
  reply_count: number;
  unsubscribe_count: number;
};

export function initialState(overrides: Partial<StateContext> = {}): StateContext {
  return {
    state: "draft",
    warmup_target_sent: 50,
    warmup_deliverability_threshold: 0.8,
    total_sent: 0,
    bounce_count: 0,
    reply_count: 0,
    unsubscribe_count: 0,
    ...overrides,
  };
}

/**
 * Pure state transition · never throws · returns new context.
 * Illegal transitions return the same context with `state` unchanged.
 */
export function nextState(
  ctx: StateContext,
  event: SequenceEvent,
): StateContext {
  switch (ctx.state) {
    case "draft":
      if (event.kind === "approve_draft") return { ...ctx, state: "warmup" };
      return ctx;

    case "warmup":
      if (event.kind === "warmup_complete") {
        const passesDeliverability =
          event.deliverability_score >= ctx.warmup_deliverability_threshold;
        const passesSentTarget = ctx.total_sent >= ctx.warmup_target_sent;
        if (passesDeliverability || passesSentTarget) {
          return { ...ctx, state: "sending" };
        }
        return ctx;
      }
      if (event.kind === "send_batch_complete") {
        return { ...ctx, total_sent: ctx.total_sent + event.total_sent };
      }
      if (event.kind === "bounce_received") {
        return { ...ctx, bounce_count: ctx.bounce_count + 1 };
      }
      if (event.kind === "timeout") return { ...ctx, state: "completed" };
      return ctx;

    case "sending":
      if (event.kind === "send_batch_complete") {
        return { ...ctx, total_sent: ctx.total_sent + event.total_sent };
      }
      if (event.kind === "reply_received") {
        const newCtx = {
          ...ctx,
          reply_count: ctx.reply_count + 1,
          unsubscribe_count: event.is_unsubscribe
            ? ctx.unsubscribe_count + 1
            : ctx.unsubscribe_count,
        };
        // Reply transitions to `replied` state · but sending continues for other recipients
        // We keep sequence in `sending` for continuous ops · UI can filter by reply_count
        return newCtx;
      }
      if (event.kind === "bounce_received") {
        return { ...ctx, bounce_count: ctx.bounce_count + 1 };
      }
      if (event.kind === "all_sent") return { ...ctx, state: "completed" };
      if (event.kind === "timeout") return { ...ctx, state: "completed" };
      return ctx;

    case "replied":
    case "bounced":
    case "completed":
      // Terminal states · only accept timeout as no-op or explicit re-entry
      return ctx;

    default:
      return ctx;
  }
}

/**
 * Returns true when the state machine has reached a terminal state.
 */
export function isTerminal(state: SequenceState): boolean {
  return state === "completed";
}

/**
 * Returns human-readable label for state machine visualisation.
 */
export function stateLabel(state: SequenceState): string {
  const labels: Record<SequenceState, string> = {
    draft: "Draft (awaiting approval)",
    warmup: "Warmup (pool ramp)",
    sending: "Sending (full send loop)",
    replied: "Replied (reached recipients)",
    bounced: "Bounced (hard bounces)",
    completed: "Completed (all sent · timeout · or all replied/bounced)",
  };
  return labels[state];
}
