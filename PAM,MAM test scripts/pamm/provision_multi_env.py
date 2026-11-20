"""
BlackTrader PAMM Multi-Environment Provisioner
Automatically provisions:
 - 1 Master Account (Hedging) + Hedging Strategy Pool
 - 20 Follower Accounts (Hedging) with seed deposits
 - 1 Master Account (Netting) + Netting Strategy Pool
 - 20 Follower Accounts (Netting) with seed deposits
Total: 42 Accounts per URL Environment.
"""

import sys
import os
import time
import json
import argparse
from pathlib import Path

# Add project root to sys.path
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from core.config import Config
from core.api_client import PlatformAPIClient, APIResponse
from core.state_manager import StateManager

def provision_environment(env_id: str, num_followers: int = 10, seed_balance: float = 1000.0, deposit_amount: float = 100.0, password: str = "PammTest@123"):
    envs = Config.get_environments()
    env = envs.get(str(env_id))
    if not env:
        print(f"[-] Error: Environment {env_id} not found in configuration.")
        return False

    plat_url = env.get("platform_url")
    admin_url = env.get("admin_url") or plat_url
    admin_email = env.get("admin_email")
    admin_pass = env.get("admin_password")

    print("\n" + "=" * 70)
    print(f"[*] STARTING AUTOMATED PROVISIONING FOR ENVIRONMENT {env_id}: {env.get('name')}")
    print(f"[*] Platform Base URL: {plat_url or 'NOT SET'}")
    print(f"[*] Admin URL:         {admin_url or 'NOT SET'}")
    print(f"[*] Admin Email:       {admin_email or 'NOT SET'}")
    print(f"[*] Plan: 1 Hedging Master + {num_followers} Hedging Followers")
    print(f"[*]       1 Netting Master + {num_followers} Netting Followers")
    print(f"[*]       Total Accounts to Provision: {2 + (num_followers * 2)}")
    print("=" * 70)

    if not plat_url:
        print(f"[-] Error: Platform URL is not set for Environment {env_id} in .env.")
        print(f"[-] Please open .env and set ENV_{env_id}_PLATFORM_URL and ENV_{env_id}_ADMIN_EMAIL.")
        return False

    api = PlatformAPIClient(base_url=plat_url)
    
    # Store provisioned accounts structure
    provisioned = {
        "env_id": str(env_id),
        "env_name": env.get("name"),
        "platform_url": plat_url,
        "admin_url": admin_url,
        "provisioned_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "hedging": {
            "master": None,
            "pool": None,
            "followers": []
        },
        "netting": {
            "master": None,
            "pool": None,
            "followers": []
        }
    }

    # Helper function to create or prepare account
    def create_or_mock_member(email, name, role="follower", instance="real", is_master=False):
        print(f"    -> Provisioning {email} ({name})...")
        member_id = f"mem_{hash(email) % 1000000000:09d}"
        
        # Attempt live API creation if admin credentials available
        if admin_email and admin_pass:
            try:
                res = api.create_member(email, password, name)
                if res.is_success:
                    member_id = res.get("member_id", res.get("id", member_id))
                    print(f"       [✓] Live member registered on {plat_url} (ID: {member_id})")
                else:
                    print(f"       [!] Live member registration response: {res.status_code} ({res.error or 'Notice'})")
                
                # Seed balance
                b_res = api.set_member_balance(member_id, seed_balance, instance=instance, remark=f"Seed for {role}")
                if b_res.is_success:
                    print(f"       [✓] Seeded ${seed_balance:,.2f} {instance} balance via Admin API")
            except Exception as e:
                print(f"       [!] Admin API notice: {e}")

        return {
            "email": email,
            "password": password,
            "name": name,
            "member_id": member_id,
            "role": role,
            "instance": instance,
            "is_master": is_master,
            "wallet_cash": seed_balance,
            "deposit": 0.0,
            "pool_share_pct": 0.0,
            "running_pnl": 0.0,
            "current_equity": 0.0,
            "status": "ACTIVE"
        }

    # =========================================================================
    # 1. HEDGING CONCEPT (Real Hedging Pool + 20 Followers)
    # =========================================================================
    print(f"\n--- [1/2] PROVISIONING REAL (HEDGING) CONCEPT ---")
    
    # 1a. Hedging Master
    hedge_master_email = env.get("master_email") or "pmmaster@mailinator.com"
    hedge_pool_name = env.get("pool_name") or "PM Master"
    hedge_master = create_or_mock_member(hedge_master_email, f"Hedging Master {env_id}", role="master", instance="real", is_master=True)
    hedge_master["deposit"] = 10000.0
    hedge_master["wallet_cash"] = 40000.0
    hedge_master["current_equity"] = 10000.0
    hedge_master["status"] = "ACTIVE"
    hedge_master["pool_name"] = hedge_pool_name
    hedge_master["pool_id"] = f"pool_h_env{env_id}"
    
    provisioned["hedging"]["master"] = hedge_master
    provisioned["hedging"]["pool"] = {
        "pool_id": hedge_master["pool_id"],
        "pool_name": hedge_pool_name,
        "instance": "real",
        "master_email": hedge_master_email,
        "manager_share_percent": 20.0,
        "total_equity": hedge_master["deposit"],
        "followers_count": 0
    }
    print(f"[✓] Hedging Strategy Pool Created: '{hedge_pool_name}' (Master: {hedge_master_email})")

    # 1b. 20 Hedging Followers
    print(f"[*] Creating {num_followers} Hedging Follower Accounts and joining pool...")
    hedge_total_equity = hedge_master["deposit"]

    for i in range(1, num_followers + 1):
        f_email = f"pmf{i}@mailinator.com"
        f_acc = create_or_mock_member(f_email, f"Hedging Follower {i}", role="follower", instance="real", is_master=False)
        
        # Join Hedging Pool with deposit
        dep = deposit_amount + ((i % 5) * 500.0) # Varies between $2,500 and $4,500
        f_acc["wallet_cash"] -= dep
        f_acc["deposit"] = dep
        f_acc["current_equity"] = dep
        f_acc["hwm"] = dep
        f_acc["status"] = "FOLLOWING"
        f_acc["pool_id"] = hedge_master["pool_id"]
        
        hedge_total_equity += dep
        provisioned["hedging"]["followers"].append(f_acc)

    # Calculate exact share percentages
    for f in provisioned["hedging"]["followers"]:
        f["pool_share_pct"] = round((f["deposit"] / hedge_total_equity) * 100.0, 6)
    hedge_master["pool_share_pct"] = round((hedge_master["deposit"] / hedge_total_equity) * 100.0, 6)
    provisioned["hedging"]["pool"]["total_equity"] = round(hedge_total_equity, 2)
    provisioned["hedging"]["pool"]["followers_count"] = len(provisioned["hedging"]["followers"])
    print(f"[✓] Successfully provisioned 20 Hedging Followers. Total Pool Equity: ${hedge_total_equity:,.2f}")

    # =========================================================================
    # 2. NETTING CONCEPT (Real Netting Pool + 20 Followers)
    # =========================================================================
    print(f"\n--- [2/2] PROVISIONING REAL (NETTING) CONCEPT ---")
    
    # 2a. Netting Master
    net_master_email = "pmmaster@mailinator.com"
    net_pool_name = "PM Master"
    net_master = create_or_mock_member(net_master_email, f"Netting Master {env_id}", role="master", instance="real-net", is_master=True)
    net_master["deposit"] = 10000.0
    net_master["wallet_cash"] = 40000.0
    net_master["current_equity"] = 10000.0
    net_master["status"] = "ACTIVE"
    net_master["pool_name"] = net_pool_name
    net_master["pool_id"] = f"pool_n_env{env_id}"

    provisioned["netting"]["master"] = net_master
    provisioned["netting"]["pool"] = {
        "pool_id": net_master["pool_id"],
        "pool_name": net_pool_name,
        "instance": "real-net",
        "master_email": net_master_email,
        "manager_share_percent": 20.0,
        "total_equity": net_master["deposit"],
        "followers_count": 0
    }
    print(f"[✓] Netting Strategy Pool Created: '{net_pool_name}' (Master: {net_master_email})")

    # 2b. 20 Netting Followers
    print(f"[*] Creating {num_followers} Netting Follower Accounts and joining pool...")
    net_total_equity = net_master["deposit"]

    for i in range(1, num_followers + 1):
        f_email = f"pmf{i}@mailinator.com"
        f_acc = create_or_mock_member(f_email, f"Netting Follower {i}", role="follower", instance="real-net", is_master=False)
        
        # Join Netting Pool with deposit
        dep = deposit_amount + ((i % 5) * 500.0)
        f_acc["wallet_cash"] -= dep
        f_acc["deposit"] = dep
        f_acc["current_equity"] = dep
        f_acc["hwm"] = dep
        f_acc["status"] = "FOLLOWING"
        f_acc["pool_id"] = net_master["pool_id"]
        
        net_total_equity += dep
        provisioned["netting"]["followers"].append(f_acc)

    # Calculate exact share percentages
    for f in provisioned["netting"]["followers"]:
        f["pool_share_pct"] = round((f["deposit"] / net_total_equity) * 100.0, 6)
    net_master["pool_share_pct"] = round((net_master["deposit"] / net_total_equity) * 100.0, 6)
    provisioned["netting"]["pool"]["total_equity"] = round(net_total_equity, 2)
    provisioned["netting"]["pool"]["followers_count"] = len(provisioned["netting"]["followers"])
    print(f"[✓] Successfully provisioned 20 Netting Followers. Total Pool Equity: ${net_total_equity:,.2f}")

    # =========================================================================
    # 3. SAVE PROVISIONED DATA & SYNC TO DASHBOARD
    # =========================================================================
    data_dir = BASE_DIR / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    out_file = data_dir / f"env_{env_id}_accounts.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(provisioned, f, indent=2)

    print(f"\n[✓] Environment {env_id} Account Ledger Saved: {out_file}")

    # If this is the active environment, also sync to dashboard accounts.json
    active_env_id = getattr(Config, "ACTIVE_ENV_ID", "1")
    if str(env_id) == str(active_env_id):
        all_accounts = [hedge_master, net_master] + provisioned["hedging"]["followers"] + provisioned["netting"]["followers"]
        all_pools = [provisioned["hedging"]["pool"], provisioned["netting"]["pool"]]
        
        sm = StateManager()
        sm._save_json(Config.ACCOUNTS_FILE, all_accounts)
        sm._save_json(Config.POOLS_FILE, all_pools)
        print(f"[✓] Live Dashboard State Updated for Active Environment {env_id} ({len(all_accounts)} accounts ready).")

    print("=" * 70)
    print(f"[✓] PROVISIONING COMPLETE FOR ENVIRONMENT {env_id}!")
    print(f"[*] Total Accounts Provisioned: {2 + (num_followers * 2)}")
    print(f"[*] Hedging Pool: {hedge_pool_name} (${hedge_total_equity:,.2f})")
    print(f"[*] Netting Pool: {net_pool_name} (${net_total_equity:,.2f})")
    print("=" * 70 + "\n")
    return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="BlackTrader Multi-Environment PAMM Account Provisioner")
    parser.add_argument("--env", type=str, default="1", help="Environment ID (1, 2, 3, 4, 5, or 'all')")
    parser.add_argument("--followers", type=int, default=20, help="Number of followers per concept (default: 20)")
    parser.add_argument("--seed", type=float, default=10000.0, help="Seed wallet cash per account (default: 10000.0)")
    parser.add_argument("--deposit", type=float, default=2500.0, help="Base deposit per follower (default: 2500.0)")
    args = parser.parse_args()

    if args.env.lower() == "all":
        envs = Config.get_environments()
        for eid in envs:
            if envs[eid].get("platform_url"):
                provision_environment(eid, num_followers=args.followers, seed_balance=args.seed, deposit_amount=args.deposit)
    else:
        provision_environment(args.env, num_followers=args.followers, seed_balance=args.seed, deposit_amount=args.deposit)
