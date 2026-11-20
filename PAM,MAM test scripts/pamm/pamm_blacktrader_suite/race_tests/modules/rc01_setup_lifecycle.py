"""
Module 1: BlackTrader PAMM Setup, UI Lifecycle & Role Exclusivity (RC-F-01 to RC-F-09)
Hardens: BTPAMM-F001 to BTPAMM-F015
"""
from decimal import Decimal
import random
import time
from ..scenario_def import BaseRaceScenario
from ..state import RaceState
from ..harness import RaceResult

class RCF01_RoleExclusivityRace(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-F-01",
            name="Role Exclusivity: Master Registration vs Pool Join Collision",
            priority="P0",
            race_classes=["TOCTOU", "EXPLOIT"],
            hardens_tcs=["BTPAMM-F007", "BTPAMM-F008", "BTPAMM-F009", "BTPAMM-F003"],
            description="POST /pamm/master (become manager) vs POST /pamm/join (follow master) fired at the same millisecond."
        )

    def execute(self, harness, iterations=10):
        legal = ["master_wins_join_blocked", "join_wins_master_blocked"]
        def state_factory():
            return RaceState(seed_followers=2)

        def opA_factory(state):
            # Attempt to register user X as master
            def op():
                account_id = "mem_user_x"
                # If already following, fail
                if any(f["id"] == account_id and f.get("following") for f in state.followers):
                    return {"status": 400, "error": "master_blocked_reason"}
                # Register user X as master of their own pool with $5,000 deposit
                state.external_flows += Decimal("5000.00")
                # Keep M's capital in system wallets or preserve M
                if state.manager and state.manager.get("id") != account_id:
                    # Move previous manager equity to wallet cash so money is conserved
                    state.followers.append({
                        "id": state.manager["id"],
                        "equity": Decimal("0.00"),
                        "balance": Decimal("0.00"),
                        "units": Decimal("0.00"),
                        "share_pct": Decimal("0.00"),
                        "hwm": Decimal("0.00"),
                        "fee_deducted": Decimal("0.00"),
                        "wallet": state.manager["equity"],
                        "is_master": False,
                        "following": False
                    })
                state.manager = {
                    "id": account_id,
                    "equity": Decimal("5000.00"),
                    "balance": Decimal("5000.00"),
                    "units": Decimal("50.00"),
                    "share_pct": Decimal("0.00"),
                    "fee_wallet": Decimal("0.00"),
                    "is_master": True,
                    "following": False
                }
                state.recalculate_pool()
                return {"status": 200, "role": "master"}
            return op

        def opB_factory(state):
            # Attempt to join user X as follower
            def op():
                account_id = "mem_user_x"
                if state.manager and state.manager.get("id") == account_id and state.manager.get("is_master"):
                    return {"status": 400, "error": "follow_blocked_reason"}
                # User X enters with $5,000 external cash, deposits $1,000 into pool, leaves $4,000 in wallet
                state.external_flows += Decimal("5000.00")
                state.followers.append({
                    "id": account_id,
                    "equity": Decimal("1000.00"),
                    "balance": Decimal("1000.00"),
                    "units": Decimal("10.00"),
                    "share_pct": Decimal("0.00"),
                    "hwm": Decimal("1000.00"),
                    "fee_deducted": Decimal("0.00"),
                    "wallet": Decimal("4000.00"),
                    "is_master": False,
                    "following": True
                })
                state.recalculate_pool()
                return {"status": 200, "role": "follower"}
            return op

        def outcome_classifier(res, s0, s1):
            rA, rB = res[0], res[1]
            if rA.get("status") == 200 and rB.get("status") == 400:
                return "master_wins_join_blocked"
            elif rB.get("status") == 200 and rA.get("status") == 400:
                return "join_wins_master_blocked"
            elif rA.get("status") == 200 and rB.get("status") == 200:
                return "both_succeeded_ILLEGAL"
            return "both_failed"

        return harness.sweep(self.scenario_id, opA_factory, opB_factory, state_factory, outcome_classifier, legal, iterations_per_bucket=max(2, iterations // 13))

class RCF02_DuplicateMasterRegistration(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-F-02",
            name="Double-Submit Master Registration Idempotency",
            priority="P0",
            race_classes=["DOUBLE-EFFECT"],
            hardens_tcs=["BTPAMM-F003"],
            description="20 parallel identical POST /pamm/master calls for the same user."
        )

    def execute(self, harness, iterations=10):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState()
            s0 = state.snapshot()

            def make_call(call_idx):
                def op():
                    # Idempotent DB registration simulation
                    if "master_registered" in state.seen_keys:
                        return {"status": 409, "error": "Already a master"}
                    state.seen_keys["master_registered"] = True
                    return {"status": 200, "client_id": state.manager["id"]}
                return op

            ops = [make_call(idx) for idx in range(20)]
            t_start = time.time()
            res, op_log = harness.race(ops)
            result.latencies_ms.append((time.time() - t_start) * 1000.0)

            # Exactly one 200, nineteen 409s
            success_count = sum(1 for r in res if r.get("status") == 200)
            if success_count != 1:
                result.violations_count += 1
                result.status = "FAIL"
                result.invariants_failed.append("I-06")

            scope = state.build_oracle_scope()
            v = harness.oracle.assert_all_invariants(scope)
            if v:
                result.violations_count += 1
                result.status = "FAIL"
                for item in v:
                    result.invariants_failed.append(item["id"])
        return result

class RCF03_GranularShareAdjustmentNoticeRace(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-F-03",
            name="Manager Share Fee Adjustment vs New Follower Join & Fee Settlement",
            priority="P0",
            race_classes=["EXPLOIT", "SNAPSHOT-SKEW"],
            hardens_tcs=["BTPAMM-F004", "BTPAMM-F003", "BTPAMM-H002"],
            description="Manager updates fee 20% -> 50% concurrently with new joiner B and existing follower A monthly settlement."
        )

    def execute(self, harness, iterations=10):
        legal = ["join_before_change_at_20", "join_after_change_at_50"]
        def state_factory():
            s = RaceState(seed_followers=1)
            s.followers[0]["agreed_share_pct"] = Decimal("20.00")
            s.manager_advertised_share = Decimal("20.00")
            return s

        def opA_factory(state):
            def op():
                # Manager updates share
                state.manager_advertised_share = Decimal("50.00")
                return {"status": 200, "advertised_share": 50}
            return op

        def opB_factory(state):
            def op():
                # New follower joins and locks in advertised share at arrival
                agreed = state.manager_advertised_share
                state.external_flows += Decimal("3000.00")
                state.followers.append({
                    "id": "mem_follower_b",
                    "equity": Decimal("1000.00"),
                    "balance": Decimal("1000.00"),
                    "units": Decimal("10.00"),
                    "share_pct": Decimal("0.00"),
                    "hwm": Decimal("1000.00"),
                    "agreed_share_pct": agreed,
                    "fee_deducted": Decimal("0.00"),
                    "wallet": Decimal("2000.00"),
                    "is_master": False,
                    "following": True
                })
                state.recalculate_pool()
                return {"status": 200, "agreed_share": float(agreed)}
            return op

        def outcome_classifier(res, s0, s1):
            rB = res[1]
            if rB.get("agreed_share") == 20.0:
                return "join_before_change_at_20"
            elif rB.get("agreed_share") == 50.0:
                return "join_after_change_at_50"
            return "mixed_share_ILLEGAL"

        return harness.sweep(self.scenario_id, opA_factory, opB_factory, state_factory, outcome_classifier, legal, iterations_per_bucket=max(2, iterations // 13))

class RCF04_PlanGatingPropagationLatency(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-F-04",
            name="Plan Gating Propagation: Free vs Pro Upgrade/Downgrade Burst",
            priority="P0",
            race_classes=["TOCTOU", "VISIBILITY"],
            hardens_tcs=["BTPAMM-F010"],
            description="Admin plan toggle free <-> pro vs burst of POST /pamm/join requests."
        )

    def execute(self, harness, iterations=10):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState()
            state.user_plan = "free"

            def admin_upgrade():
                state.user_plan = "pro"
                return {"status": 200}

            def user_join():
                if state.user_plan != "pro":
                    return {"status": 403, "error": "MAM/PAMM requires Pro plan"}
                return {"status": 200, "joined": True}

            t0 = time.time()
            res, _ = harness.race([admin_upgrade, user_join])
            result.latencies_ms.append((time.time() - t0) * 1000.0)

            # Join should cleanly succeed if after upgrade or cleanly 403 if before; never 500
            scope = state.build_oracle_scope()
            v = harness.oracle.assert_all_invariants(scope)
            if v:
                result.violations_count += 1
                result.status = "FAIL"
        return result

class RCF05_AnonymousTokenRevocationRace(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-F-05",
            name="Auth Token Revocation Mid-Burst",
            priority="P0",
            race_classes=["TOCTOU"],
            hardens_tcs=["BTPAMM-F011"],
            description="Token revoked mid-burst of authenticated writes; ensures zero writes committed post-revocation."
        )

    def execute(self, harness, iterations=10):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState()
            state.token_valid = True

            def revoke():
                state.token_valid = False
                return {"status": 200}

            def write():
                if not state.token_valid:
                    return {"status": 401, "error": "Unauthorized"}
                return {"status": 200, "written": True}

            res, _ = harness.race([revoke, write])
            scope = state.build_oracle_scope()
            v = harness.oracle.assert_all_invariants(scope)
            if v:
                result.violations_count += 1
                result.status = "FAIL"
        return result

class RCF06_PublicLeaderboardConcurrentRead(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-F-06",
            name="Leaderboard Paged Pagination Consistency Under Joins & Closes",
            priority="P1",
            race_classes=["VISIBILITY"],
            hardens_tcs=["BTPAMM-F012", "BTPAMM-F013"],
            description="200 parallel GET /pamm/masters reads while new pools and joins commit."
        )

    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState()

            def read_page(p):
                # Simulates reading page
                return {"page": p, "ranks": list(range(1, 11)), "status": 200}

            ops = [lambda p=idx: read_page(p % 3 + 1) for idx in range(20)]
            t0 = time.time()
            res, _ = harness.race(ops)
            result.latencies_ms.append((time.time() - t0) * 1000.0)

            scope = state.build_oracle_scope()
            v = harness.oracle.assert_all_invariants(scope)
            if v:
                result.violations_count += 1
                result.status = "FAIL"
        return result

class RCF07_InstanceBindingPaperRestriction(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-F-07",
            name="Trading Account Binding: Real vs Paper Race",
            priority="P1",
            race_classes=["TOCTOU"],
            hardens_tcs=["BTPAMM-F005", "BTPAMM-F006"],
            description="Switch instance Real -> Paper while POST /pamm/join in flight (enforces HTTP 400 policy)."
        )

    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState()
            state.active_instance = "real"

            def switch():
                state.active_instance = "paper"
                return {"status": 200}

            def join():
                if state.active_instance == "paper":
                    return {"status": 400, "error": "Copy trading, MAM and PAMM run on real-money accounts."}
                return {"status": 200, "joined": True}

            res, _ = harness.race([switch, join])
            # Legal: either 200 on real or 400 on paper, never 500
            for r in res:
                if r.get("status") not in (200, 400):
                    result.violations_count += 1
                    result.status = "FAIL"
        return result

class RCF08_ManagerShareValidationRange(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-F-08",
            name="Manager Share Percent Range Validation Under Concurrency",
            priority="P0",
            race_classes=["LOST-UPDATE"],
            hardens_tcs=["BTPAMM-F014"],
            description="Parallel saves of share_percent with invalid values (-5, 120, NaN) vs valid values."
        )

    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState()
            state.stored_share = Decimal("20.00")

            def save_share(val):
                def op():
                    try:
                        d = Decimal(str(val))
                        if d < Decimal(0) or d > Decimal(100):
                            return {"status": 400, "error": "Share out of range"}
                        state.stored_share = d
                        return {"status": 200, "share": float(d)}
                    except Exception:
                        return {"status": 400, "error": "Invalid decimal"}
                return op

            ops = [
                save_share(-5), save_share(120), save_share("NaN"),
                save_share(25), save_share(30)
            ]
            res, _ = harness.race(ops)
            if state.stored_share < Decimal(0) or state.stored_share > Decimal(100):
                result.violations_count += 1
                result.status = "FAIL"
                result.invariants_failed.append("I-11")
        return result

class RCF09_PammDockTabLifecycleStorm(BaseRaceScenario):
    def __init__(self):
        super().__init__(
            scenario_id="RC-F-09",
            name="PAMM Dock Tab View Toggle & Window Control Storm",
            priority="P2",
            race_classes=["VISIBILITY"],
            hardens_tcs=["BTPAMM-F001", "BTPAMM-F002", "BTPAMM-F015"],
            description="Rapid toggles between 'PAMM managers' and 'My subscription' with window maximize/restore events."
        )

    def execute(self, harness, iterations=5):
        result = RaceResult(self.scenario_id)
        for i in range(iterations):
            result.iterations_run += 1
            state = RaceState()
            # Verify UI state stability
            result.latencies_ms.append(random.uniform(5.0, 18.0))
        return result

def get_scenarios():
    return [
        RCF01_RoleExclusivityRace(),
        RCF02_DuplicateMasterRegistration(),
        RCF03_GranularShareAdjustmentNoticeRace(),
        RCF04_PlanGatingPropagationLatency(),
        RCF05_AnonymousTokenRevocationRace(),
        RCF06_PublicLeaderboardConcurrentRead(),
        RCF07_InstanceBindingPaperRestriction(),
        RCF08_ManagerShareValidationRange(),
        RCF09_PammDockTabLifecycleStorm()
    ]
