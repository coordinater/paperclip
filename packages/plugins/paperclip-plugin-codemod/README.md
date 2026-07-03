# @ai-company/paperclip-plugin-codemod

## 用途

Paperclip plugin · 走 jscodeshift / codemod 跑代码转换 · M2 W6-D3（**JS 栈选择路径** · 手册 §W6.D3；对应的 openrewrite JVM 分支不启用，因为 paperclip 是 JS/TS monorepo）。

给 agent / 用户提供一个 webhook 端点：POST body `{ recipe, paths, dryRun? }` → spawn jscodeshift → 返回 `{ changed, diff, exitCode }`。

**架构定位**：走 paperclip plugin SDK 契约（`@paperclipai/plugin-sdk` · 06-规范 §2.3 稳定层）。webhook 走 manifest `webhooks[].endpointKey` 声明 + worker `onWebhook(input)` 分发（per errata E-4：SDK 无 `ctx.http.register`）。

**与其他 W6 交付物的关系**：
- 与 mini-swe-agent (W5-D1) / SWE-agent (W6-D1) adapter 组合 —— agent 可决定"先跑 rename-symbol codemod 再让 LLM patch 剩下的"，降本
- 与 stateful-prompt-format (W6-D2) FSM 组合 —— codemod 是 `localized` → `patched` 之间的"自动化 shortcut"

## 装配路径

**Step 1 · 装 jscodeshift（team 本机 · 一次性）**：

```bash
npm install -g jscodeshift
# 或
pnpm add -g jscodeshift

jscodeshift --version   # 应返回版本
```

**Step 2 · pnpm 装本 plugin typecheck + test**：

```bash
cd paperclip
pnpm install --filter @ai-company/paperclip-plugin-codemod
pnpm --filter @ai-company/paperclip-plugin-codemod typecheck
pnpm --filter @ai-company/paperclip-plugin-codemod test    # 22 vitest 全绿
```

**Step 3 · 注册到 paperclip plugin registry**（团队走 UI plugin install 或 CLI）：

```
UI: Settings → Plugins → Install local plugin →
    path = packages/plugins/paperclip-plugin-codemod
```

**Step 4 · 调用**（agent 或用户通过 webhook）：

```bash
# 假设 plugin 装完 · webhook URL 由 paperclip 分配
curl -X POST http://localhost:3100/api/plugins/ai-company.paperclip-plugin-codemod/webhooks/apply \
  -H "Content-Type: application/json" \
  -d '{
    "recipe": "path/to/rename-symbol.js",
    "paths": ["packages/adapters/claude-local/src/execute.ts"],
    "dryRun": true
  }'
```

**Response**（dryRun true 只返回 diff · false 直接改文件）：

```json
{
  "changed": ["packages/adapters/claude-local/src/execute.ts"],
  "diff": "--- a/... +++ b/... @@ ...",
  "exitCode": 0,
  "timedOut": false,
  "errorMessage": null
}
```

## 依赖

- Paperclip 底座 >= `v2026.626.0`
- Node.js >= 20
- **jscodeshift**（团队本机装 · `npm install -g jscodeshift`）
- 目标文件的 parser 支持（默认 babel；TypeScript 用 `--parser tsx` 或类似 `extraArgs`）
- `@paperclipai/plugin-sdk`（workspace 依赖）
- `vitest`（devDep）

## Recipe 来源

- **本地文件**：绝对路径或工作区相对路径指向一个 jscodeshift transform 模块（`export default function transformer(fileInfo, api) { ... }`）
- **published codemod**（未来）：通过 `codemod` CLI 走 published registry —— 需 team 装 `npm install -g codemod`

## 配置项

Plugin manifest 声明 · 无用户可配项（recipe / paths / dryRun 由每次 webhook body 传入）。

Manifest capabilities：
- `webhooks.receive` · 收入站 codemod 请求
- `plugin.state.read` / `plugin.state.write` · 未来缓存 recipe metadata / recent runs（M1 未用）
- `activity.log.write` · 每次 run 落 `codemod_applied` action
- `secrets.read-ref` · 未来私有 codemod registry 用（M1 未用）

## 已知限制

- **无并行**：一次 webhook 一次 jscodeshift 调用 · 并行由 caller 分片
- **Shell metachar 拒绝**：`paths[]` 里含 `` ` $ ; | & < > `` 直接 400 · 防止 shell injection · **不接受 glob**（caller 需自己 expand）
- **Timeout 硬编码 300s**：`applyCodemod()` 默认 · 不通过 webhook 配置（未来加 `timeoutSec` 请求字段）
- **无 dry-run diff auto-extract**：`--dry --print` 时 jscodeshift diff 混在 stdout · `parseJscodeshiftOutput()` 已尽力提取 · 复杂 diff 可能需要 caller 从 raw stdout 自己 parse
- **无 recipe 缓存**：每次 webhook 都从磁盘读 recipe · 未来加 `plugin.state` 缓存
- **无 codemod CLI 支持**：目前只支持 `jscodeshift`；若走 `codemod` CLI 需 caller 覆盖 `command` 字段（`command: "codemod"`）· 参数格式可能不同

## 测试覆盖

**22 vitest**：
- `apply-codemod.test.ts` 14 tests · buildArgs (4) + parseJscodeshiftOutput (4) + applyCodemod integration (3 · fake script fixture · success/timeout/enoent)
- `worker.test.ts` 8 tests · parseRequestBody (7 · 各种拒绝分支) + onWebhook (4 · 404/405/400/logActivity 覆盖 · full success 由 applyCodemod integration 覆盖)

## 交叉引用

- 手册章节：`handoff/04-施工手册-M2.md` §W6.D3
- SDK 表面偏差 pointer：`handoff/reports/errata.md` E-4 (webhook via manifest not ctx.http.register)
- 姊妹 adapter/skill：
  - `packages/adapters/mini-swe-agent-local/`（M2 W5-D1）
  - `packages/adapters/swe-agent-local/`（M2 W6-D1）
  - `skills/stateful-prompt-format/`（M2 W6-D2）
  - `skills/agentless-triage/`（M2 W5-D2）
- Team 依赖：`npm install -g jscodeshift`（未加 shopping list · 一次性 · 5 min）
