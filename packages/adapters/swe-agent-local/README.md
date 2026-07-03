# @ai-company/adapter-swe-agent-local

## 用途

Paperclip 外部 adapter · 包装 [princeton-nlp/SWE-agent](https://github.com/princeton-nlp/SWE-agent)（NeurIPS 2024 SWE-bench SOTA at publication）Python CLI 为 `swe_agent_local` adapter type · M2 W6-D1 交付物。

**架构定位**：与 mini-swe-agent-local (M2 W5-D1) 姊妹 · 都走主线 **external adapter plugin 机制**（`buildExternalAdapters()` + `createServerAdapter()` + `~/.paperclip/adapter-plugins.json`）· 无需改 core（D-M2-01）。

**与 mini-swe-agent 的区别**：
- SWE-agent 是完整 agent（几千行 Python · Agent-Computer Interface 语义 · 容器隔离），mini-swe-agent 是 100 行反 agent 极简派
- SWE-agent 输出 **trajectory JSONL**（每行一个 action / observation / human_input 事件），本 adapter 有 `trajectory.ts` 解析器把事件流映射到 Paperclip `activity_log`
- SWE-agent 用 Docker 起 per-instance 环境 · mini-swe-agent 直跑本地 bash

## 装配路径

**Step 1 · pip install sweagent binary**（team 本机 · 一次性）：

```bash
pip install --user sweagent
sweagent --version   # 应返回版本字符串（本 adapter 目标 1.x · <1 会走 fallback）
```

**Step 2 · pnpm 装本 adapter typecheck + test**：

```bash
cd paperclip
pnpm install --filter @ai-company/adapter-swe-agent-local
pnpm --filter @ai-company/adapter-swe-agent-local typecheck
pnpm --filter @ai-company/adapter-swe-agent-local test   # 32 vitest 全绿 (17 trajectory + 10 execute + 5 surface)
```

**Step 3 · 注册到 paperclip external adapter store**（team 或运维 · 需 server 停机）：

编辑 `~/.paperclip/adapter-plugins.json` 追加：

```jsonc
{
  "packageName": "@ai-company/adapter-swe-agent-local",
  "localPath": "/Users/funmini/Documents/personal-cognition/人生！gogogog！/AI公司梳理/paperclip/packages/adapters/swe-agent-local",
  "type": "swe_agent_local",
  "installedAt": "2026-07-03T00:00:00.000Z"
}
```

**Step 4 · 重启 paperclip server** —— 启动日志应看到 `Loaded external adapters from plugin store` + `swe_agent_local`。

**Step 5 · UI hire test agent**：

```
POST /api/companies/:cid/agents
{
  "name": "swe-deep-alt",
  "adapterType": "swe_agent_local",
  "adapterConfig": {
    "model": "claude-sonnet-4-5",
    "timeoutSec": 3600,
    "configFile": "/path/to/sweagent-config.yaml"
  }
}
```

**Step 6 · 跑一个 SWE-bench Lite 样例**（W6-D1 DoD 验证）：把 M2 W5-D4 里 `benchmarks/swe-bench-subset/w8-verify-list.txt` 第一行的 instance 作为 test issue · 观察 `activity_log` 里出现 `agent_tool_call` / `agent_tool_result` 事件流（trajectory 解析成功即达 DoD "跑到 patch 生成"）。

## 依赖

- Paperclip 底座 >= `v2026.626.0`
- Node.js >= 20
- **Python 3.11+**
- **Docker**（SWE-agent 用 per-instance container 起环境 · 首次拉 image 慢）
- **`sweagent` Python 包**（`pip install --user sweagent`）
- Model provider credentials（`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` · 视 SWE-agent 用的 model）
- `@paperclipai/adapter-utils`（workspace 依赖）
- `vitest`（devDep）

## 配置项

| 键 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `command` | string | `"sweagent"` | CLI 命令 · 覆盖为 `python -m sweagent.run.run` 或绝对路径 |
| `cwd` | string | Paperclip execution workspace cwd | 绝对工作目录 |
| `model` | string | — | SWE-agent model id · 传 `--agent.model.name <id>` |
| `configFile` | string | — | SWE-agent 配置 yaml 路径 · 传 `--config <path>` |
| `problemStatement` | string | — | 直接指定 problem statement text · 覆盖 promptTemplate |
| `promptTemplate` | string | `"{{taskBody}}"` | 变量：`{{taskId}}` `{{taskTitle}}` `{{taskBody}}` `{{agentName}}` `{{runId}}` |
| `extraArgs` | string[] | — | 额外 CLI args |
| `env` | object | — | KEY=VALUE 环境变量 |
| `timeoutSec` | number | `1800` | 运行超时秒数（比 mini-swe-agent 长 · SWE-agent runs 长） |
| `graceSec` | number | `10` | SIGTERM grace 秒数 |

## Trajectory 事件映射

SWE-agent stdout JSONL 每行一个事件 · 本 adapter 用 `trajectory.ts` 流式解析并 emit 到 Paperclip：

| SWE-agent event `role` | 映射到 Paperclip `activity_log` action | details |
|---|---|---|
| `action` / `tool_call` | `agent_tool_call` | `{ cmd, args, raw }` |
| `observation` / `tool_result` | `agent_tool_result` | `{ stdout, exit_code, raw }` |
| `human_input` / `question` / `clarification` | `agent_question_asked` | `{ prompt, choices[], raw }` |
| 其他 | `agent_trajectory_unknown` | `{ raw }`（不 drop · 留 audit trail） |

流式解析支持**跨 chunk stitching**（一个 event 分成多 chunk 时 buffer 到齐再 emit）· 非 JSON 行（如 `[INFO] starting`）静默跳过。

## 已知限制

- **CLI shape 假设**：本 adapter 假设 `sweagent run --agent.model.name <id> --problem_statement.text <text> --env.repo.path <cwd>` · 若上游 CLI 参数结构变化需调 `execute.ts` `buildInvocation()` · team 装完后**首要动作**：跑 `sweagent --help` 验证
- **Trajectory schema 假设**：1.x JSONL 格式 · 0.x YAML 格式会 fall through 到 `unknown` events · `test-env.ts` 会 warn if major < 1
- **无 session resume**：每次 run 新 sessionId
- **无 skill sync**：SWE-agent 有自己的 ACI 工具集
- **无 model auto-discovery**：`models: []` · UI hire 手填
- **Docker 依赖**：SWE-agent 每次跑起 container · 首次拉 image 几 GB · 用 aliyun mirror 加速见手册 §W5"典型问题诊断" #4
- **CLI arg 名可能与 SWE-agent 版本不匹配**：本 adapter 目标 SWE-agent 1.x 的 hydra-style `--agent.model.name` `--env.repo.path` 参数 · team 装的版本若旧需调

## 测试覆盖

**32 vitest**（`src/execute.test.ts` + `src/trajectory.test.ts`）：
- 17 trajectory tests · JSONL 单行解析（action/observation/human_input/unknown/plain-log）+ streaming buffer（跨 chunk stitching · 非 JSON 混杂）+ activityLogActionFor 映射
- 10 execute tests · buildInvocation 默认/model/configFile/problemStatement/promptTemplate/extraArgs/timeoutSec + runProcess 真进程 (echo/JSONL stream/timeout/spawn_failed)
- 5 adapter surface tests · createServerAdapter / getRuntimeCommandSpec / alias

## 交叉引用

- 姊妹 adapter：`packages/adapters/mini-swe-agent-local/`（M2 W5-D1 · 极简派 baseline）
- SWE-bench 子集：`benchmarks/swe-bench-subset/`（M2 W5-D4）
- RepairAgent FSM skill：`skills/stateful-prompt-format/`（M2 W6-D2 · 可组合）
- Agentless triage skill：`skills/agentless-triage/`（M2 W5-D2 · 可组合）
- 手册章节：`handoff/04-施工手册-M2.md` §W6.D1
- 决策 D-M2-01：external adapter plugin 机制（`session-handoff-20260703-3.md`）
- Team 依赖：`handoff/reports/team-shopping-list.md` P1（新 P1-7 pip install sweagent · 见下）
