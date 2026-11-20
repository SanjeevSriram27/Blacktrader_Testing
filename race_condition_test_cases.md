# BlackTrader Race Condition Test Cases (50 Scenarios Added to Master Spec)

Appended as **Modules 12–15** to [PAMM_Master_Test_Scenarios_Go_Live.docx](file:///Users/jarvis/Documents/lpadmin.blacktrader/PAM,MAM%20test%20scripts/docs/PAMM_Master_Test_Scenarios_Go_Live.docx) (**Total: 215 Scenarios** = 165 PAMM + 50 Race Condition).

## Priority Scenarios to Start With
1. **NET03** — Disconnect immediately after BUY (`P0`)
2. **NET07** — Click Close Position repeatedly on slow internet (`P0`)
3. **BR07** — Two tabs close same position simultaneously (`P0`)
4. **BR08** — Chrome switches broker → Edge places order (`P0`)
5. **CP04** — Follower clicks Unfollow on slow internet → Master places BUY (`P0`)
6. **AL07** — Stop Algo → Immediately restart (`P0`)

## Full Catalog Added to Master Test Spec
- **Module 12 — Slow Internet (`NET01`–`NET15`):** 15 scenarios (12 P0, 3 P1)
- **Module 13 — Browser Switching & Multi-Tab (`BR01`–`BR15`):** 15 scenarios (10 P0, 5 P1)
- **Module 14 — Copy Trading / PAMM Concurrency (`CP01`–`CP10`):** 10 scenarios (9 P0, 1 P1)
- **Module 15 — Algo Trading Concurrency (`AL01`–`AL10`):** 10 scenarios (9 P0, 1 P1)
