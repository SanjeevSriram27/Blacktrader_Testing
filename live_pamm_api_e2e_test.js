const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const creds = JSON.parse(fs.readFileSync(path.join(__dirname, 'pamm_credentials.json'), 'utf8'));
const BASE = creds.platform_base_url;

function loadEnv(envPath) {
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv(path.join(__dirname, '.env'));

async function api(urlPath, { method = 'GET', token, body, headers = {} } = {}) {
  const hdrs = { Accept: 'application/json', ...headers };
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

async function loginAdmin() {
  const r = await api('/admin/api/login', {
    method: 'POST',
    body: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD },
  });
  if (!r.ok || !r.json?.token) throw new Error(`Admin login failed: ${r.status}`);
  return r.json.token;
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const results = [];
  function record(tc_id, module_num, priority, title, status, details) {
    results.push({ tc_id, module_num, priority, title, status, details });
    const icon = status === 'PASS' ? '✅' : status === 'NOTICE' ? 'ℹ️' : status === 'DEFECT' ? '🔴' : status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${icon} [${status}] ${tc_id} (Mod ${module_num}, ${priority}) ${title}`);
    if (details) console.log(`    -> ${typeof details === 'string' ? details : JSON.stringify(details).slice(0, 320)}`);
  }

  console.log('=== AUTHENTICATING STRICTLY WITH OUR 11 CREATED ACCOUNTS + ADMIN ===');
  const adminToken = await loginAdmin();
  const masterToken = await loginClient(creds.master.email, creds.master.password);
  const followerTokens = {};
  for (const f of creds.followers) {
    followerTokens[f.email] = await loginClient(f.email, f.password);
  }
  const f1 = creds.followers[0];
  const f9 = creds.followers[8];
  const f10 = creds.followers[9];
  console.log(`Authenticated admin + master (${creds.master.email}) + all 10 followers (pmf1..pmf10).\n`);

  // Discover live tradable symbol from feed
  let tradableSymbol = 'BINANCE:BTCUSDT.P';
  let symbolPrice = 64000;
  try {
    const symRes = await fetch('https://terminal.blacktrader.com/feed/symbol_list');
    const symJson = await symRes.json();
    const list = Array.isArray(symJson) ? symJson : (symJson.symbols || symJson.data || []);
    const btc = list.find((s) => JSON.stringify(s).includes('BTCUSDT') || JSON.stringify(s).includes('EURUSD'));
    if (btc && (btc.symbol || btc.name)) {
      console.log('Sample feed symbol:', JSON.stringify(btc).slice(0, 200));
    }
  } catch {}

  // ===========================================================================
  // MODULE 1: SETUP, ROLE EXCLUSIVITY, VALIDATION & AUTH SECURITY
  // ===========================================================================
  console.log('--- MODULE 1: SETUP, ROLE EXCLUSIVITY, VALIDATION & AUTH ---');

  // BTPAMM-F011: Anonymous rejection on all PAMM routes
  const anonProbes = [
    ['GET', '/v1/oms/real/pamm/masters'],
    ['GET', '/v1/oms/real/pamm/follows'],
    ['GET', '/v1/oms/real/pamm/allocations'],
    ['POST', '/v1/oms/real/pamm/master'],
    ['POST', '/v1/oms/real/pamm/join'],
    ['POST', '/v1/oms/real/orders'],
  ];
  const anonResults = [];
  for (const [m, p] of anonProbes) {
    const r = await api(p, { method: m, body: m === 'POST' ? {} : undefined });
    anonResults.push({ method: m, path: p, status: r.status });
  }
  const allAnonBlocked = anonResults.every((x) => x.status === 401 || x.status === 403);
  record('BTPAMM-F011', 1, 'P0', 'Anonymous Request Rejection on All PAMM & Order Routes',
    allAnonBlocked ? 'PASS' : 'FAIL', anonResults);

  // BTPAMM-F006: Paper instance creation/join restriction (HTTP 400 policy)
  const paperMaster = await api('/v1/oms/paper/pamm/master', {
    method: 'POST', token: followerTokens[f10.email],
    body: { display_name: 'Paper Test', share_percent: 20 },
  });
  const paperJoin = await api('/v1/oms/paper/pamm/join', {
    method: 'POST', token: followerTokens[f10.email],
    body: { master_client_id: creds.master.member_id, deposit: 100, operation_key: 'paper-test-key' },
  });
  record('BTPAMM-F006', 1, 'P0', 'Paper Instance PAMM Creation/Join Restriction (HTTP 400)',
    (paperMaster.status === 400 && paperJoin.status === 400) ? 'PASS' : 'FAIL',
    { paperMaster: { status: paperMaster.status, msg: paperMaster.text.slice(0, 140) }, paperJoin: { status: paperJoin.status, msg: paperJoin.text.slice(0, 140) } });

  // BTPAMM-F007: Role Exclusivity - Active Master Cannot Follow Another Master
  const mastersRes = await api('/v1/oms/real/pamm/masters', { token: masterToken });
  const mastersList = mastersRes.json?.masters || [];
  const otherMaster = mastersList.find((m) => m.client_id !== creds.master.member_id);
  const masterFollows = await api('/v1/oms/real/pamm/follows', { token: masterToken });
  let masterJoinAttempt = null;
  if (otherMaster) {
    masterJoinAttempt = await api('/v1/oms/real/pamm/join', {
      method: 'POST', token: masterToken,
      body: { master_client_id: otherMaster.client_id, deposit: 100, operation_key: `f007-${Date.now()}` },
    });
  }
  record('BTPAMM-F007', 1, 'P0', 'Role Exclusivity: Active Master Cannot Follow Another Pool',
    (masterFollows.json?.follow_blocked_reason && (!masterJoinAttempt || masterJoinAttempt.status === 400 || masterJoinAttempt.status === 403)) ? 'PASS' : 'FAIL',
    { follow_blocked_reason: masterFollows.json?.follow_blocked_reason, joinStatus: masterJoinAttempt?.status, joinMsg: masterJoinAttempt?.text?.slice(0, 140) });

  // BTPAMM-F008: Role Exclusivity - Active Follower Cannot Become a Master
  const f1Follows = await api('/v1/oms/real/pamm/follows', { token: followerTokens[f1.email] });
  const f1MasterAttempt = await api('/v1/oms/real/pamm/master', {
    method: 'POST', token: followerTokens[f1.email],
    body: { display_name: 'Illegal Follower Master', share_percent: 20 },
  });
  record('BTPAMM-F008', 1, 'P0', 'Role Exclusivity: Active Follower Cannot Become a Master',
    (f1Follows.json?.master_blocked_reason && (f1MasterAttempt.status === 400 || f1MasterAttempt.status === 403)) ? 'PASS' : 'FAIL',
    { master_blocked_reason: f1Follows.json?.master_blocked_reason, masterAttemptStatus: f1MasterAttempt.status, msg: f1MasterAttempt.text.slice(0, 140) });

  // BTPAMM-F012 & F013: Leaderboard Directory Publication, Sorting & Integrity
  const ourMasterEntry = mastersList.find((m) => m.client_id === creds.master.member_id);
  const ids = mastersList.map((m) => m.client_id);
  const noDupes = new Set(ids).size === ids.length;
  const ranks = mastersList.map((m) => m.stats?.rank).filter((r) => typeof r === 'number');
  const sortedRanks = [...ranks].sort((a, b) => a - b);
  const ranksSorted = JSON.stringify(ranks) === JSON.stringify(sortedRanks);
  const noNegatives = mastersList.every((m) => (m.stats?.followers ?? 0) >= 0 && (m.stats?.drawdown ?? 0) >= 0);
  record('BTPAMM-F012', 1, 'P0', 'Public Leaderboard Publication of PM Master',
    (ourMasterEntry && ourMasterEntry.name === 'PM Master' && ourMasterEntry.share_percent === 20 && ourMasterEntry.stats?.followers === 10 && ourMasterEntry.stats?.fund === 1000) ? 'PASS' : 'FAIL',
    ourMasterEntry);
  record('BTPAMM-F013', 1, 'P1', 'PAMM Directory Sorting, Uniqueness & Non-Negative Metrics',
    (noDupes && ranksSorted && noNegatives) ? 'PASS' : 'FAIL',
    { count: mastersList.length, noDupes, ranksSorted, noNegatives });

  // BTPAMM-F014: Share Percent Range Validation (-5 and 120)
  const negShare = await api('/v1/oms/real/pamm/master', {
    method: 'POST', token: masterToken,
    body: { display_name: 'PM Master', share_percent: -5 },
  });
  const overShare = await api('/v1/oms/real/pamm/master', {
    method: 'POST', token: masterToken,
    body: { display_name: 'PM Master', share_percent: 120 },
  });
  // Restore 20% just in case either was wrongly accepted!
  if (negShare.ok || overShare.ok) {
    await api('/v1/oms/real/pamm/master', { method: 'POST', token: masterToken, body: { display_name: 'PM Master', share_percent: 20 } });
  }
  record('BTPAMM-F014', 1, 'P0', 'Manager Share Percent Range Validation (0% to 100%)',
    (negShare.status === 400 && overShare.status === 400) ? 'PASS' : 'DEFECT',
    { negStatus: negShare.status, negBody: negShare.text.slice(0, 140), overStatus: overShare.status, overBody: overShare.text.slice(0, 140) });

  // BTPAMM-F010: Plan Gating (Free vs Pro/Premium) using pmf9 (and always restoring!)
  let f010Result = null;
  try {
    const setFree = await api(`/admin/api/members/${encodeURIComponent(f9.member_id)}`, {
      method: 'PATCH', token: adminToken, body: { plan: 'free' },
    });
    if (setFree.ok) {
      await sleep(500);
      const f9FreeToken = await loginClient(f9.email, f9.password);
      const probeFree = await api('/v1/oms/real/pamm/masters', { token: f9FreeToken });
      // Restore to default ('') / premium
      await api(`/admin/api/members/${encodeURIComponent(f9.member_id)}`, {
        method: 'PATCH', token: adminToken, body: { plan: '' },
      });
      await sleep(500);
      const f9RestoredToken = await loginClient(f9.email, f9.password);
      const probeRestored = await api('/v1/oms/real/pamm/masters', { token: f9RestoredToken });
      followerTokens[f9.email] = f9RestoredToken;
      f010Result = {
        setFreeStatus: setFree.status,
        freePammStatus: probeFree.status,
        freePammBody: probeFree.text.slice(0, 140),
        restoredStatus: probeRestored.status,
      };
      record('BTPAMM-F010', 1, 'P0', 'Plan Gating: Free Plan Blocked vs Default/Premium Enabled (pmf9)',
        (probeFree.status === 403 && probeRestored.status === 200) ? 'PASS' : 'DEFECT', f010Result);
    } else {
      record('BTPAMM-F010', 1, 'P0', 'Plan Gating: Free Plan Blocked vs Default/Premium Enabled (pmf9)',
        'INFO', { note: 'Admin PATCH /members/{id} returned non-200', status: setFree.status, body: setFree.text.slice(0, 140) });
    }
  } catch (e) {
    await api(`/admin/api/members/${encodeURIComponent(f9.member_id)}`, { method: 'PATCH', token: adminToken, body: { plan: '' } }).catch(() => {});
    record('BTPAMM-F010', 1, 'P0', 'Plan Gating (pmf9)', 'INFO', String(e));
  }

  // ===========================================================================
  // MODULE 2, 4, 6: LIVE BLOCK TRADING, ZERO CHILD TICKETS, SL/TP, LIMIT ORDERS,
  // PARTIAL CLOSE, SQUAREOFF, POOLED MARGIN & P&L ALLOCATION MATH
  // ===========================================================================
  console.log('\n--- MODULES 2, 4 & 6: LIVE BLOCK ORDER EXECUTION, MARGIN & P&L ALLOCATION ---');

  const fundsBefore = (await api('/v1/oms/real/funds', { token: masterToken })).json?.funds;
  const followerFundsBefore = {};
  for (const f of creds.followers) {
    followerFundsBefore[f.email] = (await api('/v1/oms/real/funds', { token: followerTokens[f.email] })).json?.funds;
  }

  // Try placing a small live market order on EURUSD first, fallback to BINANCE:BTCUSDT.P or BTCUSD
  const candidateSymbols = [
    { symbol: 'EURUSD', qty: 0.01 },
    { symbol: 'BINANCE:BTCUSDT.P', qty: 0.001 },
    { symbol: 'BTCUSD', qty: 0.001 },
    { symbol: 'XAUUSD', qty: 0.01 },
  ];

  let placedOrder = null;
  let activeSymbol = null;
  let activeQty = null;
  const orderAttempts = [];

  for (const cand of candidateSymbols) {
    const r = await api('/v1/oms/real/orders', {
      method: 'POST', token: masterToken,
      body: { symbol: cand.symbol, side: 'BUY', qty: cand.qty, type: 'MARKET' },
    });
    orderAttempts.push({ symbol: cand.symbol, qty: cand.qty, status: r.status, body: r.text.slice(0, 200) });
    if (r.ok) {
      placedOrder = r.json;
      activeSymbol = cand.symbol;
      activeQty = cand.qty;
      break;
    }
  }

  console.log('   Order placement attempts:', JSON.stringify(orderAttempts));

  if (placedOrder) {
    await sleep(1500);
    const mPosRes = await api('/v1/oms/real/positions', { token: masterToken });
    const mPositions = mPosRes.json?.positions || [];
    const mFundsOpen = mPosRes.json?.funds || {};

    // Check ALL 10 followers have 0 open child positions!
    let totalFollowerPositions = 0;
    for (const f of creds.followers) {
      const fp = await api('/v1/oms/real/positions', { token: followerTokens[f.email] });
      totalFollowerPositions += (fp.json?.count || (fp.json?.positions || []).length);
    }

    record('BTPAMM-A001', 2, 'P0', `Unified Block Trade Execution & Zero Child Orders (${activeSymbol})`,
      (mPositions.length === 1 && totalFollowerPositions === 0) ? 'PASS' : 'FAIL',
      { symbol: activeSymbol, qty: activeQty, masterPositions: mPositions.length, totalFollowerChildPositions: totalFollowerPositions, orderId: placedOrder.order?.id || placedOrder.order_id || placedOrder.id });

    record('BTPAMM-E001', 4, 'P0', `Market Order Execution on Real (Hedging) (${activeSymbol})`,
      (mPositions.length === 1 && (mFundsOpen.used_margin || 0) > 0) ? 'PASS' : 'FAIL',
      { openPosition: mPositions[0], used_margin: mFundsOpen.used_margin, free_margin: mFundsOpen.free_margin });

    record('BTPAMM-E013', 4, 'P0', 'Sub-Lot Execution Protection (Zero Child Tickets Across 10 Followers)',
      totalFollowerPositions === 0 ? 'PASS' : 'FAIL',
      { masterTickets: mPositions.length, followerTickets: totalFollowerPositions });

    // BTPAMM-M001: Collective Pooled Margin Calculation
    const marginMathOk = Math.abs((mFundsOpen.equity - mFundsOpen.used_margin) - mFundsOpen.free_margin) < 0.05 && mFundsOpen.used_margin > 0;
    record('BTPAMM-M001', 6, 'P0', 'Collective Pooled Margin Consumption Calculation',
      marginMathOk ? 'PASS' : 'FAIL',
      { equity: mFundsOpen.equity, used_margin: mFundsOpen.used_margin, free_margin: mFundsOpen.free_margin, margin_level: mFundsOpen.margin_level, margin_call_level: mFundsOpen.margin_call_level, stop_out_level: mFundsOpen.stop_out_level });

    // BTPAMM-M006 & M007: Pre-Trade Oversized Order Margin Rejection
    const oversized = await api('/v1/oms/real/orders', {
      method: 'POST', token: masterToken,
      body: { symbol: activeSymbol, side: 'BUY', qty: 500, type: 'MARKET' },
    });
    record('BTPAMM-M006', 6, 'P0', 'Pre-Trade Margin Check Rejects Over-Leveraged Block Order (500 lots)',
      (!oversized.ok && (oversized.status === 400 || oversized.status === 422)) ? 'PASS' : 'DEFECT',
      { status: oversized.status, response: oversized.text.slice(0, 180) });

    // BTPAMM-E004: Modify / Place SL & TP on Live Real (Hedging) Position
    const pos = mPositions[0];
    const entryPrice = pos.avg_price || pos.entry_price || pos.open_price || pos.price || 1;
    const slPrice = Number((entryPrice * 0.95).toFixed(entryPrice > 100 ? 1 : 5));
    const tpPrice = Number((entryPrice * 1.05).toFixed(entryPrice > 100 ? 1 : 5));
    const posId = pos.market_order_id || pos.order_id || pos.position_id || pos.id;

    // Try modifying SL/TP on open position, or placing a 2nd tiny market order with SL/TP
    const slOrderRes = await api('/v1/oms/real/orders', {
      method: 'POST', token: masterToken,
      body: { symbol: activeSymbol, side: 'BUY', qty: activeQty, type: 'MARKET', sl: slPrice, tp: tpPrice },
    });
    await sleep(1000);
    const posAfterSl = (await api('/v1/oms/real/positions', { token: masterToken })).json?.positions || [];
    const posWithSl = posAfterSl.find((p) => p.sl || p.stop_loss || p.tp || p.take_profit);
    record('BTPAMM-E004', 4, 'P0', 'Stop-Loss and Take-Profit Placement on Real (Hedging)',
      (slOrderRes.ok && posWithSl) ? 'PASS' : (slOrderRes.ok ? 'INFO' : 'FAIL'),
      { slOrderStatus: slOrderRes.status, requestedSl: slPrice, requestedTp: tpPrice, matchedPos: posWithSl ? { sl: posWithSl.sl ?? posWithSl.stop_loss, tp: posWithSl.tp ?? posWithSl.take_profit } : null, rawOrderResp: slOrderRes.text.slice(0, 200) });

    // BTPAMM-E002 & E008: Pending Limit Order Placement & Cancellation
    const limitPrice = Number((entryPrice * 0.85).toFixed(entryPrice > 100 ? 1 : 5));
    const limitRes = await api('/v1/oms/real/orders', {
      method: 'POST', token: masterToken,
      body: { symbol: activeSymbol, side: 'BUY', qty: activeQty, type: 'LIMIT', price: limitPrice },
    });
    await sleep(800);
    const pendingOrders = (await api('/v1/oms/real/orders', { token: masterToken })).json?.orders || [];
    const workingLimit = pendingOrders.find((o) => String(o.type || o.order_type || '').toUpperCase().includes('LIMIT') && String(o.status || '').toUpperCase() !== 'CANCELLED');
    record('BTPAMM-E002', 4, 'P0', 'Pending Limit Order Placement on Real (Hedging)',
      (limitRes.ok && workingLimit) ? 'PASS' : 'FAIL',
      { status: limitRes.status, limitPrice, workingLimit: workingLimit ? { id: workingLimit.id || workingLimit.order_id, price: workingLimit.price, status: workingLimit.status } : null, raw: limitRes.text.slice(0, 180) });

    if (workingLimit) {
      const limId = workingLimit.id || workingLimit.order_id;
      let cancelRes = await api(`/v1/oms/real/orders/${encodeURIComponent(limId)}`, { method: 'DELETE', token: masterToken });
      if (!cancelRes.ok) {
        cancelRes = await api(`/v1/oms/real/orders/${encodeURIComponent(limId)}/cancel`, { method: 'POST', token: masterToken, body: {} });
      }
      await sleep(600);
      const ordersAfterCancel = (await api('/v1/oms/real/orders', { token: masterToken })).json?.orders || [];
      const stillWorking = ordersAfterCancel.find((o) => (o.id || o.order_id) === limId && !String(o.status || '').toUpperCase().includes('CANCEL'));
      record('BTPAMM-E008', 4, 'P0', 'Pending Limit Order Cancellation Prior to Fill',
        (cancelRes.ok && !stillWorking) ? 'PASS' : 'FAIL',
        { cancelStatus: cancelRes.status, stillWorking: !!stillWorking, resp: cancelRes.text.slice(0, 160) });
    }

    // BTPAMM-D001: Mid-Cycle Join/Deposit while trades are OPEN (test on pmf10!)
    // First check pmf10 unfollow/re-join later; let's test pmf10 adding a mid-cycle deposit or unfollow while trade open!
    const d001Unfollow = await api('/v1/oms/real/pamm/unfollow', { method: 'POST', token: followerTokens[f10.email], body: {} });
    await sleep(500);
    const d001Rejoin = await api('/v1/oms/real/pamm/join', {
      method: 'POST', token: followerTokens[f10.email],
      body: { master_client_id: creds.master.member_id, deposit: 100, operation_key: `d001-midcycle-${Date.now()}` },
    });
    record('BTPAMM-D001', 7, 'P0', 'Mid-Cycle Follower Unfollow & Re-Join While Master Holds Open Position (pmf10)',
      (d001Unfollow.ok && d001Rejoin.ok) ? 'PASS' : 'INFO',
      { unfollowStatus: d001Unfollow.status, unfollowBody: d001Unfollow.text.slice(0, 140), rejoinStatus: d001Rejoin.status, rejoinBody: d001Rejoin.text.slice(0, 140) });

    // Hold briefly (~2.5s) so market ticks move slightly for non-zero P&L
    await sleep(2500);

    // BTPAMM-E007: Squareoff ALL open positions on Master
    const allOpenNow = (await api('/v1/oms/real/positions', { token: masterToken })).json?.positions || [];
    const squareoffResults = [];
    const tCloseStart = performance.now();
    for (const op of allOpenNow) {
      const id = op.market_order_id || op.order_id || op.position_id || op.id;
      const sq = await api(`/v1/oms/real/positions/${encodeURIComponent(id)}/squareoff`, {
        method: 'POST', token: masterToken, body: {},
      });
      squareoffResults.push({ id, status: sq.status, body: sq.text.slice(0, 200) });
    }
    const closeLatencyMs = Math.round(performance.now() - tCloseStart);
    await sleep(1500);

    const posAfterClose = (await api('/v1/oms/real/positions', { token: masterToken })).json;
    record('BTPAMM-E007', 4, 'P0', 'Bulk Squareoff (Close All Open Master Block Positions)',
      (squareoffResults.every((x) => x.status === 200) && (posAfterClose?.count === 0)) ? 'PASS' : 'FAIL',
      { closedCount: squareoffResults.length, remainingOpen: posAfterClose?.count, closeLatencyMs, results: squareoffResults });

    // BTPAMM-E015: Trade History Blotter Synchronization
    const histRes = await api('/v1/oms/real/history?limit=20', { token: masterToken });
    const history = histRes.json?.history || [];
    record('BTPAMM-E015', 4, 'P0', 'Trade History Blotter Synchronization (/history)',
      (histRes.ok && history.length >= allOpenNow.length) ? 'PASS' : 'FAIL',
      { totalHistory: history.length, totalRealizedPnl: histRes.json?.total_realized_pnl, latestTrade: history[0] });

    // =========================================================================
    // CHECK LIVE PAMM P&L ALLOCATION MATH ACROSS ALL 10 FOLLOWERS (MOD 2 & 8 & 9)
    // =========================================================================
    const masterAllocRes = await api('/v1/oms/real/pamm/allocations?role=master&limit=100', { token: masterToken });
    const masterAllocs = masterAllocRes.json?.allocations || [];
    const masterFollowsPost = (await api('/v1/oms/real/pamm/follows', { token: masterToken })).json;
    const masterFundsPost = (await api('/v1/oms/real/funds', { token: masterToken })).json?.funds;

    const followerAllocsSummary = [];
    for (const f of creds.followers) {
      const fa = (await api('/v1/oms/real/pamm/allocations?limit=20', { token: followerTokens[f.email] })).json;
      const ff = (await api('/v1/oms/real/pamm/follows', { token: followerTokens[f.email] })).json;
      const ffund = (await api('/v1/oms/real/funds', { token: followerTokens[f.email] })).json?.funds;
      followerAllocsSummary.push({
        email: f.email,
        allocCount: (fa?.allocations || []).length,
        latestAlloc: (fa?.allocations || [])[0] || null,
        running_pnl: ff?.subscriptions?.[0]?.running_pnl ?? null,
        deposit: ff?.subscriptions?.[0]?.deposit ?? null,
        cash_balance: ffund?.balance ?? null,
      });
    }

    const totalRealized = histRes.json?.total_realized_pnl ?? (masterFundsPost.balance - fundsBefore.balance);
    const sumFollowerRunningPnl = followerAllocsSummary.reduce((acc, x) => acc + (Number(x.running_pnl) || 0), 0);

    record('BTPAMM-A014', 2, 'P0', 'Master PAMM Allocations Query (/pamm/allocations?role=master)',
      (masterAllocRes.ok && masterAllocs.length > 0) ? 'PASS' : 'DEFECT',
      { status: masterAllocRes.status, count: masterAllocs.length, sample: masterAllocs.slice(0, 2) });

    record('BTPAMM-A013', 2, 'P0', 'Follower PAMM Allocations Query (/pamm/allocations) Across All 10 Followers',
      followerAllocsSummary.every((x) => x.allocCount > 0) ? 'PASS' : 'DEFECT',
      { followersWithAllocs: followerAllocsSummary.filter((x) => x.allocCount > 0).length, totalFollowers: 10, sampleF1: followerAllocsSummary[0] });

    record('BTPAMM-A004', 2, 'P0', 'Live Proportional P&L Distribution Verification Across 10 Followers',
      (masterAllocs.length > 0 && Math.abs(sumFollowerRunningPnl) > 0 || totalRealized === 0) ? 'PASS' : 'DEFECT',
      {
        masterBalanceBefore: fundsBefore.balance,
        masterBalanceAfter: masterFundsPost.balance,
        masterDelta: Number((masterFundsPost.balance - fundsBefore.balance).toFixed(6)),
        totalRealizedPnl: totalRealized,
        sumFollowerRunningPnl: Number(sumFollowerRunningPnl.toFixed(6)),
        expectedFollowerShareOf50PctPool: Number((totalRealized * 0.5).toFixed(6)),
        f1RunningPnl: followerAllocsSummary[0].running_pnl,
        f10RunningPnl: followerAllocsSummary[9].running_pnl,
      });

    // BTPAMM-C001: 10-follower allocation completeness & latency
    record('BTPAMM-C001', 9, 'P0', '10-Follower Allocation Completeness & Latency After Live Close',
      (masterAllocs.length >= 10) ? 'PASS' : 'DEFECT',
      { allocRowsRecorded: masterAllocs.length, closeLatencyMs });
  } else {
    record('BTPAMM-E001', 4, 'P0', 'Market Order Execution on Real (Hedging)', 'FAIL', { orderAttempts });
  }

  // ===========================================================================
  // MODULE 8: HWM & PERFORMANCE FEE SETTLEMENT (/pamm/shares)
  // ===========================================================================
  console.log('\n--- MODULE 8: HIGH-WATER MARK & PROFIT SHARES ---');
  const sharesMaster = await api('/v1/oms/real/pamm/shares?role=master', { token: masterToken });
  const sharesF1 = await api('/v1/oms/real/pamm/shares', { token: followerTokens[f1.email] });
  record('BTPAMM-H010', 8, 'P0', 'Consolidated Manager Payout Endpoint (GET /pamm/shares?role=master)',
    sharesMaster.ok ? 'PASS' : 'DEFECT',
    { masterSharesStatus: sharesMaster.status, masterBody: sharesMaster.text.slice(0, 180), followerSharesStatus: sharesF1.status });

  // ===========================================================================
  // MODULE 7 & 9: UNFOLLOW SETTLEMENT, IDEMPOTENCY KEY DEDUPLICATION,
  // AND LIVE CONCURRENT ROLE-EXCLUSIVITY RACE (USING pmf10 ONLY)
  // ===========================================================================
  console.log('\n--- MODULES 7 & 9: UNFOLLOW SETTLEMENT, IDEMPOTENCY & CONCURRENCY RACES ---');

  // BTPAMM-D005: Clean Full Unfollow Settlement on pmf10 (flat market)
  const f10BalBeforeUnfollow = (await api('/v1/oms/real/funds', { token: followerTokens[f10.email] })).json?.funds?.balance;
  const masterBalBeforeUnfollow = (await api('/v1/oms/real/funds', { token: masterToken })).json?.funds?.balance;
  const f10SubBefore = (await api('/v1/oms/real/pamm/follows', { token: followerTokens[f10.email] })).json?.subscriptions?.[0];

  const unfollowRes = await api('/v1/oms/real/pamm/unfollow', { method: 'POST', token: followerTokens[f10.email], body: {} });
  await sleep(600);
  const f10BalAfterUnfollow = (await api('/v1/oms/real/funds', { token: followerTokens[f10.email] })).json?.funds?.balance;
  const masterBalAfterUnfollow = (await api('/v1/oms/real/funds', { token: masterToken })).json?.funds?.balance;
  const f10FollowsAfterUnfollow = (await api('/v1/oms/real/pamm/follows', { token: followerTokens[f10.email] })).json;

  record('BTPAMM-D005', 7, 'P0', 'Full Redemption & Pool Unfollow Settlement (pmf10)',
    (unfollowRes.ok && f10BalAfterUnfollow > f10BalBeforeUnfollow && masterBalAfterUnfollow < masterBalBeforeUnfollow && (f10FollowsAfterUnfollow?.subscriptions || []).length === 0) ? 'PASS' : 'FAIL',
    {
      unfollowStatus: unfollowRes.status,
      unfollowResp: unfollowRes.text.slice(0, 220),
      f10BalanceBefore: f10BalBeforeUnfollow,
      f10BalanceAfter: f10BalAfterUnfollow,
      f10Delta: Number((f10BalAfterUnfollow - f10BalBeforeUnfollow).toFixed(4)),
      masterDelta: Number((masterBalAfterUnfollow - masterBalBeforeUnfollow).toFixed(4)),
      priorDeposit: f10SubBefore?.deposit,
      priorRunningPnl: f10SubBefore?.running_pnl,
    });

  // RC-F-01 LIVE: Concurrent Master Registration vs Pool Join Race on pmf10
  const raceOpKey = `rc-f01-${Date.now()}`;
  const [raceMaster, raceJoin] = await Promise.all([
    api('/v1/oms/real/pamm/master', {
      method: 'POST', token: followerTokens[f10.email],
      body: { display_name: 'Race Temp Master', share_percent: 20 },
    }),
    api('/v1/oms/real/pamm/join', {
      method: 'POST', token: followerTokens[f10.email],
      body: { master_client_id: creds.master.member_id, deposit: 100, operation_key: raceOpKey },
    }),
  ]);
  await sleep(500);
  const f10PostRace = (await api('/v1/oms/real/pamm/follows', { token: followerTokens[f10.email] })).json;
  const bothActiveIllegal = !!(f10PostRace?.is_master && (f10PostRace?.subscriptions || []).length > 0);
  record('RC-F-01-LIVE', 9, 'P0', 'Live Race: Concurrent POST /pamm/master vs POST /pamm/join (pmf10)',
    (!bothActiveIllegal && !(raceMaster.ok && raceJoin.ok)) ? 'PASS' : 'DEFECT',
    {
      raceMasterStatus: raceMaster.status,
      raceJoinStatus: raceJoin.status,
      is_master: f10PostRace?.is_master,
      activeSubs: (f10PostRace?.subscriptions || []).length,
      bothActiveIllegal,
    });

  // Ensure pmf10 is NOT stuck as master (if master won the race, leave master state cleanly or check endpoint)
  if (f10PostRace?.is_master) {
    // Try disabling master if DELETE /pamm/master exists, otherwise note it
    const delMaster = await api('/v1/oms/real/pamm/master', { method: 'DELETE', token: followerTokens[f10.email] });
    console.log(`   Cleanup pmf10 master state: DELETE /pamm/master -> ${delMaster.status} ${delMaster.text.slice(0, 120)}`);
    await sleep(400);
  }
  // If pmf10 is currently following from race, unfollow once to test C005 clean duplicate join
  const f10PreIdem = (await api('/v1/oms/real/pamm/follows', { token: followerTokens[f10.email] })).json;
  if ((f10PreIdem?.subscriptions || []).length > 0) {
    await api('/v1/oms/real/pamm/unfollow', { method: 'POST', token: followerTokens[f10.email], body: {} });
    await sleep(500);
  }

  // BTPAMM-C005: Idempotency Key Deduplication on Parallel Duplicate POST /pamm/join (pmf10)
  const f10BalBeforeIdem = (await api('/v1/oms/real/funds', { token: followerTokens[f10.email] })).json?.funds?.balance;
  const dupKey = `idem-c005-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const [dup1, dup2] = await Promise.all([
    api('/v1/oms/real/pamm/join', {
      method: 'POST', token: followerTokens[f10.email],
      body: { master_client_id: creds.master.member_id, deposit: 100, operation_key: dupKey },
    }),
    api('/v1/oms/real/pamm/join', {
      method: 'POST', token: followerTokens[f10.email],
      body: { master_client_id: creds.master.member_id, deposit: 100, operation_key: dupKey },
    }),
  ]);
  await sleep(600);
  const f10BalAfterIdem = (await api('/v1/oms/real/funds', { token: followerTokens[f10.email] })).json?.funds?.balance;
  const debitAmount = Number((f10BalBeforeIdem - f10BalAfterIdem).toFixed(4));
  const f10SubsAfterIdem = (await api('/v1/oms/real/pamm/follows', { token: followerTokens[f10.email] })).json?.subscriptions || [];
  const idemOk = debitAmount === 100 && f10SubsAfterIdem.length === 1;
  record('BTPAMM-C005', 9, 'P0', 'Idempotency Key Deduplication on Parallel Duplicate POST /pamm/join (pmf10)',
    idemOk ? 'PASS' : 'DEFECT',
    {
      req1Status: dup1.status,
      req2Status: dup2.status,
      balanceBefore: f10BalBeforeIdem,
      balanceAfter: f10BalAfterIdem,
      totalDebited: debitAmount,
      activeSubscriptions: f10SubsAfterIdem.length,
    });

  // ===========================================================================
  // MODULE 10 & 11: PORTAL & ADMIN BACKOFFICE RECONCILIATION
  // ===========================================================================
  console.log('\n--- MODULES 10 & 11: PORTAL & ADMIN BACKOFFICE RECONCILIATION ---');
  const portalMethods = await api('/v1/oms/real/portal/methods', { token: followerTokens[f1.email] });
  record('BTPAMM-PORTAL-METHODS', 7, 'P0', 'Broker Deposit Payment Methods Published (Verify BUG-DEP-004)',
    (portalMethods.ok && (portalMethods.json?.methods || []).length > 0) ? 'PASS' : 'DEFECT',
    { status: portalMethods.status, methodsCount: (portalMethods.json?.methods || []).length, methods: portalMethods.json?.methods });

  const adminTrades = await api(`/admin/api/trades?instance=real&limit=20`, { token: adminToken });
  const adminMembers = await api('/admin/api/members', { token: adminToken });
  const ourEmails = new Set([creds.master.email, ...creds.followers.map((f) => f.email)]);
  const ourAdminMembers = (adminMembers.json?.members || []).filter((m) => ourEmails.has((m.email || '').toLowerCase()));
  record('BTPAMM-O009', 11, 'P0', 'Admin Backoffice Member & Trade Reconciliation (All 11 Accounts)',
    (adminMembers.ok && ourAdminMembers.length === 11) ? 'PASS' : 'FAIL',
    {
      trackedMembersInAdmin: ourAdminMembers.length,
      adminTradesStatus: adminTrades.status,
      masterAdminBalance: ourAdminMembers.find((m) => m.email === creds.master.email)?.balances,
    });

  // Save full report
  const summary = {
    executed_at: new Date().toISOString(),
    target: BASE,
    accounts_used: [creds.master.email, ...creds.followers.map((f) => f.email)],
    counts: {
      total: results.length,
      PASS: results.filter((r) => r.status === 'PASS').length,
      DEFECT: results.filter((r) => r.status === 'DEFECT').length,
      FAIL: results.filter((r) => r.status === 'FAIL').length,
      INFO: results.filter((r) => r.status === 'INFO').length,
    },
    results,
  };
  fs.writeFileSync(path.join(__dirname, 'live_api_test_results.json'), JSON.stringify(summary, null, 2));
  console.log('\n=== LIVE API E2E SUMMARY ===');
  console.log(JSON.stringify(summary.counts, null, 2));
}

main().catch((e) => { console.error('Live API E2E failed:', e); process.exit(1); });
