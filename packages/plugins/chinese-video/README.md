# E1 · 中文短视频/图文 agent · Kick-off PRD (M3-03)

**Status**：⏸ **PRD only · 无实现**（per handbook §M3-03："立项 kick-off · 不含 MVP · 只做技术设计 + PRD + skill/plugin 分工"）

**关键**：**大量 TODO(user-decision) · 需人工产品决策**（handbook §M3-03 明说 "kick-off 阶段就召集用户会议 · 输出目标平台 + 类型硬约束"）

---

## 1. Why · 为什么做这个 agent

**目标**：让 ai-company AI 公司自主生产 "面向中文 SMB 决策者"的**短视频 / 图文**内容 · 覆盖抖音 / 小红书 / 微信视频号 / 公众号 · 用于产品/品牌传播。

**与 M2 已有的关系**：
- **Campaign Workflow (M2 W7-D1)**：Campaign Workflow 产出 blog + social + ads · 但**中文短视频**是 social 的一种，需要更专门的 skill · 本 plugin 补齐
- **wewrite (M2 W8-D1 · content-marketer 代表)**：wewrite 生成公众号图文 · 本 plugin 覆盖视频 + 短视频文本
- **火山方舟 (M2 W8-D2)**：中文 LLM provider · 本 plugin 用它跑中文文案生成
- **Buffer MCP (M1 W4-D2)**：Buffer 主要 IG/Twitter/LinkedIn · 中文平台需自建 API

---

## 2. 人工决策点 · TODO(user-decision)

**手册 §M3-03 明说**：以下决策**不是 AI 可自主项** · 必须召集用户会议决定：

### 2.1 目标平台优先级 · TODO(user-decision)

按重要性排序（1-5 · 5 = 最优先）：

| 平台 | 重要性 (待用户填) | 备注 |
|---|---|---|
| 抖音 | ? | 视频 · 15-60s · 短视频算法竞争激烈 |
| 小红书 | ? | 图文 + 视频 · 女性向 · SMB 决策者匹配度 medium |
| 微信视频号 | ? | 视频 · 与公众号联动 · B端曝光佳 |
| 微信公众号 | ? | 图文 · M2 wewrite 已覆盖 · 是否本 plugin 也接？ |
| B 站 | ? | 视频 · 长视频 · 技术类观众 |
| 知乎 | ? | 图文 · SEO 强 · SMB 决策者匹配度 high |

**建议 default**（等用户 override）：
- 优先级 5：小红书 + 微信视频号（B端匹配）
- 优先级 3：抖音（曝光量 · 但难做 conversion）
- 优先级 1：B站 / 知乎（后续启用）

### 2.2 内容类型优先级 · TODO(user-decision)

| 类型 | 重要性 | 备注 |
|---|---|---|
| 图文 (小红书风) | ? | 门槛低 · AI 可批量生成 · SEO/发现算法友好 |
| 短视频 (抖音风 15-60s) | ? | 需视频合成 · 门槛高 · CAC 高 |
| 长视频 (B站 3-10 min) | ? | 门槛最高 · 深度内容 · 品牌塑造 |
| Reels (视频号 30s) | ? | 类抖音 · 与微信生态联动 |

**建议 default**（等用户 override）：图文优先 · 短视频次之 · 长视频推 M6+

### 2.3 目标行业 · TODO(user-decision)

现有 AI-company 目标是 "SMB 决策者" · 但**行业**未定：
- SaaS 创业公司老板？
- 中小型电商老板？
- 传统行业转型的高管？
- 独立创业者 / freelancer？

**这直接决定 Campaign brief 的 audience persona · brand voice · 内容主题** · 无法由 AI 拍板

### 2.4 商业模式绑定 · TODO(user-decision)

- 视频 CTA 直接到"产品试用"？还是"预约 demo"？还是"关注公众号沉淀私域"？
- 是否用视频合成付费工具（剪映专业版 / Runway / etc）？如是，谁申请账号？

---

## 3. 技术设计（AI 可自主 · 不等用户决策）

### 3.1 Plugin 分工

```
packages/plugins/chinese-video/
├── src/
│   ├── manifest.ts           # 声明 webhooks + capabilities
│   ├── worker.ts             # 分发 4 endpoints
│   ├── orchestrator.ts       # brief → 平台分发 · 复用 W7-D1 pattern
│   ├── generators/
│   │   ├── xiaohongshu.ts    # 小红书图文（标题 + 3-5 段 + 3-5 张图）
│   │   ├── douyin.ts         # 抖音短视频脚本
│   │   ├── videohao.ts       # 视频号
│   │   └── zhihu.ts          # 知乎图文
│   ├── platform-clients/
│   │   ├── xiaohongshu-client.ts  # 小红书发布 API（若开放）· 否则手工发布
│   │   ├── douyin-client.ts       # 抖音 API 或 Cookie 模拟
│   │   ├── videohao-client.ts     # 视频号 API
│   │   └── zhihu-client.ts        # 知乎发布 API
│   └── prompts/
│       ├── xiaohongshu.ts    # prompt template · 中文标题格式 · 15 字内
│       ├── douyin.ts         # 抖音脚本模板 · 3-5 秒钩子 + 15-30s 展开
│       └── ...
```

### 3.2 Skill 分工

**装到 company skills**（走 install_skill approval · D18 评估）：

| Skill | 上游 | D18 | 用途 |
|---|---|---|---|
| `chinese-copywriting` | wshobson content-marketing 或自建 | 3 | 中文文案 base skill |
| `xiaohongshu-formatter` | 自建 | 3 | 小红书标题 15 字内 + 3 段结构 |
| `douyin-hook-writer` | 自建 | 3 | 抖音前 3 秒钩子 |
| `chinese-seo-keyword` | 自建 或 wshobson seo-content | 3 | 中文 SEO 关键词工具 |
| `video-storyboard` | 自建 · M4+ | 3 | 短视频分镜稿 |

M3 阶段：**先自建 3 个 skill (xiaohongshu-formatter / douyin-hook-writer / chinese-seo-keyword)** · 走 Anthropic Skills 官方格式（对齐 M2 W5-D2 Agentless / W6-D2 stateful-prompt 制作方式）· D4-D5 装到 company skills。

### 3.3 与 W7 Campaign Workflow 集成

**上游**：Campaign Workflow (W7-D1) orchestrator 拆 brief 时 · 若 `socialChannels` 含中文平台，路由到本 plugin 而非默认 social 生成路径

**下游**：本 plugin 产出发布到 `Buffer` (国外) 或直接调**平台 client**（国内）· 结果回写 plugin_state `campaign_history.outputs`（scope=brand_asset）

### 3.4 与火山方舟集成

生成中文内容时 · 优先使用 `volcengine_ark` provider (M2 W8-D2)：
- `doubao-1.5-pro-256k` for long-form (公众号 · B站)
- `deepseek-v3-241226` for short-form (抖音 · 小红书) · cost-effective
- `qwen-plus` for SEO keyword extraction

Provider adapter 未装（M3+ 补 · TS 侧 openai-compatible adapter 或 hermes-gateway）

---

## 4. 平台 API 现状 · 需 team 调研

**待 team 调研**（AI 无法从 docs 判断 API 是否开放）：

| 平台 | 官方 API 开放？ | Cookie 模拟风险 | 建议路径 |
|---|---|---|---|
| 小红书 | Business API 有 · 但受审 · 个人号无 API | Cookie 模拟违 ToS | 走 Business 账号申请 · 3-5 天审核 |
| 抖音 | 开放平台 · 抖音企业号 API 可用 | 违 ToS | 走企业号申请 · 已确认可跑 |
| 微信视频号 | 视频号助手 API 有 · 但需公众号绑定 | 违 ToS | 与公众号一起申请 |
| 微信公众号 | 完备 API | 违 ToS | M2 wewrite 已覆盖 · 复用 |
| 知乎 | 无官方 API | 中风险 | 走机构号 · 或手工发布 M3+ |

---

## 5. Milestones（M4-M6 逐步 · 不是 M3）

**M3**：本 PRD + kick-off 会议 + skill/plugin 分工确定 · 手册 §M3-03 交付
**M4**：装 3 个自建 skill (chinese-copywriting · xiaohongshu-formatter · douyin-hook-writer) · 生成 chinese-video/src/orchestrator.ts skeleton
**M5**：跑第一个真发布（一个平台 · MVP）· team 补齐平台账号
**M6**：三平台并发发布 · 与 Meridian (M2 W7-D3) 集成 · 出中文渠道 MMM

---

## 6. Cross-References

- Campaign Workflow (W7-D1): `packages/plugins/campaign-workflow/src/orchestrator.ts` · 上游 orchestrator
- wewrite (W8-D1): `packages/plugins/ai-company/scripts/install-m2-w8-skills.ts` · content-marketer 已装
- 火山方舟 (W8-D2): `packages/plugins/ai-company/runtime-config/llm-providers.yaml` · 中文 LLM
- Meridian (W7-D3): `packages/plugins/meridian-http-plugin/` · MMM 归因中文渠道
- Buffer (W4-D2): 国外发布路径 · 与本 plugin 平台 client 分工
- Handbook: `handoff/05-施工手册-M3+.md` §M3-03

---

## 7. TODO(user-decision) 汇总

**M3 kick-off 会议前必回答**（否则 M4 无法进 MVP）：

1. **§2.1** 平台优先级（默认建议：小红书 P5 + 视频号 P5 + 抖音 P3）
2. **§2.2** 内容类型（默认建议：图文优先 · 短视频次之）
3. **§2.3** 目标行业（无 default · **必须用户输入**）
4. **§2.4** CTA + 视频合成工具（无 default · **必须用户输入**）
5. **§4** 平台 API 申请 · 谁负责申请（运营 / 凯辉）
