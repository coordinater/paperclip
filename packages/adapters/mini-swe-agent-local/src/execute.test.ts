import { describe, expect, it, vi } from "vitest";
import { buildInvocation, execute, runProcess } from "./execute.js";
import { createServerAdapter, type } from "./index.js";

describe("mini-swe-agent-local adapter · public surface", () => {
  it("registers a mini_swe_local server adapter with expected fields", () => {
    const adapter = createServerAdapter();
    expect(adapter.type).toBe("mini_swe_local");
    expect(typeof adapter.execute).toBe("function");
    expect(adapter.models).toEqual([]);
    expect(adapter.supportsLocalAgentJwt).toBe(false);
    expect(adapter.supportsInstructionsBundle).toBe(false);
    expect(adapter.requiresMaterializedRuntimeSkills).toBe(false);
    expect(adapter.agentConfigurationDoc).toContain("mini_swe_local");
    expect(adapter.agentConfigurationDoc).toContain("pip install mini-swe-agent");
  });

  it("getRuntimeCommandSpec builds a pip-install fallback for the CLI", () => {
    const adapter = createServerAdapter();
    const spec = adapter.getRuntimeCommandSpec?.({});
    expect(spec?.command).toBe("mini-swe-agent");
    expect(spec?.detectCommand).toBe("mini-swe-agent");
    expect(spec?.installCommand).toContain("pip install --user mini-swe-agent");
  });

  it("getRuntimeCommandSpec honors an explicit command override", () => {
    const adapter = createServerAdapter();
    const spec = adapter.getRuntimeCommandSpec?.({ command: "/opt/venv/bin/mini-swe-agent" });
    expect(spec?.command).toBe("/opt/venv/bin/mini-swe-agent");
  });

  it("createMiniSweLocalServerAdapter alias points at createServerAdapter", async () => {
    const mod = await import("./index.js");
    expect(mod.createMiniSweLocalServerAdapter).toBe(createServerAdapter);
    expect(type).toBe("mini_swe_local");
  });
});

describe("buildInvocation", () => {
  const base = {
    runId: "run-abc123",
    workspaceCwd: "/tmp/paperclip-workspace",
    agentName: "swe-baseline-agent",
  };

  it("uses defaults when config is empty", () => {
    const inv = buildInvocation({
      ...base,
      config: {},
      context: { taskBody: "fix login button" },
    });
    expect(inv.command).toBe("mini-swe-agent");
    expect(inv.cwd).toBe("/tmp/paperclip-workspace");
    expect(inv.args).toEqual(["--task", "fix login button"]);
    expect(inv.timeoutSec).toBe(600);
    expect(inv.graceSec).toBe(5);
    expect(inv.env.PAPERCLIP_RUN_ID).toBe("run-abc123");
    expect(inv.env.PAPERCLIP_WORKSPACE_CWD).toBe("/tmp/paperclip-workspace");
  });

  it("injects --model when config.model is set", () => {
    const inv = buildInvocation({
      ...base,
      config: { model: "claude-sonnet-4-5" },
      context: { taskBody: "hi" },
    });
    expect(inv.args.slice(0, 4)).toEqual(["--model", "claude-sonnet-4-5", "--task", "hi"]);
  });

  it("renders promptTemplate with context vars", () => {
    const inv = buildInvocation({
      ...base,
      config: {
        promptTemplate: "Task {{taskId}}: {{taskTitle}}\n\n{{taskBody}}\n\n(agent: {{agentName}})",
      },
      context: {
        taskId: "T-42",
        taskTitle: "Login broken",
        taskBody: "clicking login does nothing",
      },
    });
    expect(inv.prompt).toBe(
      "Task T-42: Login broken\n\nclicking login does nothing\n\n(agent: swe-baseline-agent)",
    );
  });

  it("honors explicit cwd from config over workspaceCwd", () => {
    const inv = buildInvocation({
      ...base,
      config: { cwd: "/tmp/custom" },
      context: {},
    });
    expect(inv.cwd).toBe("/tmp/custom");
  });

  it("appends extraArgs after the built-in flags", () => {
    const inv = buildInvocation({
      ...base,
      config: { extraArgs: ["--max-iterations", "8", "--verbose"] },
      context: { taskBody: "task" },
    });
    expect(inv.args).toEqual(["--task", "task", "--max-iterations", "8", "--verbose"]);
  });

  it("merges config.env into process env (config wins)", () => {
    const inv = buildInvocation({
      ...base,
      config: { env: { ANTHROPIC_API_KEY: "sk-fake", MINI_SWE_MODE: "compact" } },
      context: {},
    });
    expect(inv.env.ANTHROPIC_API_KEY).toBe("sk-fake");
    expect(inv.env.MINI_SWE_MODE).toBe("compact");
  });

  it("clamps invalid timeoutSec back to the default", () => {
    const inv = buildInvocation({ ...base, config: { timeoutSec: -10 }, context: {} });
    expect(inv.timeoutSec).toBe(600);
  });
});

describe("execute · integration with a real subprocess", () => {
  it("runs a real /bin/echo fixture and reports exitCode=0 + streams stdout", async () => {
    const logs: string[] = [];
    const onLog = vi.fn(async (stream: "stdout" | "stderr", chunk: string) => {
      logs.push(`${stream}:${chunk.trim()}`);
    });
    // /bin/echo prints all args back — we exploit that to verify --task <prompt>
    // reaches the child process as we expect.
    const result = await execute({
      runId: "run-int-1",
      agent: { id: "a-1", name: "test", adapterType: "mini_swe_local" } as never,
      runtime: {} as never,
      config: { command: "/bin/echo" },
      context: { taskBody: "hello mini-swe" },
      onLog,
    } as never);

    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.sessionDisplayId).toMatch(/^mini-swe-run-int-1/);
    expect(result.provider).toBe("mini-swe-agent");
    expect(logs.some((l) => l.includes("--task"))).toBe(true);
    expect(logs.some((l) => l.includes("hello mini-swe"))).toBe(true);
  }, 5000);

  it("times out and reports timedOut=true when sleep exceeds timeoutSec", async () => {
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
    expect(result.exitCode === null || result.exitCode !== 0 || result.signal !== null).toBe(true);
  }, 10000);

  it("reports spawn_failed for a nonexistent command", async () => {
    const result = await runProcess({
      command: "/nonexistent/mini-swe-agent-xyz-does-not-exist",
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
