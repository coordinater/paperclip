# ChatDev adapter (external plugin) · Kick-off PRD (M4-01 · candidate B)

**Status**: ⏸ **PRD + skeleton only · 无 execute.ts 实装**（per handbook §M4-01 · rules-gated on D-M3-01/02）

**Component ID**: L3-09 (per `handoff/02-架构与决策.md` §5.4 · §D5 组织隐喻更强分叉)

**候选并列**: 本 adapter 与 `packages/adapters/metagpt-local/` 并列为 M4-01 β 档救回 P1 双候选 · 由 M3-DP2 分叉决定：
- **顺利分叉** → 装 ChatDev（本 adapter · 组织隐喻更强 · MAGIS-lite POC 顺利 → MetaGPT 降 P2）
- **不顺利分叉** → 装 MetaGPT（`metagpt-local`）
- **中间态分叉** → 两条路 M6 前并行

---

## 1. Why · 为什么 ChatDev

**目标**：CEO / CTO / Programmer / Reviewer / Tester 组织树 agent 框架 · 强"公司隐喻"叙事 · 补 MAGIS-lite POC 上限

**为什么选 ChatDev 作候选 B**（per handbook §D5 · 02-架构 §5.4）：
- **组织隐喻最强**：ChatDev 论文明说"virtual software company" · 直接映射 ai-company 项目叙事
- **消息传递机制清晰**：Chain of communication (CoC) · 双向对话 sub-issue 之间的传递 · 比 MetaGPT 的 SOP 更 flexible
- **上游成熟**：27k+ star · Apache 2.0 · 长期维护 · Python 生态
- **caveat**：多 role 频繁对话 = tokens 消耗大 · 3-5 roles 同 issue tree 需谨慎 budget draw

**与 M3-02 MAGIS-lite POC 的关系**：
- MAGIS-lite (M3-02) sequential 4-role · 若 POC 顺利数据 → 说明 4-role tree 可行 → **上位 ChatDev**（组织隐喻叙事 + 消息传递更成熟）· MetaGPT 降 P2
- 若 POC 不顺利 → 走 MetaGPT（架构映射更直接 · 消息复杂度低）

**决策依赖**（严格 gated · 同 metagpt-local）：
- D-M3-01/02 SWE-bench 数据 → 触发 M4-01 分叉决策
- 装配启动前必读 `handoff/reports/decisions-m4.md` §β档-decision

---

## 2. What · 装配路径

**装配路径**（复用 Pattern-1 · external adapter plugin · D-M2-01 第 6 次复用）：
- 走 `~/.paperclip/adapter-plugins.json` 注册 `chatdev_local`
- 无 core patch · 无新 server route · SDK canonical path
- CLI 走 `python -m chatdev.run_chatdev` 或官方 `chatdev` binary
- 依赖 MongoDB or SQLite · 依赖 Python 3.11+

**结构（M5 起装配 · 现在 skeleton only）**：
```
packages/adapters/chatdev-local/
├── README.md          ← 本 PRD (M4-01)
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/               ← M5 起补 execute.ts + event-stream.ts + test-env.ts + index.ts
    └── .gitkeep
```

---

## 3. TODO(team-verify)

**CLI shape 假设**（team 装完真跑一次反馈）:
- `chatdev --help` 或 `python -m chatdev.run_chatdev --help` · 反馈 CLI flag 名（假设 `--task` / `--config` / `--org`）
- `chatdev --version` · 反馈版本
- Output shape · 假设 JSON lines with `role` / `phase` / `message` · 待 verify

**环境依赖**（+M5 P1 shopping list）：
- `git clone https://github.com/OpenBMB/ChatDev` + `pip install -r requirements.txt`（ChatDev 不 pip publish · git clone install）
- `OPENAI_API_KEY`（ChatDev 内置多 LLM 支持 · 走 provider config）
- Python 3.11+

---

## 4. Event mapping（M5 装配时对齐）

**假设** ChatDev event 走 phase-based JSON（每 phase = design / coding / testing / documenting · 每 phase 内多 role 对话）：

| ChatDev event | Paperclip activity_log |
|---|---|
| `phase: design, role: CEO ↔ CTO` | `agent_message` (kind='architecture_discussion') |
| `phase: coding, role: Programmer` | `agent_tool_call` (kind='code_edit') |
| `phase: testing, role: Tester` | `agent_tool_call` (kind='test_run') |
| `phase: documenting, role: *` | `agent_tool_call` (kind='doc_write') |
| CoC (Chain-of-Communication) 双向对话 | `agent_message` (双方 role 都记 · reports_to 保留) |
| 未识别 | `agent_event_unknown` |

**Defensive parser**（M5 实装）：ChatDev 上游改动较多 · sniff phase field 兼容多版本

---

## 5. 依赖 & 前置

- ✅ D-M2-01 external adapter pattern
- ⏸ D-M3-01/02 数据 → 触发分叉决策
- ⏸ P1-16 team 装 ChatDev git clone + Python 依赖（+M5 shopping list）
- ⏸ Docker（可选 · 若沙箱集成）

---

## 6. Cross-references

- **手册**：`handoff/05-施工手册-M3+.md` §M4-01
- **架构**：`handoff/02-架构与决策.md` §5.4 L3-09 + §D5
- **姊妹 adapter**：`packages/adapters/metagpt-local/README.md`（M4-01 候选 A）
- **参照**：`packages/adapters/openhands-local/` (M3-01) · `packages/adapters/mini-swe-agent-local/` (M2 W5-D1) · `packages/adapters/swe-agent-local/` (M2 W6-D1)
- **POC**：`packages/plugins/magis-lite-plugin/` (M3-02) · 数据决定本 adapter 命运
- **决策规则**：`handoff/reports/m3-decision-record.md` (rules-frozen · D-M3-01/02)
- **上游**：https://github.com/OpenBMB/ChatDev · Apache 2.0 · 27k+ star · Python

---

## 7. Status 追踪

| 里程碑 | 状态 |
|---|---|
| PRD + skeleton | ✅ M4-01 kick-off (本文件 + package.json + tsconfig + vitest.config) |
| M3-DP2 分叉决策 | ⏸ 等 D-M3-01/02 数据 |
| M5 execute.ts + event-stream.ts + test-env.ts + index.ts | ⏸ 装配启动条件：β 档分叉选定 ChatDev |
| Team 装 ChatDev + Python 依赖 | ⏸ +M5 P1 shopping list |
| Registration to `~/.paperclip/adapter-plugins.json` | ⏸ team 装完 |
| Real test issue hire | ⏸ 端到端验证 |
