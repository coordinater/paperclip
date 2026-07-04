# AutoGen adapter (external plugin) · Kick-off PRD (M5-01 · candidate)

**Status**: ⏸ **PRD + skeleton only · 无 execute.ts 实装**（per handbook §M5-01 · rules-gated on M4-01 结果）

**Component ID**: L3-09 (per `handoff/02-架构与决策.md` §5.4 · §D5 β 档救回 P2)

**M5-01 分叉**（依赖 M4-01 结果）:
- 若 **M4-01 = ChatDev** 装 → **M5-01 只考虑 autogen**（本 adapter · 无 ChatDev 二次候选）
- 若 **M4-01 = MetaGPT** 装 → **M5-01 二选一 · autogen（本 adapter）或 ChatDev（`chatdev-local` M4-01 skeleton 复用）**
- 若 **M4-01 保留双候选并行**（中间态 · M6 前观察）→ M5-01 装第三条 autogen 完成 3-way baseline

---

## 1. Why · 为什么 autogen

**目标**：Microsoft AutoGen (autogen-agentchat / autogen-core) 作 β 档救回 P2 · 多 agent 对话框架 · 补 M4-01 β 档 P1 装配之后的第二发子弹

**为什么选 autogen 作 P2 候选**（per handbook §D5 · 02-架构 §5.4）：
- **Microsoft 官方**（0.4+ 是 completely rewrite · 稳定性大幅提升）· 34k+ star · MIT
- **model-agnostic messaging protocol**（GRPC-based · 支持跨 process/机器分布式）· 与 paperclip 的 issue-tree scope 有天然对应
- **Group chat 隐喻**：区别于 MetaGPT 4-role 严谨 SOP + ChatDev CEO/CTO 组织树 · autogen 更 flexible · 支持 dynamic team formation
- **caveat**：0.4+ vs 0.2/0.3 breaking changes · 版本锚定敏感 · 装配前 team verify version

**与 M4-01 β 档 P1 的关系**：
- M4-01 (MetaGPT 或 ChatDev) 先装 · 稳定运行 5-7 天 · 收 baseline
- M5-01 autogen 装 · 走 A/B 对比 · 分析不同 framework 在同 SWE-bench 子集上的差异
- M6 复审时二选一（或保 3 个都装 = SWE 主力对比 baseline）

---

## 2. What · 装配路径

**装配路径**（Pattern-1 · external adapter plugin · D-M2-01 第 7 次复用）：
- 走 `~/.paperclip/adapter-plugins.json` 注册 `autogen_local`
- 无 core patch · SDK canonical path
- CLI 走 `python -m autogen_agentchat.run` 或官方 `autogen` binary（视版本）
- 依赖 Python 3.11+

**结构（M5 装配 · 现在 skeleton only）**：
```
packages/adapters/autogen-local/
├── README.md          ← 本 PRD (M5-01)
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/               ← M5 起补 execute.ts + event-stream.ts + test-env.ts + index.ts
    └── .gitkeep
```

---

## 3. TODO(team-verify)

**CLI shape 假设**（team 装完真跑一次反馈）:
- `autogen --version` 或 `python -c "import autogen_agentchat; print(autogen_agentchat.__version__)"` · 反馈版本
- `autogen --help` · CLI flag（假设 `--task` / `--config` / `--model`）
- **critical**：autogen 0.4+ 是 completely rewrite · 与 0.2/0.3 完全不同 · team 反馈是 0.4+ 还是 0.2/0.3

**环境依赖**（+M5 P1 shopping list）：
- `pip install --user "autogen-agentchat"` （0.4+ default 命名 · autogen-core 也是 0.4+）
  - 或 `pip install --user "pyautogen"` （0.2/0.3 legacy）
- `OPENAI_API_KEY` 或 `ANTHROPIC_API_KEY`
- Python 3.11+
- 可选 Docker（若集成 sandbox 层）

---

## 4. Event mapping（M5 装配时对齐）

**假设 autogen 0.4+ event 走 message-based JSON**（每 message = source_agent → target_agent 双向对话）：

| autogen event | Paperclip activity_log |
|---|---|
| `AgentMessage · type=text` | `agent_message` |
| `ToolCallRequestEvent` | `agent_tool_call` |
| `ToolCallExecutionEvent` | `agent_tool_result` |
| `TerminationEvent` | `agent_run_finished` |
| Group chat coordination | `agent_message` (kind='coordination') |
| 未识别 | `agent_event_unknown` |

**Defensive parser**（M5 实装）：
- autogen 0.4+ 与 0.2/0.3 shape 完全不同 · sniff `event_id` field · 走版本分支 parser
- 参考 openhands 0.x/1.x 双兼容 pattern

---

## 5. 依赖 & 前置

- ✅ D-M2-01 external adapter pattern
- ⏸ M4-01 β 档 P1 稳定运行 5-7 天 · 收 baseline
- ⏸ P1-17 team 装 autogen（+M5 shopping list）· 确认版本 0.4+ vs 0.2/0.3

---

## 6. Cross-references

- **手册**：`handoff/05-施工手册-M3+.md` §M5-01
- **架构**：`handoff/02-架构与决策.md` §5.4 L3-09 + §D5
- **姊妹 adapter**：
  - `packages/adapters/metagpt-local/` (M4-01 candidate A)
  - `packages/adapters/chatdev-local/` (M4-01 candidate B · **本 M5-01 分叉可复用 skeleton**)
- **参照**：`packages/adapters/openhands-local/` (M3-01) · `packages/adapters/swe-agent-local/` (M2 W6-D1)
- **上游**：https://github.com/microsoft/autogen · MIT · 34k+ star · Python

---

## 7. Status 追踪

| 里程碑 | 状态 |
|---|---|
| PRD + skeleton | ✅ M5-01 kick-off (本文件 + 3 配置文件) |
| M4-01 稳定运行 5-7 天 | ⏸ 依赖 M4-01 数据 → M5-01 触发 |
| M5 execute.ts + event-stream.ts + test-env.ts + index.ts | ⏸ 装配启动条件：M4-01 稳定 + team 补 autogen |
| Team 装 autogen (0.4+ vs 0.2/0.3 verify) | ⏸ +M5 P1 shopping list |
| Registration to `~/.paperclip/adapter-plugins.json` | ⏸ team 装完 |
| A/B 对比 baseline vs M4-01 | ⏸ 端到端验证 |
