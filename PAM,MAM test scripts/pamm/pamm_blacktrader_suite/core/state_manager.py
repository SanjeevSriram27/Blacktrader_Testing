"""
State Manager for PAMM Accounts, Pools, and Trade Orders
Persists local state to JSON to power the Unified Dashboard and Test Runner.
"""

import json
from pathlib import Path
from typing import Dict, Any, List, Optional
from core.config import Config

class StateManager:
    def __init__(
        self,
        accounts_file=Config.ACCOUNTS_FILE,
        pools_file=Config.POOLS_FILE,
        orders_file=Config.ORDERS_FILE,
    ):
        self.accounts_file = Path(accounts_file)
        self.pools_file = Path(pools_file)
        self.orders_file = Path(orders_file)
        self._ensure_files()

    def _ensure_files(self):
        self.accounts_file.parent.mkdir(parents=True, exist_ok=True)
        if not self.accounts_file.exists():
            self._save_json(self.accounts_file, self._default_accounts())
        if not self.pools_file.exists():
            self._save_json(self.pools_file, self._default_pools())
        if not self.orders_file.exists():
            self._save_json(self.orders_file, self._default_orders())

    def _save_json(self, path: Path, data: Any):
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def _load_json(self, path: Path) -> Any:
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []

    def _default_accounts(self) -> List[Dict[str, Any]]:
        # Seed our 10 created test follower accounts (pmf1..pmf10@mailinator.com)
        follower_ids = [
            ("mem_e26aa534f801d04237", "pmm_cbb6cf0570fe937afb"),
            ("mem_d418c85a28182db953", "pmm_29ee697c1401a4de18"),
            ("mem_2b4b6755ae8ed059a9", "pmm_20e4b47143a7524da7"),
            ("mem_7d5a18611d1a51731e", "pmm_dee21db280ff786bf1"),
            ("mem_1c6beb7764028720cc", "pmm_b4b6b2fdc206f3b97b"),
            ("mem_8080a5bca2119a3fe9", "pmm_f695e2dbe19c031f73"),
            ("mem_ecc6ae933d48a7c380", "pmm_9b2ef011487b6e2fc1"),
            ("mem_5452eb488b8622756f", "pmm_698ca5e9fb7e2d3205"),
            ("mem_d4696d922fdee6d886", "pmm_1eb3590078a1244b56"),
            ("mem_822cf51b32a092c7ac", "pmm_e2c856e42324fbb8a3"),
        ]
        accounts = []
        for i, (mem_id, pamm_id) in enumerate(follower_ids, start=1):
            deposit = 100.0
            accounts.append({
                "index": i,
                "email": f"pmf{i}@mailinator.com",
                "member_id": mem_id,
                "name": f"PM Follower {i}",
                "deposit": deposit,
                "wallet_balance": 1000.0 - deposit,
                "status": "FOLLOWING",
                "pool_id": pamm_id,
                "master_client_id": "mem_4669b36f00cc55347e",
                "hwm": deposit,
                "current_equity": deposit,
                "running_pnl": 0.0,
                "created_at": "2026-11-18 09:26:38"
            })
        return accounts

    def _default_pools(self) -> List[Dict[str, Any]]:
        return [
            {
                "pool_id": "mem_4669b36f00cc55347e",
                "master_client_id": "mem_4669b36f00cc55347e",
                "display_name": Config.HEDGING_POOL_NAME,
                "manager_email": Config.HEDGING_MASTER_EMAIL,
                "share_percent": Config.HEDGING_MANAGER_SHARE_PERCENT,
                "instance": "real",
                "total_equity": 2000.00,
                "total_units": 20.00,
                "nav_per_unit": 100.00,
                "status": "ACTIVE",
                "followers_count": 10,
                "open_positions_count": 0,
                "created_at": "2026-11-18 09:26:38"
            }
        ]

    def _default_orders(self) -> List[Dict[str, Any]]:
        return [
            {
                "order_id": "ord_9821a",
                "symbol": "EURUSD",
                "side": "BUY",
                "qty": 2.0,
                "fill_price": 1.08250,
                "exit_price": 1.08310,
                "realized_pnl": 12.00,
                "status": "CLOSED",
                "pool_id": "mem_4669b36f00cc55347e",
                "timestamp": "2026-11-18 09:26:38"
            }
        ]

    # Accounts API
    def get_accounts(self) -> List[Dict[str, Any]]:
        return self._load_json(self.accounts_file)

    def add_account(self, email: str, deposit: float = 1000.0, status: str = "ACTIVE") -> Dict[str, Any]:
        accounts = self.get_accounts()
        idx = len(accounts) + 1
        account = {
            "index": idx,
            "email": email,
            "name": f"PAMM Follower #{idx}",
            "deposit": deposit,
            "wallet_balance": 10000.0 - deposit,
            "status": status,
            "pool_id": None,
            "hwm": deposit,
            "current_equity": deposit,
            "running_pnl": 0.0,
            "created_at": "2026-11-16 14:00:00"
        }
        accounts.append(account)
        self._save_json(self.accounts_file, accounts)
        return account

    def update_account(self, email: str, updates: Dict[str, Any]):
        accounts = self.get_accounts()
        for a in accounts:
            if a["email"] == email:
                a.update(updates)
                break
        self._save_json(self.accounts_file, accounts)

    # Pools API
    def get_pools(self) -> List[Dict[str, Any]]:
        return self._load_json(self.pools_file)

    def update_pool(self, pool_id: str, updates: Dict[str, Any]):
        pools = self.get_pools()
        for p in pools:
            if p["pool_id"] == pool_id:
                p.update(updates)
                break
        self._save_json(self.pools_file, pools)

    # Orders API
    def get_orders(self) -> List[Dict[str, Any]]:
        return self._load_json(self.orders_file)

    def add_order(self, order_dict: Dict[str, Any]):
        orders = self.get_orders()
        orders.insert(0, order_dict)
        self._save_json(self.orders_file, orders)

