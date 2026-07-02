-- Migration: 0001_init
-- W1-D3 · Data 层缓冲 skeleton
-- 建三张空表：plugin_ai_company_meta / _agent_config / _skill_registry
-- 遵守 handoff/06 §2.1（plugin 表 FK -> core，永不反向）+ §7.1 additive-only
-- 回滚：走 additive 新 migration 反向；不写 DOWN 到本文件

CREATE TABLE plugin_ai_company_meta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_plugin_ai_company_meta_company_id
  ON plugin_ai_company_meta(company_id);
CREATE UNIQUE INDEX uidx_plugin_ai_company_meta_company_key
  ON plugin_ai_company_meta(company_id, key);

CREATE TABLE plugin_ai_company_agent_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_plugin_ai_company_agent_config_company_id
  ON plugin_ai_company_agent_config(company_id);
CREATE UNIQUE INDEX uidx_plugin_ai_company_agent_config_agent_id
  ON plugin_ai_company_agent_config(agent_id);

CREATE TABLE plugin_ai_company_skill_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  installed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_plugin_ai_company_skill_registry_company_id
  ON plugin_ai_company_skill_registry(company_id);
CREATE UNIQUE INDEX uidx_plugin_ai_company_skill_registry_company_skill
  ON plugin_ai_company_skill_registry(company_id, skill_id);
