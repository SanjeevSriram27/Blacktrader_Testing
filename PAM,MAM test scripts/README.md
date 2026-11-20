# BlackTrader PAMM & MAM Quality Automation Platform

A clean, modular, and enterprise-grade test automation suite built to rigorously validate the **PAMM (Percent Allocation Management Module)** and **MAM (Multi-Account Manager)** architectures of the **BlackTrader / BlackFX** trading platform.

---

## 1. Directory Structure

```text
/Users/appdev/PAM,MAM test scripts/
├── .env                                # Local active environment credentials (gitignored)
├── .env.example                        # Template configuration file
├── run_suite.py                        # Unified root test launcher
├── docs/                               # Master Go-Live Scenario Manuals
│   ├── PAMM_Master_Test_Scenarios_Go_Live.docx
│   └── MAM_Master_Test_Scenarios_Go_Live.docx
├── pamm/                               # Complete PAMM Automated Suite (165 Scenarios)
│   ├── run_scenario.py                 # Core PAMM CLI runner
│   ├── core/                           # API client, config, math engine, bug tracker
│   │   ├── api_client.py
│   │   ├── bug_tracker.py
│   │   ├── config.py
│   │   ├── math_engine.py
│   │   ├── scenario_base.py
│   │   └── state_manager.py
│   ├── dashboard/                      # Real-time Web UI Dashboard & Screenshot Gallery
│   │   ├── index.html
│   │   ├── styles.css
│   │   ├── app.js
│   │   ├── server.py                   # Lightweight Python HTTP server (Port 8088)
│   │   └── screenshots/                # Documented visual defects & UI evidence
│   ├── data/                           # Simulated ledger, pool records, and registered bugs
│   │   ├── accounts.json
│   │   ├── bugs.json
│   │   ├── orders.json
│   │   └── pools.json
│   ├── reports/                        # HTML & JSON test execution reports
│   └── scenarios/                      # 165 Test Scenarios partitioned into 11 modules
│       ├── registry.py                 # Unified scenario registry & index
│       ├── mod01_setup_lifecycle.py    # Module 1 (15 Scenarios)
│       ├── mod02_pool_sizing.py        # Module 2 (15 Scenarios)
│       ├── mod03_rollovers_nav.py      # Module 3 (15 Scenarios)
│       ├── mod04_order_routing.py      # Module 4 (15 Scenarios)
│       ├── mod05_partial_slippage.py   # Module 5 (15 Scenarios)
│       ├── mod06_pooled_margin_risk.py # Module 6 (15 Scenarios)
│       ├── mod07_deposits_withdrawals.py # Module 7 (15 Scenarios)
│       ├── mod08_hwm_settlement.py     # Module 8 (15 Scenarios)
│       ├── mod09_concurrency_scale.py  # Module 9 (15 Scenarios)
│       ├── mod10_regulatory_compliance.py # Module 10 (15 Scenarios)
│       └── mod11_operational_runbooks.py  # Module 11 (15 Scenarios)
└── mam/                                # Dedicated architecture for future MAM automation
```

---

## 2. Test Account Requirements

The BlackTrader platform requires specific account configurations:

> [!IMPORTANT]
> **No Paper Accounts:**
> The platform creates accounts strictly as **Real** instances. Selecting Paper mode does not create an isolated sandbox — accounts function under live engine rules. Therefore, all automated test scenarios execute against **Real (Hedging)** and **Real (Netting)** instances.

### Required Accounts to Create on `https://lpadmin.blackfx.com`:

| Role | Instance Type | Description |
| :--- | :--- | :--- |
| **PAMM Master (Hedging)** | `Real (Hedging)` | Master manager account that opens and manages the PAMM pool. |
| **PAMM Follower (Hedging)** | `Real (Hedging)` | Investor account that joins the Master's pool with capital. |
| **PAMM Master (Netting)** | `Real (Netting)` | Master manager account for net-order execution testing. |
| **PAMM Follower (Netting)** | `Real (Netting)` | Investor account following the netting master. |

*(Optional: Backoffice Administrator account for administrative audits: `lpadmin@blacktrader.com`)*

---

## 3. Configuration Setup (`.env`)

1. Copy the example template if not already present:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and fill in your newly created credentials:
   ```env
   PLATFORM_BASE_URL=https://lpadmin.blackfx.com

   # 1. Real (Hedging) Accounts
   PAMM_HEDGING_MASTER_EMAIL=your_master_hedging@example.com
   PAMM_HEDGING_MASTER_PASSWORD=your_password
   PAMM_HEDGING_POOL_NAME=Alpha Hedging Pool
   PAMM_HEDGING_MANAGER_SHARE_PERCENT=20
   PAMM_HEDGING_FOLLOWER_EMAIL=your_follower_hedging@example.com
   PAMM_HEDGING_FOLLOWER_PASSWORD=your_password

   # 2. Real (Netting) Accounts
   PAMM_NETTING_MASTER_EMAIL=your_master_netting@example.com
   PAMM_NETTING_MASTER_PASSWORD=your_password
   PAMM_NETTING_POOL_NAME=Alpha Netting Pool
   PAMM_NETTING_MANAGER_SHARE_PERCENT=20
   PAMM_NETTING_FOLLOWER_EMAIL=your_follower_netting@example.com
   PAMM_NETTING_FOLLOWER_PASSWORD=your_password
   ```

---

## 4. Running the 165 PAMM Scenarios

Execute scenarios directly from the root folder using `python3 run_suite.py`:

### Run a Single Scenario by ID:
```bash
python3 run_suite.py --id BTPAMM-A001
```

### Run an Entire Module (15 Scenarios per Module):
```bash
# Run Module 2: Pool Sizing & Equity Math
python3 run_suite.py --module 2

# Run Module 7: Deposits & Withdrawals Mid-Trade Collisions
python3 run_suite.py --module 7
```

### Run by Priority:
```bash
# Execute only P0 Blocker scenarios
python3 run_suite.py --priority P0
```

### Run the Full 165 Scenarios Suite:
```bash
python3 run_suite.py --all
```

### Review Known Platform Defects & Bugs:
```bash
python3 run_suite.py --bugs
```

---

## 5. Live Dashboard & Interactive Visualization

Launch the interactive web dashboard to view live test executions, registered bugs, and UI screenshots:

```bash
python3 run_suite.py --dashboard
```
Then open your browser at:  
👉 **`http://localhost:8088`**

The dashboard provides:
* **Real-time scenario pass/fail telemetry** across all 11 modules.
* **Registered bug cards** with severity, reproduction steps, and root-cause analysis.
* **Evidence gallery** showing visual glitches (`BUG-UI-007`, CSP Cloudflare blocks, wallet deposit errors, etc.).

---

## 6. Modules Overview (165 Scenarios)

| Module | Title | Count | Focus Areas |
| :---: | :--- | :---: | :--- |
| **01** | Setup & Lifecycle | 15 | Master pool creation, follower onboarding, authorization checks. |
| **02** | Pool Sizing & Equity Math | 15 | Proportional allocation formulas, zero-capital master, precision rounding. |
| **03** | Rollovers & NAV Calculations | 15 | Mark-to-market valuations, periodic rollover intervals. |
| **04** | Order Routing & Allocation | 15 | Master trade copying, lot distribution, order modification propagation. |
| **05** | Partial Fills & Slippage | 15 | Liquidity fragmentation, asymmetric execution, volume-weighted pricing. |
| **06** | Pooled Margin & Risk Controls | 15 | Aggregate margin requirements, stop-out limits, leverage tiers. |
| **07** | Deposits, Withdrawals & Mid-Trade | 15 | High-concurrency deposit collisions while positions are open. |
| **08** | High-Water Mark & Performance Fees | 15 | 20% manager fee calculation, recovery from drawdowns, fee settlements. |
| **09** | Concurrency, Scale & Race Conditions | 15 | Simultaneous multi-follower deposits, rapid exits, idempotency. |
| **10** | Regulatory & Compliance | 15 | Ledger immutability, audit trail logging, account access restrictions. |
| **11** | Operational Runbooks | 15 | Broker disaster recovery, order state reconciliation, data resilience. |

---

## 7. Future MAM Expansion (`mam/`)

The `mam/` directory is structured to extend the platform for Multi-Account Manager verification:
* **Allocation Algorithms:** Lot Ratio, Percentage Allocation, and Equity Ratio.
* **Master-Sub Account Sizing:** Independent margin management per sub-account.
* **Reference Specifications:** See `docs/MAM_Master_Test_Scenarios_Go_Live.docx`.
