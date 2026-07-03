import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
} from "@paperclipai/adapter-utils";

const DEFAULT_COMMAND = "mini-swe-agent";
const DEFAULT_TIMEOUT_SEC = 600;
const DEFAULT_GRACE_SEC = 5;

export interface BuildInvocationInput {
  config: Record<string, unknown>;
  context: Record<string, unknown>;
  agentName?: string;
  runId: string;
  workspaceCwd?: string;
  extraEnv?: Record<string, string>;
}

export interface BuildInvocationResult {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  prompt: string;
  timeoutSec: number;
  graceSec: number;
}

/**
 * Build the mini-swe-agent invocation from Paperclip execution context + adapter config.
 *
 * Exported for tests; the shape is stable so callers can assert against it.
 */
export function buildInvocation(input: BuildInvocationInput): BuildInvocationResult {
  const { config, context, agentName, runId, workspaceCwd, extraEnv } = input;

  const command = readNonEmptyString(config.command) ?? DEFAULT_COMMAND;
  const model = readNonEmptyString(config.model);
  const cwd = readNonEmptyString(config.cwd) ?? workspaceCwd ?? process.cwd();

  const prompt = renderPrompt(config, context, agentName);
  const configExtraArgs = readStringArray(config.extraArgs);

  const args: string[] = [];
  if (model) {
    args.push("--model", model);
  }
  args.push("--task", prompt);
  if (configExtraArgs) args.push(...configExtraArgs);

  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === "string") env[k] = v;
  }
  const configEnv = readEnvRecord(config.env);
  if (configEnv) for (const [k, v] of Object.entries(configEnv)) env[k] = v;
  if (extraEnv) for (const [k, v] of Object.entries(extraEnv)) env[k] = v;
  env.PAPERCLIP_RUN_ID = runId;
  if (workspaceCwd) env.PAPERCLIP_WORKSPACE_CWD = workspaceCwd;

  const timeoutSec = readPositiveNumber(config.timeoutSec) ?? DEFAULT_TIMEOUT_SEC;
  const graceSec = readPositiveNumber(config.graceSec) ?? DEFAULT_GRACE_SEC;

  return { command, args, cwd, env, prompt, timeoutSec, graceSec };
}

export async function execute(input: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const workspaceCwd = readNonEmptyString(input.context.workspaceCwd)
    ?? readNonEmptyString(input.context.cwd)
    ?? undefined;

  const invocation = buildInvocation({
    config: input.config,
    context: input.context,
    agentName: input.agent?.name,
    runId: input.runId,
    workspaceCwd,
  });

  const sessionId = `mini-swe-${input.runId}-${randomUUID().slice(0, 8)}`;

  await input.onMeta?.({
    adapterType: "mini_swe_local",
    command: invocation.command,
    commandArgs: invocation.args,
    cwd: invocation.cwd,
    env: filterSafeEnvForLogs(invocation.env),
    prompt: invocation.prompt,
    context: { sessionId },
  });

  const runResult = await runProcess({
    command: invocation.command,
    args: invocation.args,
    cwd: invocation.cwd,
    env: invocation.env,
    timeoutSec: invocation.timeoutSec,
    graceSec: invocation.graceSec,
    onLog: input.onLog,
    onSpawn: input.onSpawn,
  });

  return {
    exitCode: runResult.exitCode,
    signal: runResult.signal,
    timedOut: runResult.timedOut,
    errorMessage: runResult.errorMessage ?? null,
    errorCode: runResult.errorCode ?? null,
    sessionParams: { sessionId },
    sessionDisplayId: sessionId,
    provider: "mini-swe-agent",
    biller: null,
    model: readNonEmptyString(input.config.model) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Process runner
// ---------------------------------------------------------------------------

interface RunProcessInput {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  timeoutSec: number;
  graceSec: number;
  onLog: (stream: "stdout" | "stderr", chunk: string) => Promise<void>;
  onSpawn?: (meta: { pid: number; processGroupId: number | null; startedAt: string }) => Promise<void>;
}

interface RunProcessResult {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  errorMessage?: string;
  errorCode?: string;
}

export async function runProcess(input: RunProcessInput): Promise<RunProcessResult> {
  return await new Promise<RunProcessResult>((resolve) => {
    let settled = false;
    let timedOut = false;
    const startedAt = new Date().toISOString();

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(input.command, input.args, {
        cwd: input.cwd,
        env: input.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      resolve({
        exitCode: null,
        signal: null,
        timedOut: false,
        errorMessage: err instanceof Error ? err.message : String(err),
        errorCode: "spawn_failed",
      });
      return;
    }

    const settle = (result: RunProcessResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    child.on("error", (err) => {
      settle({
        exitCode: null,
        signal: null,
        timedOut: false,
        errorMessage: err.message,
        errorCode: "child_error",
      });
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      void input.onLog("stdout", chunk.toString("utf-8"));
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      void input.onLog("stderr", chunk.toString("utf-8"));
    });

    if (child.pid && input.onSpawn) {
      void input.onSpawn({
        pid: child.pid,
        processGroupId: null,
        startedAt,
      });
    }

    const timeoutMs = input.timeoutSec * 1000;
    const graceMs = input.graceSec * 1000;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }, graceMs).unref();
    }, timeoutMs);
    timer.unref();

    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      settle({
        exitCode: typeof exitCode === "number" ? exitCode : null,
        signal: typeof signal === "string" ? signal : null,
        timedOut,
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Prompt / config helpers
// ---------------------------------------------------------------------------

const DEFAULT_PROMPT_TEMPLATE = "{{taskBody}}";

function renderPrompt(
  config: Record<string, unknown>,
  context: Record<string, unknown>,
  agentName: string | undefined,
): string {
  const template = readNonEmptyString(config.promptTemplate) ?? DEFAULT_PROMPT_TEMPLATE;
  const vars: Record<string, string> = {
    agentName: agentName ?? "mini-swe-agent",
    taskId: readNonEmptyString(context.taskId) ?? "",
    taskTitle: readNonEmptyString(context.taskTitle) ?? "",
    taskBody: readNonEmptyString(context.taskBody) ?? readNonEmptyString(context.prompt) ?? "",
    runId: readNonEmptyString(context.runId) ?? "",
  };
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readPositiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && entry.length > 0) out.push(entry);
  }
  return out.length > 0 ? out : null;
}

function readEnvRecord(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

const SECRET_ENV_PATTERN = /(TOKEN|KEY|SECRET|PASSWORD|COOKIE|AUTH|CREDENTIAL)/i;

function filterSafeEnvForLogs(env: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (SECRET_ENV_PATTERN.test(k)) {
      out[k] = "[redacted]";
    } else if (k.startsWith("PAPERCLIP_")) {
      out[k] = v;
    }
  }
  return out;
}
