# M1 W4-D6 端到端 Demo 场景 · Canonical Script

**目的**：M1 收官验收；demo 完成即触发 §W4.6 DoD 里"端到端 demo 跑通至少 1 次"+"activity_log 记录了完整调用链"+"demo 录屏保存"三项。

**受众**：凯辉（demo 主演） + team（在场观摩） + AI（提供 DB 观测 + 录屏）

**耗时**：pre-flight 15 分钟 + demo 30 分钟 + 事后 review 15 分钟 = **1 小时**

---

## 0 · Pre-flight 检查表（demo 开始前 15 分钟）

一台一台 tick：

### 0.1 基础设施

```bash
# ============ Postgres 主 DB ============
docker ps | grep paperclip-db-1  # 应该 Up (healthy)
psql postgres://paperclip:paperclip@localhost:5432/paperclip -c "SELECT 1" > /dev/null && echo "✓ postgres"

# ============ cognee 侧车 ============
docker ps | grep cognee  # 应该 Up (healthy)
curl -sSf http://localhost:8000/health > /dev/null && echo "✓ cognee"

# ============ paperclip server ============
cd paperclip && pnpm --filter @paperclipai/server dev &
sleep 5
curl -sSf http://localhost:3100/api/health > /dev/null && echo "✓ paperclip server"

# ============ ngrok tunnel（team P0-2）============
curl -sSf http://localhost:4040/api/tunnels | jq -r '.tunnels[0].public_url'
# 应看到 https://xxxx-xxxx.ngrok-free.app
```

### 0.2 团队 P0 补全字段就位

```bash
cd paperclip
grep -E "BUFFER_API_TOKEN=|BUFFER_TEST_PROFILE_ID=|LARK_WEBHOOK_PUBLIC_BASE=|LARK_BOUND_CHAT_ID=" .env
# 4 行都应有非空值
```

### 0.3 test company 就绪

```bash
psql postgres://paperclip:paperclip@localhost:5432/paperclip <<'EOF'
SELECT
  c.name AS company,
  COUNT(DISTINCT cs.id) AS installed_skills,
  COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'approved') AS approved_approvals,
  COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'pending')  AS pending_approvals
FROM companies c
LEFT JOIN company_skills cs ON cs.company_id = c.id
LEFT JOIN approvals a       ON a.company_id  = c.id
WHERE c.name = 'ai-company-m1'
GROUP BY c.name;
EOF
```

期望：`installed_skills = 6` · `approved_approvals = 6` · `pending_approvals = 1`（code-reviewer 等审批）

### 0.4 飞书 App + bot 就位

```bash
# 用 lark-cli 快速验（W3 已装）
lark-cli auth status  # 应显示 App cli_aacd9209b1fa5bd7 authenticated
```

### 0.5 录屏工具就绪

```bash
which screencapture  # macOS 自带
# 或用 QuickTime "New Screen Recording" 提前打开
```

**任一项 ✗ → 停下修 pre-flight，不要开始 demo。demo 走一半崩了比不开始更糟。**

---

## 1 · Demo 6 步流程

### 全流程一图

```
Step 1: 凯辉在飞书群 @AI    "修 issue #123: Login 按钮点了没反应"
                              ↓
Step 2: paperclip-plugin-lark webhook 收到 im.message.receive_v1
        → 解析 issue 描述
        → POST /api/companies/:cid/issues 创 issue #123
                              ↓
Step 3: 触发 hire_agent approval（type=hire_agent）
        → approval-sync 发飞书交互卡片到 LARK_BOUND_CHAT_ID
        → 凯辉在飞书点"批准"
        → webhook 收 approval-callback → 更新 approval.status = approved
                              ↓
Step 4: agent (claude-code-local adapter) 起动
        → cognee memory read（历史 issue context）
        → claude-code 分析 + 修改 login-button.tsx
        → git commit + push branch fix/issue-123
        → PR 创建（GitHub / GitLab / 本地 fake）
                              ↓
Step 5: code-reviewer skill 触发 HITL
        → approval type=code_review pending
        → 凯辉在飞书批（可 reject/approve）
        → activity_log 落 code_review_decided
                              ↓
Step 6: PR merged → paperclip-plugin-lark 通知飞书群
        → Buffer MCP 发 Twitter draft "shipped issue #123 fix"
        → activity_log 落 issue_shipped
```

---

### Step 1 · 凯辉在飞书群 @AI

**你做**：飞书群里发消息 "@ai-company 修 issue #123: Login 按钮点了没反应"

**AI 观测**：另一个 terminal 打开监控（复制到全屏窗）：

```bash
psql postgres://paperclip:paperclip@localhost:5432/paperclip <<'EOF'
-- 期望：新出现一行 lark event 日志
SELECT created_at, actor_type, action, entity_type, details->>'lark_event_id' AS event_id
FROM activity_log
WHERE company_id = (SELECT id FROM companies WHERE name = 'ai-company-m1')
  AND action LIKE 'lark_%'
ORDER BY created_at DESC
LIMIT 3;
EOF
```

**期望**：≤ 3 秒内出现一行 `action = 'lark_message_received'`，`entity_type = 'lark_event'`，`details.lark_event_id` 是刚发送的消息 event id

**Fallback**：3 秒后没出现 → 检查 ngrok console (http://localhost:4040) 看 POST /webhooks/lark/event 是否到；如果 ngrok 到但 activity_log 没落，看 server log 有无异常

---

### Step 2 · Issue 自动创建

**AI 观测**：

```bash
psql postgres://paperclip:paperclip@localhost:5432/paperclip <<'EOF'
SELECT id, title, description, created_at, source
FROM issues
WHERE company_id = (SELECT id FROM companies WHERE name = 'ai-company-m1')
ORDER BY created_at DESC
LIMIT 3;
EOF
```

**期望**：新 issue，title 是从 "@ai-company 修 issue #123: Login 按钮..." 解析出的 title，source 应为 `lark_webhook` 或类似

**Fallback**：Lark webhook 收了但 issue 没落 → 说明 message → issue parser 有 bug；跳到 Step 3 用 curl 手动造 issue：
```bash
curl -X POST http://localhost:3100/api/companies/ai-company-m1/issues \
  -H "Content-Type: application/json" \
  -d '{"title":"Login 按钮点了没反应","description":"用户点 login 按钮无反应"}'
```

---

### Step 3 · Hire agent → 飞书审批卡片

**期望自动发生**：paperclip 对新 issue 触发 hire_agent approval → approval-sync 发交互卡片到飞书群

**你做**：在飞书群看到"审批：hire deep-swe-agent for issue 修 Login 按钮点了没反应？" 卡片，点"**批准**"

**AI 观测**（凯辉点批准前）：

```bash
psql postgres://paperclip:paperclip@localhost:5432/paperclip <<'EOF'
SELECT id, type, status, payload->>'issue_id' AS issue_id,
       payload->>'agent_kind' AS agent_kind, created_at
FROM approvals
WHERE company_id = (SELECT id FROM companies WHERE name = 'ai-company-m1')
  AND type = 'hire_agent'
ORDER BY created_at DESC
LIMIT 3;
EOF
```

**期望**：一行 `type = 'hire_agent'`, `status = 'pending'`

**AI 观测**（凯辉点批准后）：

```bash
# 同上 SQL 再跑一遍
# 期望：status 从 'pending' 变 'approved'
# 同时 activity_log 应该新增一行 action='approval_decided' details.decision='approved'
```

**Fallback**：卡片没出现 → 检查 `LARK_BOUND_CHAT_ID` 值对不对；bot 有没有在群里；再看 server log 里 approval-sync 有没有异常

---

### Step 4 · Agent 起动 + PR 创建

**期望自动发生**（10-90 秒）：
1. paperclip 起 claude-code-local adapter
2. adapter 读 cognee memory（issue 相关上下文）
3. claude-code CLI subprocess 分析 + 修改代码
4. commit + push + 提 PR

**AI 观测**：

```bash
# 观察 agent execution
psql postgres://paperclip:paperclip@localhost:5432/paperclip <<'EOF'
SELECT id, agent_id, status, started_at, finished_at,
       (SELECT COUNT(*) FROM heartbeat_events WHERE run_id = r.id) AS heartbeats
FROM runs r
WHERE company_id = (SELECT id FROM companies WHERE name = 'ai-company-m1')
ORDER BY started_at DESC
LIMIT 3;
EOF

# 观察 cognee read（说明 memory 起作用了）
docker logs cognee 2>&1 | tail -30 | grep -E "READ|query" | head
```

**期望**：run 状态 running → succeeded；heartbeats > 0；cognee logs 有 query 记录

**Fallback A**（agent 起不来）：check claude-code CLI 状态：`claude auth status`

**Fallback B**（PR 提不出去，无 GitHub token）：demo 里跳过真实 PR，改为在 activity_log 打一行 `pr_would_be_created` mock 即可，重点是走完 approval + review 环节

---

### Step 5 · code-reviewer skill HITL

**期望自动发生**：PR 创建后触发 code-reviewer skill；skill 在 sandbox 里跑（D18=3 sandbox=true），产出 review comments，写一个 code_review approval 到 pending

**你做**：在飞书群应看到"审批：code-reviewer 对 PR #X 结论：[approve/reject]" 卡片；决定后点批准/拒绝

**AI 观测**：

```bash
psql postgres://paperclip:paperclip@localhost:5432/paperclip <<'EOF'
SELECT id, type, status,
       payload->>'pr_url' AS pr_url,
       payload->>'skill_verdict' AS verdict,
       created_at
FROM approvals
WHERE company_id = (SELECT id FROM companies WHERE name = 'ai-company-m1')
  AND type IN ('code_review', 'code_reviewer_verdict')
ORDER BY created_at DESC
LIMIT 3;
EOF
```

**Fallback**（code-reviewer skill 未装或未接 hook）：
- D18=3 pending 的 code-reviewer approval 是 W4-D1 装的 skill 记录
- 但 skill → hook 挂 pr_created 事件的 wire-up 可能未完成
- Demo 时 fallback 到手动：`curl -X POST /api/companies/:cid/approvals` 手工造一个 code_review approval

---

### Step 6 · 完成通知 · 群消息 + Buffer draft

**期望自动发生**：
1. `paperclip-plugin-lark`：往飞书群发 "🎉 issue #X 已完成，PR merged: <url>"
2. Buffer MCP：POST GraphQL mutation `createUpdate` 到 test profile，text: "Just shipped a fix — user got faster login. Building AI-native workflows at ai-company."（草稿状态，不 publish）

**AI 观测**：

```bash
# 飞书通知发出的 message id
psql postgres://paperclip:paperclip@localhost:5432/paperclip <<'EOF'
SELECT created_at, action, details->>'message_id' AS lark_msg_id, details->>'chat_id' AS chat_id
FROM activity_log
WHERE company_id = (SELECT id FROM companies WHERE name = 'ai-company-m1')
  AND action = 'lark_message_sent'
ORDER BY created_at DESC LIMIT 3;
EOF

# Buffer draft 落地
curl -sSf https://graphql.buffer.com \
  -H "Authorization: Bearer $BUFFER_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"query { updates(profileId: \"'$BUFFER_TEST_PROFILE_ID'\", status: draft, first: 3) { id text createdAt } }"}' | jq
```

**期望**：飞书群看到通知消息 · Buffer profile 里出现 draft

---

## 2 · 录屏

**开始 demo 前**（step 0.5 之后）：

```bash
# 录 30 分钟，覆盖 demo 全流程 + 事后 activity_log dump
screencapture -v -T 1800 handoff/reports/m1-demo.mov &
SCREEN_PID=$!
```

**demo 结束后**：

```bash
kill $SCREEN_PID
# 或按 Cmd+Ctrl+Esc 停止 QuickTime
ls -lah handoff/reports/m1-demo.mov
```

---

## 3 · 事后 review（demo 结束后 15 分钟）

### 3.1 activity_log 完整调用链 dump

```bash
psql postgres://paperclip:paperclip@localhost:5432/paperclip <<'EOF' > handoff/reports/m1-demo-activity-trace.txt
SELECT created_at, actor_type, actor_id, action, entity_type, entity_id,
       jsonb_pretty(details) AS details
FROM activity_log
WHERE company_id = (SELECT id FROM companies WHERE name = 'ai-company-m1')
  AND created_at > NOW() - INTERVAL '2 hours'
ORDER BY created_at;
EOF
```

**期望**：一条按时间排序的调用链，包含（顺序无关但必须齐）：
- lark_message_received
- issue_created
- approval_requested (hire_agent)
- lark_message_sent (approval card)
- approval_decided (hire_agent → approved)
- run_started
- run_succeeded / pr_created
- approval_requested (code_review)
- approval_decided (code_review)
- lark_message_sent (完成通知)
- buffer_draft_created

**验收**（§W4.6 DoD 第 2 项）：activity_log 记录了完整调用链 → ✅

### 3.2 M1 完成标志验证

```bash
psql postgres://paperclip:paperclip@localhost:5432/paperclip <<'EOF'
-- verification：三大红旗 (memory / verifier / outbound) 都有落
SELECT
  BOOL_OR(action = 'cognee_query')        AS memory_used,
  BOOL_OR(action = 'skill_installed')     AS verifier_installed,
  BOOL_OR(action = 'lark_message_sent')   AS outbound_used
FROM activity_log
WHERE company_id = (SELECT id FROM companies WHERE name = 'ai-company-m1');
EOF
```

**期望**：三列全 `t` (true) → M1 §W4.6 DoD 第 3 项 ✅

### 3.3 生成 m1-final-report.md

Demo 通过后，AI 自动生成 `handoff/reports/m1-final-report.md`：
- Demo 录屏链接（本地路径）
- activity_log 关键行的引用（issue_id、approval_ids、run_id、buffer_draft_id、lark_msg_ids）
- 4 周实际 vs 估算对比（W1-W4 partial 汇总）
- 触发的所有 Plan B 汇总（D-M1-14/15/16/17）
- M2 承接清单

---

## 4 · Fallback Playbook（每个 step 都跪了怎么办）

**§W4.7 问题 3**：如果整链 3 次试跑都不通，**分段演示 3 个 sub-demos**：

### Sub-demo A · 记忆链
1. 手动 curl create issue
2. 手动 curl trigger agent（skip 飞书环节）
3. 观察 cognee query（证明 memory 起作用）
- 覆盖：三大红旗中的 memory

### Sub-demo B · 修 bug + PR
1. Sub-demo A 基础上 agent 修完代码
2. commit + push
3. 观察 PR
- 覆盖：三剑客 adapter + agent execution 主链

### Sub-demo C · 通知
1. 手动 curl trigger `paperclip-plugin-lark` 发消息 action
2. 手动 curl trigger Buffer MCP mutation
- 覆盖：三大红旗中的 outbound

**Sub-demo A + B + C 分别通** = §W4.6 DoD "端到端 demo 跑通" ≈ 覆盖度足够，PR merge review 时可以说明"整链因 X 问题拆解验证，M2 再合"。

---

## 5 · Demo 期间 AI 分工

**主 session**（凯辉在场）：
- pre-flight 检查上一节 0.x 每一项亲手 tick
- 每一步启动前给凯辉一句提示："下一步：Step X，你做 Y，我观察 Z"
- 每一步 DB query 结果实时 gist 到 session
- 步骤失败立刻切 Fallback Playbook，不硬撑

**Subagent**（可派）：
- 一个专门盯 server log 的 subagent（`tail -f server.log | grep ERROR`）
- 一个专门盯 cognee log 的 subagent（`docker logs -f cognee | grep ERROR`）
- 一个专门盯 ngrok tunnel 的 subagent（http://localhost:4040 monitoring）

---

## 6 · 最短快乐路径（无异常时）

如果一切顺利：
```
15 min pre-flight  →  30 min demo  →  15 min review = 1 hour · demo 完
```

结果：
- ✅ §W4.6 DoD 第 1 项（demo 跑通）
- ✅ §W4.6 DoD 第 2 项（activity_log 完整链）
- ✅ §W4.6 DoD 第 3 项（三大红旗全绿）
- ✅ §W4.6 DoD 第 5 项（m1-final-report.md）
- ✅ §W4.6 DoD 第 6 项（demo 录屏）
- 🅿️ §W4.6 DoD 第 4 项（SWE-bench baseline）等 Codex + Cursor CLI 装了 M2 补

**M1 收官 = 5/6 DoD 绿**，最后一项策略性推 M2，可宣布 M1 完成。
