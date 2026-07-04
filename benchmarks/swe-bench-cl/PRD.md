# SWE-Bench-CL Runner · PRD (Kick-off · M3-05)

**Status**：⏸ **PRD only · 无实现**（per handbook §M3-05："立项 kick-off · 不实现 · 只做 PRD + evaluation harness 骨架"）

**受众**：M3-M4 承接的 AI + 团队 · 决定 kick-off 后是否装 SWE-Bench-CL 完整 runner（M4 起）

---

## 1. Why · 与 SWE-bench 子集（M2 W5-D4）的区别

SWE-bench Lite / Verified 是**独立同分布**的 benchmark：每个 instance 单独跑 · 无 task 顺序 · 无 continual learning 维度。

**SWE-Bench-CL** 是**连续学习** benchmark：

- Instance 按**顺序**跑（e.g. 时间戳递增 · 版本递增 · 或用户特定 sequence）
- Agent 保留**记忆**（cognee / mem0 / letta-code）从上一 instance 转到下一 instance
- 目标：测**记忆层贡献**（vs 无记忆 baseline）
- 关键指标：**Adaptation Rate** = "任务 N+1 的 verified 率 - 任务 N 的 verified 率"

**与 M2 W5-D4 subset 关系**：subset 是**同一批 instance**，SWE-Bench-CL 是**排序 + 记忆感知**。SWE-Bench-CL runner 复用 subset 里的 `select-subset.py`（挑 instance）+ `run-config.py`（跑单 config），但加：
- Task ordering config（时间顺序 / 依赖顺序 / 用户指定顺序）
- Memory carry-over config（cognee 是否 wipe 或 keep · mem0 是否 A/B）
- Adaptation Rate 计算

---

## 2. What · 交付列表（M4-M5 逐步 · 不是 M3）

- [ ] `benchmarks/swe-bench-cl/config-cl-{a,b,c}.yaml`（对齐 M2 W5 三配置 · 加 memory_policy 段）
- [ ] `benchmarks/swe-bench-cl/order-strategy.py`（time-ordered · dependency-ordered · custom）
- [ ] `benchmarks/swe-bench-cl/run-cl.py`（extend `run-config.py` · 加 memory carry-over 逻辑）
- [ ] `benchmarks/swe-bench-cl/adaptation-rate.py`（分析 · 出 Adaptation Rate 曲线）
- [ ] `handoff/reports/swe-bench-cl-results.md`（结果表 · 类比 W8-D5 canonical 表）

**M3 只做本 PRD**。M4 起装配。

---

## 3. Prerequisites

- M2 W5-D4 SWE-bench subset 走通（`benchmarks/swe-bench-subset/`）
- M2 W8-D5 三配置数据入档（`swe-bench-verification-w8.md`）
- **M3 mem0/letta-code 决策定**（由 `m3-decision-record.md` D-M3-01/02 · Config C ≥30% / 20-30% / <20% 三档）
  - 若 D-M3-01 说 mem0 装 · SWE-Bench-CL 是 mem0 独立贡献的真正评测点
  - 若 D-M3-01 说 mem0 不装 · SWE-Bench-CL 降为 optional（cognee-only 的连续学习）
- OpenHands adapter（M3-01 · 已就位 · 28 tests）作为可能的 continual agent

---

## 4. 关键设计决策（M4 时锁死）

### 4.1 Task ordering 策略

| 策略 | 描述 | 何时用 |
|---|---|---|
| `time_ordered` | 按 GitHub PR 合并时间戳升序 | Default · 模拟真实项目演进 |
| `dependency_ordered` | 拓扑排序（如 issue A fix 依赖 B fix 已合）| 依赖复杂的 repo（sympy / django）|
| `custom_order` | 显式 `order.txt` 行序 | User-defined benchmark scenario |

### 4.2 Memory carry-over 策略

| 策略 | Cognee | mem0 | 何时用 |
|---|---|---|---|
| `no_memory` | wipe between instances | wipe | Baseline · 与 M2 W5-D4 相同 |
| `carry_cognee` | keep | wipe | 测 cognee 独立贡献 |
| `carry_both` | keep | keep | 全栈 continual |
| `carry_selective` | keep vector search index · wipe conversation | keep | Cognee vector 层 vs 会话层 分离测 |

### 4.3 Adaptation Rate 定义

```
AR(N) = verified_rate(task N+1..N+k) - verified_rate(task N..N+k-1)
      // k = 5 · sliding window · N ∈ [0, total-2k]

Overall AR = mean(AR(N) over N)
```

**正 AR**：记忆确实有 continual 贡献
**~0 AR**：记忆无差异 · continual 不增益（可能记忆内容不 transfer）
**负 AR**：记忆干扰（catastrophic forgetting / distraction）

---

## 5. Composition · 与其他 M3 交付物

- **MAGIS-lite (M3-02)**：SWE-Bench-CL 可以让 MAGIS Manager 决定"哪些 instance 走 continual · 哪些 wipe"（decision-agent 组合）
- **OpenHands adapter (M3-01)**：OpenHands + Docker runtime 天然支持 memory carry-over（container 之间共享 memory volume）
- **stateful-prompt-format skill (M2 W6-D2)**：FSM 状态跨 instance 保留 · 与 SWE-Bench-CL 的"跨 task memory"呼应

---

## 6. Non-Goals（M4-M5 明确不做）

- 训练/fine-tune agent（本 benchmark 是 eval-only）
- Reward shaping（不改 agent 内部 policy）
- Multi-repo continual（单 repo 内 continual 已足够 · 跨 repo 推 M6+）
- Real production traffic（合成 benchmark · 非用户真数据）

---

## 7. Risks · Plan B

| 风险 | Plan B |
|---|---|
| Adaptation Rate 全都 ~0（记忆无 continual 贡献）| 缩短 sliding window k · 或 revisit memory carry-over 策略 · 或宣告"记忆 continual 不增益" 作为 M6 结论 |
| Memory OOM（累积 k instance 后 cognee vector 超出内存）| 引入 memory eviction policy · LRU by "instance-since-touched" |
| Ordering 争议（time_ordered 与真实业务 sequence 不匹配）| custom_order.txt 允许用户自定义 |
| SWE-Bench-CL upstream 无公开数据集 | 用 SWE-bench Lite subset + 手工 order 作为 M3 POC 起点 · 未来对齐上游 |

---

## 8. Rollout（M4-M5）

**M4 W1-W2**：装 order-strategy.py + config-cl-*.yaml
**M4 W3-W4**：装 run-cl.py + memory carry-over 逻辑
**M5 W1**：跑一个 config-cl-a（time_ordered · no_memory）作 baseline
**M5 W2**：跑 config-cl-b/c 出 AR 曲线
**M5 W3**：填 `swe-bench-cl-results.md` + 决策 mem0 / letta-code 是否装真 continual

---

## 9. Cross-References

- Base benchmark harness：`benchmarks/swe-bench-subset/` (M2 W5-D4 + M2 W8-D5)
- Memory 决策：`handoff/reports/m3-decision-record.md` D-M3-01/02
- Related plugin：MAGIS-lite (M3-02) · OpenHands adapter (M3-01)
- Handbook：`handoff/05-施工手册-M3+.md` §M3-05
