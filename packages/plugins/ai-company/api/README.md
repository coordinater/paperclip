# api/ — L2 API 层缓冲

对外 REST 一律走 `/api/ai-company/*`——**不直连** PaperClip core routes（`/api/agents/*` / `/api/issues/*` 等）。规范锚点：`handoff/06-规范.md` §2.2 API 层缓冲、§10 红线 9。

W1-W2 skeleton 阶段：目录结构 + 函数签名 + JSDoc 契约锁定；业务逻辑在后续施工波填充。

## 三层分工

**`v1/`** —— 稳定契约。一旦发布，**加字段允许，改字段 / 删字段禁止**（同 §7 additive migration 精神）。下游可以依赖 v1 路径不变；破坏性改动必须新开 `v2/`，并与 v1 并行至少 6 个月（借鉴 PaperClip Plugin SDK deprecation policy，`handoff/06` §2.2）。当前占位：`v1/skills/install.ts`、`v1/campaigns/create.ts`。

**`experimental/`** —— 实验路径，随时可改可删。下游必须**明确声明依赖 experimental** 才能引用，出问题不赔。M3+ 首个占位 `magis-lite/hire.ts` 将进这里。

**`internal/`** —— core 调用封装。`internal/paperclip-client.ts` 是全项目**唯一**允许 import PaperClip core route module 或直接 fetch `/api/agents/*` 的地方（红线 9）。其他所有代码调 core → import 这个 client。上游 route 变动时只在这里改一次，v1 契约岿然不动。

## 现状

skeleton 阶段：所有 handler 只导出函数签名 + JSDoc；调用即抛 "skeleton only" 错误。W2-D11+ 起按施工手册逐日填充实现。

## 引用规范

- 命名：文件 kebab-case、函数 camelCase、类型 PascalCase（`handoff/06` §1.2）
- 注释：只写非显然的 why，禁止 what 型 comment（§1.4）
- 契约稳定性：v1 冻结，`internal/` 是唯一 core 逃生口（§2.2）
