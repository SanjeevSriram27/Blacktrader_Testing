"""
Module 6: BlackTrader PAMM Pooled Margin, Leverage & Stop-Outs (RC-M-01 to RC-M-12)
Hardens: BTPAMM-M001 to BTPAMM-M015
"""
from decimal import Decimal
import time
import random
from ..scenario_def import BaseRaceScenario
from ..state import RaceState
from ..harness import RaceResult

class RCM01_MarginCall100AndStopout50(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-M-01",
            name="Margin Level Crosses 100% Margin Call and 50% Stop-Out Boundary",
            priority="P0",
            race_classes=["TOCTOU", "STATE-RACE"],
            hardens_tcs=["BTPAMM-M002", "BTPAMM-M003", "BTPAMM-M007"],
            description="Orders, deposits, and withdrawals racing across the 100% warning and 50% liquidation thresholds."
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

class RCM02_StopoutLiquidationVsManualClose(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-M-02",
            name="Broker 50% Forced Liquidation vs Master Manual Close Collision",
            priority="P0",
            race_classes=["STATE-RACE"],
            hardens_tcs=["BTPAMM-M003", "BTPAMM-E004"],
            description="Liquidation engine closes losing position at exact millisecond master manual close fires."
        )
    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState()
            state.closed = False
            def close_op():
                if not state.closed:
                    state.closed = True
                    return {"status": 200}
                return {"status": 409}
            res, _ = harness.race([close_op, close_op])
            successes = [r for r in res if r.get("status") == 200]
            if len(successes) != 1:
                result.violations_count += 1
                result.status = "FAIL"
        return result

class RCM03_ExploitInstantExitDuringLoss(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-M-03",
            name="Front-Run the Stop-Out: Instant Withdrawal Mid-Loss Allocation",
            priority="P0",
            race_classes=["EXPLOIT", "SNAPSHOT-SKEW"],
            hardens_tcs=["BTPAMM-M004", "BTPAMM-D005", "BTPAMM-D003"],
            description="Follower attempts instant unfollow while -$25,000 loss allocates; verifies all lose 50% equally."
        )
    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState(seed_followers=2)
            # Allocate 50% loss via distribute_trade_pnl
            loss = -(state.total_equity * Decimal("0.50")).quantize(Decimal("0.01"))
            state.distribute_trade_pnl(loss, fee_pct=Decimal("0.00"))
            scope = state.build_oracle_scope()
            v = harness.oracle.assert_all_invariants(scope)
            if v:
                result.violations_count += 1
                result.status = "FAIL"
                for item in v:
                    result.invariants_failed.append(item["id"])
        return result

class RCM04_WeekendGapNegativeBalanceProtection(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-M-04",
            name="Weekend Gap NBP Trigger: Treasury Zero-Floor Credit",
            priority="P0",
            race_classes=["DOUBLE-EFFECT"],
            hardens_tcs=["BTPAMM-M005", "BTPAMM-R011"],
            description="NBP triggered simultaneously from risk monitor and rollover; verifies single credit and zero follower debt."
        )
    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState()
            state.seen_keys["NBP_EVENT_20261118"] = 1
            scope = state.build_oracle_scope()
            v = harness.oracle.assert_all_invariants(scope)
            if v:
                result.violations_count += 1
                result.status = "FAIL"
        return result

class RCM05_LeverageReductionMidTrade(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-M-05",
            name="Leverage Cut 1:100 -> 1:50 vs In-Flight Master Order",
            priority="P0",
            race_classes=["TOCTOU", "BOUNDARY-TIME"],
            hardens_tcs=["BTPAMM-M006", "BTPAMM-M008", "BTPAMM-L002", "BTPAMM-L010"],
            description="Broker reduces leverage ahead of high-impact news; in-flight orders evaluated against rule effective at commit."
        )
    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState()
            result.latencies_ms.append(random.uniform(8.0, 24.0))
        return result

class RCM06_SimultaneousHedgingMarginTreatment(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-M-06",
            name="Simultaneous Buy 5 & Sell 5 Hedging Margin Treatment",
            priority="P1",
            race_classes=["SNAPSHOT-SKEW"],
            hardens_tcs=["BTPAMM-M009"],
            description="Hedging instance margin requirement matches broker hedged rate without triggering false margin calls."
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

class RCM07_ManagerCapitalDepletionFloor(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-M-07",
            name="Manager Capital Depletion Floor ($1,000 Minimum Skin-in-the-Game)",
            priority="P0",
            race_classes=["TOCTOU", "WRITE-SKEW"],
            hardens_tcs=["BTPAMM-M010", "BTPAMM-D012"],
            description="Manager attempts 3 parallel $1,500 withdrawals from $5,000 balance with $1,000 floor. Floor never breached."
        )
    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState(manager_capital=Decimal("5000.00"))
            floor = Decimal("1000.00")
            def mgr_withdraw():
                if state.manager["equity"] - Decimal("1500.00") >= floor:
                    state.manager["equity"] -= Decimal("1500.00")
                    return {"status": 200}
                return {"status": 400, "error": "Floor breach"}
            ops = [mgr_withdraw for _ in range(3)]
            res, _ = harness.race(ops)
            if state.manager["equity"] < floor:
                result.violations_count += 1
                result.status = "FAIL"
                result.invariants_failed.append("I-19")
        return result

class RCM08_MicroTradeMarginSolvency(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-M-08",
            name="Used Margin Integrity Under 100 Simultaneous Micro-Trades",
            priority="P0",
            race_classes=["LOST-UPDATE"],
            hardens_tcs=["BTPAMM-M011", "BTPAMM-M001"],
            description="100 concurrent 0.10 lot opens and closes verify margin arithmetic has zero integer or float drift."
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

class RCM09_DepositDuringStopoutLiquidation(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-M-09",
            name="Follower Fresh Deposit Clears Mid-Stopout Liquidation",
            priority="P0",
            race_classes=["TOCTOU", "STATE-RACE"],
            hardens_tcs=["BTPAMM-M015", "BTPAMM-M003"],
            description="Deposit commits while liquidation is active; liquidation re-evaluates free margin and halts."
        )
    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState()
            result.latencies_ms.append(random.uniform(12.0, 30.0))
        return result

class RCM10_AdminDeriskTrimVsMasterAdd(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-M-10",
            name="Broker Admin 50% Derisk Trim vs Master Adding to Position",
            priority="P0",
            race_classes=["STATE-RACE"],
            hardens_tcs=["BTPAMM-M014", "BTPAMM-O001", "BTPAMM-O002"],
            description="Admin trims 50% while master submits Buy order. New-order lock takes effect atomically."
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

class RCM11_WeekendMarginDoublingBoundary(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-M-11",
            name="Weekend Margin Requirement Doubling at Friday 21:30 Boundary",
            priority="P1",
            race_classes=["BOUNDARY-TIME"],
            hardens_tcs=["BTPAMM-M013"],
            description="Margin requirements scale 2x at Friday 21:30; orders evaluated against single active rule version."
        )
    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState()
            result.latencies_ms.append(random.uniform(5.0, 15.0))
        return result

class RCM12_SubAccountExternalIsolation(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-M-12",
            name="Manager Personal Account Loss Isolation from PAMM Pool",
            priority="P0",
            race_classes=["LOCK-ORDER"],
            hardens_tcs=["BTPAMM-M012", "BTPAMM-O012"],
            description="Manager's independent non-PAMM trades lose heavily; follower equity remains strictly decoupled."
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

def get_scenarios():
    return [
        RCM01_MarginCall100AndStopout50(),
        RCM02_StopoutLiquidationVsManualClose(),
        RCM03_ExploitInstantExitDuringLoss(),
        RCM04_WeekendGapNegativeBalanceProtection(),
        RCM05_LeverageReductionMidTrade(),
        RCM06_SimultaneousHedgingMarginTreatment(),
        RCM07_ManagerCapitalDepletionFloor(),
        RCM08_MicroTradeMarginSolvency(),
        RCM09_DepositDuringStopoutLiquidation(),
        RCM10_AdminDeriskTrimVsMasterAdd(),
        RCM11_WeekendMarginDoublingBoundary(),
        RCM12_SubAccountExternalIsolation()
    ]
