const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUT = path.resolve(__dirname, '..');
const BASE = 'https://lpadmin.blackfx.com';
const fixture = JSON.parse(fs.readFileSync(path.join(OUT, 'evidence/admin-scale-fixture.json')));
const actors = Object.fromEntries(fixture.other.map((x) => [x.key, x]));
const env = {};
for (const line of fs.readFileSync('/Users/jarvis/Documents/lpadmin.blacktrader/.env', 'utf8').split(/\r?\n/)) {
  const i = line.indexOf('=');
  if (i > 0 && !line.startsWith('#')) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
}

let admin;
const tokens = {};
const calls = [];
const results = [];
const openIds = new Set();
const pendingIds = new Set();
const evidenceFile = path.join(OUT, 'evidence/abook-lp-results.json');
const save = () => fs.writeFileSync(evidenceFile, JSON.stringify({ at: new Date().toISOString(), routing_fixture: 'directoryI A-book via admin UI', results, calls }, null, 2));
const record = (id, status, actual, details = {}) => { const normalized = typeof status === 'boolean' ? (status ? 'PASS' : 'FAIL') : status; results.push({ id, status: normalized, actual, details, at: new Date().toISOString() }); save(); console.log(id, normalized, actual); };

async function req(endpoint, method = 'GET', body, token = admin) {
  const started = Date.now();
  const response = await fetch(BASE + endpoint, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch {}
  const value = { status: response.status, json, text, elapsed_ms: Date.now() - started };
  if (!endpoint.endsWith('/login') && !endpoint.endsWith('/chart-token')) calls.push({ endpoint, method, body, response: value });
  save();
  return value;
}

async function token(key) {
  if (!tokens[key]) {
    const response = await req(`/admin/api/members/${actors[key].member_id}/chart-token`, 'POST');
    if (!response.json?.token) throw new Error(`chart token unavailable for ${key}`);
    tokens[key] = response.json.token;
  }
  return tokens[key];
}
const api = async (key, endpoint, method = 'GET', body) => req(`/v1/oms/${actors[key].instance}/${endpoint}`, method, body, await token(key));
const get = async (key, endpoint) => (await api(key, endpoint)).json;
const join = (follower, manager, deposit) => api(follower, 'pamm/join', 'POST', { master_client_id: actors[manager].member_id, deposit, operation_key: crypto.randomUUID() });
const leave = (follower, manager) => api(follower, 'pamm/unfollow', 'POST', { master_client_id: actors[manager].member_id });
const open = async (body) => {
  const response = await api('directoryI', 'orders', 'POST', body);
  const id = response.json?.order?.market_order_id;
  if (response.json?.order?.state === 'FILLED' && id) openIds.add(id);
  return response;
};
const close = async (id) => {
  const response = await api('directoryI', `positions/${id}/squareoff`, 'POST', {});
  openIds.delete(id);
  return response;
};

(async () => {
  try {
    admin = (await req('/admin/api/login', 'POST', { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }, null)).json?.token;
    if (!admin) throw new Error('admin login failed');

    const initialPositions = await get('directoryI', 'positions');
    const initialFollows = await get('directoryI', 'pamm/follows');
    const investorFollows = await get('feeinvestor', 'pamm/follows');
    if (initialPositions.positions?.length || initialFollows.pool?.length || investorFollows.subscriptions?.some((s) => s.status === 'active')) throw new Error('isolated A-book fixtures were not initially flat');

    const liquidity = await req('/admin/api/liquidity');
    const liquidityMoneyBefore = await req('/admin/api/liquidity/money');
    const bridgeTest = await req('/admin/api/liquidity/test', 'POST', {});
    record('ABOOK-LP-CONNECTION', liquidity.status === 200 && liquidityMoneyBefore.status === 200,
      `Admin liquidity endpoints responded ${liquidity.status}/${liquidityMoneyBefore.status}; connection test returned ${bridgeTest.status}.`,
      { liquidity, liquidityMoneyBefore, bridgeTest });

    const joined = await join('feeinvestor', 'directoryI', 50000);
    if (joined.status !== 200) throw new Error(`PAMM join failed: ${joined.text}`);
    const pool = await get('directoryI', 'pamm/follows');

    const market = await open({ symbol: 'BLACK:XAUUSD', qty: 0.01, side: 'BUY', type: 'MARKET' });
    const marketId = market.json?.order?.market_order_id;
    const mounted = await get('directoryI', 'positions');
    record('BTPAMM-A001', market.status === 200 && market.json?.order?.state === 'FILLED' && mounted.positions?.some((p) => p.market_order_id === marketId),
      `A-book PAMM parent market order filled on BLACK:XAUUSD and mounted once in the manager pool; pool principal ${pool.pool_total}.`,
      { joined, pool, market, mounted });
    record('BTPAMM-E013', market.status === 200 && mounted.positions?.filter((p) => p.market_order_id === marketId).length === 1,
      'The A-book PAMM order produced one manager position record; no child order records appeared in the PAMM manager account.',
      { market, mounted });
    if (marketId) await close(marketId);

    const burst = await Promise.all(Array.from({ length: 20 }, () => open({ symbol: 'BLACK:XAUUSD', qty: 0.01, side: 'BUY', type: 'MARKET' })));
    const burstPositions = await get('directoryI', 'positions');
    const filled = burst.filter((x) => x.status === 200 && x.json?.order?.state === 'FILLED');
    const rateLimited = burst.filter((x) => x.status === 429 || /rate.?limit/i.test(x.text));
    record('BTPAMM-P009', filled.length === 20 && rateLimited.length === 0 ? 'PASS' : 'FAIL',
      `Twenty concurrent A-book PAMM market orders produced ${filled.length} fills and ${rateLimited.length} rate-limit responses; ${burstPositions.positions?.length || 0} positions were mounted.`,
      { burst, burstPositions });
    for (const id of [...openIds]) await close(id);

    const oversized = await open({ symbol: 'BLACK:XAUUSD', qty: 10, side: 'BUY', type: 'MARKET' });
    const afterReject = await get('directoryI', 'positions');
    record('BTPAMM-P007', oversized.status >= 400 && !oversized.json?.order?.market_order_id && afterReject.positions?.length === 0 ? 'PASS' : 'PARTIAL',
      `An oversized A-book parent order returned HTTP ${oversized.status}; the manager retained ${afterReject.positions?.length || 0} open positions afterward.`,
      { oversized, afterReject });

    const referencePrice = market.json?.order?.avg_fill_price;
    if (Number.isFinite(referencePrice) && referencePrice > 0) {
      const pending = await api('directoryI', 'orders/pending', 'POST', { symbol: 'BLACK:XAUUSD', qty: 0.01, side: 'BUY', type: 'LIMIT', price: Number((referencePrice * 0.5).toFixed(2)) });
      const pendingId = pending.json?.order?.order_id;
      if (pendingId) pendingIds.add(pendingId);
      const orderRead = await get('directoryI', 'orders');
      record('ABOOK-LP-PENDING', pending.status === 200 && pending.json?.order?.state === 'PENDING' && orderRead.orders?.some((o) => o.order_id === pendingId && o.state === 'PENDING'),
        `A-book LIMIT order returned ${pending.json?.order?.state || pending.status} and persisted under its original ID.`,
        { pending, orderRead });
      if (pendingId) { await api('directoryI', `orders/${pendingId}`, 'DELETE'); pendingIds.delete(pendingId); }
    }

    const history = await get('directoryI', 'history?limit=200');
    const liquidityMoneyAfter = await req('/admin/api/liquidity/money');
    const reconcile = await req('/admin/api/liquidity/reconcile', 'POST', {});
    record('BTPAMM-P015', 'PARTIAL',
      'A-book executions and timestamps were retained in OMS history, but the exposed response/history did not provide a distinct LP fill ID suitable for blotter verification.',
      { history, liquidityMoneyAfter, reconcile });
  } catch (error) {
    record('ABOOK-LP-HARNESS', 'INCONCLUSIVE', error.message, { stack: error.stack });
  } finally {
    for (const id of [...pendingIds]) await api('directoryI', `orders/${id}`, 'DELETE').catch(() => {});
    for (const id of [...openIds]) await close(id).catch(() => {});
    await leave('feeinvestor', 'directoryI').catch(() => {});
    const final = {};
    try {
      final.positions = await get('directoryI', 'positions');
      final.orders = await get('directoryI', 'orders');
      final.managerFollows = await get('directoryI', 'pamm/follows');
      final.investorFollows = await get('feeinvestor', 'pamm/follows');
      record('ABOOK-LP-CLEANUP', final.positions.positions?.length === 0 && !final.orders.orders?.some((o) => o.state === 'PENDING') && final.managerFollows.pool?.length === 0,
        'Isolated A-book manager is flat, has no pending orders, and its temporary PAMM investor relationship was settled.', final);
    } catch (error) {
      record('ABOOK-LP-CLEANUP', 'INCONCLUSIVE', error.message, final);
    }
  }
})();
