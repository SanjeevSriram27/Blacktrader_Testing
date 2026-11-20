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

async function openAndWaitForProfit(masterToken, side, targetProfit = 2.5, maxLoss = -2.5, maxWaitSec = 60) {
  const symbol = 'BINANCE:BTCUSDT.P';
  const qty = 0.1;
  console.log(`\nOpening 0.1 lot ${side} on ${symbol} (target >= +$${targetProfit}, stop <= $${maxLoss})...`);
  const openRes = await api('/v1/oms/real/orders', {
    method: 'POST',
    token: masterToken,
    body: { symbol, side, qty, type: 'MARKET' },
  });
  if (!openRes.ok) throw new Error(`Order open failed: ${openRes.status} ${openRes.text}`);
  const orderId = openRes.json?.order?.market_order_id || openRes.json?.order?.order_id;
  const entryPrice = openRes.json?.position?.avg_entry_price || openRes.json?.order?.avg_fill_price;
  console.log(`  Filled ${orderId} @ ${entryPrice}`);

  let lastUpnl = 0;
  for (let sec = 1; sec <= maxWaitSec; sec++) {
    await sleep(1000);
    const posRes = await api('/v1/oms/real/positions', { token: masterToken });
    const pos = (posRes.json?.positions || []).find((p) => p.market_order_id === orderId);
    if (!pos) break;
    lastUpnl = Number(pos.unrealized_pnl || 0);
    if (sec % 5 === 0 || lastUpnl >= targetProfit || lastUpnl <= maxLoss) {
      console.log(`  [${sec}s] current=${pos.current_price} | unrealized_pnl=${lastUpnl.toFixed(4)}`);
    }
    if (lastUpnl >= targetProfit) {
      console.log(`  Target profit reached (+$${lastUpnl.toFixed(4)})! Squaring off...`);
      const sq = await api(`/v1/oms/real/positions/${encodeURIComponent(orderId)}/squareoff`, {
        method: 'POST', token: masterToken, body: {},
      });
      return { won: Number(sq.json?.realized_pnl || 0) > 0, sq: sq.json, orderId, side, entryPrice };
    }
    if (lastUpnl <= maxLoss) {
      console.log(`  Hit quick stop ($${lastUpnl.toFixed(4)}). Squaring off to flip direction...`);
      const sq = await api(`/v1/oms/real/positions/${encodeURIComponent(orderId)}/squareoff`, {
        method: 'POST', token: masterToken, body: {},
      });
      return { won: Number(sq.json?.realized_pnl || 0) > 0, sq: sq.json, orderId, side, entryPrice };
    }
  }
  // Timeout: squareoff wherever we are
  console.log(`  Max wait reached (upnl=${lastUpnl.toFixed(4)}). Squaring off...`);
  const sq = await api(`/v1/oms/real/positions/${encodeURIComponent(orderId)}/squareoff`, {
    method: 'POST', token: masterToken, body: {},
  });
  return { won: Number(sq.json?.realized_pnl || 0) > 0, sq: sq.json, orderId, side, entryPrice };
}

async function main() {
  const masterToken = await loginClient(creds.master.email, creds.master.password);
  const f10 = creds.followers[9];
  const f10Token = await loginClient(f10.email, f10.password);

  // Snapshot pre-trade pool state
  const preFollows = (await api('/v1/oms/real/pamm/follows', { token: masterToken })).json;
  const preFunds = (await api('/v1/oms/real/funds', { token: masterToken })).json.funds;
  console.log('Pre-trade pool:', {
    followers: (preFollows.pool || []).length,
    pool_total: preFollows.pool_total,
    master_balance: preFunds.balance,
    pmf10_running_before: (preFollows.pool || []).find((p) => p.follower_client_id === f10.member_id)?.running_pnl,
    pmf1_running_before: (preFollows.pool || []).find((p) => p.follower_client_id === creds.followers[0].member_id)?.running_pnl,
  });

  // Try up to 3 attempts (flipping BUY/SELL if needed) until pmf10's running_pnl is solidly POSITIVE (>= +$0.15)!
  const sides = ['BUY', 'SELL', 'BUY'];
  const tradeHistory = [];
  let pmf10Running = (preFollows.pool || []).find((p) => p.follower_client_id === f10.member_id)?.running_pnl || 0;

  for (let i = 0; i < sides.length; i++) {
    // Target enough profit so pmf10's running_pnl becomes >= +$0.25 (e.g. if currently -0.09, need +$3.50 total trade profit -> +$0.35 per follower -> pmf10 at +$0.26!)
    const neededPerFollower = Math.max(0.25, 0.25 - pmf10Running);
    const targetTradeProfit = Number((neededPerFollower * 10).toFixed(2));
    const res = await openAndWaitForProfit(masterToken, sides[i], targetTradeProfit, -2.5, 55);
    tradeHistory.push(res);
    await sleep(1500);

    const checkFollows = (await api('/v1/oms/real/pamm/follows', { token: masterToken })).json;
    pmf10Running = (checkFollows.pool || []).find((p) => p.follower_client_id === f10.member_id)?.running_pnl || 0;
    console.log(`  After attempt ${i + 1}: realized_pnl=${res.sq?.realized_pnl} | pmf10 running_pnl=${pmf10Running}`);
    if (pmf10Running >= 0.10) {
      console.log(`  SUCCESS! pmf10 running_pnl is solidly positive (+$${pmf10Running})!`);
      break;
    }
  }

  // Inspect allocations & running_pnl across ALL 10 followers after profitable trade
  const hist = (await api('/v1/oms/real/history?limit=5', { token: masterToken })).json;
  const allocs = (await api('/v1/oms/real/pamm/allocations?role=master&limit=30', { token: masterToken })).json;
  const postTradeFollows = (await api('/v1/oms/real/pamm/follows', { token: masterToken })).json;
  const postTradeMasterFunds = (await api('/v1/oms/real/funds', { token: masterToken })).json.funds;

  console.log('\n=== POOL STATE AFTER PROFITABLE TRADE (BEFORE UNFOLLOW) ===');
  for (const p of postTradeFollows.pool || []) {
    console.log(`  ${p.follower_name.padEnd(18)} | deposit=${p.deposit} | share=${p.share_percent}% | running_pnl=${p.running_pnl}`);
  }

  // Now test UNFOLLOW on pmf10 to observe live 20% performance fee (master_share) settlement!
  const f10FundsBeforeUnf = (await api('/v1/oms/real/funds', { token: f10Token })).json.funds;
  const masterFundsBeforeUnf = postTradeMasterFunds;
  const f10RunningBeforeUnf = (postTradeFollows.pool || []).find((p) => p.follower_client_id === f10.member_id)?.running_pnl;

  console.log(`\nTriggering POST /v1/oms/real/pamm/unfollow for pmf10 (running_pnl=${f10RunningBeforeUnf}, share_percent=20%)...`);
  const unfRes = await api('/v1/oms/real/pamm/unfollow', {
    method: 'POST',
    token: f10Token,
    body: { master_client_id: creds.master.member_id },
  });
  console.log(`Unfollow response [${unfRes.status}]:`, unfRes.text);
  await sleep(1000);

  const f10FundsAfterUnf = (await api('/v1/oms/real/funds', { token: f10Token })).json.funds;
  const masterFundsAfterUnf = (await api('/v1/oms/real/funds', { token: masterToken })).json.funds;

  const expectedMasterShare = f10RunningBeforeUnf > 0 ? Number((f10RunningBeforeUnf * 0.20).toFixed(2)) : 0;
  const expectedPayout = Number((100 + f10RunningBeforeUnf - expectedMasterShare).toFixed(2));
  const f10ActualDelta = Number((f10FundsAfterUnf.balance - f10FundsBeforeUnf.balance).toFixed(4));
  const masterActualDelta = Number((masterFundsAfterUnf.balance - masterFundsBeforeUnf.balance).toFixed(4));

  console.log('\n=== 20% PROFIT SHARE SETTLEMENT VERIFICATION (pmf10) ===');
  console.log(JSON.stringify({
    pmf10_deposit: 100,
    pmf10_running_pnl_before_leave: f10RunningBeforeUnf,
    expected_20pct_master_share: expectedMasterShare,
    actual_api_master_share: unfRes.json?.master_share,
    expected_follower_payout: expectedPayout,
    actual_api_payout: unfRes.json?.payout,
    pmf10_balance_before: f10FundsBeforeUnf.balance,
    pmf10_balance_after: f10FundsAfterUnf.balance,
    pmf10_balance_delta: f10ActualDelta,
    master_balance_before: masterFundsBeforeUnf.balance,
    master_balance_after: masterFundsAfterUnf.balance,
    master_balance_delta: masterActualDelta,
  }, null, 2));

  // Re-join pmf10 with $100 so all 10 followers remain cleanly active in the pool
  console.log('\nRe-joining pmf10@mailinator.com with $100 to restore 10-follower pool...');
  const rejoinRes = await api('/v1/oms/real/pamm/join', {
    method: 'POST',
    token: f10Token,
    body: {
      master_client_id: creds.master.member_id,
      deposit: 100,
      operation_key: `rejoin-profit-test-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
    },
  });
  console.log(`Rejoin response [${rejoinRes.status}]:`, rejoinRes.text);

  const finalFollows = (await api('/v1/oms/real/pamm/follows', { token: masterToken })).json;
  const finalMasterFunds = (await api('/v1/oms/real/funds', { token: masterToken })).json.funds;
  const latestTrade = (hist.history || [])[0];
  const latestAllocs = (allocs.allocations || []).filter((a) => a.trade_id === latestTrade?.history_id);

  const report = {
    executed_at: new Date().toISOString(),
    trades_executed: tradeHistory,
    latest_trade: latestTrade,
    latest_trade_allocations: latestAllocs,
    pool_after_profit_trade: postTradeFollows.pool,
    unfollow_settlement_pmf10: {
      api_response: unfRes.json,
      expected_20pct_master_share: expectedMasterShare,
      expected_follower_payout: expectedPayout,
      pmf10_balance_before: f10FundsBeforeUnf.balance,
      pmf10_balance_after: f10FundsAfterUnf.balance,
      pmf10_balance_delta: f10ActualDelta,
      master_balance_before: masterFundsBeforeUnf.balance,
      master_balance_after: masterFundsAfterUnf.balance,
      master_balance_delta: masterActualDelta,
    },
    final_pool: {
      active_followers: (finalFollows.pool || []).length,
      pool_total: finalFollows.pool_total,
      master_balance: finalMasterFunds.balance,
    },
  };

  fs.writeFileSync(path.join(__dirname, 'profitable_trade_share_report.json'), JSON.stringify(report, null, 2));
  console.log('\nSaved profitable_trade_share_report.json');
}

main().catch((e) => { console.error(e); process.exit(1); });
