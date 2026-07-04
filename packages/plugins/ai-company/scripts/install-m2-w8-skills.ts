/**
 * Install M2 W8 skills · appends to ai-company-m1 test company (no wipe).
 *
 * 装 W8 波：
 *   W8-D1 wewrite (中文公众号) · 手册 §W8.D1
 *          Anthropic Marketplace 上没有匹配名字 · 落地代表 skill 是
 *          wshobson/agents/plugins/content-marketing/agents/content-marketer.md
 *          语义覆盖 "生成符合中文公众号格式的内容"（用配套 prompt 引导中文语气）
 *          M3+ 若 Anthropic Marketplace 上出现真名 wewrite 可迁
 *
 * 与 M1 W4-D1 code-reviewer / M2 W5-D5 terraform / M2 W6-D4/D5 kubernetes+ci-cd
 * 同源 (wshobson/agents · MIT · D18=3 pending 分支)。
 *
 * 跑法：
 *   DATABASE_URL="postgres://paperclip:paperclip@localhost:5432/paperclip" \
 *     pnpm --filter @ai-company/paperclip-plugin-ai-company install-m2-w8-skills
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

interface SkillManifest {
  wave: string;
  sourcePath: string;
  d18Score: D18Score;
  supplyChainTrust: SupplyChainTrust;
  justification: string;
}

// M2 W8 装的 skill · devops 之后的 marketing scale 波
const M2_W8_SKILLS: SkillManifest[] = [
  {
    wave: "W8-D1",
    sourcePath: `${SIDECAR_ROOT}/wshobson-agents/plugins/content-marketing/agents/content-marketer.md`,
    d18Score: 3,
    supplyChainTrust: "community",
    justification:
      "wshobson/agents/plugins/content-marketing/agents/content-marketer · MIT · 同源 wshobson · D18=3 · 覆盖 W8-D1 wewrite 中文公众号装配语义(手册 §W8.D1: '能生成一篇符合公众号格式的中文内容'). Anthropic Marketplace 上未见 wewrite 真名 · 用 content-marketer 作代表 · M3+ 若有真名可迁. 使用时通过 W7 Campaign Workflow orchestrator 的 promptTemplate + brand_voice 引导中文语气.",
  },
];

async function main() {
  console.log("=".repeat(72));
  console.log(`M2 W8 skills install (${M2_W8_SKILLS.length} 个 · marketing scale · append 模式)`);
  console.log("=".repeat(72));

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

  for (const skill of M2_W8_SKILLS) {
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
          actorId: "m2-w8-installer",
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
    installed === M2_W8_SKILLS.length
      ? `🎯 M2 W8 install PASS · ${installed}/${M2_W8_SKILLS.length} appended`
      : `⚠ M2 W8 install partial · ${installed} appended / ${failed} failed`,
  );
  console.log("=".repeat(72));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("❌ FATAL:", err);
  process.exit(1);
});
