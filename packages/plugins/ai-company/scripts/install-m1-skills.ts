/**
 * Batch install M1 skills via installSkillHandler.
 *
 * 装 6 个 skill：
 *   W2-D8 skill-creator    (Anthropic, D18=5)
 *   W2-D9 mcp-builder       (Anthropic, D18=5)
 *   W3-D2 webapp-testing   (Anthropic, D18=5)
 *   W3-D3 frontend-design  (Anthropic, D18=5)
 *   W3-D4 seo-audit        (AgriciDaniel/claude-seo 代表, D18=4)
 *   W3-D5 blog-google      (AgriciDaniel/claude-blog 代表, D18=4)
 *
 * 用一个专属 test company "ai-company-m1"，每次跑时先清空该 company 的 skill/approval/log。
 *
 * 跑法：
 *   DATABASE_URL="postgres://paperclip:paperclip@localhost:5432/paperclip" \
 *     pnpm --filter @ai-company/paperclip-plugin-ai-company install-m1-skills
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
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

interface SkillManifest {
  wave: string;
  sourcePath: string;
  d18Score: D18Score;
  supplyChainTrust: SupplyChainTrust;
  justification: string;
}

const M1_SKILLS: SkillManifest[] = [
  {
    wave: "W2-D8",
    sourcePath: `${SIDECAR_ROOT}/anthropics-skills/skills/skill-creator/SKILL.md`,
    d18Score: 5,
    supplyChainTrust: "official",
    justification:
      "anthropics/skills/skills/skill-creator · Anthropic 官方 namespace · D18=5 per handoff/06 §3.1",
  },
  {
    wave: "W2-D9",
    sourcePath: `${SIDECAR_ROOT}/anthropics-skills/skills/mcp-builder/SKILL.md`,
    d18Score: 5,
    supplyChainTrust: "official",
    justification:
      "anthropics/skills/skills/mcp-builder · Anthropic 官方 namespace · D18=5 per handoff/06 §3.1",
  },
  {
    wave: "W3-D2",
    sourcePath: `${SIDECAR_ROOT}/anthropics-skills/skills/webapp-testing/SKILL.md`,
    d18Score: 5,
    supplyChainTrust: "official",
    justification:
      "anthropics/skills/skills/webapp-testing · Anthropic 官方 namespace · D18=5 per handoff/06 §3.1",
  },
  {
    wave: "W3-D3",
    sourcePath: `${SIDECAR_ROOT}/anthropics-skills/skills/frontend-design/SKILL.md`,
    d18Score: 5,
    supplyChainTrust: "official",
    justification:
      "anthropics/skills/skills/frontend-design · Anthropic 官方 namespace · D18=5 per handoff/06 §3.1",
  },
  {
    wave: "W3-D4",
    sourcePath: `${SIDECAR_ROOT}/claude-seo/skills/seo-audit/SKILL.md`,
    d18Score: 4,
    supplyChainTrust: "curated",
    justification:
      "AgriciDaniel/claude-seo/skills/seo-audit · 10396 stars + MIT + Rankenstein co-founder作者，D18=4 头部社区（bundle 代表 skill）",
  },
  {
    wave: "W3-D5",
    sourcePath: `${SIDECAR_ROOT}/claude-blog/skills/blog-google/SKILL.md`,
    d18Score: 4,
    supplyChainTrust: "curated",
    justification:
      "AgriciDaniel/claude-blog/skills/blog-google · 1265 stars + MIT + 5-gate Blog Delivery Contract 兼 D18=4 边界，bundle 代表 skill",
  },
];

async function main() {
  console.log("=".repeat(72));
  console.log(`Batch install M1 skills (${M1_SKILLS.length} 个)`);
  console.log("=".repeat(72));

  const db = createDb(DATABASE_URL);
  const companyName = "ai-company-m1";

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.name, companyName));

  let companyId: string;
  if (company) {
    companyId = company.id;
    console.log(`\n[cleanup] wipe existing company data for ${companyName}`);
    await db.delete(activityLog).where(eq(activityLog.companyId, companyId));
    await db.delete(companySkills).where(eq(companySkills.companyId, companyId));
    await db.delete(approvals).where(eq(approvals.companyId, companyId));
    console.log(`  ✓ cleaned`);
  } else {
    const [created] = await db
      .insert(companies)
      .values({ name: companyName, issuePrefix: "AIM" })
      .returning();
    if (!created) throw new Error("Failed to create company");
    companyId = created.id;
    console.log(`\n[bootstrap] created company ${companyName} id=${companyId}`);
  }

  let installed = 0;
  let failed = 0;

  for (const skill of M1_SKILLS) {
    const label = `${skill.wave} · ${skill.sourcePath.split("/").slice(-2, -1)[0]}`;
    try {
      const markdown = await readFile(skill.sourcePath, "utf-8");
      const sha256 = createHash("sha256").update(markdown).digest("hex");

      const result = await installSkillHandler(
        {
          db,
          companyId,
          actorType: "system",
          actorId: "batch-installer",
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
        `✓ ${label.padEnd(40)} D18=${skill.d18Score} approvalId=${result.approvalId.slice(0, 8)} sandbox=${result.sandboxRequired}`,
      );
      installed++;
    } catch (err) {
      console.error(`✗ ${label} failed:`, err instanceof Error ? err.message : err);
      failed++;
    }
  }

  console.log("=".repeat(72));

  const skillsInDb = await db
    .select({
      name: companySkills.name,
      supplyChainTrust: companySkills.supplyChainTrust,
      sourceType: companySkills.sourceType,
    })
    .from(companySkills)
    .where(eq(companySkills.companyId, companyId));

  console.log(`\ncompany_skills in DB (company=${companyName}): ${skillsInDb.length}`);
  for (const s of skillsInDb) {
    console.log(`  · ${s.name.padEnd(20)} trust=${s.supplyChainTrust.padEnd(10)} source=${s.sourceType}`);
  }

  const approvalCount = await db
    .select({ id: approvals.id })
    .from(approvals)
    .where(and(eq(approvals.companyId, companyId), eq(approvals.type, "install_skill")));
  const logCount = await db
    .select({ id: activityLog.id })
    .from(activityLog)
    .where(and(eq(activityLog.companyId, companyId), eq(activityLog.action, "skill_installed")));

  console.log(`\napprovals (type=install_skill): ${approvalCount.length}`);
  console.log(`activity_log (action=skill_installed): ${logCount.length}`);

  console.log("=".repeat(72));
  console.log(
    installed === M1_SKILLS.length
      ? `🎯 BATCH PASS · ${installed}/${M1_SKILLS.length} installed`
      : `⚠ BATCH partial · ${installed} installed / ${failed} failed`,
  );
  console.log("=".repeat(72));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("❌ FATAL:", err);
  process.exit(1);
});
