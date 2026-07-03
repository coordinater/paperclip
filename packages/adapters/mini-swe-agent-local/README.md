# @ai-company/adapter-mini-swe-agent-local

## 用途

Paperclip 外部 adapter 插件 · 包装 [princeton-nlp/mini-swe-agent](https://github.com/princeton-nlp/mini-swe-agent) Python CLI 为 `mini_swe_local` adapter type。M2 W5-D1 交付物。

用于给 paperclip 用作 SWE-bench baseline 参考实现 —— mini-swe-agent 是 "100 行反 agent 极简派" 锚点，与 SWE-agent / Agentless 系列做对照。

**架构定位**：本 adapter 走 paperclip 主线的 **external adapter plugin 机制**（`server/src/adapters/plugin-loader.ts` `buildExternalAdapters()`）· **不修改任何 core 代码**（不加 `BUILTIN_ADAPTER_TYPES`，不改 `registry.ts`）。

## 装配路径

**Step 1 · pip install mini-swe-agent binary**（team 本机 · 一次性）：

```bash
pip install --user mini-swe-agent
mini-swe-agent --version   # 应返回版本字符串
```

**Step 2 · pnpm 装本 adapter 包 typecheck + test**（AI 已跑过）：

```bash
cd paperclip
pnpm install --filter @ai-company/adapter-mini-swe-agent-local
pnpm --filter @ai-company/adapter-mini-swe-agent-local typecheck
pnpm --filter @ai-company/adapter-mini-swe-agent-local test   # 14 vitest 全绿
```

**Step 3 · 注册到 paperclip external adapter store**（team 或运维一次性 · 需 paperclip server 停机）：

编辑 `~/.paperclip/adapter-plugins.json`（如无则新建），追加一条：

```jsonc
[
  {
    "packageName": "@ai-company/adapter-mini-swe-agent-local",
    "localPath": "/Users/funmini/Documents/personal-cognition/人生！gogogog！/AI公司梳理/paperclip/packages/adapters/mini-swe-agent-local",
    "type": "mini_swe_local",
    "installedAt": "2026-07-03T00:00:00.000Z"
  }
]
```

`localPath` 是本 monorepo 包的绝对路径（用于开发期 symlink · 生产会发 npm 后走 `packageName` 路径）。

**Step 4 · 重启 paperclip server** —— 启动日志应出现 `Loaded external adapters from plugin store` + `mini_swe_local`。

**Step 5 · UI hire 一个 test agent**（走生产流程）：

```
POST /api/companies/:cid/agents
{
  "name": "swe-baseline-agent",
  "adapterType": "mini_swe_local",
  "adapterConfig": {
    "model": "claude-sonnet-4-5",
    "timeoutSec": 900
  }
}
```

**Step 6 · 跑一个 test issue**（W5-D1 DoD 验证）：创个 issue 描述简单 bug（如"README 加一行 HELLO"），指派给 `swe-baseline-agent`。观察 `activity_log` 里 mini-swe-agent stdout stream + exit code。

## 依赖

- Paperclip 底座 >= `v2026.626.0`（fork 锚定 · 06-规范 §2.4）
- Node.js >= 20（与 monorepo 一致）
- **Python 3.11+**（mini-swe-agent 需要 · 与 repo `.python-version` 一致）
- **`mini-swe-agent` Python 包**（`pip install --user mini-swe-agent`）
- Model provider credentials（`ANTHROPIC_API_KEY` / `OPENAI_API_KEY`）· 视 mini-swe-agent 用的 model 决定
- `@paperclipai/adapter-utils`（workspace 依赖）
- `vitest`（devDep · 主线已用）

## 配置项

在 UI hire 时通过 `adapterConfig` 传入：

| 键 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `command` | string | `"mini-swe-agent"` | CLI 命令 · 可覆盖为绝对路径或 `"python -m minisweagent"` |
| `cwd` | string | Paperclip execution workspace cwd | 绝对工作目录 |
| `model` | string | — | mini-swe-agent model id · 传 `--model <id>` |
| `promptTemplate` | string | `"{{taskBody}}"` | 用户 prompt · 支持 `{{taskId}}` / `{{taskTitle}}` / `{{taskBody}}` / `{{agentName}}` / `{{runId}}` 变量 |
| `extraArgs` | string[] | — | 额外 CLI args · 追加到 `--model` / `--task` 之后 |
| `env` | object | — | KEY=VALUE 环境变量 · 传给子进程 · 覆盖 process.env |
| `timeoutSec` | number | `600` | 运行超时秒数 |
| `graceSec` | number | `5` | SIGTERM grace 秒数 |

## 已知限制

- **CLI shape 假设**：本 adapter 假设 `mini-swe-agent --task <prompt>` 是 canonical 调用形式。若上游 CLI 参数结构变化（`--model` / `--task` flag 名不同），需调 `execute.ts` 里 `buildInvocation()` 逻辑。团队装完 mini-swe-agent 后**首要动作**：跑 `mini-swe-agent --help` 确认 flag 名。
- **无 session resume**：每次 run 产生新 sessionId · mini-swe-agent 无内建 session 机制。M2 后若 mini-swe-agent 上游加了 session，可在 `execute.ts` 里补 `sessionCodec`。
- **无 skill sync**：mini-swe-agent 无 skills 概念 · 本 adapter 未导出 `listSkills`/`syncSkills`。
- **无 model auto-discovery**：`models: []` · 团队 hire 时手填 model id。M2 后可加 `--list-models` 兜底。
- **无 runtime service 挂载**：不用 `workspace_runtime_services` 里的 shared MCP · agent 只跑自己的 subprocess。cognee / codebase-memory-mcp 集成留 M3。
- **无 UI parser**：不提供 `./ui-parser` export · UI 走通用 process view · M3 可补 mini-swe-specific 输出解析（如 patch 摘要）。
- **secrets 走 env 明文**：`config.env` 里的敏感值需谨慎 · 生产环境应从 `company_secrets` 注入而非 config。

## 测试覆盖

- `src/execute.test.ts` 14 vitest：
  - createServerAdapter 公共表面 4 tests（type / getRuntimeCommandSpec / alias）
  - buildInvocation 7 tests（默认 / --model / promptTemplate / cwd / extraArgs / env / timeout）
  - 实进程 3 tests（/bin/echo 成功 · /bin/sh sleep 超时 · 不存在命令 spawn_failed）

## 交叉引用

- Adapter 契约：`packages/adapter-utils/src/types.ts` `ServerAdapterModule`
- 外部 adapter 加载：`server/src/adapters/plugin-loader.ts` `buildExternalAdapters()`
- Adapter plugin store：`server/src/services/adapter-plugin-store.ts` `~/.paperclip/adapter-plugins.json`
- No-remote-git 契约（本 adapter 遵守）：`packages/adapters/AUTHORING.md`
- 手册章节：`handoff/04-施工手册-M2.md` §W5.D1
- Team 依赖：`handoff/reports/team-shopping-list.md` P1（新增 pip install mini-swe-agent + `~/.paperclip/adapter-plugins.json` 编辑）
