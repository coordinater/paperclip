-- Migration: 0002_add_supply_chain_trust
-- W2-D4 · D18 供应链治理：company_skills.supply_chain_trust
--
-- 注意：本 migration 修改 core 表 company_skills。
-- 按 handoff/06 §10 红线 1，改 core 一般禁止，本项是 02 §D1 明列的
-- 两处例外之一（另一处是 approvals(type='install_skill') 强制门禁，
-- 该项无需 DB migration——approvals.type 是自由 text，app 层处置）。
--
-- 与已有 trust_level 语义正交：
--   trust_level        = 执行范围信任 (markdown_only / full)
--   supply_chain_trust = 来源信任 (official / curated / community / anonymous)

ALTER TABLE company_skills
  ADD COLUMN supply_chain_trust TEXT NOT NULL DEFAULT 'community'
    CHECK (supply_chain_trust IN ('official', 'curated', 'community', 'anonymous'));

CREATE INDEX idx_company_skills_supply_chain_trust
  ON company_skills(supply_chain_trust);
