/**
 * Install M2 W5 skills · appends to ai-company-m1 test company (no wipe).
 *
 * 装 W5-D5 (M2 W5 目前唯一的 skill install-type deliverable):
 *   W5-D5 terraform-specialist (wshobson/agents deployment-strategies · D18=3 pending)
 *
 * 未来 M2 W5-W8 加更多 skill (kubernetes-patterns / ci-cd-automation / logic-lens etc)
 * 都追加到 M2_SKILLS array. 保持与 install-m1-skills.ts 隔离 (M1 wipe 语义 / M2 append).
 *
 * 跑法：
 *   DATABASE_URL="postgres://paperclip:paperclip@localhost:5432/paperclip" \
 *     pnpm --filter @ai-company/paperclip-plugin-ai-company install-m2-w5-skills
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

// M2 W5 装配的 skill · 与 install-m1-skills 互补 · 不 wipe · 追加
const M2_SKILLS: SkillManifest[] = [
  {
    wave: "W5-D5",
    sourcePath: `${SIDECAR_ROOT}/wshobson-agents/plugins/deployment-strategies/agents/terraform-specialist.md`,
    d18Score: 3,
    supplyChainTrust: "community",
    justification:
      "wshobson/agents/plugins/deployment-strategies/agents/terraform-specialist · MIT + Seth Hobson 88 plugins/194 agents marketplace · D18=3 中活跃社区(handoff/06 §3.1) · 覆盖 W5-D5 terraform-review 装配语义 (plan → approval → apply 链路 · Pulumi 类头部工具生态在 wshobson 已收录)",
  },
];

async function main() {
  console.log("=".repeat(72));
  console.log(`M2 W5 skills install (${M2_SKILLS.length} 个 · append 模式 · 不 wipe)`);
  console.log("=".repeat(72));

  const db = createDb(DATABASE_URL);
  const companyName = "ai-company-m1"; // 与 M1 共用 test company

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
  let skipped = 0;

  for (const skill of M2_SKILLS) {
    const label = `${skill.wave} · ${skill.sourcePath.split("/").slice(-2, -1)[0]}`;
    try {
      const markdown = await readFile(skill.sourcePath, "utf-8");
      const sha256 = createHash("sha256").update(markdown).digest("hex");

      // 幂等检查: 如果同 sha256 已装 skip
      const existing = await db
        .select({ id: approvals.id })
        .from(approvals)
        .where(
          and(
            eq(approvals.companyId, companyId),
            eq(approvals.type, "install_skill"),
          ),
        );
      // TODO(better dedupe): 后续按 payload.sha256 查 · 现在简化跳过

      const result = await installSkillHandler(
        {
          db,
          companyId,
          actorType: "system",
          actorId: "m2-w5-installer",
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
        `✓ ${label.padEnd(50)} D18=${skill.d18Score} approvalId=${result.approvalId.slice(0, 8)} sandbox=${result.sandboxRequired}`,
      );
      installed++;
      void existing; // silence unused
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

  console.log(
    `\ncompany_skills total (M1+M2): ${totalSkills.length}`,
  );
  console.log(`approvals (install_skill): ${totalApprovals.length}`);
  console.log(`activity_log entries: ${totalLogs.length}`);
  console.log("=".repeat(72));
  console.log(
    installed === M2_SKILLS.length
      ? `🎯 M2 W5 install PASS · ${installed}/${M2_SKILLS.length} appended`
      : `⚠ M2 W5 install partial · ${installed} appended / ${failed} failed`,
  );
  console.log("=".repeat(72));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("❌ FATAL:", err);
  process.exit(1);
});
