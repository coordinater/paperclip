/**
 * SWE-agent trajectory JSONL parser.
 *
 * SWE-agent 1.x emits trajectory events as one-JSON-object-per-line on stdout.
 * Each event has a `role` field indicating its semantic type. The exact schema
 * evolves with SWE-agent versions; this parser is defensive and skips
 * unrecognized shapes rather than throwing.
 *
 * We map SWE-agent events to Paperclip activity_log semantics:
 *   - `action`      → `agent_tool_call`
 *   - `observation` → `agent_tool_result`
 *   - `human_input` → `agent_question_asked`
 *
 * Unknown events are returned as `{ kind: "unknown", raw }` for the caller to
 * decide (log verbatim, drop, etc).
 */

export interface TrajectoryToolCall {
  kind: "tool_call";
  cmd: string;
  args: string | null;
  raw: Record<string, unknown>;
}

export interface TrajectoryToolResult {
  kind: "tool_result";
  stdout: string;
  exitCode: number | null;
  raw: Record<string, unknown>;
}

export interface TrajectoryQuestion {
  kind: "question";
  prompt: string;
  choices: Array<{ key: string; label: string; description?: string }>;
  raw: Record<string, unknown>;
}

export interface TrajectoryUnknown {
  kind: "unknown";
  raw: Record<string, unknown>;
}

export type TrajectoryEvent =
  | TrajectoryToolCall
  | TrajectoryToolResult
  | TrajectoryQuestion
  | TrajectoryUnknown;

/**
 * Parse a single JSONL line into a TrajectoryEvent, or `null` if the line
 * isn't valid JSON (SWE-agent occasionally emits plain text log lines).
 */
export function parseTrajectoryLine(line: string): TrajectoryEvent | null {
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
  const role = readString(obj.role) ?? readString(obj.type) ?? readString(obj.event);
  const content = obj.content && typeof obj.content === "object" && !Array.isArray(obj.content)
    ? (obj.content as Record<string, unknown>)
    : obj;

  switch (role) {
    case "action":
    case "tool_call":
      return {
        kind: "tool_call",
        cmd: readString(content.cmd) ?? readString(content.action) ?? readString(content.tool) ?? "",
        args:
          readString(content.args) ??
          readString(content.input) ??
          readString(content.arguments) ??
          null,
        raw: obj,
      };
    case "observation":
    case "tool_result":
      return {
        kind: "tool_result",
        stdout:
          readString(content.stdout) ??
          readString(content.output) ??
          readString(content.observation) ??
          "",
        exitCode: readNumber(content.exit_code) ?? readNumber(content.exitCode) ?? null,
        raw: obj,
      };
    case "human_input":
    case "question":
    case "clarification": {
      const choicesRaw = content.choices;
      const choices = Array.isArray(choicesRaw)
        ? (choicesRaw as unknown[])
            .flatMap((c) => normalizeChoice(c))
        : [];
      return {
        kind: "question",
        prompt: readString(content.prompt) ?? readString(content.question) ?? "",
        choices,
        raw: obj,
      };
    }
    default:
      return { kind: "unknown", raw: obj };
  }
}

/**
 * Parse a chunk of stdout (may contain multiple newline-separated JSONL lines).
 * Returns a list of TrajectoryEvent, skipping non-JSON lines silently.
 *
 * Handles incomplete last-line buffering: caller passes `remainder` from the
 * previous invocation and receives a new `remainder` for the next.
 */
export function parseTrajectoryChunk(
  chunk: string,
  remainder: string,
): { events: TrajectoryEvent[]; remainder: string } {
  const combined = remainder + chunk;
  const lines = combined.split("\n");
  const nextRemainder = lines.pop() ?? "";
  const events: TrajectoryEvent[] = [];
  for (const line of lines) {
    const evt = parseTrajectoryLine(line);
    if (evt) events.push(evt);
  }
  return { events, remainder: nextRemainder };
}

/**
 * Map a trajectory event to a Paperclip activity_log action name (string).
 * The caller then persists via activity_log with the event's `raw` as details.
 */
export function activityLogActionFor(event: TrajectoryEvent): string {
  switch (event.kind) {
    case "tool_call":
      return "agent_tool_call";
    case "tool_result":
      return "agent_tool_result";
    case "question":
      return "agent_question_asked";
    case "unknown":
      return "agent_trajectory_unknown";
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeChoice(raw: unknown): Array<{ key: string; label: string; description?: string }> {
  if (typeof raw === "string") {
    return [{ key: raw, label: raw }];
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const c = raw as Record<string, unknown>;
    const key = readString(c.key) ?? readString(c.value) ?? readString(c.id);
    const label = readString(c.label) ?? readString(c.text) ?? key;
    if (!key || !label) return [];
    const desc = readString(c.description);
    return [desc ? { key, label, description: desc } : { key, label }];
  }
  return [];
}
