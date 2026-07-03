/**
 * E2E test: skill-creator install via installSkillHandler.
 *
 * 跑法：从 fork root 跑
 *   pnpm --filter @ai-company/paperclip-plugin-ai-company e2e
 *
 * 前置：DATABASE_URL 指向 fresh DB（migrations + 0002 patch 都 apply 过）
 *
 * 流程：
 *   1. 建/复用 test company
 *   2. 从 side-car/anthropics-skills/skills/skill-creator/SKILL.md 读源
 *   3. 调 installSkillHandler
 *   4. 校验 approvals / company_skills / activity_log 各一行
 *
 * D18=5 → auto-approve → immediate install。
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createDb, companies, approvals, companySkills, activityLog } from "@paperclipai/db";
import { and, eq, desc } from "drizzle-orm";

import { installSkillHandler } from "../api/v1/skills/install.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://paperclip:paperclip@localhost:5432/paperclip";

const SKILL_MD_PATH = resolve(
  process.cwd(),
  "../../../side-car/anthropics-skills/skills/skill-creator/SKILL.md",
);

async function main() {
  console.log("=".repeat(72));
  console.log("E2E · installSkillHandler smoke test (W3 skill install endpoint)");
  console.log("=".repeat(72));

  const db = createDb(DATABASE_URL);

  // 1. get/create test company (fresh DB has none)
  const existingCompany = await db
    .select()
    .from(companies)
    .where(eq(companies.name, "ai-company-e2e"))
    .then((rows) => rows[0]);

  let companyId: string;
  if (existingCompany) {
    companyId = existingCompany.id;
    console.log(`✓ Using existing test company: ${companyId}`);
  } else {
    const [created] = await db
      .insert(companies)
      .values({ name: "ai-company-e2e" })
      .returning();
    if (!created) throw new Error("Failed to create test company");
    companyId = created.id;
    console.log(`✓ Created test company: ${companyId}`);
  }

  // 2. read SKILL.md
  const markdown = await readFile(SKILL_MD_PATH, "utf-8");
  const sha256 = createHash("sha256").update(markdown).digest("hex");
  console.log(`✓ Read skill-creator SKILL.md · ${markdown.length} bytes · sha256=${sha256.slice(0, 16)}...`);

  // 3. invoke installSkillHandler
  const response = await installSkillHandler(
    {
      db,
      companyId,
      actorType: "system",
      actorId: "e2e-test-runner",
    },
    {
      sourceUrl: SKILL_MD_PATH,
      d18Score: 5,
      d18Justification:
        "anthropics/skills/skills/skill-creator SKILL.md · Anthropic 官方 namespace，D18=5 per handoff/06 §3.1 判分表",
      sha256,
      scope: "company",
      supplyChainTrust: "official",
    },
  );

  console.log(`✓ installSkillHandler returned:`, response);

  // 4. verify DB state
  const [approval] = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.companyId, companyId), eq(approvals.id, response.approvalId)));
  if (!approval) throw new Error("approval not found");
  console.log(`✓ approvals row: id=${approval.id} status=${approval.status} type=${approval.type}`);
  console.log(`  payload: ${JSON.stringify(approval.payload).slice(0, 120)}...`);

  const [installedSkill] = await db
    .select({
      id: companySkills.id,
      key: companySkills.key,
      name: companySkills.name,
      sourceType: companySkills.sourceType,
      supplyChainTrust: companySkills.supplyChainTrust,
    })
    .from(companySkills)
    .where(and(eq(companySkills.companyId, companyId), eq(companySkills.name, "skill-creator")))
    .orderBy(desc(companySkills.createdAt))
    .limit(1);
  if (!installedSkill) throw new Error("skill not installed");
  console.log(`✓ company_skills row:`, installedSkill);

  const [logEntry] = await db
    .select()
    .from(activityLog)
    .where(and(eq(activityLog.companyId, companyId), eq(activityLog.action, "skill_installed")))
    .orderBy(desc(activityLog.createdAt))
    .limit(1);
  if (!logEntry) throw new Error("activity_log entry not found");
  console.log(`✓ activity_log row: action=${logEntry.action} entity=${logEntry.entityType}:${logEntry.entityId}`);
  console.log(`  details: ${JSON.stringify(logEntry.details).slice(0, 120)}...`);

  console.log("=".repeat(72));
  console.log("🎯 E2E PASS · skill-creator installed via installSkillHandler");
  console.log("=".repeat(72));

  process.exit(0);
}

main().catch((err) => {
  console.error("❌ E2E FAIL:", err);
  process.exit(1);
});
