import { describe, expect, it, vi } from "vitest";
import { onWebhook, parseRequestBody } from "./worker.js";
import type { CodemodPluginCtx } from "./worker.js";

describe("parseRequestBody", () => {
  it("accepts a valid minimal body", () => {
    const parsed = parseRequestBody({ recipe: "rename.js", paths: ["src/a.js"] });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.recipe).toBe("rename.js");
      expect(parsed.value.paths).toEqual(["src/a.js"]);
    }
  });

  it("rejects non-object body", () => {
    expect(parseRequestBody(null).ok).toBe(false);
    expect(parseRequestBody("string").ok).toBe(false);
    expect(parseRequestBody([]).ok).toBe(false);
  });

  it("rejects empty recipe", () => {
    const parsed = parseRequestBody({ recipe: "  ", paths: ["a.js"] });
    expect(parsed.ok).toBe(false);
  });

  it("rejects missing/empty paths", () => {
    expect(parseRequestBody({ recipe: "r.js" }).ok).toBe(false);
    expect(parseRequestBody({ recipe: "r.js", paths: [] }).ok).toBe(false);
  });

  it("rejects non-string entries in paths", () => {
    const parsed = parseRequestBody({ recipe: "r.js", paths: ["ok.js", 42] });
    expect(parsed.ok).toBe(false);
  });

  it("rejects paths with shell metacharacters", () => {
    const parsed = parseRequestBody({
      recipe: "r.js",
      paths: ["ok.js", "bad.js; rm -rf /"],
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain("shell metacharacters");
  });

  it("preserves dryRun / extraArgs / command overrides", () => {
    const parsed = parseRequestBody({
      recipe: "r.js",
      paths: ["a.js"],
      dryRun: true,
      extraArgs: ["--parser", "tsx"],
      command: "/opt/bin/jscodeshift",
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.dryRun).toBe(true);
      expect(parsed.value.extraArgs).toEqual(["--parser", "tsx"]);
      expect(parsed.value.command).toBe("/opt/bin/jscodeshift");
    }
  });
});

describe("onWebhook", () => {
  const ctx: CodemodPluginCtx = {
    workspaceCwd: "/tmp/paperclip-workspace",
  };

  it("returns 404 for unknown endpointKey", async () => {
    const resp = await onWebhook({ endpointKey: "does-not-exist" }, ctx);
    expect(resp.status).toBe(404);
  });

  it("returns 405 when method is not POST", async () => {
    const resp = await onWebhook(
      { endpointKey: "apply", method: "GET", body: {} },
      ctx,
    );
    expect(resp.status).toBe(405);
  });

  it("returns 400 for invalid body", async () => {
    const resp = await onWebhook(
      { endpointKey: "apply", method: "POST", body: null },
      ctx,
    );
    expect(resp.status).toBe(400);
    expect((resp.body as { error: string })?.error).toBe("invalid_body");
  });

  it("calls logActivity on a valid request even if codemod fails", async () => {
    const logActivity = vi.fn(async () => {});
    // We use a nonexistent command so codemod fails cleanly with errorMessage
    const resp = await onWebhook(
      {
        endpointKey: "apply",
        method: "POST",
        body: {
          recipe: "r.js",
          paths: ["src/a.js"],
          command: "/nonexistent/jscodeshift-xyz",
        },
      },
      { ...ctx, logActivity },
    );
    expect(resp.status).toBe(200);
    expect(logActivity).toHaveBeenCalledOnce();
    const [action, details] = logActivity.mock.calls[0]!;
    expect(action).toBe("codemod_applied");
    expect((details as { recipe: string }).recipe).toBe("r.js");
    expect((details as { errorMessage: string | null }).errorMessage).toBeTruthy();
  });

  // Note: applyCodemod success-path integration is covered by
  // apply-codemod.test.ts (spawn + parseJscodeshiftOutput end-to-end).
  // worker.ts is covered by parseRequestBody + logActivity + status code tests
  // above. A full success-path integration through onWebhook would double up
  // on the same subprocess plumbing.
});
