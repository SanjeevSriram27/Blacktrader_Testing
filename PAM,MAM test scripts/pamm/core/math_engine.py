"""
High-Precision PAMM Mathematical & Sizing Engine
Handles exact decimal calculations, non-dilutive NAV pricing, and High-Water Mark fee settlements.
"""

from decimal import Decimal, ROUND_HALF_EVEN, ROUND_FLOOR
from typing import Dict, Any, List

def D(val) -> Decimal:
    return Decimal(str(val))

class PAMMMathEngine:
    def __init__(self, decimal_precision: int = 8):
        self.precision = decimal_precision

    def calculate_pool_shares(self, deposits: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Calculates exact fractional pool share percentages for each follower.
        Asserts the Zero-Sum Volume Conservation Law: Sum(Share_Pct) == 100.000000%
        """
        total_balance = sum(D(d["deposit"]) for d in deposits)
        if total_balance <= Decimal("0.0"):
            raise ValueError("Total pool balance must be greater than zero.")

        results = []
        accumulated_pct = Decimal("0.0")

        for idx, d in enumerate(deposits):
            dep = D(d["deposit"])
            pct = (dep / total_balance) * Decimal("100.0")
            # Round to 6 decimal places for display, keep exact for math
            pct_rounded = pct.quantize(Decimal("0.000001"), rounding=ROUND_HALF_EVEN)
            accumulated_pct += pct

            results.append({
                "account_id": d.get("account_id", f"acc_{idx+1}"),
                "deposit": float(dep),
                "pool_share_pct": float(pct_rounded),
                "exact_weight": pct / Decimal("100.0")
            })

        # Conservation verification
        drift = abs(Decimal("100.0") - accumulated_pct)
        if drift > Decimal("0.0001"):
            raise ValueError(f"Conservation law breached! Sum of shares = {accumulated_pct}%, drift = {drift}")

        return results

    def allocate_trade_pnl(self, total_pnl: float, shares: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Apportions parent block trade realized P&L proportionally across all followers.
        """
        pnl_dec = D(total_pnl)
        allocated = []
        allocated_sum = Decimal("0.0")

        for s in shares:
            weight = s["exact_weight"]
            follower_pnl = (pnl_dec * weight).quantize(Decimal("0.000001"), rounding=ROUND_HALF_EVEN)
            allocated_sum += follower_pnl
            allocated.append({
                "account_id": s["account_id"],
                "gross_pnl": float(follower_pnl),
                "weight": float(weight)
            })

        return allocated

    def settle_high_water_mark(
        self,
        current_equity: float,
        hwm: float,
        share_percent: float = 20.0
    ) -> Dict[str, Any]:
        """
        Computes performance fee strictly on net new profit above High-Water Mark.
        """
        eq_dec = D(current_equity)
        hwm_dec = D(hwm)
        fee_rate = D(share_percent) / Decimal("100.0")

        if eq_dec > hwm_dec:
            net_profit = eq_dec - hwm_dec
            fee = (net_profit * fee_rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_EVEN)
            new_equity = eq_dec - fee
            new_hwm = new_equity
            is_above_hwm = True
        else:
            net_profit = Decimal("0.0")
            fee = Decimal("0.0")
            new_equity = eq_dec
            new_hwm = hwm_dec
            is_above_hwm = False

        return {
            "initial_equity": float(eq_dec),
            "hwm": float(hwm_dec),
            "net_new_profit": float(net_profit),
            "fee_deducted": float(fee),
            "final_equity": float(new_equity),
            "new_hwm": float(new_hwm),
            "is_above_hwm": is_above_hwm
        }

    def compute_nav_per_unit(self, total_equity: float, total_units: float) -> Decimal:
        """
        Calculates Net Asset Value per share unit (NAV = Equity / Units).
        """
        eq = D(total_equity)
        u = D(total_units)
        if u <= Decimal("0.0"):
            return Decimal("100.00000000")
        return (eq / u).quantize(Decimal("0.00000001"), rounding=ROUND_HALF_EVEN)

    def mint_units_on_deposit(self, deposit_amount: float, current_nav: float) -> Decimal:
        """
        Calculates units minted on new cash injection at current NAV.
        """
        dep = D(deposit_amount)
        nav = D(current_nav)
        if nav <= Decimal("0.0"):
            raise ValueError("NAV must be positive.")
        return (dep / nav).quantize(Decimal("0.00000001"), rounding=ROUND_HALF_EVEN)

    def burn_units_on_withdrawal(self, withdrawal_amount: float, current_nav: float) -> Decimal:
        """
        Calculates units burned on redemption at current NAV.
        """
        w = D(withdrawal_amount)
        nav = D(current_nav)
        if nav <= Decimal("0.0"):
            raise ValueError("NAV must be positive.")
        return (w / nav).quantize(Decimal("0.00000001"), rounding=ROUND_HALF_EVEN)

