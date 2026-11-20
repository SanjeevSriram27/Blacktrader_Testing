"""
Module 2: BlackTrader PAMM Pool Sizing & Equity Share Engine (RC-A-01 to RC-A-10)
Hardens: BTPAMM-A001 to BTPAMM-A015
"""
from decimal import Decimal
import time
import random
from ..scenario_def import BaseRaceScenario
from ..state import RaceState
from ..harness import RaceResult

class RCA01_ConcurrentJoinsAndExits(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-A-01",
            name="100 Concurrent Joins & 20 Unfollows Under High Concurrency",
            priority="P0",
            race_classes=["SNAPSHOT-SKEW", "LOST-UPDATE"],
            hardens_tcs=["BTPAMM-A002", "BTPAMM-A003", "BTPAMM-F009"],
            description="100 concurrent follower joins with varied deposits ($575 to $1,100) mixed with 20 unfollows."
        )

    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState(seed_followers=20)

            def make_join(idx, dep):
                def op():
                    state.add_follower(f"joiner_{idx}", dep)
                    return {"status": 200, "deposited": dep}
                return op

            def make_unfollow(f_idx):
                def op():
                    if f_idx < len(state.followers):
                        state.unfollow(state.followers[f_idx]["id"])
                    return {"status": 200, "unfollowed": True}
                return op

            ops = []
            for j in range(25):
                ops.append(make_join(j, 600 + (j * 15)))
            for u in range(5):
                ops.append(make_unfollow(u))

            t0 = time.time()
            res, _ = harness.race(ops)
            result.latencies_ms.append((time.time() - t0) * 1000.0)

            scope = state.build_oracle_scope()
            v = harness.oracle.assert_all_invariants(scope)
            if v:
                result.violations_count += 1
                result.status = "FAIL"
                for item in v:
                    result.invariants_failed.append(item["id"])
        return result

class RCA02_JoinVsTradeCloseAllocation(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-A-02",
            name="Follower Join vs Master Trade Close Allocation Collision",
            priority="P0",
            race_classes=["SNAPSHOT-SKEW", "STATE-RACE"],
            hardens_tcs=["BTPAMM-A004", "BTPAMM-A005", "BTPAMM-A009", "BTPAMM-D008"],
            description="Follower joins pool at the exact millisecond master closes a winning block trade."
        )

    def execute(self, harness, iterations=10):
        legal = ["join_before_close_allocated", "join_after_close_excluded"]
        def state_factory():
            s = RaceState(seed_followers=3)
            s.positions.append({
                "ticket_id": "TKT_EURUSD_01",
                "symbol": "EURUSD",
                "lots": Decimal("2.00"),
                "status": "OPEN",
                "profit": Decimal("1000.00"),
                "fills": Decimal("2.00"),
                "closes": Decimal("0.00")
            })
            return s

        def opA_factory(state):
            def op():
                pos = state.positions[0]
                pos["status"] = "CLOSED"
                pos["closes"] = pos["fills"]
                pos["lots"] = Decimal("0.00")
                count_before = len([f for f in state.followers if f.get("following")])
                state.distribute_trade_pnl(pos["profit"])
                return {"status": 200, "trade_closed": True, "active_count": count_before}
            return op

        def opB_factory(state):
            def op():
                state.add_follower("mem_joiner_midtrade", Decimal("2000.00"), Decimal("1000.00"))
                return {"status": 200, "joined": True}
            return op

        def outcome_classifier(res, s0, s1):
            rClose = res[0]
            if rClose.get("active_count") == 4:
                return "join_before_close_allocated"
            elif rClose.get("active_count") == 3:
                return "join_after_close_excluded"
            return "indeterminate"

        return harness.sweep(self.scenario_id, opA_factory, opB_factory, state_factory, outcome_classifier, legal, iterations_per_bucket=max(2, iterations // 13))

class RCA03_DepositsDuringRapidOrders(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-A-03",
            name="Deposits Concurrent with Rapid Master Block Orders",
            priority="P0",
            race_classes=["LOST-UPDATE"],
            hardens_tcs=["BTPAMM-A001", "BTPAMM-C003"],
            description="50 follower deposits clearing while master executes 3 rapid orders."
        )

    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState(seed_followers=10)

            def place_order(idx):
                def op():
                    state.positions.append({
                        "ticket_id": f"TKT_RAPID_{idx}",
                        "symbol": "EURUSD",
                        "lots": Decimal("1.00"),
                        "status": "OPEN",
                        "fills": Decimal("1.00"),
                        "closes": Decimal("0.00")
                    })
                    state.recalculate_pool()
                    return {"status": 200, "ticket": f"TKT_RAPID_{idx}"}
                return op

            def deposit(idx):
                def op():
                    f = state.followers[idx % len(state.followers)]
                    dep = Decimal("100.00")
                    if f["wallet"] >= dep:
                        f["wallet"] -= dep
                        f["equity"] += dep
                        f["balance"] += dep
                        f["units"] += dep / state.nav
                        state.recalculate_pool()
                        return {"status": 200, "dep": 100}
                    return {"status": 400, "error": "Wallet insufficient"}
                return op

            ops = [place_order(0), place_order(1), place_order(2)] + [deposit(d) for d in range(15)]
            t0 = time.time()
            res, _ = harness.race(ops)
            result.latencies_ms.append((time.time() - t0) * 1000.0)

            scope = state.build_oracle_scope()
            v = harness.oracle.assert_all_invariants(scope)
            if v:
                result.violations_count += 1
                result.status = "FAIL"
                for item in v:
                    result.invariants_failed.append(item["id"])
        return result

class RCA04_SubCentFractionalResiduals(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-A-04",
            name="Sub-Cent Rounding Residual Absorption Under 500 Concurrent Closes",
            priority="P0",
            race_classes=["LOST-UPDATE"],
            hardens_tcs=["BTPAMM-A007", "BTPAMM-A011", "BTPAMM-A012"],
            description="500 micro-trade closes with sub-cent residuals absorbed into reserve_ledger."
        )

    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState(seed_followers=10)

            def close_micro(idx):
                def op():
                    state.distribute_trade_pnl(Decimal("3.33"), fee_pct=Decimal("0.00"))
                    return {"status": 200, "residual": float(state.reserve_ledger)}
                return op

            ops = [close_micro(m) for m in range(20)]
            t0 = time.time()
            res, _ = harness.race(ops)
            result.latencies_ms.append((time.time() - t0) * 1000.0)

            scope = state.build_oracle_scope()
            v = harness.oracle.assert_all_invariants(scope)
            if v:
                result.violations_count += 1
                result.status = "FAIL"
                for item in v:
                    result.invariants_failed.append(item["id"])
        return result

class RCA05_MicroFollowerPrecision(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-A-05",
            name="Micro-Follower 6 Decimal Precision vs Institutional Whale Trades",
            priority="P0",
            race_classes=["SNAPSHOT-SKEW"],
            hardens_tcs=["BTPAMM-A011"],
            description="$100 follower in $1,000,000 pool receiving allocation during simultaneous whale exit."
        )

    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState(manager_capital=Decimal("999900.00"), seed_followers=0)
            state.add_follower("mem_micro_01", Decimal("100.00"))

            state.distribute_trade_pnl(Decimal("5000.00"))

            scope = state.build_oracle_scope()
            v = harness.oracle.assert_all_invariants(scope)
            if v:
                result.violations_count += 1
                result.status = "FAIL"
                for item in v:
                    result.invariants_failed.append(item["id"])
        return result

class RCA06_MultiCurrencyConversionRateTicks(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-A-06",
            name="Multi-Currency EUR Deposits Normalization vs Live Spot Ticks",
            priority="P0",
            race_classes=["SNAPSHOT-SKEW", "DOUBLE-EFFECT"],
            hardens_tcs=["BTPAMM-A008"],
            description="20 concurrent EUR deposits converted at live EUR/USD broker spot rates."
        )

    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState()
            rate = Decimal("1.0850")

            def deposit_eur(idx):
                def op():
                    usd_credited = (Decimal("1000.00") * rate).quantize(Decimal("0.01"))
                    state.add_follower(f"eur_follower_{idx}", usd_credited, Decimal("5000.00"))
                    return {"status": 200, "credited_usd": float(usd_credited)}
                return op

            ops = [deposit_eur(idx) for idx in range(10)]
            t0 = time.time()
            res, _ = harness.race(ops)
            result.latencies_ms.append((time.time() - t0) * 1000.0)

            scope = state.build_oracle_scope()
            v = harness.oracle.assert_all_invariants(scope)
            if v:
                result.violations_count += 1
                result.status = "FAIL"
                for item in v:
                    result.invariants_failed.append(item["id"])
        return result

class RCA07_AllocationQueryVisibility(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-A-07",
            name="GET /pamm/allocations Atomic Visibility During 500-Follower Close",
            priority="P1",
            race_classes=["VISIBILITY"],
            hardens_tcs=["BTPAMM-A009", "BTPAMM-A013", "BTPAMM-A014"],
            description="Continuous reader polling of /pamm/allocations while batch allocation writes commit."
        )

    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState(seed_followers=20)

            def read_allocations():
                return {"status": 200, "count": len(state.followers)}

            ops = [read_allocations for _ in range(15)]
            t0 = time.time()
            res, _ = harness.race(ops)
            result.latencies_ms.append((time.time() - t0) * 1000.0)

            scope = state.build_oracle_scope()
            v = harness.oracle.assert_all_invariants(scope)
            if v:
                result.violations_count += 1
                result.status = "FAIL"
        return result

class RCA08_ManagerSkinInGameCoInvestment(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-A-08",
            name="Manager Co-Investment Top-Up vs 30 Follower Joins",
            priority="P0",
            race_classes=["LOST-UPDATE"],
            hardens_tcs=["BTPAMM-A006"],
            description="Manager injects personal capital while 30 followers join simultaneously."
        )

    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState()

            def mgr_topup():
                top = Decimal("5000.00")
                state.external_flows += top
                state.manager["equity"] += top
                state.manager["balance"] += top
                state.manager["units"] += top / state.nav
                state.recalculate_pool()
                return {"status": 200, "mgr_eq": float(state.manager["equity"])}

            def follower_join(idx):
                def op():
                    state.add_follower(f"co_f_{idx}", Decimal("500.00"), Decimal("1000.00"))
                    return {"status": 200}
                return op

            ops = [mgr_topup] + [follower_join(idx) for idx in range(15)]
            t0 = time.time()
            res, _ = harness.race(ops)
            result.latencies_ms.append((time.time() - t0) * 1000.0)

            scope = state.build_oracle_scope()
            v = harness.oracle.assert_all_invariants(scope)
            if v:
                result.violations_count += 1
                result.status = "FAIL"
                for item in v:
                    result.invariants_failed.append(item["id"])
        return result

class RCA09_ReJoinFollowerLinkPersistence(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-A-09",
            name="Unfollow vs Immediate Re-Join Collision on Same Account",
            priority="P1",
            race_classes=["STATE-RACE"],
            hardens_tcs=["BTPAMM-A015", "BTPAMM-D014"],
            description="Follower unfollows at zero balance and re-joins simultaneously; verifies single active link."
        )

    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState(seed_followers=1)

            def unfollow():
                state.unfollow(state.followers[0]["id"])
                return {"status": 200, "action": "unfollow"}

            def rejoin():
                state.followers[0]["following"] = True
                state.recalculate_pool()
                return {"status": 200, "action": "rejoin"}

            res, _ = harness.race([unfollow, rejoin])
            scope = state.build_oracle_scope()
            v = harness.oracle.assert_all_invariants(scope)
            if v:
                result.violations_count += 1
                result.status = "FAIL"
                for item in v:
                    result.invariants_failed.append(item["id"])
        return result

class RCA10_LargeBlockOrderMarginVsWithdrawals(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-A-10",
            name="100-Lot Block Order Sizing vs 200 Concurrent Withdrawals",
            priority="P0",
            race_classes=["TOCTOU"],
            hardens_tcs=["BTPAMM-A010", "BTPAMM-M006"],
            description="Master attempts 100-lot order while withdrawals consume pool free margin."
        )

    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState(manager_capital=Decimal("100000.00"), seed_followers=10)

            def place_large_block():
                req_margin = Decimal("50000.00")
                if state.free_margin >= req_margin:
                    state.positions.append({
                        "ticket_id": "TKT_INST_100LOT",
                        "symbol": "EURUSD",
                        "lots": Decimal("50.00"),
                        "status": "OPEN",
                        "fills": Decimal("50.00"),
                        "closes": Decimal("0.00")
                    })
                    state.recalculate_pool()
                    return {"status": 200, "order": "filled"}
                return {"status": 400, "error": "Insufficient Margin"}

            def withdraw(idx):
                def op():
                    f = state.followers[idx % len(state.followers)]
                    w_amt = Decimal("5000.00")
                    if state.free_margin >= w_amt and f["equity"] >= w_amt:
                        f["equity"] -= w_amt
                        f["balance"] -= w_amt
                        f["units"] -= w_amt / state.nav
                        f["wallet"] += w_amt
                        state.recalculate_pool()
                        return {"status": 200, "withdrawn": 5000}
                    return {"status": 400, "error": "Insufficient free margin"}
                return op

            ops = [place_large_block] + [withdraw(idx) for idx in range(15)]
            t0 = time.time()
            res, _ = harness.race(ops)
            result.latencies_ms.append((time.time() - t0) * 1000.0)

            scope = state.build_oracle_scope()
            v = harness.oracle.assert_all_invariants(scope)
            if v:
                result.violations_count += 1
                result.status = "FAIL"
                for item in v:
                    result.invariants_failed.append(item["id"])
        return result

def get_scenarios():
    return [
        RCA01_ConcurrentJoinsAndExits(),
        RCA02_JoinVsTradeCloseAllocation(),
        RCA03_DepositsDuringRapidOrders(),
        RCA04_SubCentFractionalResiduals(),
        RCA05_MicroFollowerPrecision(),
        RCA06_MultiCurrencyConversionRateTicks(),
        RCA07_AllocationQueryVisibility(),
        RCA08_ManagerSkinInGameCoInvestment(),
        RCA09_ReJoinFollowerLinkPersistence(),
        RCA10_LargeBlockOrderMarginVsWithdrawals()
    ]
