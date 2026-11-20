"""
BlackTrader PAMM - Race State Container & Double-Entry Accounting Engine
Provides isolated state per iteration and generates scopes for InvariantOracle.
"""
from decimal import Decimal, ROUND_HALF_EVEN
import hashlib
import copy
import threading

class RaceState:
    def __init__(self, pool_id="pamm_pool_alpha", manager_capital=Decimal("10000.00"), seed_followers=3):
        self._lock = threading.Lock()
        self.pool_id = pool_id
        mgr_cap = Decimal(str(manager_capital))
        self.manager = {
            "id": "mem_4669b36f00cc55347e",
            "equity": mgr_cap,
            "balance": mgr_cap,
            "units": mgr_cap / Decimal("100.00"),
            "share_pct": Decimal("0.00"),
            "fee_wallet": Decimal("0.00"),
            "is_master": True,
            "following": False
        }
        self.followers = []
        for i in range(1, seed_followers + 1):
            dep = Decimal("1000.00")
            self.followers.append({
                "id": ["mem_e26aa534f801d04237", "mem_d418c85a28182db953", "mem_2b4b6755ae8ed059a9", "mem_7d5a18611d1a51731e", "mem_1c6beb7764028720cc", "mem_8080a5bca2119a3fe9", "mem_ecc6ae933d48a7c380", "mem_5452eb488b8622756f", "mem_d4696d922fdee6d886", "mem_822cf51b32a092c7ac"][(i - 1) % 10] if i <= 10 else f"mem_pmf_{i:02d}",
                "equity": dep,
                "balance": dep,
                "units": dep / Decimal("100.00"),
                "share_pct": Decimal("0.00"),
                "hwm": dep,
                "fee_deducted": Decimal("0.00"),
                "wallet": Decimal("5000.00"),
                "is_master": False,
                "following": True
            })

        self.reserve_ledger = Decimal("0.00")
        self.positions = []
        self.orders = []
        self.trades = []
        self.seen_keys = {}
        self.child_orders_at_bridge = []
        self.audit_log = []
        self.external_flows = Decimal("0.00")
        self.observed_transitions = []
        self.reader_samples = []
        self.stream_sequences = [1000]
        self.replayed_requests = []
        self.cancelled_operations = []
        self.compliance_violations = []
        self.acked_writes = set()
        self.persisted_writes = set()

        self.recalculate_pool()
        self.initial_money_total = self.total_money_in_system()

    def recalculate_pool(self):
        """Updates total equity, units, NAV, and shares."""
        with self._lock:
            followers_eq = sum(f["equity"] for f in self.followers if f.get("following", True))
            mgr_eq = self.manager["equity"] if self.manager else Decimal(0)
            self.total_equity = followers_eq + mgr_eq + self.reserve_ledger

            # Total units includes manager seed units
            mgr_units = self.manager.get("units", Decimal(0)) if self.manager else Decimal(0)
            follower_units = sum(f["units"] for f in self.followers if f.get("following", True))
            self.total_units = mgr_units + follower_units

            if self.total_units > Decimal(0):
                self.nav = (self.total_equity / self.total_units).quantize(Decimal("0.00000001"), rounding=ROUND_HALF_EVEN)
            else:
                self.nav = Decimal("100.00000000")

            # In share model: shares across all pool contributors (followers + manager)
            all_participants = []
            if self.manager and self.manager.get("is_master"):
                all_participants.append(self.manager)
            all_participants.extend([f for f in self.followers if f.get("following", True)])

            if self.total_equity > Decimal(0) and all_participants:
                allocated_share = Decimal("0.000000")
                for p in all_participants[:-1]:
                    pct = ((p["equity"] / self.total_equity) * Decimal(100)).quantize(Decimal("0.000001"), rounding=ROUND_HALF_EVEN)
                    p["share_pct"] = pct
                    allocated_share += pct
                all_participants[-1]["share_pct"] = Decimal("100.000000") - allocated_share

            # Margin
            used_margin = sum(Decimal(str(p.get("lots", 0))) * Decimal("1000.00") for p in self.positions if p.get("status") == "OPEN")
            self.used_margin = used_margin
            self.free_margin = max(Decimal(0), self.total_equity - self.used_margin)

    def add_follower(self, follower_id, deposit_amount, wallet_amount=Decimal("0.00")):
        """Adds a follower with proper double-entry accounting."""
        with self._lock:
            dep = Decimal(str(deposit_amount))
            w = Decimal(str(wallet_amount))
            self.external_flows += (dep + w)
            units = (dep / self.nav) if self.nav > Decimal(0) else (dep / Decimal("100.00"))
            f = {
                "id": follower_id,
                "equity": dep,
                "balance": dep,
                "units": units,
                "share_pct": Decimal("0.00"),
                "hwm": dep,
                "fee_deducted": Decimal("0.00"),
                "wallet": w,
                "is_master": False,
                "following": True
            }
            self.followers.append(f)
        self.recalculate_pool()
        return f

    def unfollow(self, follower_id):
        """Unfollows follower, returning equity to wallet cash."""
        payout = Decimal("0.00")
        with self._lock:
            for f in self.followers:
                if f["id"] == follower_id and f.get("following"):
                    payout = f["equity"]
                    f["following"] = False
                    f["equity"] = Decimal("0.00")
                    f["units"] = Decimal("0.00")
                    f["wallet"] += payout
                    break
        self.recalculate_pool()
        return payout

    def distribute_trade_pnl(self, gross_pnl, fee_pct=Decimal("20.00")):
        """Proportionally distributes trade PnL to manager and followers."""
        with self._lock:
            gross = Decimal(str(gross_pnl))
            self.external_flows += gross  # Trading PnL is external cash inflow/outflow from LP clearinghouse
            active_followers = [f for f in self.followers if f.get("following")]
            all_participants = []
            if self.manager:
                all_participants.append(self.manager)
            all_participants.extend(active_followers)

            if not all_participants or self.total_equity <= Decimal(0):
                return

            tot_eq = self.total_equity
            f_pnl_sum = Decimal("0.00")
            fees_sum = Decimal("0.00")
            mgr_pnl = Decimal("0.00")

            for p in all_participants:
                share = p["equity"] / tot_eq
                alloc = (gross * share).quantize(Decimal("0.01"), rounding=ROUND_HALF_EVEN)
                if p == self.manager:
                    mgr_pnl += alloc
                    p["equity"] += alloc
                    p["balance"] += alloc
                else:
                    if alloc > Decimal(0):
                        fee = (alloc * (fee_pct / Decimal(100))).quantize(Decimal("0.01"), rounding=ROUND_HALF_EVEN)
                        net = alloc - fee
                        fees_sum += fee
                        f_pnl_sum += net
                        p["equity"] += net
                        p["balance"] += net
                        p["fee_deducted"] += fee
                        self.manager["fee_wallet"] += fee
                    else:
                        f_pnl_sum += alloc
                        p["equity"] += alloc
                        p["balance"] += alloc

            # Reserve residual balance
            allocated_total = f_pnl_sum + fees_sum + mgr_pnl
            residual = gross - allocated_total
            self.reserve_ledger += residual

            self.trades.append({
                "parent_pnl": gross,
                "follower_pnl_sum": f_pnl_sum,
                "fees_sum": fees_sum,
                "manager_pnl": mgr_pnl,
                "reserve_residual": residual
            })
        self.recalculate_pool()

    def total_money_in_system(self):
        wallets_total = sum(f.get("wallet", Decimal(0)) for f in self.followers)
        mgr_fee = self.manager.get("fee_wallet", Decimal(0)) if self.manager else Decimal(0)
        return self.total_equity + mgr_fee + wallets_total

    def snapshot(self):
        return {
            "total_equity": str(self.total_equity),
            "total_units": str(self.total_units),
            "nav": str(self.nav),
            "used_margin": str(self.used_margin),
            "free_margin": str(self.free_margin),
            "reserve_ledger": str(self.reserve_ledger),
            "followers": copy.deepcopy(self.followers),
            "manager": copy.deepcopy(self.manager),
            "positions_count": len(self.positions),
            "system_money": str(self.total_money_in_system())
        }

    def log_audit(self, payload):
        prev = self.audit_log[-1]["current_hash"] if self.audit_log else "GENESIS"
        raw = f"{payload}:{prev}".encode("utf-8")
        cur_hash = hashlib.sha256(raw).hexdigest()
        self.audit_log.append({
            "entry_id": len(self.audit_log) + 1,
            "payload": payload,
            "prev_hash": prev,
            "current_hash": cur_hash
        })

    def build_oracle_scope(self, s0=None, s1=None, res=None):
        wallets = [{"account_id": f["id"], "cash": f.get("wallet", Decimal(0))} for f in self.followers]
        return {
            "pool": {
                "total_equity": self.total_equity,
                "total_units": self.total_units,
                "nav": self.nav,
                "used_margin": self.used_margin,
                "free_margin": self.free_margin,
                "reserve_ledger": self.reserve_ledger
            },
            "followers": self.followers,
            "manager": self.manager,
            "wallets": wallets,
            "positions": self.positions,
            "orders": self.orders,
            "trades": self.trades,
            "audit_log": self.audit_log,
            "external_flows": self.external_flows,
            "initial_money_total": self.initial_money_total,
            "seen_keys": self.seen_keys,
            "child_orders_at_bridge": self.child_orders_at_bridge,
            "observed_transitions": self.observed_transitions,
            "reader_samples": self.reader_samples,
            "stream_sequences": self.stream_sequences,
            "replayed_requests": self.replayed_requests,
            "cancelled_operations": self.cancelled_operations,
            "compliance_violations": self.compliance_violations,
            "acked_writes": self.acked_writes,
            "persisted_writes": self.persisted_writes
        }
