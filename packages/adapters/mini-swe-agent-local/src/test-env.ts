import { spawn } from "node:child_process";
import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";

const DEFAULT_COMMAND = "mini-swe-agent";

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const command = readCommandFromConfig(ctx) ?? DEFAULT_COMMAND;
  const checks: AdapterEnvironmentCheck[] = [];

  const versionCheck = await runVersionProbe(command);
  checks.push(versionCheck);

  return {
    adapterType: "mini_swe_local",
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
  return await new Promise<AdapterEnvironmentCheck>((resolve) => {
    let settled = false;
    let stdout = "";
    let stderr = "";

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command, ["--version"], {
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env as Record<string, string>,
      });
    } catch (err) {
      resolve({
        code: "cli_missing",
        level: "error",
        message: `${command} not launchable`,
        detail: err instanceof Error ? err.message : String(err),
        hint: "Run: pip install --user mini-swe-agent",
      });
      return;
    }

    const settle = (check: AdapterEnvironmentCheck) => {
      if (settled) return;
      settled = true;
      resolve(check);
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });

    child.on("error", (err) => {
      settle({
        code: "cli_missing",
        level: "error",
        message: `${command} not found on PATH`,
        detail: err.message,
        hint: "Run: pip install --user mini-swe-agent",
      });
    });

    child.on("close", (exitCode) => {
      if (exitCode === 0) {
        const versionLine = stdout.trim().split("\n")[0] ?? "unknown";
        settle({
          code: "cli_version",
          level: "info",
          message: `mini-swe-agent detected: ${versionLine}`,
          detail: stdout.trim() || stderr.trim() || null,
        });
      } else {
        settle({
          code: "cli_probe_failed",
          level: "error",
          message: `${command} --version exited ${exitCode}`,
          detail: (stderr + stdout).trim() || null,
          hint: "Reinstall mini-swe-agent; verify Python 3.11+ in PATH",
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
        code: "cli_probe_timeout",
        level: "error",
        message: `${command} --version timed out after 5s`,
        hint: "CLI may be hung on config init; check ~/.mini-swe-agent/",
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
