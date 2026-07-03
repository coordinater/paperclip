# ai-company Workspace Runtime Config

**用途**：M1 W2-D6/D7 wire-up 的 canonical 声明——ai-company 项目的默认 workspace_runtime_services 配置，覆盖 codebase-memory-mcp + pyrefly。

**语义**：workspace_runtime_services 是 paperclip 主线 **声明式配置**（在 `.paperclip.yaml` 或 project workspace `metadata.runtimeConfig`）。这里提供 canonical 模板，团队 M1→M2 入驻真业务时把它 copy 到目标 project workspace 的 `.paperclip.yaml`。

**不修改主线 core**——workspace_runtime_services 表和 API 是 paperclip 已有基础设施，本 wire-up 只补配置层。

---

## Files

| # | 文件 | 内容 |
|---|---|---|
| 1 | `workspace-runtime-services.yaml` | Canonical `.paperclip.yaml` 片段——services + jobs 定义 |
| 2 | `claude-code-adapter-env.md` | Claude Code adapter env 里 pyrefly 集成方法 |
| 3 | `install-side-cars.sh` | 团队本机装 codebase-memory-mcp + pyrefly 一键脚本 |
| 4 | `loader.ts` | TS loader —— 读 yaml，返回 typed `AiCompanyRuntimeConfig`；供 seeder / CLI / 测试 消费 |
| 5 | `loader.test.ts` | 8 vitest —— 验证 yaml 结构 + 与主线 `listWorkspaceServiceCommandDefinitions` / `matchWorkspaceRuntimeServiceToCommand` 契约 interop |

## Wire-up 流程（团队入驻时执行）

**Step 1**：装侧车二进制（一次性 · 每机器一次）
```bash
cd packages/plugins/ai-company/runtime-config
./install-side-cars.sh
```
装 codebase-memory-mcp binary 到 `~/.local/bin/`（或 macOS `/opt/homebrew/bin/`）+ `pip install pyrefly`。

**Step 2**：把 `workspace-runtime-services.yaml` 内容 copy 到你的 ai-company project 的 `.paperclip.yaml` `workspaceRuntime` 段（原地合并）。

**Step 3**：Claude Code adapter env 加 pyrefly path per `claude-code-adapter-env.md`。

**Step 4**：paperclip UI → project workspace → runtime services → 应该看到 codebase-memory-mcp + pyrefly 两条 · 点 start。

**验证**：
- MCP endpoint HTTP 200: `curl http://localhost:9749/health`（codebase-memory-mcp）
- pyrefly 可调: `pyrefly --version`

## 为什么这样 wire-up

**W3 status 原文**: "把 codebase-memory-mcp + pyrefly 挂进心跳查询循环 (W2-D6/D7)"

**W2-D6 (codebase-memory-mcp)**: MCP server · agent 在心跳内查 codebase 知识图 · 声明为 workspace_runtime_service · paperclip 用 `matchWorkspaceRuntimeServiceToCommand` 匹配运行时状态

**W2-D7 (pyrefly)**: Python type verifier · agent 触发时 subprocess 调 · 集成到 claude-code adapter env (PATH + optional MCP wrap · 视 adapter 配置)

**M1 wire-up 边界**：本 wire-up 包含 (a) canonical yaml (b) TS loader + 8 vitest 证明 yaml 能被 paperclip 主线 `listWorkspaceServiceCommandDefinitions` 正确消费 (c) 装配脚本 (d) adapter env 文档。真 per-workspace 落地依赖已建 project workspace + supervisor —— 团队入驻真业务时把 yaml copy 到目标 `.paperclip.yaml` 即可，无需再改本 plugin。M1 §W4.6 DoD "三大红旗" memory 部分由 cognee 承担 (workspace-agnostic 全局 side-car)，codebase-memory-mcp 是 workspace-scoped 补充层。

**测试**：

```bash
pnpm --filter @ai-company/paperclip-plugin-ai-company test
# 22 tests：14 middleware + 8 runtime-config loader
```

## 与主线 workspace_runtime_services 表关系

- 主线 DB: `workspace_runtime_services` 表 (per-workspace 记录运行状态)
- 主线 API: `POST /api/execution-workspaces/:id/runtime-services/:action` (start/stop/restart)
- 主线 service supervisor: `server/src/services/workspace-runtime.ts`
- **我们只补配置**——不改 DB schema、不改 route、不改 supervisor
