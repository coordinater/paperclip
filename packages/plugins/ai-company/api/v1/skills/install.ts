/**
 * POST /api/ai-company/v1/skills/install
 *
 * Route prefix locked to `/api/ai-company/*` per handoff/06 §2.2 (API 层缓冲).
 * v1 是稳定契约：加字段允许，改字段 / 删字段禁止（handoff/06 §2.2 versioning）。
 *
 * W3 实装：从 SKILL.md 源（本地或 URL）→ 创建 approval（D18=5/4 auto-approve）
 * → 落 company_skills → 写 activity_log。D18=3 pending 等 board；D18=1 拒。
 * 参考契约：handoff/06 §3.2 install_skill approval 强制门禁 + Snyk 隔离矩阵。
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { activityLog, approvals, companySkills } from "@paperclipai/db";
import type { Db } from "@paperclipai/db";

import type {
  D18Score,
  InstallSkillRequest,
  InstallSkillResponse,
} from "./types.js";

/**
 * Handler execution context——由调用方（HTTP route / plugin action / 测试脚本）
 * 注入 db 连接 + 谁在触发（audit 目的）+ 目标 company。
 *
 * 分离 handler input 和 context 让契约（InstallSkillRequest）保持稳定，
 * 而不同调用方（route / plugin action / CLI）可各自注入执行环境。
 */
export interface InstallSkillHandlerContext {
  db: Db;
  companyId: string;
  actorType: "system" | "user" | "agent";
  actorId: string;
}

/**
 * Handles skill install workflow with D18 supply-chain gate.
 *
 * Contract (frozen at v1)：
 * - Request body: {@link InstallSkillRequest}
 * - Response: `202 Accepted` + {@link InstallSkillResponse}（所有档 approval 必写）
 *
 * D18 处置矩阵（handoff/06 §3.2）：
 * - D18=5 (Anthropic)  → auto-approve + install + 免沙箱
 * - D18=4 (头部社区)   → auto-approve + install + 免沙箱（轻审可延后补）
 * - D18=3 (中活跃)    → pending，等 board；install 时首次 execute 走 sandbox
 * - D18=2 (小名气)    → pending，等 board 深审；每次 execute 走 sandbox
 * - D18=1 (匿名)      → 拒装，返 403，写 skill_install_denied activity_log
 */
export async function installSkillHandler(
  ctx: InstallSkillHandlerContext,
  request: InstallSkillRequest,
): Promise<InstallSkillResponse> {
  validateRequest(request);

  const markdown = await fetchSkillMarkdown(request.sourceUrl);
  const computedSha256 = createHash("sha256").update(markdown).digest("hex");
  if (request.sha256 && request.sha256 !== computedSha256) {
    throw new Error(
      `sha256 mismatch: expected ${request.sha256}, computed ${computedSha256}`,
    );
  }
  const sha256 = computedSha256;

  const frontMatter = parseSkillFrontMatter(markdown, request.sourceUrl);
  const sandboxRequired = decideSandboxRequired(request.d18Score);
  const autoApprove = shouldAutoApprove(request.d18Score);

  const now = new Date();

  const [approval] = await ctx.db
    .insert(approvals)
    .values({
      companyId: ctx.companyId,
      type: "install_skill",
      requestedByUserId: ctx.actorId,
      status: autoApprove ? "approved" : "pending",
      payload: {
        sourceUrl: request.sourceUrl,
        d18Score: request.d18Score,
        d18Justification: request.d18Justification,
        sha256,
        scope: request.scope,
        supplyChainTrust: request.supplyChainTrust,
        skillName: frontMatter.name,
        skillKey: frontMatter.key,
        sandboxRequired,
        autoApprovePolicy: autoApprove
          ? `D18=${request.d18Score} auto-approved per handoff/06 §3.2`
          : undefined,
      },
      decisionNote: autoApprove
        ? `Auto-approved: D18=${request.d18Score} (${describeD18(request.d18Score)})`
        : null,
      decidedByUserId: autoApprove ? "system:auto-approver" : null,
      decidedAt: autoApprove ? now : null,
    })
    .returning();

  if (!approval) {
    throw new Error("Failed to create approval record");
  }

  if (autoApprove) {
    await ctx.db.insert(companySkills).values({
      companyId: ctx.companyId,
      key: frontMatter.key,
      slug: frontMatter.slug,
      name: frontMatter.name,
      description: frontMatter.description,
      markdown,
      sourceType: "local_path",
      sourceLocator: request.sourceUrl,
      sourceRef: sha256,
      supplyChainTrust: request.supplyChainTrust,
      metadata: {
        installedViaApprovalId: approval.id,
        d18Score: request.d18Score,
      },
    });
  }

  await ctx.db.insert(activityLog).values({
    companyId: ctx.companyId,
    actorType: ctx.actorType,
    actorId: ctx.actorId,
    action: autoApprove ? "skill_installed" : "skill_install_requested",
    entityType: "company_skill",
    entityId: approval.id,
    details: {
      skillKey: frontMatter.key,
      skillName: frontMatter.name,
      approvalId: approval.id,
      d18Score: request.d18Score,
      supplyChainTrust: request.supplyChainTrust,
      sha256,
      sandboxRequired,
      autoApproved: autoApprove,
      sourceUrl: request.sourceUrl,
    },
  });

  return { approvalId: approval.id, sandboxRequired };
}

// ---------------------------------------------------------------------------

function validateRequest(request: InstallSkillRequest): void {
  if (request.d18Justification.length < 50) {
    throw new Error(
      `d18_justification must be ≥ 50 chars (got ${request.d18Justification.length}) per handoff/06 §3.2`,
    );
  }
  if (request.d18Score === 1) {
    throw new Error(
      "D18=1 skill 装配禁止（handoff/06 §3.1 匿名/不可追溯 = 直接拒）",
    );
  }
}

function decideSandboxRequired(d18Score: D18Score): boolean {
  // handoff/06 §3.2 Snyk 隔离矩阵：D18 ≤ 3 需沙箱
  return d18Score <= 3;
}

function shouldAutoApprove(d18Score: D18Score): boolean {
  // D18 4/5 auto-approve；3/2 走 board 人审
  return d18Score >= 4;
}

function describeD18(d18Score: D18Score): string {
  switch (d18Score) {
    case 5: return "Anthropic 官方";
    case 4: return "头部社区/大厂官方";
    case 3: return "中活跃社区";
    case 2: return "小名气但可追溯";
    case 1: return "匿名/不可追溯";
  }
}

async function fetchSkillMarkdown(source: string): Promise<string> {
  const isLocalPath =
    source.startsWith("/") ||
    source.startsWith("./") ||
    source.startsWith("side-car/");
  if (isLocalPath) {
    return readFile(source, "utf-8");
  }
  const res = await fetch(source);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${source}: HTTP ${res.status}`);
  }
  return res.text();
}

interface SkillFrontMatter {
  name: string;
  slug: string;
  description: string;
  key: string;
}

function parseSkillFrontMatter(
  markdown: string,
  sourceUrl: string,
): SkillFrontMatter {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const fallbackName =
    sourceUrl.split("/").filter(Boolean).slice(-2, -1)[0] ??
    sourceUrl.split("/").filter(Boolean).pop() ??
    "unknown-skill";

  if (!match) {
    return {
      name: fallbackName,
      slug: toSlug(fallbackName),
      description: "(no front matter)",
      key: `ai-company/vendored/${toSlug(fallbackName)}`,
    };
  }

  const yaml = match[1] ?? "";
  const name = yamlField(yaml, "name") ?? fallbackName;
  const description = yamlField(yaml, "description") ?? "(no description)";
  const key = yamlField(yaml, "key") ?? `ai-company/vendored/${toSlug(name)}`;

  return { name, slug: toSlug(name), description, key };
}

function yamlField(yaml: string, field: string): string | undefined {
  const regex = new RegExp(`^${field}:\\s*(.+?)\\s*$`, "m");
  const match = yaml.match(regex);
  if (!match) return undefined;
  // strip surrounding quotes if present
  return match[1]?.replace(/^["'](.*)["']$/, "$1");
}

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-_ ]+/g, "")
    .trim()
    .replace(/\s+/g, "-");
}
