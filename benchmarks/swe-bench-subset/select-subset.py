#!/usr/bin/env python3
"""
Select a subset of SWE-bench Lite instances covering multiple repos.

Usage:
    python select-subset.py --repos sympy django astropy --per-repo 5 --seed 42

Writes selected instance IDs (one per line) to w8-verify-list.txt.

Requires: pip install --user swebench
"""
from __future__ import annotations

import argparse
import random
import sys
from pathlib import Path


def load_lite_instances() -> list[dict]:
    try:
        from swebench.harness.constants import LITE_INSTANCES  # type: ignore
    except ImportError:
        print(
            "ERROR: swebench not installed. Run: pip install --user swebench",
            file=sys.stderr,
        )
        sys.exit(2)
    return list(LITE_INSTANCES)


def repo_of(instance_id: str) -> str:
    # SWE-bench instance IDs are formatted "<repo-owner>__<repo>-<pr-number>"
    # We match on repo name (second part after "__" split, before "-<pr>").
    if "__" not in instance_id:
        return "unknown"
    tail = instance_id.split("__", 1)[1]
    if "-" in tail:
        return tail.rsplit("-", 1)[0]
    return tail


def select_subset(
    instances: list[dict], repos: list[str], per_repo: int, seed: int
) -> list[str]:
    rng = random.Random(seed)
    by_repo: dict[str, list[str]] = {r: [] for r in repos}
    for entry in instances:
        iid = entry.get("instance_id") if isinstance(entry, dict) else str(entry)
        if not iid:
            continue
        r = repo_of(iid)
        if r in by_repo:
            by_repo[r].append(iid)

    selected: list[str] = []
    for repo in repos:
        pool = by_repo[repo]
        if len(pool) < per_repo:
            print(
                f"WARN: repo {repo} has only {len(pool)} instances (< per_repo={per_repo}); taking all",
                file=sys.stderr,
            )
            selected.extend(sorted(pool))
        else:
            picked = rng.sample(pool, per_repo)
            selected.extend(sorted(picked))
    return selected


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--repos", nargs="+", default=["sympy", "django", "astropy"])
    p.add_argument("--per-repo", type=int, default=5)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--output", default=str(Path(__file__).parent / "w8-verify-list.txt"))
    args = p.parse_args()

    instances = load_lite_instances()
    print(f"Loaded {len(instances)} SWE-bench Lite instances", file=sys.stderr)

    selected = select_subset(instances, args.repos, args.per_repo, args.seed)

    Path(args.output).write_text("\n".join(selected) + "\n", encoding="utf-8")
    print(f"Wrote {len(selected)} instance IDs to {args.output}")
    for iid in selected:
        print(f"  {iid}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
