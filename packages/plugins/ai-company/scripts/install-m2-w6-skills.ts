/**
 * Install M2 W6 skills · appends to ai-company-m1 test company (no wipe).
 *
 * 装 W6 devops 波两项：
 *   W6-D4 kubernetes-architect · wshobson/agents kubernetes-operations plugin · D18=3 pending
 *          (手册说 "kubernetes-patterns (Pulumi)"，落地代表 skill 是 wshobson 的
 *           kubernetes-architect · Pulumi 相关 pattern 由 skill 内容覆盖)
 *   W6-D5 deployment-engineer · wshobson/agents cicd-automation plugin · D18=3 pending
 *          (手册说 "ci-cd-automation (ahmedasmar)"，本仓库上游是 wshobson · 用同名
 *           plugin 里的 deployment-engineer 作代表 · agent 能生成 .github/workflows/ci.yml
 *           草稿即达 W6-D5 DoD)
 *
 * 与 M1 W4-D1 wshobson code-reviewer + M2 W5-D5 terraform-specialist 同源 · 走同一
 * pending 分支 · sandbox_required=true.
 *
 * 跑法：
 *   DATABASE_URL="postgres://paperclip:paperclip@localhost:5432/paperclip" \
 *     pnpm --filter @ai-company/paperclip-plugin-ai-company install-m2-w6-skills
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

// M2 W6 devops 波 · 手册 §W6.D4 / §W6.D5
const M2_W6_SKILLS: SkillManifest[] = [
  {
    wave: "W6-D4",
    sourcePath: `${SIDECAR_ROOT}/wshobson-agents/plugins/kubernetes-operations/agents/kubernetes-architect.md`,
    d18Score: 3,
    supplyChainTrust: "community",
    justification:
      "wshobson/agents/plugins/kubernetes-operations/agents/kubernetes-architect · MIT · Seth Hobson 88 plugins/194 agents marketplace · D18=3 中活跃社区(handoff/06 §3.1) · 覆盖 W6-D4 kubernetes-patterns 装配语义(手册 §W6.D5：'能扫描一个 k8s manifest 报告 no-limits / no-health / no-PDB'). Pulumi patterns 由 agent 内容覆盖 · 若上游有专门的 kubernetes-patterns skill 可 M3 迁移.",
  },
  {
    wave: "W6-D5",
    sourcePath: `${SIDECAR_ROOT}/wshobson-agents/plugins/cicd-automation/agents/deployment-engineer.md`,
    d18Score: 3,
    supplyChainTrust: "community",
    justification:
      "wshobson/agents/plugins/cicd-automation/agents/deployment-engineer · MIT · 同源 wshobson/agents · D18=3 · 覆盖 W6-D5 ci-cd-automation 装配语义(手册 §W6.D5：'能生成一份 .github/workflows/ci.yml 草稿'). 手册提及 ahmedasmar 上游可能与本仓库版本不同 · 优先用 wshobson 版本以保持供应链单源 · 若 team 后续偏好 ahmedasmar 可换源.",
  },
];

async function main() {
  console.log("=".repeat(72));
  console.log(`M2 W6 skills install (${M2_W6_SKILLS.length} 个 · devops 波 · append 模式 · 不 wipe)`);
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

  for (const skill of M2_W6_SKILLS) {
    const label = `${skill.wave} · ${skill.sourcePath.split("/").slice(-2, -1)[0]}`;
    try {
      const markdown = await readFile(skill.sourcePath, "utf-8");
      const sha256 = createHash("sha256").update(markdown).digest("hex");

      const result = await installSkillHandler(
        {
          db,
          companyId,
          actorType: "system",
          actorId: "m2-w6-installer",
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
    installed === M2_W6_SKILLS.length
      ? `🎯 M2 W6 install PASS · ${installed}/${M2_W6_SKILLS.length} appended`
      : `⚠ M2 W6 install partial · ${installed} appended / ${failed} failed`,
  );
  console.log("=".repeat(72));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("❌ FATAL:", err);
  process.exit(1);
});
