/**
 * Codemod plugin worker.
 *
 * M2 W6-D3 · JS/TS 栈选择路径。手册 §W6.D3.
 *
 * 单一 webhook endpoint `apply`：POST body 是 `ApplyCodemodRequest`。
 * 走 SDK `onWebhook(input)` → `switch (input.endpointKey)` 分发（per errata E-4:
 * SDK 无 `ctx.http.register`，inbound webhook 走 manifest 声明 + endpointKey）。
 */

import { applyCodemod } from "./apply-codemod.js";
import type { ApplyCodemodRequest, ApplyCodemodResult } from "./manifest.js";
export { default as manifest } from "./manifest.js";

/** Shape of what onWebhook receives from the SDK (a subset — enough for our purpose). */
export interface WebhookInput {
  endpointKey: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

/** Shape of what onWebhook returns. */
export interface WebhookResponse {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

/** Adapter-agnostic minimal context shape our handler needs. */
export interface CodemodPluginCtx {
  workspaceCwd: string;
  onLog?: (stream: "stdout" | "stderr", chunk: string) => void;
  logActivity?: (action: string, details: Record<string, unknown>) => Promise<void>;
}

/**
 * Handle an inbound webhook. Only `endpointKey === "apply"` is supported.
 * Rejects everything else with 404 (matches SDK convention per errata E-4).
 */
export async function onWebhook(
  input: WebhookInput,
  ctx: CodemodPluginCtx,
): Promise<WebhookResponse> {
  if (input.endpointKey !== "apply") {
    return { status: 404, body: { error: "unknown_endpoint", endpointKey: input.endpointKey } };
  }
  if (input.method && input.method.toUpperCase() !== "POST") {
    return { status: 405, body: { error: "method_not_allowed", allowed: ["POST"] } };
  }

  const parsed = parseRequestBody(input.body);
  if (!parsed.ok) {
    return { status: 400, body: { error: "invalid_body", detail: parsed.error } };
  }

  const req = parsed.value;
  const result = await applyCodemod(req, {
    cwd: ctx.workspaceCwd,
    onLog: ctx.onLog,
  });

  await ctx.logActivity?.("codemod_applied", {
    recipe: req.recipe,
    paths: req.paths,
    dryRun: req.dryRun ?? false,
    changed: result.changed,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    errorMessage: result.errorMessage,
  });

  return { status: 200, body: shapeResponse(result) };
}

// ---------------------------------------------------------------------------
// Request body validation
// ---------------------------------------------------------------------------

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseRequestBody(raw: unknown): ParseResult<ApplyCodemodRequest> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const obj = raw as Record<string, unknown>;
  const recipe = typeof obj.recipe === "string" ? obj.recipe.trim() : "";
  if (!recipe) return { ok: false, error: "recipe must be a non-empty string" };

  const pathsRaw = obj.paths;
  if (!Array.isArray(pathsRaw) || pathsRaw.length === 0) {
    return { ok: false, error: "paths must be a non-empty string array" };
  }
  const paths: string[] = [];
  for (const p of pathsRaw) {
    if (typeof p !== "string" || p.length === 0) {
      return { ok: false, error: `paths[] contains a non-string or empty entry` };
    }
    // Reject absolute path escapes (server-side we scope to workspaceCwd);
    // let the SDK / plugin host decide relative-vs-absolute policy but reject
    // shell-metacharacters that could break the spawn contract.
    if (/[`$;|&<>]/.test(p)) {
      return { ok: false, error: `paths[] entry contains shell metacharacters: ${p}` };
    }
    paths.push(p);
  }

  const dryRun = typeof obj.dryRun === "boolean" ? obj.dryRun : undefined;

  const extraArgsRaw = obj.extraArgs;
  let extraArgs: string[] | undefined;
  if (Array.isArray(extraArgsRaw)) {
    extraArgs = [];
    for (const a of extraArgsRaw) {
      if (typeof a !== "string") {
        return { ok: false, error: "extraArgs[] contains a non-string entry" };
      }
      extraArgs.push(a);
    }
  }

  const command = typeof obj.command === "string" && obj.command.trim().length > 0
    ? obj.command.trim()
    : undefined;

  return { ok: true, value: { recipe, paths, dryRun, extraArgs, command } };
}

function shapeResponse(result: ApplyCodemodResult): {
  changed: string[];
  diff: string;
  exitCode: number | null;
  timedOut: boolean;
  errorMessage: string | null;
} {
  return {
    changed: result.changed,
    diff: result.diff,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    errorMessage: result.errorMessage,
  };
}

// Default export lets the plugin loader pick up a canonical worker.
export default { onWebhook };
