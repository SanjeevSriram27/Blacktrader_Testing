# New finding disposition

One new functional defect is confirmed after Chromium/network recovery. This finding is separate from the supplied project's existing issues.

## PAMM-FUNC-002 — Real chart order is also routed to Paper

**Severity:** High  
**Mapped case:** BTPAMM-F005 — FAIL

With Real (Hedging) selected and LIVE in both Orders and Trades, a single chart ask-price click opened one Real position and a second, distinct Paper position. The behavior reproduced on all three browser clicks. Each pair had the same symbol, quantity and timestamp but different order IDs.

Expected: one click routes only to the selected Real account.  
Actual: the click routes to both Real and Paper, creating unintended account exposure.

Cleanup completed: all three Real positions and all three mirrored Paper positions were closed; both accounts were flat, No throttling was restored, Real Hedging was disabled again, and the temporary watchlist symbol was removed.

Evidence: [Chromium UI observation](evidence/chromium-network-ui.txt).

## Correction: PAMM-FUNC-001 withdrawn

The earlier report proposed a defect because an accepted deposit of0.001 paid0.00 on a no-trade exit, while0.009 paid0.01. Those observations were reproduced and remain valid. However, the site's developer documentation explicitly specifies that exit payout is rounded to2 decimal places:

`payout = round(deposit + running_pnl - master_share, 2)`

The observed outcomes match that deployed contract. The earlier expected requirement to preserve fractional-cent principal exactly was not justified. PAMM-BND-001/002 now pass the documented contract, with the original expected text retained for audit. The proposed bug is withdrawn, not silently removed.

Evidence: [site unfollow contract](evidence/site-pamm-unfollow-contract.txt), [original precision reproductions](evidence/precision-reproduction.json), [phase2 result snapshot](evidence/phase2-case-snapshot.json).

## Existing topics left out

Existing join-key idempotency, consolidated payout-route404, fee-policy wording, own-manager directory visibility, previous netting pending/protection restrictions and other supplied issue claims were not filed again. Current isolated Real-Net pending and attached SL/TP requests succeeded; that is recorded as current capability with the historical reference expectation disclosed.

Raw harness failures are not new bugs. Earlier scale queries exceeded the documented500-row limit; history reconciliation initially used opening rather than closing order IDs; UI name comparison initially expected a field absent from individual investor responses. These harness assumptions were corrected and rerun. Equal-position stop-out priority remained inconclusive until a separate unequal-position test passed.

See [all349 current outcomes](ALL_CASE_RESULTS.md) and the [exclusion index](existing-findings-exclusion-index.json).
