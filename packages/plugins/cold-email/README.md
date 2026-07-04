# E4 · 开源冷邮件 agent · Kick-off PRD (M4-02)

**Status**: ⏸ **PRD only · 无实现**（per handbook §M4-02："E4 开源冷邮件 agent 立项 kick-off · 建 `packages/plugins/cold-email/` + PRD + issue 状态机映射 + routines cron 定义 + question HITL 设计"）

**关键**: **3 项 M4-DP2 TODO(user-decision) · 需人工产品/合规决策**（handbook §M4-DP2 明说"目标行业 + 冷启动数据源 + 邮箱发送渠道 · 产品决策 = 必须人工确认"）

**Component ID**: L5-12 (per `handoff/02-架构与决策.md` §5.6)

**编号锚点**: 手册 §Month 4 M4-02 · 差异化护城河 E4 · S8 §"E4 开源冷邮件"

---

## 1. Why · 为什么做这个 agent

**目标**：让 ai-company AI 公司自主运营**冷邮件 outreach**（cold email outbound sequence）· 作为 M3-M8 三大差异化护城河之一（E1 中文短视频 + E4 冷邮件 + Twenty CRM）。

**为什么 PaperClip 是冷邮件的完美承接底座**（per S8）：
- **`issues` 单赋值人 + 原子 checkout**：一个 outreach sequence = 一个 issue tree · 每封邮件的发送 / warmup / reply 都是子 issue · 天然 audit trail
- **`routines` (业务级 cron)**：warmup 阶段的定时发信 · reply 检查 · bounce sweeping · 全走 routines · 无需自建 scheduler
- **`adapter.question` 结构化 HITL**：邮件 draft 待 board 批 · 复杂 reply 待 human 决定 · 全走 native question 字段（L0 惊喜之一 · 02-架构 §3.3 C-G3-04）
- **`plugin_ai_company_*` 影子表 + FK to core**：冷邮件的收件人 / 序列状态 / bounce reason 走 plugin 表 · 不改 core（红线 1）
- **闭源 SaaS 涨价 + 隐私法规窗口打开**：Apollo / Instantly / Lemlist 定价年年涨 · 且 GDPR / CAN-SPAM / 中国个保法数据主权要求日增 · 开源自主是差异化窗口（S8 §E4）

**为什么"业务价值最高的差异化项"**（per handbook §M4-02 原文）：
- 冷邮件是 B2B SaaS 早期 GTM 主要通路（不是 SEO / 不是社媒 · 是直接 outreach）
- 承接底座天然 · 无需自建复杂 workflow engine（PaperClip 的 issue+routines+question 三件套已经就位）
- 差异化于 SaaS 竞品的路径：自主 · 数据主权 · 开源可 fork

**与 M1-M3 已有的关系**：
- **paperclip-plugin-lark (M1 W3-W4)**：草稿 draft 批准 / reply 转达 走飞书交互卡片（DEV-4）
- **campaign-workflow (M2 W7-D1)**：Campaign Workflow 产出 blog + social + ads · **冷邮件是 outbound 的独立通路** · 不重叠但可共享 lead 数据源
- **hubspot-breeze-plugin (M2 W8-D3)** + **twenty-crm (M4-03)**：reply 收信后 → 沉淀到 CRM · 走哪个由 M4-DP1 决定
- **wewrite / content-marketer (M2 W8-D1)**：wewrite 生成中文公众号图文 · 冷邮件的**中文分支**（M4-DP2 = B）复用 wewrite 的中文 LLM (火山方舟) 生成邮件正文
- **C8 安全 middleware (M1 W4 · errata E-6)**：outbound 前置装饰 · 冷邮件需加**合规专属检查**（GDPR / CAN-SPAM / 中国个保法 · 见 §7）
- **approval-router (M2 W8-D4 · D-M2-13)**：draft → send 之间的 approval gate

---

## 2. 人工决策点 · TODO(user-decision)

**手册 §M4-DP2 明说**：以下 3 项**不是 AI 可自主项** · 必须召集用户会议决定。

### 2.1 目标行业 · TODO(user-decision)

**手册 §M4-DP2 分叉动作**：

| 分叉 | 目标客群 | 数据源 default | 邮件发送渠道 default | 合规重点 |
|---|---|---|---|---|
| **A · B2B SaaS 早期开发者 outreach** | GitHub active repo maintainer · Product Hunt launcher · SaaS 早期 dev/PM | GitHub API (repo activity) + LinkedIn scrape | SendGrid / Amazon SES / 自有 SMTP | CAN-SPAM (US) · GDPR (EU) |
| **B · 中文 B2B** | 中文 SaaS/独立开发者 · 本地企业名录 · 微信生态 | 火山方舟企业数据 + 天眼查 API + 微信生态 | 阿里云邮件推送 / 腾讯邮件 / 自有 SMTP | 中国个保法（PIPL）· 反 spam 条例 |
| **C · 通用型 outreach 工具** | 无行业假设 · 用户自定义 prompt template + 数据源 CSV import | user-provided CSV / API · 无内置 default | user-configured (通用 SMTP + SendGrid 双支持) | user 自负 · plugin 只提供合规检查 middleware |

**建议 default**（等用户 override）：**A · B2B SaaS 早期开发者 outreach**
- 理由：与 ai-company AI SaaS 定位对齐 · GitHub 数据源 API 稳定 open · SendGrid/SES 全球通用 · CAN-SPAM/GDPR 合规规则明确
- 关联 user memory：user_role = 创业者+多项目规划者 · project_ai_saas_company = 6 人 · global self-serve · 探索苏州混合结构 → A 与 global self-serve 直接对齐
- Trigger for override：M4 中期 team 用户调研发现 target 客户以中文 SMB 为主 → 切 B · 客户强调"自建 CRM 灵活"→ 切 C

### 2.2 冷启动数据源 · TODO(user-decision)

**依赖 §2.1 分叉** · 各分叉的数据源 default 见上表。

**独立于分叉的问题**（还是需要用户拍板）：
- **首批 seed list 大小**：100 / 500 / 1000 / 5000？
  - 建议 default：**200 seed** · 够跑 v0.1 warmup + 度量 reply rate · 不超合规风险窗口
- **合规豁免声明来源**：
  - opt-in 明确记录？（GDPR 强制）
  - 已有商业关系？（CAN-SPAM 允许无 opt-in outreach）
  - 建议 default：**要求 seed list 提供 opt-in 记录或 business relationship justification** · 无者 skip · 由 C8 冷邮件 middleware 前置校验
- **数据保存周期**：reply/bounce/unsubscribe 记录保留多久？
  - 建议 default：**24 个月**（符合 GDPR 6-year rule + PIPL 3 年 · 取交集）

### 2.3 邮箱发送渠道 · TODO(user-decision)

**手册 §M4-02 原文**："PRD 定稿 · 含**目标行业 + 数据源 + 邮箱发送渠道**（自有 SMTP / SendGrid / SES / 第三方）三大硬约束"

| 渠道 | Pros | Cons | 适用分叉 |
|---|---|---|---|
| **自有 SMTP** | 完全数据主权 · 无外部依赖 | SPF/DKIM/DMARC 配置门槛 · deliverability 需自建 warmup 池 | C 通用型 · 大企业客户 |
| **SendGrid** | 生态成熟 · deliverability 好 · API 简洁 | SaaS 依赖 · 起步免费但涨价 · 隐私政策 opt-in 复杂 | A · 全球 B2B SaaS |
| **Amazon SES** | 便宜 · reliable · 可与 AWS 生态整合 | 需自建 warmup · deliverability 初期波动 | A · 有 AWS 依赖客户 |
| **阿里云邮件推送 / 腾讯邮件** | 中国境内合规好 · 低延迟 | 需实名 · SPF/DKIM 需备案 | B 中文 B2B |
| **降级模式**：**"生成草稿 + 用户手动发"** | 无 deliverability / SPF-DKIM 门槛 · v0.1 快速上线 | 无自动化优势 · 不 scale | 所有分叉 v0.1 · handbook §M4 "典型问题诊断"明确降级方案 |

**建议 default**（等用户 override）：**v0.1 走降级模式 · v0.2 起接 SendGrid**
- 理由：v0.1 kick-off 阶段先跑通"agent → issue 状态机 → draft → approval → 手动发送" · 不因 SPF/DKIM 配置延迟 M5 装配（handbook 典型问题诊断原文）
- 手册风险 2 Plan B："E4 v0.1 只做"内部工具版"（用户自己发给自己的联系人）· public SaaS 版推 M8+"
- Trigger for override：M6 前 team 有专职 deliverability 工程师 + SPF/DKIM 就绪 → 切 SendGrid 或 SES

**产出要求**（手册 §M4-DP2）：**M4 结束时** `handoff/reports/decisions-m4.md` 必填：
- 目标行业最终选择（A / B / C · 附用户调研数据）
- 数据源最终选择 + seed list 大小 + 保留周期
- 邮箱渠道最终选择（v0.1 / v0.2 起接哪个）
- 合规策略（opt-in 或 business-justification 二选一）

---

## 3. What · plugin 结构

**plugin id**: `ai-company.paperclip-plugin-cold-email`
**版本**: `0.0.1-alpha.0` (kick-off)
**category**: `agent`（不是 `connector` · 因为它是**主动 outreach agent** · 不是被动接线）

### 3.1 目录结构（沿用 Pattern-2/-3/-4 + 新增 state machine）

```
packages/plugins/cold-email/
├── README.md              ← 本 PRD (M4-02)
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── manifest.ts         ← manifest.webhooks + routines cron 声明（M5+ 装配）
    ├── state-machine.ts    ← issue 状态机 pure function（Pattern-4 · draft → warmup → sending → replied/bounced）
    ├── state-machine.test.ts
    ├── orchestrator.ts     ← planColdEmailSequence(brief) → parent issue + child sequence steps（Pattern-4）
    ├── orchestrator.test.ts
    ├── compliance.ts       ← 合规检查（opt-in / GDPR / CAN-SPAM / PIPL · Pattern-8 allowlist）
    ├── compliance.test.ts
    ├── email-client.ts     ← 邮件发送 client · fetchImpl injection（Pattern-3）· 支持 SendGrid/SES/SMTP 三接口
    ├── email-client.test.ts
    ├── worker.ts           ← onWebhook + onRoutine 分发（Pattern-2）
    └── worker.test.ts
```

### 3.2 SDK capabilities 声明

```
capabilities: [
  "webhooks.receive",       // agent 主动触发 sequence create webhook
  "plugin.state.read",      // 存 sequence state · warmup pool · reply matching
  "plugin.state.write",
  "activity.log.write",     // 全部 mutation 记 activity_log
  "http.outbound",          // 邮件 API / GitHub API / LinkedIn scrape · 走 safeOutbound
  "secrets.read-ref",       // SENDGRID_API_KEY / AWS_SES_KEY / SMTP_PASS / GITHUB_TOKEN
  "issues.read",            // sequence tree 是 issue 树
  "issues.write",           // draft/reply/bounce 子 issue 创建
  "routines.register",      // warmup cron / reply-sweep cron / bounce-sweep cron
  "actions.register",       // UI performAction: 手动发送草稿 · 手动 unsubscribe
]
```

### 3.3 Manifest webhooks（M5+ 装配）

```
webhooks: [
  { endpointKey: "create-sequence",
    displayName: "Create cold-email outreach sequence",
    description: "POST body { seed_list_id, target_industry, template_id } → parent issue + child sequence steps" },
  { endpointKey: "handle-reply",
    displayName: "Inbound reply webhook (from email provider)",
    description: "POST body { message_id, sender, body, headers } → match to sequence · move state to replied · question HITL" },
  { endpointKey: "handle-bounce",
    displayName: "Inbound bounce/complaint webhook",
    description: "POST body { message_id, bounce_kind } → move state to bounced · trigger unsubscribe" },
  { endpointKey: "unsubscribe",
    displayName: "Public unsubscribe endpoint (GDPR/CAN-SPAM required)",
    description: "GET /unsubscribe?token=... → mark recipient as unsubscribed · idempotent" },
]
```

### 3.4 Manifest routines（M5+ 装配）

```
routines: [
  { key: "warmup-tick",
    schedule: "*/15 * * * *",   // 每 15 分钟检查 warmup pool
    description: "Sends the next drop from warmup pool per pacing rules (max N/day/domain)" },
  { key: "reply-sweep",
    schedule: "0 * * * *",       // 每小时扫 IMAP / API 收件箱找漏掉的 reply
    description: "Sweeps IMAP or email API for replies not caught via webhook · idempotent" },
  { key: "bounce-sweep",
    schedule: "0 6 * * *",       // 每天 06:00 扫 bounce log
    description: "Aggregates bounces from provider · updates recipient state" },
  { key: "compliance-audit",
    schedule: "0 0 * * 0",       // 每周日 midnight
    description: "Runs GDPR/PIPL retention audit · removes records beyond retention window" },
]
```

---

## 4. Issue 状态机映射（核心设计）

**核心**：每个 outreach **sequence 是一个 parent issue** · 每次发信 / warmup / reply / bounce 是**子 issue** · 状态转移 = issue.status + shared plugin_state。

### 4.1 状态图（parent · sequence-level）

```
                  ┌──────────────────────┐
                  │       DRAFT          │  ← create-sequence webhook 触发
                  └──────────┬───────────┘
                             │ approval (hire_reviewer or human)
                             ▼
                  ┌──────────────────────┐
                  │       WARMUP         │  ← warmup-tick routine 定时发少量
                  └──────────┬───────────┘
                             │ warmup 完成（发送 N 封后 deliverability score ≥ 阈值）
                             ▼
                  ┌──────────────────────┐
                  │       SENDING        │  ← 全量发送 · N/day/domain 限速
                  └────┬──────┬──────┬───┘
                       │      │      │
             ┌─────────┘      │      └─────────┐
             │                │                 │
             ▼                ▼                 ▼
     ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
     │    REPLIED   │  │    BOUNCED   │  │  COMPLETED   │
     │ (need HITL   │  │ (log · move  │  │ (all sent    │
     │  for next)   │  │  to unsub)   │  │  · timeout)  │
     └──────┬───────┘  └──────────────┘  └──────────────┘
            │
            ▼
      question HITL → 转 CRM / continue / mark 阶段
```

### 4.2 子 issue 类型（sequence step-level）

| kind | 触发 | 状态转移 | assigneeAgent |
|---|---|---|---|
| `draft-generation` | sequence create | closed with `plugin_state.draft` | 主 cold-email agent (Claude) |
| `send-attempt` | warmup-tick / send-loop | closed with `plugin_state.message_id + sent_at` | email-sender agent (routine-owner) |
| `reply-handle` | handle-reply webhook | pending → routes to `question HITL` → closed | 主 cold-email agent |
| `bounce-handle` | handle-bounce webhook | closed with `plugin_state.recipient.unsubscribed=true` | email-sender agent |
| `unsubscribe-handle` | /unsubscribe endpoint | closed with `plugin_state.recipient.unsubscribed=true` | routine-only (无 agent · pure server) |
| `compliance-audit-log` | compliance-audit routine | closed with retention report | routine-only |

### 4.3 状态机 pure function（Pattern-4 复用）

```typescript
// state-machine.ts · 复用 magis-lite planMagis + campaign-workflow 的 pure orchestrator pattern

export interface SequenceInput {
  seedListId: string;
  targetIndustry: 'B2B-SaaS-dev' | 'zh-B2B' | 'generic';   // = M4-DP2 分叉
  templateId: string;
  senderEmail: string;
  channel: 'draft-only' | 'sendgrid' | 'ses' | 'smtp' | 'aliyun' | 'tencent';
  pacing: { maxPerDayPerDomain: number; warmupTargetSent: number; };
}

export interface SequencePlan {
  sequenceId: string;
  parentIssue: { title: string; body: string; };
  seedRecipients: RecipientRef[];
  warmupPlan: WarmupStep[];
  sendingPlan: SendStep[];
  complianceRequirements: ComplianceCheck[];
  warnings: string[];
}

// planSequence · 100% pure · 无 IO · 无时间 · 无随机（Pattern-4 · fully testable）
export function planSequence(input: SequenceInput): SequencePlan { ... }

// nextState · 状态机 transition · 也 pure
export function nextState(current: SequenceState, event: SequenceEvent): SequenceState { ... }
```

**Tests**（M5 阶段 · 60+ tests · 沿用 campaign-workflow 52 tests + magis-lite 42 tests 规模）：
- planSequence · 3 industries × 5 seed sizes × 4 channels = 60 combos · determinism 校验
- nextState · 每条 state 转移逐条 tests · 覆盖 draft→warmup→sending→replied/bounced 5 状态 · 20+ tests

---

## 5. Routines cron 定义

**核心 4 个 cron**（§3.4 已列 · 此处细化 SLA + 幂等约束）：

| routine | schedule | SLA | 幂等键 | 备注 |
|---|---|---|---|---|
| `warmup-tick` | `*/15 * * * *` | 单次执行 < 30 秒 | `sequence_id + tick_minute` | 未发满 warmup 阈值 skip · Pattern-6 rules-frozen: warmup 阈值 = deliverability score ≥ 0.8 或 sent ≥ 50 · 二选一 |
| `reply-sweep` | `0 * * * *` | 单次执行 < 2 分钟 | `imap_uid` | 与 webhook 双写 · 用 `message_id` 去重 |
| `bounce-sweep` | `0 6 * * *` | 单次执行 < 5 分钟 | `provider_event_id` | 每天 06:00 · 避开发信黄金时段 |
| `compliance-audit` | `0 0 * * 0` | 单次执行 < 10 分钟 | `week_number` | 每周日 midnight · 依赖 retention 配置 |

**cron 语义**：走 paperclip `routines` (业务级 · 02-架构 §3.3)。**不用** `jobs.schedule`（技术级 · plugin worker 内部 · 无 audit trail）。

**question HITL 集成**（`adapter.question` · L0 惊喜之一）：
- `reply-handle` 子 issue 里 · 若 reply 内容包含"unsubscribe / please stop / 已退订"关键词 · 直接 close with unsubscribed=true · 无需 HITL
- 若 reply 内容包含"interested / more info / 请介绍"等意向 · **发 `adapter.question`** 到主 cold-email agent → agent 决定"转 CRM · 继续对话 · 手动接手"
- HITL trigger 走 lark plugin 卡片（M1 W4-D5 · DEV-4）+ approval-router (D-M2-13) 路由

---

## 6. 装配路径与依赖

**装配路径**（per handbook §M4 § L5-12）：
- SDK canonical path · manifest.webhooks + onWebhook (Pattern-2) + onRoutine · **不改 paperclip core**
- 邮件 API 走 `plugin.http.outbound` + `safeOutbound` C8 装饰（errata E-6）
- 状态机 + orchestrator 都是 pure functions (Pattern-4) · testable

**装配时机**（per 02-架构 §5.6）：`M3+ 2-3 人月` · 本 M4 只做 PRD + skeleton
- **M4** ✅：PRD (本文件) + skeleton (package.json + tsconfig + vitest.config + src stubs)
- **M5**（若 M4-DP2 分叉已定）：核心装配 · state-machine + orchestrator + email-client + compliance · 100+ tests
- **M6**（handbook §M6-02）：完整 MVP · warmup pool + reply matching + CRM 沉淀（走 M4-DP1 决定的 CRM）
- **M8+**：public SaaS 版（若 v0.1 内部工具版稳定 + 合规通过 · 手册风险 2 Plan B）

**依赖**（per 02-架构 §5.6）：
- ✅ `L5-09 HubSpot Breeze API`（M2 W8-D3）· reply → CRM 沉淀之一
- ⏸ `L5-10 twenty-crm`（M4-03 · kick-off · M5+ 装配）· 若走 M4-DP1 = A/C 分叉 · reply 走 Twenty
- ✅ `L1-02 API 层缓冲`（M1 W2）
- ✅ `L1-01 Data 层缓冲`（M1 W1）· recipient / message / bounce shadow 表
- ✅ `paperclip-plugin-lark` (M1 W3-4) · draft approval 卡片 + reply HITL question
- ✅ `approval-router` (M2 W8-D4 · D-M2-13) · draft → send 之间的 approval 路由

**上下游 revisit 触发**：
- M4-DP2 分叉最终决定（M4 中期）→ 目标行业 / 数据源 / 邮箱渠道三项定 · 无这三项无法进 M5
- M4-DP1 分叉决定（M4 中期）→ CRM 沉淀走 HubSpot 还是 Twenty
- M5 前 SendGrid/SES/阿里云 API 大变动 → email-client 表面 revisit
- 合规法规变动（GDPR / CAN-SPAM / PIPL）→ compliance.ts 规则表更新

---

## 7. 合规与 C8 middleware 集成

**核心约束**（per handbook §"风险 2 合规风险"）：

**冷邮件专属检查**（加到 C8 middleware · 前置装饰所有 email-client 出站）：

1. **opt-in / business-justification 二选一**（GDPR 5.1(a) · CAN-SPAM 已有商业关系豁免）
   - 每个 recipient 必须有 `opt_in_record` (URL + timestamp) 或 `business_justification` (合同/交易记录)
   - `compliance.ts` 前置校验 · 无者 `throw ComplianceError · 拒绝发送`

2. **unsubscribe 强制**（GDPR 21 · CAN-SPAM §6）
   - 每封邮件必含 `/unsubscribe?token=<hmac>` 链接
   - 点击 unsubscribe → 24 小时内 recipient 状态更新 · Pattern-4 nextState 强制
   - `webhooks.unsubscribe` endpoint 处理 idempotent

3. **发信频率限制**（Deliverability + Reputation）
   - `max_per_day_per_domain = 50`（default · 用户可调）
   - `max_per_hour = 5`
   - `warmup_pool_daily_start = 5, warmup_pool_daily_step = +5` （第 1 天 5 封 · 第 2 天 10 封 · ...）
   - 超过限额直接 skip · 记 `activity_log(action='cold_email_throttled')`

4. **PIPL 中文分支专属**（M4-DP2 = B 时激活）
   - 首次发信必须"简短陈述来源" · 例："您好，因您在 XX 招聘平台公开的信息..."
   - retention 3 年上限（PIPL Art 47）· 与 GDPR 6 年取交集 = 3 年
   - 不发国境外 · 或明确告知（PIPL Art 38）

5. **CAN-SPAM 美国分支专属**（M4-DP2 = A 时激活）
   - 发件人物理地址必须在 footer 显示（CAN-SPAM §5(a)(5)）
   - "COMMERCIAL"/"ADVERT" subject 前缀非强制（但推荐）
   - `secrets.SENDER_PHYSICAL_ADDRESS` · plugin config 必填

**降级模式**（v0.1 · handbook §"典型问题诊断"原文）：
- v0.1 只做 draft 生成 + 用户手动发送 · **完全绕过 SPF/DKIM 配置门槛**
- v0.1 仍然强制合规检查（compliance.ts）· draft 输出前 opt-in / justification 校验必过
- 手动发送不 skip · 只是不自动 send · reply/bounce/unsubscribe 仍走 webhook + routine 追踪
- v0.2 起（M6+）接第一个 API 渠道（SendGrid default）· deliverability 就绪后再打开 warmup automation

---

## 8. Test 计划（沿用 Pattern-3 + Pattern-4 + Pattern-7 + Pattern-8）

**M4 kick-off 阶段**：仅 skeleton · 0 test（package.json + tsconfig 就绪）

**M5 起装配**（若 M4-DP2 已定）目标 tests：
- `state-machine.test.ts`：nextState transition 表 · 20+ tests · deterministic
- `orchestrator.test.ts`：planSequence · 3 industries × 5 seed × 4 channels = 60 combos + edge cases · 50+ tests
- `compliance.test.ts`：opt-in 校验 · GDPR/CAN-SPAM/PIPL 分支表 · unsubscribe 幂等 · 30+ tests
- `email-client.test.ts`：fetchImpl injection · SendGrid/SES/SMTP/阿里云 各 5 case · 20+ tests
- `worker.test.ts`：manifest.webhooks 分发 (Pattern-2) · 4 webhooks × 3 case = 12+ tests + routine 分发 4 case = 16+ tests

**总目标 M5 完成**：**130+ tests 全绿** · deterministic · 无真 API 调用 · 全 stub

---

## 9. 装配 caveat

**已知 caveat**（本 kick-off 阶段捕获 · 装配阶段需回头对齐）：

1. **SPF/DKIM/DMARC 配置门槛高**：v0.1 走"draft + 手动发"降级规避（handbook §"典型问题诊断"原文）· v0.2 起装 SendGrid 前 team 需完成 SPF/DKIM/DMARC 配置
2. **邮件 API 稳定性差异**：SendGrid / SES / 阿里云的 webhook 事件 shape 不同 · email-client 需**内部规整化**为统一 `EmailEvent` shape · 装配前 audit 三家 webhook doc
3. **GDPR 6-year vs PIPL 3-year retention 冲突**：取交集 = 3 年（M4-DP2 = A/B 都用 3 年）· C 通用型允许用户自定义但下限 90 天
4. **降级模式实际操作**：v0.1 "draft + 手动发"需 team 有专职操作员每天点几次"发送"按钮 · 加入 +M4 P1 shopping list
5. **仿真测试 vs 真实 deliverability**：M5 装配 100+ tests 全 stub · 但真 deliverability 只能真跑测（跑一批到内部账号 monitor bounce/open rate）· M6 装 warmup 前必须真跑一次 baseline

---

## 10. 依赖 & 前置

**装 M5 MVP 需**：
- ✅ SDK Pattern-2 + Pattern-3 + Pattern-4 + Pattern-8（M2/M3 已多次复用）
- ✅ C8 safeOutbound middleware（M1 W4）
- ✅ approval-router (D-M2-13)
- ✅ paperclip-plugin-lark (draft approval 卡片)
- ⏸ M4-DP2 分叉决策（目标行业 / 数据源 / 邮箱渠道）· team 决策会议
- ⏸ M4-DP1 分叉决策（reply 沉淀到 HubSpot 还是 Twenty）
- ⏸ Team 提供邮件 API secret（v0.1 无需 · v0.2 起需 SENDGRID_API_KEY 或对应）
- ⏸ Team 提供数据源 secret（GITHUB_TOKEN / LINKEDIN_API / 火山方舟 · 视 M4-DP2 分叉）
- ⏸ M5 migration `NNNN_add_cold_email_state.sql`（recipient / message / bounce shadow 表）

**装 M6+ full flow 需**：
- ⏸ SPF/DKIM/DMARC 配置 (team 侧 · deliverability 工程师)
- ⏸ v0.1 内部工具版稳定运行 1 个月 · reply/bounce rate 度量 baseline
- ⏸ 合规法务 review PRD §7（GDPR/CAN-SPAM/PIPL）

---

## 11. Cross-references

- **手册**：`handoff/05-施工手册-M3+.md` §M4-02 + §M4-DP2 · §"典型问题诊断" · §M6-02 (完整 MVP 时机)
- **架构**：`handoff/02-架构与决策.md` §5.6 L5-12 · §7 冷邮件 outreach · §D2 补红旗（红旗 3 outbound 部分）
- **姊妹 plugin**：`packages/plugins/chinese-video/README.md` (M3-03 · E1 kick-off) · pattern 同（TODO(user-decision) + kick-off PRD-only 结构）
- **参照 plugin**：`packages/plugins/magis-lite-plugin/src/orchestrator.ts` (M3-02 · Pattern-4 pure orchestrator) · `packages/plugins/campaign-workflow/` (M2 W7-D1 · Pattern-4 + Pattern-2)
- **CRM 沉淀**：`packages/plugins/hubspot-breeze-plugin/` (M2 W8-D3) + `packages/plugins/twenty-crm/` (M4-03 · kick-off)
- **合规参考**：GDPR Art 5/6/21 · CAN-SPAM §5-6 · PIPL Art 38/47
- **Pattern 参照**：`rolling-summary.md` §2 全部 8 pattern（本 plugin 会复用 P1/2/3/4/7/8 共 6 项）
- **规范**：`06-规范.md` §2.1 Data 层缓冲（cold-email shadow 表）· §6 Secrets（邮件 API key）· §7 Migration（M5 落地）

---

## 12. Status 追踪

| 里程碑 | 状态 | 关联 |
|---|---|---|
| PRD 撰写（本文件）| ✅ M4-02 kick-off | 手册 §M4-02 |
| package.json + tsconfig + vitest.config | ⏸ M4-02 skeleton（同 kick-off · 一并交付） | Pattern 沿用 hubspot-breeze/magis-lite |
| M4-DP2 三项决策会议 | ⏸ team · M4 中期 | +M4 blocker（user-decision 3 项） |
| Team 补邮件 API secret（v0.2 起需） | ⏸ v0.1 免 · v0.2 起 SENDGRID_API_KEY | +M4 P1 shopping list（M6 前） |
| Team 补数据源 secret | ⏸ 视 M4-DP2 分叉 | +M4 P1 shopping list |
| Team 配 SPF/DKIM/DMARC（v0.2+ 需） | ⏸ v0.1 免 · v0.2 起 | +M4 P1 shopping list（M6 前） |
| 合规法务 review PRD §7 | ⏸ team · M4-M5 | 关键前置 |
| M5 核心装配 | ⏸ state-machine + orchestrator + email-client + compliance | 130+ tests |
| M6 完整 MVP | ⏸ handbook §M6-02 | warmup + reply matching + CRM 沉淀 |
| M8+ public SaaS 版 | ⏸ handbook §"风险 2 Plan B" | v0.1 稳定 + 合规通过 |
