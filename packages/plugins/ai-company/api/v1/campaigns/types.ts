/**
 * v1 contract types for `/api/ai-company/v1/campaigns/*`.
 *
 * 冻结点：per handoff/06 §2.2，v1 契约加字段允许，改 / 删禁止。
 * Skeleton 阶段：字段列表暂按 M2 营销装配的初步共识占位；M2 装配日会有
 * 一次显式冻结 PR，将本文件从 skeleton 提升为 v1 稳定契约。
 */

// 现阶段允许的 channel 枚举；后续加值允许（additive），删值禁止。
export type CampaignChannel = "buffer" | "adcreative" | "hubspot" | "lark";

export type CampaignStatus = "draft" | "scheduled" | "running" | "paused" | "done" | "failed";

export interface CreateCampaignRequest {
  name: string;
  channel: CampaignChannel;
  /** 币种 minor unit（分 / cents）——避免 float 精度。 */
  budgetMinor: number;
  currency: string;
  /** ISO 8601；含时区。 */
  scheduledStartAt: string;
  scheduledEndAt: string;
  /** 自由 metadata 供 adapter 消费；不进 v1 契约字段搜索。 */
  metadata?: Record<string, unknown>;
}

export interface CreateCampaignResponse {
  campaignId: string;
  status: CampaignStatus;
}
