#!/usr/bin/env python3
"""
Provision Realistic Date-Wise PAMM Master Orders for Multi-Environment BlackTrader Hub
Generates data/env_1_orders.json, env_2_orders.json, env_3_orders.json, env_4_orders.json
Each file includes:
 - Hedging and Netting Master executions
 - Today (2026-11-18) and yesterday (2026-11-17) orders
 - Active OPEN orders and settled CLOSED orders
 - Mathematically exact follower-by-follower P&L allocation tables
"""

import json
from pathlib import Path
from decimal import Decimal, ROUND_HALF_EVEN

SUITE_DIR = Path(__file__).resolve().parent
DATA_DIR = SUITE_DIR / "data"

def D(v):
    return Decimal(str(v))

def compute_allocations(gross_pnl, followers):
    total_dep = sum(D(f["deposit"]) for f in followers)
    allocs = []
    pnl_dec = D(gross_pnl)
    is_profit = gross_pnl >= 0

    for f in followers:
        dep = D(f["deposit"])
        pct = (dep / total_dep) * Decimal("100.0")
        pct_float = float(pct.quantize(Decimal("0.000001"), rounding=ROUND_HALF_EVEN))
        
        gross_share = float((pnl_dec * (pct / Decimal("100.0"))).quantize(Decimal("0.01"), rounding=ROUND_HALF_EVEN))
        
        if is_profit and gross_share > 0:
            fee = round(gross_share * 0.20, 2)
            net = round(gross_share - fee, 2)
        else:
            fee = 0.0
            net = gross_share
            
        current_eq = float(dep) + net
        
        allocs.append({
            "email": f["email"],
            "deposit": float(dep),
            "pool_share_pct": pct_float,
            "gross_share": gross_share,
            "manager_fee": fee,
            "net_profit": net,
            "post_equity": round(current_eq, 2)
        })
    return allocs

def generate_orders_for_env(env_id):
    acc_file = DATA_DIR / f"env_{env_id}_accounts.json"
    if not acc_file.exists():
        print(f"Error: {acc_file} not found")
        return []

    with open(acc_file) as f:
        acc_data = json.load(f)

    h_master = acc_data["hedging"]["master"]["email"]
    h_pool_id = acc_data["hedging"]["pool"]["pool_id"]
    h_followers = acc_data["hedging"]["followers"]

    n_master = acc_data["netting"]["master"]["email"]
    n_pool_id = acc_data["netting"]["pool"]["pool_id"]
    n_followers = acc_data["netting"]["followers"]

    orders = []

    # ------------------ TODAY (2026-11-18) HEDGING ORDERS ------------------
    # 1. Closed +$500 Profit Trade
    h_pnl_1 = 500.0
    orders.append({
        "order_id": f"ord_20261118_h{env_id}01",
        "env_id": str(env_id),
        "concept": "hedging",
        "instance": "real",
        "master_email": h_master,
        "symbol": "EURUSD",
        "side": "BUY",
        "qty": 2.0,
        "type": "MARKET",
        "sl": 1.08000,
        "tp": 1.08750,
        "fill_price": 1.08250,
        "exit_price": 1.08500,
        "unrealized_pnl": 0.0,
        "realized_pnl": h_pnl_1,
        "manager_fee": round(h_pnl_1 * 0.20, 2),
        "follower_net_pnl": round(h_pnl_1 * 0.80, 2),
        "status": "CLOSED",
        "pool_id": h_pool_id,
        "date": "2026-11-18",
        "timestamp": "2026-11-18 09:30:15",
        "allocations": compute_allocations(h_pnl_1, h_followers)
    })

    # 2. Closed -$200 Loss Trade
    h_pnl_2 = -200.0
    orders.append({
        "order_id": f"ord_20261118_h{env_id}02",
        "env_id": str(env_id),
        "concept": "hedging",
        "instance": "real",
        "master_email": h_master,
        "symbol": "GBPUSD",
        "side": "SELL",
        "qty": 1.5,
        "type": "MARKET",
        "sl": 1.26800,
        "tp": 1.26100,
        "fill_price": 1.26500,
        "exit_price": 1.26633,
        "unrealized_pnl": 0.0,
        "realized_pnl": h_pnl_2,
        "manager_fee": 0.0,
        "follower_net_pnl": h_pnl_2,
        "status": "CLOSED",
        "pool_id": h_pool_id,
        "date": "2026-11-18",
        "timestamp": "2026-11-18 10:45:22",
        "allocations": compute_allocations(h_pnl_2, h_followers)
    })

    # 3. Closed +$1,200 High-Profit Trade
    h_pnl_3 = 1200.0
    orders.append({
        "order_id": f"ord_20261118_h{env_id}03",
        "env_id": str(env_id),
        "concept": "hedging",
        "instance": "real",
        "master_email": h_master,
        "symbol": "XAUUSD",
        "side": "BUY",
        "qty": 1.0,
        "type": "MARKET",
        "sl": 2605.00,
        "tp": 2635.00,
        "fill_price": 2615.50,
        "exit_price": 2627.50,
        "unrealized_pnl": 0.0,
        "realized_pnl": h_pnl_3,
        "manager_fee": round(h_pnl_3 * 0.20, 2),
        "follower_net_pnl": round(h_pnl_3 * 0.80, 2),
        "status": "CLOSED",
        "pool_id": h_pool_id,
        "date": "2026-11-18",
        "timestamp": "2026-11-18 11:40:10",
        "allocations": compute_allocations(h_pnl_3, h_followers)
    })

    # 4. Open Trade
    h_pnl_4 = 350.0
    orders.append({
        "order_id": f"ord_20261118_h{env_id}04",
        "env_id": str(env_id),
        "concept": "hedging",
        "instance": "real",
        "master_email": h_master,
        "symbol": "USDJPY",
        "side": "BUY",
        "qty": 2.0,
        "type": "MARKET",
        "sl": 153.800,
        "tp": 154.900,
        "fill_price": 154.200,
        "exit_price": 154.375,
        "unrealized_pnl": h_pnl_4,
        "realized_pnl": 0.0,
        "manager_fee": round(h_pnl_4 * 0.20, 2),
        "follower_net_pnl": round(h_pnl_4 * 0.80, 2),
        "status": "OPEN",
        "pool_id": h_pool_id,
        "date": "2026-11-18",
        "timestamp": "2026-11-18 12:20:00",
        "allocations": compute_allocations(h_pnl_4, h_followers)
    })

    # ------------------ TODAY (2026-11-18) NETTING ORDERS ------------------
    # 5. Closed Netting +$650 Profit Trade
    n_pnl_1 = 650.0
    orders.append({
        "order_id": f"ord_20261118_n{env_id}01",
        "env_id": str(env_id),
        "concept": "netting",
        "instance": "real-net",
        "master_email": n_master,
        "symbol": "EURUSD",
        "side": "BUY",
        "qty": 2.5,
        "type": "MARKET",
        "sl": 1.08050,
        "tp": 1.08800,
        "fill_price": 1.08250,
        "exit_price": 1.08510,
        "unrealized_pnl": 0.0,
        "realized_pnl": n_pnl_1,
        "manager_fee": round(n_pnl_1 * 0.20, 2),
        "follower_net_pnl": round(n_pnl_1 * 0.80, 2),
        "status": "CLOSED",
        "pool_id": n_pool_id,
        "date": "2026-11-18",
        "timestamp": "2026-11-18 09:45:00",
        "allocations": compute_allocations(n_pnl_1, n_followers)
    })

    # 6. Closed Netting +$400 Trade
    n_pnl_2 = 400.0
    orders.append({
        "order_id": f"ord_20261118_n{env_id}02",
        "env_id": str(env_id),
        "concept": "netting",
        "instance": "real-net",
        "master_email": n_master,
        "symbol": "USDJPY",
        "side": "SELL",
        "qty": 2.0,
        "type": "MARKET",
        "sl": 154.600,
        "tp": 153.800,
        "fill_price": 154.200,
        "exit_price": 154.000,
        "unrealized_pnl": 0.0,
        "realized_pnl": n_pnl_2,
        "manager_fee": round(n_pnl_2 * 0.20, 2),
        "follower_net_pnl": round(n_pnl_2 * 0.80, 2),
        "status": "CLOSED",
        "pool_id": n_pool_id,
        "date": "2026-11-18",
        "timestamp": "2026-11-18 11:05:40",
        "allocations": compute_allocations(n_pnl_2, n_followers)
    })

    # 7. Open Netting Trade
    n_pnl_3 = 220.0
    orders.append({
        "order_id": f"ord_20261118_n{env_id}03",
        "env_id": str(env_id),
        "concept": "netting",
        "instance": "real-net",
        "master_email": n_master,
        "symbol": "GBPUSD",
        "side": "BUY",
        "qty": 1.5,
        "type": "MARKET",
        "sl": 1.26200,
        "tp": 1.27000,
        "fill_price": 1.26500,
        "exit_price": 1.26647,
        "unrealized_pnl": n_pnl_3,
        "realized_pnl": 0.0,
        "manager_fee": round(n_pnl_3 * 0.20, 2),
        "follower_net_pnl": round(n_pnl_3 * 0.80, 2),
        "status": "OPEN",
        "pool_id": n_pool_id,
        "date": "2026-11-18",
        "timestamp": "2026-11-18 12:15:30",
        "allocations": compute_allocations(n_pnl_3, n_followers)
    })

    # ------------------ YESTERDAY (2026-11-17) ORDERS ------------------
    # 8. Hedging Yesterday
    h_pnl_y1 = 450.0
    orders.append({
        "order_id": f"ord_20261117_h{env_id}01",
        "env_id": str(env_id),
        "concept": "hedging",
        "instance": "real",
        "master_email": h_master,
        "symbol": "EURUSD",
        "side": "SELL",
        "qty": 2.0,
        "type": "MARKET",
        "sl": 1.08700,
        "tp": 1.07900,
        "fill_price": 1.08450,
        "exit_price": 1.08225,
        "unrealized_pnl": 0.0,
        "realized_pnl": h_pnl_y1,
        "manager_fee": round(h_pnl_y1 * 0.20, 2),
        "follower_net_pnl": round(h_pnl_y1 * 0.80, 2),
        "status": "CLOSED",
        "pool_id": h_pool_id,
        "date": "2026-11-17",
        "timestamp": "2026-11-17 14:20:10",
        "allocations": compute_allocations(h_pnl_y1, h_followers)
    })

    # 9. Netting Yesterday
    n_pnl_y1 = 800.0
    orders.append({
        "order_id": f"ord_20261117_n{env_id}01",
        "env_id": str(env_id),
        "concept": "netting",
        "instance": "real-net",
        "master_email": n_master,
        "symbol": "EURUSD",
        "side": "BUY",
        "qty": 3.0,
        "type": "MARKET",
        "sl": 1.07800,
        "tp": 1.08900,
        "fill_price": 1.08100,
        "exit_price": 1.08367,
        "unrealized_pnl": 0.0,
        "realized_pnl": n_pnl_y1,
        "manager_fee": round(n_pnl_y1 * 0.20, 2),
        "follower_net_pnl": round(n_pnl_y1 * 0.80, 2),
        "status": "CLOSED",
        "pool_id": n_pool_id,
        "date": "2026-11-17",
        "timestamp": "2026-11-17 16:45:00",
        "allocations": compute_allocations(n_pnl_y1, n_followers)
    })

    out_file = DATA_DIR / f"env_{env_id}_orders.json"
    with open(out_file, "w") as f:
        json.dump(orders, f, indent=2)

    print(f"Generated {len(orders)} orders for Env {env_id} in {out_file.name}")
    return orders

def main():
    for env_id in range(1, 5):
        generate_orders_for_env(env_id)
    print("Done provisioning orders for all 4 environments.")

if __name__ == "__main__":
    main()
