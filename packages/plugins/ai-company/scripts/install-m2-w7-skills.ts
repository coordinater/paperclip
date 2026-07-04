/**
 * Install M2 W7 skills · appends to ai-company-m1 test company (no wipe).
 *
 * 装 W7 波：
 *   W7-D4 Logic-Lens 6 sub-skill · rohitg00/Logic-Lens
 *          BLOCKED on team Snyk audit · 结果填在 handoff/reports/logic-lens-decision.md
 *          Snyk ≤ medium → 走本 script（A 分支）· Snyk ≥ high → 走占位符（B 分支）
 *   W7-D5 cursorrules-zh 转装 sub-skill(s) · 走 handbook 首装 5-10 个头部 rule
 *          前置：team clone LessUp/awesome-cursorrules-zh 到 side-car/ + AI 跑
 *          convert-cursorrules-to-skills.ts 转成 SKILL.md
 *
 * 与 install-m1-skills / install-m2-w5-skills / install-m2-w6-skills 同源 · append 语义.
 *
 * 跑法：
 *   DATABASE_URL="postgres://paperclip:paperclip@localhost:5432/paperclip" \
 *     pnpm --filter @ai-company/paperclip-plugin-ai-company install-m2-w7-skills
 *
 * 当前 M2_W7_SKILLS 是空数组 —— team 补 Snyk audit + 上游 clone 后才能填。
 * 本 script 兼跑（skip 空 array · 打印 blocker 提示）以维持批次接口一致。
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { and, eq } from "drizzle-orm";
import {
  activityLog,
  approvals,
  companies,
  companySkills,
  createDb,
} from "@paperclipai/db";

import { installSkillHandler } from "../api/v1/skills/install.js";
import type { D18Score, SupplyChainTrust } from "../api/v1/skills/types.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://paperclip:paperclip@localhost:5432/paperclip";

const SIDECAR_ROOT = resolve(process.cwd(), "../../../side-car");
const CURSORRULES_CONVERTED = `${SIDECAR_ROOT}/awesome-cursorrules-zh-converted`;
const LOGIC_LENS_SUBSKILLS_ROOT = `${SIDECAR_ROOT}/Logic-Lens`;

interface SkillManifest {
  wave: string;
  sourcePath: string;
  d18Score: D18Score;
  supplyChainTrust: SupplyChainTrust;
  justification: string;
}

/**
 * M2 W7 skills. Populated in two stages:
 *   1. team runs Snyk audit + cursorrules converter first
 *   2. AI edits this array with concrete sub-skill paths per stage 1 output
 *
 * Empty by design in first commit — this script is the "hot spot" that
 * gets filled per unblock signal (see triggers in session-handoff).
 */
const M2_W7_SKILLS: SkillManifest[] = [
  // ==========================================================================
  // W7-D4 Logic-Lens sub-skills (fill after Snyk audit ≤ medium):
  // {
  //   wave: "W7-D4",
  //   sourcePath: `${LOGIC_LENS_SUBSKILLS_ROOT}/skills/<sub-skill-1>.md`,
  //   d18Score: 3, // rohitg00 is 中活跃 solo dev 需 audit gate
  //   supplyChainTrust: "community",
  //   justification: "Logic-Lens rohitg00/<sub-skill-1> · Snyk audit passed <日期> · sandbox required.",
  // },
  // ...
  //
  // ==========================================================================
  // W7-D5 cursorrules-zh converted sub-skills (fill after convert-cursorrules
  // script runs · take the first 5-10 slugs from the converted output):
  // {
  //   wave: "W7-D5",
  //   sourcePath: `${CURSORRULES_CONVERTED}/<slug>/SKILL.md`,
  //   d18Score: 3,
  //   supplyChainTrust: "community",
  //   justification: "awesome-cursorrules-zh converted · slug=<slug> · sanitize passed",
  // },
];

async function main() {
  console.log("=".repeat(72));
  console.log(`M2 W7 skills install (${M2_W7_SKILLS.length} 个 · marketing scale 波 · append 模式)`);
  console.log("=".repeat(72));

  if (M2_W7_SKILLS.length === 0) {
    console.log("");
    console.log("⏸ BLOCKED — M2_W7_SKILLS array is empty. Prerequisites:");
    console.log("");
    console.log("  W7-D4 Logic-Lens:");
    console.log(`    - Team runs: npx snyk test github.com/rohitg00/Logic-Lens`);
    console.log(`    - If ≤ medium: clone Logic-Lens repo to ${LOGIC_LENS_SUBSKILLS_ROOT}`);
    console.log(`    - Then fill W7-D4 entries in M2_W7_SKILLS[] with sub-skill paths`);
    console.log(`    - Reference: handoff/reports/logic-lens-decision.md`);
    console.log("");
    console.log("  W7-D5 cursorrules-zh:");
    console.log(`    - Team clones LessUp/awesome-cursorrules-zh to`);
    console.log(`      ${SIDECAR_ROOT}/awesome-cursorrules-zh`);
    console.log(`    - AI runs: pnpm ... convert-cursorrules --limit 10`);
    console.log(`    - Then fill W7-D5 entries with paths from ${CURSORRULES_CONVERTED}`);
    console.log("");
    console.log("Exiting 0 (empty batch is a valid no-op).");
    process.exit(0);
  }

  const db = createDb(DATABASE_URL);
  const companyName = "ai-company-m1";

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.name, companyName));

  if (!company) {
    console.error(
      `❌ company ${companyName} 不存在 · 先跑 install-m1-skills 建 company`,
    );
    process.exit(1);
  }
  const companyId = company.id;
  console.log(`\n[target] company ${companyName} id=${companyId.slice(0, 8)}...`);

  let installed = 0;
  let failed = 0;

  for (const skill of M2_W7_SKILLS) {
    const label = `${skill.wave} · ${skill.sourcePath.split("/").slice(-2).join("/")}`;
    try {
      if (!existsSync(skill.sourcePath)) {
        console.error(
          `✗ ${label} skipped: source file missing (${skill.sourcePath})`,
        );
        failed++;
        continue;
      }
      const markdown = await readFile(skill.sourcePath, "utf-8");
      const sha256 = createHash("sha256").update(markdown).digest("hex");

      const result = await installSkillHandler(
        {
          db,
          companyId,
          actorType: "system",
          actorId: "m2-w7-installer",
        },
        {
          sourceUrl: skill.sourcePath,
          d18Score: skill.d18Score,
          d18Justification: skill.justification,
          sha256,
          scope: "company",
          supplyChainTrust: skill.supplyChainTrust,
        },
      );

      console.log(
        `✓ ${label.padEnd(60)} D18=${skill.d18Score} approvalId=${result.approvalId.slice(0, 8)} sandbox=${result.sandboxRequired}`,
      );
      installed++;
    } catch (err) {
      console.error(
        `✗ ${label} failed:`,
        err instanceof Error ? err.message : err,
      );
      failed++;
    }
  }

  console.log("=".repeat(72));

  const totalSkills = await db
    .select({ id: companySkills.id })
    .from(companySkills)
    .where(eq(companySkills.companyId, companyId));
  const totalApprovals = await db
    .select({ id: approvals.id })
    .from(approvals)
    .where(
      and(eq(approvals.companyId, companyId), eq(approvals.type, "install_skill")),
    );
  const totalLogs = await db
    .select({ id: activityLog.id })
    .from(activityLog)
    .where(eq(activityLog.companyId, companyId));

  console.log(`\ncompany_skills total (M1+M2 累计): ${totalSkills.length}`);
  console.log(`approvals (install_skill 累计): ${totalApprovals.length}`);
  console.log(`activity_log entries 累计: ${totalLogs.length}`);
  console.log("=".repeat(72));
  console.log(
    installed === M2_W7_SKILLS.length
      ? `🎯 M2 W7 install PASS · ${installed}/${M2_W7_SKILLS.length} appended`
      : `⚠ M2 W7 install partial · ${installed} appended / ${failed} failed`,
  );
  console.log("=".repeat(72));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("❌ FATAL:", err);
  process.exit(1);
});
