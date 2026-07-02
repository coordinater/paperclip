# @ai-company/paperclip-plugin-ai-company

## 用途

L1 数据层缓冲——所有 ai-company 项目自建 schema 走 `plugin_ai_company_*` 表命名空间，从不改 PaperClip core（遵守 handoff/06 §2.1 两层缓冲规范）。

## 现状

W1-D3 skeleton 阶段。仅含 `migrations/0001_init.sql` 三张空表：

| 表 | 用途 | FK |
|---|---|---|
| `plugin_ai_company_meta` | 通用 kv（每公司 unique key） | company_id → companies.id |
| `plugin_ai_company_agent_config` | agent 层配置扩展 | agent_id → agents.id |
| `plugin_ai_company_skill_registry` | skill 装配状态镜像（W2 起将扩展为完整 supply chain audit） | company_id → companies.id |

后续周会扩展：
- W2-D4/D5 · schema patch：`company_skills.supply_chain_trust` + `approvals(type='install_skill')`
- W2-D10 · API 层缓冲 `api/v1/*` 骨架
- W3+ · plugin sdk 注册、adapter 实现、entities 定义

## 装配路径

现阶段 SQL 手动 apply（Postgres 起来后）：

```bash
psql "$DATABASE_URL" -f packages/plugins/ai-company/migrations/0001_init.sql
```

M2 起改由独立 drizzle-config 驱动，与 core 的 `packages/db/src/migrations/` 编号空间物理隔离（永不撞）。

## 依赖

- PaperClip @ v2026.626.0
- Node >= 20
- Postgres 15+（`gen_random_uuid()` 需要 `pgcrypto` 或 PG 13+ 原生支持）

## 配置项

（skeleton 期无配置。W2 起逐步补 skill_registry / adapter 相关 config。）

## 已知限制

- 尚未接入 drizzle 生成器——manual SQL apply
- 尚未有对应 TypeScript schema/types
- W2-D5 前 `install_skill` approval type 未落地，skill_registry 只是记录位
