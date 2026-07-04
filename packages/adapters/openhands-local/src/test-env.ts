import { spawn } from "node:child_process";
import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";

const DEFAULT_COMMAND = "openhands";

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const command = readCommandFromConfig(ctx) ?? DEFAULT_COMMAND;
  const checks: AdapterEnvironmentCheck[] = [];

  checks.push(await runVersionProbe(command));
  checks.push(await runDockerProbe());

  return {
    adapterType: "openhands_local",
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}

function readCommandFromConfig(ctx: AdapterEnvironmentTestContext): string | null {
  const config = (ctx as unknown as { config?: Record<string, unknown> }).config;
  if (!config) return null;
  const value = config.command;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

async function runVersionProbe(command: string): Promise<AdapterEnvironmentCheck> {
  return await probeCli({
    command,
    args: ["--version"],
    code: "openhands_cli",
    installHint: "Run: pip install --user openhands-ai",
  });
}

async function runDockerProbe(): Promise<AdapterEnvironmentCheck> {
  return await probeCli({
    command: "docker",
    args: ["version", "--format", "{{.Server.Version}}"],
    code: "docker_runtime",
    installHint:
      "OpenHands requires Docker. Install Docker Desktop or Rancher Desktop and ensure the daemon is running.",
    successMessage: "Docker daemon reachable",
  });
}

interface ProbeInput {
  command: string;
  args: string[];
  code: string;
  installHint: string;
  successMessage?: string;
}

async function probeCli(input: ProbeInput): Promise<AdapterEnvironmentCheck> {
  return await new Promise<AdapterEnvironmentCheck>((resolve) => {
    let settled = false;
    let stdout = "";
    let stderr = "";

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(input.command, input.args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env as Record<string, string>,
      });
    } catch (err) {
      resolve({
        code: `${input.code}_missing`,
        level: "error",
        message: `${input.command} not launchable`,
        detail: err instanceof Error ? err.message : String(err),
        hint: input.installHint,
      });
      return;
    }

    const settle = (check: AdapterEnvironmentCheck) => {
      if (settled) return;
      settled = true;
      resolve(check);
    };

    child.stdout?.on("data", (c: Buffer) => {
      stdout += c.toString("utf-8");
    });
    child.stderr?.on("data", (c: Buffer) => {
      stderr += c.toString("utf-8");
    });

    child.on("error", (err) => {
      settle({
        code: `${input.code}_missing`,
        level: "error",
        message: `${input.command} not found on PATH`,
        detail: err.message,
        hint: input.installHint,
      });
    });

    child.on("close", (exitCode) => {
      if (exitCode === 0) {
        const line = stdout.trim().split("\n")[0] ?? "unknown";
        settle({
          code: `${input.code}_ok`,
          level: "info",
          message: input.successMessage ?? `${input.command} detected: ${line}`,
          detail: stdout.trim() || stderr.trim() || null,
        });
      } else {
        settle({
          code: `${input.code}_probe_failed`,
          level: "error",
          message: `${input.command} ${input.args.join(" ")} exited ${exitCode}`,
          detail: (stderr + stdout).trim() || null,
          hint: input.installHint,
        });
      }
    });

    setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      settle({
        code: `${input.code}_probe_timeout`,
        level: "error",
        message: `${input.command} ${input.args.join(" ")} timed out after 5s`,
        hint: input.installHint,
      });
    }, 5000).unref();
  });
}

function summarizeStatus(
  checks: AdapterEnvironmentCheck[],
): AdapterEnvironmentTestResult["status"] {
  if (checks.some((c) => c.level === "error")) return "fail";
  if (checks.some((c) => c.level === "warn")) return "warn";
  return "pass";
}
