#!/usr/bin/env python3
"""
CLI Runner for BlackTrader PAMM Concurrency & Race-Condition Test Suite
Usage:
  python3 pamm_blacktrader_suite/race_tests/run_race_suite.py [--priority P0] [--module M1] [--mode quick|deep] [--iters 10]
"""
import sys
import os
import argparse

# Add repo root to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from pamm_blacktrader_suite.race_tests.runner import MasterRaceRunner

def main():
    parser = argparse.ArgumentParser(description="BlackTrader PAMM Race Condition Suite")
    parser.add_argument("--priority", choices=["P0", "P1", "P2"], help="Filter by priority")
    parser.add_argument("--module", help="Filter by module (M1 to M11, or F, A, R, E, P, M, D, H, C, L, O)")
    parser.add_argument("--scenario", help="Run single scenario (e.g. RC-F-01)")
    parser.add_argument("--mode", choices=["quick", "deep"], default="quick", help="Execution mode (quick: 5 iters, deep: 25 iters)")
    parser.add_argument("--iters", type=int, help="Override iteration count per scenario")

    args = parser.parse_args()

    runner = MasterRaceRunner()
    result = runner.run_suite(
        priority=args.priority,
        module_filter=args.module,
        scenario_id=args.scenario,
        mode=args.mode,
        iterations=args.iters
    )

    print("\n" + "="*70)
    print("BLACKTRADER PAMM CONCURRENCY & RACE AUDIT SUMMARY")
    print("="*70)
    print(f"Total Scenarios Evaluated: {result['total_count']}")
    print(f"Passed:                   {result['passed_count']} / {result['total_count']}")
    print(f"Failed:                   {result['failed_count']}")
    print(f"Total Iterations Run:     {result['total_iterations']}")
    print(f"Total Violations:         {result['total_violations']}")
    print(f"Overall Violation Rate:   {result['violation_rate_pct']}%")
    print(f"Elapsed Time:             {result['elapsed_seconds']}s")
    print("="*70)

if __name__ == "__main__":
    main()
