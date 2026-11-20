# BlackTrader PAMM - Deep Concurrency & Race-Condition Audit Report
**Generated:** 2026-11-18 11:48:38  
**Total Scenarios:** 114 | **Passed:** 114 | **Failed:** 0  
**Total Iterations Run:** 633 | **Violation Rate:** 0.0%  
**Elapsed Time:** 1.4s  

---
## 1. System Invariant Oracle Audit (I-01 to I-20)

| Invariant | Status | Checks | Violations |
| :--- | :--- | :--- | :--- |
| I-01 | ✅ PASS | 2532 | 0 |
| I-02 | ✅ PASS | 2532 | 0 |
| I-03 | ✅ PASS | 2532 | 0 |
| I-04 | ✅ PASS | 2532 | 0 |
| I-05 | ✅ PASS | 2532 | 0 |
| I-06 | ✅ PASS | 2532 | 0 |
| I-07 | ✅ PASS | 2532 | 0 |
| I-08 | ✅ PASS | 2532 | 0 |
| I-09 | ✅ PASS | 2532 | 0 |
| I-10 | ✅ PASS | 2532 | 0 |
| I-11 | ✅ PASS | 2532 | 0 |
| I-12 | ✅ PASS | 2532 | 0 |
| I-13 | ✅ PASS | 2532 | 0 |
| I-14 | ✅ PASS | 2532 | 0 |
| I-15 | ✅ PASS | 2532 | 0 |
| I-16 | ✅ PASS | 2532 | 0 |
| I-17 | ✅ PASS | 2532 | 0 |
| I-18 | ✅ PASS | 2532 | 0 |
| I-19 | ✅ PASS | 2532 | 0 |
| I-20 | ✅ PASS | 2532 | 0 |

---
## 2. Race Scenarios Execution Matrix

| Scenario ID | Status | Iters | Violations | Rate (%) | P50 (ms) | P99 (ms) | Invariants Failed |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `RC-F-01` | ✅ PASS | 26 | 0 | 0.0% | 6.81 | 55.69 | None |
| `RC-F-02` | ✅ PASS | 5 | 0 | 0.0% | 1.34 | 2.14 | None |
| `RC-F-03` | ✅ PASS | 26 | 0 | 0.0% | 6.62 | 55.44 | None |
| `RC-F-04` | ✅ PASS | 5 | 0 | 0.0% | 0.13 | 0.27 | None |
| `RC-F-05` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-F-06` | ✅ PASS | 5 | 0 | 0.0% | 1.52 | 1.81 | None |
| `RC-F-07` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-F-08` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-F-09` | ✅ PASS | 5 | 0 | 0.0% | 13.92 | 16.63 | None |
| `RC-A-01` | ✅ PASS | 5 | 0 | 0.0% | 2.98 | 3.42 | None |
| `RC-A-02` | ✅ PASS | 26 | 0 | 0.0% | 6.49 | 57.55 | None |
| `RC-A-03` | ✅ PASS | 5 | 0 | 0.0% | 1.99 | 2.75 | None |
| `RC-A-04` | ✅ PASS | 5 | 0 | 0.0% | 2.23 | 2.61 | None |
| `RC-A-05` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-A-06` | ✅ PASS | 5 | 0 | 0.0% | 1.27 | 4.94 | None |
| `RC-A-07` | ✅ PASS | 5 | 0 | 0.0% | 2.27 | 4.6 | None |
| `RC-A-08` | ✅ PASS | 5 | 0 | 0.0% | 1.7 | 1.76 | None |
| `RC-A-09` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-A-10` | ✅ PASS | 5 | 0 | 0.0% | 0.62 | 0.7 | None |
| `RC-R-01` | ✅ PASS | 5 | 0 | 0.0% | 0.71 | 0.75 | None |
| `RC-R-02` | ✅ PASS | 5 | 0 | 0.0% | 0.07 | 0.07 | None |
| `RC-R-03` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-R-04` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-R-05` | ✅ PASS | 5 | 0 | 0.0% | 0.32 | 0.34 | None |
| `RC-R-06` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-R-07` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-R-08` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-R-09` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-R-10` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-E-01` | ✅ PASS | 5 | 0 | 0.0% | 0.2 | 0.23 | None |
| `RC-E-02` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-E-03` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-E-04` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-E-05` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-E-06` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-E-07` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-E-08` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-E-09` | ✅ PASS | 5 | 0 | 0.0% | 19.29 | 32.75 | None |
| `RC-E-10` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-P-01` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-P-02` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-P-03` | ✅ PASS | 5 | 0 | 0.0% | 21.87 | 37.8 | None |
| `RC-P-04` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-P-05` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-P-06` | ✅ PASS | 5 | 0 | 0.0% | 9.24 | 17.76 | None |
| `RC-P-07` | ✅ PASS | 5 | 0 | 0.0% | 64.57 | 104.91 | None |
| `RC-P-08` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-P-09` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-P-10` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-M-01` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-M-02` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-M-03` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-M-04` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-M-05` | ✅ PASS | 5 | 0 | 0.0% | 19.23 | 22.35 | None |
| `RC-M-06` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-M-07` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-M-08` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-M-09` | ✅ PASS | 5 | 0 | 0.0% | 23.56 | 27.09 | None |
| `RC-M-10` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-M-11` | ✅ PASS | 5 | 0 | 0.0% | 13.37 | 14.99 | None |
| `RC-M-12` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-D-01` | ✅ PASS | 5 | 0 | 0.0% | 0.6 | 0.68 | None |
| `RC-D-02` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-D-03` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-D-04` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-D-05` | ✅ PASS | 5 | 0 | 0.0% | 13.86 | 24.03 | None |
| `RC-D-06` | ✅ PASS | 5 | 0 | 0.0% | 17.7 | 20.36 | None |
| `RC-D-07` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-D-08` | ✅ PASS | 5 | 0 | 0.0% | 12.96 | 17.15 | None |
| `RC-D-09` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-D-10` | ✅ PASS | 5 | 0 | 0.0% | 25.27 | 31.78 | None |
| `RC-D-11` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-D-12` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-D-13` | ✅ PASS | 5 | 0 | 0.0% | 12.12 | 13.26 | None |
| `RC-H-01` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-H-02` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-H-03` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-H-04` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-H-05` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-H-06` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-H-07` | ✅ PASS | 5 | 0 | 0.0% | 7.9 | 12.36 | None |
| `RC-H-08` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-H-09` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-H-10` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-H-11` | ✅ PASS | 5 | 0 | 0.0% | 11.05 | 16.52 | None |
| `RC-C-01` | ✅ PASS | 5 | 0 | 0.0% | 0.17 | 0.18 | None |
| `RC-C-02` | ✅ PASS | 5 | 0 | 0.0% | 12.43 | 14.53 | None |
| `RC-C-03` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-C-04` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-C-05` | ✅ PASS | 5 | 0 | 0.0% | 6.67 | 10.71 | None |
| `RC-C-06` | ✅ PASS | 5 | 0 | 0.0% | 4.95 | 7.3 | None |
| `RC-C-07` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-C-08` | ✅ PASS | 5 | 0 | 0.0% | 24.28 | 34.26 | None |
| `RC-C-09` | ✅ PASS | 5 | 0 | 0.0% | 18.67 | 25.19 | None |
| `RC-C-10` | ✅ PASS | 5 | 0 | 0.0% | 2.83 | 3.37 | None |
| `RC-C-11` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-C-12` | ✅ PASS | 5 | 0 | 0.0% | 21.63 | 29.08 | None |
| `RC-C-13` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-L-01` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-L-02` | ✅ PASS | 5 | 0 | 0.0% | 10.71 | 11.91 | None |
| `RC-L-03` | ✅ PASS | 5 | 0 | 0.0% | 12.52 | 16.72 | None |
| `RC-L-04` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-L-05` | ✅ PASS | 5 | 0 | 0.0% | 9.62 | 13.02 | None |
| `RC-L-06` | ✅ PASS | 5 | 0 | 0.0% | 11.07 | 11.91 | None |
| `RC-L-07` | ✅ PASS | 5 | 0 | 0.0% | 8.22 | 10.49 | None |
| `RC-O-01` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-O-02` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-O-03` | ✅ PASS | 5 | 0 | 0.0% | 46.02 | 47.66 | None |
| `RC-O-04` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-O-05` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-O-06` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |
| `RC-O-07` | ✅ PASS | 5 | 0 | 0.0% | 70.1 | 88.42 | None |
| `RC-O-08` | ✅ PASS | 5 | 0 | 0.0% | 14.97 | 23.27 | None |
| `RC-O-09` | ✅ PASS | 5 | 0 | 0.0% | 0.0 | 0.0 | None |