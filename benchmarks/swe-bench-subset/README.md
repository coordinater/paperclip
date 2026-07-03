# SWE-bench Lite Subset · M2 W5-D4

**用途**：M2 W8 验证点用的 SWE-bench 子集 —— 从 princeton-nlp/SWE-bench_Lite 300 题里挑 10-20 题作为定期跑基线的样本集。

**AI-only 边界**：本目录含 selection 脚本 + runner skeleton + 空 `w8-verify-list.txt`（等 team 装 swebench 后运行 selector 填齐）。手册 §W5.D4 建议子集覆盖 3 repo：sympy / django / astropy。

---

## 文件

| # | 文件 | 用途 |
|---|---|---|
| 1 | `select-subset.py` | 从 SWE-bench Lite 里挑 10-20 instance · 覆盖 3 repo · 均匀分布 |
| 2 | `run-single.py` | 跑单个 instance 的 harness · 用于 smoke test |
| 3 | `w8-verify-list.txt` | 最终 instance id 列表（每行一个 · 由 `select-subset.py` 填 · 首装是空） |
| 4 | `README.md` | 本文件 |

## 装配步骤（team + AI）

### Step 1 · team 装依赖（一次性 · 需 Python 3.11 + Docker）

```bash
pip install --user swebench
python -c "from swebench.harness.constants import LITE_INSTANCES; print(len(LITE_INSTANCES))"
# 应输出 300
docker --version   # SWE-bench harness 用 Docker 起测试容器
```

### Step 2 · AI 选子集（跑 selector · 快 · 无 side effect）

```bash
cd benchmarks/swe-bench-subset
python select-subset.py --repos sympy django astropy --per-repo 5 --seed 42
# 写入 w8-verify-list.txt · 15 行 · 每 repo 5 题
```

### Step 3 · smoke test 跑 1 个 sample（team 触发 · 需 Docker 起容器）

```bash
python run-single.py --instance-id "$(head -1 w8-verify-list.txt)"
# 拉 Docker image (可能几 GB · 首次慢)
# 输出：patch apply · pytest 运行 · 通过/失败标记
```

### Step 4 · 完整跑（M2 W8 触发 · 长）

由 M2 W8 verify skill 或手工触发 · 循环 `w8-verify-list.txt` 每行 → 记结果到 `results/`。

## 与 baseline-m1.md 的关系

M1 baseline（`handoff/reports/baseline-m1.md`）用同一 selector，但**跑三剑客 CLI（Claude / Codex / Cursor 装了后）**而非 SWE-bench harness。M2 W5-D4 的 SWE-bench harness 才是官方 pass/fail 判定。

## 与 M2 W5-D1 mini-swe-agent adapter 的关系

W5-D1 装了 mini-swe-agent adapter，M2 W8 可以让 paperclip hire 一个 `mini_swe_local` agent 去跑本子集里的每个 instance。**这是 mini-swe-agent 与 SWE-bench harness 的第一次接线点**。

## 已知限制

- **selector 只按 repo 均匀分布**，不按难度分层。M3 可加 difficulty tag（低/中/高）+ 分层抽样
- **run-single.py 是 skeleton**（真调用 `swebench.harness.harness_run` 需 team 首跑时按 swebench 版本调整 API 签名）
- **无并行**（每次跑 1 instance）· M3 若要 CI 化可加 `--parallel N`
- **Docker 依赖**：SWE-bench harness 每题起一个 container · 首次拉 image 慢（GB 级）· 用 aliyun mirror 加速见 handbook §W5"典型问题诊断"

## 交叉引用

- 手册章节：`handoff/04-施工手册-M2.md` §W5.D4
- 手册 §W8 验证点：SWE-bench pass rate 是 M2 结束的硬指标
- Team 依赖：`handoff/reports/team-shopping-list.md` P1（新增 pip install swebench + Docker）
- M2 W5-D1 mini-swe-agent adapter：`packages/adapters/mini-swe-agent-local/`（本子集的第一个 agent target）
