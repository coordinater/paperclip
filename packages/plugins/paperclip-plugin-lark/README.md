# @ai-company/paperclip-plugin-lark

## 用途

PaperClip 底座 ↔ 飞书（Lark）桥：飞书群消息 / 交互卡片 / open platform webhook 事件双向映射到 PaperClip 的 `approvals` / `issues` / `activity_log`。M1 支持一类 `approval(hire_agent)` 双向绑定（用交互卡片模拟真飞书审批 · DEV-4）；其他 approval 类型（`spawn_run` / `install_skill` / `connect_env`）+ 真飞书 `approval.v4.instance` M2 补齐。

## 装配路径

**本地开发**：

```bash
pnpm install                                              # monorepo 根
pnpm --filter @ai-company/paperclip-plugin-lark build     # tsc → dist
pnpm --filter @ai-company/paperclip-plugin-lark test      # 17 vitest（webhooks + approval-sync）
```

**注册到 PaperClip**：

- UI Plugin Registry 装 local file，或
- CLI：`paperclipai plugin install packages/plugins/paperclip-plugin-lark`

**首次启动前置**：

1. `company_secrets` 里注入 `LARK_APP_ID` / `LARK_APP_SECRET` / `LARK_VERIFICATION_TOKEN` / `LARK_ENCRYPT_KEY`（W3-D6 由用户提供 App）
2. `paperclip/.env` 补 `LARK_WEBHOOK_PUBLIC_BASE`（team P0-2 ngrok 或生产域名）+ `LARK_BOUND_CHAT_ID`（team P0-3）
3. 飞书 open platform "事件与回调" + "审批回调" 分别注册请求地址：`${LARK_WEBHOOK_PUBLIC_BASE}/api/plugins/ai-company.paperclip-plugin-lark/webhooks/{event,approval-callback}`

## 依赖

- PaperClip 底座 >= `v2026.626.0`（fork 锚定 · 06-规范 §2.4）
- Node.js >= 20
- `@paperclipai/plugin-sdk`（workspace 依赖 · 稳定契约层 · 06 §2.3）
- **`@larksuiteoapi/node-sdk`**（MIT · 616 dependents · 2M 周下载 · 2026-06-25 发布 · 真实包名 · 见 `handoff/reports/errata.md` E-1；不要用手册里的 `@larksuite/node-sdk`）
- `vitest`（dev · 主线已用）

## 配置项

| 键 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `larkAppId` | secret ref | — | `{{secret:LARK_APP_ID}}` |
| `larkAppSecret` | secret ref | — | `{{secret:LARK_APP_SECRET}}` |
| `larkVerificationToken` | secret ref | — | `{{secret:LARK_VERIFICATION_TOKEN}}`（webhook challenge + 签名前置校验） |
| `larkEncryptKey` | secret ref | — | `{{secret:LARK_ENCRYPT_KEY}}`（可选，AES-256-CBC event 解密） |
| `defaultChatId` | string / env | — | `LARK_BOUND_CHAT_ID` · M1 支持一个默认审批通知群 |
| `webhookPublicBase` | string / env | — | `LARK_WEBHOOK_PUBLIC_BASE` · 飞书 open platform 请求地址前缀（ngrok / Cloudflare tunnel / 生产域名）|
| `eventDedupeTtlDays` | int | `30` | 已处理 event id 去重窗口（state 层） |

Secrets 通过 SDK `ctx.secrets.resolve(ref: SecretRef)` 读取 —— 不是 `ctx.secrets.get(key)`（errata E-2）。

## 已知限制

- **审批模拟而非真飞书 open platform approval**：M1 用 `im.v1.message.create` 发交互卡片 + callback 完成"批准/拒绝"UX · 真飞书 `approval.v4.instance.create` 需 approvalCode（企业管理员在 admin console 提前创建，飞书人工审核 1-3 天）· M2 team 拿到 admin 权限时迁移 · 映射存 `plugin_ai_company_meta` 里 `instance:${code}` → `{approvalId}` · 详见 `deviations.md` DEV-4
- **只支持 1 类 approval 双向绑定**：`hire_agent` · 其他 M2 补
- **`approvals.status` 反向写回 core 未接**：M1 只走 plugin state，M2 补 sync-back handler（DEV-4）
- **speed rate limit 依赖 SDK built-in**：无自建 backoff · 飞书 tenant token 每分钟频次上限走 `@larksuiteoapi/node-sdk` 内置 retry
- **签名校验**：HMAC 校验已在 `webhooks.ts` 实装（W4-D5），依赖 `LARK_VERIFICATION_TOKEN` 正确注入

## 交叉引用

- 手册章节：`handoff/03-施工手册-M1.md` §W3.3（skeleton）§W4.3（W4-D5 装配）
- SDK 表面偏差：`handoff/reports/errata.md` E-1（包名）E-2~E-5（ctx 表面）
- Deviation：`handoff/reports/deviations.md` DEV-4（模拟审批）
- Team 补全清单：`handoff/reports/team-补全清单-M1-W4收尾.md` P0-2 / P0-3
- W4-D5 装配日 commit：`bfc0930d3`
