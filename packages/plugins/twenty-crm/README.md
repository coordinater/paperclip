# Twenty CRM plugin · Kick-off PRD (M4-03)

**Status**: ⏸ **PRD only · 无实现**（per handbook §M4-03："Twenty CRM 深度集成 kick-off · `packages/plugins/twenty-crm/` + PRD + 与 HubSpot API（M2）并存架构 + core mapping 设计"）

**关键**: **1 项 M4-DP1 TODO(user-decision) · 需人工产品/客群决策**（handbook §M4-DP1 明说"A/B/C 三档由用户调研数据决定 · 不 AI 拍板"）

**Component ID**: L5-10 (per `handoff/02-架构与决策.md` §5.6)

**编号锚点**: 手册 §Month 4 M4-03 · D8 CRM 双轨决策 · S8 CRM 二选一

---

## 1. Why · 为什么做这个 plugin

**目标**：给 ai-company AI 公司提供**开源 · 数据主权 · 深度双向绑定**的 CRM 层 · 与 M2 W8-D3 装配的 `hubspot-breeze-plugin`（SaaS · 快接入）形成**"深度自主 vs 快速接入"双轨**。

**为什么不是 HubSpot 一家吃透**：
- **D8 决策原文**（`02-架构与决策.md`）："**两者都做**——HubSpot API 快接入（M2）+ Twenty 深度自主（M4-M5）。理由：短期用 HubSpot · 长期迁 Twenty · 对冲生态锁定风险"
- Twenty (52k star · https://github.com/twentyhq/twenty) 是**开源 GraphQL-first CRM** · 支持自托管 · 无 vendor lock-in · 与 PaperClip "AI 公司自主运营"叙事对齐
- HubSpot Breeze 是 SaaS · 依赖外部 API 稳定性 + rate limit + 定价（S8 CRM 二选一）· 长期数据主权风险

**与 M1-M3 已有的关系**：
- **hubspot-breeze-plugin (M2 W8-D3 · 25 tests)**：Twenty 与之**并存 · 同 SDK canonical path**（manifest.webhooks + onWebhook 分发 + safeOutbound C8 middleware · D-M2-05 + errata E-6 · Pattern-2）
- **Campaign Workflow (M2 W7-D1)**：Campaign Workflow 产出 lead → HubSpot 或 Twenty 二选一装配（depend on M4-DP1 分叉）
- **cold-email plugin (M4-02 · kick-off)**：冷邮件的 reply / bounce → 沉淀到哪个 CRM · 也 depend on M4-DP1
- **paperclip-plugin-lark (M1 W3-W4)**：飞书审批批准后自动同步到 CRM · 走同 approval-router (D-M2-13)

**为什么"深度集成"而非"轻装配"**（区别于 hubspot-breeze 的"快接入"）：
- Twenty **自托管** → docker-compose 起服务 · 走 `plugin.http.outbound` 调 GraphQL（**不改 core**）
- **双向同步**：paperclip agents 树 ↔ Twenty Company/Person/Opportunity 树 · 需 **core mapping 设计**（本 PRD §5）
- **实体扩展**：Twenty 支持自定义对象（custom objects）· 可镜像 paperclip 的 `plugin_entities` 到 Twenty · 反向也可

---

## 2. 人工决策点 · TODO(user-decision)

### 2.1 M4-DP1 · Twenty vs HubSpot 角色分工 · TODO(user-decision)

**手册 §M4-DP1 明说**：以下决策不是 AI 可自主项 · 依赖 M4 初期用户调研 + M2-M3 CRM 使用率数据。

| 分叉 | 触发条件 | Twenty 定位 | HubSpot 定位 | 适用场景 |
|---|---|---|---|---|
| **A · 默认（两者并存）** | 目标客户对 HubSpot 生态无强绑定 · 且愿意尝试自主方案 | 深度集成 · M4-M5 完成 MVP | SaaS 快接入 · M2 已完成 · 保留 | mixed 客群 · 客户自选 |
| **B · 仅 HubSpot** | M4 初期用户调研发现 **80% 目标客户已用 HubSpot 且不愿迁移** | **降级观察档** · plugin skeleton 保留但不推进 MVP · M6+ revisit | 主力 · 深化双向同步 | HubSpot 生态锁定客群 |
| **C · 仅 Twenty** | 目标客户强调"**全自主 / 开源 / 数据主权**" · 或 SaaS CRM 政策/合规风险 | 主力 · 提前到 M4-M5 完整 MVP | 减配 · plugin 保留但不主动推荐 · 用于"客户已有 HubSpot 数据迁入" | 开源/自主客群 |

**建议 default**（等用户 override）：**A · 两者并存**
- 理由：M4 阶段客群未定型 · 对冲最安全 · 深度集成本身也需 1-2 人月 · 不因分叉延迟 kick-off
- Trigger for override：M4 中期若 team 用户调研数据 clear 指向 B 或 C · 即刻更新本 PRD

**关联 M3-DP1 数据**（若 M2 W8-D5 SWE-bench 数据出来后走 mem0 装配路径 · 会引发 CRM 使用率再评估）：
- 若 D-M3-03 判 CRM 使用率 ≥ 3 次 → Twenty 装 · 且大概率走 A/C
- 若 D-M3-03 判 CRM 使用率 < 3 次 → Twenty 推 M6+ · 此 PRD 保留但装配延后

**产出要求**（手册 §M4-DP1）：**M4 结束时** `handoff/reports/decisions-m4.md` §crm 段必须填写：
- 用户调研数据来源（问卷 / 访谈 / 客户列表）
- 分叉最终选择（A / B / C）
- 关联到本 PRD 的 revisit 触发

---

## 3. What · plugin 结构

**plugin id**: `ai-company.paperclip-plugin-twenty-crm`
**版本**: `0.0.1-alpha.0` (kick-off)
**category**: `connector`（与 hubspot-breeze-plugin 同类）

### 3.1 目录结构（与 hubspot-breeze 同 pattern · 复用 Pattern-2 + Pattern-3）

```
packages/plugins/twenty-crm/
├── README.md            ← 本 PRD (M4-03)
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── manifest.ts       ← manifest.webhooks 声明（M4-M5 起装配）
    ├── client.ts         ← GraphQL client · fetchImpl injection（Pattern-3）
    ├── client.test.ts    ← vitest · stub GraphQL responses
    ├── mapping.ts        ← paperclip ↔ Twenty core mapping（新 · 见 §5）
    ├── mapping.test.ts   ← vitest · 双向同步 unit tests
    ├── worker.ts         ← onWebhook switch endpointKey（Pattern-2）
    └── worker.test.ts    ← vitest · webhook dispatch
```

### 3.2 SDK capabilities 声明

```
capabilities: [
  "webhooks.receive",      // agent 触发的 sync/create webhook
  "plugin.state.read",     // 存 Twenty ↔ paperclip id 映射表
  "plugin.state.write",
  "activity.log.write",    // 全部 mutation 记 activity_log
  "http.outbound",         // 走 GraphQL API（自托管 endpoint · 走 safeOutbound C8）
  "secrets.read-ref",      // TWENTY_API_KEY + TWENTY_ENDPOINT_URL
  "entities.read",         // 双向同步需读 paperclip entities（agents / issues / plugin_entities）
  "entities.write",        // 反向 Twenty webhook → paperclip 时写 entities
]
```

### 3.3 Manifest webhooks（初期 M4-M5 · 后续可扩）

M4 M-05 阶段起装配 · 但 kick-off 阶段先声明 5 个：

```
webhooks: [
  { endpointKey: "sync-agent-to-company",    // paperclip agent tree → Twenty Company
    displayName: "Sync agent hierarchy to Twenty Company" },
  { endpointKey: "sync-issue-to-opportunity", // paperclip issue → Twenty Opportunity
    displayName: "Sync issue to Twenty Opportunity" },
  { endpointKey: "sync-user-to-person",       // paperclip user → Twenty Person
    displayName: "Sync user to Twenty Person" },
  { endpointKey: "upsert-note",               // paperclip activity_log → Twenty Note (audit view)
    displayName: "Upsert activity log entry as note" },
  { endpointKey: "twenty-inbound",            // Twenty webhook → paperclip (双向 · M5 完成)
    displayName: "Inbound Twenty webhook (M5+)" },
]
```

---

## 4. 装配路径与依赖

**装配路径**（per handbook §M4 § L5-10）：
- Twenty 独立起服务：`docker-compose -f side-car/twenty/docker-compose.yml up -d`（不塞进 paperclip fork · 参考 handbook §"典型问题诊断"）
- 走 `plugin.http.outbound` 调 GraphQL endpoint（默认 `http://localhost:3001/graphql`）
- **不改 paperclip core** · 全 SDK canonical path

**依赖**（per 02-架构 §5.6）：
- `L5-09 HubSpot Breeze API`（M2 W8-D3 · 已就位）
- `L1-02 API 层缓冲`（M1 W2 · 已就位）

**装配时机**（per 02-架构 §5.6）：`M3+ 1-2 人月` · **本 M4 只做 PRD + skeleton**
- **M4** ✅：PRD (本文件) + package.json + skeleton files
- **M5**（若 M4-DP1 = A/C · 且用户调研支持）：完整 MVP · client.ts + mapping.ts 完整实现 · 5 webhooks 装配
- **M6+**：双向同步 + custom objects 镜像

**上下游 revisit 触发**：
- M4-DP1 分叉最终决定（M4 中期）→ 若 = B · 本 plugin 冻结在 skeleton · 不进 M5
- M5 W-D1 前 · Twenty upstream v0.30+ major release 若破坏 GraphQL schema → 本 PRD revisit
- D-M3-03 CRM 使用率数据（等 M2 W8-D5 → D-M3 rules-frozen 后）· 若 < 3 次 → PRD 推 M6+

---

## 5. Core mapping 设计 · paperclip ↔ Twenty

**核心目标**：paperclip 的 agent 组织树（agents / issues / plugin_entities）与 Twenty 的 CRM 树（Company / Person / Opportunity / Note）**双向可映射 · 不改 paperclip core**（红线 1）。

### 5.1 单向映射（paperclip → Twenty · M5 完成）

| paperclip 侧 | 方向 | Twenty 侧 | 说明 |
|---|---|---|---|
| `agents` (organizational tree) | → | `Company` (workspace 顶层) | 每个 paperclip agent 树的根节点 = 1 个 Twenty Company · 子 agent = 关联 Person |
| `agents.role` | → | `Person.jobTitle` | 直接字符串复制 |
| `agents.name` | → | `Person.name` | |
| `issues (type='feature')` | → | `Opportunity` | 每个 feature issue = 1 个 Opportunity · stage 映射见 §5.3 |
| `issues (type='task')` | → | `Task` (Twenty native) | task-level issue 走 Twenty 原生 Task |
| `activity_log` | → | `Note` (on relevant Opportunity/Company) | mutation 事件流沉淀为审计 note |
| `plugin_entities` (E1/E4 leads) | → | `Person` (custom source label) | 冷邮件 / 短视频 agent 产出的 lead 沉淀 |

### 5.2 反向映射（Twenty → paperclip · M6+ 完成）

**为什么反向要延后**：反向同步会写 paperclip `plugin_entities` · 需先建 `plugin_ai_company_twenty_sync_state` shadow 表（Data 层缓冲 §2.1 pattern）· 避开红线 1（core 表反向 FK 禁止）。

| Twenty 侧 | 方向 | paperclip 侧 | 表 |
|---|---|---|---|
| `Opportunity.stage` (人工手动改) | → | `issues.status` (via approval-router D-M2-13) | `plugin_ai_company_twenty_sync_state.opportunity_id_to_issue_id` |
| `Person` 新增 | → | `plugin_entities(entity_type='twenty_person')` | shadow 状态 · 不进 core users 表 |
| `Note` 由 CRM 用户 · @ 触发 | → | `issues.description` 附 comment (via lark plugin) | webhook 分发 |

### 5.3 状态机映射（Opportunity ↔ issue）

| Twenty Opportunity stage | paperclip issue status | 触发方向 |
|---|---|---|
| `NEW` | `open` | paperclip → Twenty |
| `SCREENING` | `pending_approval` | 双向 (approval-router hook) |
| `MEETING` | `checked_out` | paperclip → Twenty |
| `PROPOSAL` | `checked_out + assigneeAgentId set` | paperclip → Twenty |
| `CUSTOMER` | `closed` | 双向 (人工/审批闭环) |

**约束**：
- **不改 paperclip issue status enum** · 走既有值 · 映射矩阵在 `mapping.ts` 内维护（内存 · 无 migration）
- **反向状态变更走 approval-router**（D-M2-13） · 避免 Twenty 用户误改导致 paperclip issue 状态腐化

### 5.4 id 映射表

**Shadow 表**（per §2.1 Data 层缓冲）：`plugin_ai_company_twenty_sync_state`

```sql
CREATE TABLE plugin_ai_company_twenty_sync_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  paperclip_kind TEXT NOT NULL CHECK (paperclip_kind IN
    ('agent','issue','user','plugin_entity','activity_log')),
  paperclip_id UUID NOT NULL,
  twenty_kind TEXT NOT NULL CHECK (twenty_kind IN
    ('Company','Person','Opportunity','Task','Note')),
  twenty_id TEXT NOT NULL,
  last_synced_at TIMESTAMP NOT NULL DEFAULT NOW(),
  sync_direction TEXT NOT NULL CHECK (sync_direction IN ('outbound','inbound','bidirectional')),
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE(company_id, paperclip_kind, paperclip_id, twenty_kind, twenty_id)
);
```

**migration 编号**（per 06-规范 §7.2）: 沿用 `plugin_ai_company_*` 命名 · 编号空间独立 · 建议 `NNNN_add_twenty_sync_state.sql`（下一个可用编号）。**M5 阶段落地** · M4 kick-off 阶段只写 PRD。

---

## 6. Test 计划（沿用 Pattern-3 + Pattern-7）

**M4 kick-off 阶段**：仅 skeleton · 0 test（package.json + tsconfig 就绪）

**M5 起装配**（若 M4-DP1 = A/C）：
- `client.test.ts`：fetchImpl injection（Pattern-3）· GraphQL query stub · 30+ tests · 复用 hubspot-breeze 的 stub 风格
- `mapping.test.ts`：双向 mapping 单元测试 · 50+ tests · 覆盖 §5.1 + §5.2 + §5.3 每条映射
- `worker.test.ts`：manifest webhooks 分发（Pattern-2）· 5 webhooks × 3 case = 15+ tests
- **总目标 M5 完成**：100+ tests deterministic · 对齐 hubspot-breeze 25 tests + campaign-workflow 52 tests 的规模

---

## 7. 装配 caveat

**已知 caveat**（本 kick-off 阶段捕获 · 装配阶段需回头对齐）：

1. **Twenty upstream 迭代快**：v0.30+ 频繁 · GraphQL schema 变动 → M5 装配前需**冻结版本**（推荐 v0.28 或 v0.30 稳定版 · 装配时 verify · 与 D10 fork 版本锚定 pattern 一致）
2. **GraphQL 与 REST 差异**：hubspot-breeze 走 REST · Twenty 走 GraphQL · **client.ts 不能复用 hubspot 的 REST 客户端** · 需新写（但 fetchImpl injection pattern 复用 Pattern-3）
3. **自托管 Twenty 起服务**：team 需 docker-compose 起 Twenty + Postgres · 加入 `team-shopping-list.md` P1 项（+M4 P1-11 · 见 wrap-up）
4. **Auth**：Twenty 用 API key（简单）· 不像 HubSpot 有 OAuth 复杂度 · secret 命名 `TWENTY_API_KEY` + `TWENTY_ENDPOINT_URL`（per 06-规范 §6.4）
5. **反向同步（M6+）需 Webhook 收信**：Twenty 支持 webhooks → paperclip · 但 paperclip inbound webhook 走 SDK manifest.webhooks pattern（errata E-4）· M6+ 装配

---

## 8. 依赖 & 前置

**装 M5 MVP 需**：
- ✅ hubspot-breeze plugin（M2 W8-D3 · 已就位 · 作为并存参照）
- ✅ SDK Pattern-2 + Pattern-3（M2 已多次复用）
- ✅ C8 safeOutbound middleware（M1 W4 · errata E-6）
- ⏸ M4-DP1 分叉决策（M4 中期由 team 用户调研决定）
- ⏸ Twenty 自托管 docker-compose 起服务（+M4 P1-11 · team-shopping-list）
- ⏸ Team 提供 `TWENTY_API_KEY` + `TWENTY_ENDPOINT_URL` secrets（+M4 P1-12 · team-shopping-list）
- ⏸ M5 migration `NNNN_add_twenty_sync_state.sql`（M5 W-D 分配）

**装 M6+ 双向同步需**：
- ⏸ Twenty inbound webhook signature 验证（Twenty 侧文档确认）
- ⏸ approval-router (D-M2-13) 支持 Twenty stage change intent
- ⏸ paperclip agent 树 → Twenty Company 首次全量同步（历史数据迁移策略）

---

## 9. Cross-references

- **手册**：`handoff/05-施工手册-M3+.md` §M4-03 + §M4-DP1
- **架构**：`handoff/02-架构与决策.md` §5.6 L5-10 + §D8 CRM 双轨
- **姊妹 plugin**：`packages/plugins/hubspot-breeze-plugin/` (M2 W8-D3 · 25 tests)
- **Pattern 参照**：`rolling-summary.md` §2 Pattern-2 (manifest.webhooks) + Pattern-3 (fetchImpl) + Pattern-4 (pure orchestrator · mapping 可参考此思路)
- **规范**：`06-规范.md` §2.1 Data 层缓冲（Twenty sync state 表命名）· §7 Migration（M5 落地）
- **决策规则**：`m3-decision-record.md` (rules-frozen · D-M3-03 CRM 使用率 → 影响 M4-DP1)
- **Twenty 上游**：https://github.com/twentyhq/twenty · 52k star · MIT license · GraphQL-first · TypeScript

---

## 10. Status 追踪

| 里程碑 | 状态 | 关联 |
|---|---|---|
| PRD 撰写（本文件）| ✅ M4-03 kick-off | 手册 §M4-03 |
| package.json + tsconfig + vitest.config | ⏸ M4-03 skeleton（同 kick-off · 一并交付） | Pattern 沿用 hubspot-breeze |
| M4-DP1 分叉决定 | ⏸ team 用户调研 · M4 中期 | +M4 blocker |
| Twenty docker-compose 起 | ⏸ team 侧动作 | +M4 P1-11 shopping list |
| Team 补 secrets | ⏸ TWENTY_API_KEY + TWENTY_ENDPOINT_URL | +M4 P1-12 shopping list |
| M5 MVP（若 M4-DP1 = A/C）| ⏸ M5 起装配 | client + mapping + worker + 100+ tests |
| M6+ 双向同步 | ⏸ M6+ | approval-router hook + inbound webhook |
