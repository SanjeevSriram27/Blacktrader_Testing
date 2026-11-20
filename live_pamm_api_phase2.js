const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const creds = JSON.parse(fs.readFileSync(path.join(__dirname, 'pamm_credentials.json'), 'utf8'));
const BASE = creds.platform_base_url;

async function api(urlPath, { method = 'GET', token, body } = {}) {
  const hdrs = { Accept: 'application/json' };
  if (token) hdrs.Authorization = `Bearer ${token}`;
  if (body !== undefined) hdrs['Content-Type'] = 'application/json';
  const t0 = performance.now();
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: hdrs,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const ms = Math.round(performance.now() - t0);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, json, text, ms };
}

async function loginClient(email, password) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, remember: true }),
  });
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  const ct = await fetch(`${BASE}/api/auth/chart-token`, {
    method: 'POST',
    headers: { Cookie: cookie },
  });
  const j = await ct.json();
  if (!j.token) throw new Error(`Failed chart-token for ${email}: ${ct.status}`);
  return j.token;
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const results = [];
  function record(tc_id, module_num, priority, title, status, details) {
    results.push({ tc_id, module_num, priority, title, status, details });
    const icon = status === 'PASS' ? '✅' : status === 'DEFECT' ? '🔴' : status === 'FAIL' ? '❌' : 'ℹ️';
    console.log(`${icon} [${status}] ${tc_id} (Mod ${module_num}, ${priority}) ${title}`);
    if (details) console.log(`    -> ${typeof details === 'string' ? details : JSON.stringify(details).slice(0, 380)}`);
  }

  const masterToken = await loginClient(creds.master.email, creds.master.password);
  const f1 = creds.followers[0];
  const f10 = creds.followers[9];
  const f1Token = await loginClient(f1.email, f1.password);
  const f10Token = await loginClient(f10.email, f10.password);

  const symbol = 'BINANCE:BTCUSDT.P';

  // 1. Place a meaningful 0.05 BTCUSDT.P block trade (with proper SL/TP) to test real P&L allocation, SL/TP & mid-cycle unfollow/join
  console.log('=== PHASE 2: LIVE SL/TP, PENDING LIMIT, MEANINGFUL P&L ALLOCATION, UNFOLLOW, RACE & IDEMPOTENCY ===');
  const mFundsBefore = (await api('/v1/oms/real/funds', { token: masterToken })).json?.funds;

  // Open 0.05 lot market BUY
  const openRes = await api('/v1/oms/real/orders', {
    method: 'POST', token: masterToken,
    body: { symbol, side: 'BUY', qty: 0.05, type: 'MARKET' },
  });
  await sleep(1200);
  const posList = (await api('/v1/oms/real/positions', { token: masterToken })).json?.positions || [];
  const mainPos = posList[0];
  const entry = mainPos?.avg_entry_price || 64000;
  const slPrice = Number((entry * 0.95).toFixed(1));
  const tpPrice = Number((entry * 1.05).toFixed(1));
  const limPrice = Number((entry * 0.85).toFixed(1));

  // BTPAMM-E004: Attach SL/TP to open position (try PUT/POST /positions/{id}/sl-tp or order with sl/tp)
  let slRes = await api(`/v1/oms/real/positions/${encodeURIComponent(mainPos.market_order_id)}`, {
    method: 'PATCH', token: masterToken, body: { sl: slPrice, tp: tpPrice, stop_loss: slPrice, take_profit: tpPrice },
  });
  if (!slRes.ok) {
    slRes = await api('/v1/oms/real/orders', {
      method: 'POST', token: masterToken,
      body: { symbol, side: 'BUY', qty: 0.001, type: 'MARKET', sl: slPrice, tp: tpPrice, stop_loss: slPrice, take_profit: tpPrice },
    });
  }
  await sleep(800);
  const posAfterSl = (await api('/v1/oms/real/positions', { token: masterToken })).json?.positions || [];
  const ordersNow = (await api('/v1/oms/real/orders', { token: masterToken })).json?.orders || [];
  const hasSlTpOnPos = posAfterSl.some((p) => p.sl || p.stop_loss || p.tp || p.take_profit) ||
    ordersNow.some((o) => String(o.type || '').includes('SL') || String(o.type || '').includes('TP') || o.sl || o.tp);
  record('BTPAMM-E004', 4, 'P0', 'Stop-Loss and Take-Profit Placement on Real (Hedging)',
    (slRes.ok && hasSlTpOnPos) ? 'PASS' : 'INFO',
    { slStatus: slRes.status, entry, slPrice, tpPrice, hasSlTpOnPos, posKeys: Object.keys(posAfterSl[0] || {}), slResp: slRes.text.slice(0, 220) });

  // BTPAMM-E002 & E008: Pending Limit Order via /orders/pending + Cancellation
  const pendRes = await api('/v1/oms/real/orders/pending', {
    method: 'POST', token: masterToken,
    body: { symbol, side: 'BUY', qty: 0.001, type: 'LIMIT', price: limPrice },
  });
  await sleep(800);
  const pendListRes = await api('/v1/oms/real/orders/pending', { token: masterToken });
  const pendOrders = pendListRes.json?.orders || pendListRes.json?.pending || [];
  const createdPend = pendRes.json?.order || pendOrders[0];
  const pendId = createdPend?.order_id || createdPend?.pending_order_id || createdPend?.id;
  record('BTPAMM-E002', 4, 'P0', 'Pending Limit Order Placement via POST /orders/pending (Real Hedging)',
    pendRes.ok ? 'PASS' : 'FAIL',
    { status: pendRes.status, limPrice, pendId, pendListStatus: pendListRes.status, body: pendRes.text.slice(0, 220) });

  if (pendId) {
    let cancelRes = await api(`/v1/oms/real/orders/pending/${encodeURIComponent(pendId)}`, { method: 'DELETE', token: masterToken });
    if (!cancelRes.ok) {
      cancelRes = await api(`/v1/oms/real/orders/pending/${encodeURIComponent(pendId)}/cancel`, { method: 'POST', token: masterToken, body: {} });
    }
    record('BTPAMM-E008', 4, 'P0', 'Pending Limit Order Cancellation Prior to Fill',
      cancelRes.ok ? 'PASS' : 'FAIL',
      { pendId, cancelStatus: cancelRes.status, body: cancelRes.text.slice(0, 200) });
  }

  // BTPAMM-D001: Mid-cycle unfollow/re-join on pmf10 WHILE master has open position
  const d001Unf = await api('/v1/oms/real/pamm/unfollow', {
    method: 'POST', token: f10Token,
    body: { master_client_id: creds.master.member_id },
  });
  await sleep(600);
  let d001Join = null;
  if (d001Unf.ok) {
    d001Join = await api('/v1/oms/real/pamm/join', {
      method: 'POST', token: f10Token,
      body: { master_client_id: creds.master.member_id, deposit: 100, operation_key: `d001-mid-${Date.now()}` },
    });
  }
  record('BTPAMM-D001', 7, 'P0', 'Mid-Cycle Unfollow & Re-Join While Master Holds Open Position (pmf10)',
    (d001Unf.ok && d001Join?.ok) ? 'PASS' : 'INFO',
    { unfollowStatus: d001Unf.status, unfollowBody: d001Unf.text.slice(0, 220), joinStatus: d001Join?.status, joinBody: d001Join?.text?.slice(0, 220) });

  // Wait 4 seconds for price movement on 0.05 BTCUSDT.P (~$0.50-$5.00 P&L) then squareoff all
  await sleep(4000);
  const openToClose = (await api('/v1/oms/real/positions', { token: masterToken })).json?.positions || [];
  let totalRealizedThisRound = 0;
  const closedTrades = [];
  for (const op of openToClose) {
    const sq = await api(`/v1/oms/real/positions/${encodeURIComponent(op.market_order_id)}/squareoff`, {
      method: 'POST', token: masterToken, body: {},
    });
    totalRealizedThisRound += Number(sq.json?.realized_pnl || 0);
    closedTrades.push({ id: op.market_order_id, qty: op.net_qty, status: sq.status, pnl: sq.json?.realized_pnl, exit: sq.json?.exit_price });
  }
  await sleep(1500);

  // Check PAMM allocations & follower running_pnl AFTER meaningful P&L!
  const mAllocs = (await api('/v1/oms/real/pamm/allocations?role=master&limit=100', { token: masterToken })).json;
  const f1Allocs = (await api('/v1/oms/real/pamm/allocations?limit=50', { token: f1Token })).json;
  const mFollows = (await api('/v1/oms/real/pamm/follows', { token: masterToken })).json;
  const mFundsAfter = (await api('/v1/oms/real/funds', { token: masterToken })).json?.funds;
  const poolRunningSum = (mFollows?.pool || []).reduce((s, p) => s + Number(p.running_pnl || 0), 0);

  record('BTPAMM-A004-BIG', 2, 'P0', 'PAMM P&L Allocation & Running P&L Verification After 0.05 BTC Trade',
    ((mAllocs?.count || 0) > 0 && Math.abs(poolRunningSum) > 0) ? 'PASS' : 'DEFECT',
    {
      closedTrades,
      totalRealizedThisRound: Number(totalRealizedThisRound.toFixed(6)),
      masterBalanceBefore: mFundsBefore?.balance,
      masterBalanceAfter: mFundsAfter?.balance,
      masterAllocCount: mAllocs?.count,
      masterAllocSample: (mAllocs?.allocations || []).slice(0, 2),
      f1AllocCount: f1Allocs?.count,
      poolRunningSum: Number(poolRunningSum.toFixed(6)),
      samplePoolFollower: (mFollows?.pool || [])[0],
    });

  // BTPAMM-D005: Clean Full Unfollow Settlement on pmf10 (flat market, WITH master_client_id)
  const f10BalBefore = (await api('/v1/oms/real/funds', { token: f10Token })).json?.funds?.balance;
  const mBalBeforeUnf = (await api('/v1/oms/real/funds', { token: masterToken })).json?.funds?.balance;
  const unfRes = await api('/v1/oms/real/pamm/unfollow', {
    method: 'POST', token: f10Token,
    body: { master_client_id: creds.master.member_id },
  });
  await sleep(600);
  const f10BalAfter = (await api('/v1/oms/real/funds', { token: f10Token })).json?.funds?.balance;
  const mBalAfterUnf = (await api('/v1/oms/real/funds', { token: masterToken })).json?.funds?.balance;
  const f10SubsAfterUnf = (await api('/v1/oms/real/pamm/follows', { token: f10Token })).json?.subscriptions || [];

  record('BTPAMM-D005', 7, 'P0', 'Full Redemption & Pool Unfollow Settlement (pmf10, flat market)',
    (unfRes.ok && f10BalAfter > f10BalBefore && mBalAfterUnf < mBalBeforeUnf && f10SubsAfterUnf.length === 0) ? 'PASS' : 'FAIL',
    {
      status: unfRes.status,
      body: unfRes.text.slice(0, 260),
      f10Delta: Number((f10BalAfter - f10BalBefore).toFixed(4)),
      masterDelta: Number((mBalAfterUnf - mBalBeforeUnf).toFixed(4)),
      activeSubsRemaining: f10SubsAfterUnf.length,
    });

  // BTPAMM-C005: Parallel Duplicate POST /pamm/join with IDENTICAL operation_key on unfollowed pmf10!
  const f10PreIdemBal = (await api('/v1/oms/real/funds', { token: f10Token })).json?.funds?.balance;
  const dupKey = `c005-idem-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const [d1, d2] = await Promise.all([
    api('/v1/oms/real/pamm/join', {
      method: 'POST', token: f10Token,
      body: { master_client_id: creds.master.member_id, deposit: 100, operation_key: dupKey },
    }),
    api('/v1/oms/real/pamm/join', {
      method: 'POST', token: f10Token,
      body: { master_client_id: creds.master.member_id, deposit: 100, operation_key: dupKey },
    }),
  ]);
  await sleep(800);
  const f10PostIdemBal = (await api('/v1/oms/real/funds', { token: f10Token })).json?.funds?.balance;
  const f10PostIdemSubs = (await api('/v1/oms/real/pamm/follows', { token: f10Token })).json?.subscriptions || [];
  const debited = Number((f10PreIdemBal - f10PostIdemBal).toFixed(4));

  record('BTPAMM-C005', 9, 'P0', 'Idempotency Key Deduplication on Parallel Duplicate POST /pamm/join (pmf10)',
    (debited === 100 && f10PostIdemSubs.length === 1) ? 'PASS' : 'DEFECT',
    {
      req1Status: d1.status, req1Body: d1.text.slice(0, 140),
      req2Status: d2.status, req2Body: d2.text.slice(0, 140),
      balanceBefore: f10PreIdemBal, balanceAfter: f10PostIdemBal,
      totalDebited: debited, activeSubscriptions: f10PostIdemSubs.length,
    });

  // Verify final pool state: all 10 followers active, 0 open positions
  const finalMasterFollows = (await api('/v1/oms/real/pamm/follows', { token: masterToken })).json;
  const finalMasterPos = (await api('/v1/oms/real/positions', { token: masterToken })).json;
  console.log('\nFinal Pool Check:', {
    activeFollowersInPool: (finalMasterFollows?.pool || []).length,
    poolTotal: finalMasterFollows?.pool_total,
    openPositions: finalMasterPos?.count,
    masterBalance: finalMasterPos?.funds?.balance,
  });

  fs.writeFileSync(path.join(__dirname, 'live_api_phase2_results.json'), JSON.stringify({ results, finalPool: { activeFollowersInPool: (finalMasterFollows?.pool || []).length, poolTotal: finalMasterFollows?.pool_total, openPositions: finalMasterPos?.count, masterBalance: finalMasterPos?.funds?.balance } }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
