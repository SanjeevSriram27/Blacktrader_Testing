"""
Configuration Manager for BlackTrader PAMM Scenario Test Suite
Supports both Real (Hedging) and Real (Netting) Master & Follower Accounts.
"""

import os
from pathlib import Path

class Config:
    SUITE_DIR = Path(__file__).resolve().parent.parent
    ROOT_DIR = SUITE_DIR.parent

    # Load root .env
    _env_path = ROOT_DIR / ".env"
    _env_vars = {}
    if _env_path.exists():
        with open(_env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    _env_vars[k.strip()] = v.strip().strip("\"'")

    BASE_URL = _env_vars.get("PLATFORM_BASE_URL", "https://lpadmin.blackfx.com").rstrip("/")
    ADMIN_BASE_URL = _env_vars.get("ADMIN_BASE_URL", BASE_URL).rstrip("/")
    
    # -------------------------------------------------------------------------
    # Real (Hedging) Accounts (Created by us)
    # -------------------------------------------------------------------------
    HEDGING_MASTER_EMAIL = _env_vars.get("PAMM_HEDGING_MASTER_EMAIL") or _env_vars.get("HEDGING_MASTER_EMAIL", "pmmaster@mailinator.com")
    HEDGING_MASTER_PASSWORD = _env_vars.get("PAMM_HEDGING_MASTER_PASSWORD") or _env_vars.get("HEDGING_MASTER_PASSWORD", "PammTest@123")
    HEDGING_POOL_NAME = _env_vars.get("PAMM_HEDGING_POOL_NAME") or _env_vars.get("HEDGING_POOL_NAME", "PM Master")
    HEDGING_MANAGER_SHARE_PERCENT = float(_env_vars.get("PAMM_HEDGING_MANAGER_SHARE_PERCENT") or _env_vars.get("HEDGING_MANAGER_SHARE_PERCENT", "20.0"))

    HEDGING_FOLLOWER_EMAIL = _env_vars.get("PAMM_HEDGING_FOLLOWER_EMAIL") or _env_vars.get("HEDGING_FOLLOWER_EMAIL", "pmf1@mailinator.com")
    HEDGING_FOLLOWER_PASSWORD = _env_vars.get("PAMM_HEDGING_FOLLOWER_PASSWORD") or _env_vars.get("HEDGING_FOLLOWER_PASSWORD", "PammTest@123")

    # -------------------------------------------------------------------------
    # Real (Netting) Accounts (Pointing to our created accounts only)
    # -------------------------------------------------------------------------
    NETTING_MASTER_EMAIL = _env_vars.get("NETTING_MASTER_EMAIL", "pmmaster@mailinator.com")
    NETTING_MASTER_PASSWORD = _env_vars.get("NETTING_MASTER_PASSWORD", "PammTest@123")
    NETTING_POOL_NAME = _env_vars.get("NETTING_POOL_NAME", "PM Master")
    NETTING_MANAGER_SHARE_PERCENT = float(_env_vars.get("NETTING_MANAGER_SHARE_PERCENT", "20.0"))

    NETTING_FOLLOWER_EMAIL = _env_vars.get("NETTING_FOLLOWER_EMAIL", "pmf1@mailinator.com")
    NETTING_FOLLOWER_PASSWORD = _env_vars.get("NETTING_FOLLOWER_PASSWORD", "PammTest@123")

    # Legacy Fallbacks
    MASTER_EMAIL = HEDGING_MASTER_EMAIL
    MASTER_PASSWORD = HEDGING_MASTER_PASSWORD
    MASTER_CLIENT_ID = _env_vars.get("MASTER_CLIENT_ID", "mem_4669b36f00cc55347e")
    MASTER_POOL_NAME = HEDGING_POOL_NAME
    MANAGER_SHARE_PERCENT = HEDGING_MANAGER_SHARE_PERCENT

    # Backoffice Admin Credentials
    BLACKADMIN_EMAIL = _env_vars.get("BLACKADMIN_EMAIL", "lpadmin@blacktrader.com")
    BLACKADMIN_PASSWORD = _env_vars.get("BLACKADMIN_PASSWORD", "Raj1234!")

    # Follower Generation Defaults (Our 10 created followers: pmf1..pmf10@mailinator.com)
    FOLLOWER_PREFIX = "pmf"
    FOLLOWER_DOMAIN = "mailinator.com"
    FOLLOWER_PASSWORD = _env_vars.get("FOLLOWER_PASSWORD", "PammTest@123")
    DEFAULT_FOLLOWER_COUNT = int(_env_vars.get("TEST_FOLLOWER_COUNT", "10"))

    # Instance Keys
    INSTANCE_REAL_HEDGING = "real"
    INSTANCE_REAL_NETTING = "real-net"
    INSTANCE_PAPER = "paper"
    DEFAULT_INSTANCE = "real"

    DEFAULT_SYMBOL = _env_vars.get("DEFAULT_SYMBOL", "EURUSD")
    USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

    # Data paths
    DATA_DIR = SUITE_DIR / "data"
    REPORTS_DIR = SUITE_DIR / "reports"
    ACCOUNTS_FILE = DATA_DIR / "accounts.json"
    POOLS_FILE = DATA_DIR / "pools.json"
    ORDERS_FILE = DATA_DIR / "orders.json"
    BUGS_FILE = DATA_DIR / "bugs.json"
    RESULTS_FILE = REPORTS_DIR / "pamm_test_results.json"

    @classmethod
    def get_environments(cls):
        envs = {}
        for i in range(1, 6):
            name = cls._env_vars.get(f"ENV_{i}_NAME") or f"Platform {i}"
            plat_url = cls._env_vars.get(f"ENV_{i}_PLATFORM_URL", "")
            admin_url = cls._env_vars.get(f"ENV_{i}_ADMIN_URL", "")
            admin_email = cls._env_vars.get(f"ENV_{i}_ADMIN_EMAIL", "")
            admin_pass = cls._env_vars.get(f"ENV_{i}_ADMIN_PASSWORD", "")
            master_email = cls._env_vars.get(f"ENV_{i}_MASTER_EMAIL", "")
            master_pass = cls._env_vars.get(f"ENV_{i}_MASTER_PASSWORD", "")
            follower_email = cls._env_vars.get(f"ENV_{i}_FOLLOWER_EMAIL", "")
            follower_pass = cls._env_vars.get(f"ENV_{i}_FOLLOWER_PASSWORD", "")
            pool_name = cls._env_vars.get(f"ENV_{i}_POOL_NAME", f"Pool {i}")
            
            envs[str(i)] = {
                "id": str(i),
                "name": name,
                "platform_url": plat_url,
                "admin_url": admin_url,
                "admin_email": admin_email,
                "admin_password": admin_pass,
                "master_email": master_email,
                "master_password": master_pass,
                "follower_email": follower_email,
                "follower_password": follower_pass,
                "pool_name": pool_name,
                "has_credentials": bool(plat_url and (admin_email or master_email))
            }
        return envs

    @classmethod
    def set_active_environment(cls, env_id: str):
        envs = cls.get_environments()
        env = envs.get(str(env_id))
        if env and env.get("platform_url"):
            cls.BASE_URL = env["platform_url"].rstrip("/")
            cls.ADMIN_BASE_URL = (env.get("admin_url") or cls.BASE_URL).rstrip("/")
            if env.get("admin_email"):
                cls.BLACKADMIN_EMAIL = env["admin_email"]
            if env.get("admin_password"):
                cls.BLACKADMIN_PASSWORD = env["admin_password"]
            if env.get("master_email"):
                cls.HEDGING_MASTER_EMAIL = env["master_email"]
                cls.MASTER_EMAIL = env["master_email"]
            if env.get("master_password"):
                cls.HEDGING_MASTER_PASSWORD = env["master_password"]
                cls.MASTER_PASSWORD = env["master_password"]
            return True
        return False
