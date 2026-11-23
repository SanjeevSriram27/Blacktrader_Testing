# PAMM functional assessment

Open [report.html](report.html) for a searchable result for every one of349 cases. Download [CSV](all-case-results.csv), read [Markdown](ALL_CASE_RESULTS.md), or inspect [JSON](all-case-results.json). Each row includes expected behavior,actual result,evidence and the exact unresolved requirement where relevant.

Current result:226 PASS,1 FAIL,116 PARTIAL,0 BLOCKED and6 INCONCLUSIVE. The Chromium/network continuation converted feasible network cases to explicit outcomes and confirmed one new cross-account routing defect. On23 November, every one of the91 previously blocked PAMM rows received one live capability/precondition retest. Unverified rows are PARTIAL, not passes; the assessment is not a complete product certification.

The A-book follow-up temporarily routed isolated Manager I to Black exchange. One parent order mounted once,20 concurrent orders filled without rate-limit responses, and an LP-margin rejection created no orphan position. The fixture was flat and restored to B-book afterward. The repaired Chromium and fault proxy additionally exercised cut-before/cut-after, lost-response, reconnect and 3G order/close behavior. Exact LP partial-fill,requote and provider-outage assertions remain PARTIAL because their deterministic events are not exposed as isolated controls.

The prop APIs were identified as Challenges,Prop accounts and Prop payouts. All inspected `/admin/api/prop/*` routes returned404 in this installation, but none of the349 PAMM matrix rows maps to those prop workflows. Therefore no PAMM row was left BLOCKED solely under the prop exception.

Read [FOLLOWUP.md](FOLLOWUP.md) for completed tests,remaining limits,fixture changes and cleanup; [NEW_BUGS.md](NEW_BUGS.md) for the new cross-account routing defect,withdrawn precision finding and excluded issue topics; [summary.json](summary.json) for machine-readable counts.

## Rebuilding reports

Run `python3 scripts/update-phase3-report.py` from any directory. It uses the immutable phase2 snapshot plus reviewed phase3 evidence and explicit full-scenario scope overrides; it does not run trades. The original builder now invokes this final review step too. Report generation validates349 unique IDs,nonempty outcomes,concrete incomplete reasons and local evidence targets.

## Rerunning live QA

Scripts under `scripts/` include live mutating QA actions; inspect them before running. They use supplied credentials privately from the original project,not this output package. New fixture credentials are stored outside deliverables in the session's private work directory. Browser observations are recorded separately and cannot be recreated by rebuilding a report.

`phase3-final-audit.cjs` performs read-only account checks plus an intentionally rejected master-follow attempt. `scale-assessment.cjs`,admin fixture scripts,risk scripts and fee scripts create or change simulated QA balances,trades and relationships. Use only the already identified simulated accounts and fixtures. Final JSON audit contains no passwords or session tokens. Original11 supplied users remain separate from new scale/risk accounts.

Historical raw harness attempts are retained for traceability. Their failures must not be counted as confirmed product defects or distinct fully executed scenarios. Current case outcomes are authoritative in the all-case result files, with scope reviews in the report-generation script.
