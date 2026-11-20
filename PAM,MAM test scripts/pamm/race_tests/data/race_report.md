# BlackTrader PAMM - Deep Concurrency & Race-Condition Audit Report
**Generated:** 2026-11-18 09:55:18  
**Total Scenarios:** 114 | **Passed:** 114 | **Failed:** 0  
**Total Iterations Run:** 633 | **Violation Rate:** 0.0%  
**Elapsed Time:** 1.4s  

---
## 1. System Invariant Oracle Audit (I-01 to I-20)

| Invariant | Status | Checks | Violations |
| :--- | :--- | :--- | :--- |
| I-01 | ✅ PASS | 633 | 0 |
| I-02 | ✅ PASS | 633 | 0 |
| I-03 | ✅ PASS | 633 | 0 |
| I-04 | ✅ PASS | 633 | 0 |
| I-05 | ✅ PASS | 633 | 0 |
| I-06 | ✅ PASS | 633 | 0 |
| I-07 | ✅ PASS | 633 | 0 |
| I-08 | ✅ PASS | 633 | 0 |
| I-09 | ✅ PASS | 633 | 0 |
| I-10 | ✅ PASS | 633 | 0 |
| I-11 | ✅ PASS | 633 | 0 |
| I-12 | ✅ PASS | 633 | 0 |
| I-13 | ✅ PASS | 633 | 0 |
| I-14 | ✅ PASS | 633 | 0 |
| I-15 | ✅ PASS | 633 | 0 |
| I-16 | ✅ PASS | 633 | 0 |
| I-17 | ✅ PASS | 633 | 0 |
| I-18 | ✅ PASS | 633 | 0 |
| I-19 | ✅ PASS | 633 | 0 |
| I-20 | ✅ PASS | 633 | 0 |

---
## 2. Race Scenarios Execution Matrix

| Scenario ID | Status | Iters | Violations | Rate (%) | P50 (ms) | P99 (ms) | Invariants Failed |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `RC-F-01` | ✅ PASS | 26 | 0 | 0.0% | 6.47 | 55.72 | None |
| `RC-F-02` | ✅ PASS | 5 | 0 | 0.0% | 1.33 | 1.6 | None |
| `RC-F-03` | ✅ PASS | 26 | 0 | 0.0% | 6.67 | 55.45 | None |
| `RC-F-04` | ✅ PASS | 5 | 0 | 0.0% | 0.16 | 0.43 | None |
| `RC-F-05` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-F-06` | ✅ PASS | 5 | 0 | 0.0% | 1.66 | 1.75 | None |
| `RC-F-07` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-F-08` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-F-09` | ✅ PASS | 5 | 0 | 0.0% | 11.84 | 16.65 | None |
| `RC-A-01` | ✅ PASS | 5 | 0 | 0.0% | 2.79 | 3.64 | None |
| `RC-A-02` | ✅ PASS | 26 | 0 | 0.0% | 6.69 | 55.64 | None |
| `RC-A-03` | ✅ PASS | 5 | 0 | 0.0% | 2.14 | 2.73 | None |
| `RC-A-04` | ✅ PASS | 5 | 0 | 0.0% | 2.63 | 2.98 | None |
| `RC-A-05` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-A-06` | ✅ PASS | 5 | 0 | 0.0% | 0.81 | 1.01 | None |
| `RC-A-07` | ✅ PASS | 5 | 0 | 0.0% | 0.79 | 0.86 | None |
| `RC-A-08` | ✅ PASS | 5 | 0 | 0.0% | 1.1 | 1.2 | None |
| `RC-A-09` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-A-10` | ✅ PASS | 5 | 0 | 0.0% | 0.72 | 0.78 | None |
| `RC-R-01` | ✅ PASS | 5 | 0 | 0.0% | 0.89 | 0.89 | None |
| `RC-R-02` | ✅ PASS | 5 | 0 | 0.0% | 0.08 | 0.08 | None |
| `RC-R-03` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-R-04` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-R-05` | ✅ PASS | 5 | 0 | 0.0% | 0.39 | 0.42 | None |
| `RC-R-06` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-R-07` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-R-08` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-R-09` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-R-10` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-E-01` | ✅ PASS | 5 | 0 | 0.0% | 0.2 | 0.21 | None |
| `RC-E-02` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-E-03` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-E-04` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-E-05` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-E-06` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-E-07` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-E-08` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-E-09` | ✅ PASS | 5 | 0 | 0.0% | 27.69 | 30.48 | None |
| `RC-E-10` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-P-01` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-P-02` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-P-03` | ✅ PASS | 5 | 0 | 0.0% | 28.97 | 34.76 | None |
| `RC-P-04` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-P-05` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-P-06` | ✅ PASS | 5 | 0 | 0.0% | 8.44 | 16.61 | None |
| `RC-P-07` | ✅ PASS | 5 | 0 | 0.0% | 77.58 | 95.0 | None |
| `RC-P-08` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-P-09` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-P-10` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-M-01` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-M-02` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-M-03` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-M-04` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-M-05` | ✅ PASS | 5 | 0 | 0.0% | 17.68 | 19.47 | None |
| `RC-M-06` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-M-07` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-M-08` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-M-09` | ✅ PASS | 5 | 0 | 0.0% | 16.45 | 29.51 | None |
| `RC-M-10` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-M-11` | ✅ PASS | 5 | 0 | 0.0% | 12.11 | 14.05 | None |
| `RC-M-12` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-D-01` | ✅ PASS | 5 | 0 | 0.0% | 0.65 | 0.74 | None |
| `RC-D-02` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-D-03` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-D-04` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-D-05` | ✅ PASS | 5 | 0 | 0.0% | 14.35 | 21.21 | None |
| `RC-D-06` | ✅ PASS | 5 | 0 | 0.0% | 15.24 | 19.2 | None |
| `RC-D-07` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-D-08` | ✅ PASS | 5 | 0 | 0.0% | 10.37 | 14.08 | None |
| `RC-D-09` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-D-10` | ✅ PASS | 5 | 0 | 0.0% | 21.66 | 32.3 | None |
| `RC-D-11` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-D-12` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-D-13` | ✅ PASS | 5 | 0 | 0.0% | 10.54 | 15.93 | None |
| `RC-H-01` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-H-02` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-H-03` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-H-04` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-H-05` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-H-06` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-H-07` | ✅ PASS | 5 | 0 | 0.0% | 10.13 | 13.19 | None |
| `RC-H-08` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-H-09` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-H-10` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-H-11` | ✅ PASS | 5 | 0 | 0.0% | 11.14 | 15.01 | None |
| `RC-C-01` | ✅ PASS | 5 | 0 | 0.0% | 0.18 | 0.18 | None |
| `RC-C-02` | ✅ PASS | 5 | 0 | 0.0% | 11.93 | 13.82 | None |
| `RC-C-03` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-C-04` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-C-05` | ✅ PASS | 5 | 0 | 0.0% | 5.66 | 7.75 | None |
| `RC-C-06` | ✅ PASS | 5 | 0 | 0.0% | 5.96 | 7.87 | None |
| `RC-C-07` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-C-08` | ✅ PASS | 5 | 0 | 0.0% | 27.85 | 34.79 | None |
| `RC-C-09` | ✅ PASS | 5 | 0 | 0.0% | 18.87 | 25.26 | None |
| `RC-C-10` | ✅ PASS | 5 | 0 | 0.0% | 4.21 | 4.82 | None |
| `RC-C-11` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-C-12` | ✅ PASS | 5 | 0 | 0.0% | 35.42 | 46.33 | None |
| `RC-C-13` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-L-01` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-L-02` | ✅ PASS | 5 | 0 | 0.0% | 9.89 | 14.95 | None |
| `RC-L-03` | ✅ PASS | 5 | 0 | 0.0% | 15.36 | 19.19 | None |
| `RC-L-04` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-L-05` | ✅ PASS | 5 | 0 | 0.0% | 8.88 | 15.0 | None |
| `RC-L-06` | ✅ PASS | 5 | 0 | 0.0% | 9.25 | 11.66 | None |
| `RC-L-07` | ✅ PASS | 5 | 0 | 0.0% | 9.15 | 14.82 | None |
| `RC-O-01` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-O-02` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-O-03` | ✅ PASS | 5 | 0 | 0.0% | 30.8 | 44.23 | None |
| `RC-O-04` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-O-05` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-O-06` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-O-07` | ✅ PASS | 5 | 0 | 0.0% | 47.14 | 90.82 | None |
| `RC-O-08` | ✅ PASS | 5 | 0 | 0.0% | 16.19 | 22.08 | None |
| `RC-O-09` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |