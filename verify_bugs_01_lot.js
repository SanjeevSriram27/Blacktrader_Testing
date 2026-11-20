const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const creds = JSON.parse(fs.readFileSync(path.join(__dirname, 'pamm_credentials.json'), 'utf8'));
const BASE = creds.platform_base_url;

async function api(urlPath, { method = 'GET', token, body } = {}) {
  const hdrs = { Accept: 'application/json' };
  if (token) hdrs.Authorization = `Bearer ${token}`;
  if (body !== undefined) hdrs['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: hdrs,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, json, text };
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
  const masterToken = await loginClient(creds.master.email, creds.master.password);
  const f10 = creds.followers[9];
  const f10Token = await loginClient(f10.email, f10.password);

  // 1. Ensure pmf10 is actively following pmmaster with $100
  const mFollowsBefore0 = (await api('/v1/oms/real/pamm/follows', { token: masterToken })).json;
  const f10Active = (mFollowsBefore0?.pool || []).some(
    (p) => p.follower_client_id === f10.member_id && p.status === 'active'
  );
  if (!f10Active) {
    console.log('pmf10 not active — re-joining pmf10 with $100...');
    const jRes = await api('/v1/oms/real/pamm/join', {
      method: 'POST',
      token: f10Token,
      body: {
        master_client_id: creds.master.member_id,
        deposit: 100,
        operation_key: `rejoin-pmf10-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      },
    });
    console.log('pmf10 rejoin:', jRes.status, jRes.text);
    await sleep(600);
  } else {
    console.log('Verified: pmf10@mailinator.com is ALREADY actively following pmmaster@mailinator.com ($100).');
  }

  // Snapshot pre-trade pool state
  const mFollowsBefore = (await api('/v1/oms/real/pamm/follows', { token: masterToken })).json;
  const mFundsBefore = (await api('/v1/oms/real/funds', { token: masterToken })).json.funds;
  const beforeByFollower = {};
  for (const p of mFollowsBefore.pool || []) {
    beforeByFollower[p.follower_client_id] = {
      name: p.follower_name,
      pamm_id: p.pamm_id,
      deposit: p.deposit,
      running_pnl_before: p.running_pnl,
    };
  }
  console.log(`\nPre-trade state: active_followers=${(mFollowsBefore.pool || []).length}, pool_total=$${mFollowsBefore.pool_total}, master_balance=$${mFundsBefore.balance}`);

  // 2. Place 0.1 lot live MARKET BUY on BINANCE:BTCUSDT.P
  console.log('\nPlacing 0.1 lot MARKET BUY on BINANCE:BTCUSDT.P...');
  const openRes = await api('/v1/oms/real/orders', {
    method: 'POST',
    token: masterToken,
    body: { symbol: 'BINANCE:BTCUSDT.P', side: 'BUY', qty: 0.1, type: 'MARKET' },
  });
  console.log(`Order response [${openRes.status}]:`, openRes.text);
  if (!openRes.ok) throw new Error('Failed to open 0.1 lot order');

  const marketOrderId = openRes.json?.order?.market_order_id || openRes.json?.order?.order_id;
  await sleep(1000);
  const posOpen = (await api('/v1/oms/real/positions', { token: masterToken })).json;
  const openPos = (posOpen.positions || []).find((p) => p.market_order_id === marketOrderId) || (posOpen.positions || [])[0];
  console.log('Open position snapshot:', {
    market_order_id: openPos?.market_order_id,
    qty: openPos?.net_qty,
    avg_entry_price: openPos?.avg_entry_price,
    margin_used: openPos?.margin_used,
    free_margin: posOpen.funds?.free_margin,
  });

  // Wait ~4.5 seconds for price movement so P&L is meaningful
  console.log('Holding position ~4.5s for live price tick movement...');
  await sleep(4500);

  // 3. Squareoff the 0.1 lot position
  const sqRes = await api(`/v1/oms/real/positions/${encodeURIComponent(openPos.market_order_id)}/squareoff`, {
    method: 'POST',
    token: masterToken,
    body: {},
  });
  console.log(`Squareoff response [${sqRes.status}]:`, sqRes.text);
  await sleep(1500);

  // 4. Inspect live history, allocations, and updated pool running_pnl
  const histRes = (await api('/v1/oms/real/history?limit=5', { token: masterToken })).json;
  const latestTrade = (histRes.history || [])[0];
  const allocsRes = (await api('/v1/oms/real/pamm/allocations?role=master&limit=30', { token: masterToken })).json;
  const mFollowsAfter = (await api('/v1/oms/real/pamm/follows', { token: masterToken })).json;
  const mFundsAfter = (await api('/v1/oms/real/funds', { token: masterToken })).json.funds;

  const tradeAllocs = (allocsRes.allocations || []).filter((a) => a.trade_id === latestTrade?.history_id);
  const exactTenPct = Number((latestTrade.realized_pnl * 0.1).toFixed(6));
  const sumShared = Number(tradeAllocs.reduce((s, a) => s + Number(a.shared_pnl || 0), 0).toFixed(6));
  const conservationDiff = Number((sumShared - latestTrade.realized_pnl).toFixed(6));

  const perFollowerTable = (mFollowsAfter.pool || []).map((p) => {
    const pre = beforeByFollower[p.follower_client_id] || {};
    const alloc = tradeAllocs.find((a) => a.follower === p.follower_client_id);
    return {
      follower_name: p.follower_name,
      pamm_id: p.pamm_id,
      deposit: p.deposit,
      percentage: alloc?.percentage ?? 10,
      exact_10pct_share: exactTenPct,
      recorded_shared_pnl: alloc?.shared_pnl ?? null,
      running_pnl_before: pre.running_pnl_before,
      running_pnl_after: p.running_pnl,
      running_delta: Number(((p.running_pnl || 0) - (pre.running_pnl_before || 0)).toFixed(6)),
    };
  });

  const summary = {
    trade: latestTrade,
    master_funds_before: mFundsBefore.balance,
    master_funds_after: mFundsAfter.balance,
    master_balance_delta: Number((mFundsAfter.balance - mFundsBefore.balance).toFixed(6)),
    allocations_created_count: tradeAllocs.length,
    actual_order_pnl: latestTrade.realized_pnl,
    exact_per_follower_10pct: exactTenPct,
    sum_recorded_shared_pnl: sumShared,
    conservation_diff: conservationDiff,
    per_follower: perFollowerTable,
    raw_trade_allocations: tradeAllocs,
  };

  fs.writeFileSync(path.join(__dirname, 'bug1_bug2_01lot_verification.json'), JSON.stringify(summary, null, 2));
  console.log('\n=== 0.1 LOT SPLIT VERIFICATION SUMMARY ===');
  console.log(JSON.stringify({
    history_id: latestTrade.history_id,
    symbol: latestTrade.symbol,
    qty: latestTrade.qty,
    entry_price: latestTrade.entry_price,
    exit_price: latestTrade.exit_price,
    actual_order_pnl: latestTrade.realized_pnl,
    exact_10pct_per_follower: exactTenPct,
    allocations_created_count: tradeAllocs.length,
    recorded_shared_pnl_each: tradeAllocs[0]?.shared_pnl ?? null,
    sum_recorded_shared_pnl: sumShared,
    conservation_diff: conservationDiff,
    master_balance_before: mFundsBefore.balance,
    master_balance_after: mFundsAfter.balance,
    master_balance_delta: Number((mFundsAfter.balance - mFundsBefore.balance).toFixed(6)),
  }, null, 2));
  console.log('\nPer-follower breakdown:');
  for (const row of perFollowerTable) {
    console.log(`  ${row.follower_name.padEnd(18)} | dep=${row.deposit} | pct=${row.percentage}% | exact=${row.exact_10pct_share} | recorded=${row.recorded_shared_pnl} | running: ${row.running_pnl_before} -> ${row.running_pnl_after} (delta ${row.running_delta})`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
