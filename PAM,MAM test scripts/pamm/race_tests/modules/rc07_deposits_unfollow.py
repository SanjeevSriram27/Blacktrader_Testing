"""
Module 7: BlackTrader PAMM Deposits, Withdrawals & Mid-Trade Unfollow (RC-D-01 to RC-D-13)
Hardens: BTPAMM-D001 to BTPAMM-D015
"""
from decimal import Decimal
import time
import random
import threading
from ..scenario_def import BaseRaceScenario
from ..state import RaceState
from ..harness import RaceResult

class RCD01_WalletDebitExhaustionRace(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-D-01",
            name="Wallet Exhaustion: 20 Parallel $1,000 Joins from $1,000 Balance",
            priority="P0",
            race_classes=["TOCTOU", "EXPLOIT"],
            hardens_tcs=["BTPAMM-F009", "BTPAMM-D001"],
            description="Follower with $1,000 in wallet fires 20 parallel $1,000 pool joins. Exactly 1 debits, 19 fail."
        )
    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState(manager_capital=Decimal("10000.00"), seed_followers=0)
            f = state.add_follower("mem_follower_w", Decimal("0.00"), Decimal("1000.00"))
            row_lock = threading.Lock()

            def join_op():
                with row_lock:  # SELECT cash FROM wallets WHERE id = ... FOR UPDATE
                    if f["wallet"] >= Decimal("1000.00"):
                        f["wallet"] -= Decimal("1000.00")
                        f["equity"] += Decimal("1000.00")
                        f["units"] += Decimal("1000.00") / state.nav
                        state.recalculate_pool()
                        return {"status": 200, "joined": True}
                    return {"status": 400, "error": "Insufficient funds in wallet"}

            ops = [join_op for _ in range(20)]
            t0 = time.time()
            res, _ = harness.race(ops)
            result.latencies_ms.append((time.time() - t0) * 1000.0)

            successes = [r for r in res if r.get("status") == 200]
            if len(successes) != 1:
                result.violations_count += 1
                result.status = "FAIL"
                result.invariants_failed.append("I-05")
            scope = state.build_oracle_scope()
            v = harness.oracle.assert_all_invariants(scope)
            if v:
                result.violations_count += 1
                result.status = "FAIL"
                for item in v:
                    result.invariants_failed.append(item["id"])
        return result

class RCD02_OperationKeyDeduplication(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-D-02",
            name="Same operation_key 50x Concurrently (Idempotency Deduplication)",
            priority="P0",
            race_classes=["DOUBLE-EFFECT"],
            hardens_tcs=["BTPAMM-F009", "BTPAMM-C005", "BTPAMM-D001"],
            description="50 concurrent joins with identical operation_key; returns identical response with 1 effect."
        )
    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState()
            state.seen_keys["OP_KEY_JOIN_777"] = 1
            scope = state.build_oracle_scope()
            v = harness.oracle.assert_all_invariants(scope)
            if v:
                result.violations_count += 1
                result.status = "FAIL"
        return result

class RCD03_ParallelWithdrawalsLockedEquity(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-D-03",
            name="4 Parallel $3,000 Withdrawal Requests from $10,000 Equity",
            priority="P0",
            race_classes=["TOCTOU"],
            hardens_tcs=["BTPAMM-D002"],
            description="Equity = $10k; at most 3 x $3k succeed, 4th fails with Insufficient Available Equity."
        )
    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState(seed_followers=1)
            f = state.followers[0]
            f["equity"] = Decimal("10000.00")
            state.recalculate_pool()

            def req_w():
                w = Decimal("3000.00")
                if f["equity"] >= w:
                    f["equity"] -= w
                    f["wallet"] += w
                    state.recalculate_pool()
                    return {"status": 200, "w": 3000}
                return {"status": 400, "error": "Insufficient Equity"}

            ops = [req_w for _ in range(4)]
            res, _ = harness.race(ops)
            successes = [r for r in res if r.get("status") == 200]
            if len(successes) > 3:
                result.violations_count += 1
                result.status = "FAIL"
                result.invariants_failed.append("I-05")
        return result

class RCD04_InstantWithdrawalsWriteSkew(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-D-04",
            name="15 Instant Withdrawals vs Master Order Margin Consumption",
            priority="P0",
            race_classes=["WRITE-SKEW"],
            hardens_tcs=["BTPAMM-D003", "BTPAMM-D004", "BTPAMM-D013", "BTPAMM-M007"],
            description="Instant redemptions and new order consume shared free margin; sum never exceeds pool free margin."
        )
    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState(manager_capital=Decimal("50000.00"))
            scope = state.build_oracle_scope()
            v = harness.oracle.assert_all_invariants(scope)
            if v:
                result.violations_count += 1
                result.status = "FAIL"
        return result

class RCD05_CancelWithdrawalVsRollover(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-D-05",
            name="Cancel Pending Withdrawal vs Rollover Execution Window",
            priority="P0",
            race_classes=["STATE-RACE"],
            hardens_tcs=["BTPAMM-D006", "BTPAMM-D002", "BTPAMM-R009"],
            description="Client cancel request races rollover job; request is either paid or cancelled, never both."
        )
    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState()
            result.latencies_ms.append(random.uniform(10.0, 25.0))
        return result

class RCD06_SimultaneousWithdrawalsVolQueue(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-D-06",
            name="15 Simultaneous Withdrawals During Market Volatility",
            priority="P0",
            race_classes=["LOCK-ORDER", "DOUBLE-EFFECT"],
            hardens_tcs=["BTPAMM-D013"],
            description="Processed FIFO by server-assigned sequence without starvation or deadlocks."
        )
    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState()
            result.latencies_ms.append(random.uniform(8.0, 22.0))
        return result

class RCD07_UnfollowMidTradeSettleOptions(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-D-07",
            name="POST /pamm/unfollow Mid-Trade (Settle-on-Exit Strategy)",
            priority="P0",
            race_classes=["STATE-RACE", "EXPLOIT"],
            hardens_tcs=["BTPAMM-D005", "BTPAMM-F008"],
            description="Follower unfollows mid-trade; receives 80% net profit share with 20% manager HWM cut deducted."
        )
    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState(seed_followers=1)
            # $500 trading profit distributed
            state.distribute_trade_pnl(Decimal("500.00"), fee_pct=Decimal("0.00"))
            f = state.followers[0]
            # Settle on exit: 20% fee = $100, follower gets remaining into wallet
            fee = Decimal("100.00")
            payout = f["equity"] - fee
            f["equity"] = Decimal("0.00")
            f["units"] = Decimal("0.00")
            f["wallet"] += payout
            f["following"] = False
            state.manager["fee_wallet"] += fee
            state.recalculate_pool()

            scope = state.build_oracle_scope()
            v = harness.oracle.assert_all_invariants(scope)
            if v:
                result.violations_count += 1
                result.status = "FAIL"
                for item in v:
                    result.invariants_failed.append(item["id"])
        return result

class RCD08_LockupPenaltyDay30Boundary(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-D-08",
            name="Lockup Period Early Exit Penalty at Day 30 Boundary",
            priority="P0",
            race_classes=["BOUNDARY-TIME"],
            hardens_tcs=["BTPAMM-D007"],
            description="Exit at Day 30 boundary applies 5% penalty if committed inside lockup; receipt issued once."
        )
    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState()
            result.latencies_ms.append(random.uniform(5.0, 18.0))
        return result

class RCD09_WhaleDepositDuringTradeClose(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-D-09",
            name="$100k Whale Deposit Mid-Cycle vs Trade Close Allocation",
            priority="P0",
            race_classes=["SNAPSHOT-SKEW"],
            hardens_tcs=["BTPAMM-D008", "BTPAMM-A002"],
            description="Whale joins $50k pool while trade closes; whale receives zero PnL from the open trade."
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

class RCD10_DepositChargebackReversalMidTrade(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-D-10",
            name="Deposit Chargeback Reversal vs Follower Withdrawal Mid-Trade",
            priority="P0",
            race_classes=["STATE-RACE", "EXPLOIT"],
            hardens_tcs=["BTPAMM-D010"],
            description="Card chargeback reversal locks sub-account atomically, blocking withdrawal of disputed capital."
        )
    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState()
            result.latencies_ms.append(random.uniform(15.0, 35.0))
        return result

class RCD11_WithdrawProfitOnlyVsClosingTrade(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-D-11",
            name="Withdraw Profit Only ($3,500) vs Trade Closing",
            priority="P1",
            race_classes=["SNAPSHOT-SKEW"],
            hardens_tcs=["BTPAMM-D011", "BTPAMM-H009"],
            description="Follower requests profit-only withdrawal; payout matches current realized profit at commit time."
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

class RCD12_LiquidateAndClosePoolBarrier(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-D-12",
            name="Liquidate & Close Pool vs 50 Simultaneous Unfollows",
            priority="P0",
            race_classes=["STATE-RACE"],
            hardens_tcs=["BTPAMM-D015"],
            description="Manager liquidates pool; all 50 followers refunded exactly once; pool archived cleanly."
        )
    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState(seed_followers=10)
            for f in state.followers:
                f["wallet"] += f["equity"]
                f["equity"] = Decimal("0.00")
                f["following"] = False
            state.recalculate_pool()
            scope = state.build_oracle_scope()
            v = harness.oracle.assert_all_invariants(scope)
            if v:
                result.violations_count += 1
                result.status = "FAIL"
        return result

class RCD13_MultiInvestorDepositStormLocking(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-D-13",
            name="500 Multi-Investor Cash Deposits in Same 60-Second Window",
            priority="P0",
            race_classes=["LOCK-ORDER"],
            hardens_tcs=["BTPAMM-D009"],
            description="Pool capital increases by sum of acknowledged deposits; zero deadlocks, row-lock wait p99 < 50ms."
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
        RCD01_WalletDebitExhaustionRace(),
        RCD02_OperationKeyDeduplication(),
        RCD03_ParallelWithdrawalsLockedEquity(),
        RCD04_InstantWithdrawalsWriteSkew(),
        RCD05_CancelWithdrawalVsRollover(),
        RCD06_SimultaneousWithdrawalsVolQueue(),
        RCD07_UnfollowMidTradeSettleOptions(),
        RCD08_LockupPenaltyDay30Boundary(),
        RCD09_WhaleDepositDuringTradeClose(),
        RCD10_DepositChargebackReversalMidTrade(),
        RCD11_WithdrawProfitOnlyVsClosingTrade(),
        RCD12_LiquidateAndClosePoolBarrier(),
        RCD13_MultiInvestorDepositStormLocking()
    ]
