# L4 Genome + AlphaEvolve loop plugin · Kick-off PRD (M5-03)

**Status**: ⏸ **PRD + skeleton only · 无实现**（per handbook §M5-03: "L4 环骨架 kick-off · 3-4 周"）

**关键**: **1 项 M5-DP1 TODO(user-decision)** · 首个 pattern 定义（**认知设计决策 · 必须人工确认**）

**Component IDs**: L6-01 (Genome 库) + L6-02 (AlphaEvolve 环骨架)

**编号锚点**: 手册 §M5-03 · CLAUDE.md 的 L4 进化层 · AlphaEvolve DeepMind 论文

---

## 1. Why · L4 是"AI 公司能持续自我进化"的核心机制

**目标**：把 L1-L5 层各种 agent/plugin 的"执行结果 + 成功/失败信号"沉淀为**可复用 pattern** · 通过 evaluator agent 定期评估 pattern 质量 · 让下一轮执行能"复用已成功模式"→ 形成"做完 → 做对 → 做好"完整闭环

**Genome 库定位**（L6-01）:
- 存储所有已捕获的可复用 pattern
- 每 pattern = `plugin_entities(entity_type='genome_pattern')` 一行（Data 层缓冲 · Pattern-11 shadow · 不改 core）
- Pattern 包含：feature（何时触发）+ action（做什么）+ evidence（成功证据 · 引用 activity_log）+ score（当前 pattern 质量分）

**AlphaEvolve 环骨架定位**（L6-02）:
- Routine cron 定期扫 activity_log · 抽 candidate pattern · 提交 evaluator agent 打分
- Evaluator agent 走 heuristic + LLM judge 混合 · 打分 [0, 1] · 高分 pattern 进 Genome 库 · 低分丢弃
- 循环：**抽 → 评 → 沉淀 → 下次执行推荐** · AlphaEvolve DeepMind 论文 pattern

**与 M1-M4 已有的关系**：
- **activity_log (L0)** · **全部 mutation 事件源** · Genome 库的输入
- **plugin_entities (L0)** · Pattern 存储的 shadow · 复用 Pattern-11
- **routines (L0)** · AlphaEvolve loop 的定时基础设施 · 复用 cold-email pattern (M4-02)
- **magis-lite (M3-02)** · 4-role orchestrator 已在 sequential pattern 复用 · 是 candidate pattern 源之一
- **agentless-triage skill Mode B (M4-04)** · issue-tree 是 candidate pattern 源之一
- **campaign-workflow (M2 W7-D1)** · Campaign 成功案例是 candidate pattern 源
- **cognee/mem0 (L2)** · 与 Genome 库互补：cognee 是**语义记忆** · Genome 是**行为模式** · 层次不同 · 不冲突
- **SWE-Bench-CL runner (M5-04 · benchmarks/swe-bench-cl/)** · 验证 L4 环有效性的 benchmark

---

## 2. 人工决策点 · TODO(user-decision)

### 2.1 M5-DP1 · 首个 pattern 定义 · TODO(user-decision)

**手册 §M5-DP1 明说**：这是**认知设计决策 · 必须人工确认** · 三个方向 · 各有优劣 · 由 user 决定 M5 首个捕捉 pattern 类型：

| 分叉 | 定义 | 首个 pattern schema 示例 | 数据源 | 适用条件 |
|---|---|---|---|---|
| **A · 代码 pattern**（SWE 类）| 高质量修复模板 | `stale cache → invalidate + refetch` · `race condition → mutex or atomic op` · `import 缺失 → import + rebuild` | agentless-triage skill Mode B 完成 + issue closed with verdict=pass | 若 M4-04 Agentless Mode B 已跑数据 · 建议 A |
| **B · 营销 pattern**（Campaign 类）| 成功投放模板 | `文案骨架 + 时段 + 定向组合` · `A/B 变体 winner 特征` | campaign-workflow (M2 W7-D1) 完成 + campaign_end · 且有 verified conversion 数据 | 若 M4-02 cold-email + campaign-workflow 有真投放数据 · 建议 B |
| **C · 组织 pattern**（MAGIS 类）| 何时 escalate 决策规则 | `sub-issue N 未完成 X 时间 → escalate to Manager` · `QA verdict=fail_infra → 顺序 retry vs 立即人工` | MAGIS-lite (M3-02) / MetaGPT (M4-01) 完成 + parent issue closed | 若 M4-01 β 档已装 · 建议 C（组织层 pattern 稀缺 · 战略价值高）|

**建议 default**（等 user override）：**A · 代码 pattern**
- 理由：agentless-triage Mode B (M4-04) 已就位 · 数据源最快 unblock · SWE-Bench-CL runner (M5-04) 是 A 分叉的天然验证 · 闭环最短
- Trigger override：若 M5 中期发现 SWE agent 已够好 · pattern 空间小 · 切 B（营销层 pattern 更多）· 或 C（组织层 pattern 战略价值大）

**产出要求**（手册 §M5-DP1）：M5 结束时 `handoff/reports/decisions-m5.md` §L4-first-pattern 必填：
- 首个 pattern 方向（A/B/C）
- 首个 pattern schema 完整定义（feature / action / evidence / score 4 字段的具体格式）
- 首个 pattern 的**评估 rubric**（evaluator agent 打分依据）
- 首个 pattern 的**采样源**（activity_log 哪些 action / 哪些 kind / 时间窗）

---

## 3. What · plugin 结构

**plugin id**: `ai-company.paperclip-plugin-genome`
**版本**: `0.0.1-alpha.0` (kick-off)
**category**: `agent`（AlphaEvolve loop 是 orchestrator 语义）

### 3.1 目录结构

```
packages/plugins/genome/
├── README.md              ← 本 PRD (M5-03)
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── manifest.ts         ← manifest.webhooks + routines 声明
    ├── pattern.ts          ← Pattern entity types + Genome 库 shadow schema
    ├── pattern.test.ts
    ├── evaluator.ts        ← Evaluator agent 角色 + pure orchestrator planEvaluation
    ├── evaluator.test.ts
    ├── sampling.ts         ← 从 activity_log 抽 candidate pattern（pure function）
    ├── sampling.test.ts
    ├── worker.ts           ← onWebhook + onRoutine 分发（Pattern-2）
    └── worker.test.ts
```

### 3.2 SDK capabilities

```
capabilities: [
  "webhooks.receive",       // agent 主动上报 pattern candidate
  "plugin.state.read",      // 存 evaluator 中间状态
  "plugin.state.write",
  "activity.log.write",     // 记录 evaluation 结果
  "activity.log.read",      // AlphaEvolve 抽 candidate pattern 从 activity_log
  "entities.read",          // 读 plugin_entities(entity_type='genome_pattern') 已存 pattern
  "entities.write",         // 写新 pattern 或更新 score
  "routines.register",      // sampling-tick / evaluation-tick / decay-tick
  "issues.read",            // 从 issue 上下文补充 pattern feature 信号
]
```

### 3.3 Manifest webhooks + routines

**webhooks**（M5 装配 · agent 主动上报）：
```
webhooks: [
  { endpointKey: "report-candidate",
    displayName: "Report a candidate pattern",
    description: "agent 完成 issue 后主动上报 candidate pattern（含 feature/action/evidence）· 进 candidate 队列等 evaluator 打分" },
  { endpointKey: "query-pattern",
    displayName: "Query Genome library for applicable patterns",
    description: "agent 开工前查询"这类 issue 有哪些 pattern 可复用"· return top-K sorted by score" },
]
```

**routines**（M5 装配 · AlphaEvolve loop 的时钟）：
```
routines: [
  { key: "sampling-tick",
    schedule: "*/30 * * * *",    // 每 30 分钟扫 activity_log 抽 candidate
    description: "从 activity_log 抽最近成功 issue（closed with verdict=pass）· 提炼 candidate pattern · 入队" },
  { key: "evaluation-tick",
    schedule: "*/60 * * * *",     // 每小时评估 candidate 队列
    description: "拿队列前 N 个 candidate · evaluator agent 打分 · 高分入 Genome 库 · 低分丢弃" },
  { key: "decay-tick",
    schedule: "0 0 * * *",         // 每天 midnight
    description: "Genome 库 pattern score 衰减 · 长期不复用 pattern 分数降低 · 低于阈值归档" },
  { key: "swe-bench-cl-tick",
    schedule: "0 3 * * 0",         // 每周日 03:00
    description: "定期跑 SWE-Bench-CL 子集 · 验证 L4 环有效性 · 结果写 plugin_entities · 与 SWE-Bench-CL runner (M5-04) 联动" },
]
```

---

## 4. Pattern schema · plugin_entities shadow

**存储路径**（复用 Pattern-11 shadow · 06 §2.1）:
- `plugin_entities(entity_type='genome_pattern')` · 无独立表 · 用 paperclip 内置 entities 表
- shadow 表命名 `plugin_ai_company_genome_pattern_state` (若需要 index)

**Pattern JSON schema**（存 plugin_entities.data 字段）:

```typescript
export interface GenomePattern {
  id: string;                 // uuid · pattern_<slug>
  category: 'code' | 'marketing' | 'organization';   // 对应 M5-DP1 A/B/C
  version: number;            // pattern 迭代版本
  
  // feature: 何时应用这个 pattern（trigger 判定）
  feature: {
    activity_kind: string[];  // e.g. ['issue.closed', 'test_run.pass']
    issue_labels?: string[];  // e.g. ['bug', 'cache']
    keywords?: string[];      // pattern 触发关键词
    surrounding_context?: string;  // 上下文描述（人可读）
  };
  
  // action: 做什么（prompt 或 tool call template）
  action: {
    kind: 'prompt_template' | 'tool_call_sequence' | 'skill_invocation';
    template: string;         // 具体内容（引用变量 {{issue.body}} / {{issue.title}}）
    references?: string[];    // 引用的 skill/plugin
  };
  
  // evidence: 成功证据（引用 activity_log）
  evidence: Array<{
    activity_log_id: string;
    issue_id: string;
    outcome: 'success' | 'partial' | 'failure';
    ts: string;
  }>;
  
  // score: 当前 pattern 质量分（evaluator 打）
  score: {
    current: number;          // [0, 1]
    updated_at: string;
    reason: string;           // evaluator 打分理由
    application_count: number; // 被应用次数
    success_rate: number;     // 应用后的成功率
  };
  
  // 治理
  metadata: {
    created_by: 'sampling' | 'user_manual' | 'evaluator';
    origin_activity_log_id?: string;
    tags?: string[];
    archived?: boolean;       // decay-tick 归档
  };
}
```

---

## 5. Evaluator agent 角色

**评估流程**（pure orchestrator · Pattern-4）:

```
candidate pattern 入队
  ↓
evaluator agent hire · 单次执行 · adapter = claude-code / codex（视 category）
  ↓
输入：candidate.feature + candidate.action + candidate.evidence（含 last 5 应用记录）
  ↓
LLM judge + heuristic 打分 · 5 维度：
  1. specificity  · feature 精准度（避免过泛匹配）
  2. transferability · action 是否可迁移到相似 context
  3. evidence_strength · success 数量 + 一致性
  4. risk · 应用 pattern 带来的风险（如硬编码 / 破坏 idempotency）
  5. novelty · 是否是 Genome 库已有 pattern 的重复
  ↓
score = weighted mean(5 维度) 
  ↓
score ≥ 0.7 → 入 Genome 库
score ∈ [0.4, 0.7) → 观察队列 · 下次 evaluation-tick 再评
score < 0.4 → 丢弃 · activity_log 记 evaluated_and_rejected
```

**Adapter 选择**（视 category）：
- A · 代码 pattern → `deep-swe` (claude-code) 或 `fast-fix` (codex)
- B · 营销 pattern → `content-marketer` skill 复用 + `deep-swe`
- C · 组织 pattern → `deep-swe` + magis-lite Manager role prompt

---

## 6. 装配路径与依赖

**装配路径**：SDK canonical path · 复用 Pattern-2/4/11 · 无 core patch

**装配时机**（per 02-架构 §5.7）：`M3+ 3-4 周` · **本 M5 只做 kick-off PRD + skeleton**
- **M5** ✅：PRD (本文件) + skeleton (package.json + tsconfig + vitest.config)
- **M5 起装配**（若 M5-DP1 首个 pattern 定义已定）：pattern.ts + evaluator.ts + sampling.ts + worker.ts + 60+ tests
- **M6**（handbook §M6-04 · Genome 库 pattern 数目 ≥ 5 里程碑）：跑 sampling-tick + evaluation-tick 收 pattern
- **M7-M8**：query-pattern webhook 与 agent 装配层集成 · 让 agent 开工前查 Genome 库

**依赖**：
- ✅ paperclip plugin_entities (L0) · routines (L0) · activity_log (L0)
- ✅ magis-lite plugin (M3-02) · pattern candidate 源之一
- ✅ agentless-triage skill Mode B (M4-04) · 代码 pattern 源
- ✅ campaign-workflow (M2 W7-D1) · 营销 pattern 源
- ⏸ M5-04 SWE-Bench-CL runner MVP · 验证 L4 环有效性
- ⏸ M5-DP1 首个 pattern 定义 · 决定 category 起手

**上下游 revisit 触发**：
- 若 M5-DP1 = A（代码 pattern）· pattern.ts 初期 schema 走代码专属字段（e.g. 语言 / 框架 / 库）· B/C 走通用字段
- 若 M6 复审 R5（外挂爆炸 · Genome 库 pattern > 100）· decay-tick 频率提升
- 若 SWE-Bench-CL runner 显示 L4 环有效性 < 5%（Adaptation Rate）· revisit evaluator 打分权重

---

## 7. TODO(team-verify)

- 无 real world action 依赖 · 全 SDK 内部
- 装配阶段 team verify：activity_log query performance（若 sampling-tick 扫太慢 · 加 index · 走 shadow 表）
- evaluator LLM judge 打分一致性（跑 10 个 candidate · team review 3 个人的一致性 · 若 > 0.6 通过）

---

## 8. Cross-references

- **手册**：`handoff/05-施工手册-M3+.md` §M5-03 + §M5-DP1
- **架构**：`handoff/02-架构与决策.md` §5.7 L6-01/02
- **CLAUDE.md**：L4 进化层概念参考 · `.claude/skills/可靠执行-模式提取`
- **上游研究**：AlphaEvolve DeepMind 论文
- **姊妹 benchmark**：`benchmarks/swe-bench-cl/` (M5-04 MVP · 验证 L4 有效性)
- **Pattern 参照**：Pattern-2 + Pattern-4 + Pattern-11 复用
- **Data 层规范**：`06-规范.md` §2.1 shadow 表命名

---

## 9. Status 追踪

| 里程碑 | 状态 |
|---|---|
| PRD + skeleton | ✅ M5-03 kick-off (本文件 + 3 配置文件) |
| M5-DP1 首个 pattern 定义会议 | ⏸ user · M5 中期 |
| M5 pattern.ts + evaluator.ts + sampling.ts + worker.ts | ⏸ 装配启动条件：M5-DP1 已定 |
| M6 sampling-tick + evaluation-tick 跑起来 | ⏸ Genome 库 pattern 数目 ≥ 5 里程碑 |
| M7-M8 query-pattern 与 agent 装配层集成 | ⏸ M7-M8 深化 |
