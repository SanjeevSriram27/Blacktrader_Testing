# Internal-browser and admin-fixture follow-up

All349 scenarios have a result row. Current totals are218 PASS,24 PARTIAL,101 BLOCKED and6 INCONCLUSIVE; zero current FAIL.71 rows changed status from the phase2 snapshot. This is an assessment of observed behavior, not a complete certification of every reference requirement.

## Work completed

- Recovered the internal browser and used actual UI interactions for manager creation, widget lifecycle, directory publication/ranks, fee validation, investor join/exit/cancel/history, reloads, two-tab close races and admin filtering.
- Used the authorized admin functionality to create an isolated master,500 funded investors and13 additional role/risk/netting actors. Created a separate terms group and one extra Real Hedging account. No global feed/provider/routing settings or unrelated users were changed.
-100-investor pool:177150 principal, independently calculated unequal weights and allocations on winning+145 and losing−5 parent closes. Each close produced100 unique eligible allocations.
-500-investor pool:217150 principal; each individual investor API returned one new allocation for the scale close. All500 displayed allocation rows matched independent investor evidence.
- Exact1000-dollar join/cash debit, positive-profit0% manager fee (PNL4.20,payout1004.20), positive-profit100% fee (PNL3.20,fee3.20,payout1000), and exact2000 exit/rejoin with distinct subscription IDs.
- Current Real-Net pending LIMIT creation/cancel and position SL/TP readback passed. The historical reference restriction was disclosed rather than treated as a new bug.
- Admin-funded10-million-dollar QA manager opened and closed a100-unit BTC block. A separate isolated PAMM manager was temporarily switched to A-book and routed BLACK:XAUUSD through the active Black exchange bridge. The exact100-lot EURUSD/multi-tier portion remains partial.
- Margin Call UI observed below100%, new order rejected by the margin guard; automatic stop-out below50%. Unequal-position test closed the most unprofitable position first and halted with one position remaining at147.01% margin.
- Actual two-tab Close Position clicks produced one closing history row and one close fill, with no reverse position. Buy/reload, close/reload, close-tab-after-buy, navigation and independently admin-issued session recovery reconciled.
- Follower refresh after parent UI close showed running−10.70 and exit estimate989.30 on1000 principal, matching independent API evidence. Pending LIMIT survived reload with the same order ID,quantity0.001 and price45000, then was cancelled.
- Admin closed-trade table matched all9 observed QA manager OMS rows; account filter retained the correct rows; UTC18Nov excluded all trades and inclusive19Nov restored them. Native accessibility input was used because synthetic fill had not committed the date controls.

## Why some results still cannot be a full pass or fail

The browser is available. Actual offline/packet-loss/Slow3G/reordered-response cases require a network-fault control not exposed by the documented internal-browser interface. Cached standalone Chromium, its headless shell and system Chrome still abort on launch. Presentation visibility is not equivalent to document visibility: the attempted hidden-browser check kept `document.visibilityState=visible`, so that row stays partial.

Admin funding removed the former ten-investor and capital limits. A-book connectivity and ordinary Black exchange execution are now verified, but the exposed controls cannot safely force exact partial fills,requotes,out-of-order reports or a provider outage. It also does not establish exact controlled PNL, news/spread paths, Wednesday rollover, rollover clocks, database transaction boundaries, internal ledger timing, CPU or queue/lock behavior. The100/500 functional allocation checks passed, while cases requiring<80ms/<150ms internal processing,CPU<40%,single database transaction or a19-trade ledger audit remain partial. Email dispatch and zero detached memory nodes also remain unverified.

Admin UI and the site's developer catalog were inspected. The exposed PAMM contract covers manager directory/settings,membership,join,unfollow and closed-trade allocations. It documents settlement on exit and2-decimal payout rounding. NAV/unit rollovers,HWM/AUM billing,reserve postings,scheduled and SRE/internal assertions were not established through authoritative evidence. Missing catalog entries are not proof that hidden modules do not exist; those rows remain explicitly unverified. User confirmation that all capabilities exist is retained, but cannot replace an executed observation.

The Free tier was rejected by the deployed plan endpoint as an inactive tier; original plan restoration is recorded. The existing consolidated payout-route404 remains excluded from new bug reporting.

## Fixture and expectation corrections

The supplied100-investor reference combines total177150 with all individual deposits at most1100. Those conditions cannot both hold. The isolated fixture preserves total177150,first deposit1000 and third575; the other98 were adjusted to approximately1791.58/59. Actual parent PNL+145 and−5 were used for independently calculated proportional allocations. These are disclosed fixture substitutions, not exact reproduction of every sample value.

The500 fixture uses the first100 deposits plus400 deposits of100. It does not reproduce the reference random500–50000 distribution or+5000 winning close. The observable500-investor allocation branch passed; the complete performance case remains partial.

Member search accepts public account UUID/email; the internal `mem_` identifier is a different field. Search cases disclose that fixture correction. Native minus-entry sanitization and native range validation are distinguished from API rejection. Original expectations are retained when the current deployed contract differs.

## Finding correction and final state

The proposed fractional-cent payout bug was withdrawn: the documented unfollow formula explicitly rounds payouts to2 decimals. Both boundary observations match that contract. No existing issue was filed again. See [finding disposition](NEW_BUGS.md).

The final audit reads the original11 accounts and14 isolated actors (including the scale master). All are flat with no pending orders. Original PM Master remains at10 investors and1000 pooled principal with20% fee. Original accounts were not modified in this follow-up; earlier test PNL remains in their historical balances. The isolated500-investor fixture is retained for reuse. Temporary relationships used by fee/risk cases were closed. Simulated account balances retain actual QA PNL and authorized setup adjustments rather than erasing their history.

Evidence: [final audit](evidence/phase3-final-state.json), [fixture manifest](evidence/admin-scale-fixture.json), [all UI results](evidence/internal-browser-results.json), [status transitions](evidence/phase3-status-transitions.json), [100-investor run](evidence/scale-100-results.json), [500-investor run](evidence/scale-500-results.json), [stop-out ordering](evidence/risk-unequal-results.json).


## Continuation on 20 November

The continuation executed the remaining feasible capital and concurrency fixtures. A 50000-dollar pool accepted a 100000-dollar mid-trade deposit, increasing principal to150000. The earlier trade allocated only to the original investor; the next trade allocated33.333333%/66.666667% to the original investor and whale. The result parser initially referenced wrong field names; the retained allocation records use `follower` and `percentage`. That mapping is corrected, with the original raw attempt preserved.

One hundred concurrent0.10 BUY orders created100 positions. Used margin6394.33 matched both the sum of position margins and an independent entry-price×quantity/100 calculation. All100 positions were closed. Ten simultaneous1000-dollar deposits committed within102ms and produced exactly10 memberships/10000 principal. Fifty simultaneous joins raced3 rapid market orders: all50 joins and3 orders succeeded. The observable concurrency branch passed; the full database-isolation requirement remains partial.

A previously stopped-out manager received3 fresh5000-dollar investments. Free margin restored exactly15000, a new trade opened/closed, and prior history remained intact. Fifty QA investors temporarily moved for these tests were restored to the scale pool; the manifest contains their current subscription IDs. Original11 supplied accounts were untouched.

The client portal's actual Account selector resolved the prior account-switch gap. The alternate Real Hedging account showed zero balance and no subscription. Switching back through its confirmation restored the primary balance49003.74 and its separate1000-dollar subscription. That temporary subscription was then settled for1000 with zero fee. The earlier direct chart link omitted the portal's account selector; this was a test-navigation gap, not a product defect.

An admin goodwill adjustment credited exactly100 and included the audit remark; before50003.74,after50103.74. Corporate-treasury debit and immutable audit-note assertions remain partial because the observed response does not establish them. Logout from a populated account view worked, but an exact delayed read spanning logout was not injected, so that reference branch remains partial.

Evidence: [whale/100-order run](evidence/whale-margin-results.json), [deposit storm and recovery](evidence/storm-recovery-results.json), [primary after switching](evidence/ui-primary-after-account-switch.txt), [alternate isolation](evidence/ui-alternate-account-isolation.txt), [goodwill adjustment](evidence/goodwill-results.json). The final25-account audit confirms flat positions,no pending orders,original10 investors/1000 principal and restored500 investors/217150 principal.

## A-book liquidity-provider follow-up

Isolated Manager I was changed from B-book to A-book through Admin > Members. The Liquidity page identified Black exchange as active/up. With50000 pooled principal, one BLACK:XAUUSD parent market order filled and mounted exactly once. Twenty concurrent0.01-lot market orders all filled, with zero429 responses. A valid-size10-lot order reached the LP and returned `the liquidity provider rejected the order: Not enough margin!`; no position mounted and no pool capital remained locked. An A-book LIMIT order also persisted under its original ID and was cancelled cleanly.

These observations move A001,E013,P007 andP009 to PASS, and P015 from BLOCKED to PARTIAL because OMS history still does not expose a distinct LP fill ID/blotter mapping. Exact partial-fill,VWAP,requote,slippage,message-ordering,IOC/FOK and failover rows remain BLOCKED pending a scoped LP event-injection control. Manager I was flat,had no pending orders,had its temporary follower settled and was restored to B-book after testing.

Evidence: [A-book API run](evidence/abook-lp-results.json), [admin routing observation](evidence/abook-ui-observation.txt).
