import json,csv,pathlib,collections,html,re
out=pathlib.Path('outputs/PAMM_Functional_Assessment');ev=out/'evidence'
files=['api-results.json','timing-results.json','boundary-results.json','protection-results.json','allocation-results.json','fee-and-role-results.json']
reviewed=[]
for f in files:
 d=json.loads((ev/f).read_text())
 for r in d['results']:
  v={**r,'evidence':'evidence/'+f,'raw_status':r['status'],'review_note':''}
  if f=='timing-results.json':
   if r['id'] in ['PAMM-X04-05','PAMM-X04-06','PAMM-X04-08']:v.update(status='PASS',review_note='HTTP 400 correctly rejected invalid name and retained baseline; initial harness left this inconclusive.')
   if r['id']=='PAMM-X04-04':v.update(status='INCONCLUSIVE',review_note='Null fee maps to zero; default-value policy unconfirmed. Not filed.')
   if r['id']=='EXIT-CLOSE-TIMING-0':v.update(status='PASS',review_note='Exit rejected while eligible trade remained open; no cash settlement and subscription stayed active. Valid serialized outcome.')
   if r['id']=='PAMM-X14-06':v.update(status='INCONCLUSIVE',review_note='Exit while eligible trade is open is blocked by explicit platform rule. An exited-investor precondition was not reached.')
  if f=='boundary-results.json':
   if r['id']=='JOIN-KEY-REPLAY-AFTER-EXIT':v.update(status='EXCLUDED_EXISTING',review_note='Held out of new findings because existing reports cover join-key idempotency.')
   if r['id']=='POOL-NONZERO-CLOSE-COMPLETENESS':v.update(status='INCONCLUSIVE',review_note='Total P&L was approximately -0.001 and cent-rounded shares were zero. A later +0.50 cycle verified all ten rows.')
  if f=='protection-results.json' and r['id']=='PENDING-BUY-STOP-LIMIT':v.update(status='NOT_SUPPORTED',review_note='Endpoint explicitly supports LIMIT, STOP, SL, TP, P_SL and P_TP; unsupported STOP_LIMIT is not filed as a PAMM bug.')
  reviewed.append(v)
(out/'reviewed-checks.json').write_text(json.dumps(reviewed,indent=2))
manual=[
('PAMM-X15-01','PARTIAL','PAMM widget already mounted, with directory and subscription tabs. Add-widget creation path not exercised.'),
('PAMM-X15-03','PASS','Master directory Invest buttons disabled with role explanation.'),
('PAMM-X15-04','PASS','Settings opened with PM Master and 20 percent fee. Saved/restored 20 percent.'),
('PAMM-X15-07','PASS','Master active table showed ten investors, 100 deposits and 10 percent weights.'),
('PAMM-X15-08','PASS','Master History showed separated closed relationships and payout/fee columns.'),
('PAMM-X16-01','PASS','Follower one subscription displayed PM Master.'),
('PAMM-X16-02','PASS','Follower one displayed 100 invested.'),
('PAMM-X16-03','PASS','Follower one displayed 0.22 running PNL matching the API baseline at observation time.'),
('PAMM-X16-05','PASS','Leave preview showed 100 deposit, 0.22 running, 0.04 manager cut and 100.18 payout; Cancel dismissed it without settling.'),
('PAMM-X16-06','PASS','Run a pool disabled with explanation that prior followers cannot become managers.'),
('PAMM-X19-01','PASS','Supplied admin login succeeded and People/Members page loaded.'),
('PAMM-X19-02','PARTIAL','Supplied master visible in admin member table; member-ID search was not separately exercised.'),
('PAMM-X19-03','PARTIAL','Supplied follower one visible in admin member table; member-ID search was not separately exercised.')]
manual=[dict(id=i,status=s,details=t,evidence='evidence/follower-subscription.jpg; evidence/follower-exit-preview.jpg' if i.startswith('PAMM-X16') else 'Manual in-app browser observation; no screenshot saved for this check') for i,s,t in manual]
(out/'manual-observations.json').write_text(json.dumps(manual,indent=2))
cases=json.loads((out/'test-cases.json').read_text())
for case_id,amount in [('PAMM-BND-001',0.001),('PAMM-BND-002',0.009)]:
 if not any(c['id']==case_id for c in cases):
  cases.append(dict(id=case_id,area='Deposit principal precision',title=f'No-trade redemption preserves accepted ${amount} principal',preconditions='Supplied follower 10 simulated account; no open eligible trades; settle prior relationship first',steps=f'Capture cash; join PM Master with deposit {amount} and fresh operation_key; leave without trading; compare join debit and exit credit; restore normal $100 subscription',expected='Reject unsupported precision before debiting, or preserve the accepted principal exactly through zero-PNL settlement',priority='P2',source='Additional observed boundary scenario',status='FAIL',evidence='evidence/precision-reproduction.json'))
by={r['id']:r for r in reviewed} 
for r in manual:by[r['id']]=r
for c in cases:
 if c['id'] in by:
  r=by[c['id']];c.update(status=r['status'],evidence=r['evidence'])
 else:
  c.update(status='NOT_RUN',evidence='')
  if c['id'].startswith(('PAMM-X12','PAMM-X13')):c.update(status='BLOCKED',evidence='evidence/browser-recovery-results.json; standalone Chromium launch abort')
  if c['id'].startswith(('BTPAMM-R','BTPAMM-P','BTPAMM-M','BTPAMM-O','BTPAMM-C')):c.update(status='BLOCKED',evidence='Requires missing fixture, internal evidence, scale accounts, or infrastructure access; see README execution limits')
for c in cases:
 if c['id'] in ['PAMM-X06-01','PAMM-X06-02']:c.update(status='PARTIAL',evidence='evidence/api-results.json; fills and closes verified; micro-PNL allocation condition not fulfilled')
# Preserve original documentation expectations while marking narrower tested equivalents honestly.
links={'BTPAMM-F007':('PARTIAL','evidence/api-results.json; master UI disabled Invest; self-follow rejected; no join to unrelated pool'), 'BTPAMM-F008':('PASS','evidence/fee-and-role-results.json; follower role exclusivity'), 'BTPAMM-F009':('PARTIAL','evidence/api-results.json; supplied QA deposit 100 rather than reference 1000'), 'BTPAMM-F014':('PARTIAL','evidence/timing-results.json; API bounds checked; browser sanitizes signed input'), 'BTPAMM-A001':('PARTIAL','evidence/allocation-results.json; one parent and ten allocations; LP bridge audit not available'), 'BTPAMM-A002':('PARTIAL','Ten equal investors checked; reference 100-investor fixture not available'), 'BTPAMM-A003':('PARTIAL','evidence/allocation-results.json; weights total 100 percent for supplied ten investors'), 'BTPAMM-A004':('PARTIAL','evidence/allocation-results.json; +0.50 distributed as ten +0.05 allocations; reference 100-investor values not used'), 'BTPAMM-A013':('PASS','evidence/api-results.json; own follower allocation histories reconcile'), 'BTPAMM-A014':('PASS','evidence/api-results.json; role=master allocations returned'), 'BTPAMM-E001':('PASS','evidence/api-results.json; hedging market execution'), 'BTPAMM-E002':('PASS','evidence/api-results.json; supported pending route'), 'BTPAMM-E004':('PASS','evidence/protection-results.json; protection updates/clear'), 'BTPAMM-E006':('PASS','evidence/protection-results.json; 50 percent partial close'), 'BTPAMM-E008':('PASS','evidence/api-results.json; supported cancellation route'), 'BTPAMM-D005':('PASS','evidence/api-results.json; exit settlement and restoration'), 'BTPAMM-H010':('PARTIAL','evidence/fee-and-role-results.json; settle-on-exit, not old absent shares route'), 'BTPAMM-C004':('PASS','evidence/timing-results.json; accepted or explicit open-position rejection depending serialization'), 'BTPAMM-C005':('EXCLUDED_EXISTING','evidence/api-results.json; concurrent joins checked; replay-after-exit excluded from new reports')}
for c in cases:
 if c['id'].startswith('PAMM-BND-'):c.update(status='FAIL',evidence='evidence/precision-reproduction.json')
 if c['id'] in links:c['status'],c['evidence']=links[c['id']]
(out/'test-cases.json').write_text(json.dumps(cases,indent=2))
with (out/'test-cases.csv').open('w')as f:w=csv.DictWriter(f,fieldnames=list(cases[0]));w.writeheader();w.writerows(cases)
# Keep existing-report exclusion index compact; do not redistribute entire old artifacts.
old=json.loads((out/'existing-findings-exclusion-index.json').read_text());small=[];seen=set()
for x in old:
 r=x.get('record',x);title=r.get('title') or r.get('summary') or r.get('scenario') or '';id=r.get('bug_id')or r.get('tc_id')or r.get('id')or ''
 key=(str(id),str(title))
 if key in seen:continue
 seen.add(key);small.append(dict(id=id,title=title,source=x.get('source',''),status=r.get('status',''),disposition='Excluded from new bug claims; reference result may itself be inaccurate'))
(out/'existing-findings-exclusion-index.json').write_text(json.dumps(small,indent=2))
counts=collections.Counter(r['status'] for r in reviewed);matrix=collections.Counter(c['status'] for c in cases)
summary={'functional_cases':len(cases),'api_check_records':len(reviewed),'reviewed_api_status_counts':dict(counts),'manual_observation_records':len(manual),'precision_repetitions':4,'new_findings':1,'case_matrix_status_counts':dict(matrix),'complete_assessment':False,'notes':'Check records include repetitions, helper checks and cleanup. They are not distinct fully executed manual scenarios.'}
(out/'summary.json').write_text(json.dumps(summary,indent=2));print(summary)
# Lightweight local HTML report; no external assets or network dependencies.
rows=[]
for c in cases:
 esc=lambda s:html.escape(str(s))
 rows.append('<tr data-status="'+esc(c['status'])+'"><td>'+esc(c['id'])+'</td><td><span class="badge '+esc(c['status'])+'">'+esc(c['status'])+'</span></td><td>'+esc(c['area'])+'</td><td><details><summary>'+esc(c['title'])+'</summary><p><b>Preconditions</b><br>'+esc(c['preconditions']).replace('\n','<br>')+'</p><p><b>Steps</b><br>'+esc(c['steps']).replace('\n','<br>')+'</p><p><b>Expected</b><br>'+esc(c['expected'])+'</p><p><b>Evidence / limits</b><br>'+esc(c['evidence'])+'</p></details></td></tr>')
report='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PAMM functional assessment</title><style>body{font:15px/1.55 system-ui;margin:0;color:#17273d;background:#f4f6fa}main{max-width:1250px;margin:auto;padding:35px}h1{margin:0}a{color:#175bcb}section{background:white;padding:24px;border:1px solid #dce3ee;border-radius:12px;margin:20px 0}.metrics{display:flex;gap:12px;flex-wrap:wrap}.metric{background:#eaf0fa;padding:15px 25px;border-radius:10px}.metric strong{display:block;font-size:28px}input,select{font:inherit;padding:9px;border:1px solid #9cabbf;border-radius:6px}input{width:50%}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #e0e5ee;padding:10px}th{background:#eaf0fa;position:sticky;top:0}td:first-child{white-space:nowrap;font-family:monospace}.badge{font-size:11px;padding:3px 7px;background:#eaeef5;border-radius:4px}.PASS{background:#ddf6e9}.FAIL{background:#ffdfdf}.BLOCKED{background:#fff0ca}.PARTIAL,.INCONCLUSIVE{background:#e7e4ff}summary{cursor:pointer;font-weight:600}.note{border-left:4px solid #d09317;padding-left:15px}</style><main><h1>PAMM functional assessment</h1><p>19 November 2026 · lpadmin.blackfx.com · supplied simulated QA pool · functionality and concurrency</p><div class="metrics"><div class="metric"><strong>347</strong>designed functional cases</div><div class="metric"><strong>176</strong>API check records</div><div class="metric"><strong>13</strong>manual observation records</div><div class="metric"><strong>1</strong>new precision finding</div></div><section><h2>Result and coverage</h2><p class="note"><b>Assessment incomplete.</b> Check records include repeated variants and cleanup; they are not 176 distinct fully executed scenarios. Browser network recovery, cross-browser races and internal/scale fixtures remain unverified. A case marked PARTIAL is not a pass.</p><p>Concurrent close, cancellation, protection updates, partial-close races, join/unfollow concurrency, repeated subscription cycles and fee contracts were exercised. A +$0.50 parent trade created ten allocations of $0.05, with matching investor running balances.</p><p>Final state: zero open positions, zero pending orders, ten investors, $1,000 pooled principal, PM Master name and 20% fee. Test cash balances reflect simulated P&amp;L and brokerage; history was retained.</p><p>Reviewed API check records: COUNTS. Manual observations are recorded separately.</p><p><a href="NEW_BUGS.md">New finding and exclusions</a> · <a href="test-cases.csv">Manual case CSV</a> · <a href="reviewed-checks.json">Reviewed checks</a> · <a href="README.md">Run instructions and limits</a> · <a href="evidence/final-state.json">Final state evidence</a></p></section><section><h2>New finding: fractional principal changes on no-trade exit</h2><p>A $0.001 deposit is accepted and debited exactly, but pays out $0.00. A $0.009 deposit pays out $0.01. Both have zero P&amp;L and zero fee. Reproduced twice per amount with Playwright's API client; paired repetitions offset the cash differences.</p><p><a href="evidence/precision-reproduction.json">Exact reproduction evidence</a>. This is a proposed P2 functional precision defect, subject to confirmation of the intended fractional-deposit policy. Existing reported issues were excluded from new bug claims.</p></section><section><h2>Manual execution inventory</h2><p>Rows retain supplied reference assumptions; requirements such as NAV, HWM, failover or internal bridge behavior need product/fixture confirmation. A generated case is not proof that a feature exists.</p><input id="search" placeholder="Search ID, scenario, area or expected result…"><select id="status"><option value="">All statuses</option>OPTIONS</select><p id="shown"></p><table><thead><tr><th>Case ID</th><th>Status</th><th>Area</th><th>Scenario, steps and evidence</th></tr></thead><tbody>ROWS</tbody></table></section><section><h2>UI evidence</h2><p>Follower subscription and cancellation preview were observed before the final larger trade; displayed P&amp;L is historical evidence at capture time.</p><a href="evidence/follower-subscription.jpg"><img alt="Follower PAMM subscription" src="evidence/follower-subscription.jpg" style="width:100%"></a><a href="evidence/follower-exit-preview.jpg">Exit preview screenshot</a></section></main><script>const q=document.querySelector('#search'),s=document.querySelector('#status'),r=[...document.querySelectorAll('tbody tr')];function filter(){let n=0;for(const x of r){let yes=(!s.value||x.dataset.status===s.value)&&x.textContent.toLowerCase().includes(q.value.toLowerCase());x.hidden=!yes;if(yes)n++;}document.querySelector('#shown').textContent=n+' of '+r.length+' cases shown';}q.oninput=filter;s.onchange=filter;filter();</script></html>'''
report=report.replace('<strong>347</strong>',f'<strong>{len(cases)}</strong>').replace('COUNTS',html.escape(str(dict(counts)))).replace('OPTIONS',''.join('<option>'+k+'</option>'for k in sorted(matrix))).replace('ROWS',''.join(rows))
(out/'report.html').write_text(report)
