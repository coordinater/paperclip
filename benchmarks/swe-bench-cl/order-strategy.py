"""SWE-Bench-CL · Task ordering strategy · M5-04 MVP scaffold.

Implements 3 ordering strategies per PRD §4.1:
- time_ordered: sort by GitHub PR merge timestamp ascending
- dependency_ordered: topological sort by issue-blocks-issue graph
- custom_order: read explicit order.txt line sequence

Pure functions · deterministic · reusable across configs.

**NOT fully implemented · scaffold shape only · M5 装配 phase completes**
TODO(team-verify): SWE-bench Verified instance metadata contains `pr_merged_at` field · verify shape after `pip install swebench` (P1-6 shopping list item).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Iterable, Mapping, Sequence


@dataclass(frozen=True)
class Instance:
    """SWE-bench instance metadata subset relevant to ordering."""
    instance_id: str
    repo: str
    pr_number: int | None
    pr_merged_at: datetime | None  # TODO(team-verify) shape
    dependencies: tuple[str, ...] = ()  # instance_ids that must precede this


class OrderingStrategy:
    """Base ordering strategy."""

    def order(self, instances: Sequence[Instance]) -> list[Instance]:
        raise NotImplementedError


class TimeOrderedStrategy(OrderingStrategy):
    """Sort by pr_merged_at ascending · instances without timestamp go to end.

    Default strategy · models real-world project evolution.
    """

    def order(self, instances: Sequence[Instance]) -> list[Instance]:
        # Split into dated and undated
        dated = [i for i in instances if i.pr_merged_at is not None]
        undated = [i for i in instances if i.pr_merged_at is None]
        # Sort dated by timestamp · stable secondary sort by instance_id
        dated_sorted = sorted(
            dated, key=lambda i: (i.pr_merged_at, i.instance_id)  # type: ignore[arg-type]
        )
        # Undated sorted by instance_id · appended at end
        undated_sorted = sorted(undated, key=lambda i: i.instance_id)
        return dated_sorted + undated_sorted


class DependencyOrderedStrategy(OrderingStrategy):
    """Topological sort by declared dependencies.

    Falls back to time_ordered for tie-breaking · Kahn's algorithm.
    Raises ValueError on cycle detection.
    """

    def order(self, instances: Sequence[Instance]) -> list[Instance]:
        # Build id -> instance map
        instance_map = {i.instance_id: i for i in instances}
        # In-degree count
        in_degree = {i.instance_id: 0 for i in instances}
        for i in instances:
            for dep in i.dependencies:
                if dep in in_degree:
                    in_degree[i.instance_id] += 1

        # Ready queue = instances with in_degree 0 · sorted by time_ordered
        time_ordered = TimeOrderedStrategy().order(instances)
        ready = [i for i in time_ordered if in_degree[i.instance_id] == 0]
        result: list[Instance] = []

        while ready:
            current = ready.pop(0)
            result.append(current)
            # Decrement in-degree of dependents
            for i in instances:
                if current.instance_id in i.dependencies:
                    in_degree[i.instance_id] -= 1
                    if in_degree[i.instance_id] == 0:
                        # Insert in time-order position
                        idx = next(
                            (n for n, r in enumerate(ready) if r.instance_id > i.instance_id),
                            len(ready),
                        )
                        ready.insert(idx, i)

        if len(result) != len(instances):
            raise ValueError(
                f"Dependency cycle detected · ordered {len(result)}/{len(instances)}"
            )
        return result


class CustomOrderStrategy(OrderingStrategy):
    """Read explicit order.txt · one instance_id per line.

    Instances not in order.txt go to end in original submission order.
    """

    def __init__(self, order_path: str):
        with open(order_path) as f:
            self.order_list = [ln.strip() for ln in f if ln.strip() and not ln.startswith("#")]

    def order(self, instances: Sequence[Instance]) -> list[Instance]:
        instance_map = {i.instance_id: i for i in instances}
        result: list[Instance] = []
        seen: set[str] = set()
        for iid in self.order_list:
            if iid in instance_map:
                result.append(instance_map[iid])
                seen.add(iid)
        # Append leftovers in submission order
        for i in instances:
            if i.instance_id not in seen:
                result.append(i)
        return result


STRATEGIES: Mapping[str, type[OrderingStrategy]] = {
    "time_ordered": TimeOrderedStrategy,
    "dependency_ordered": DependencyOrderedStrategy,
    "custom_order": CustomOrderStrategy,
}


def resolve_strategy(
    name: str, *, order_path: str | None = None
) -> OrderingStrategy:
    """Factory · returns configured strategy instance."""
    cls = STRATEGIES.get(name)
    if cls is None:
        raise ValueError(
            f"Unknown ordering strategy '{name}' · known: {list(STRATEGIES)}"
        )
    if cls is CustomOrderStrategy:
        if not order_path:
            raise ValueError("custom_order requires order_path")
        return CustomOrderStrategy(order_path)
    return cls()


# ---------------------------------------------------------------------------
# Smoke test / usage example
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Example usage · not real SWE-bench data
    from datetime import datetime as dt
    sample = [
        Instance("sympy__1", "sympy/sympy", 100, dt(2023, 1, 1)),
        Instance("sympy__2", "sympy/sympy", 200, dt(2023, 3, 1), dependencies=("sympy__1",)),
        Instance("django__1", "django/django", 300, dt(2023, 2, 1)),
    ]
    print("=== time_ordered ===")
    for i in resolve_strategy("time_ordered").order(sample):
        print(f"  {i.instance_id} · {i.pr_merged_at}")
    print("=== dependency_ordered ===")
    for i in resolve_strategy("dependency_ordered").order(sample):
        print(f"  {i.instance_id} · deps={i.dependencies}")
