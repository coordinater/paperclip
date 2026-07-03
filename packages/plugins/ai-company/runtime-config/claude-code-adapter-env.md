# Claude Code Adapter env · pyrefly + codebase-memory-mcp 集成

**用途**：W2-D7 · 让 Claude Code CLI 在 paperclip 心跳内能调 pyrefly 做 Python typecheck + 查询 codebase-memory-mcp 拿代码知识图。

**前提**：已跑 `install-side-cars.sh` · `pyrefly` 和 `codebase-memory-mcp` 在 PATH。

---

## MCP config (`~/.config/claude-code/mcp.json` 或等价)

Claude Code 使用 MCP 配置文件声明可用的 MCP servers。加入：

```json
{
  "mcpServers": {
    "codebase-memory": {
      "type": "sse",
      "url": "http://localhost:9749/sse",
      "description": "Structural code queries · 14 MCP tools · via codebase-memory-mcp"
    }
  }
}
```

**注**：codebase-memory-mcp 支持 stdio 和 SSE 两种 transport · 生产环境 SSE 更稳（避免每次 agent 起动重启 MCP）· 详见 https://github.com/DeusData/codebase-memory-mcp README §"MCP integration"。

---

## Env variables (`.env.local` 或 shell rc)

```bash
# Claude Code CLI 会读环境变量传给 MCP client
export CODEBASE_MEMORY_URL="http://localhost:9749"
export PYREFLY_BIN="$(which pyrefly)"     # 供 agent workflow 步骤引用
```

---

## Paperclip claude-code adapter 集成

**位置**：`packages/adapters/claude-local/src/adapter.ts`（**主线核心 · 不改**）

主线 adapter 已支持通过 `WORKSPACE_ENV` 传入 subprocess env。ai-company 项目通过 `.paperclip.yaml` 的 `env` 段声明：

```yaml
# 在 ai-company project 的 .paperclip.yaml 里
env:
  PYREFLY_BIN: "/opt/homebrew/bin/pyrefly"  # 或 which pyrefly 结果
  CODEBASE_MEMORY_URL: "http://localhost:9749"
```

这样 agent subprocess 起来后能直接 `$PYREFLY_BIN check ...` 调 pyrefly · 或通过 MCP 查 codebase-memory-mcp。

---

## 触发链

**Pyrefly 触发时机**：
- Agent 完成代码修改后 · pre-submit verifier 步骤调
- CI / GitHub Actions 里 code review step 调
- 手动 · agent 在 prompt 里说 "run typecheck"

**Codebase-memory-mcp 触发时机**：
- Agent 开始新 issue 时 · 查 "issue 描述的相关代码在哪些文件"
- Agent 修 bug 时 · 查 "这个函数被谁调 · 修了会影响哪里"
- Agent commit 后 · 更新知识图 (codebase-memory-mcp 自动 rebuild)

---

## Verification

**装完 wire-up 后验证 Claude Code adapter 能调用**：

```bash
# 1. 起 codebase-memory-mcp
codebase-memory-mcp serve --port 9749 &

# 2. 起一个 Claude Code CLI session · 让 agent 用 MCP tool
claude-code chat "使用 codebase-memory tool 列出 packages/plugins/ai-company/ 的 exported 函数"
# 预期: agent 调 codebase-memory-mcp 的 list_symbols tool · 返回函数列表

# 3. 测 pyrefly
echo 'x: int = "not a number"' > /tmp/typo.py
pyrefly check /tmp/typo.py
# 预期: 报错 · assignment-mismatch
```

---

## 已知限制 · Deviations

- **不改核心 adapter**（红线 1）: 集成走 env 传递 · 不注入 adapter 特殊代码
- **MCP transport 选择**: SSE 需要 HTTP 端口开放 · 如果团队生产环境沙箱 lock port · fallback 到 stdio transport（每次 agent 起 MCP 重启 · 慢但兼容性好）
- **Pyrefly 早期项目**: Meta 的 pyrefly 在 2025-2026 快速迭代 · 如果遇到 breaking change · fallback 到 mypy 或 pyright（都是 workspace_runtime_service 层配置改动 · 不影响 wire-up 架构）
