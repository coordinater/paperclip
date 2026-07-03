# @ai-company/paperclip-plugin-lark

> Skeleton generated at W3-D7 (M1). Business logic填充在 W4-D5 装配日。参见 handoff/03-施工手册-M1.md §W3.3 / §W4.3。

## 用途

在 PaperClip 底座和飞书（Lark）之间搭桥：把飞书群消息 / 审批卡片 / webhook 事件双向映射到 PaperClip 的 `approvals`、`issues`、`activity_log`。M1 只做一类 `approval(hire_agent)` 双向绑定；其他 approval 类型 M2 补齐。

## 装配路径

- **本地开发**：`pnpm install`（在 monorepo 根目录）→ `pnpm --filter @ai-company/paperclip-plugin-lark build`。
- **注册到 PaperClip**：通过 UI Plugin Registry 装 local file 或 `paperclipai plugin install packages/plugins/paperclip-plugin-lark`。
- **首次启动**：需在 `company_secrets` 里注入 `LARK_APP_ID` / `LARK_APP_SECRET`（W3-D6 已由用户提供），plugin worker 启动时从 `ctx.secrets` 读取。

## 依赖

- PaperClip 底座 >= `v2026.626.0`（fork 锚定版本，见 handoff/06-规范.md §2.4）。
- Node.js >= 20。
- `@paperclipai/plugin-sdk`（workspace 依赖，稳定契约层，见 handoff/06 §2.3）。
- `@larksuite/node-sdk`（W4-D5 装配日引入，M1 W3 阶段仅声明 TODO）。

## 配置项

| 键 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `larkAppId` | secret ref | — | `{{secret:LARK_APP_ID}}`（在 `company_secrets` 中注入） |
| `larkAppSecret` | secret ref | — | `{{secret:LARK_APP_SECRET}}` |
| `larkVerificationToken` | secret ref | — | `{{secret:LARK_VERIFICATION_TOKEN}}`（webhook 校验） |
| `larkEncryptKey` | secret ref | — | `{{secret:LARK_ENCRYPT_KEY}}`（可选，AES event） |
| `defaultChatId` | string | — | M1 只支持一个默认通知群（chat_id） |
| `approvalCardTemplateId` | string | — | 飞书审批卡片模板 ID（W4-D5 用户在飞书后台创建后填入） |

## 已知限制

- **M1 只支持 1 类 approval 双向绑定**：`hire_agent`。其他 (`spawn_run`、`install_skill`、`connect_env` 等) 推到 M2。
- **未做速率限制/退避**：飞书 open API 有 tenant token 每分钟频次上限，M1 skeleton 只 stub，W4-D5 需接入 `@larksuite/node-sdk` 的 built-in retry。
- **webhook 签名校验 stub**：M1 skeleton throw，W4-D5 装配日填 HMAC-SHA256 + timestamp 校验。
- **本 plugin 处于 skeleton 阶段**：worker/ui/ 下所有 stub function 主体都 `throw new Error(...)`，构建通过但运行 fail-fast，防止 M1 W3 阶段被误挂到生产 route。
