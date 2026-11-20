#!/usr/bin/env python3
"""
Command-Line Runner for BlackTrader PAMM Test Suite
Supports Real (Hedging) and Real (Netting) Concepts across all 11 Modules (165 Scenarios).

Usage:
    python3 run_scenario.py --id BTPAMM-F001        # Run single scenario
    python3 run_scenario.py --module 2              # Run Module 2
    python3 run_scenario.py --priority P0           # Run all P0 Blocker scenarios
    python3 run_scenario.py --concept both          # Run all 165 scenarios on BOTH Hedging & Netting
    python3 run_scenario.py --concept hedging       # Run scenarios on Real (Hedging)
    python3 run_scenario.py --concept netting       # Run scenarios on Real (Netting)
    python3 run_scenario.py --bugs                  # List all detected platform bugs
"""

import sys
import argparse
import json
import time
from pathlib import Path

# Add suite to path
SUITE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SUITE_DIR))

from core.config import Config
from core.bug_tracker import BugTracker
from scenarios.registry import (
    get_all_scenarios,
    get_scenarios_by_module,
    get_scenario_by_id,
    get_scenarios_by_priority
)

def print_result_row(res):
    status_color = "\033[92m" if res.status == "PASS" else "\033[91m"
    if res.status == "DEFECT":
        status_color = "\033[93m"
    elif res.status == "NOTICE":
        status_color = "\033[96m"
    reset = "\033[0m"
    bug_badge = f" [Defect: {res.bug_id}]" if res.bug_id else ""
    notice_badge = f" [Policy Notice]" if res.status == "NOTICE" else ""
    print(f"  {res.tc_id:<14} | {res.priority:<3} | {status_color}{res.status:<6}{reset} | {res.duration_ms:>6.1f}ms | {res.title[:42]}{bug_badge}{notice_badge}")

def execute_suite_for_concept(concept_name: str, args) -> dict:
    Config.set_instance(concept_name)
    
    # Select target scenarios
    targets = []
    if args.id:
        sc = get_scenario_by_id(args.id)
        if not sc:
            print(f"[-] Error: Scenario ID '{args.id}' not found.")
            sys.exit(1)
        targets = [sc]
    elif args.module:
        targets = get_scenarios_by_module(args.module)
        if not targets:
            print(f"[-] Error: Module '{args.module}' not found (valid range: 1 to 11).")
            sys.exit(1)
    elif args.priority:
        targets = get_scenarios_by_priority(args.priority)
    else:
        targets = get_all_scenarios()

    print("\n" + "=" * 94)
    print(f"  BLACKTRADER PAMM QUALITY SUITE - [{Config.CURRENT_CONCEPT_NAME.upper()}]")
    print(f"  Platform: {Config.BASE_URL} | Master: {Config.MASTER_EMAIL} | Scenarios: {len(targets)}")
    print("=" * 94)
    print(f"  {'TC ID':<14} | {'Pri':<3} | {'Status':<6} | {'Duration':<8} | {'Title'}")
    print("-" * 94)

    results = []
    pass_count = 0
    notice_count = 0
    defect_count = 0
    fail_count = 0
    total_start = time.perf_counter()

    for sc in targets:
        res = sc.run()
        res_dict = res.to_dict()
        res_dict["concept"] = Config.CURRENT_CONCEPT_NAME
        res_dict["instance"] = Config.DEFAULT_INSTANCE
        results.append(res_dict)
        print_result_row(res)
        if res.status == "PASS":
            pass_count += 1
        elif res.status == "NOTICE":
            notice_count += 1
        elif res.status == "DEFECT":
            defect_count += 1
        else:
            fail_count += 1

    total_time = (time.perf_counter() - total_start) * 1000.0

    print("-" * 94)
    print(f"  [{Config.CURRENT_CONCEPT_NAME}] Summary: Total {len(targets)} | Passed: {pass_count} | Notices: {notice_count} | Defects: {defect_count} | Failed: {fail_count} | Time: {total_time:.2f}ms")
    print("=" * 94 + "\n")

    return {
        "concept": Config.CURRENT_CONCEPT_NAME,
        "instance": Config.DEFAULT_INSTANCE,
        "total": len(targets),
        "passed": pass_count,
        "notices": notice_count,
        "defects": defect_count,
        "failed": fail_count,
        "duration_ms": total_time,
        "results": results
    }

def main():
    parser = argparse.ArgumentParser(description="BlackTrader PAMM Scenario Test Runner (Hedging & Netting)")
    parser.add_argument("--id", type=str, help="Scenario ID to execute (e.g. BTPAMM-F001)")
    parser.add_argument("--module", type=int, help="Module number to execute (1 to 11)")
    parser.add_argument("--priority", type=str, help="Priority level to filter (P0, P1, P2)")
    parser.add_argument("--concept", type=str, choices=["hedging", "netting", "both"], default="both", help="Concept to test: hedging, netting, or both (default: both)")
    parser.add_argument("--all", action="store_true", help="Execute all 165 scenarios")
    parser.add_argument("--bugs", action="store_true", help="Display all detected platform bugs")
    args = parser.parse_args()

    tracker = BugTracker()

    if args.bugs:
        bugs = tracker.get_all()
        print("\n" + "=" * 90)
        print("  DETECTED BLACKTRADER PLATFORM BUGS & DEFECTS MATRIX")
        print("=" * 90)
        for b in bugs:
            print(f"\n[{b['bug_id']}] {b['title']} ({b['severity']})")
            print(f"  Scenario:   {b['scenario_id']} | Category: {b['category']}")
            print(f"  Endpoint:   {b['endpoint']}")
            print(f"  Observed:   {b['observed_behavior']}")
            print(f"  Root Cause: {b['root_cause']}")
            print(f"  Repro Curl: {b['reproduction_curl']}")
        print("\n" + "=" * 90)
        return

    concepts_to_run = []
    if args.concept == "hedging":
        concepts_to_run = ["hedging"]
    elif args.concept == "netting":
        concepts_to_run = ["netting"]
    else:
        concepts_to_run = ["hedging", "netting"]

    suite_runs = []
    all_results = []

    for c in concepts_to_run:
        summary = execute_suite_for_concept(c, args)
        suite_runs.append(summary)
        all_results.extend(summary["results"])

    # If both were run, print Dual-Concept Matrix
    if len(suite_runs) > 1:
        print("\n" + "=" * 94)
        print("  DUAL-CONCEPT QUALITY CERTIFICATION SUMMARY (11 MODULES / 165 SCENARIOS)")
        print("=" * 94)
        print(f"  {'Concept':<20} | {'Total':<6} | {'Passed':<8} | {'Notices':<8} | {'Defects':<8} | {'Failed':<8} | {'Duration'}")
        print("-" * 94)
        for s in suite_runs:
            print(f"  {s['concept']:<20} | {s['total']:<6} | \033[92m{s['passed']:<8}\033[0m | \033[96m{s['notices']:<8}\033[0m | \033[93m{s['defects']:<8}\033[0m | \033[91m{s['failed']:<8}\033[0m | {s['duration_ms']:.1f}ms")
        print("=" * 94 + "\n")

    # Save to JSON
    Config.REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    with open(Config.RESULTS_FILE, "w", encoding="utf-8") as f:
        json.dump(all_results, f, indent=2)
    print(f"[+] Detailed execution results saved to: {Config.RESULTS_FILE}")

if __name__ == "__main__":
    main()
