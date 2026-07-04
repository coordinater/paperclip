import { describe, expect, it, vi } from "vitest";
import { buildInvocation, execute, runProcess } from "./execute.js";
import { createServerAdapter, type } from "./index.js";

describe("openhands-local adapter · public surface", () => {
  it("registers openhands_local with expected fields", () => {
    const adapter = createServerAdapter();
    expect(adapter.type).toBe("openhands_local");
    expect(typeof adapter.execute).toBe("function");
    expect(adapter.models).toEqual([]);
    expect(adapter.supportsLocalAgentJwt).toBe(false);
    expect(adapter.agentConfigurationDoc).toContain("openhands_local");
    expect(adapter.agentConfigurationDoc).toContain("pip install --user openhands-ai");
    expect(adapter.agentConfigurationDoc).toContain("Docker");
  });

  it("getRuntimeCommandSpec falls back to pip install", () => {
    const spec = createServerAdapter().getRuntimeCommandSpec?.({});
    expect(spec?.command).toBe("openhands");
    expect(spec?.installCommand).toContain("pip install --user openhands-ai");
  });

  it("createOpenHandsLocalServerAdapter alias points at createServerAdapter", async () => {
    const mod = await import("./index.js");
    expect(mod.createOpenHandsLocalServerAdapter).toBe(createServerAdapter);
    expect(type).toBe("openhands_local");
  });
});

describe("buildInvocation", () => {
  const base = {
    runId: "run-xyz",
    workspaceCwd: "/tmp/paperclip-workspace",
    agentName: "generalist",
  };

  it("uses defaults when config is empty", () => {
    const inv = buildInvocation({
      ...base,
      config: {},
      context: { taskBody: "explore the workspace" },
    });
    expect(inv.command).toBe("openhands");
    expect(inv.cwd).toBe("/tmp/paperclip-workspace");
    expect(inv.args).toContain("--task");
    expect(inv.args).toContain("explore the workspace");
    expect(inv.args).toContain("--workspace");
    expect(inv.args).toContain("/tmp/paperclip-workspace");
    expect(inv.args).toContain("--max-iterations");
    expect(inv.args).toContain("30");
    expect(inv.maxIterations).toBe(30);
    expect(inv.timeoutSec).toBe(1800);
  });

  it("injects --llm-model when config.model set", () => {
    const inv = buildInvocation({
      ...base,
      config: { model: "gpt-4o" },
      context: { taskBody: "hi" },
    });
    const idx = inv.args.indexOf("--llm-model");
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(inv.args[idx + 1]).toBe("gpt-4o");
  });

  it("honors config.taskDescription over promptTemplate rendering", () => {
    const inv = buildInvocation({
      ...base,
      config: { taskDescription: "explicit task" },
      context: { taskBody: "ignored" },
    });
    expect(inv.taskDescription).toBe("explicit task");
  });

  it("renders promptTemplate variables", () => {
    const inv = buildInvocation({
      ...base,
      config: { promptTemplate: "[{{taskId}}] {{taskTitle}}\n\n{{taskBody}}" },
      context: {
        taskId: "T-9",
        taskTitle: "Fix login",
        taskBody: "clicking login does nothing",
      },
    });
    expect(inv.taskDescription).toBe("[T-9] Fix login\n\nclicking login does nothing");
  });

  it("respects config.maxIterations", () => {
    const inv = buildInvocation({
      ...base,
      config: { maxIterations: 10 },
      context: {},
    });
    expect(inv.maxIterations).toBe(10);
    const idx = inv.args.indexOf("--max-iterations");
    expect(inv.args[idx + 1]).toBe("10");
  });

  it("appends extraArgs at the tail", () => {
    const inv = buildInvocation({
      ...base,
      config: { extraArgs: ["--memory-backend", "cognee"] },
      context: { taskBody: "x" },
    });
    expect(inv.args.slice(-2)).toEqual(["--memory-backend", "cognee"]);
  });

  it("clamps invalid timeoutSec/maxIterations to defaults", () => {
    const inv = buildInvocation({
      ...base,
      config: { timeoutSec: -5, maxIterations: -3 },
      context: {},
    });
    expect(inv.timeoutSec).toBe(1800);
    expect(inv.maxIterations).toBe(30);
  });
});

describe("execute · integration with a real subprocess", () => {
  it("runs /bin/echo · reports exitCode=0 · streams stdout", async () => {
    const logs: string[] = [];
    const onLog = vi.fn(async (stream: "stdout" | "stderr", chunk: string) => {
      logs.push(`${stream}:${chunk.trim()}`);
    });

    const result = await execute({
      runId: "run-int-oh",
      agent: { id: "a-1", name: "test", adapterType: "openhands_local" } as never,
      runtime: {} as never,
      config: { command: "/bin/echo" },
      context: { taskBody: "hello openhands" },
      onLog,
    } as never);

    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.sessionDisplayId).toMatch(/^openhands-run-int-oh/);
    expect(result.provider).toBe("openhands");
    expect(result.resultJson).toHaveProperty("eventCounts");
    expect(logs.some((l) => l.includes("hello openhands"))).toBe(true);
  }, 5000);

  it("runProcess streams JSONL events via onEvent hook", async () => {
    const events: Array<{ kind: string }> = [];
    const onEvent = (evt: { kind: string }) => events.push(evt);

    const jsonl =
      JSON.stringify({ source: "agent", action: "run", args: "pwd" }) +
      "\n" +
      JSON.stringify({ source: "environment", observation: "run", content: "/tmp\n" }) +
      "\n";

    const result = await runProcess({
      command: "/bin/sh",
      args: ["-c", `printf '%s' ${escapeShell(jsonl)}`],
      cwd: "/tmp",
      env: {},
      timeoutSec: 3,
      graceSec: 1,
      onLog: async () => {},
      onEvent,
    });

    expect(result.exitCode).toBe(0);
    expect(events).toHaveLength(2);
    expect(events[0]?.kind).toBe("tool_call");
    expect(events[1]?.kind).toBe("tool_result");
  }, 5000);

  it("reports timedOut=true on subprocess exceeding timeoutSec", async () => {
    const result = await runProcess({
      command: "/bin/sh",
      args: ["-c", "sleep 5"],
      cwd: "/tmp",
      env: {},
      timeoutSec: 0.2,
      graceSec: 0.1,
      onLog: async () => {},
    });
    expect(result.timedOut).toBe(true);
  }, 10000);

  it("reports child_error for nonexistent command", async () => {
    const result = await runProcess({
      command: "/nonexistent/openhands-xyz",
      args: [],
      cwd: "/tmp",
      env: {},
      timeoutSec: 1,
      graceSec: 0.1,
      onLog: async () => {},
    });
    expect(result.exitCode).toBe(null);
    expect(result.errorCode).toBe("child_error");
  }, 5000);
});

function escapeShell(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
