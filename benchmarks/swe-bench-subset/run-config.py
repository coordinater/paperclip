#!/usr/bin/env python3
"""
Run one SWE-bench configuration (A/B/C) over the w8-verify-list instances.

Usage:
    python run-config.py --config config-a.yaml
    python run-config.py --config config-b.yaml --instance-list w8-verify-list.txt

Requires:
  - pip install --user swebench pyyaml
  - Docker (SWE-bench harness pulls per-instance containers)
  - Config B/C additionally require:
    - cognee side-car running (docker ps | grep cognee)
    - For Config C: agentless-triage skill (paperclip skills/ folder)

M2 W8-D5. Handbook §W8.D5.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path


@dataclass
class ConfigYaml:
    label: str
    description: str
    adapters: list[dict]
    sidecars: list[dict] = field(default_factory=list)
    skills: list[dict] = field(default_factory=list)
    routing: dict = field(default_factory=lambda: {"strategy": "round_robin"})
    output: dict = field(default_factory=dict)
    budget: dict = field(default_factory=dict)


def load_config(path: Path) -> ConfigYaml:
    try:
        import yaml  # type: ignore
    except ImportError:
        print("ERROR: pyyaml not installed. Run: pip install --user pyyaml", file=sys.stderr)
        sys.exit(2)
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError(f"config yaml must be a mapping: {path}")
    return ConfigYaml(
        label=str(raw.get("label", "unknown")),
        description=str(raw.get("description", "")),
        adapters=list(raw.get("adapters") or []),
        sidecars=list(raw.get("sidecars") or []),
        skills=list(raw.get("skills") or []),
        routing=dict(raw.get("routing") or {}),
        output=dict(raw.get("output") or {}),
        budget=dict(raw.get("budget") or {}),
    )


def load_instance_list(path: Path) -> list[str]:
    instances: list[str] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        instances.append(line)
    return instances


def check_sidecars(cfg: ConfigYaml) -> list[dict]:
    """Probe each side-car HTTP health endpoint. Fail-fast if any required side-car is down."""
    reports: list[dict] = []
    for sc in cfg.sidecars:
        name = sc.get("name", "unnamed")
        endpoint = sc.get("endpoint", "")
        probe = sc.get("health_probe", "/health")
        required = bool(sc.get("required", False))
        url = f"{endpoint.rstrip('/')}{probe}"
        try:
            import urllib.request
            with urllib.request.urlopen(url, timeout=5) as resp:  # noqa: S310
                healthy = 200 <= resp.status < 300
        except Exception as e:  # noqa: BLE001
            healthy = False
            print(f"[warn] side-car {name} unreachable: {e}", file=sys.stderr)
        reports.append({"name": name, "url": url, "healthy": healthy, "required": required})
        if required and not healthy:
            print(f"[error] required side-car {name} unhealthy — aborting run", file=sys.stderr)
            sys.exit(3)
    return reports


def route_instance(instance_id: str, cfg: ConfigYaml, index: int) -> dict:
    """Pick which adapter handles an instance according to the routing strategy."""
    strategy = cfg.routing.get("strategy", "round_robin")
    if strategy == "round_robin":
        if not cfg.adapters:
            raise RuntimeError("no adapters configured")
        return cfg.adapters[index % len(cfg.adapters)]
    # Add other strategies (weighted, model-affinity) here as needed
    raise NotImplementedError(f"routing strategy not supported: {strategy}")


def run_instance(
    instance_id: str,
    adapter: dict,
    cfg: ConfigYaml,
    results_dir: Path,
) -> dict:
    """
    Run a single SWE-bench instance under a specific adapter.

    This is a skeleton. The team wires the actual paperclip hire_agent
    flow here after P1-5/6/7 are in place (mini-swe-agent + sweagent + swebench).

    For M2 W8-D5, this function returns a placeholder record. The team then
    replaces the placeholder with real paperclip API calls once binaries
    are installed.
    """
    started_at = datetime.now(timezone.utc).isoformat()
    print(f"  [→] {instance_id} · adapter={adapter.get('type')} role={adapter.get('hire_role')}")

    # ------------------------------------------------------------------
    # TODO(team-after-p1-unblock): replace stub with real hire flow.
    # Sketch:
    #   1. POST /api/companies/:cid/agents { adapterType, adapterConfig }
    #      → hire the adapter with the config from `adapter`
    #   2. POST /api/companies/:cid/issues { title, body }
    #      → create a paperclip issue from the SWE-bench instance
    #   3. Trigger heartbeat run for the agent
    #   4. Poll activity_log until run finishes (or times out per budget)
    #   5. Compare final patch to gold patch via swebench.harness
    # ------------------------------------------------------------------

    time.sleep(0.01)  # placeholder — real runs take minutes

    verdict = "skipped"  # placeholder verdict
    finished_at = datetime.now(timezone.utc).isoformat()

    record = {
        "instance_id": instance_id,
        "config_label": cfg.label,
        "adapter_type": adapter.get("type"),
        "hire_role": adapter.get("hire_role"),
        "started_at": started_at,
        "finished_at": finished_at,
        "verdict": verdict,     # one of: verified | patch_fail | localize_fail | infra_fail | timeout | skipped
        "elapsed_sec": 0.0,
        "token_cost_usd": 0.0,
        "notes": "stub — team fills after P1-5/6/7 unblocked",
    }

    # Persist per-instance record for later analysis
    per_instance_path = results_dir / f"{instance_id}.json"
    per_instance_path.write_text(json.dumps(record, indent=2), encoding="utf-8")
    return record


def summarize(records: list[dict], cfg: ConfigYaml, sidecar_reports: list[dict]) -> dict:
    verified = [r for r in records if r["verdict"] == "verified"]
    total = len(records)
    verified_rate = (len(verified) / total) if total else 0.0

    verdict_counts: dict[str, int] = {}
    for r in records:
        v = r["verdict"]
        verdict_counts[v] = verdict_counts.get(v, 0) + 1

    return {
        "config_label": cfg.label,
        "description": cfg.description,
        "total_instances": total,
        "verified_count": len(verified),
        "verified_rate": verified_rate,
        "verdict_counts": verdict_counts,
        "sidecars": sidecar_reports,
        "adapter_types": [a.get("type") for a in cfg.adapters],
        "skills": [s.get("name") for s in cfg.skills],
        "run_timestamp_utc": datetime.now(timezone.utc).isoformat(),
    }


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--config", required=True, help="Config yaml (config-a.yaml / -b / -c)")
    p.add_argument(
        "--instance-list",
        default=str(Path(__file__).parent / "w8-verify-list.txt"),
        help="One instance_id per line; # comments allowed",
    )
    args = p.parse_args()

    cfg_path = Path(args.config).resolve()
    if not cfg_path.exists():
        print(f"ERROR: config not found: {cfg_path}", file=sys.stderr)
        return 2

    cfg = load_config(cfg_path)
    instances = load_instance_list(Path(args.instance_list).resolve())

    print(f"=== SWE-bench Config {cfg.label} ===")
    print(f"  description : {cfg.description}")
    print(f"  adapters    : {[a.get('type') for a in cfg.adapters]}")
    print(f"  sidecars    : {[s.get('name') for s in cfg.sidecars]}")
    print(f"  skills      : {[s.get('name') for s in cfg.skills]}")
    print(f"  instances   : {len(instances)}")
    print()

    if not instances:
        print("[warn] no instances in list — run selector first:")
        print("  python select-subset.py --repos sympy django astropy --per-repo 5 --seed 42")
        return 4

    sidecar_reports = check_sidecars(cfg)

    results_dir_str = cfg.output.get("results_dir", f"results/{cfg.label}")
    results_dir = (cfg_path.parent / results_dir_str).resolve()
    results_dir.mkdir(parents=True, exist_ok=True)
    print(f"  results_dir : {results_dir}")
    print()

    records: list[dict] = []
    for i, instance_id in enumerate(instances):
        adapter = route_instance(instance_id, cfg, i)
        record = run_instance(instance_id, adapter, cfg, results_dir)
        records.append(record)

    summary = summarize(records, cfg, sidecar_reports)
    summary_path_str = cfg.output.get("summary_path", f"results/{cfg.label}/summary.json")
    summary_path = (cfg_path.parent / summary_path_str).resolve()
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print()
    print(f"=== Summary ({cfg.label}) ===")
    print(f"  total     : {summary['total_instances']}")
    print(f"  verified  : {summary['verified_count']} ({summary['verified_rate']:.1%})")
    print(f"  verdicts  : {summary['verdict_counts']}")
    print(f"  written   : {summary_path}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
