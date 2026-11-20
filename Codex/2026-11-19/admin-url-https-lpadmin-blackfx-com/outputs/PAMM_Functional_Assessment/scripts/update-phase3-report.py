import json,csv,pathlib,collections,html,datetime,re
R=pathlib.Path(__file__).resolve().parents[1]; E=R/'evidence'
def read(p):return json.loads((R/p).read_text())
base=E/'phase2-case-snapshot.json'
if not base.exists():base.write_text((R/'all-case-results.json').read_text())
cases=json.loads(base.read_text()); by={c['id']:c for c in cases}; transitions=[]
files=['scale-100-results.json','scale-500-results.json','advanced-admin-results.json','risk-ui-results.json','risk-priority-results.json','risk-distinct-results.json','risk-unequal-results.json','phase3-final-results.json','whale-margin-results.json','storm-recovery-results.json','goodwill-results.json','internal-browser-results.json','abook-lp-results.json']
def patch(i,status,actual,evidence,reason='',required='',mode='LIVE_API',expected=None):
 c=by[i];old=c['status'];c.update(status=status,actual_result=actual,evidence=evidence,not_completed_reason=reason,required_to_complete=required,execution_type=mode,evidence_test_ids=i,bug_disposition='No new confirmed defect; existing issue claims excluded')
 if expected:c['reference_expected_result']=c.get('reference_expected_result',c.get('expected_result',c['expected']));c['expected_result']=expected
 if status in ['PARTIAL','BLOCKED','INCONCLUSIVE']:
  c['not_completed_reason']=reason or 'The full reference assertion is not established by this observation.'
  c['required_to_complete']=required or 'Execute the unverified branch against an authoritative fixture and expected result.'
for f in files:
 if not (E/f).exists():continue
 for r in read('evidence/'+f)['results']:
  if r['id'] not in by:continue
  ev='evidence/'+f
  if r.get('evidence') and (R/r['evidence']).is_file():ev+='; '+r['evidence']
  patch(r['id'],r['status'],r.get('actual','Recorded observation; see evidence.'),ev,mode='INTERNAL_BROWSER' if f=='internal-browser-results.json' else 'LIVE_API')
# Review the entire supplied requirement, not just helper assertions.
reviews={
'BTPAMM-C001':('All100 eligible investors had one unique allocation on each of2 closes; weights and arithmetic reconciled. HTTP close times include network time and do not establish internal ledger completion below80ms.','Internal ledger timing, transaction/audit baseline and exact100-investor balance reconciliation remain unverified.','Timestamped allocation-engine/ledger audit with defined80ms clock boundaries.','evidence/scale-100-results.json'),
'BTPAMM-C002':('All500 eligible investor APIs and500 displayed UI allocation rows reconciled on one parent close. The500-follower data/setup and functional allocation branch ran successfully.','The reference random500–50000 deposits,+5000 parent profit,single DB transaction,<150ms and CPU<40% requirements were not established.','Controlled+5000 trade, reference deposit matrix, database transaction trace, server timing and CPU telemetry.','evidence/scale-500-results.json; evidence/ui-allocation-reconciliation.json'),
'BTPAMM-C015':('100-investor allocation completeness and per-row arithmetic passed; both100 and500 runs retained detailed investor responses.','The reference19-trade ledger/equity identity and zero-discrepancy database audit were not completed.','Full19-trade independent cash/equity ledger baseline including manager equity and rounding/reserve postings.','evidence/scale-100-results.json'),
'BTPAMM-A012':('Two consecutive closes across100 investors retained running PNL continuity.','The reference10-trade/1-hour,6-win/4-loss fixture was not reproduced.','Complete the specified10-trade sequence and independently sum each investor allocation to4 decimal places.','evidence/scale-100-results.json'),
'BTPAMM-A010':('An isolated admin-funded10-million-dollar QA manager executed and closed one100-unit BTC block; used margin63779.8. A separate A-book PAMM manager routed BLACK:XAUUSD market orders through the active Black exchange bridge.','The reference100-lot EURUSD order and multi-tier LP execution assertion were not tested.','Supported EURUSD contract plus sufficient isolated LP margin and authoritative multi-tier fill evidence.','evidence/advanced-admin-results.json; evidence/abook-lp-results.json'),
}
for i,(a,reason,need,ev) in reviews.items():patch(i,'PARTIAL',a,ev,reason,need)
# A-book follow-up: an isolated PAMM manager was switched from B-book to A-book in admin.
# These rows have direct Black exchange routing evidence; event-forcing cases remain blocked.
patch('BTPAMM-A001','PASS','An isolated A-book PAMM manager with50000 pooled principal placed one BLACK:XAUUSD market order. The active Black exchange route filled it and exactly one manager position mounted; the position then closed cleanly.','evidence/abook-lp-results.json; evidence/abook-ui-observation.txt')
patch('BTPAMM-E013','PASS','The isolated A-book PAMM order produced exactly one manager position record on the Black exchange route. No fractional follower/child positions appeared, and cleanup left the manager flat.','evidence/abook-lp-results.json; evidence/abook-ui-observation.txt')
patch('BTPAMM-P007','PASS','With50000 pooled principal, an allowed-size10-lot BLACK:XAUUSD A-book parent order reached the liquidity provider and was rejected for insufficient LP margin (HTTP400). Zero position mounted and pool capital remained unlocked.','evidence/abook-lp-results.json; evidence/abook-ui-observation.txt')
patch('BTPAMM-P009','PASS','Twenty concurrent0.01-lot BLACK:XAUUSD A-book PAMM market orders all filled through the active bridge; zero429/rate-limit responses occurred and20 manager positions mounted before clean closeout.','evidence/abook-lp-results.json; evidence/abook-ui-observation.txt')
patch('BTPAMM-P015','PARTIAL','A-book execution responses and OMS history retained order IDs, prices and timestamps, and admin liquidity state identified Black exchange as up. No distinct LP fill ID/blotter mapping was exposed.','evidence/abook-lp-results.json; evidence/abook-ui-observation.txt','The required LP fill identifier and regulatory blotter fields are not exposed in the inspected admin/OMS responses.','Read-only provider blotter mapping each OMS parent order to LP order ID, LP fill ID, millisecond timestamp and price proof.')
for i in ['BTPAMM-E014','BTPAMM-P001','BTPAMM-P002','BTPAMM-P003','BTPAMM-P004','BTPAMM-P005','BTPAMM-P006','BTPAMM-P010','BTPAMM-P011','BTPAMM-P012','BTPAMM-P013','BTPAMM-P014']:
 c=by[i]
 if c['status']=='BLOCKED':
  c['actual_result']='The isolated PAMM manager was switched to A-book and ordinary Black exchange market, rejection and pending-order paths were exercised. This case was not executed because its exact LP event (forced partial/tiered fill, requote, slippage, message disorder, currency swing or provider outage) cannot be induced through the exposed controls.'
  c['not_completed_reason']='A-book connectivity is now verified; the exact deterministic LP fault/market precondition required by this case is not controllable from the supplied admin and trading interfaces.'
  c['required_to_complete']='A scoped LP simulator or provider test control that injects this case’s specified event without affecting unrelated A-book customers, plus the resulting bridge execution trace.'
  c['evidence']='evidence/abook-lp-results.json'
  c['execution_type']='LIVE_API'
# Stop-out ordering was ambiguous with equal positions; unequal positions resolve that missing branch.
risk=read('evidence/risk-unequal-results.json')['results']; rp=next(r for r in risk if r['id']=='STOPOUT-LOSS-PRIORITY'); rm=next(r for r in risk if r['id']=='BTPAMM-M003')
if rp['status']=='PASS' and rm['status']=='PASS':patch('BTPAMM-M003','PASS',rm['actual']+' Independent position comparison confirmed the most unprofitable position closed first.','evidence/risk-unequal-results.json')
# Disclosed fixture/contract changes. Preserve the supplied text alongside the scoped deployed expectation.
for i in ['BTPAMM-A002','BTPAMM-A003','BTPAMM-A004','BTPAMM-A005']:
 by[i]['fixture_review']='Isolated100-investor pool177150. First deposit1000; third575; other98 adjusted to reach total. Reference total cannot coexist with all deposits<=1100. Actual parent PNL+145 and-5 replaced deterministic reference PNL; recorded independent weights and cent-rounding expectation used.'
for i in ['BTPAMM-E003','BTPAMM-E005']:
 c=by[i];c['reference_expected_result']=c['expected_result'];c['expected_result']='Verify current deployed Real-Net capability: accepted pending LIMIT / attached SL and TP must read back correctly and clean up. Prior no-support claims are excluded.';c['contract_review']='Reference expects historical restrictions; current deployed success200 is supported behavior, not a new bug.'
for i,deposit,payout in [('PAMM-BND-001','0.001','0.00'),('PAMM-BND-002','0.009','0.01')]:
 patch(i,'PASS',f'Deposit{deposit} accepted; no-trade payout{payout}, running PNL0 and manager fee0. This matches the site developer contract requiring payout rounded to2 decimal places. The earlier proposed defect is withdrawn.','evidence/precision-reproduction.json; evidence/site-pamm-unfollow-contract.txt',expected='Accept the supported positive deposit; no-trade payout equals round(deposit,2) under the deployed unfollow contract. Preserve exact observed cash effects in the evidence.')
 by[i]['bug_disposition']='PAMM-FUNC-001 withdrawn after authoritative settlement-contract review; documented behavior'
by['PAMM-BND-001']['reference_title']=by['PAMM-BND-001']['title'];by['PAMM-BND-001']['title']='No-trade payout rounds0.001 deposit to0.00 under documented contract'
by['PAMM-BND-002']['reference_title']=by['PAMM-BND-002']['title'];by['PAMM-BND-002']['title']='No-trade payout rounds0.009 deposit to0.01 under documented contract'
# Full browser recovery does not imply network fault-injection controls.
for c in cases:
 if c['status']=='BLOCKED' and c['id'].startswith('PAMM-X13-'):
  c.update(actual_result='Internal browser recovered. This case was not executed with actual network fault injection: its documented controls expose no offline, packet-loss, response-delay or CDP throttling interface. Standalone Chromium launch still aborts.',not_completed_reason='The required network fault-injection control is unavailable in the working browser.',required_to_complete='A working CDP-enabled QA browser or staging proxy that can inject the stated request/response fault.',evidence='evidence/browser-recovery-results.json',execution_type='NOT_EXECUTED')
# Remaining UI cases are not allowed to inherit the outdated no-browser explanation.
for c in cases:
 if c['status'] in ['BLOCKED','PARTIAL','INCONCLUSIVE'] and any(t in c.get('not_completed_reason','').lower() for t in ['browser cannot','browser control cannot','working chromium','browser could not','browser cannot launch']):
  c['not_completed_reason']='The internal browser is available again; this exact branch has not yet been completed. '+c['not_completed_reason']
# Current evidence for scope questions; absence of a catalog entry is not proof that hidden infrastructure does not exist.
for c in cases:
 if c['status'] in ['BLOCKED','PARTIAL','INCONCLUSIVE'] and any(t in (c['title']+' '+c.get('not_completed_reason','')).lower() for t in ['nav','rollover','high-water','hwm','aum','reserve-ledger','failover','database','queue','redis','replica']):
  c['capability_review']='Admin UI and developer PAMM catalog were inspected. Public PAMM routes cover directory/master/follows/join/unfollow/allocations and settle closed-trade running PNL on exit. No authoritative evidence for this requested internal/scheduled branch was obtained. Its implementation is not assumed absent.'
# Detailed reasons for remaining follower UI branches.
patch('PAMM-X16-04','INCONCLUSIVE','The current active subscription table shows manager,deposit,running,exit estimate and join time; the closed-history view shows manager fees and settlements. A standalone stored fee percentage was not observed in this UI.','evidence/ui-follower-active.txt; evidence/ui-follower-history.txt','Exact agreed-fee label expectation is not reconciled with the current approved UI contract.','Confirm the intended contract-fee display location; retain the API fee snapshot as independent evidence.',mode='INTERNAL_BROWSER')
patch('PAMM-X16-08','INCONCLUSIVE','The directory was exercised and correct QA manager rows located. Its PAMM panel exposes no dedicated search field in the observed view; the visible symbol search belongs to the watchlist.','evidence/ui-expanded-directory.json','The reference directory-search feature/control is unconfirmed.','Identify a supported PAMM-specific search control and test its match/filter result.',mode='INTERNAL_BROWSER')
if by['PAMM-X16-10']['status']=='PASS':
 patch('BTPAMM-F005','PARTIAL','The actual portal Account selector switched Alternate/Main correctly; primary and alternate balances/subscriptions remained separate. Real Hedging routing was observed. The reference PAMM-specific instance dropdown is not present in the inspected panel, which uses broker settings.','evidence/ui-primary-after-account-switch.txt; evidence/ui-alternate-account-isolation.txt','The exact reference instance-dropdown control/contract is not reconciled with current UI.','Confirm the approved current instance-binding UX; account-switch isolation is independently passed in PAMM-X16-10.',mode='INTERNAL_BROWSER')
if by['PAMM-X16-10']['status']!='PASS': patch('PAMM-X16-10','PARTIAL','Created a second Real Hedging account through admin and inspected broker settings. The observed direct workspace only exposes Paper/Real engine controls; no primary/alternate account selector was exercised. Balances were not mixed in the inspected primary view.','evidence/admin-extra-account.txt; evidence/ui-follower-broker-binding.txt','Full account-switch routing has not been demonstrated.','Exercise the supported client account selector between the primary and new alternate account and reconcile separate balances/subscriptions.',mode='INTERNAL_BROWSER')
# Current remaining logout branch requires an actual in-flight request observation.
patch('PAMM-X12-06','PARTIAL','The populated QA client account logged out successfully and returned to the public page; a subsequent separate QA investor sign-in succeeded. An in-flight read was not held at logout.','evidence/ui-logout-observation.json','Exact delayed-read completion during logout is not observed.','Use request timing instrumentation to hold a read across logout and verify its stale response is discarded.',mode='INTERNAL_BROWSER')
# Spell out each remaining assertion rather than retaining generic helper prerequisites.
remaining_requirements={
 'BTPAMM-F015':('Functional maximise/restore/unmount passed; detached-node memory count was not measured.','Browser heap/lifecycle instrumentation proving zero detached widget nodes after repeated close/reopen.'),
 'BTPAMM-A015':('Exact2000 rejoin/history passed; HWM baseline is not exposed in the observed membership schema.','Supported HWM baseline readout showing the required reset/persistence rule at rejoin.'),
 'BTPAMM-E011':('Trailing-stop placement/readback passed; the exact60-pip favorable move and25-pip retrace trigger was not controlled.','An isolated controllable quote sequence and final exit/allocation evidence for the requested trailing path.'),
 'BTPAMM-M002':('Margin-call banner/new-order rejection were observed; email dispatch and receipt were not verified.','Timestamped email/notification delivery evidence for the isolated QA margin-call event.'),
 'BTPAMM-M004':('Automatic stop-out and allocation records were observed; the required50-percent loss and25000 remaining-equity fixture was not created.','Controlled stop-out PNL and independent investor equity baselines for the specified loss matrix.'),
 'BTPAMM-M006':('An over-margin BTC order was rejected under leverage100; the exact200-lot EURUSD reference fixture was not executed.','Supported EURUSD contract and the reference100000 pool/200-lot margin rejection test.'),
 'BTPAMM-C003':('All50 raced joins and3 orders succeeded, but no internal committed-balance snapshot or isolation trace was observed.','Read-only transaction snapshots proving which committed capital each raced order used.'),
 'BTPAMM-O007':('Exactly100 was credited with a supplied remark; treasury debit and immutable audit-note retention are unverified.','Authoritative linked treasury/client-ledger postings and retained audit note for that adjustment.'),
 'PAMM-X12-05':('Presentation hiding did not change document.visibilityState from visible; true hidden-tab recovery was not exercised.','A browser lifecycle control that makes the document hidden, then a background state change and foreground reconciliation.'),
 'PAMM-X19-07':('Displayed payout/fee/trade drilldown reconciled; immutable ledger linkage to the subscription ID was not exposed.','Read-only settlement ledger linking the exact pamm_id,payout,fee and corresponding debit/credit operations.'),
}
for i,(why,needed)in remaining_requirements.items():by[i]['not_completed_reason']=why;by[i]['required_to_complete']=needed
by['BTPAMM-D015'].update(actual_result='Isolated QA managers are now available. No Liquidate & Close Pool control was located in the inspected manager UI; its developer master contract describes install-controlled status. The required archive/refund workflow was not executed.',not_completed_reason='The exact liquidation/archive operation contract or UI control has not been identified; fixture availability is no longer the blocker.',required_to_complete='Locate the implemented liquidation/archive control, seed50 eligible QA investors and verify deposit blocking,flat positions,refunds and archive state.',evidence='evidence/site-pamm-master-contract.txt')
# Preserve changes and exact prior expectations for review.
old={c['id']:c for c in json.loads(base.read_text())}
for c in cases:
 if c['status']!=old[c['id']]['status']:transitions.append({'id':c['id'],'previous':old[c['id']]['status'],'current':c['status'],'actual':c['actual_result']})
 assert c['actual_result']
 if c['status'] in ['BLOCKED','PARTIAL','INCONCLUSIVE']:assert c['not_completed_reason'] and c['required_to_complete']
 for e in c['evidence'].split('; '):
  if e:assert (R/e).is_file(),(c['id'],e)
assert len(cases)==349 and len(by)==349
for f in ['all-case-results.json','test-cases.json']:(R/f).write_text(json.dumps(cases,indent=2,ensure_ascii=False))
fields=['id','status','title','actual_result','not_completed_reason','required_to_complete','expected_result','reference_expected_result','execution_type','evidence','evidence_test_ids','priority','area','bug_disposition','preconditions','steps','source','fixture_review','contract_review','capability_review']
for f in ['all-case-results.csv','test-cases.csv']:
 with (R/f).open('w',newline='')as h:w=csv.DictWriter(h,fieldnames=fields,extrasaction='ignore');w.writeheader();w.writerows(cases)
counts={status:sum(c['status']==status for c in cases) for status in ['PASS','FAIL','PARTIAL','BLOCKED','INCONCLUSIVE']}; summary=read('summary.json');summary.update(case_matrix_status_counts=counts,new_findings=0,complete_assessment=False,updated_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),internal_browser_available=True,phase3_evidence_files=files,phase3_status_changes=len(transitions),note='349 explicit outcomes. PASS means the disclosed scoped assertion passed; exact reference deviations are retained. Unverified portions are not certified. Prior precision finding withdrawn under the documented two-decimal payout contract.')
for key in ['api_check_records','reviewed_api_status_counts','manual_observation_records','precision_repetitions']:
 if key in summary:summary['phase2_'+key]=summary.pop(key)
summary['phase3_evidence_record_counts']={f:len(read('evidence/'+f)['results']) for f in files if (E/f).exists()}
summary['phase3_record_count_note']='Includes repeats, setup, cleanup and narrower helper assertions; these are not counts of distinct complete scenarios.'
summary['scope_confirmation']='Latest user states all capabilities exist and authorizes admin fixture changes. Unverified internal or scheduled requirements remain unverified until supported by executed observations.'
(R/'summary.json').write_text(json.dumps(summary,indent=2));(E/'phase3-status-transitions.json').write_text(json.dumps(transitions,indent=2))
md=['# Result for every PAMM test case','','349 cases each have an actual result, evidence where available, and an exact reason/prerequisite for incomplete work. A blocked or partial case is not passed.','','**Counts:** '+', '.join(f'{k}: {v}'for k,v in counts.items())+'.','','Reference expectation changes are disclosed in JSON/CSV and in the expandable report.','','| Case | Result | Scenario | Actual result / unresolved portion |','|---|---|---|---|']
for c in cases:
 t=c['actual_result']
 if c['status']!='PASS':t+=' Unresolved: '+c['not_completed_reason']+' Required: '+c['required_to_complete']
 md.append('| '+' | '.join(str(v).replace('|','\\|').replace('\n',' ')for v in [c['id'],c['status'],c['title'],t])+' |')
(R/'ALL_CASE_RESULTS.md').write_text('\n'.join(md))
esc=html.escape
style='body{font:15px system-ui;margin:32px;background:#f6f8fc;color:#182034}main{max-width:1450px;margin:auto}a{color:#2456b8}section{background:white;border:1px solid #d8dfeb;border-radius:12px;padding:20px;margin:20px 0}.metrics{display:flex;gap:16px;flex-wrap:wrap}.metric{background:white;border:1px solid #d8dfeb;padding:16px;border-radius:8px}.metric strong{font-size:28px;display:block}table{border-collapse:collapse;table-layout:fixed;width:100%;font-size:13px}td,th{overflow-wrap:anywhere}th:nth-child(1){width:135px}th:nth-child(2){width:95px}th:nth-child(3){width:250px}input{width:min(100%,420px);box-sizing:border-box}td,th{padding:10px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}td:first-child{white-space:nowrap}summary{cursor:pointer;font-weight:600}input,select{padding:10px;margin:8px;min-width:200px}p{line-height:1.5}.PASS{color:#087244}.FAIL{color:#b72230}.PARTIAL,.INCONCLUSIVE,.BLOCKED{color:#8b5606}details p{max-width:800px}img{max-width:100%}'
rows=[]
for c in cases:
 detail=''
 for key,label in [('expected_result','Expected (reviewed scope)'),('reference_expected_result','Original reference expectation'),('actual_result','Actual'),('not_completed_reason','Why incomplete'),('required_to_complete','Required to complete'),('fixture_review','Fixture review'),('contract_review','Contract review'),('capability_review','Capability review'),('steps','Steps')]:
  if c.get(key):detail+='<p><b>'+label+':</b> '+esc(c[key]).replace('\n','<br>')+'</p>'
 detail+='<p><b>Execution:</b> '+esc(c['execution_type'])+'</p><p><b>Evidence:</b> '+' · '.join('<a href="'+esc(e)+'">'+esc(pathlib.Path(e).name)+'</a>'for e in c['evidence'].split('; ')if e)+'</p>'
 rows.append('<tr data-status="'+c['status']+'"><td>'+esc(c['id'])+'</td><td class="'+c['status']+'">'+c['status']+'</td><td><details><summary>'+esc(c['title'])+'</summary>'+detail+'</details></td><td>'+esc(c['actual_result'] if len(c['actual_result'])<=450 else c['actual_result'][:400]+'… Expand the scenario for the full observation and evidence.')+'</td></tr>')
head='''<h1>All 349 PAMM test-case results</h1><p>Functional QA · simulated trades and balances · 20 November 2026</p><div class="metrics">METRICS</div><section><h2>What changed in this follow-up</h2><p>The internal browser recovered. Admin-created isolated fixtures exercised 100 and 500 investors, exact 1000-dollar joins, unequal deposits, profitable 0% and 100% fee settlements, Real-Net pending/protection, 10-million-dollar sizing, margin call, automatic stop-out and UI/tab-close races. An isolated manager was temporarily changed to A-book: Black exchange filled one parent plus20 concurrent orders, and an LP-margin rejection created no orphan position. The fixture was restored to B-book after flat cleanup.</p><p><b>This is not a complete certification.</b> Exact controlled price paths, CDP network faults, deterministic partial fills/requotes/provider outages, scheduled/module behavior and internal database/CPU evidence remain explicitly unverified. Functional scale completeness passes do not establish internal timing or transaction atomicity.</p><p><b>Correction:</b> PAMM-FUNC-001 is withdrawn. The site's developer contract explicitly rounds exit payouts to 2 decimals; the two boundary observations match that contract. No new confirmed defect remains after contract review and exclusion of existing issues.</p><p><a href="all-case-results.csv">All 349 results CSV</a> · <a href="ALL_CASE_RESULTS.md">Markdown</a> · <a href="all-case-results.json">JSON</a> · <a href="FOLLOWUP.md">Follow-up details</a> · <a href="NEW_BUGS.md">Finding disposition</a> · <a href="evidence/abook-lp-results.json">A-book LP evidence</a> · <a href="evidence/phase3-status-transitions.json">Status changes</a> · <a href="evidence/phase3-final-state.json">Final account audit</a></p></section><section><h2>Every case</h2><input id="search" placeholder="Search case, result, evidence or blocker"><select id="status"><option value="">All statuses</option>OPTIONS</select><p id="shown"></p><table><thead><tr><th>Case</th><th>Result</th><th>Scenario / evidence</th><th>Actual outcome</th></tr></thead><tbody>ROWS</tbody></table></section>'''
head=head.replace('METRICS',''.join(f'<div class="metric"><strong>{v}</strong>{k}</div>'for k,v in counts.items())).replace('OPTIONS',''.join('<option>'+k+'</option>'for k in sorted(counts))).replace('ROWS',''.join(rows))
js="const q=document.querySelector('#search'),s=document.querySelector('#status'),rows=[...document.querySelectorAll('tbody tr')];function filter(){let n=0;for(const r of rows){r.hidden=!!s.value&&r.dataset.status!==s.value||!r.textContent.toLowerCase().includes(q.value.toLowerCase());if(!r.hidden)n++;}document.querySelector('#shown').textContent=n+' of '+rows.length+' case results';}q.oninput=filter;s.onchange=filter;filter();"
(R/'report.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>All349 PAMM results</title><style>'+style+'</style><main>'+head+'</main><script>'+js+'</script></html>')
print(json.dumps({'counts':counts,'status_changes':len(transitions)},indent=2))
