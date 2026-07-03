/**
 * POST /api/ai-company/v1/skills/install
 *
 * Route prefix locked to `/api/ai-company/*` per handoff/06 §2.2 (API 层缓冲).
 * v1 是稳定契约：加字段允许，改字段 / 删字段禁止（handoff/06 §2.2 versioning）。
 *
 * 这是 skeleton，不是实现。W2-D10 只搭结构。真实业务逻辑（D18 打分记录、
 * approval 创建、Snyk 三检、company_skills 落库、activity_log）在后续
 * W2/W3 施工日填充。参考契约：handoff/06 §3.2 install_skill approval 强制门禁。
 */

import type { InstallSkillRequest, InstallSkillResponse } from "./types.js";

/**
 * Handles `POST /api/ai-company/v1/skills/install`.
 *
 * Contract (frozen at v1)：
 * - Request body: {@link InstallSkillRequest}
 * - Response: `202 Accepted` + {@link InstallSkillResponse}（含 D18=5，approval 记录仍必写）
 *
 * Runtime responsibilities (TODO in later waves):
 *  1. 校验 body（zod schema，`d18_score ∈ 1..5`，`d18_justification.length ≥ 50` 等）
 *  2. 走 §3.3 Snyk 三检（外链 / base64 / shell）; 命中 abort
 *  3. 通过 internal/paperclip-client 创建 `approvals(type='install_skill')`
 *  4. 写 `plugin_ai_company_skill_registry` audit row
 *  5. 返回 approval_id，异步 board 批准后落 `company_skills`
 */
export async function installSkillHandler(
  _request: InstallSkillRequest,
): Promise<InstallSkillResponse> {
  // TODO(W2-D11+): implement per handoff/06 §3.2.
  throw new Error("installSkillHandler: skeleton only, not yet implemented");
}
