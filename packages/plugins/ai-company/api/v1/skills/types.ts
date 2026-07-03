/**
 * v1 contract types for `/api/ai-company/v1/skills/*`.
 *
 * 冻结点：per handoff/06 §2.2，v1 契约加字段允许，改 / 删禁止。
 * Skeleton 阶段占位；字段列表源自 handoff/06 §3.2 的 API 契约块。
 */

// D18 分档；1 = 匿名/不可追溯（禁装），5 = Anthropic 官方。见 handoff/06 §3.1。
export type D18Score = 1 | 2 | 3 | 4 | 5;

export type SupplyChainTrust = "official" | "curated" | "community" | "anonymous";

export type SkillScope = "user" | "company";

export interface InstallSkillRequest {
  sourceUrl: string;
  d18Score: D18Score;
  /** ≥ 50 字，写入 audit_log；handoff/06 §3.2 硬约束。 */
  d18Justification: string;
  /** skill tar 目录 sha256，用于唯一性 + 白名单校验。 */
  sha256: string;
  scope: SkillScope;
  supplyChainTrust: SupplyChainTrust;
}

export interface InstallSkillResponse {
  /** 所有档均返回 approval_id（含 D18=5），审计目的。 */
  approvalId: string;
  /** D18 分档决定的运行时沙箱策略；见 handoff/06 §3.2 隔离矩阵。 */
  sandboxRequired: boolean;
}
