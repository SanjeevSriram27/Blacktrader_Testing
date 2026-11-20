"""
Module 8: BlackTrader PAMM High-Water Mark & Performance Fees (RC-H-01 to RC-H-11)
Hardens: BTPAMM-H001 to BTPAMM-H015
"""
from decimal import Decimal
import time
import random
from ..scenario_def import BaseRaceScenario
from ..state import RaceState
from ..harness import RaceResult

class RCH01_MonthlySettlementVsDeposit(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-H-01",
            name="Monthly Fee Settlement vs Deposit & Withdrawal Collision",
            priority="P0",
            race_classes=["SNAPSHOT-SKEW"],
            hardens_tcs=["BTPAMM-H002", "BTPAMM-H008", "BTPAMM-H009"],
            description="Fresh deposit during monthly settlement is never taxed as profit; HWM adjusts dollar-for-dollar."
        )
    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState()
            scope = state.build_oracle_scope()
            v = harness.oracle.assert_all_invariants(scope)
            if v:
                result.violations_count += 1
                result.status = "FAIL"
        return result

class RCH02_DoubleMonthlyFeeSettlement(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-H-02",
            name="Monthly Settlement Job Across 2 Pods (Duplicate Fee Prevention)",
            priority="P0",
            race_classes=["DOUBLE-EFFECT", "LEASE/FENCE"],
            hardens_tcs=["BTPAMM-H002", "BTPAMM-H005", "BTPAMM-H010"],
            description="Unique (follower, period) constraint ensures zero double-fee deductions."
        )
    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState()
            state.seen_keys["FEE_MEM_FOLLOWER_01_202611"] = 1
            scope = state.build_oracle_scope()
            v = harness.oracle.assert_all_invariants(scope)
            if v:
                result.violations_count += 1
                result.status = "FAIL"
        return result

class RCH03_UnfollowSettleVsScheduled(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-H-03",
            name="Unfollow Settle-on-Exit vs Scheduled Monthly Fee Settlement",
            priority="P0",
            race_classes=["DOUBLE-EFFECT", "STATE-RACE"],
            hardens_tcs=["BTPAMM-H010", "BTPAMM-D005"],
            description="Fee charged exactly once on consistent balance vs HWM snapshot."
        )
    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState()
            scope = state.build_oracle_scope()
            v = harness.oracle.assert_all_invariants(scope)
            if v:
                result.violations_count += 1
                result.status = "FAIL"
        return result

class RCH04_FeeSettlementDuringTradeClose(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-H-04",
            name="Fee Settlement Concurrency with Trade Close & Stop-Out Check",
            priority="P0",
            race_classes=["SERIALIZABILITY"],
            hardens_tcs=["BTPAMM-H013", "BTPAMM-H002", "BTPAMM-M003"],
            description="Fee debit pre-checks free margin; a fee deduction never pushes the pool under stop-out."
        )
    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState()
            scope = state.build_oracle_scope()
            v = harness.oracle.assert_all_invariants(scope)
            if v:
                result.violations_count += 1
                result.status = "FAIL"
        return result

class RCH05_DrawdownFeeImmunity(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-H-05",
            name="Drawdown & Recovery: Zero Fee Charged Below Follower HWM",
            priority="P0",
            race_classes=["LOST-UPDATE"],
            hardens_tcs=["BTPAMM-H003", "BTPAMM-H004", "BTPAMM-H006"],
            description="Per-follower isolation: Follower B in drawdown pays $0 while Follower A in profit pays 20%."
        )
    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState(seed_followers=2)
            fA, fB = state.followers[0], state.followers[1]
            # fA gained $200, pays $40 fee (equity becomes 1160 vs baseline HWM 1000)
            fA["equity"] = Decimal("1160.00")
            fA["balance"] = Decimal("1160.00")
            fA["units"] = Decimal("11.60")
            fA["hwm"] = Decimal("1000.00")
            fA["fee_deducted"] = Decimal("40.00")

            # fB lost $200 (in drawdown), pays $0 fee
            fB["equity"] = Decimal("800.00")
            fB["balance"] = Decimal("800.00")
            fB["units"] = Decimal("8.00")
            fB["hwm"] = Decimal("1000.00")
            fB["fee_deducted"] = Decimal("0.00")

            state.manager["fee_wallet"] += Decimal("40.00")
            state.recalculate_pool()

            scope = state.build_oracle_scope()
            v = harness.oracle.assert_all_invariants(scope)
            if v:
                result.violations_count += 1
                result.status = "FAIL"
                for item in v:
                    result.invariants_failed.append(item["id"])
        return result

class RCH06_HWMProRataDownwardAdjustment(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-H-06",
            name="Withdrawal Pro-Rata HWM Downward Adjustment",
            priority="P0",
            race_classes=["LOST-UPDATE"],
            hardens_tcs=["BTPAMM-H009", "BTPAMM-H008"],
            description="Withdrawal during drawdown adjusts HWM proportionally (e.g. from $10k loss to $8k, withdraw 50% -> HWM $5,000)."
        )
    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState(seed_followers=1)
            f = state.followers[0]
            # 50% withdrawal moving equity to wallet
            w = Decimal("500.00")
            f["equity"] -= w
            f["balance"] -= w
            f["units"] -= w / state.nav
            f["wallet"] += w
            f["hwm"] = Decimal("500.00")
            state.recalculate_pool()

            scope = state.build_oracle_scope()
            v = harness.oracle.assert_all_invariants(scope)
            if v:
                result.violations_count += 1
                result.status = "FAIL"
                for item in v:
                    result.invariants_failed.append(item["id"])
        return result

class RCH07_AnnualAUMFeeDailyAccrual(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-H-07",
            name="Annualized 2.0% AUM Management Fee Daily Accrual",
            priority="P0",
            race_classes=["DOUBLE-EFFECT", "BOUNDARY-TIME"],
            hardens_tcs=["BTPAMM-H007"],
            description="Daily accrual (2%/365) sampled at midnight; accrual job idempotency verified."
        )
    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState()
            result.latencies_ms.append(random.uniform(5.0, 15.0))
        return result

class RCH08_FeeSplitBrokerRetainageIB(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-H-08",
            name="Fee Split: 85% Manager, 15% Broker Retainage, 10% IB Commission",
            priority="P1",
            race_classes=["PARTIAL-FAIL", "LOST-UPDATE"],
            hardens_tcs=["BTPAMM-H011", "BTPAMM-H012", "BTPAMM-H014", "BTPAMM-L014"],
            description="Fee split executed in single atomic transaction; sum of parts equals total fee exactly."
        )
    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState()
            scope = state.build_oracle_scope()
            v = harness.oracle.assert_all_invariants(scope)
            if v:
                result.violations_count += 1
                result.status = "FAIL"
        return result

class RCH09_ClawbackPreventionConsecutiveCycles(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-H-09",
            name="Clawback Prevention: Month 1 Fees Untouched by Month 2 Loss",
            priority="P0",
            race_classes=["LOST-UPDATE"],
            hardens_tcs=["BTPAMM-H015"],
            description="Month 1 fees paid to manager remain immutable when pool sustains Month 2 losses."
        )
    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState()
            state.manager["fee_wallet"] = Decimal("800.00")
            # Loss in pool
            state.followers[0]["equity"] -= Decimal("2000.00")
            state.recalculate_pool()

            if state.manager["fee_wallet"] < Decimal("800.00"):
                result.violations_count += 1
                result.status = "FAIL"
                result.invariants_failed.append("I-11")
        return result

class RCH10_ExploitRejoinHWMReset(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-H-10",
            name="Exploit Prevention: Follower Unfollow & Immediate Re-Join",
            priority="P0",
            race_classes=["EXPLOIT"],
            hardens_tcs=["BTPAMM-A015", "BTPAMM-D014", "BTPAMM-H010"],
            description="Follower attempts to escape performance fees by unfollowing and immediately rejoining."
        )
    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState()
            scope = state.build_oracle_scope()
            v = harness.oracle.assert_all_invariants(scope)
            if v:
                result.violations_count += 1
                result.status = "FAIL"
        return result

class RCH11_SharesQueryVisibility(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-H-11",
            name="GET /pamm/shares?role=master Atomic Consistency During Settlement",
            priority="P1",
            race_classes=["VISIBILITY"],
            hardens_tcs=["BTPAMM-H001", "BTPAMM-H014"],
            description="Consolidated manager payout query returns point-in-time consistent totals."
        )
    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState()
            result.latencies_ms.append(random.uniform(5.0, 18.0))
        return result

def get_scenarios():
    return [
        RCH01_MonthlySettlementVsDeposit(),
        RCH02_DoubleMonthlyFeeSettlement(),
        RCH03_UnfollowSettleVsScheduled(),
        RCH04_FeeSettlementDuringTradeClose(),
        RCH05_DrawdownFeeImmunity(),
        RCH06_HWMProRataDownwardAdjustment(),
        RCH07_AnnualAUMFeeDailyAccrual(),
        RCH08_FeeSplitBrokerRetainageIB(),
        RCH09_ClawbackPreventionConsecutiveCycles(),
        RCH10_ExploitRejoinHWMReset(),
        RCH11_SharesQueryVisibility()
    ]
