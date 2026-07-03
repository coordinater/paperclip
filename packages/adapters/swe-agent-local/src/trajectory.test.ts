import { describe, expect, it } from "vitest";
import {
  parseTrajectoryLine,
  parseTrajectoryChunk,
  activityLogActionFor,
} from "./trajectory.js";

describe("parseTrajectoryLine", () => {
  it("parses a canonical action event", () => {
    const line = JSON.stringify({ role: "action", content: { cmd: "bash", input: "ls -la" } });
    const evt = parseTrajectoryLine(line);
    expect(evt?.kind).toBe("tool_call");
    if (evt?.kind === "tool_call") {
      expect(evt.cmd).toBe("bash");
      expect(evt.args).toBe("ls -la");
    }
  });

  it("parses observation event with exit_code", () => {
    const line = JSON.stringify({
      role: "observation",
      content: { stdout: "total 0\n", exit_code: 0 },
    });
    const evt = parseTrajectoryLine(line);
    expect(evt?.kind).toBe("tool_result");
    if (evt?.kind === "tool_result") {
      expect(evt.stdout).toContain("total 0");
      expect(evt.exitCode).toBe(0);
    }
  });

  it("parses human_input event with choices", () => {
    const line = JSON.stringify({
      role: "human_input",
      content: {
        prompt: "Which file to edit?",
        choices: [
          { key: "a", label: "auth.py" },
          { key: "b", label: "login.py", description: "front-end handler" },
        ],
      },
    });
    const evt = parseTrajectoryLine(line);
    expect(evt?.kind).toBe("question");
    if (evt?.kind === "question") {
      expect(evt.prompt).toBe("Which file to edit?");
      expect(evt.choices).toHaveLength(2);
      expect(evt.choices[1]?.description).toBe("front-end handler");
    }
  });

  it("accepts the alternate `type` role field", () => {
    const line = JSON.stringify({ type: "tool_call", content: { cmd: "grep" } });
    const evt = parseTrajectoryLine(line);
    expect(evt?.kind).toBe("tool_call");
  });

  it("classifies unknown role as unknown", () => {
    const line = JSON.stringify({ role: "sysinfo", content: { message: "starting" } });
    const evt = parseTrajectoryLine(line);
    expect(evt?.kind).toBe("unknown");
  });

  it("returns null for non-JSON lines", () => {
    expect(parseTrajectoryLine("plain log line")).toBeNull();
    expect(parseTrajectoryLine("[INFO] hello")).toBeNull();
    expect(parseTrajectoryLine("")).toBeNull();
    expect(parseTrajectoryLine("   ")).toBeNull();
  });

  it("returns null for JSON arrays (not events)", () => {
    expect(parseTrajectoryLine("[1,2,3]")).toBeNull();
  });

  it("returns null for broken JSON", () => {
    expect(parseTrajectoryLine("{role: action}")).toBeNull();
  });

  it("flattens the shape when `role` sits at top level without `content` wrapper", () => {
    // Some SWE-agent versions emit flat objects instead of {role, content}
    const line = JSON.stringify({ role: "action", cmd: "bash", input: "pwd" });
    const evt = parseTrajectoryLine(line);
    expect(evt?.kind).toBe("tool_call");
    if (evt?.kind === "tool_call") {
      expect(evt.cmd).toBe("bash");
      expect(evt.args).toBe("pwd");
    }
  });

  it("tolerates string choices in questions", () => {
    const line = JSON.stringify({
      role: "human_input",
      content: { prompt: "Continue?", choices: ["yes", "no"] },
    });
    const evt = parseTrajectoryLine(line);
    expect(evt?.kind).toBe("question");
    if (evt?.kind === "question") {
      expect(evt.choices).toEqual([
        { key: "yes", label: "yes" },
        { key: "no", label: "no" },
      ]);
    }
  });
});

describe("parseTrajectoryChunk · streaming buffer semantics", () => {
  it("parses multiple complete lines in a single chunk", () => {
    const chunk = [
      JSON.stringify({ role: "action", content: { cmd: "bash", input: "ls" } }),
      JSON.stringify({ role: "observation", content: { stdout: "file1\n", exit_code: 0 } }),
      "",
    ].join("\n");
    const parsed = parseTrajectoryChunk(chunk, "");
    expect(parsed.events).toHaveLength(2);
    expect(parsed.events[0]?.kind).toBe("tool_call");
    expect(parsed.events[1]?.kind).toBe("tool_result");
    expect(parsed.remainder).toBe("");
  });

  it("buffers an incomplete last line into remainder", () => {
    const first = JSON.stringify({ role: "action", content: { cmd: "bash" } });
    const chunk = first + "\n" + '{"role":"observ';
    const parsed = parseTrajectoryChunk(chunk, "");
    expect(parsed.events).toHaveLength(1);
    expect(parsed.remainder).toBe('{"role":"observ');
  });

  it("stitches a fragment across two chunks into one event", () => {
    const parsed1 = parseTrajectoryChunk('{"role":"acti', "");
    expect(parsed1.events).toHaveLength(0);
    expect(parsed1.remainder).toBe('{"role":"acti');
    const parsed2 = parseTrajectoryChunk('on","content":{"cmd":"bash"}}\n', parsed1.remainder);
    expect(parsed2.events).toHaveLength(1);
    expect(parsed2.events[0]?.kind).toBe("tool_call");
  });

  it("skips non-JSON log lines interleaved with JSONL events", () => {
    const chunk = [
      "[INFO] starting SWE-agent",
      JSON.stringify({ role: "action", content: { cmd: "bash", input: "pwd" } }),
      "[INFO] step done",
      "",
    ].join("\n");
    const parsed = parseTrajectoryChunk(chunk, "");
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0]?.kind).toBe("tool_call");
  });
});

describe("activityLogActionFor", () => {
  it("maps tool_call → agent_tool_call", () => {
    expect(
      activityLogActionFor({ kind: "tool_call", cmd: "bash", args: "ls", raw: {} }),
    ).toBe("agent_tool_call");
  });
  it("maps tool_result → agent_tool_result", () => {
    expect(
      activityLogActionFor({ kind: "tool_result", stdout: "", exitCode: 0, raw: {} }),
    ).toBe("agent_tool_result");
  });
  it("maps question → agent_question_asked", () => {
    expect(
      activityLogActionFor({ kind: "question", prompt: "?", choices: [], raw: {} }),
    ).toBe("agent_question_asked");
  });
  it("maps unknown → agent_trajectory_unknown", () => {
    expect(activityLogActionFor({ kind: "unknown", raw: {} })).toBe("agent_trajectory_unknown");
  });
});
