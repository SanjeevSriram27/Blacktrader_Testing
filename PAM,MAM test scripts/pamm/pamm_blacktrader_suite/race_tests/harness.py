"""
BlackTrader PAMM - Concurrency & Race Test Harness
Implements Barrier Release, Skew Sweep, Snapshot Recorder, and Replay Bundle integration.
Derived from PAMM_Deep_Race_Condition_Test_Spec.md Section 1.
"""
import time
import threading
import concurrent.futures
from decimal import Decimal
import random
from .config import HarnessConfig, OracleConfig
from .oracle import InvariantOracle
from .replay_emitter import ReplayBundleEmitter

class RaceResult:
    def __init__(self, scenario_id):
        self.scenario_id = scenario_id
        self.iterations_run = 0
        self.violations_count = 0
        self.invariants_failed = []
        self.outcome_table = {}   # offset_ms -> {outcome_class: count}
        self.latencies_ms = []
        self.replay_bundles = []
        self.status = "PASS"
        self.deadlocks_count = 0
        self.serialization_failures_count = 0

    @property
    def violation_rate(self):
        if self.iterations_run == 0:
            return 0.0
        return round((self.violations_count / self.iterations_run) * 100, 4)

    @property
    def latency_p50(self):
        if not self.latencies_ms:
            return 0.0
        s = sorted(self.latencies_ms)
        return round(s[len(s) // 2], 2)

    @property
    def latency_p99(self):
        if not self.latencies_ms:
            return 0.0
        s = sorted(self.latencies_ms)
        idx = int(len(s) * 0.99)
        return round(s[min(idx, len(s) - 1)], 2)

    def to_dict(self):
        return {
            "scenario_id": self.scenario_id,
            "status": self.status,
            "iterations_run": self.iterations_run,
            "violations_count": self.violations_count,
            "violation_rate_pct": self.violation_rate,
            "invariants_failed": list(set(self.invariants_failed)),
            "latency_p50_ms": self.latency_p50,
            "latency_p99_ms": self.latency_p99,
            "deadlocks": self.deadlocks_count,
            "serialization_failures": self.serialization_failures_count,
            "outcome_table": self.outcome_table,
            "replay_bundles": self.replay_bundles
        }

class ConcurrencyHarness:
    def __init__(self, oracle=None, emitter=None):
        self.oracle = oracle or InvariantOracle()
        self.emitter = emitter or ReplayBundleEmitter()

    def race(self, ops, skew_ms=0):
        """
        Barrier release primitive:
        All operations in `ops` block on a threading Barrier, then release simultaneously.
        Optionally delays ops[1:] by skew_ms.
        Each op is a callable returning a dict with {status, data, error}.
        """
        n = len(ops)
        barrier = threading.Barrier(n)
        results = [None] * n
        op_logs = []
        lock = threading.Lock()

        def worker(idx, op):
            barrier.wait()
            if idx > 0 and skew_ms > 0:
                time.sleep(skew_ms / 1000.0)
            elif idx == 0 and skew_ms < 0:
                time.sleep(abs(skew_ms) / 1000.0)

            t_send_ns = time.time_ns()
            try:
                res = op()
                t_done_ns = time.time_ns()
                entry = {
                    "op_index": idx,
                    "t_send_ns": t_send_ns,
                    "t_done_ns": t_done_ns,
                    "duration_ms": (t_done_ns - t_send_ns) / 1_000_000,
                    "response": res
                }
                results[idx] = res
            except Exception as e:
                t_done_ns = time.time_ns()
                entry = {
                    "op_index": idx,
                    "t_send_ns": t_send_ns,
                    "t_done_ns": t_done_ns,
                    "duration_ms": (t_done_ns - t_send_ns) / 1_000_000,
                    "error": str(e)
                }
                results[idx] = {"status": 500, "error": str(e)}

            with lock:
                op_logs.append(entry)

        threads = []
        for i, op in enumerate(ops):
            t = threading.Thread(target=worker, args=(i, op))
            threads.append(t)
            t.start()

        for t in threads:
            t.join()

        return results, op_logs

    def sweep(self, scenario_id, opA_factory, opB_factory, state_factory, outcome_classifier, legal_outcomes, iterations_per_bucket=10, offsets_ms=None):
        """
        Microsecond skew sweep across offsets.
        Categorizes outcomes and runs assert_all_invariants on each iteration.
        """
        if offsets_ms is None:
            offsets_ms = HarnessConfig.SKEW_OFFSETS_MS

        result = RaceResult(scenario_id)

        for offset in offsets_ms:
            offset_key = f"{offset}ms"
            result.outcome_table[offset_key] = {}

            for iter_idx in range(iterations_per_bucket):
                result.iterations_run += 1
                seed = random.randint(100000, 999999)
                random.seed(seed)

                # Initialize fresh state
                state = state_factory()
                s0 = state.snapshot()

                # Build ops
                opA = opA_factory(state)
                opB = opB_factory(state)

                # Fire concurrent race with offset
                t_start = time.time()
                res, op_log = self.race([opA, opB], skew_ms=offset)
                latency = (time.time() - t_start) * 1000.0
                result.latencies_ms.append(latency)

                # Capture post-state
                s1 = state.snapshot()

                # Classify outcome
                outcome = outcome_classifier(res, s0, s1)
                result.outcome_table[offset_key][outcome] = result.outcome_table[offset_key].get(outcome, 0) + 1

                # Check if outcome is legal
                is_illegal = outcome not in legal_outcomes

                # Run invariant oracle on post-state
                scope = state.build_oracle_scope(s0, s1, res)
                violations = self.oracle.assert_all_invariants(scope)

                if is_illegal:
                    violations.append({
                        "id": "ILLEGAL-OUTCOME",
                        "message": f"Illegal outcome '{outcome}' observed at offset {offset_ms}ms (Legal: {legal_outcomes})",
                        "details": {"outcome": outcome, "legal": legal_outcomes}
                    })

                if violations:
                    result.violations_count += 1
                    result.status = "FAIL"
                    for v in violations:
                        result.invariants_failed.append(v["id"])

                    # Emit replay bundle on first failure
                    if len(result.replay_bundles) < 3:
                        bundle_path, bundle = self.emitter.emit(
                            scenario_id=scenario_id,
                            iteration=result.iterations_run,
                            offset_ms=offset,
                            seed=seed,
                            op_log=op_log,
                            s0=s0,
                            s1=s1,
                            invariants_failed=violations
                        )
                        result.replay_bundles.append(bundle_path)

        return result
