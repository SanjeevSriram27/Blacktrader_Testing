# Active PAMM task, phase 3
User explicitly instructed: use internal browser; admin may change QA deposits, account settings and create needed setup; test all site capabilities; leave existing issue claims; resolve partials to pass/fail where evidence permits. Earlier user confirmed simulated QA funds/trades. No subagents authorized.

## Browser recovered!
Use `tools.mcp__node_repl__js` through functions.exec. Initialized:
- browserRuntime import `/Users/jarvis/.codex/plugins/cache/openai-bundled/browser/26.1111.71704/scripts/browser-client.mjs`, `agent = await browserRuntime.setupBrowserRuntime()`.
- `browser = await agent.browsers.get('2')` (internal browser). Read `browser.documentation()` already. Use documented API only; evaluate is DOM read-only. No browser network/CDP capability exposed: tab caps pageAssets/webmcp, browser caps visibility/viewport. Standalone Chrome still cannot launch.
- tabs: clientTab id1 now logged into newly created isolated QA master; adminTab id2 admin portal; user report tab3; configTab extra admin tab (trading terms / new group saved); apiTab developer docs (`/api`) now PAMM allocation statement.
- `fs` node fs/promises, `outputDir` absolute outputs/PAMM_Functional_Assessment.
- `fixtureTag`, `fixtureMasterEmail`, `fixturePassword` vars (do not print password). Private credentials in `work/admin-fixture-credentials.json` mode600.
- `uiResults` array; `uiRecord(ids, boolean_or_status, actual, evidencePath, details={})` writes evidence/internal-browser-results.json. Latest per case wins; some initial harness FAIL records were corrected and should not be reported as product bugs.
- `fixturePublic`, `verifiedRows`, `visibleAllocations`, `expectedNames` etc from 500 UI reconciliation.

## Crucial correction from site docs
`/api#docs/pammUnfollow` explicitly documents payout rounded to 2 decimal places. Initial PAMM-FUNC-001 proposed sub-cent principal issue is DOCUMENTED behavior, not a confirmed product bug. Told user this in commentary; must update NEW_BUGS.md, two PAMM-BND cases expected/result, report summaries. Retain original observation/history and reason for correction. Evidence/site-pamm-unfollow-contract.txt and site-pamm-join-contract.txt saved. No active confirmed new bug yet.
PAMM allocations API docs: limit default50, max500; >500 reverts to50. offset supported. Some old drivers used limit1000, causing truncated baseline and false raw FAILs. Fixed scale driver to correlate allocation trade_id with closed history row via position_id (history.order_id is closing order, not opening order). Original raw attempts retained; do not report as bugs. Update future drivers to limit500 and pagination.

## New fixtures (separate from original 11 accounts)
Admin UI created master `pammqa.20261119.f452cc.master@mailinator.com`, member mem_213a4f8527442ecc79, public 3f75a647-2aba-4e61-96f6-cf844bc0ee47. Funded 20000 through admin Set balance real UI. Client UI registered PAMM QA Isolated Pool at20%. Original ten-account pool untouched in this phase.
- evidence/admin-scale-fixture.json manifest lists 500 new QA followers, funded2000 each via admin balance API, all joined isolated QA master.
- first100 pooled177150 exact cents. #1 deposit1000, #3 575; other98 about1791.58/59 to reach177150. Reference claim all deposits<=1100 is internally impossible for177150; record fixture correction transparently.
- next400 deposited100 each, so 500 total217150. For C002 reference random deposits>=500, can reconfigure these through admin if desired; observed 500 completeness already passed, but CPU<40%, single DB transaction and internal<150ms are UNVERIFIED. Must not mark full C002 PASS solely on count.
- Current isolated500 fixture flat, no pending orders, subscriptions retained as reusable QA test data.
- additional 13 accounts in fixture.other: directoryA..I (9 managers), netmaster, netinvestor, feeinvestor, riskinvestor. All created and funded via scripts/admin-extra-fixtures.cjs. Net actors real-net, others real. Directory masters/netmaster registered20%, mastersfund20000, investors5000. Assigned isolated group qa_f452cc.
- isolated group PAMM QA Isolated Terms created via admin UI: default leverage100, No brokerage, no parent. Does not change Standard or other users. Master500 still Standard; extra actors assigned QA group.
- Scripts credentials use original project.env privately plus private fixture password only where account creation necessary. Do not copy secrets into outputs.

## Completed new work
- scripts/admin-scale-fixture.cjs target100 then FOLLOWERS_TARGET500 (all ready).
- scripts/scale-assessment.cjs default100: corrected latest run PASS observable100 allocation completeness twice, first parent+145, second-5, all weights100%, arithmetic matches. evidence/scale-100-results.json, final-state. Raw first attempts in scale-100-attempt-1/2.json contain harness failures (unfiltered old allocations; wrong history correlation). Ignore these as product bugs.
- SCALE_SIZE500 same script: parent about-22; all500 investor APIs returned one unique allocation. evidence/scale-500-results.json and final-state. Master endpoint querylimit1000 returned50 but individualinvestor reconciliation proved500; UI shows500.
- UI verified 500 investor table rows and500 allocation rows; all500 names/PnL/shared/running matched individual API records after mapping member IDs through manifest (individual API omits follower_name). evidence/ui-allocation-reconciliation.json, ui-500-investor-pool.jpg. Initial false all500 mismatch corrected latestUI PASS.
- UI new widget via Add widget; fresh Run a pool creation,20% saved; manager directory/subscription navigation; maximise/restore original rect, clean unmount/reopen widget; reload persisted saved manager.
- BTPAMM-F015 must remain PARTIAL for zero-detached-memory-nodes requirement (functional lifecycle passed; no heap instrumentation). uiRecord latest PARTIAL.
- Unsaved Settings toggle retains draft, but does NOT save; afterreload originalname remains. Case X15-06 latestPASS, record distinction; no bug.
- admin member search supports publicUUID andemail; internal mem_ ID not searchable. X19-02/03 latestPASS using corrected fixture; explain change from internalID expectation.
- X19-06 latestPARTIAL pending checking admin Chart link path to same pool summary (not solely client evidence).

## Latest browser state / next actions
adminTab was refreshed, People menu expanded/collapsed but Members page content loaded1357 total. Filter is fixtureTag+'.directoryc@mailinator.com'. Clicked Actions then menuitem `Chart link Open workspace as this member (trade, positions, orders)`; last snapshot showed loading. It should open embedded workspace modal for risk actor C, ideal for viewing margin-call UI without logging out master.
configTab currently trading terms list showing new QA group. Browser source UI API memberProfile: rowmembercellclick opens details; Allmembers goes back. Setbalance buttons nth0 paper, nth1real; genericspinbuttonfirst insideedit isbalance. Stop-out per-account input ariaLabel Stop-out level percent, Save. Avoid changing global feed, Standardgroup, installedversion, LP provider; there are unrelated A-book positions on platform.
clientTab at isolated500 master, PAMM My subscription500. Broker settings: enabledReal Hedging plusPaper. Trades header has All / Real(Hedging)LIVE / Paper. To make UI one-click trades target onlyReal, disablePaper in Broker settings first. Closing broker modal worked via last button named Close; backdrop Close Broker Settings did not close reliably. No currentopenexposure.
apiTab now GET PAMM allocation statement with exact pagination docs. Need save full main text (saved), inspect PAMM master/follows docs for supported controls and absentNAV/unit/HWM functions. Only6 PAMM endpoints listed. No NAV/rollover/partialwithdraw/AUM route listed. Site docs settle-on-exit, `running_pnl` closed trades. Do not pretend undocumented DB/LP/infra can be certified through UI.

## Remaining requested work
1. Finish UI outstanding cases with internalbrowser: directory26pools publication/sorting; settings validation; actual selectedinstance routing; followerlogin feeinvestor or500f001 for histories, leave/cancel/rejoin, agreedfee, refresh/accountswitch; admin trades filters/date/routing/settlement audit. Multi-tab refresh/navigation/close races through actual UI possible. Internalbrowser lacks documentedCDP throttling; retain only those fault tests requiringmissingcontrol asblocked, not wholebrowser.
2. Use extra actors to run real-net pending/protection tests, fee0/fullfee positive settlements, accountmargin/stopout via adminforcebalance in isolated riskC (NOT original accounts). Can create paused script gate to view riskC margin-call before forcingstopout. API admin balance accepts force:true. Newgroup leverage100 no fees; peraccount stop-out POST /admin/api/members/{id}/stop-out {stop_out_level:50}. Restoreisolated balances/config after flat. Never routeA-book actualexternaltrades.
3. Largecapital fixtures via admin may clear10M sizing; set isolatedunusedmanager balance10000000 safely; actual brokerquote requires live instrument. User authorizes newsetup.
4. Resolve advancedfeatures against actualAPI/UIcontract, not genericmissingfixtures. Preserve complete349percase outcomes; unsupported/internalunobservable features remain honestlyunverified with concreteevidence.
5. Update report builder. Current scripts/build-all-case-results.py rebuilds old176+new53 cases and applies hardcodedpartial/block overrides. Do NOT simply rerun to losephase3 data. Add newfiles merging and postoverride phase3patch or new postprocessor. reportCSV/JSON/Markdown/HTML, ASSESSMENT/README/NEW_BUGS/summary all need finalphase3update. Current summary still165pass,2fail,29partial,149blocked,4inconclusive (stale). Newrawresults sofar not merged.
6. Add new fixturemanifest and explicituserauthorizedsetupchanges,originalpool unchanged, noopenexposure finalchecks bothoriginalandnewmasters. Keep QA fixtures identified/reusable; no permanentdeletion withoutneed.
7. Need final screenshots via browser, mark user report tabdeliverable; temporaryextratabsclose, existinguserportal/admin keepopen. No CUA namespace available, so no completion_summary tool possible; usebrowserclientnormalAPI.

## Files
All deliverables outputs/PAMM_Functional_Assessment. Earlier all349case results valid asbaseline. Work PHASE3_STATE is scratch, do not link outside outputs in final.
