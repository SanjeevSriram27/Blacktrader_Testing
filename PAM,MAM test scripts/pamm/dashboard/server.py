#!/usr/bin/env python3
"""
Lightweight Local HTTP Backend & API Orchestrator for PAMM Dashboard
Runs without external dependencies on standard library http.server.
Handles PAMM Follower Capital Management, High-Water Mark Fee Settlements,
Master Pooled Order Execution, and Proportional Trade P&L Apportionment.
"""

import sys
import os
import json
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

# Set path
SUITE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SUITE_DIR))

from core.config import Config
from core.state_manager import StateManager
from core.bug_tracker import BugTracker
from core.math_engine import PAMMMathEngine
from scenarios.registry import (
    get_all_scenarios,
    get_scenario_by_id,
    get_scenarios_by_module,
    get_scenarios_by_priority
)
from race_tests.runner import MasterRaceRunner, GLOBAL_RUNNER_STATE

state_mgr = StateManager()
bug_tracker = BugTracker()
bug_tracker.seed_known_platform_bugs()
math_engine = PAMMMathEngine()

def load_env_data(env_id="1"):
    env_file = SUITE_DIR / "data" / f"env_{env_id}_accounts.json"
    if env_file.exists():
        try:
            with open(env_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return None

def get_env_accounts(env_id="1", concept="hedging"):
    env_data = load_env_data(env_id)
    if not env_data:
        return state_mgr.get_accounts()
    
    concept = (concept or "hedging").lower()
    if concept == "hedging":
        m = env_data.get("hedging", {}).get("master")
        f = env_data.get("hedging", {}).get("followers", [])
        return ([m] if m else []) + f
    elif concept == "netting":
        m = env_data.get("netting", {}).get("master")
        f = env_data.get("netting", {}).get("followers", [])
        return ([m] if m else []) + f
    else: # "all"
        hm = env_data.get("hedging", {}).get("master")
        nm = env_data.get("netting", {}).get("master")
        hf = env_data.get("hedging", {}).get("followers", [])
        nf = env_data.get("netting", {}).get("followers", [])
        return ([hm] if hm else []) + ([nm] if nm else []) + hf + nf

def get_env_pools(env_id="1", concept="hedging"):
    env_data = load_env_data(env_id)
    if not env_data:
        return state_mgr.get_pools()
    concept = (concept or "hedging").lower()
    if concept == "hedging":
        p = env_data.get("hedging", {}).get("pool")
        return [p] if p else []
    elif concept == "netting":
        p = env_data.get("netting", {}).get("pool")
        return [p] if p else []
    else:
        hp = env_data.get("hedging", {}).get("pool")
        np = env_data.get("netting", {}).get("pool")
        return ([hp] if hp else []) + ([np] if np else [])

class PAMMDashboardHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SUITE_DIR / "dashboard"), **kwargs)

    def _send_json(self, data: Any, status: int = 200):
        body = json.dumps(data, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path == "/api/status":
            env_id = query.get("env_id", [getattr(Config, "ACTIVE_ENV_ID", "1")])[0]
            concept = query.get("concept", [getattr(Config, "ACTIVE_CONCEPT", "hedging")])[0].lower()
            
            env_data = load_env_data(env_id)
            pools = get_env_pools(env_id, concept)
            accounts = get_env_accounts(env_id, concept)
            orders = state_mgr.get_orders()
            bugs = bug_tracker.get_all()
            
            following_accounts = [a for a in accounts if a.get("status") == "FOLLOWING" and a.get("deposit", 0) > 0]
            total_equity = sum(a.get("current_equity", a.get("deposit", 0.0)) for a in following_accounts)
            
            pool_data = pools[0] if pools else {}
            pool_data["total_equity"] = round(total_equity, 2)
            pool_data["followers_count"] = len(following_accounts)
            
            plat_url = env_data.get("platform_url") if env_data else Config.BASE_URL
            admin_url = env_data.get("admin_url") if env_data else getattr(Config, "ADMIN_BASE_URL", Config.BASE_URL)
            env_name = env_data.get("env_name") if env_data else f"Platform {env_id}"
            
            master_acc = next((a for a in accounts if a.get("is_master")), None)
            
            self._send_json({
                "env_id": env_id,
                "env_name": env_name,
                "platform_url": plat_url,
                "admin_url": admin_url,
                "oms_url": f"{plat_url}/v1/oms",
                "instance": f"Real ({concept.title()})",
                "concept": concept,
                "master_email": master_acc.get("email") if master_acc else "pmmaster@mailinator.com",
                "master_member_id": master_acc.get("member_id") if master_acc else "mem_4669b36f00cc55347e",
                "master_pool": pool_data,
                "total_followers": len(following_accounts),
                "following_count": len(following_accounts),
                "total_orders": len(orders),
                "open_bugs_count": len([b for b in bugs if b.get("status") != "RESOLVED"]),
                "total_scenarios": 165
            })
            return

        elif path == "/api/environments":
            self._send_json({
                "active_id": getattr(Config, "ACTIVE_ENV_ID", "1"),
                "active_concept": getattr(Config, "ACTIVE_CONCEPT", "hedging"),
                "environments": Config.get_environments()
            })
            return

        elif path == "/api/accounts":
            env_id = query.get("env_id", [getattr(Config, "ACTIVE_ENV_ID", "1")])[0]
            concept = query.get("concept", [getattr(Config, "ACTIVE_CONCEPT", "hedging")])[0].lower()
            accounts = get_env_accounts(env_id, concept)
            
            following_accounts = [a for a in accounts if a.get("status") == "FOLLOWING" and a.get("deposit", 0) > 0]
            if following_accounts:
                deposits = [{"account_id": a["email"], "deposit": a["deposit"]} for a in following_accounts]
                shares = math_engine.calculate_pool_shares(deposits)
                share_map = {s["account_id"]: s["pool_share_pct"] for s in shares}
                for a in accounts:
                    if a.get("status") == "FOLLOWING":
                        a["pool_share_pct"] = share_map.get(a["email"], a.get("pool_share_pct", 0.0))
                    a["wallet_cash"] = a.get("wallet_cash", a.get("wallet_balance", 0.0))
                    a["current_equity"] = round(a.get("deposit", 0.0) + a.get("running_pnl", 0.0), 2)
            
            self._send_json({"accounts": accounts, "env_id": env_id, "concept": concept})
            return

        elif path == "/api/pools":
            env_id = query.get("env_id", [getattr(Config, "ACTIVE_ENV_ID", "1")])[0]
            concept = query.get("concept", [getattr(Config, "ACTIVE_CONCEPT", "hedging")])[0].lower()
            self._send_json({"pools": get_env_pools(env_id, concept), "env_id": env_id, "concept": concept})
            return

        elif path == "/api/orders":
            self._send_json({"orders": state_mgr.get_orders()})
            return

        elif path == "/api/bugs":
            self._send_json({"bugs": bug_tracker.get_all()})
            return

        elif path == "/api/scenarios":
            scenarios = get_all_scenarios()
            data = [
                {
                    "tc_id": s.tc_id,
                    "title": s.title,
                    "priority": s.priority,
                    "module_num": s.module_num,
                    "description": s.description
                }
                for s in scenarios
            ]
            self._send_json({"scenarios": data})
            return

        elif path == "/api/race/status":
            self._send_json(GLOBAL_RUNNER_STATE.to_dict())
            return

        elif path == "/api/race/results":
            report_path = SUITE_DIR / "race_tests" / "data" / "race_report.json"
            if report_path.exists():
                with open(report_path) as f:
                    self._send_json(json.load(f))
            else:
                self._send_json(GLOBAL_RUNNER_STATE.to_dict())
            return

        elif path.startswith("/api/race/replay/"):
            bundle_id = path.split("/")[-1]
            replay_dir = SUITE_DIR / "race_tests" / "data" / "replay_bundles"
            target_file = None
            if replay_dir.exists():
                for p in replay_dir.glob("*.json"):
                    if bundle_id in p.name:
                        target_file = p
                        break
            if target_file and target_file.exists():
                with open(target_file) as f:
                    self._send_json(json.load(f))
            else:
                self._send_json({"error": "Replay bundle not found"}, 404)
            return

        # Fallback to static files
        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
        try:
            payload = json.loads(body)
        except Exception:
            payload = {}

        if path == "/api/environments/select":
            env_id = str(payload.get("env_id", getattr(Config, "ACTIVE_ENV_ID", "1")))
            concept = payload.get("concept", getattr(Config, "ACTIVE_CONCEPT", "hedging"))
            Config.set_active_environment(env_id)
            Config.ACTIVE_ENV_ID = env_id
            Config.ACTIVE_CONCEPT = concept

            env_accounts = get_env_accounts(env_id, concept)
            env_pools = get_env_pools(env_id, concept)
            state_mgr._save_json(Config.ACCOUNTS_FILE, env_accounts)
            state_mgr._save_json(Config.POOLS_FILE, env_pools)

            self._send_json({
                "status": "ok",
                "active_id": env_id,
                "concept": concept,
                "platform_url": Config.BASE_URL,
                "admin_url": Config.ADMIN_BASE_URL
            })
            return

        if path == "/api/action/create-account":
            email = payload.get("email") or f"pmf{len(state_mgr.get_accounts()) + 1}@mailinator.com"
            deposit = float(payload.get("deposit", 1000.0))
            new_acc = state_mgr.add_account(email, deposit=deposit, status="ACTIVE")
            new_acc["wallet_cash"] = 10000.0
            new_acc["wallet_balance"] = 10000.0
            new_acc["deposit"] = 0.0
            new_acc["current_equity"] = 0.0
            new_acc["running_pnl"] = 0.0
            self._send_json({"status": "ok", "account": new_acc})
            return

        elif path == "/api/action/join-pool":
            email = payload.get("email")
            deposit_req = float(payload.get("deposit", 1000.0))
            accounts = state_mgr.get_accounts()
            target = next((a for a in accounts if a["email"] == email), None)
            if target:
                wallet = float(target.get("wallet_cash", target.get("wallet_balance", 10000.0)))
                deposit = min(wallet, deposit_req) if wallet > 0 else deposit_req
                wallet -= deposit
                target["wallet_cash"] = round(wallet, 2)
                target["wallet_balance"] = round(wallet, 2)
                target["deposit"] = round(deposit, 2)
                target["current_equity"] = round(deposit, 2)
                target["hwm"] = round(deposit, 2)
                target["running_pnl"] = 0.0
                target["status"] = "FOLLOWING"
                target["pool_id"] = "mem_4669b36f00cc55347e"
                state_mgr._save_json(state_mgr.accounts_file, accounts)
                
                pools = state_mgr.get_pools()
                if pools:
                    pools[0]["total_equity"] = round(pools[0].get("total_equity", 0.0) + deposit, 2)
                    state_mgr._save_json(state_mgr.pools_file, pools)
                self._send_json({"status": "ok", "message": f"{email} joined pool with ${deposit:,.2f} deposit."})
            else:
                self._send_json({"status": "error", "message": "Account not found"}, 404)
            return

        elif path == "/api/action/unfollow":
            email = payload.get("email")
            accounts = state_mgr.get_accounts()
            target = next((a for a in accounts if a["email"] == email), None)
            if target:
                deposit = float(target.get("deposit", 0.0))
                running_pnl = float(target.get("running_pnl", 0.0))
                manager_fee_pct = 20.0
                
                if running_pnl > 0:
                    manager_fee = round(running_pnl * (manager_fee_pct / 100.0), 2)
                    net_profit = round(running_pnl - manager_fee, 2)
                else:
                    manager_fee = 0.0
                    net_profit = round(running_pnl, 2)
                
                total_payout = max(0.0, round(deposit + net_profit, 2))
                old_wallet = float(target.get("wallet_cash", target.get("wallet_balance", 0.0)))
                new_wallet = round(old_wallet + total_payout, 2)
                
                target["wallet_cash"] = new_wallet
                target["wallet_balance"] = new_wallet
                target["deposit"] = 0.0
                target["running_pnl"] = 0.0
                target["current_equity"] = 0.0
                target["hwm"] = 0.0
                target["pool_share_pct"] = 0.0
                target["status"] = "ACTIVE"
                target["pool_id"] = None
                settlement_record = {
                    "email": email,
                    "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                    "deposit_returned": deposit,
                    "gross_pnl": running_pnl,
                    "manager_fee": manager_fee,
                    "manager_fee_pct": manager_fee_pct,
                    "net_profit": net_profit,
                    "total_payout": total_payout,
                    "new_wallet_cash": new_wallet
                }
                target["last_settlement"] = settlement_record
                state_mgr._save_json(state_mgr.accounts_file, accounts)
                
                pools = state_mgr.get_pools()
                if pools:
                    pools[0]["total_equity"] = max(0.0, round(pools[0].get("total_equity", 0.0) - total_payout, 2))
                    state_mgr._save_json(state_mgr.pools_file, pools)

                self._send_json({
                    "status": "ok",
                    "message": f"Settled and unfollowed {email}.",
                    "settlement": settlement_record
                })
            else:
                self._send_json({"status": "error", "message": "Account not found"}, 404)
            return

        elif path == "/api/action/place-order":
            symbol = payload.get("symbol", "EURUSD")
            side = payload.get("side", "BUY")
            qty = float(payload.get("qty", 2.0))
            order_type = payload.get("type", "MARKET")
            instance = payload.get("instance", "real")
            sl = payload.get("sl")
            tp = payload.get("tp")
            order_id = f"ord_{int(time.time()*1000)%1000000}"
            base_prices = {"EURUSD": 1.08250, "GBPUSD": 1.26500, "USDJPY": 154.200, "BINANCE:BTCUSDT": 91500.0, "XAUUSD": 2615.50}
            fill_price = base_prices.get(symbol, 1.08250)
            
            unrealized_pnl = round(qty * 166.67 if side == "BUY" else qty * 150.0, 2)
            current_price = round(fill_price + (0.00167 if side == "BUY" else -0.00150), 5)
            manager_fee = round(unrealized_pnl * 0.20, 2) if unrealized_pnl > 0 else 0.0
            follower_net = round(unrealized_pnl - manager_fee, 2)
            
            order = {
                "order_id": order_id,
                "symbol": symbol,
                "side": side,
                "qty": qty,
                "type": order_type,
                "instance": instance,
                "sl": sl,
                "tp": tp,
                "fill_price": fill_price,
                "exit_price": current_price,
                "unrealized_pnl": unrealized_pnl,
                "realized_pnl": 0.0,
                "manager_fee": manager_fee,
                "follower_net_pnl": follower_net,
                "status": "OPEN",
                "pool_id": "mem_4669b36f00cc55347e",
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                "allocations": []
            }
            state_mgr.add_order(order)
            self._send_json({"status": "ok", "order": order})
            return

        elif path == "/api/action/simulate-trade":
            target_pnl = float(payload.get("pnl", 500.0))
            symbol = payload.get("symbol", "EURUSD")
            side = payload.get("side", "BUY" if target_pnl >= 0 else "SELL")
            qty = float(payload.get("qty", 3.0 if target_pnl >= 0 else 1.5))
            auto_close = payload.get("auto_close", True)
            order_id = f"ord_{int(time.time()*1000)%1000000}"
            base_prices = {"EURUSD": 1.08250, "GBPUSD": 1.26500, "USDJPY": 154.200, "XAUUSD": 2615.50}
            fill_price = base_prices.get(symbol, 1.08250)
            exit_price = round(fill_price + (0.00167 if target_pnl >= 0 else -0.00100), 5)

            manager_fee = round(target_pnl * 0.20, 2) if target_pnl > 0 else 0.0
            follower_net = round(target_pnl - manager_fee, 2)

            order = {
                "order_id": order_id,
                "symbol": symbol,
                "side": side,
                "qty": qty,
                "type": "MARKET",
                "instance": "real",
                "sl": None,
                "tp": None,
                "fill_price": fill_price,
                "exit_price": exit_price,
                "unrealized_pnl": 0.0 if auto_close else target_pnl,
                "realized_pnl": target_pnl if auto_close else 0.0,
                "manager_fee": manager_fee,
                "follower_net_pnl": follower_net,
                "status": "CLOSED" if auto_close else "OPEN",
                "pool_id": "mem_4669b36f00cc55347e",
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                "allocations": []
            }
            
            if auto_close:
                accounts = state_mgr.get_accounts()
                following = [a for a in accounts if a.get("status") == "FOLLOWING" and a.get("deposit", 0) > 0]
                if following:
                    deposits = [{"account_id": a["email"], "deposit": a["deposit"]} for a in following]
                    shares = math_engine.calculate_pool_shares(deposits)
                    pnl_allocs = math_engine.allocate_trade_pnl(target_pnl, shares)
                    alloc_map = {p["account_id"]: p["gross_pnl"] for p in pnl_allocs}
                    share_map = {s["account_id"]: s["pool_share_pct"] for s in shares}
                    
                    order_allocs = []
                    for a in accounts:
                        if a["email"] in alloc_map:
                            gross = alloc_map[a["email"]]
                            pct = share_map.get(a["email"], 0.0)
                            fee = round(gross * 0.20, 2) if gross > 0 else 0.0
                            net = round(gross - fee, 2)
                            a["running_pnl"] = round(a.get("running_pnl", 0.0) + net, 2)
                            a["current_equity"] = round(a["deposit"] + a["running_pnl"], 2)
                            a["hwm"] = max(a.get("hwm", a["deposit"]), a["current_equity"])
                            order_allocs.append({
                                "email": a["email"],
                                "pool_share_pct": pct,
                                "gross_share": gross,
                                "manager_fee": fee,
                                "net_profit": net,
                                "post_equity": a["current_equity"]
                            })
                    order["allocations"] = order_allocs
                    state_mgr._save_json(state_mgr.accounts_file, accounts)
                    
                    pools = state_mgr.get_pools()
                    if pools:
                        pools[0]["total_equity"] = round(pools[0].get("total_equity", 0.0) + target_pnl, 2)
                        state_mgr._save_json(state_mgr.pools_file, pools)

            state_mgr.add_order(order)
            self._send_json({"status": "ok", "order": order})
            return

        elif path == "/api/action/squareoff":
            order_id = payload.get("order_id")
            orders = state_mgr.get_orders()
            target = next((o for o in orders if o["order_id"] == order_id), None)
            if target:
                target["status"] = "CLOSED"
                realized = float(target.get("unrealized_pnl", round(target.get("qty", 1.0) * 166.67, 2)))
                target["realized_pnl"] = realized
                target["unrealized_pnl"] = 0.0
                manager_fee = round(realized * 0.20, 2) if realized > 0 else 0.0
                follower_net = round(realized - manager_fee, 2)
                target["manager_fee"] = manager_fee
                target["follower_net_pnl"] = follower_net
                
                # Distribute PnL to following accounts
                accounts = state_mgr.get_accounts()
                following = [a for a in accounts if a.get("status") == "FOLLOWING" and a.get("deposit", 0) > 0]
                if following:
                    deposits = [{"account_id": a["email"], "deposit": a["deposit"]} for a in following]
                    shares = math_engine.calculate_pool_shares(deposits)
                    pnl_allocs = math_engine.allocate_trade_pnl(realized, shares)
                    alloc_map = {p["account_id"]: p["gross_pnl"] for p in pnl_allocs}
                    share_map = {s["account_id"]: s["pool_share_pct"] for s in shares}
                    
                    order_allocs = []
                    for a in accounts:
                        if a["email"] in alloc_map:
                            gross = alloc_map[a["email"]]
                            pct = share_map.get(a["email"], 0.0)
                            fee = round(gross * 0.20, 2) if gross > 0 else 0.0
                            net = round(gross - fee, 2)
                            a["running_pnl"] = round(a.get("running_pnl", 0.0) + net, 2)
                            a["current_equity"] = round(a["deposit"] + a["running_pnl"], 2)
                            a["hwm"] = max(a.get("hwm", a["deposit"]), a["current_equity"])
                            order_allocs.append({
                                "email": a["email"],
                                "pool_share_pct": pct,
                                "gross_share": gross,
                                "manager_fee": fee,
                                "net_profit": net,
                                "post_equity": a["current_equity"]
                            })
                    target["allocations"] = order_allocs
                    state_mgr._save_json(state_mgr.accounts_file, accounts)
                    
                    pools = state_mgr.get_pools()
                    if pools:
                        pools[0]["total_equity"] = round(pools[0].get("total_equity", 0.0) + realized, 2)
                        state_mgr._save_json(state_mgr.pools_file, pools)

                state_mgr._save_json(state_mgr.orders_file, orders)
                self._send_json({"status": "ok", "order": target})
            else:
                self._send_json({"status": "error", "message": "Order not found"}, 404)
            return

        elif path == "/api/run-scenario":
            tc_id = payload.get("tc_id")
            if tc_id:
                sc = get_scenario_by_id(tc_id)
                if not sc:
                    self._send_json({"status": "error", "message": f"Scenario {tc_id} not found"}, 404)
                    return
                res = sc.run()
                self._send_json({"result": res.to_dict()})
                return
            elif payload.get("run_all"):
                scenarios = get_all_scenarios()
                results = [s.run().to_dict() for s in scenarios]
                self._send_json({"results": results})
                return

        elif path == "/api/race/run":
            priority = payload.get("priority")
            module_filter = payload.get("module")
            scenario_id = payload.get("scenario_id")
            mode = payload.get("mode", "quick")
            iters = payload.get("iters")

            import threading
            runner = MasterRaceRunner()
            t = threading.Thread(
                target=runner.run_suite,
                kwargs={
                    "priority": priority,
                    "module_filter": module_filter,
                    "scenario_id": scenario_id,
                    "mode": mode,
                    "iterations": iters
                },
                daemon=True
            )
            t.start()
            self._send_json({"status": "started", "message": "Race suite launched in background thread"})
            return

        self._send_json({"status": "error", "message": "Endpoint not found"}, 404)

def run_server(port=8090):
    for p in range(port, port + 10):
        try:
            server = HTTPServer(("0.0.0.0", p), PAMMDashboardHandler)
            print(f"\n=======================================================")
            print(f"[*] BlackTrader PAMM Operations & Test Dashboard Online")
            print(f"[*] URL: http://localhost:{p}")
            print(f"=======================================================\n")
            server.serve_forever()
            return
        except OSError as e:
            if getattr(e, "errno", None) == 48:
                continue
            raise e
    print(f"[-] Error: Could not bind to ports {port} through {port+9}")

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8090
    run_server(port)
