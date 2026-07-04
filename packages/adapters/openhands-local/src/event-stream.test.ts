import { describe, expect, it } from "vitest";
import {
  activityLogActionFor,
  parseEventChunk,
  parseEventLine,
} from "./event-stream.js";

describe("parseEventLine", () => {
  it("parses agent action event", () => {
    const line = JSON.stringify({ source: "agent", action: "run", args: "ls -la" });
    const evt = parseEventLine(line);
    expect(evt?.kind).toBe("tool_call");
    if (evt?.kind === "tool_call") {
      expect(evt.action).toBe("run");
      expect(evt.args).toBe("ls -la");
    }
  });

  it("parses environment observation event", () => {
    const line = JSON.stringify({
      source: "environment",
      observation: "run",
      content: "total 0\n",
    });
    const evt = parseEventLine(line);
    expect(evt?.kind).toBe("tool_result");
    if (evt?.kind === "tool_result") {
      expect(evt.observation).toBe("run");
      expect(evt.content).toContain("total 0");
    }
  });

  it("parses user_message event", () => {
    const line = JSON.stringify({ source: "user", message: "Please clarify" });
    const evt = parseEventLine(line);
    expect(evt?.kind).toBe("user_message");
    if (evt?.kind === "user_message") {
      expect(evt.message).toBe("Please clarify");
    }
  });

  it("accepts legacy 0.x `role` field", () => {
    const line = JSON.stringify({ role: "agent", action: "edit" });
    const evt = parseEventLine(line);
    expect(evt?.kind).toBe("tool_call");
    if (evt?.kind === "tool_call") {
      expect(evt.action).toBe("edit");
    }
  });

  it("classifies unknown source as unknown", () => {
    const line = JSON.stringify({ source: "sysinfo", data: "starting" });
    const evt = parseEventLine(line);
    expect(evt?.kind).toBe("unknown");
  });

  it("returns null for non-JSON lines", () => {
    expect(parseEventLine("[INFO] loading model")).toBeNull();
    expect(parseEventLine("")).toBeNull();
    expect(parseEventLine("plain log")).toBeNull();
  });

  it("returns null for JSON arrays", () => {
    expect(parseEventLine("[1,2,3]")).toBeNull();
  });

  it("returns null for broken JSON", () => {
    expect(parseEventLine("{source: agent")).toBeNull();
  });

  it("stringifies object args when args is an object", () => {
    const line = JSON.stringify({
      source: "agent",
      action: "edit",
      args: { path: "file.py", start: 3, end: 5 },
    });
    const evt = parseEventLine(line);
    expect(evt?.kind).toBe("tool_call");
    if (evt?.kind === "tool_call") {
      expect(evt.args).toContain("file.py");
    }
  });
});

describe("parseEventChunk · streaming semantics", () => {
  it("parses multiple complete lines", () => {
    const chunk =
      [
        JSON.stringify({ source: "agent", action: "run", args: "ls" }),
        JSON.stringify({ source: "environment", observation: "run", content: "file1\n" }),
        "",
      ].join("\n");
    const parsed = parseEventChunk(chunk, "");
    expect(parsed.events).toHaveLength(2);
    expect(parsed.events[0]?.kind).toBe("tool_call");
    expect(parsed.events[1]?.kind).toBe("tool_result");
  });

  it("buffers incomplete last line into remainder", () => {
    const chunk =
      JSON.stringify({ source: "agent", action: "run" }) + "\n" + '{"source":"env';
    const parsed = parseEventChunk(chunk, "");
    expect(parsed.events).toHaveLength(1);
    expect(parsed.remainder).toBe('{"source":"env');
  });

  it("stitches a fragment across two chunks", () => {
    const p1 = parseEventChunk('{"source":"age', "");
    expect(p1.events).toHaveLength(0);
    const p2 = parseEventChunk('nt","action":"run"}\n', p1.remainder);
    expect(p2.events).toHaveLength(1);
    expect(p2.events[0]?.kind).toBe("tool_call");
  });

  it("skips interleaved non-JSON log lines", () => {
    const chunk = [
      "[INFO] starting OpenHands",
      JSON.stringify({ source: "agent", action: "run" }),
      "[INFO] step done",
      "",
    ].join("\n");
    const parsed = parseEventChunk(chunk, "");
    expect(parsed.events).toHaveLength(1);
  });
});

describe("activityLogActionFor", () => {
  it("maps each kind to the correct activity_log action", () => {
    expect(
      activityLogActionFor({ kind: "tool_call", action: "run", args: "ls", raw: {} }),
    ).toBe("agent_tool_call");
    expect(
      activityLogActionFor({ kind: "tool_result", observation: "run", content: "", raw: {} }),
    ).toBe("agent_tool_result");
    expect(
      activityLogActionFor({ kind: "user_message", message: "?", raw: {} }),
    ).toBe("agent_question_asked");
    expect(activityLogActionFor({ kind: "unknown", raw: {} })).toBe(
      "agent_event_unknown",
    );
  });
});
