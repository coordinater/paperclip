import { describe, expect, it, vi } from "vitest";
import { buildInvocation, execute, runProcess } from "./execute.js";
import { createServerAdapter, type } from "./index.js";

describe("swe-agent-local adapter · public surface", () => {
  it("registers a swe_agent_local server adapter with expected fields", () => {
    const adapter = createServerAdapter();
    expect(adapter.type).toBe("swe_agent_local");
    expect(typeof adapter.execute).toBe("function");
    expect(adapter.models).toEqual([]);
    expect(adapter.supportsLocalAgentJwt).toBe(false);
    expect(adapter.supportsInstructionsBundle).toBe(false);
    expect(adapter.agentConfigurationDoc).toContain("swe_agent_local");
    expect(adapter.agentConfigurationDoc).toContain("pip install --user sweagent");
  });

  it("getRuntimeCommandSpec falls back to a pip-install command", () => {
    const spec = createServerAdapter().getRuntimeCommandSpec?.({});
    expect(spec?.command).toBe("sweagent");
    expect(spec?.installCommand).toContain("pip install --user sweagent");
  });

  it("createSweAgentLocalServerAdapter alias points at createServerAdapter", async () => {
    const mod = await import("./index.js");
    expect(mod.createSweAgentLocalServerAdapter).toBe(createServerAdapter);
    expect(type).toBe("swe_agent_local");
  });
});

describe("buildInvocation", () => {
  const base = {
    runId: "run-xyz789",
    workspaceCwd: "/tmp/paperclip-workspace",
    agentName: "swe-deep-alt",
  };

  it("uses defaults when config is empty and renders taskBody", () => {
    const inv = buildInvocation({
      ...base,
      config: {},
      context: { taskBody: "fix login redirect" },
    });
    expect(inv.command).toBe("sweagent");
    expect(inv.cwd).toBe("/tmp/paperclip-workspace");
    expect(inv.args[0]).toBe("run");
    expect(inv.args).toContain("--problem_statement.text");
    expect(inv.args).toContain("fix login redirect");
    expect(inv.args).toContain("--env.repo.path");
    expect(inv.args).toContain("/tmp/paperclip-workspace");
    expect(inv.timeoutSec).toBe(1800);
    expect(inv.env.PAPERCLIP_RUN_ID).toBe("run-xyz789");
  });

  it("injects --agent.model.name when config.model is set", () => {
    const inv = buildInvocation({
      ...base,
      config: { model: "claude-sonnet-4-5" },
      context: { taskBody: "hi" },
    });
    const idx = inv.args.indexOf("--agent.model.name");
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(inv.args[idx + 1]).toBe("claude-sonnet-4-5");
  });

  it("uses configFile when provided", () => {
    const inv = buildInvocation({
      ...base,
      config: { configFile: "/etc/sweagent/prod.yaml" },
      context: {},
    });
    const idx = inv.args.indexOf("--config");
    expect(inv.args[idx + 1]).toBe("/etc/sweagent/prod.yaml");
  });

  it("problemStatement config overrides taskBody rendering", () => {
    const inv = buildInvocation({
      ...base,
      config: { problemStatement: "explicit override" },
      context: { taskBody: "will be ignored" },
    });
    expect(inv.problemStatement).toBe("explicit override");
  });

  it("renders promptTemplate variables", () => {
    const inv = buildInvocation({
      ...base,
      config: { promptTemplate: "[{{taskId}}] {{taskTitle}}\n\n{{taskBody}}" },
      context: {
        taskId: "T-77",
        taskTitle: "OAuth callback drops state",
        taskBody: "state param lost after redirect",
      },
    });
    expect(inv.problemStatement).toBe(
      "[T-77] OAuth callback drops state\n\nstate param lost after redirect",
    );
  });

  it("appends extraArgs at the tail", () => {
    const inv = buildInvocation({
      ...base,
      config: { extraArgs: ["--print_config", "--agent.max_steps", "10"] },
      context: { taskBody: "x" },
    });
    expect(inv.args.slice(-3)).toEqual(["--print_config", "--agent.max_steps", "10"]);
  });

  it("clamps invalid timeoutSec back to the default (1800)", () => {
    const inv = buildInvocation({ ...base, config: { timeoutSec: -5 }, context: {} });
    expect(inv.timeoutSec).toBe(1800);
  });
});

describe("execute · integration with a real subprocess", () => {
  it("runs a scripted trajectory via /bin/echo and captures JSONL events", async () => {
    const logs: string[] = [];
    const onLog = vi.fn(async (stream: "stdout" | "stderr", chunk: string) => {
      logs.push(`${stream}:${chunk}`);
    });

    // Craft a fake trajectory as CLI args to /bin/echo. Each arg becomes a
    // token on the echo output. We coalesce them into one JSONL line.
    const trajectoryLine = JSON.stringify({
      role: "action",
      content: { cmd: "bash", input: "ls -la" },
    });

    const result = await execute({
      runId: "run-int-swe",
      agent: { id: "a-1", name: "test", adapterType: "swe_agent_local" } as never,
      runtime: {} as never,
      config: {
        command: "/bin/echo",
        // Bypass buildInvocation's --problem_statement.text handling — echo
        // will print all args as one line, so just verify we can call it.
        // We test trajectory event capture directly via the runProcess unit path.
        problemStatement: trajectoryLine,
        extraArgs: [],
      },
      context: {},
      onLog,
    } as never);

    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.sessionDisplayId).toMatch(/^swe-agent-run-int-swe/);
    expect(result.provider).toBe("swe-agent");
    // trajectoryEventCounts should be present even when 0
    expect(result.resultJson).toHaveProperty("trajectoryEventCounts");
  }, 5000);

  it("runProcess streams JSONL trajectory events via onEvent hook", async () => {
    const events: Array<{ kind: string }> = [];
    const onEvent = (evt: { kind: string }) => {
      events.push(evt);
    };

    // Use printf so we can emit a two-line JSONL sequence
    const jsonl =
      JSON.stringify({ role: "action", content: { cmd: "bash", input: "pwd" } }) +
      "\n" +
      JSON.stringify({ role: "observation", content: { stdout: "/tmp\n", exit_code: 0 } }) +
      "\n";

    const result = await runProcess({
      command: "/bin/sh",
      args: ["-c", `printf '%s' ${escape(jsonl)}`],
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

  it("reports timedOut=true when subprocess exceeds timeoutSec", async () => {
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

  it("reports spawn_failed / child_error for a nonexistent command", async () => {
    const result = await runProcess({
      command: "/nonexistent/sweagent-does-not-exist",
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escape(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
