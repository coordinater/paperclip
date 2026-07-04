#!/usr/bin/env python3
"""
Aggregate Config A/B/C summary.json files into the canonical W8 markdown table
required by handbook §W8.D5.

Usage:
    python summarize.py \
      --config-a results/config-a/summary.json \
      --config-b results/config-b/summary.json \
      --config-c results/config-c/summary.json \
      --output ../../../handoff/reports/swe-bench-verification-w8.md

Requires: python 3.11+ (no external deps).
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path


def load(path: Path | None) -> dict | None:
    if path is None:
        return None
    if not path.exists():
        print(f"[warn] {path} not found — treating as missing", file=sys.stderr)
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def fmt_pct(rate: float | None) -> str:
    if rate is None:
        return "N/A"
    return f"{rate:.1%}"


def config_row(label: str, stack: str, summary: dict | None) -> str:
    if not summary:
        return f"| {label} | {stack} | — | N/A | — | — |"
    total = summary.get("total_instances", 0)
    verified = summary.get("verified_count", 0)
    return (
        f"| {label} | {stack} | {verified}/{total} | "
        f"{fmt_pct(summary.get('verified_rate'))} | — | — |"
    )


def failure_row(summary: dict | None) -> str:
    if not summary:
        return "- (Config C 数据缺失 · 无法分类失败原因)\n"
    vc = summary.get("verdict_counts", {})
    lines: list[str] = []
    lines.append(f"- localize 错误 (`localize_fail`): {vc.get('localize_fail', 0)}")
    lines.append(f"- patch 语法错 (`patch_fail`): {vc.get('patch_fail', 0)}")
    lines.append(f"- verify 失败 (`retry_exhausted` 与 `verify_fail`): "
                 f"{vc.get('retry_exhausted', 0) + vc.get('verify_fail', 0)}")
    lines.append(f"- 超时 (`timeout`): {vc.get('timeout', 0)}")
    lines.append(f"- 基础设施 (`infra_fail`): {vc.get('infra_fail', 0)}")
    other = sum(v for k, v in vc.items() if k not in {
        "verified", "localize_fail", "patch_fail",
        "retry_exhausted", "verify_fail", "timeout", "infra_fail",
    })
    lines.append(f"- 其他: {other}")
    return "\n".join(lines) + "\n"


def render(sa: dict | None, sb: dict | None, sc: dict | None) -> str:
    instance_source = (sa or sb or sc or {}).get("total_instances", "(unknown)")
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return f"""# SWE-bench Verification · M2 W8-D5

## 环境
- 日期：{now}
- 数据集：SWE-bench Lite subset ({instance_source} instances)
- Instance list: `benchmarks/swe-bench-subset/w8-verify-list.txt`
- LLM 模型：deep-swe=Claude Sonnet 4.5 · fast-fix=GPT-4o · visual-analyst=(Cursor 未装 · P1-1)
- Cursor 未装 → 三剑客降级到 2/3 · 在结果表标注

## 三配置对比

| Config | 组件栈 | 通过数 | Verified 率 | 平均耗时/题 | Token 成本/题 |
|---|---|---|---|---|---|
{config_row("A: 三剑客 only (2/3 · 缺 Cursor)", "claude-code + codex", sa)}
{config_row("B: A + cognee", "+ cognee side-car MCP", sb)}
{config_row("C: B + Agentless", "+ Agentless triage skill", sc)}

## 失败原因分类（Config C · 主要栈）

{failure_row(sc)}

## 关键发现

- (等 W8-D5 真跑完 · AI 分析三配置差异填入)
- (期望：B - A 提示 cognee 独立贡献 · C - B 提示 Agentless 独立贡献)
- (Cursor 缺一维 · 结论有效性受限 · 3/3 剑客留 M3+)

## M3+ 影响（决策见 `handoff/reports/m3-decision-record.md`）

- mem0：装 / 不装 / A-B（理由：依赖 Config C verified 率）
- letta-code：装 / 不装（理由：如 Config C < 20% 且 memory-bound 失败占比高，考虑）
- Twenty CRM：装 / 推 M6+（理由：与 SWE-bench 无关，另看 CRM 使用率）

## 复审触发

- Config C 数据点新增 20+ instance 后 · 复算 verified 率
- 上游 SWE-bench Verified 集发布 · 迁移子集
- Cursor CLI 装了 · 补 3/3 剑客数据
"""


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--config-a", type=Path, required=False)
    p.add_argument("--config-b", type=Path, required=False)
    p.add_argument("--config-c", type=Path, required=False)
    p.add_argument("--output", type=Path, required=True)
    args = p.parse_args()

    sa = load(args.config_a)
    sb = load(args.config_b)
    sc = load(args.config_c)

    md = render(sa, sb, sc)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(md, encoding="utf-8")
    print(f"wrote {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
