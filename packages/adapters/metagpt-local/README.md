# MetaGPT adapter (external plugin) · Kick-off PRD (M4-01 · candidate A)

**Status**: ⏸ **PRD + skeleton only · 无 execute.ts 实装**（per handbook §M4-01 · rules-gated on D-M3-01/02 · M2 W8-D5 SWE-bench 三配置数据）

**Component ID**: L3-08 (per `handoff/02-架构与决策.md` §5.4 · §D5 MAGIS/MetaGPT 救回策略)

**候选并列**: 本 adapter 与 `packages/adapters/chatdev-local/` 并列为 M4-01 β 档救回 P1 双候选 · 最终装配二选一 · 由 M3-DP2 分叉决定：
- **顺利分叉** → 装 ChatDev（组织隐喻更强）
- **不顺利分叉** → 装 MetaGPT（4-role PM/Architect/Engineer/QA 完整对齐 MAGIS 论文）
- **中间态分叉** → 两条路 M6 前并行观察

---

## 1. Why · 为什么 MetaGPT

**目标**：4-role 组织树 agent 框架（PM / Architect / Engineer / QA）作为 β 档救回 P1 · 补 MAGIS-lite POC (M3-02) 的性能上限

**为什么选 MetaGPT 作候选 A**（per handbook §D5 · 02-架构 §5.4）：
- **架构映射最直接**：MetaGPT 4-role 与 paperclip agents 组织树 + parent_id 自引用天然对齐（一次 hire 4 agents · reports_to 链）
- **上游成熟**：42k+ star · MIT · 长期维护 · Python 生态
- **SOP-driven**：Standard Operating Procedure 编码可复用 · 与 paperclip routines/plugin_state pattern 兼容
- **caveat**：4-role hire 走 paperclip approvals 每次需 4× budget draw · M6 复审时 revisit（关联 D5 caveat）

**与 M3-02 MAGIS-lite POC 的关系**（重要）：
- MAGIS-lite (M3-02) 是 pure orchestrator · Sequential 4-role · deterministic tests 42 · 是"证明 4-role tree 可行"的 POC
- MetaGPT adapter 是"实装 SOTA 4-role framework"· 若 POC 顺利数据 → 说明 MAGIS-lite 已够 · MetaGPT 从 P1 降 P2（或 skip）· ChatDev 上位
- 若 POC 不顺利 → MAGIS-lite 定档"部分可用" · MetaGPT 走 P1 装配（本 adapter）

**决策依赖**（严格 gated）：
- `handoff/reports/m3-decision-record.md` D-M3-01/02 数据 → 触发 M4-01 分叉决策 → 决定装 MetaGPT 或 ChatDev
- 装配启动前必读 `handoff/reports/decisions-m4.md` §β档-decision（预留段 · rules apply 后填）

---

## 2. What · 装配路径

**装配路径**（复用 Pattern-1 · external adapter plugin · D-M2-01 第 5 次复用）：
- 走 `~/.paperclip/adapter-plugins.json` 注册 `metagpt_local` · 复用 openhands / mini-swe / swe-agent 相同路径
- 无 paperclip core patch · 无新 server route · 全走 SDK canonical path
- CLI 走 `python -m metagpt.software_company` 或 官方 `metagpt` binary
- Docker 可选（MetaGPT 支持 · 不强制 · 与 sandbox 层 L2-04 组合）

**结构（M5 起装配 · 现在 skeleton only）**：
```
packages/adapters/metagpt-local/
├── README.md          ← 本 PRD (M4-01)
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/               ← M5 起补 execute.ts + event-stream.ts + test-env.ts + index.ts
    └── .gitkeep
```

**参照实现**（M5 起写 execute.ts 时对齐）：
- `packages/adapters/openhands-local/src/execute.ts` (M3-01 · 28 tests)
- `packages/adapters/swe-agent-local/src/execute.ts` (M2 W6-D1 · 32 tests)

---

## 3. TODO(team-verify)

**CLI shape 假设**（team 装完真跑一次反馈 · 类 P1-11 openhands pattern）:
- `metagpt --help` · 反馈 CLI flag 名（假设 `--project-name` / `--llm-model` / `--llm-api-key` · 待 verify）
- `metagpt --version` · 反馈版本（假设 0.8.x · 上游频繁变动）
- 首 5 行 stdout event shape · 假设 JSON lines with `role` / `type` · 待 verify

**环境依赖**（+M5 P1 shopping list）：
- `pip install --user metagpt` （或 `pip install metagpt`）
- `ANTHROPIC_API_KEY` 或 `OPENAI_API_KEY`（模型 provider）
- Docker（可选 · 若走 sandbox 集成 L2-04）
- MongoDB or SQLite（MetaGPT 内部 · 可能需要 · 装完 team 反馈）

---

## 4. Event mapping（M5 装配时对齐）

**假设** MetaGPT event 走 role-based JSON lines（每 role 一份 output）：

| MetaGPT event | Paperclip activity_log |
|---|---|
| `role: PM, action: analyze` | `agent_tool_call` (kind='requirements_analysis') |
| `role: Architect, action: design` | `agent_tool_call` (kind='architecture_design') |
| `role: Engineer, action: implement` | `agent_tool_call` (kind='code_edit') |
| `role: QA, action: test` | `agent_tool_call` (kind='test_run') |
| `role: *, action: message` | `agent_message` |
| 未识别 | `agent_event_unknown` |

**Defensive parser**（M5 实装）：sniff 前 5 行 · 若非 JSON 走 legacy plaintext parser · 类 openhands 0.x/1.x 兼容 pattern

---

## 5. 依赖 & 前置

- ✅ D-M2-01 external adapter pattern (M2 W5 起 · Pattern-1)
- ✅ paperclip main-line `buildExternalAdapters()` + `createServerAdapter()` factory
- ⏸ D-M3-01/02 SWE-bench 数据 → 触发 β 档分叉决策 → 决定是否装 MetaGPT
- ⏸ P1-16 team 装 `pip install metagpt` + Docker（+M5 shopping list）
- ⏸ MongoDB / SQLite（若 MetaGPT 需要 · team 装 · +M5 shopping list）

---

## 6. Cross-references

- **手册**：`handoff/05-施工手册-M3+.md` §M4-01
- **架构**：`handoff/02-架构与决策.md` §5.4 L3-08 + §D5 MAGIS 救回策略
- **姊妹 adapter**：`packages/adapters/chatdev-local/README.md`（M4-01 候选 B）
- **参照**：`packages/adapters/openhands-local/` (M3-01) · `packages/adapters/mini-swe-agent-local/` (M2 W5-D1) · `packages/adapters/swe-agent-local/` (M2 W6-D1)
- **POC**：`packages/plugins/magis-lite-plugin/` (M3-02 · 42 tests) · 4-role tree POC · 数据决定本 adapter 命运
- **决策规则**：`handoff/reports/m3-decision-record.md` (rules-frozen · D-M3-01/02)
- **上游**：https://github.com/geekan/MetaGPT · MIT · 42k+ star · Python

---

## 7. Status 追踪

| 里程碑 | 状态 |
|---|---|
| PRD + skeleton | ✅ M4-01 kick-off (本文件 + package.json + tsconfig + vitest.config) |
| M3-DP2 分叉决策 | ⏸ 等 D-M3-01/02 SWE-bench 数据 |
| M5 execute.ts + event-stream.ts + test-env.ts + index.ts | ⏸ 装配启动条件：β 档分叉选定 MetaGPT |
| Team 装 metagpt + Docker | ⏸ +M5 P1 shopping list |
| Registration to `~/.paperclip/adapter-plugins.json` | ⏸ team 装完 |
| Real test issue hire | ⏸ 端到端验证 |
