import json,csv,pathlib,collections,html,re,datetime
ROOT=pathlib.Path(__file__).resolve().parents[1];EV=ROOT/'evidence'
def read(p):return json.loads((ROOT/p).read_text())
if not (EV/'previous-case-statuses.json').exists():
 (EV/'previous-case-statuses.json').write_text((ROOT/'test-cases.json').read_text())
 (EV/'previous-summary.json').write_text((ROOT/'summary.json').read_text())
cases=read('evidence/previous-case-statuses.json');reviewed=read('reviewed-checks.json');manual=read('manual-observations.json')
new_files=['remaining-results.json','reporting-plan-results.json','fee-profit-results.json','membership-race-results.json','final-audit-results.json']
reviewed=[r for r in reviewed if pathlib.Path(r.get('evidence','')).name not in new_files]
new=[]
for f in new_files:
 d=read('evidence/'+f)
 for r in d['results']:new.append({**r,'evidence':'evidence/'+f,'raw_status':r['status'],'review_note':''})
combined=reviewed+new
latest={r['id']:r for r in combined}
manual_by={r['id']:r for r in manual}
def compact(d):
 if not d:return 'The stored assertion passed; this record contains no separate numeric detail. The linked request/response log is retained.'
 s=json.dumps(d,ensure_ascii=False,separators=(', ',': '))
 return s if len(s)<1400 else s[:1400]+' … Full values are in the linked evidence record.'
def record_for(i):return latest.get(i) or manual_by.get(i)
def refs(*ids):return [record_for(i) for i in ids if record_for(i)]
# Each alias explicitly identifies the narrower evidence used; nothing is passed just because it has a similar title.
aliases={
 'PAMM-X06-02':['EXEC-SELL-POSITION','EXEC-SELL-CLOSE'],
 'PAMM-X07-03':['PENDING-BUY-STOP'], 'PAMM-X07-04':['PENDING-SELL-STOP'],
 'PAMM-X10-08':['EXIT-CLOSE-TIMING--20','EXIT-CLOSE-TIMING-0','EXIT-CLOSE-TIMING-20'],
 'PAMM-X11-03':['FEE-BOUNDARY-12.5','FEE-RETAINED-12.5'],
 'PAMM-X11-10':['FEE-CASH-RECONCILIATION-0','FEE-CASH-RECONCILIATION-100'],
 'PAMM-X14-04':['DEPOSIT-PRECISION-100.01','REDEEM-PRECISION-100.01'],
 'PAMM-X14-07':['ALLOCATION-CYCLE-COMPLETENESS'],
 'PAMM-X14-08':['ALLOCATION-CYCLE-POOL-WEIGHTS'],
 'BTPAMM-F006':['BTPAMM-F006-master','BTPAMM-F006-join'],
 'BTPAMM-F008':['ROLE-FOLLOWER-CANNOT-MASTER'],
 'BTPAMM-E001':['PAMM-X06-01','EXEC-BUY-CLOSE'],
 'BTPAMM-E002':['PAMM-X07-01','PAMM-X07-02'],
 'BTPAMM-E004':['PAMM-X08-01','PAMM-X08-02','PAMM-X08-07','PAMM-X08-08'],
 'BTPAMM-E006':['PARTIAL-HALF-CLOSE'],
 'BTPAMM-E008':['PAMM-X07-05'],
 'BTPAMM-D005':['PAMM-X10-01'],
 'BTPAMM-C004':['EXIT-CLOSE-TIMING--20','EXIT-CLOSE-TIMING-0','EXIT-CLOSE-TIMING-20'],
 'BTPAMM-C005':['PAMM-X10-03','PAMM-X10-04'],
 'BTPAMM-A013':['PAMM-X05-07'], 'BTPAMM-A014':['PAMM-X05-01'],
}
assertion_outcomes={
 'BTPAMM-A013':'Each returned follower allocation row matched a master-view allocation with the same allocation ID and shared PNL.',
 'PAMM-X01-05':'All ten active pamm_id values were distinct.',
 'PAMM-X01-06':'All ten active investor member IDs were distinct.',
 'PAMM-X01-07':'Every row in pool_history had status closed; active pool membership was kept separately.',
 'PAMM-X01-09':'Directory fund equalled the active pool deposit total: 1000.',
 'PAMM-X01-10':'Directory followers equalled the number of active pool investors: 10.',
 'PAMM-X04-10':'Saving identical manager settings twice left exactly one directory entry for the supplied master.',
 'PAMM-X05-02':'No duplicate trade_id/pamm_id pair was detected in the returned master allocation rows.',
 'PAMM-X05-03':'Every returned percentage matched deposit / pool_total × 100 within 0.000001 percentage points.',
 'PAMM-X05-04':'Each returned shared PNL matched order PNL × percentage / 100 within the applied 0.005001 rounding tolerance.',
 'PAMM-X05-05':'Every returned allocation timestamp parsed as a valid date/time.',
 'PAMM-X05-06':'Every returned master-view allocation identified the supplied master member ID.',
 'PAMM-X05-07':'Each returned follower allocation matched a master allocation by alloc_id and shared_pnl.',
 'PAMM-X05-08':'Initial historical settlement payout plus fee matched principal plus running PNL within the applied 0.011 tolerance. Later sub-cent principal cases are reported separately.',
 'PAMM-X05-09':'Every nonprofitable settlement in the initial history had final_master_share equal to zero.',
 'PAMM-X05-10':'Every initial closed subscription retained a finite numeric share_percent snapshot.',
 'PAMM-X06-06':'All ten supplied follower position reads were empty while the master test position was open.',
 'PAMM-X09-08':'After concurrently closing two different owned positions, the master position list was empty.',
 'PAMM-X18-02':'Directory ranks were nondecreasing in the returned order; tied ranks were allowed.',
 'PAMM-X18-03':'The supplied master had nonnegative follower and trade counts.',
 'PAMM-X18-04':'The supplied manager share was 20 percent and within the 0–100 bounds.',
 'PAMM-X18-05':'Master cash balance and active pool_total were finite numeric values.',
 'PAMM-X18-06':'Every closed relationship ended at or after its recorded join time.',
 'PAMM-X18-07':'No active pamm_id also appeared as a closed pool_history pamm_id.',
 'PAMM-X18-09':'After invalid or margin-rejected order tests, the active pool principal remained 1000.'
}

# Full reference fixtures were not recreated. These rows report the actual narrower observation explicitly.
partial={
 'BTPAMM-F001':('The PAMM widget was already mounted and its tabs were observed. Creating a fresh widget through Add widget was not exercised.','Browser control must launch and the saved widget must be removed/re-added.'),
 'BTPAMM-F002':('The master directory and My subscription tabs were navigated manually in the first session. No saved per-transition assertion or screenshot series exists.','Repeat and capture both transitions in a working browser.'),
 'BTPAMM-F007':('Master Invest buttons were disabled and a self-follow attempt was rejected. Joining another supplied independent manager was not attempted.','A second authorized QA manager and working browser for the tooltip/UI branch.'),
 'BTPAMM-F009':('The supplied investor joined with 100 test dollars and cash debit was verified. The reference 1000-dollar join was not reproduced.','An isolated investor with sufficient available cash for the exact 1000-dollar fixture.'),
 'BTPAMM-F012':('PM Master was returned by the directory API, and the follower directory showed its fee, fund and investor count. The complete nine-column publication fixture was not separately asserted.','Working browser for a captured directory layout assertion using the specified manager fixture.'),
 'BTPAMM-F013':('API manager IDs were unique and ranks were nondecreasing; ties were accepted. UI sorting/pagination with 25 pools was not exercised.','Working browser and at least 25 QA-directory pools or a supported pagination fixture.'),
 'BTPAMM-F014':('API fees -1 and 101 were rejected. Browser entry of -1 was sanitized to 1 before Save; the fee was restored. The complete client-validation policy is not confirmed.','Confirm signed-input sanitization policy and rerun both UI bounds in a working browser.'),
 'BTPAMM-A001':('One parent simulated trade and ten allocation rows were observed, with no follower child positions. Liquidity-provider bridge tickets were unavailable.','Bridge blotter proving one LP block ticket and no child bridge orders.'),
 'BTPAMM-A002':('Supplied ten-account equal/unequal allocation weights were verified, including 99/101-dollar investors. The reference 100-follower fixture was unavailable.','The authorized 100-follower deposit fixture and its independent allocation baseline.'),
 'BTPAMM-A003':('Allocation percentages summed to 100 percent for the supplied ten-investor fixture. The reference 100-investor pool was not tested.','The reference 100-investor fixture for its exact conservation assertion.'),
 'BTPAMM-A004':('A +0.50 parent trade produced ten +0.05 investor allocations. The reference 100-investor +10.63 distribution fixture was not recreated.','100 authorized investors and deterministic +10.63 parent PNL or equivalent controlled fixture.'),
 'BTPAMM-A005':('Losing settlements charged zero manager fee and historical negative allocation rows exist. The exact reference losing-trade distribution across 100 investors was not reproduced.','A controlled losing parent trade and the full reference 100-investor expected matrix.'),
 'BTPAMM-A015':('Repeated 100-dollar rejoins created a new active ID and preserved closed history. The 2000-dollar/HWM-baseline portion is unverified.','An isolated 2000-dollar funded investor and product-supported HWM baseline readout.'),
 'BTPAMM-D001':('The supplied investor successfully joined while a parent position was open; late-join allocation eligibility was checked separately. The original larger deposit fixture was not reproduced.','Exact reference funding fixture and confirmation of mid-cycle deposit policy.'),
 'BTPAMM-D009':('Two supplied investors concurrently joined with 99 and 101 dollars and independent membership/fund effects were observed. Larger reference deposit bursts were not executed.','The reference number of authorized depositors and required capital fixture.'),
 'BTPAMM-D013':('Two investors exited concurrently in a flat account and payouts reconciled. A high-volatility withdrawal window was not controlled.','Controlled volatility feed and a supported withdrawal window fixture.'),
 'BTPAMM-D014':('Repeated re-subscription worked for an active QA investor with closed history. No deliberately dormant account fixture was used.','A QA account meeting the deployment\'s documented dormancy threshold.'),
 'BTPAMM-E013':('No child positions appeared in the ten followers during a pooled parent trade. The LP bridge ticket stream was not accessible.','Broker bridge execution logs for sub-lot child-ticket exclusion.'),
 'PAMM-X06-01':('A 0.001 BUY filled and closed correctly. Micro-PNL did not establish the case\'s additional allocation-set condition; a separate larger profitable cycle did.','A controlled 0.001 trade with distributable nonzero PNL and its allocation records.'),
 'PAMM-X15-09':('The manager allocation table was visible with investor, trade PNL, pool and percentage columns. A full latest-row comparison after all subsequent trades was not captured.','Working browser for a fresh row-by-row comparison against the current API.'),
 'PAMM-X19-02':('The supplied master was visible in the admin member table. Member-ID search was not exercised.','Working browser to search the specified master member ID.'),
 'PAMM-X19-03':('The supplied follower was visible in the admin member table. Member-ID search was not exercised.','Working browser to search the specified follower member ID.'),
 'PAMM-X20-09':('Independent master API sessions agreed after settlement. Actual browser refresh in two sessions was not executed.','Two independently controlled browser contexts with working Chromium.'),
}
# Concrete blockers for fixtures and capabilities absent from this task.
blocked={
 'BTPAMM-F003':('The supplied master already manages a pool; all ten supplied investors have follow history and cannot become managers. The Become a manager UI path was not executed.','A fresh eligible QA account with no master/follower history, plus a working browser.'),
 'BTPAMM-F005':('Instance-dropdown account binding is a browser interaction and the browser cannot launch in this session.','Working Chromium/browser-control session and a captured account-selector/broker-routing trace.'),
 'BTPAMM-F015':('Dock minimize, maximize, restore and close were not executed through a working controlled browser.','Working browser plus lifecycle/memory instrumentation for the requested detached-node assertion.'),
 'BTPAMM-A006':('No separately committed manager co-investment ledger was provisioned; the supplied pool has investor deposits and the manager trading cash only.','A supported manager co-investment fixture and separate ownership ledger.'),
 'BTPAMM-A007':('Public allocation rows show cent-rounded shares but do not expose reserve-ledger postings.','Read-only reserve-ledger/audit access to reconcile each fractional rounding residual.'),
 'BTPAMM-A008':('All supplied deposits are USD; no EUR funding/FX-conversion fixture or authoritative conversion quote is available.','An authorized non-USD QA wallet, conversion policy and timestamped FX/ledger records.'),
 'BTPAMM-A010':('The supplied pool holds 1000 dollars, not the specified 10-million-dollar institutional fixture.','Isolated synthetic 10-million-dollar pool with documented order limits and matching expected margin.'),
 'BTPAMM-A011':('The requested extreme fractional-share precision fixture was not provisioned.','The exact micro-investor/large-pool ratio and high-precision unit/share ledger readout.'),
 'BTPAMM-E003':('Only the supplied Real Hedging relationship was used; no authorized netting master pool fixture was provided.','A separately identified Real-Net QA master/follower pool and its documented pending-order policy.'),
 'BTPAMM-E005':('Only the supplied hedging pool was traded; netting protection behavior cannot be inferred from it.','Authorized Real-Net pool and corresponding SL/TP fixture.'),
 'BTPAMM-E009':('No position was held across the required Wednesday rollover/swap event.','Controlled rollover clock or a scheduled Wednesday QA position, plus authoritative swap rates.'),
 'BTPAMM-E010':('No controlled economic-news spread widening event or spread-protection threshold was provided.','Synthetic news/spread event with documented expected rejection/execution rule.'),
 'BTPAMM-E011':('Ordinary SL/TP were tested, but a documented trailing-stop payload and controlled trigger/retrace ticks were unavailable.','The deployed trailing-stop contract plus a deterministic tick/retrace fixture.'),
 'BTPAMM-E012':('REST allocation reconciliation was tested; investor WebSocket delivery/timing was not instrumented.','Working controlled browser/WebSocket capture and server event timestamps.'),
 'BTPAMM-E014':('No broker fixture can deliberately generate a requote/off-quotes response.','Broker QA simulator capable of producing specified requote/rejection reports.'),
 'BTPAMM-D002':('Partial withdrawal queued at rollover is not exposed by the tested join/unfollow flows; feature scope is unconfirmed.','Confirm the partial-redemption API and provide a controllable rollover queue.'),
 'BTPAMM-D003':('No supported partial-withdrawal contract and high-free-margin policy fixture were supplied.','Documented partial-withdrawal workflow and configured high-free-margin fixture.'),
 'BTPAMM-D004':('The tested endpoint performs full unfollow; an explicit withdrawal-request amount/free-margin fixture was not available.','Supported withdrawal API and an isolated pool below the requested withdrawal free margin.'),
 'BTPAMM-D006':('No pending withdrawal/rollover queue existed to cancel.','A supported queued withdrawal fixture and cancellation workflow.'),
 'BTPAMM-D007':('No configured lockup or early-exit-penalty agreement exists in the supplied test fixture.','A QA subscription with an explicit active lockup and penalty schedule.'),
 'BTPAMM-D008':('The specified 100000-dollar deposit into a 50000-dollar pool cannot be formed from the supplied ten 100-dollar investments.','An isolated funded whale-deposit fixture and exact pre-deposit pool ledger.'),
 'BTPAMM-D010':('PAMM principal was tested; no payment-provider chargeback/reversal fixture is available.','A synthetic settled deposit and supported provider reversal event; no live payment reversal.'),
 'BTPAMM-D011':('No supported profit-only withdrawal route was identified in the provided deployed contract.','Confirm the profit-only withdrawal feature and its documented workflow.'),
 'BTPAMM-D012':('No explicit manager personal-capital withdrawal fixture/floor was configured.','Manager co-investment ownership ledger and configured minimum-capital policy.'),
 'BTPAMM-D015':('Orderly master deregistration/liquidation would need an isolated disposable manager pool; the supplied master was retained.','An isolated disposable QA manager and documented pool shutdown workflow.'),
 'PAMM-X14-01':('Live ticks did not provide a controlled exactly one-cent parent gain, and reserve postings are not public.','Deterministic +0.01 PNL fixture plus reserve-ledger proof.'),
 'PAMM-X14-02':('Live ticks did not provide a controlled exactly one-cent parent loss, and reserve postings are not public.','Deterministic -0.01 PNL fixture plus reserve-ledger proof.'),
}
ui_reason=('The controlled in-app browser became unavailable, and standalone cached Chromium, headless shell and system Chrome abort on launch. This UI sequence was not executed.','A working Playwright/Chromium process or restored browser-control capability; then run the specified UI steps.')
network_reason=('The issuing browser could not launch. API concurrency requests do not establish CDP throttling, offline delivery, response loss or browser recovery behavior.','Working Chromium with CDP access and independent authoritative order/ledger reconciliation.')
def fixture_block(c):
 i,t=c['id'],c['title']
 if i.startswith('BTPAMM-R'):
  return ('NAV/unit/rollover feature implementation is unconfirmed; no units ledger or controllable rollover event was available for '+t+'.','Confirm deployed NAV/rollover support; provide the case\'s exact unit/NAV fixture and ledger readout, including a controllable rollover clock where required.')
 if i.startswith('BTPAMM-P'):
  if i.endswith('015'):return ('Liquidity-provider fill IDs cannot be verified from the supplied client-only evidence.','Read-only LP execution blotter and parent-to-fill ID mapping.')
  return ('The broker simulator/LP event needed for '+t+' is not exposed by the supplied accounts.','A controllable broker/LP QA fixture that can generate this specific fill, rejection, timing, liquidity or failover event, with authoritative execution logs.')
 if i.startswith('BTPAMM-H'):
  return ('The HWM/AUM/fee-ledger feature required by '+t+' is unconfirmed. Public settle-on-exit fields alone do not prove the reference behavior.','Confirm this feature is deployed and provide the exact HWM history, schedule, fee-split or statement fixture plus ledger evidence specified by the case.')
 if i.startswith('BTPAMM-M'):
  if any(s in t.lower() for s in ['overnight','weekend','news']):return ('The required scheduled margin event was not reproduced for '+t+'.','A controlled event clock and configured margin/leverage schedule, with before/after risk records.')
  return ('The exact risk/solvency fixture for '+t+' is absent; ordinary position margins and free-margin rejection do not prove this case.','An isolated synthetic pool matching the specified equity, leverage and stop-out/negative-balance conditions, plus risk-engine records.')
 if i.startswith('BTPAMM-C'):
  if any(s in t for s in ['100-Follower','500-Follower','100 Followers']):return ('Only ten supplied investor accounts were available; the requested 100/500-investor baseline was not provisioned.','The exact authorized investor population and independent deposit/allocation audit baseline.')
  return ('The required concurrency/internal-system fixture for '+t+' was unavailable.','Provide this case\'s controlled workload and internal database/queue/lock/WebSocket diagnostics; client response success cannot prove this internal behavior.')
 if i.startswith('BTPAMM-O'):
  return ('The operational capability or internal evidence for '+t+' is not available through the supplied account checks.','Confirm this feature exists and provide an isolated staging runbook, required operations role and the audit/telemetry/clearing evidence specified by the case.')
 if i.startswith(('PAMM-X12','PAMM-X13')) or i=='PAMM-X07-09':return network_reason if i.startswith('PAMM-X13') else ui_reason
 if i.startswith(('PAMM-X15','PAMM-X16','PAMM-X19')):return ui_reason
 return ('This scenario was not executed to its full stated preconditions; no passing result can be established from the saved evidence.','Provide or establish the exact preconditions in this row, then execute its steps with recorded before/after state.')
# State scope corrections are separate from product bug reporting.
explicit={
 'BTPAMM-F004':('INCONCLUSIVE','The settings paragraph was observed, but the exact future-join fee-change notice from the reference was not present in that observation. Existing fee-policy text claims are excluded from new bug reporting.','The current approved copy/product contract is unconfirmed.','Confirm the intended fee-policy notice and inspect it in a working browser.'),
 'PAMM-X15-05':('INCONCLUSIVE','Existing agreements retained their fees in API tests. The exact reference policy notice was not seen in the settings observation.','Reference UI wording needs product confirmation; no duplicate bug is filed.','Confirm intended settings copy and rerun UI check.'),
 'BTPAMM-A009':('INCONCLUSIVE','The visible product describes running share as allocated on closed trades. The reference expects live mark-to-market running PNL and a sub-250ms WebSocket SLA, which were not established.','Reference expectation may not match deployed product policy; no defined WebSocket measurement fixture.','Confirm whether running_pnl is realized or mark-to-market, and provide a timestamped WebSocket fixture.'),
 'PAMM-X04-04':('INCONCLUSIVE','POST with share_percent=null returned HTTP 200 and stored zero; settings were restored to 20.','The intended null/default fee contract is unconfirmed.','Confirm whether null should mean zero, unchanged, or invalid.'),
}
# Alias sources for partial reference observations.
partial_alias={
 'BTPAMM-F001':['PAMM-X15-01'], 'BTPAMM-F002':['PAMM-X15-01'], 'BTPAMM-F007':['ROLE-MASTER-CANNOT-SELF-FOLLOW'],
 'BTPAMM-F009':['PAMM-X10-03'],'BTPAMM-F012':['PAMM-X01-09','PAMM-X01-10'], 'BTPAMM-F013':['PAMM-X18-02','PAMM-X18-01'],
 'BTPAMM-F014':['PAMM-X04-01','PAMM-X04-02'],'BTPAMM-A001':['ALLOCATION-CYCLE-ONE-PARENT','PAMM-X06-06'],
 'BTPAMM-A002':['UNEQUAL-ALLOCATION-WEIGHTS'],'BTPAMM-A003':['ALLOCATION-CYCLE-POOL-WEIGHTS'],'BTPAMM-A004':['ALLOCATION-CYCLE-COMPLETENESS'],
 'BTPAMM-A005':['PAMM-X11-05'],'BTPAMM-A015':['PAMM-X10-06'],'BTPAMM-D001':['PAMM-X14-05'],'BTPAMM-D009':['PAMM-X10-10','UNEQUAL-ALLOCATION-WEIGHTS'],
 'BTPAMM-D013':['PAMM-X10-10'],'BTPAMM-D014':['REJOIN-CYCLE-0'],'BTPAMM-E013':['PAMM-X06-06'],
 'PAMM-X06-01':['EXEC-BUY-POSITION','EXEC-BUY-CLOSE'],'PAMM-X20-09':['PARALLEL-SESSION-API-STATE'],
}
updated=[]
for c in cases:
 i=c['id'];status=c['status'];rs=refs(i);actual='';reason='';required='';mode='NOT_EXECUTED';evidence=[];eids=[]
 if rs:
  r=rs[0];status=r['status'];actual=r.get('actual') or (r.get('details') if isinstance(r.get('details'),str) else compact(r.get('details')))
  if r.get('review_note'):actual+=' Review: '+r['review_note']
  mode='LIVE_API' if i in latest else 'MANUAL_UI';evidence=[r.get('evidence','')];eids=[i]
 if i in aliases:
  rs=refs(*aliases[i]);evidence=[r.get('evidence','') for r in rs];eids=[r['id'] for r in rs]
  status='PASS' if rs and all(r['status']=='PASS' for r in rs) else 'PARTIAL'
  actual=' | '.join((r.get('actual') or compact(r.get('details'))) for r in rs);mode='EVIDENCE_REVIEW'
 if i in assertion_outcomes and status=='PASS':actual=assertion_outcomes[i]
 if i in partial:
  status='PARTIAL';actual,required=partial[i];reason='Only the stated subset was verified; full scenario expectations remain unproved.';mode='EVIDENCE_REVIEW'
  if i in partial_alias:
   rs=refs(*partial_alias[i]);evidence=[r.get('evidence','') for r in rs];eids=[r['id'] for r in rs]
 if i in blocked:
  status='BLOCKED';reason,required=blocked[i];actual='Not executed to the stated preconditions. '+reason;mode='NOT_EXECUTED'
 if i in explicit:status,actual,reason,required=explicit[i];mode='EVIDENCE_REVIEW'
 if i=='BTPAMM-F010':
  r=latest[i];status='BLOCKED';actual=r['actual'];reason='POST /admin/api/members/{id}/plan with free returned 400: plan must be one of the charting tiers this client has active. Original plan was restored successfully.';required='An active Free tier for this QA client, or confirmation that the Free-plan scenario is outside current scope.';evidence=[r['evidence']];eids=[i,'PLAN-RESTORE'];mode='SETUP_ATTEMPTED'
 if i=='BTPAMM-H010':
  status='BLOCKED';actual=latest[i]['actual'];reason='The reference endpoint returned 404 and its specified 100-follower fee fixture was not present.';required='Confirm the supported consolidated fee-reporting route and provide the 100-investor fee baseline.';mode='SETUP_ATTEMPTED'
 if i=='BTPAMM-E015':
  status='PARTIAL';actual='HTTP 200 returned own execution history with history_id, order_id, position_id, qty, entry_price, exit_price, realized_pnl, opened_at and executed_at. The reference ticket_id name is not present; exact schema equivalence is unconfirmed.';reason='Reference field naming differs from deployed schema; no missing trade was established.';required='Confirm history_id/order_id are the intended ticket identifiers and reconcile every requested fixture row.'
 if i=='PAMM-X14-03':
  status='PASS';actual='Live joins used 99 and 101 principal; pool_total remained 1000. The meaningful parent close produced 9.9% and 10.1% weights for those investors, and all row weights matched deposit/pool_total.';evidence=['evidence/remaining-results.json'];eids=[i,'UNEQUAL-ALLOCATION-WEIGHTS'];mode='LIVE_API'
 if i=='PAMM-X14-09':
  required='Read-only reserve-ledger/audit postings for the measured per-trade rounding deltas.'
 if i=='PAMM-X11-10':
  status='PASS';actual='For both tested contract-fee boundaries, the master/pool cash decrease equaled the investor payout exactly; settled fee values were retained once. This is cash retained in the manager pool, not an invented separate payout credit.'
 if i.startswith('PAMM-BND-'):
  status='FAIL';amount='0.001' if i.endswith('001') else '0.009';payout='0.00' if i.endswith('001') else '0.01';actual=f'Deposit {amount} was accepted and debited exactly, then no-trade exit returned {payout}, with running_pnl=0 and master_share=0. Reproduced twice per amount with Playwright APIRequestContext.';evidence=['evidence/precision-reproduction.json'];eids=[i];mode='LIVE_API'
 if status in ['NOT_RUN','EXCLUDED_EXISTING'] or (not actual and status not in ['FAIL']):
  reason,required=fixture_block(c);status='BLOCKED';actual='Not executed. '+reason;mode='NOT_EXECUTED'
 if status=='NOT_SUPPORTED':status='BLOCKED';reason=actual;required='Confirm that this order type is supported in the selected instance, or remove it from scope.'
 if status in ['PARTIAL','INCONCLUSIVE'] and not reason:reason='The observed run did not establish the full expected branch or product contract.'
 if status in ['PARTIAL','INCONCLUSIVE'] and not required:required='Confirm the unresolved product contract or reproduce the missing branch with the exact fixture in the scenario.'
 if status=='BLOCKED' and not evidence and any(x in i for x in ['PAMM-X12','PAMM-X13','PAMM-X15','PAMM-X16','PAMM-X19']):evidence=['evidence/browser-recovery-results.json']
 clean=[]
 for e in evidence:
  for candidate in e.split('; '):
   if (ROOT/candidate).is_file():clean.append(candidate)
 if not clean and any(x in manual_by for x in eids):clean.append('manual-observations.json')
 evidence=list(dict.fromkeys(clean))
 expected=c['expected']
 if expected.lower().startswith('see expected'):
  expected=c['steps'].split('Expected:',1)[-1].strip() if 'Expected:' in c['steps'] else c['steps']
 disposition='New finding PAMM-FUNC-001' if i.startswith('PAMM-BND-') else ('Existing topic; no duplicate bug filed' if i in ['BTPAMM-C005','BTPAMM-H010','PAMM-X15-05','BTPAMM-F004','BTPAMM-F012'] else 'No new bug claim from this row')
 updated.append({**c,'status':status,'actual_result':actual,'not_completed_reason':reason,'required_to_complete':required,'execution_type':mode,'evidence':'; '.join(evidence),'evidence_test_ids':'; '.join(eids),'expected_result':expected,'bug_disposition':disposition})
assert len(updated)==349 and len({c['id'] for c in updated})==349
assert all(c['actual_result'] for c in updated)
assert all(c['not_completed_reason'] and c['required_to_complete'] for c in updated if c['status'] in ['BLOCKED','PARTIAL','INCONCLUSIVE'])
(ROOT/'all-case-results.json').write_text(json.dumps(updated,indent=2,ensure_ascii=False));(ROOT/'test-cases.json').write_text(json.dumps(updated,indent=2,ensure_ascii=False))
fields=['id','status','title','actual_result','not_completed_reason','required_to_complete','expected_result','execution_type','evidence','evidence_test_ids','priority','area','bug_disposition','preconditions','steps','source']
for filename in ['all-case-results.csv','test-cases.csv']:
 with (ROOT/filename).open('w',newline='')as f:
  w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader();w.writerows(updated)
(ROOT/'reviewed-checks.json').write_text(json.dumps(combined,indent=2,ensure_ascii=False))
counts=dict(collections.Counter(c['status'] for c in updated));checks=dict(collections.Counter(r['status'] for r in combined));summary={'functional_cases':349,'every_case_has_actual_result':True,'case_matrix_status_counts':counts,'api_check_records':len(combined),'reviewed_api_status_counts':checks,'manual_observation_records':13,'precision_repetitions':4,'new_findings':1,'complete_assessment':False,'scope_confirmation':'User is unsure whether NAV/rollover/HWM/AUM/LP-failover features are implemented; keep unverified.','note':'Blocked/partial/inconclusive rows are not passes. API check records include repeated cases and cleanup.'}
(ROOT/'summary.json').write_text(json.dumps(summary,indent=2))
# One readable table row for every case, including exact nonexecution reason and prerequisite.
md=['# Result for every PAMM test case','', 'All 349 cases have an explicit outcome. PASS means the stated scoped assertion was established; PARTIAL, INCONCLUSIVE and BLOCKED remain unverified. No blocked row is counted as passed.','', '**Counts:** '+', '.join(f'{k}: {v}' for k,v in counts.items())+'.','', 'For complete evidence references and required fixtures, use all-case-results.csv or report.html.','', '| Case | Result | Scenario | Actual result / exact blocker |','|---|---|---|---|']
for c in updated:
 esc=lambda x:str(x).replace('|','\\|').replace('\n',' ')
 text=c['actual_result']
 if c['status']!='PASS' and c['required_to_complete']:text+=' Required: '+c['required_to_complete']
 md.append('| '+' | '.join(esc(v) for v in [c['id'],c['status'],c['title'],text])+' |')
(ROOT/'ALL_CASE_RESULTS.md').write_text('\n'.join(md),encoding='utf-8')
# Rebuild the existing local report with explicit actual-result columns and details for every row.
previous=(ROOT/'report.html').read_text();style=re.search(r'<style>(.*?)</style>',previous,re.S).group(1)
esc=html.escape
rows=[]
for c in updated:
 links=' '.join('<a href="'+esc(e)+'">'+esc(pathlib.Path(e).name)+'</a>'for e in c['evidence'].split('; ')if e)
 detail='<p><b>Expected:</b> '+esc(c['expected_result'])+'</p><p><b>Actual:</b> '+esc(c['actual_result'])+'</p>'
 if c['not_completed_reason']:detail+='<p><b>Why incomplete:</b> '+esc(c['not_completed_reason'])+'</p><p><b>Required to complete:</b> '+esc(c['required_to_complete'])+'</p>'
 detail+='<p><b>Execution:</b> '+esc(c['execution_type'])+' · '+esc(c['evidence_test_ids'])+'</p><p><b>Evidence:</b> '+links+'</p><p><b>Steps:</b> '+esc(c['steps']).replace('\n','<br>')+'</p>'
 rows.append('<tr data-status="'+esc(c['status'])+'"><td>'+esc(c['id'])+'</td><td><span class="badge '+esc(c['status'])+'">'+esc(c['status'])+'</span></td><td><details><summary>'+esc(c['title'])+'</summary>'+detail+'</details></td><td>'+esc(c['actual_result'])+'</td></tr>')
metrics=''.join('<div class="metric"><strong>'+str(v)+'</strong>'+k+'</div>'for k,v in counts.items())
report='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>All 349 PAMM case results</title><style>STYLE</style><main><h1>Result for every PAMM test case</h1><p>349 cases · supplied simulated QA accounts · updated 19 November 2026</p><div class="metrics">METRICS</div><section><h2>What was completed</h2><p>CHECKCOUNT API check records, 13 manual browser observations, and four independent precision reproductions are retained. Check records include repeated variants and cleanup; they are not distinct full scenarios.</p><p class="note"><b>Some cases remain unverified.</b> Every row now states the observed result or a concrete blocker, and specifies what is needed to finish. Missing fixtures, unavailable browser control and unconfirmed product features are not reported as passes.</p><p><a href="all-case-results.csv">Download all 349 results (CSV)</a> · <a href="ALL_CASE_RESULTS.md">Read every result (Markdown)</a> · <a href="all-case-results.json">Full JSON</a> · <a href="NEW_BUGS.md">New finding</a> · <a href="README.md">Run instructions</a></p><p>New completed work includes unequal-deposit allocation, independent-session fee-save races, fee change versus join/exit, cash reconciliation, repeated double-close, bulk squareoff, reads during membership changes, and late-join/close eligibility. The Free-plan setup was attempted through the frontend-advertised plan endpoint; the deployment rejects Free as an inactive tier. The original plan was restored.</p><p>Final evidence: <a href="evidence/followup-final-state.json">ten investors, 1000 pooled principal, manager fee 20%, no open positions or pending orders</a>. Simulated balances retain actual test P&amp;L and brokerage.</p></section><section><h2>Every case</h2><input id="search" placeholder="Search case, outcome, blocker or required fixture…"><select id="status"><option value="">All statuses</option>OPTIONS</select><p id="shown"></p><table><thead><tr><th>Case</th><th>Result</th><th>Scenario / expected / evidence</th><th>Actual outcome or blocker</th></tr></thead><tbody>ROWS</tbody></table></section><section><h2>New precision finding</h2><p>Accepted principal 0.001 returns 0.00, while 0.009 returns 0.01 on a no-trade exit. The two failed boundary cases reproduce one proposed functional issue. Existing bug topics remain excluded from new issue reporting.</p><a href="evidence/precision-reproduction.json">Playwright reproduction evidence</a></section></main><script>const q=document.querySelector('#search'),s=document.querySelector('#status'),rows=[...document.querySelectorAll('tbody tr')];function filter(){let n=0;for(const r of rows){const yes=(!s.value||r.dataset.status===s.value)&&r.textContent.toLowerCase().includes(q.value.toLowerCase());r.hidden=!yes;if(yes)n++;}document.querySelector('#shown').textContent=n+' of '+rows.length+' case results';}q.oninput=filter;s.onchange=filter;filter();</script></html>'''
for k,v in {'STYLE':style,'METRICS':metrics,'CHECKCOUNT':str(len(combined)),'OPTIONS':''.join('<option>'+k+'</option>'for k in sorted(counts)),'ROWS':''.join(rows)}.items():report=report.replace(k,v)
(ROOT/'report.html').write_text(report)
print(json.dumps(summary,indent=2))

# Apply the later internal-browser/admin-fixture review after the historical builder.
import runpy
runpy.run_path(str(ROOT/"scripts/update-phase3-report.py"),run_name="__main__")
