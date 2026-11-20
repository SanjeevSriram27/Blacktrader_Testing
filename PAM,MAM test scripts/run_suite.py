#!/usr/bin/env python3
"""
Root Unified Launcher for BlackTrader PAMM & MAM Quality Automation Suite.
Enables running scenarios directly from `/Users/appdev/PAM,MAM test scripts`.

Usage:
    python3 run_suite.py --id BTPAMM-A001       # Run specific PAMM scenario
    python3 run_suite.py --module 1             # Run entire Module 1 (15 scenarios)
    python3 run_suite.py --priority P0          # Run all P0 blocker scenarios
    python3 run_suite.py --all                  # Run all 165 PAMM scenarios
    python3 run_suite.py --bugs                 # View registered platform bugs
    python3 run_suite.py --dashboard            # Start the interactive UI dashboard
"""

import sys
import os
import subprocess
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
PAMM_DIR = ROOT_DIR / "pamm"

def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--dashboard":
        server_path = PAMM_DIR / "dashboard" / "server.py"
        print("🚀 Starting BlackTrader PAMM Live Dashboard on http://localhost:8088 ...")
        cmd = [sys.executable, str(server_path)]
        try:
            subprocess.run(cmd, cwd=str(PAMM_DIR))
        except KeyboardInterrupt:
            print("\nDashboard server stopped.")
        return

    # Forward all args to pamm/run_scenario.py
    runner_path = PAMM_DIR / "run_scenario.py"
    cmd = [sys.executable, str(runner_path)] + sys.argv[1:]
    res = subprocess.run(cmd, cwd=str(PAMM_DIR))
    sys.exit(res.returncode)

if __name__ == "__main__":
    main()
