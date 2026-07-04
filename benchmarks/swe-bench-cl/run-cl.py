"""SWE-Bench-CL runner · M5-04 MVP scaffold.

Extends benchmarks/swe-bench-subset/run-config.py to add:
- Task ordering (per order-strategy.py)
- Memory carry-over policy (per config-cl-{a,b,c}.yaml memory_policy)
- Adaptation Rate signal capture (per adaptation-rate.py)

**Scaffold shape only · full implementation waits for:**
- P1-6 swebench pip install (Docker + LITE_INSTANCES verified)
- D-M3-01 mem0 install decision (Config B/C活用 mem0 依赖)
- L2-01 cognee running (M1 W3-D1 装 · confirm reachable)
- L3-01 claude_local adapter (M1 W2-D1 装 · reachable)

Usage:
    python run-cl.py --config config-cl-a.yaml --instances w8-verify-list.txt
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Mapping

try:
    import yaml  # type: ignore[import-untyped]
except ImportError:
    print("[run-cl] Missing dependency: PyYAML · pip install --user pyyaml", file=sys.stderr)
    sys.exit(2)

# Local imports · relative to script dir
sys.path.insert(0, str(Path(__file__).parent))
from order_strategy import Instance, resolve_strategy  # type: ignore[import-not-found]


# ---------------------------------------------------------------------------
# Memory policy handlers · scaffold
# ---------------------------------------------------------------------------

def apply_memory_policy_before(policy: Mapping[str, Any], instance_id: str) -> None:
    """Called before each instance · applies wipe or preserve per config.

    TODO(team-verify): actual cognee HTTP endpoint + mem0 CLI shape.
    """
    strategy = policy.get("strategy", "no_memory")
    if strategy == "no_memory":
        # Wipe cognee + mem0 fully
        _wipe_cognee(clear_vectors=True, clear_conversation=True)
        _wipe_mem0(clear_all=True)
    elif strategy == "carry_cognee":
        cognee_cfg = policy.get("cognee", {})
        _wipe_cognee(
            clear_vectors=cognee_cfg.get("wipe_between_instances", False),
            clear_conversation=cognee_cfg.get("conversation_wipe", True),
        )
        # mem0 always wiped in Config B
        _wipe_mem0(clear_all=policy.get("mem0", {}).get("wipe_between_instances", True))
    elif strategy == "carry_both":
        cognee_cfg = policy.get("cognee", {})
        _wipe_cognee(
            clear_vectors=cognee_cfg.get("wipe_between_instances", False),
            clear_conversation=cognee_cfg.get("conversation_wipe", False),
        )
        # mem0 preserved
        pass
    elif strategy == "carry_selective":
        # Cognee vector kept · conversation wiped · mem0 preserved
        _wipe_cognee(clear_vectors=False, clear_conversation=True)
    else:
        raise ValueError(f"Unknown memory_policy strategy: {strategy}")


def _wipe_cognee(*, clear_vectors: bool, clear_conversation: bool) -> None:
    """TODO(team-verify): cognee HTTP DELETE /vectors + /conversations endpoints."""
    # Scaffold · real impl calls http://localhost:COGNEE_PORT
    if clear_vectors or clear_conversation:
        print(
            f"[run-cl] cognee wipe · vectors={clear_vectors} conv={clear_conversation}",
            file=sys.stderr,
        )


def _wipe_mem0(*, clear_all: bool) -> None:
    """TODO(team-verify): mem0 CLI or HTTP shape after D-M3-01 = B/C 档装配."""
    if clear_all:
        print("[run-cl] mem0 wipe all", file=sys.stderr)


# ---------------------------------------------------------------------------
# Instance execution · scaffold delegates to subset/run-single.py
# ---------------------------------------------------------------------------

def run_instance(instance: Instance, adapters: list[Mapping[str, Any]]) -> Mapping[str, Any]:
    """Delegate to subset/run-single.py per adapter · aggregate result.

    TODO(team-verify): confirm run-single.py CLI signature after M2 W5-D4 装配。
    """
    # Scaffold: fake result shape · real impl subprocess.run to run-single.py
    return {
        "instance_id": instance.instance_id,
        "verified": None,  # TODO real
        "wall_time_sec": 0,
        "adapter_used": adapters[0]["type"] if adapters else "unknown",
        "trajectory_path": None,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description="SWE-Bench-CL runner (MVP scaffold)")
    parser.add_argument("--config", required=True, help="Path to config-cl-*.yaml")
    parser.add_argument(
        "--instances", required=True, help="Path to instance ID list (one per line)"
    )
    parser.add_argument("--order-file", help="Path to custom order.txt (if strategy=custom_order)")
    parser.add_argument(
        "--dry-run", action="store_true", help="Print plan without running"
    )
    args = parser.parse_args()

    with open(args.config) as f:
        config = yaml.safe_load(f)

    label = config.get("label", "unknown")
    ordering = config.get("ordering", {})
    memory_policy = config.get("memory_policy", {})
    adapters = config.get("adapters", [])
    output_cfg = config.get("output", {})

    # Load instance metadata
    # TODO(team-verify): swebench API for pr_merged_at metadata
    with open(args.instances) as f:
        instance_ids = [ln.strip() for ln in f if ln.strip() and not ln.startswith("#")]

    # For scaffold: fabricate Instance objects with instance_id only
    instances = [
        Instance(
            instance_id=iid,
            repo=iid.split("__")[0] if "__" in iid else "unknown",
            pr_number=None,
            pr_merged_at=None,
        )
        for iid in instance_ids
    ]

    strategy_name = ordering.get("strategy", "time_ordered")
    strategy = resolve_strategy(strategy_name, order_path=args.order_file)
    ordered = strategy.order(instances)

    print(f"[run-cl] config={label} strategy={strategy_name} n_instances={len(ordered)}")
    print(f"[run-cl] memory_policy={memory_policy.get('strategy', 'no_memory')}")
    print(f"[run-cl] output_dir={output_cfg.get('results_dir', 'results/')}")

    if args.dry_run:
        for idx, ins in enumerate(ordered):
            print(f"  [{idx:03d}] {ins.instance_id}")
        return 0

    # Real run loop · scaffold
    results = []
    for idx, ins in enumerate(ordered):
        apply_memory_policy_before(memory_policy, ins.instance_id)
        print(f"[run-cl] running {idx+1}/{len(ordered)} · {ins.instance_id}")
        result = run_instance(ins, adapters)
        results.append({**result, "order_index": idx})

    # Write summary
    summary_path = Path(output_cfg.get("summary_path", "results/summary.json"))
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary = {
        "config_label": label,
        "n_instances": len(ordered),
        "ordering_strategy": strategy_name,
        "memory_policy": memory_policy.get("strategy"),
        "results": results,
        "generated_at": datetime.utcnow().isoformat(),
    }
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"[run-cl] wrote summary → {summary_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
