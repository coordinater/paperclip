/**
 * OpenHands event stream JSONL parser.
 *
 * OpenHands emits agent execution events on stdout as one-JSON-object-per-line.
 * Event shapes (defensive · schema evolves per OpenHands version):
 *   { source: "agent",       action: "run"|"edit"|"read"|"finish", args: {...} }
 *   { source: "environment", observation: "run"|"read"|..., content: "..." }
 *   { source: "user",        message: "..." }
 *
 * Older 0.x versions used `role` instead of `source`. We accept both.
 *
 * Copies the shape of `swe-agent-local/src/trajectory.ts` (D-M2-01 pattern
 * 3rd reuse) — parser is defensive and skips non-JSON silently.
 */

export interface EventToolCall {
  kind: "tool_call";
  action: string;
  args: string | null;
  raw: Record<string, unknown>;
}

export interface EventToolResult {
  kind: "tool_result";
  observation: string;
  content: string;
  raw: Record<string, unknown>;
}

export interface EventUserMessage {
  kind: "user_message";
  message: string;
  raw: Record<string, unknown>;
}

export interface EventUnknown {
  kind: "unknown";
  raw: Record<string, unknown>;
}

export type OpenHandsEvent =
  | EventToolCall
  | EventToolResult
  | EventUserMessage
  | EventUnknown;

/** Parse a single JSONL line into an OpenHandsEvent, or `null` if not JSON. */
export function parseEventLine(line: string): OpenHandsEvent | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;
  if (trimmed[0] !== "{" && trimmed[0] !== "[") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const obj = parsed as Record<string, unknown>;
  const source = readString(obj.source) ?? readString(obj.role);

  if (source === "agent") {
    return {
      kind: "tool_call",
      action: readString(obj.action) ?? readString(obj.tool) ?? "",
      args:
        readString(obj.args) ??
        readString(obj.input) ??
        readStringFromObject(obj.args) ??
        null,
      raw: obj,
    };
  }
  if (source === "environment") {
    return {
      kind: "tool_result",
      observation: readString(obj.observation) ?? readString(obj.type) ?? "",
      content: readString(obj.content) ?? readString(obj.stdout) ?? readString(obj.output) ?? "",
      raw: obj,
    };
  }
  if (source === "user") {
    return {
      kind: "user_message",
      message: readString(obj.message) ?? readString(obj.content) ?? "",
      raw: obj,
    };
  }
  return { kind: "unknown", raw: obj };
}

/**
 * Parse a chunk of stdout (may contain multiple newline-separated JSONL lines).
 * Streaming-safe: caller passes `remainder` from the previous invocation and
 * receives a new `remainder` for the next chunk.
 */
export function parseEventChunk(
  chunk: string,
  remainder: string,
): { events: OpenHandsEvent[]; remainder: string } {
  const combined = remainder + chunk;
  const lines = combined.split("\n");
  const nextRemainder = lines.pop() ?? "";
  const events: OpenHandsEvent[] = [];
  for (const line of lines) {
    const evt = parseEventLine(line);
    if (evt) events.push(evt);
  }
  return { events, remainder: nextRemainder };
}

export function activityLogActionFor(event: OpenHandsEvent): string {
  switch (event.kind) {
    case "tool_call":
      return "agent_tool_call";
    case "tool_result":
      return "agent_tool_result";
    case "user_message":
      return "agent_question_asked";
    case "unknown":
      return "agent_event_unknown";
  }
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readStringFromObject(value: unknown): string | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }
  return null;
}
