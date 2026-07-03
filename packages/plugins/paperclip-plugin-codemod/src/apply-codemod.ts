import { spawn } from "node:child_process";
import type { ApplyCodemodRequest, ApplyCodemodResult } from "./manifest.js";

const DEFAULT_COMMAND = "jscodeshift";
const DEFAULT_TIMEOUT_SEC = 300;
const DEFAULT_GRACE_SEC = 5;

export interface ApplyCodemodOptions {
  cwd: string;
  timeoutSec?: number;
  graceSec?: number;
  onLog?: (stream: "stdout" | "stderr", chunk: string) => void;
}

/**
 * Apply a codemod recipe to the given paths by spawning jscodeshift.
 * Returns the parsed result including changed files and the diff.
 *
 * jscodeshift stdout format we care about:
 *   Results:
 *   0 errors
 *   0 unmodified
 *   3 skipped
 *   5 ok
 *
 * With --dry --print the diff appears interleaved. We collect stdout verbatim
 * and use jscodeshift's --print flag to include the resulting content, so the
 * caller can extract the diff by comparing to the original.
 */
export async function applyCodemod(
  req: ApplyCodemodRequest,
  opts: ApplyCodemodOptions,
): Promise<ApplyCodemodResult> {
  const command = req.command?.trim() || DEFAULT_COMMAND;
  const args = buildArgs(req);
  const timeoutSec = opts.timeoutSec ?? DEFAULT_TIMEOUT_SEC;
  const graceSec = opts.graceSec ?? DEFAULT_GRACE_SEC;

  return await new Promise<ApplyCodemodResult>((resolve) => {
    let settled = false;
    let timedOut = false;
    let stdoutBuf = "";
    let stderrBuf = "";

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command, args, {
        cwd: opts.cwd,
        env: process.env as Record<string, string>,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      resolve({
        changed: [],
        diff: "",
        exitCode: null,
        timedOut: false,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    const settle = (result: ApplyCodemodResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    child.on("error", (err) => {
      settle({
        changed: [],
        diff: "",
        exitCode: null,
        timedOut: false,
        errorMessage: err.message,
      });
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8");
      stdoutBuf += text;
      opts.onLog?.("stdout", text);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8");
      stderrBuf += text;
      opts.onLog?.("stderr", text);
    });

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
      }, graceSec * 1000).unref();
    }, timeoutSec * 1000);
    timer.unref();

    child.on("close", (exitCode) => {
      clearTimeout(timer);
      const parsed = parseJscodeshiftOutput(stdoutBuf);
      settle({
        changed: parsed.changed,
        diff: parsed.diff || stdoutBuf,
        exitCode: typeof exitCode === "number" ? exitCode : null,
        timedOut,
        errorMessage:
          exitCode !== 0 && stderrBuf.length > 0 ? stderrBuf.trim().slice(0, 4096) : null,
      });
    });
  });
}

/**
 * Build the jscodeshift CLI args from a request.
 * Exported for tests.
 */
export function buildArgs(req: ApplyCodemodRequest): string[] {
  const args: string[] = ["-t", req.recipe];
  if (req.dryRun) {
    args.push("--dry", "--print");
  }
  if (req.extraArgs) args.push(...req.extraArgs);
  args.push(...req.paths);
  return args;
}

/**
 * Parse jscodeshift's stdout to extract:
 * - `changed`: files jscodeshift reported as "ok" (transform ran successfully)
 * - `diff`: any unified-diff-looking blocks (when --print is used)
 *
 * jscodeshift emits per-file lines like:
 *   `OK path/to/file.js`
 *   `NOC path/to/file.js`  (no change)
 *   `ERR path/to/file.js`  (transform threw)
 *   `SKIP path/to/file.js`
 *
 * Exported for tests.
 */
export function parseJscodeshiftOutput(stdout: string): { changed: string[]; diff: string } {
  const changed: string[] = [];
  const diffLines: string[] = [];
  let inDiff = false;

  for (const line of stdout.split("\n")) {
    // Per-file status lines
    const statusMatch = /^(OK|NOC|ERR|SKIP)\s+(.+)$/.exec(line);
    if (statusMatch) {
      if (statusMatch[1] === "OK") {
        changed.push(statusMatch[2] ?? "");
      }
      continue;
    }

    // Unified-diff-looking lines
    if (line.startsWith("--- ") || line.startsWith("+++ ")) {
      inDiff = true;
      diffLines.push(line);
      continue;
    }
    if (inDiff) {
      if (
        line.startsWith("@@") ||
        line.startsWith("+") ||
        line.startsWith("-") ||
        line.startsWith(" ")
      ) {
        diffLines.push(line);
      } else if (line.length === 0) {
        diffLines.push(line);
      } else {
        // Reset when a non-diff line appears (e.g., "Results:" summary)
        inDiff = false;
      }
    }
  }

  return { changed, diff: diffLines.join("\n") };
}
