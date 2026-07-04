"""SWE-Bench-CL · Adaptation Rate analysis · M5-04 MVP scaffold.

Implements the Adaptation Rate metric per PRD §4.3:

    AR(N) = verified_rate(task N+1..N+k) - verified_rate(task N..N+k-1)
           // sliding window k · N ∈ [0, total-2k]

    Overall AR = mean(AR(N) over N)

Positive AR = memory has continual contribution
~0 AR = memory neutral · not transferring
Negative AR = catastrophic forgetting or distraction

Pure functions · no I/O side effects except main().

Usage:
    python adaptation-rate.py --summary results/config-cl-a/summary.json --k 5
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from pathlib import Path
from typing import Iterable, Sequence


def compute_verified_rate(verdicts: Sequence[bool]) -> float:
    """Fraction of `True` in verdicts · returns 0.0 for empty input."""
    if not verdicts:
        return 0.0
    return sum(1 for v in verdicts if v) / len(verdicts)


def compute_adaptation_rate(
    verdicts_in_order: Sequence[bool | None], *, sliding_window_k: int = 5
) -> dict:
    """Compute AR curve + overall.

    Args:
        verdicts_in_order: ordered list of verified verdicts · None = infra fail / skipped
        sliding_window_k: window size · default 5

    Returns:
        dict with `curve`, `overall`, `windows_analyzed`
    """
    # Filter out None (infra failures) · keep boolean only
    # But preserve order · we can't shift positions
    # Strategy: treat None as False (didn't verify) for rate calc
    normalized: list[bool] = [bool(v) if v is not None else False for v in verdicts_in_order]

    n = len(normalized)
    if n < 2 * sliding_window_k:
        return {
            "curve": [],
            "overall": None,
            "windows_analyzed": 0,
            "warning": f"insufficient data · need at least {2*sliding_window_k} instances · got {n}",
        }

    curve: list[dict] = []
    for start in range(n - 2 * sliding_window_k + 1):
        window_early = normalized[start : start + sliding_window_k]
        window_late = normalized[start + sliding_window_k : start + 2 * sliding_window_k]
        rate_early = compute_verified_rate(window_early)
        rate_late = compute_verified_rate(window_late)
        ar_n = rate_late - rate_early
        curve.append({
            "N": start,
            "rate_early_window": rate_early,
            "rate_late_window": rate_late,
            "AR(N)": ar_n,
        })

    overall = statistics.mean(c["AR(N)"] for c in curve) if curve else None

    return {
        "curve": curve,
        "overall": overall,
        "windows_analyzed": len(curve),
        "sliding_window_k": sliding_window_k,
        "total_instances": n,
    }


def interpret_adaptation_rate(overall: float | None) -> str:
    """Human-readable interpretation per PRD §4.3."""
    if overall is None:
        return "insufficient data"
    if overall > 0.02:
        return f"positive (+{overall:.3f}) · memory has continual contribution"
    if overall < -0.02:
        return f"negative ({overall:.3f}) · catastrophic forgetting or distraction"
    return f"neutral ({overall:.3f}) · memory not transferring · reduce carry-over or wipe"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description="SWE-Bench-CL Adaptation Rate analyzer")
    parser.add_argument(
        "--summary", required=True, help="Path to run-cl.py output summary.json"
    )
    parser.add_argument("--k", type=int, default=5, help="Sliding window size (default 5)")
    parser.add_argument(
        "--output", help="Write full analysis JSON here (default: summary_dir/adaptation-rate.json)"
    )
    args = parser.parse_args()

    with open(args.summary) as f:
        summary = json.load(f)

    results = summary.get("results", [])
    if not results:
        print("[adaptation-rate] No results in summary · abort", file=sys.stderr)
        return 2

    # Sort by order_index if present · else use listed order
    results_ordered = sorted(results, key=lambda r: r.get("order_index", 0))
    verdicts = [r.get("verified") for r in results_ordered]

    ar = compute_adaptation_rate(verdicts, sliding_window_k=args.k)
    ar["config_label"] = summary.get("config_label", "unknown")
    ar["memory_policy"] = summary.get("memory_policy", "unknown")
    ar["ordering_strategy"] = summary.get("ordering_strategy", "unknown")
    ar["interpretation"] = interpret_adaptation_rate(ar["overall"])

    output_path = (
        Path(args.output)
        if args.output
        else Path(args.summary).parent / "adaptation-rate.json"
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(ar, f, indent=2)

    print(f"[adaptation-rate] config={ar['config_label']} policy={ar['memory_policy']}")
    print(f"[adaptation-rate] overall AR = {ar['overall']}")
    print(f"[adaptation-rate] interpretation: {ar['interpretation']}")
    print(f"[adaptation-rate] wrote → {output_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
