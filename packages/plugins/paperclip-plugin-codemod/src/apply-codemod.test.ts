import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { applyCodemod, buildArgs, parseJscodeshiftOutput } from "./apply-codemod.js";

// ---------------------------------------------------------------------------
// Fixture shell scripts that pretend to be jscodeshift for integration tests.
// We can't just do `/bin/sh -c ...` because buildArgs prepends `-t <recipe>`
// which sh would interpret as its own flag. Fixture scripts ignore all args.
// ---------------------------------------------------------------------------

let FAKE_JSCODESHIFT_OK: string;
let FAKE_JSCODESHIFT_SLOW: string;

beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), "codemod-test-"));

  FAKE_JSCODESHIFT_OK = join(dir, "fake-jscodeshift-ok.sh");
  writeFileSync(
    FAKE_JSCODESHIFT_OK,
    `#!/bin/sh
# Ignore all args (jscodeshift receives -t <recipe> <paths> — we don't care)
cat <<'EOF'
OK src/a.js
NOC src/b.js
Results:
1 ok
1 unmodified
EOF
exit 0
`,
  );
  chmodSync(FAKE_JSCODESHIFT_OK, 0o755);

  FAKE_JSCODESHIFT_SLOW = join(dir, "fake-jscodeshift-slow.sh");
  writeFileSync(
    FAKE_JSCODESHIFT_SLOW,
    `#!/bin/sh
sleep 5
`,
  );
  chmodSync(FAKE_JSCODESHIFT_SLOW, 0o755);
});

describe("buildArgs", () => {
  it("builds a canonical `-t <recipe> <paths>` command", () => {
    const args = buildArgs({
      recipe: "transforms/rename.js",
      paths: ["src/foo.js", "src/bar.js"],
    });
    expect(args).toEqual(["-t", "transforms/rename.js", "src/foo.js", "src/bar.js"]);
  });

  it("appends --dry --print when dryRun is true", () => {
    const args = buildArgs({
      recipe: "t.js",
      paths: ["a.js"],
      dryRun: true,
    });
    expect(args).toContain("--dry");
    expect(args).toContain("--print");
  });

  it("appends extraArgs between flags and paths", () => {
    const args = buildArgs({
      recipe: "t.js",
      paths: ["a.js"],
      extraArgs: ["--extensions", "ts,tsx"],
    });
    // Expected: -t t.js --extensions ts,tsx a.js
    expect(args).toEqual(["-t", "t.js", "--extensions", "ts,tsx", "a.js"]);
  });

  it("preserves both dryRun and extraArgs together", () => {
    const args = buildArgs({
      recipe: "t.js",
      paths: ["a.js"],
      dryRun: true,
      extraArgs: ["--parser", "tsx"],
    });
    expect(args).toEqual(["-t", "t.js", "--dry", "--print", "--parser", "tsx", "a.js"]);
  });
});

describe("parseJscodeshiftOutput", () => {
  it("extracts OK-status changed files", () => {
    const out = [
      "Processing 3 files...",
      "Spawning 2 workers...",
      "OK src/foo.js",
      "NOC src/bar.js",
      "OK src/baz.js",
      "Results:",
      "0 errors",
      "1 unmodified",
      "0 skipped",
      "2 ok",
    ].join("\n");

    const { changed } = parseJscodeshiftOutput(out);
    expect(changed).toEqual(["src/foo.js", "src/baz.js"]);
  });

  it("captures unified-diff blocks when --print emits them", () => {
    const out = [
      "OK src/a.js",
      "--- src/a.js",
      "+++ src/a.js",
      "@@ -1,3 +1,3 @@",
      " unchanged",
      "-old",
      "+new",
      " unchanged",
      "Results:",
      "1 ok",
    ].join("\n");

    const { diff } = parseJscodeshiftOutput(out);
    expect(diff).toContain("--- src/a.js");
    expect(diff).toContain("+++ src/a.js");
    expect(diff).toContain("-old");
    expect(diff).toContain("+new");
    // "Results:" summary must NOT leak into diff
    expect(diff).not.toContain("Results:");
  });

  it("returns empty when no OK-status lines present", () => {
    const out = ["Processing 1 files...", "NOC src/a.js", "Results:", "0 ok"].join("\n");
    const { changed, diff } = parseJscodeshiftOutput(out);
    expect(changed).toEqual([]);
    expect(diff).toBe("");
  });

  it("ignores ERR and SKIP status lines", () => {
    const out = ["ERR src/broken.js", "SKIP src/skipped.js", "OK src/good.js"].join("\n");
    const { changed } = parseJscodeshiftOutput(out);
    expect(changed).toEqual(["src/good.js"]);
  });
});

describe("applyCodemod · integration (using /bin/sh to mock jscodeshift)", () => {
  it("returns exitCode=0 with changed files when the mock command succeeds", async () => {
    const logs: string[] = [];
    const onLog = vi.fn((_stream: "stdout" | "stderr", chunk: string) => {
      logs.push(chunk);
    });

    const result = await applyCodemod(
      {
        recipe: "unused-in-mock.js",
        paths: ["src/a.js", "src/b.js"],
        command: FAKE_JSCODESHIFT_OK,
      },
      { cwd: "/tmp", onLog },
    );

    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.changed).toEqual(["src/a.js"]);
    expect(result.errorMessage).toBeNull();
  }, 5000);

  it("reports timedOut=true when the process exceeds timeoutSec", async () => {
    const result = await applyCodemod(
      {
        recipe: "unused.js",
        paths: ["a.js"],
        command: FAKE_JSCODESHIFT_SLOW,
      },
      { cwd: "/tmp", timeoutSec: 0.2, graceSec: 0.1 },
    );
    expect(result.timedOut).toBe(true);
  }, 10000);

  it("returns errorMessage for a nonexistent command", async () => {
    const result = await applyCodemod(
      {
        recipe: "unused.js",
        paths: ["a.js"],
        command: "/nonexistent/jscodeshift-xyz",
      },
      { cwd: "/tmp" },
    );
    expect(result.exitCode).toBe(null);
    expect(result.errorMessage).toBeTruthy();
  }, 5000);
});
