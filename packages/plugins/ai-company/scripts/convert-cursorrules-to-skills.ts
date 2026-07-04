/**
 * awesome-cursorrules-zh (.mdc) → Anthropic SKILL.md converter.
 *
 * M2 W7-D5 · 手册 §W7.D5. Blocked on team cloning
 * https://github.com/LessUp/awesome-cursorrules-zh to
 * `paperclip/side-car/awesome-cursorrules-zh/` first.
 *
 * .mdc files are Cursor's project-rule format:
 *   ---
 *   description: <optional>
 *   globs: <optional glob patterns>
 *   alwaysApply: <bool>
 *   ---
 *   # Rule body (markdown)
 *
 * SKILL.md is Anthropic Skills format:
 *   ---
 *   name: <kebab-case slug>
 *   description: >
 *     <one-line summary, used to decide skill relevance>
 *   ---
 *   # <title>
 *   <body>
 *
 * The converter:
 *   1. Walks side-car/awesome-cursorrules-zh/**\/*.mdc (excluding node_modules, .git)
 *   2. Parses the front-matter
 *   3. Sanitizes: refuse to convert if body contains base64-looking blobs
 *      (>200 chars of urlsafe base64) OR embedded http(s):// URLs pointing at
 *      untrusted hosts. Emits an audit line for each rejection.
 *   4. Emits SKILL.md at
 *      side-car/awesome-cursorrules-zh-converted/<slug>/SKILL.md
 *   5. Writes an audit log to handoff/reports/w7-mdc-audit.log
 *
 * The converter does NOT install skills into paperclip — that's a separate
 * step via install-m2-w7-skills.ts (which reads the converted output).
 *
 * Usage:
 *   pnpm --filter @ai-company/paperclip-plugin-ai-company convert-cursorrules
 *
 * With a subset limit (recommended for MVP):
 *   pnpm --filter ... convert-cursorrules -- --limit 10
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

interface CliOptions {
  input: string;
  output: string;
  auditLog: string;
  limit?: number;
  dryRun: boolean;
}

interface ConversionOutcome {
  sourcePath: string;
  slug: string;
  outcome: "converted" | "rejected" | "skipped";
  reason?: string;
}

// ---------------------------------------------------------------------------
// Front-matter parsing
// ---------------------------------------------------------------------------

export interface McsFrontmatter {
  description?: string;
  globs?: string;
  alwaysApply?: boolean;
  extra: Record<string, string>;
}

export function parseFrontmatter(source: string): { frontmatter: McsFrontmatter; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(source);
  if (!match) {
    return { frontmatter: { extra: {} }, body: source };
  }
  const fmBlock = match[1] ?? "";
  const body = match[2] ?? "";
  const fm: McsFrontmatter = { extra: {} };

  for (const line of fmBlock.split(/\r?\n/)) {
    const m = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = (m[1] ?? "").trim();
    const value = (m[2] ?? "").trim();
    if (!key) continue;
    switch (key) {
      case "description":
        fm.description = value.replace(/^["']|["']$/g, "");
        break;
      case "globs":
        fm.globs = value;
        break;
      case "alwaysApply":
        fm.alwaysApply = value === "true" || value === "yes";
        break;
      default:
        fm.extra[key] = value;
    }
  }

  return { frontmatter: fm, body };
}

// ---------------------------------------------------------------------------
// Sanitize: reject rules with suspicious payloads
// ---------------------------------------------------------------------------

export function sanitize(
  body: string,
  trustedHostSuffixes: string[] = [
    "github.com",
    "githubusercontent.com",
    "anthropic.com",
    "npmjs.com",
    "mdn.io",
    "developer.mozilla.org",
  ],
): { ok: true } | { ok: false; reason: string } {
  // 1. Large base64-looking blobs
  const b64 = body.match(/[A-Za-z0-9+/=_-]{200,}/);
  if (b64) {
    return {
      ok: false,
      reason: `base64-looking blob detected (${b64[0].length} chars)`,
    };
  }

  // 2. URLs — reject any host NOT in trustedHostSuffixes
  const urlRe = /https?:\/\/([^\s\/'")]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(body)) !== null) {
    const host = (m[1] ?? "").toLowerCase();
    const trusted = trustedHostSuffixes.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
    if (!trusted) {
      return { ok: false, reason: `untrusted URL host: ${host}` };
    }
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Slug + SKILL.md renderer
// ---------------------------------------------------------------------------

export function slugFromPath(mdcPath: string, inputRoot: string): string {
  const rel = mdcPath.startsWith(inputRoot)
    ? mdcPath.slice(inputRoot.length).replace(/^[\/\\]+/, "")
    : mdcPath;
  return rel
    .replace(/\.mdc$/i, "")
    .replace(/[\/\\]+/g, "-")
    .replace(/[^A-Za-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "unnamed";
}

export function renderSkillMd(
  slug: string,
  frontmatter: McsFrontmatter,
  body: string,
): string {
  const description = frontmatter.description?.trim() ||
    "Converted from awesome-cursorrules-zh. Use when the referenced framework/tool is present in the workspace.";
  const title = titleFromBody(body) ?? slug;

  return `---
name: ${slug}
description: >
  ${escapeYamlBlockLine(description)}
---

# ${title}

${body.trim()}
`;
}

function titleFromBody(body: string): string | null {
  const m = /^#\s+(.+)$/m.exec(body);
  return m ? (m[1] ?? "").trim() : null;
}

function escapeYamlBlockLine(text: string): string {
  return text.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Walk directory for .mdc files
// ---------------------------------------------------------------------------

async function walkMdcFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  const skipDirs = new Set([
    "node_modules",
    ".git",
    ".vscode",
    ".cursor",
    "dist",
    "build",
  ]);

  async function walk(dir: string) {
    let entries: Awaited<ReturnType<typeof readdir>>;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name) || entry.name.startsWith(".")) continue;
        await walk(join(dir, entry.name));
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".mdc")) {
        found.push(join(dir, entry.name));
      }
    }
  }

  await walk(root);
  return found.sort();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function convertOne(
  mdcPath: string,
  opts: CliOptions,
): Promise<ConversionOutcome> {
  const source = await readFile(mdcPath, "utf-8");
  const { frontmatter, body } = parseFrontmatter(source);

  const sanitizeResult = sanitize(body);
  const slug = slugFromPath(mdcPath, opts.input);
  if (!sanitizeResult.ok) {
    return { sourcePath: mdcPath, slug, outcome: "rejected", reason: sanitizeResult.reason };
  }

  if (opts.dryRun) {
    return { sourcePath: mdcPath, slug, outcome: "skipped", reason: "dry-run" };
  }

  const skillMd = renderSkillMd(slug, frontmatter, body);
  const outDir = join(opts.output, slug);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "SKILL.md"), skillMd, "utf-8");
  return { sourcePath: mdcPath, slug, outcome: "converted" };
}

function parseCliArgs(argv: string[]): CliOptions {
  const cwd = process.cwd();
  const defaultInput = resolve(cwd, "../../../side-car/awesome-cursorrules-zh");
  const defaultOutput = resolve(cwd, "../../../side-car/awesome-cursorrules-zh-converted");
  const defaultAuditLog = resolve(cwd, "../../../../handoff/reports/w7-mdc-audit.log");

  const opts: CliOptions = {
    input: defaultInput,
    output: defaultOutput,
    auditLog: defaultAuditLog,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input") opts.input = resolve(argv[++i] ?? defaultInput);
    else if (a === "--output") opts.output = resolve(argv[++i] ?? defaultOutput);
    else if (a === "--audit-log") opts.auditLog = resolve(argv[++i] ?? defaultAuditLog);
    else if (a === "--limit") opts.limit = Number.parseInt(argv[++i] ?? "0", 10) || undefined;
    else if (a === "--dry-run") opts.dryRun = true;
  }
  return opts;
}

async function main() {
  const opts = parseCliArgs(process.argv.slice(2));

  console.log("=".repeat(72));
  console.log(`awesome-cursorrules-zh → SKILL.md`);
  console.log("=".repeat(72));
  console.log(`input:      ${opts.input}`);
  console.log(`output:     ${opts.output}`);
  console.log(`audit log:  ${opts.auditLog}`);
  console.log(`limit:      ${opts.limit ?? "(no limit)"}`);
  console.log(`dry run:    ${opts.dryRun}`);

  if (!existsSync(opts.input)) {
    console.error(`\n❌ input directory does not exist: ${opts.input}`);
    console.error(`   Team needs to run:`);
    console.error(`   git clone https://github.com/LessUp/awesome-cursorrules-zh ${opts.input}`);
    process.exit(2);
  }

  const files = await walkMdcFiles(opts.input);
  const scoped = opts.limit ? files.slice(0, opts.limit) : files;
  console.log(`found ${files.length} .mdc file(s); converting ${scoped.length}\n`);

  const outcomes: ConversionOutcome[] = [];
  for (const f of scoped) {
    outcomes.push(await convertOne(f, opts));
  }

  const converted = outcomes.filter((o) => o.outcome === "converted");
  const rejected = outcomes.filter((o) => o.outcome === "rejected");
  const skipped = outcomes.filter((o) => o.outcome === "skipped");

  console.log(`\n${"=".repeat(72)}`);
  console.log(`converted: ${converted.length}`);
  console.log(`rejected:  ${rejected.length}`);
  console.log(`skipped:   ${skipped.length}`);
  console.log("=".repeat(72));

  const auditLines = [
    `# .mdc → SKILL.md audit · ${new Date().toISOString()}`,
    `# input:  ${opts.input}`,
    `# output: ${opts.output}`,
    `# limit:  ${opts.limit ?? "(none)"}`,
    ``,
    ...outcomes.map(
      (o) => `${o.outcome.padEnd(9)} ${o.slug.padEnd(60)} ${o.reason ?? ""}`,
    ),
  ];

  await mkdir(resolve(opts.auditLog, ".."), { recursive: true });
  await writeFile(opts.auditLog, auditLines.join("\n") + "\n", "utf-8");
  console.log(`\naudit log written: ${opts.auditLog}`);

  if (rejected.length > 0) {
    console.log(`\n⚠ ${rejected.length} rejected — review audit log; do NOT install those`);
  }
  process.exit(0);
}

// Guard: only run main() when executed as a script, not when imported by tests.
const invokedDirectly =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  process.argv[1].endsWith("convert-cursorrules-to-skills.ts");

if (invokedDirectly) {
  main().catch((err) => {
    console.error("❌ FATAL:", err);
    process.exit(1);
  });
}
