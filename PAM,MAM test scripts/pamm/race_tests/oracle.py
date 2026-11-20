"""
BlackTrader PAMM - System-Wide Invariant Oracle (Section 2)
Implements all 20 Invariant Oracles (I-01 through I-20)
Derived from PAMM_Deep_Race_Condition_Test_Spec.md Section 2.
"""
from decimal import Decimal, ROUND_HALF_EVEN
import hashlib
import json
from .config import OracleConfig

class InvariantViolation(Exception):
    def __init__(self, invariant_id, message, details=None):
        self.invariant_id = invariant_id
        self.message = message
        self.details = details or {}
        super().__init__(f"[{invariant_id}] {message} | Details: {self.details}")

class InvariantOracle:
    def __init__(self, config=None):
        self.cfg = config or OracleConfig()

    def assert_all_invariants(self, scope):
        """
        Runs all 20 invariants on the provided test scope snapshot.
        scope is expected to contain:
          - 'pool': dict (total_equity, total_units, nav, used_margin, free_margin, reserve_ledger)
          - 'followers': list of dicts (id, equity, balance, units, share_pct, hwm, wallet, is_master, following)
          - 'manager': dict (equity, balance, fee_wallet, is_master, following)
          - 'wallets': list of dicts (account_id, cash)
          - 'positions': list of dicts (ticket_id, symbol, lots, fills, closes, status)
          - 'orders': list of dicts (id, status, reserved_margin)
          - 'trades': list of dicts (parent_pnl, follower_pnl_sum, fees_sum, reserve_residual)
          - 'audit_log': list of dicts (entry_id, payload, prev_hash, current_hash)
          - 'external_flows': Decimal delta of external cash inflow/outflow
          - 'initial_money_total': Decimal initial system-wide money
          - 'seen_keys': dict of operation keys/event keys count
          - 'child_orders_at_bridge': list of orders routed to LP bridge
          - 'compliance_states': dict of account compliance statuses
        """
        violations = []

        # Run each invariant check safely and aggregate any violations
        for check in [
            self._check_i01_pool_conservation,
            self._check_i02_money_conservation,
            self._check_i03_share_sum,
            self._check_i04_unit_nav_identity,
            self._check_i05_non_negativity,
            self._check_i06_exactly_once_effect,
            self._check_i07_allocation_completeness,
            self._check_i08_position_conservation,
            self._check_i09_single_block_rule,
            self._check_i10_margin_integrity,
            self._check_i11_hwm_rules,
            self._check_i12_state_machine_legality,
            self._check_i13_role_exclusivity,
            self._check_i14_audit_chain,
            self._check_i15_atomic_visibility,
            self._check_i16_monotonic_sequences,
            self._check_i17_idempotent_replay,
            self._check_i18_no_orphan_state,
            self._check_i19_compliance_gate,
            self._check_i20_durability
        ]:
            try:
                check(scope)
            except InvariantViolation as iv:
                violations.append({
                    "id": iv.invariant_id,
                    "message": iv.message,
                    "details": iv.details
                })

        return violations

    # --- Invariant Checks ---

    def _check_i01_pool_conservation(self, scope):
        pool = scope.get("pool")
        followers = scope.get("followers", [])
        manager = scope.get("manager", {})
        if not pool:
            return

        total_pool_equity = Decimal(str(pool.get("total_equity", 0)))
        reserve = Decimal(str(pool.get("reserve_ledger", 0)))
        manager_equity = Decimal(str(manager.get("equity", 0))) if manager else Decimal(0)
        followers_equity = sum(Decimal(str(f.get("equity", 0))) for f in followers)

        calc_total = followers_equity + manager_equity + reserve
        diff = abs(total_pool_equity - calc_total)
        if diff > self.cfg.MONEY_TOLERANCE:
            raise InvariantViolation(
                "I-01",
                f"Pool Conservation failed: calc {calc_total} != total_pool_equity {total_pool_equity} (diff {diff})",
                {"total_pool_equity": str(total_pool_equity), "followers_equity": str(followers_equity), "manager_equity": str(manager_equity), "reserve": str(reserve), "diff": str(diff)}
            )

    def _check_i02_money_conservation(self, scope):
        initial_total = scope.get("initial_money_total")
        if initial_total is None:
            return
        initial_total = Decimal(str(initial_total))
        external_flows = Decimal(str(scope.get("external_flows", 0)))

        pool = scope.get("pool", {})
        manager = scope.get("manager", {})
        followers = scope.get("followers", [])
        wallets = scope.get("wallets", [])

        # pool['total_equity'] already includes reserve_ledger per I-01
        pool_equity = Decimal(str(pool.get("total_equity", 0)))
        manager_fee_wallet = Decimal(str(manager.get("fee_wallet", 0))) if manager else Decimal(0)
        wallets_total = sum(Decimal(str(w.get("cash", 0))) for w in wallets)

        current_total = pool_equity + manager_fee_wallet + wallets_total
        expected_total = initial_total + external_flows
        diff = abs(current_total - expected_total)
        if diff > self.cfg.MONEY_TOLERANCE:
            raise InvariantViolation(
                "I-02",
                f"Money Conservation failed: current {current_total} != expected {expected_total} (diff {diff})",
                {"current": str(current_total), "expected": str(expected_total), "diff": str(diff)}
            )

    def _check_i03_share_sum(self, scope):
        followers = scope.get("followers", [])
        manager = scope.get("manager", {})
        if self.cfg.ACCOUNTING_MODEL not in ("shares", "both"):
            return
        active_participants = []
        if manager and manager.get("is_master"):
            active_participants.append(manager)
        active_participants.extend([f for f in followers if f.get("following", True)])
        if not active_participants:
            return
        total_share = sum(Decimal(str(p.get("share_pct", 0))) for p in active_participants)
        diff = abs(Decimal("100.000000") - total_share)
        if diff > self.cfg.SHARE_PCT_TOLERANCE:
            raise InvariantViolation(
                "I-03",
                f"Share Sum invariant failed: sum {total_share}% != 100.000000% (diff {diff})",
                {"sum_share": str(total_share), "diff": str(diff)}
            )

    def _check_i04_unit_nav_identity(self, scope):
        pool = scope.get("pool")
        if not pool or self.cfg.ACCOUNTING_MODEL not in ("units", "both"):
            return
        total_equity = Decimal(str(pool.get("total_equity", 0)))
        total_units = Decimal(str(pool.get("total_units", 0)))
        nav = Decimal(str(pool.get("nav", 0)))

        if total_units > Decimal(0):
            computed_equity = (total_units * nav).quantize(Decimal("0.000001"), rounding=ROUND_HALF_EVEN)
            diff = abs(total_equity - (total_units * nav))
            if diff > self.cfg.UNIT_TOLERANCE:
                raise InvariantViolation(
                    "I-04",
                    f"Unit/NAV Identity failed: Total_Equity {total_equity} != Total_Units * NAV {computed_equity} (diff {diff})",
                    {"total_equity": str(total_equity), "total_units": str(total_units), "nav": str(nav), "diff": str(diff)}
                )

    def _check_i05_non_negativity(self, scope):
        pool = scope.get("pool", {})
        followers = scope.get("followers", [])
        wallets = scope.get("wallets", [])
        positions = scope.get("positions", [])

        if Decimal(str(pool.get("nav", 1))) <= Decimal(0):
            raise InvariantViolation("I-05", f"Non-negativity failed: NAV <= 0 ({pool.get('nav')})")
        if Decimal(str(pool.get("total_units", 0))) < Decimal(0):
            raise InvariantViolation("I-05", f"Non-negativity failed: units < 0 ({pool.get('total_units')})")
        if Decimal(str(pool.get("free_margin", 0))) < Decimal(0):
            raise InvariantViolation("I-05", f"Non-negativity failed: free_margin < 0 ({pool.get('free_margin')})")

        for f in followers:
            if Decimal(str(f.get("equity", 0))) < Decimal(0):
                raise InvariantViolation("I-05", f"Follower {f.get('id')} equity < 0 ({f.get('equity')})")
            if Decimal(str(f.get("balance", 0))) < Decimal(0):
                raise InvariantViolation("I-05", f"Follower {f.get('id')} balance < 0 ({f.get('balance')})")

        for w in wallets:
            if Decimal(str(w.get("cash", 0))) < Decimal(0):
                raise InvariantViolation("I-05", f"Wallet {w.get('account_id')} cash < 0 ({w.get('cash')})")

        for p in positions:
            if Decimal(str(p.get("lots", 0))) < Decimal(0):
                raise InvariantViolation("I-05", f"Position {p.get('ticket_id')} lots < 0 ({p.get('lots')})")

    def _check_i06_exactly_once_effect(self, scope):
        seen_keys = scope.get("seen_keys", {})
        for key, count in seen_keys.items():
            if count > 1:
                raise InvariantViolation("I-06", f"Exactly-Once Effect failed: key '{key}' applied {count} times (> 1)")

    def _check_i07_allocation_completeness(self, scope):
        trades = scope.get("trades", [])
        for t in trades:
            parent_pnl = Decimal(str(t.get("parent_pnl", 0)))
            f_pnl = Decimal(str(t.get("follower_pnl_sum", 0)))
            fees = Decimal(str(t.get("fees_sum", 0)))
            manager_pnl = Decimal(str(t.get("manager_pnl", 0)))
            residual = Decimal(str(t.get("reserve_residual", 0)))

            total_allocated = f_pnl + fees + manager_pnl + residual
            diff = abs(parent_pnl - total_allocated)
            if diff > self.cfg.MONEY_TOLERANCE:
                raise InvariantViolation(
                    "I-07",
                    f"Allocation Completeness failed: parent_pnl {parent_pnl} != total_allocated {total_allocated} (diff {diff})",
                    {"parent_pnl": str(parent_pnl), "allocated": str(total_allocated), "diff": str(diff)}
                )

    def _check_i08_position_conservation(self, scope):
        positions = scope.get("positions", [])
        for p in positions:
            open_lots = Decimal(str(p.get("lots", 0)))
            fills = Decimal(str(p.get("fills", 0)))
            closes = Decimal(str(p.get("closes", 0)))
            expected_lots = fills - closes
            if open_lots != expected_lots:
                raise InvariantViolation(
                    "I-08",
                    f"Position Conservation failed: position {p.get('ticket_id')} lots {open_lots} != fills {fills} - closes {closes}",
                    {"ticket_id": p.get("ticket_id"), "open_lots": str(open_lots), "expected": str(expected_lots)}
                )

    def _check_i09_single_block_rule(self, scope):
        # Strict PAMM Invariant: Zero child orders seen at LP bridge
        child_orders = scope.get("child_orders_at_bridge", [])
        if child_orders:
            raise InvariantViolation(
                "I-09",
                f"Single-Block Rule (PAMM Invariant) failed: {len(child_orders)} child order tickets leaked to LP bridge!",
                {"leaked_child_count": len(child_orders)}
            )

    def _check_i10_margin_integrity(self, scope):
        pool = scope.get("pool")
        if not pool:
            return
        equity = Decimal(str(pool.get("total_equity", 0)))
        used_margin = Decimal(str(pool.get("used_margin", 0)))
        free_margin = Decimal(str(pool.get("free_margin", 0)))

        expected_free = equity - used_margin
        if free_margin != expected_free:
            raise InvariantViolation(
                "I-10",
                f"Margin Integrity failed: free_margin {free_margin} != equity {equity} - used {used_margin} (expected {expected_free})",
                {"free": str(free_margin), "equity": str(equity), "used": str(used_margin)}
            )

    def _check_i11_hwm_rules(self, scope):
        followers = scope.get("followers", [])
        for f in followers:
            hwm = Decimal(str(f.get("hwm", 0)))
            fee = Decimal(str(f.get("fee_deducted", 0)))
            balance = Decimal(str(f.get("balance", 0)))
            share_pct = Decimal(str(f.get("share_pct", 20))) / Decimal(100)

            if fee < Decimal(0):
                raise InvariantViolation("I-11", f"HWM Rule failed: negative fee {fee} for follower {f.get('id')}")
            if balance <= hwm and fee > Decimal(0):
                raise InvariantViolation("I-11", f"HWM Rule failed: fee {fee} charged while balance {balance} <= HWM {hwm}")

    def _check_i12_state_machine_legality(self, scope):
        # Valid state transitions check
        transitions = scope.get("observed_transitions", [])
        valid_order_transitions = {
            "PENDING": ["FILLED", "CANCELLED", "REJECTED"],
            "FILLED": ["PARTIALLY_CLOSED", "CLOSED"],
            "PARTIALLY_CLOSED": ["CLOSED"],
            "CANCELLED": [],
            "CLOSED": [],
            "REJECTED": []
        }
        for entity_id, prev_state, next_state in transitions:
            if prev_state in ("CLOSED", "CANCELLED", "REJECTED") and next_state != prev_state:
                raise InvariantViolation("I-12", f"Illegal state transition from terminal state {prev_state} to {next_state} on {entity_id}")

    def _check_i13_role_exclusivity(self, scope):
        followers = scope.get("followers", [])
        manager = scope.get("manager", {})

        if manager.get("is_master") and manager.get("following"):
            raise InvariantViolation("I-13", f"Role Exclusivity failed: Manager {manager.get('id')} is both Master and Follower!")

        for f in followers:
            if f.get("is_master") and f.get("following"):
                raise InvariantViolation("I-13", f"Role Exclusivity failed: Account {f.get('id')} is simultaneously Master and Follower!")

    def _check_i14_audit_chain(self, scope):
        audit_log = scope.get("audit_log", [])
        if not audit_log:
            return
        prev_hash = "GENESIS"
        for i, entry in enumerate(audit_log):
            expected_prev = entry.get("prev_hash")
            if expected_prev != prev_hash:
                raise InvariantViolation("I-14", f"Audit Hash Chain broken at index {i}: expected prev {prev_hash}, found {expected_prev}")
            # Verify SHA256 of payload + prev_hash
            raw = f"{entry.get('payload')}:{prev_hash}".encode("utf-8")
            calc_hash = hashlib.sha256(raw).hexdigest()
            if entry.get("current_hash") != calc_hash:
                raise InvariantViolation("I-14", f"Audit Hash mismatch at index {i}: computed {calc_hash} != stored {entry.get('current_hash')}")
            prev_hash = calc_hash

    def _check_i15_atomic_visibility(self, scope):
        visible_readers = scope.get("reader_samples", [])
        for r in visible_readers:
            if r.get("partial_batch_detected", False):
                raise InvariantViolation("I-15", f"Atomic Visibility failed: Reader {r.get('reader_id')} observed half-applied state: {r.get('partial_state')}")

    def _check_i16_monotonic_sequences(self, scope):
        sequences = scope.get("stream_sequences", [])
        for i in range(1, len(sequences)):
            if sequences[i] <= sequences[i - 1]:
                raise InvariantViolation("I-16", f"Monotonic Sequence regression: seq[{i}]={sequences[i]} <= seq[{i-1}]={sequences[i-1]}")

    def _check_i17_idempotent_replay(self, scope):
        replays = scope.get("replayed_requests", [])
        for req_id, first_resp, second_resp in replays:
            if first_resp != second_resp:
                raise InvariantViolation("I-17", f"Idempotent Replay failed: Request {req_id} first resp != second resp")

    def _check_i18_no_orphan_state(self, scope):
        cancelled_ops = scope.get("cancelled_operations", [])
        for op in cancelled_ops:
            if op.get("leftover_margin", Decimal(0)) > Decimal(0) or op.get("leftover_position", False):
                raise InvariantViolation("I-18", f"Orphan State detected for cancelled op {op.get('op_id')}: leftover margin or position exists")

    def _check_i19_compliance_gate(self, scope):
        compliance_violations = scope.get("compliance_violations", [])
        for cv in compliance_violations:
            raise InvariantViolation("I-19", f"Compliance Gate committed money movement while blocked: {cv}")

    def _check_i20_durability(self, scope):
        acked_writes = scope.get("acked_writes", [])
        persisted_writes = scope.get("persisted_writes", set())
        for w in acked_writes:
            if w not in persisted_writes:
                raise InvariantViolation("I-20", f"Durability Violation: Acknowledged write {w} lost after crash/failover!")
