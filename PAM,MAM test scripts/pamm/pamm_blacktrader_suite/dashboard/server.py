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

def load_env_orders(env_id="1"):
    orders_file = SUITE_DIR / "data" / f"env_{env_id}_orders.json"
    if orders_file.exists():
        try:
            with open(orders_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return state_mgr.get_orders()

def save_env_orders(env_id, orders):
    orders_file = SUITE_DIR / "data" / f"env_{env_id}_orders.json"
    try:
        with open(orders_file, "w", encoding="utf-8") as f:
            json.dump(orders, f, indent=2)
    except Exception as e:
        print(f"Error saving orders for env {env_id}: {e}")

def get_env_orders(env_id="1", concept=None, date_filter=None):
    orders = load_env_orders(env_id)
    if concept and concept.lower() in ("hedging", "netting"):
        orders = [o for o in orders if o.get("concept", "hedging").lower() == concept.lower()]
    if date_filter and date_filter.lower() != "all":
        orders = [o for o in orders if o.get("date") == date_filter or date_filter in o.get("timestamp", "")]
    return orders

def compute_follower_allocations(gross_pnl, followers):
    total_dep = sum(float(f.get("deposit", 0.0)) for f in followers if f.get("deposit", 0) > 0)
    if total_dep <= 0:
        return []
    allocs = []
    is_profit = gross_pnl >= 0
    for f in followers:
        dep = float(f.get("deposit", 0.0))
        if dep <= 0:
            continue
        pct = (dep / total_dep) * 100.0
        gross_share = round(gross_pnl * (pct / 100.0), 2)
        if is_profit and gross_share > 0:
            fee = round(gross_share * 0.20, 2)
            net = round(gross_share - fee, 2)
        else:
            fee = 0.0
            net = gross_share
        current_eq = round(dep + float(f.get("running_pnl", 0.0)) + net, 2)
        allocs.append({
            "email": f["email"],
            "deposit": dep,
            "pool_share_pct": round(pct, 6),
            "gross_share": gross_share,
            "manager_fee": fee,
            "net_profit": net,
            "post_equity": current_eq
        })
    return allocs

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
            h_master = env_data.get("hedging", {}).get("master") if env_data else None
            n_master = env_data.get("netting", {}).get("master") if env_data else None
            h_pool = env_data.get("hedging", {}).get("pool") if env_data else None
            n_pool = env_data.get("netting", {}).get("pool") if env_data else None
            
            fallback_email = h_master.get("email") if h_master else "pmmaster@mailinator.com"
            fallback_id = h_master.get("member_id") if h_master else "mem_4669b36f00cc55347e"
            
            self._send_json({
                "env_id": env_id,
                "env_name": env_name,
                "platform_url": plat_url,
                "admin_url": admin_url,
                "oms_url": f"{plat_url}/v1/oms",
                "instance": f"Real ({concept.title()})",
                "concept": concept,
                "master_email": master_acc.get("email") if master_acc else fallback_email,
                "master_member_id": master_acc.get("member_id") if master_acc else fallback_id,
                "master_pool": pool_data,
                "hedging_master": h_master,
                "netting_master": n_master,
                "hedging_pool": h_pool,
                "netting_pool": n_pool,
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
            env_id = query.get("env_id", [getattr(Config, "ACTIVE_ENV_ID", "1")])[0]
            concept = query.get("concept", [getattr(Config, "ACTIVE_CONCEPT", "hedging")])[0]
            date_filter = query.get("date", ["all"])[0]
            orders = get_env_orders(env_id, concept, date_filter)
            self._send_json({"orders": orders, "env_id": env_id, "concept": concept, "date": date_filter})
            return

        elif path == "/api/bugs":
            self._send_json({"bugs": bug_tracker.get_all()})
            return

        elif path == "/api/scenarios":
            env_id = query.get("env_id", [getattr(Config, "ACTIVE_ENV_ID", "1")])[0]
            concept = query.get("concept", [getattr(Config, "ACTIVE_CONCEPT", "hedging")])[0]
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

            results_map = {}
            results_file = SUITE_DIR / "reports" / "pamm_test_results.json"
            if results_file.exists():
                try:
                    with open(results_file, "r") as f:
                        raw_results = json.load(f)
                        env_data = load_env_data(env_id)
                        plat_url = env_data.get("platform_url") if env_data else "https://terminal.blacktrader.com/test"
                        oms_inst = "real-net" if concept == "netting" else "real"
                        oms_url = f"{plat_url}/v1/oms/{oms_inst}"

                        for r in raw_results:
                            tc = r.get("tc_id")
                            if not tc: continue
                            r_concept = r.get("concept", "").lower()
                            if tc not in results_map or (concept in r_concept):
                                r_copy = dict(r)
                                r_copy["env_id"] = env_id
                                r_copy["platform_url"] = plat_url
                                r_copy["oms_url"] = oms_url
                                results_map[tc] = r_copy
                except Exception as e:
                    print(f"Error loading scenario results: {e}")

            self._send_json({"scenarios": data, "results": results_map, "env_id": env_id, "concept": concept})
            return

        elif path == "/api/race/status":
            self._send_json(GLOBAL_RUNNER_STATE.to_dict())
            return

        elif path == "/api/race/results":
            env_id = query.get("env_id", [getattr(Config, "ACTIVE_ENV_ID", "1")])[0]
            matched = list((SUITE_DIR / "reports").glob(f"audit_env_{env_id}_*.json"))
            env_audit = {}
            if matched:
                try:
                    with open(matched[0]) as f:
                        env_audit = json.load(f)
                except Exception:
                    pass

            report_path = SUITE_DIR / "race_tests" / "data" / "race_report.json"
            base_data = {}
            if report_path.exists():
                with open(report_path) as f:
                    base_data = json.load(f)
            else:
                base_data = GLOBAL_RUNNER_STATE.to_dict()

            if env_audit:
                base_data["env_id"] = env_id
                base_data["platform_url"] = env_audit.get("platform_url")
                base_data["admin_url"] = env_audit.get("admin_url")
                base_data["certified"] = env_audit.get("certified", True)
                base_data["audited_at"] = env_audit.get("audited_at")
                if "race_condition_suite" in env_audit:
                    base_data["summary"] = env_audit["race_condition_suite"]
            self._send_json(base_data)
            return

        elif path == "/api/report":
            env_id = query.get("env_id", [getattr(Config, "ACTIVE_ENV_ID", "1")])[0]
            matched = list((SUITE_DIR / "reports").glob(f"audit_env_{env_id}_*.json"))
            if matched:
                with open(matched[0]) as f:
                    self._send_json(json.load(f))
            else:
                report_path = SUITE_DIR / "reports" / "MULTI_PLATFORM_4_ENV_AUDIT_REPORT.json"
                if report_path.exists():
                    with open(report_path) as f:
                        self._send_json(json.load(f))
                else:
                    self._send_json({"error": "Report not found for env " + env_id}, 404)
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
            env_id = str(payload.get("env_id", getattr(Config, "ACTIVE_ENV_ID", "1")))
            concept = payload.get("concept", getattr(Config, "ACTIVE_CONCEPT", "hedging")).lower()
            symbol = payload.get("symbol", "EURUSD")
            side = payload.get("side", "BUY")
            qty = float(payload.get("qty", 2.0))
            order_type = payload.get("type", "MARKET")
            instance = "real-net" if concept == "netting" else "real"
            sl = payload.get("sl")
            tp = payload.get("tp")
            order_id = f"ord_{int(time.time()*1000)%1000000}"
            base_prices = {"EURUSD": 1.08250, "GBPUSD": 1.26500, "USDJPY": 154.200, "BINANCE:BTCUSDT": 91500.0, "XAUUSD": 2615.50}
            fill_price = base_prices.get(symbol, 1.08250)
            
            unrealized_pnl = round(qty * 166.67 if side == "BUY" else qty * 150.0, 2)
            current_price = round(fill_price + (0.00167 if side == "BUY" else -0.00150), 5)
            manager_fee = round(unrealized_pnl * 0.20, 2) if unrealized_pnl > 0 else 0.0
            follower_net = round(unrealized_pnl - manager_fee, 2)
            
            env_data = load_env_data(env_id)
            c_data = env_data.get(concept, {}) if env_data else {}
            master_email = c_data.get("master", {}).get("email", "pmmaster@mailinator.com")
            pool_id = c_data.get("pool", {}).get("pool_id", f"pool_{concept}_{env_id}")

            order = {
                "order_id": order_id,
                "env_id": str(env_id),
                "concept": concept,
                "master_email": master_email,
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
                "pool_id": pool_id,
                "date": time.strftime("%Y-%m-%d"),
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                "allocations": []
            }
            orders = load_env_orders(env_id)
            orders.insert(0, order)
            save_env_orders(env_id, orders)
            self._send_json({"status": "ok", "order": order})
            return

        elif path == "/api/action/simulate-trade":
            env_id = str(payload.get("env_id", getattr(Config, "ACTIVE_ENV_ID", "1")))
            concept = payload.get("concept", getattr(Config, "ACTIVE_CONCEPT", "hedging")).lower()
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

            env_data = load_env_data(env_id)
            c_data = env_data.get(concept, {}) if env_data else {}
            master_email = c_data.get("master", {}).get("email", "pmmaster@mailinator.com")
            pool_id = c_data.get("pool", {}).get("pool_id", f"pool_{concept}_{env_id}")
            followers = c_data.get("followers", []) if env_data else []

            order_allocs = []
            if followers and auto_close:
                order_allocs = compute_follower_allocations(target_pnl, followers)
                alloc_map = {a["email"]: a for a in order_allocs}
                for f in followers:
                    if f["email"] in alloc_map:
                        al = alloc_map[f["email"]]
                        f["running_pnl"] = round(f.get("running_pnl", 0.0) + al["net_profit"], 2)
                        f["current_equity"] = round(f["deposit"] + f["running_pnl"], 2)
                        f["hwm"] = max(f.get("hwm", f["deposit"]), f["current_equity"])
                env_file = SUITE_DIR / "data" / f"env_{env_id}_accounts.json"
                try:
                    with open(env_file, "w") as ef:
                        json.dump(env_data, ef, indent=2)
                except Exception:
                    pass

            order = {
                "order_id": order_id,
                "env_id": str(env_id),
                "concept": concept,
                "instance": "real-net" if concept == "netting" else "real",
                "master_email": master_email,
                "symbol": symbol,
                "side": side,
                "qty": qty,
                "type": "MARKET",
                "sl": None,
                "tp": None,
                "fill_price": fill_price,
                "exit_price": exit_price,
                "unrealized_pnl": 0.0 if auto_close else target_pnl,
                "realized_pnl": target_pnl if auto_close else 0.0,
                "manager_fee": manager_fee,
                "follower_net_pnl": follower_net,
                "status": "CLOSED" if auto_close else "OPEN",
                "pool_id": pool_id,
                "date": time.strftime("%Y-%m-%d"),
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                "allocations": order_allocs
            }
            orders = load_env_orders(env_id)
            orders.insert(0, order)
            save_env_orders(env_id, orders)
            self._send_json({"status": "ok", "order": order})
            return

        elif path == "/api/action/squareoff":
            order_id = payload.get("order_id")
            env_id = str(payload.get("env_id", getattr(Config, "ACTIVE_ENV_ID", "1")))
            concept = payload.get("concept", getattr(Config, "ACTIVE_CONCEPT", "hedging")).lower()
            orders = load_env_orders(env_id)
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
                
                env_data = load_env_data(env_id)
                followers = env_data.get(concept, {}).get("followers", []) if env_data else []
                if followers:
                    target["allocations"] = compute_follower_allocations(realized, followers)
                    alloc_map = {a["email"]: a for a in target["allocations"]}
                    for f in followers:
                        if f["email"] in alloc_map:
                            al = alloc_map[f["email"]]
                            f["running_pnl"] = round(f.get("running_pnl", 0.0) + al["net_profit"], 2)
                            f["current_equity"] = round(f["deposit"] + f["running_pnl"], 2)
                            f["hwm"] = max(f.get("hwm", f["deposit"]), f["current_equity"])
                    env_file = SUITE_DIR / "data" / f"env_{env_id}_accounts.json"
                    try:
                        with open(env_file, "w") as ef:
                            json.dump(env_data, ef, indent=2)
                    except Exception:
                        pass
                
                save_env_orders(env_id, orders)
                self._send_json({"status": "ok", "order": target})
            else:
                self._send_json({"status": "error", "message": "Order not found"}, 404)
            return
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
