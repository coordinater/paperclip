/**
 * POST /api/ai-company/v1/campaigns
 *
 * Route prefix locked to `/api/ai-company/*` per handoff/06 §2.2 (API 层缓冲).
 * v1 是稳定契约：加字段允许，改 / 删禁止（handoff/06 §2.2 versioning）。
 *
 * 这是 skeleton，不是实现。W2-D10 只搭结构。真实业务逻辑（campaign
 * 状态机、Buffer/AdCreative adapter 触发、Meridian MMM 归因写入）在
 * M2 营销部门装配日填充。
 */

import type { CreateCampaignRequest, CreateCampaignResponse } from "./types.js";

/**
 * Handles `POST /api/ai-company/v1/campaigns`.
 *
 * Contract (frozen at v1)：
 * - Request body: {@link CreateCampaignRequest}
 * - Response: `201 Created` + {@link CreateCampaignResponse}
 *
 * Runtime responsibilities (TODO in later waves):
 *  1. 校验 body（channel 枚举、budget 非负、schedule 合法 ISO 时间）
 *  2. 通过 internal/paperclip-client 建 issue / task（campaign 作为工作单元）
 *  3. 写 `plugin_ai_company_campaign_state`（W2-D5 之后 schema 就位）
 *  4. 触发 Buffer / AdCreative / HubSpot adapter 排程
 *  5. 返回 campaign_id + 初始状态
 */
export async function createCampaignHandler(
  _request: CreateCampaignRequest,
): Promise<CreateCampaignResponse> {
  // TODO(M2 营销装配): implement per handoff/06 §2.2 v1 契约 + 营销部门装配手册。
  throw new Error("createCampaignHandler: skeleton only, not yet implemented");
}
