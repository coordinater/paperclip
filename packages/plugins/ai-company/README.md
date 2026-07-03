# @ai-company/paperclip-plugin-ai-company

## 用途

L1 数据层缓冲 + 中间件 + 对外 REST 契约 —— ai-company 项目所有自建 schema 走 `plugin_ai_company_*` 表命名空间；所有 outbound HTTP 走 C8 safety middleware（PII 脱敏 + injection 启发式）；对外提供 `/api/ai-company/v1/*` REST endpoints（含 `POST /skills/install`）。遵守 `handoff/06-规范.md` §2.1 两层缓冲规范，从不改 PaperClip core schema。

## 装配路径

**Migrations**（Postgres 起来后手动 apply · M2 起改由独立 drizzle-config 驱动）：

```bash
psql "$DATABASE_URL" -f packages/plugins/ai-company/migrations/0001_init.sql
psql "$DATABASE_URL" -f packages/plugins/ai-company/migrations/0002_add_supply_chain_trust.sql
```

**HTTP route mount**（本 plugin 契约的 REST 端点由 core `server/src/routes/ai-company-plugin.ts` mount 到 `/api/ai-company/v1/*` · 见 `handoff/reports/deviations.md` DEV-1）：

```bash
cd paperclip && pnpm --filter @paperclipai/server dev
# server 起动后 /api/ai-company/v1/skills/install 端点可用
```

**测试**：

```bash
pnpm --filter @ai-company/paperclip-plugin-ai-company test
# 14 vitest（C8 middleware）
```

## 依赖

- PaperClip 底座 >= `v2026.626.0`（fork 锚定版本 · 06-规范 §2.4）
- Node.js >= 20
- Postgres 15+（`gen_random_uuid()` 需 `pgcrypto` 或 PG 13+ 原生）
- `@paperclipai/plugin-sdk`（workspace 依赖 · 06 §2.3）
- `vitest`（dev，主线已用）

## 配置项

| 键 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `BUFFER_API_TOKEN` | env / secret ref | — | Buffer GraphQL personal access token（W4-D2 · P0-1）|
| `BUFFER_TEST_PROFILE_ID` | env | — | Buffer 测试 profile hash（同 W4-D2）|
| `ADCREATIVE_API_KEY` | env / secret ref | — | AdCreative trial API key（W4-D3 · P1 · 可 skip）|
| `c8.blockOnPII` | boolean | `true` | C8 middleware 检测到 PII 时是否阻断 outbound（默认阻断）|
| `c8.injectionHeuristicVersion` | string | `"v1"` | Injection 启发式版本 · M1 v1 为 18 短语 + fake-token 正则；M2 计划升 claude-code judge（DEV-3）|

C8 middleware 走**装饰器**语义（`safeOutbound(ctx, req)`）而非 SDK hook —— SDK 无 outbound hook 表面（errata E-6）。所有 plugin 出站主动改走 `safeOutbound` 即可。

## 已知限制

- **`/skills/install` REST 端点靠 core 单行 mount 承载**：SDK 无 REST 注册能力 · 归 sanctioned deviation DEV-1 · M2 SDK 升级时 revisit
- **C8 injection 判定为启发式**：M1 offline-safe 优先 · false negative 属已知代价 · M2 生产真数据驱动补 claude-code judge（DEV-3）
- **`plugin_ai_company_lark_approval_link` 表未建**：M1 用 kv-style `plugin_ai_company_meta` 存 approval 映射 · Lark 真审批 M2 迁移时补建（DEV-4）
- **无 drizzle 生成器**：manual SQL apply · M2 迁 drizzle 时物理隔离编号空间

## 交叉引用

- 手册章节：`handoff/03-施工手册-M1.md` §W2 §W3 §W4
- 规范：`handoff/06-规范.md` §2 §9
- W4 装配后 audit：`handoff/reports/m1-w4-规范审计.md`
- SDK 表面偏差：`handoff/reports/errata.md` E-2~E-6
- Sanctioned deviations：`handoff/reports/deviations.md` DEV-1 DEV-3
