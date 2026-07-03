#!/usr/bin/env python3
"""
Run the SWE-bench harness on a single instance to smoke-test the environment.

Usage:
    python run-single.py --instance-id sympy__sympy-20590

Requires:
- pip install --user swebench
- docker (SWE-bench harness pulls a per-instance container image)
"""
from __future__ import annotations

import argparse
import subprocess
import sys


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--instance-id", required=True)
    p.add_argument("--dataset", default="lite", choices=["lite", "verified", "full"])
    p.add_argument(
        "--predictions",
        default="none",
        help="Path to predictions JSONL (agent output) or 'none' for gold-patch smoke test",
    )
    args = p.parse_args()

    # SWE-bench canonical CLI (verify with `pip show swebench` for exact module path).
    # We delegate to python -m swebench.harness.run_evaluation for stability.
    cmd = [
        sys.executable,
        "-m",
        "swebench.harness.run_evaluation",
        "--dataset_name",
        f"princeton-nlp/SWE-bench_{args.dataset.capitalize()}",
        "--instance_ids",
        args.instance_id,
    ]
    if args.predictions != "none":
        cmd += ["--predictions_path", args.predictions]

    print("Running:", " ".join(cmd))
    try:
        result = subprocess.run(cmd, check=False)
        return result.returncode
    except FileNotFoundError as e:
        print(f"ERROR: swebench.harness.run_evaluation module not found: {e}", file=sys.stderr)
        print("Install: pip install --user swebench", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
