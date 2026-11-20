"""
BlackTrader PAMM - Race Condition & Concurrency Suite Configuration
Derived from PAMM_Deep_Race_Condition_Test_Spec.md Section 4 (Oracle Switches)
"""
from decimal import Decimal
import os

class OracleConfig:
    # Q1: Share-% model vs NAV-unit model
    # Options: 'shares' | 'units' | 'both'
    ACCOUNTING_MODEL = "both"

    # Q2: When does a deposit take effect: immediately or at next rollover?
    # Options: 'immediate' | 'next_rollover'
    DEPOSIT_EFFECTIVE = "immediate"

    # Q3: Do mid-trade joiners share P&L of an already-open trade?
    # Options: 'excluded' | 'nav_neutral'
    NEW_JOINER_OPEN_TRADE_PNL = "excluded"

    # Q4: Withdrawal timing: instant vs queued
    # Options: 'instant_or_queued' | 'always_queued' | 'always_instant'
    WITHDRAW_POLICY = "instant_or_queued"
    UNFOLLOW_SETTLES = "immediate"

    # Q5: Rounding precision: 6 dp allocations vs 2 dp banker's rounding with residual to reserve
    ALLOCATION_DP = 6
    ROUNDING_MODE = "ROUND_HALF_EVEN"
    RESIDUAL_SINK = "reserve"

    # Q6: Latency SLOs (ms)
    SLO_C001_MS = 80
    SLO_C002_MS = 150
    SLO_GATE_P99_MS = 100
    SLO_ALERT_MS = 250

    # Q7: Multi-pool following allowed?
    MULTI_FOLLOW = False

    # Q8: HWM convention
    # Net-of-fee confirmed: HWM after = balance - fee
    HWM_NET_OF_FEE = True

    # Tolerances
    MONEY_TOLERANCE = Decimal("0.00")
    UNIT_TOLERANCE = Decimal("0.01")  # Cent-level tolerance for pool total equity vs units * NAV
    SHARE_PCT_TOLERANCE = Decimal("0.000001")

class HarnessConfig:
    # Iteration counts
    DEFAULT_P0_SWEEP_ITERS = 200     # Recommended 500 for full soak; 200 for deep CI
    DEFAULT_P0_FANOUT_ITERS = 100    # N-way fan-out iterations
    DEFAULT_P1_ITERS = 50
    DEFAULT_P2_ITERS = 25
    QUICK_MODE_ITERS = 10            # Fast verification mode

    # Default Skew Sweep Offsets (ms)
    SKEW_OFFSETS_MS = [-50, -25, -10, -5, -2, -1, 0, 1, 2, 5, 10, 25, 50]

    # Staging OMS API Base
    BASE_URL = os.getenv("BLACKTRADER_BASE_URL", "https://lpadmin.blackfx.com")
    OMS_REAL_URL = f"{BASE_URL}/v1/oms/real"
    OMS_REAL_NET_URL = f"{BASE_URL}/v1/oms/real-net"
    OMS_PAPER_URL = f"{BASE_URL}/v1/oms/paper"
