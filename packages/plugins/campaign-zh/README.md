# E2 · 中文 Campaign Workflow plugin · Kick-off PRD (M5-02)

**Status**: ⏸ **PRD only · 无实现**（per handbook §M5-02: "E2 中文 Campaign · 依附 L5-05 · plugin"）

**Component ID**: L5-13 (per `handoff/02-架构与决策.md` §5.6)

**关键**: 依附 M2 W7-D1 `campaign-workflow` plugin · 中文分支 · 无独立 orchestrator · 复用 pattern

---

## 1. Why · 为什么做这个 plugin

**目标**：给 M2 W7-D1 装的 `campaign-workflow` 加**中文分支** · 复用 wewrite (M2 W8-D1) + 火山方舟 (M2 W8-D2) provider · 产出针对中文市场的完整 campaign

**为什么"依附"而非"独立"**：
- Campaign Workflow (M2 W7-D1 · 52 tests · Pattern-4) 已就位 · pure orchestrator planCampaign(brief) → Plan
- 中文分支 = 换 provider（Claude → 火山方舟）+ 换 skill（claude-blog → wewrite）+ 加中文特有 stage（微信公众号 · 视频号 · 小红书）
- **本质是 profile / preset 而非 new orchestrator** · 复用 Pattern-4 + 加中文 preset

**与 M1-M4 已有的关系**：
- **campaign-workflow (M2 W7-D1)**：本 plugin 依附 · 复用 orchestrator + entities
- **wewrite skill (M2 W8-D1)**：中文公众号图文生成 · content stage 走 wewrite
- **火山方舟 (M2 W8-D2)**：中文 LLM provider · 全部中文 completion 走 volcengine_ark
- **cold-email M4-02 (中文分支 B)**：若 M4-DP2 = B → cold-email 复用本 plugin 的 wewrite skill 生成中文邮件正文
- **chinese-video M3-03 (E1)**：kick-off 独立 · 但**共享**中文 LLM provider + 目标客群假设 · 本 plugin 与 chinese-video 有内容对齐

---

## 2. 人工决策点 · TODO(user-decision)

### 2.1 中文平台组合 · TODO(user-decision)

**手册 §M5-02 隐含**：中文 Campaign 输出的平台组合与 chinese-video (M3-03) 目标平台强相关

| 平台 | 类型 | 依赖 skill |
|---|---|---|
| 微信公众号（图文） | 长文 | wewrite (已装) |
| 微信视频号（视频 30s） | 视频 | chinese-video (M3-03 · M4-M5 装) |
| 小红书（图文 + 视频） | 混合 | wewrite + chinese-video |
| 抖音 / 快手 | 视频 | chinese-video |
| B 站（长视频） | 视频 | chinese-video |
| 知乎（图文 + Q&A） | 长文 | wewrite + 专属 skill(M5+) |

**建议 default**（等用户 override · 与 M3-03 E1 default 对齐）：
- 优先级 5：微信公众号（wewrite 已装 · 生态就绪）+ 微信视频号
- 优先级 3：小红书 + 抖音（与 M3-03 E1 复用）
- 优先级 1：B 站 / 知乎（M6+ 观察）

**与 M3-03 决策共动**：若用户已拍板 M3-03 E1 5 项 TODO 中的"目标平台优先级"· 本 PRD 自动对齐

### 2.2 中文品牌语调 · TODO(user-decision)

- SaaS 老板向：专业 · 干货 · 少 emoji
- 独立开发者：技术 · 硬核 · 长文
- 电商向：热情 · 促销 · 多 emoji + 表情包
- 传统企业：正式 · 稳重 · 少互动
- 微信生态特色："家人们"、"上车了"、"绝了"等平台梗接受度

**建议 default**（与 ai-company 目标客群 SaaS 老板 + 独立开发者对齐）：**专业 + 硬核 · 少 emoji · 长文**

### 2.3 内容日历节奏 · TODO(user-decision)

- 微信公众号：1-3 篇/周 or 每日？
- 视频号：1-2 视频/周？
- 小红书：日更 · 高互动？

**建议 default**：微信公众号 2 篇/周 · 视频号 1 视频/周 · 小红书 3-5 篇/周

---

## 3. What · plugin 结构

**plugin id**: `ai-company.paperclip-plugin-campaign-zh`
**版本**: `0.0.1-alpha.0` (kick-off)
**category**: `agent`（同 campaign-workflow · 因为主动 orchestrator）

### 3.1 目录结构（复用 campaign-workflow pattern · 精简）

```
packages/plugins/campaign-zh/
├── README.md              ← 本 PRD (M5-02)
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── manifest.ts         ← 复用 M2 W7-D1 pattern (Pattern-2)
    ├── preset.ts           ← 中文 preset (provider / skill / platform / tone / 节奏)
    ├── preset.test.ts
    ├── orchestrator-zh.ts  ← 依附 planCampaign · 加中文 stage · Pattern-4 pure
    ├── orchestrator-zh.test.ts
    ├── worker.ts           ← onWebhook 分发 (Pattern-2)
    └── worker.test.ts
```

### 3.2 SDK capabilities（复用 campaign-workflow）

```
capabilities: [
  "webhooks.receive",
  "plugin.state.read",
  "plugin.state.write",
  "activity.log.write",
  "http.outbound",           // 走 wewrite / chinese-video / 平台 API
  "secrets.read-ref",        // VOLCENGINE_ARK_KEY (M2 W8-D2 已就位)
  "issues.read",
  "issues.write",
]
```

### 3.3 Manifest webhooks

```
webhooks: [
  { endpointKey: "create-zh-campaign",
    displayName: "Create Chinese campaign",
    description: "POST body { brief, target_platforms, tone_preset } → parent issue + child stages" },
  { endpointKey: "publish-batch",
    displayName: "Publish stage output to platforms",
    description: "POST body { campaign_id, stage_id } → dispatch to platform-specific worker (wechat / xhs / douyin)" },
]
```

---

## 4. 装配路径与依赖

**装配路径**：SDK canonical path · 依附 campaign-workflow · 复用 Pattern-2/4/8 (allowlist for external sanitize)

**装配时机**：M5-M6 · **本 M5 只做 kick-off PRD + skeleton**（skeleton 已就位 · 见 §3.1）

**依赖**：
- ✅ campaign-workflow (M2 W7-D1 · 52 tests)
- ✅ wewrite skill (M2 W8-D1)
- ✅ 火山方舟 provider (M2 W8-D2)
- ⏸ chinese-video (M3-03 · kick-off PRD only · MVP M4-M5)
- ⏸ M3-03 E1 5 项 user-decision · 对齐平台优先级

---

## 5. TODO(team-verify)

- 各平台 publish API shape（微信公众号图文素材接口 · 视频号视频素材接口 · 小红书 open platform · 抖音开放平台）· team 申请账号后反馈 API doc + sample response
- 火山方舟中文 completion 质量（vs Claude 中文）· 装配前 team 跑 5-10 sample 对比

---

## 6. Cross-references

- **手册**：`handoff/05-施工手册-M3+.md` §M5-02
- **架构**：`handoff/02-架构与决策.md` §5.6 L5-13
- **依附 plugin**：`packages/plugins/campaign-workflow/` (M2 W7-D1)
- **姊妹 plugin**：`packages/plugins/chinese-video/README.md` (M3-03 E1 · kick-off · MVP M4-M5)
- **skill**：wewrite (M2 W8-D1)
- **provider**：火山方舟 (M2 W8-D2)
- **Pattern**：Pattern-2 (manifest.webhooks) · Pattern-4 (pure orchestrator) · Pattern-8 (sanitize allowlist)

---

## 7. Status 追踪

| 里程碑 | 状态 |
|---|---|
| PRD 撰写（本文件）| ✅ M5-02 kick-off |
| package.json + tsconfig + vitest.config | ✅ skeleton |
| M3-03 E1 5 项决策会议对齐 | ⏸ user · 与 M3-03 共动 |
| M5 preset.ts + orchestrator-zh.ts + worker.ts | ⏸ M5 装配启动条件 |
| Team 申请平台账号（微信 / 小红书 / 抖音）| ⏸ +M5 P1 shopping list · 与 M3-03 共用 |
| M6 完整 MVP（含 publish batch flow）| ⏸ |
