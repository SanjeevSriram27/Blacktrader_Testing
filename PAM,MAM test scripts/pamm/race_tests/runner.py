"""
BlackTrader PAMM - Master Concurrency & Race Test Runner
Orchestrates execution of all 114 race scenarios, tracks live progress, and exports reports.
"""
import os
import json
import time
import threading
from decimal import Decimal
from .harness import ConcurrencyHarness
from .oracle import InvariantOracle
from .replay_emitter import ReplayBundleEmitter, DecimalEncoder
from .modules import (
    rc01_setup_lifecycle, rc02_pool_sizing, rc03_rollover_nav,
    rc04_order_routing, rc05_partial_fills, rc06_margin_stopout,
    rc07_deposits_unfollow, rc08_hwm_settlement, rc09_concurrency_scale,
    rc10_compliance_lpoa, rc11_operational_dr
)

MODULE_MAP = {
    "M1": ("Setup & Lifecycle", rc01_setup_lifecycle),
    "M2": ("Pool Sizing & Shares", rc02_pool_sizing),
    "M3": ("Rollover & NAV", rc03_rollover_nav),
    "M4": ("Order Routing & Margins", rc04_order_routing),
    "M5": ("Partial Fills & Bridge", rc05_partial_fills),
    "M6": ("Margin & Stop-Outs", rc06_margin_stopout),
    "M7": ("Deposits & Unfollow", rc07_deposits_unfollow),
    "M8": ("HWM & Performance Fees", rc08_hwm_settlement),
    "M9": ("Concurrency & Scale", rc09_concurrency_scale),
    "M10": ("Compliance & LPOA", rc10_compliance_lpoa),
    "M11": ("Ops & Disaster Recovery", rc11_operational_dr)
}

class RaceRunnerState:
    def __init__(self):
        self.is_running = False
        self.current_scenario_id = None
        self.current_scenario_name = None
        self.completed_count = 0
        self.total_count = 114
        self.passed_count = 0
        self.failed_count = 0
        self.total_iterations = 0
        self.total_violations = 0
        self.start_time = None
        self.end_time = None
        self.active_log = []
        self.results = {}
        self.invariants_status = {f"I-{i:02d}": {"checked": 0, "violations": 0, "status": "PASS"} for i in range(1, 21)}
        self._lock = threading.Lock()

    def update_progress(self, scenario_id, name, result, sc_meta=None):
        with self._lock:
            self.current_scenario_id = scenario_id
            self.current_scenario_name = name
            self.completed_count += 1
            self.total_iterations += result.iterations_run
            self.total_violations += result.violations_count

            if result.status == "PASS":
                self.passed_count += 1
            else:
                self.failed_count += 1

            res_dict = result.to_dict()
            res_dict["name"] = name
            if sc_meta:
                res_dict["priority"] = getattr(sc_meta, "priority", "P1")
                res_dict["race_classes"] = getattr(sc_meta, "race_classes", [])
                res_dict["hardens_tcs"] = getattr(sc_meta, "hardens_tcs", [])
                res_dict["description"] = getattr(sc_meta, "description", "")
                res_dict["module_key"] = getattr(sc_meta, "module_key", "")
                res_dict["module_title"] = getattr(sc_meta, "module_title", "")
            self.results[scenario_id] = res_dict

            # Update invariants
            for inv_id in result.invariants_failed:
                if inv_id in self.invariants_status:
                    self.invariants_status[inv_id]["violations"] += 1
                    self.invariants_status[inv_id]["status"] = "FAIL"

            for i in range(1, 21):
                inv_key = f"I-{i:02d}"
                self.invariants_status[inv_key]["checked"] += result.iterations_run

    def to_dict(self):
        with self._lock:
            elapsed = 0
            if self.start_time:
                elapsed = round((self.end_time or time.time()) - self.start_time, 1)

            pct = 0
            if self.total_count > 0:
                pct = round((self.completed_count / self.total_count) * 100, 1)

            v_rate = 0.0
            if self.total_iterations > 0:
                v_rate = round((self.total_violations / self.total_iterations) * 100, 4)

            return {
                "is_running": self.is_running,
                "current_scenario_id": self.current_scenario_id,
                "current_scenario_name": self.current_scenario_name,
                "completed_count": self.completed_count,
                "total_count": self.total_count,
                "progress_pct": pct,
                "passed_count": self.passed_count,
                "failed_count": self.failed_count,
                "total_iterations": self.total_iterations,
                "total_violations": self.total_violations,
                "violation_rate_pct": v_rate,
                "elapsed_seconds": elapsed,
                "invariants_status": self.invariants_status,
                "results": self.results
            }

GLOBAL_RUNNER_STATE = RaceRunnerState()

class MasterRaceRunner:
    def __init__(self, harness=None):
        self.harness = harness or ConcurrencyHarness()
        self.state = GLOBAL_RUNNER_STATE

    def get_all_scenarios(self):
        scenarios = []
        for mod_key, (mod_title, mod_obj) in MODULE_MAP.items():
            for sc in mod_obj.get_scenarios():
                sc.module_key = mod_key
                sc.module_title = mod_title
                scenarios.append(sc)
        return scenarios

    def run_suite(self, priority=None, module_filter=None, scenario_id=None, mode="quick", iterations=None):
        """
        Runs the test suite across filtered scenarios.
        """
        scenarios = self.get_all_scenarios()

        if scenario_id:
            scenarios = [s for s in scenarios if s.scenario_id.lower() == scenario_id.lower()]
        elif module_filter:
            mod_f = module_filter.upper()
            scenarios = [s for s in scenarios if s.module_key == mod_f or s.scenario_id.split("-")[1].startswith(mod_f)]
        elif priority:
            pri = priority.upper()
            scenarios = [s for s in scenarios if s.priority == pri]

        iter_count = iterations
        if iter_count is None:
            iter_count = 5 if mode == "quick" else 25

        with self.state._lock:
            self.state.is_running = True
            self.state.completed_count = 0
            self.state.total_count = len(scenarios)
            self.state.passed_count = 0
            self.state.failed_count = 0
            self.state.total_iterations = 0
            self.state.total_violations = 0
            self.state.results = {}
            self.state.start_time = time.time()
            self.state.end_time = None

        print(f"[*] Starting Race Suite: {len(scenarios)} scenarios, mode={mode}, {iter_count} iters/scenario...")

        for sc in scenarios:
            try:
                res = sc.execute(self.harness, iterations=iter_count)
            except Exception as e:
                from .harness import RaceResult
                res = RaceResult(sc.scenario_id)
                res.status = "FAIL"
                res.violations_count = 1
                res.iterations_run = iter_count
                res.invariants_failed.append("EXEC_ERROR")

            self.state.update_progress(sc.scenario_id, sc.name, res, sc_meta=sc)

        with self.state._lock:
            self.state.is_running = False
            self.state.end_time = time.time()

        print(f"[✓] Race Suite Completed: {self.state.passed_count}/{self.state.total_count} Passed ({self.state.total_iterations} Iterations).")
        self.export_reports()
        return self.state.to_dict()

    def export_reports(self):
        data_dir = os.path.join(os.path.dirname(__file__), "data")
        os.makedirs(data_dir, exist_ok=True)
        json_path = os.path.join(data_dir, "race_report.json")
        md_path = os.path.join(data_dir, "race_report.md")

        state_dict = self.state.to_dict()

        # Write JSON report
        with open(json_path, "w") as f:
            json.dump(state_dict, f, indent=2, cls=DecimalEncoder)

        # Write Markdown report
        md_lines = [
            "# BlackTrader PAMM - Deep Concurrency & Race-Condition Audit Report",
            f"**Generated:** {time.strftime('%Y-%m-%d %H:%M:%S')}  ",
            f"**Total Scenarios:** {state_dict['total_count']} | **Passed:** {state_dict['passed_count']} | **Failed:** {state_dict['failed_count']}  ",
            f"**Total Iterations Run:** {state_dict['total_iterations']} | **Violation Rate:** {state_dict['violation_rate_pct']}%  ",
            f"**Elapsed Time:** {state_dict['elapsed_seconds']}s  \n",
            "---",
            "## 1. System Invariant Oracle Audit (I-01 to I-20)\n",
            "| Invariant | Status | Checks | Violations |",
            "| :--- | :--- | :--- | :--- |"
        ]

        for inv_id, info in state_dict["invariants_status"].items():
            status_badge = "✅ PASS" if info["violations"] == 0 else "❌ FAIL"
            md_lines.append(f"| {inv_id} | {status_badge} | {info['checked']} | {info['violations']} |")

        md_lines.extend([
            "\n---",
            "## 2. Race Scenarios Execution Matrix\n",
            "| Scenario ID | Status | Iters | Violations | Rate (%) | P50 (ms) | P99 (ms) | Invariants Failed |",
            "| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |"
        ])

        for sc_id, r in state_dict["results"].items():
            status_badge = "✅ PASS" if r["status"] == "PASS" else "❌ FAIL"
            failed_invs = ", ".join(r["invariants_failed"]) if r["invariants_failed"] else "None"
            md_lines.append(f"| `{sc_id}` | {status_badge} | {r['iterations_run']} | {r['violations_count']} | {r['violation_rate_pct']}% | {r['latency_p50_ms']} | {r['latency_p99_ms']} | {failed_invs} |")

        with open(md_path, "w") as f:
            f.write("\n".join(md_lines))

        print(f"[*] Exported {json_path} and {md_path}")
