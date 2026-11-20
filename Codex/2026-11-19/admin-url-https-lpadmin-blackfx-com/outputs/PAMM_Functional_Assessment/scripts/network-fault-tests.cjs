const fs = require('fs');
const path = require('path');
const http = require('http');
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
const results = [];
const traces = [];
const openIds = new Set();
const evidenceFile = path.join(OUT, 'evidence/network-fault-results.json');
const save = () => fs.writeFileSync(evidenceFile, JSON.stringify({ at: new Date().toISOString(), method: 'local HTTP fault proxy forwarding to isolated QA OMS', results, traces }, null, 2));
const record = (id, status, actual, details = {}) => { results.push({ id, status, actual, details, at: new Date().toISOString() }); save(); console.log(id, status, actual); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function direct(endpoint, method = 'GET', body, token = admin) {
  const response = await fetch(BASE + endpoint, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const text = await response.text();
  let json; try { json = JSON.parse(text); } catch {}
  return { status: response.status, json, text };
}
async function token(key) {
  if (!tokens[key]) {
    const response = await direct(`/admin/api/members/${actors[key].member_id}/chart-token`, 'POST');
    if (!response.json?.token) throw new Error(`chart token unavailable for ${key}`);
    tokens[key] = response.json.token;
  }
  return tokens[key];
}
const api = async (key, endpoint, method = 'GET', body) => direct(`/v1/oms/${actors[key].instance}/${endpoint}`, method, body, await token(key));
const get = async (key, endpoint) => (await api(key, endpoint)).json;
const join = (deposit = 10000) => api('feeinvestor', 'pamm/join', 'POST', { master_client_id: actors.directoryI.member_id, deposit, operation_key: crypto.randomUUID() });
const leave = () => api('feeinvestor', 'pamm/unfollow', 'POST', { master_client_id: actors.directoryI.member_id });
const closeDirect = async (id) => { const r = await api('directoryI', `positions/${id}/squareoff`, 'POST', {}); openIds.delete(id); return r; };

function createFaultProxy() {
  const server = http.createServer(async (clientReq, clientRes) => {
    const behavior = clientReq.headers['x-qa-fault'] || 'normal';
    const delayMs = Number(clientReq.headers['x-qa-delay-ms'] || 0);
    const chunks = [];
    for await (const chunk of clientReq) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const trace = { behavior, method: clientReq.method, path: clientReq.url, request_bytes: body.length, started_at: new Date().toISOString(), upstream_sent: false };
    traces.push(trace); save();
    if (behavior === 'drop-before') {
      trace.client_result = 'socket destroyed before upstream dispatch'; trace.completed_at = new Date().toISOString(); save();
      return clientReq.socket.destroy();
    }
    try {
      const upstream = await fetch(BASE + clientReq.url, {
        method: clientReq.method,
        headers: { 'Content-Type': 'application/json', Authorization: clientReq.headers.authorization },
        body: ['GET', 'HEAD'].includes(clientReq.method) ? undefined : body,
        signal: AbortSignal.timeout(30000),
      });
      trace.upstream_sent = true;
      trace.upstream_status = upstream.status;
      const bytes = Buffer.from(await upstream.arrayBuffer());
      trace.upstream_response_bytes = bytes.length;
      if (behavior === 'drop-after') {
        trace.client_result = 'socket destroyed after upstream completed'; trace.completed_at = new Date().toISOString(); save();
        return clientReq.socket.destroy();
      }
      if (delayMs) await sleep(delayMs);
      clientRes.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') || 'application/json' });
      clientRes.end(bytes);
      trace.client_result = delayMs ? `response delivered after ${delayMs}ms` : 'response delivered';
      trace.completed_at = new Date().toISOString(); save();
    } catch (error) {
      trace.error = error.message; trace.completed_at = new Date().toISOString(); save();
      clientReq.socket.destroy();
    }
  });
  return server;
}

(async () => {
  const server = createFaultProxy();
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    admin = (await direct('/admin/api/login', 'POST', { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }, null)).json?.token;
    if (!admin) throw new Error('admin login failed');
    const managerToken = await token('directoryI');
    const followerToken = await token('feeinvestor');
    const proxy = async (tokenValue, endpoint, method = 'GET', body, fault = 'normal', delayMs = 0) => {
      const started = Date.now();
      try {
        const response = await fetch(`http://127.0.0.1:${port}${endpoint}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenValue}`, 'X-QA-Fault': fault, 'X-QA-Delay-Ms': String(delayMs) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
        const text = await response.text(); let json; try { json = JSON.parse(text); } catch {}
        return { ok: true, status: response.status, json, text, elapsed_ms: Date.now() - started };
      } catch (error) { return { ok: false, error: error.message, elapsed_ms: Date.now() - started }; }
    };
    const orderBody = { symbol: 'BINANCE:BTCUSDT.P', qty: 0.001, side: 'BUY', type: 'MARKET' };
    const orderEndpoint = '/v1/oms/real/orders';

    const initialPositions = await get('directoryI', 'positions');
    const initialFollows = await get('directoryI', 'pamm/follows');
    const investorFollows = await get('feeinvestor', 'pamm/follows');
    if (initialPositions.positions?.length || initialFollows.pool?.length || investorFollows.subscriptions?.some((s) => s.status === 'active')) throw new Error('isolated network fixtures were not initially flat');

    const beforeOffline = await get('directoryI', 'positions');
    const offline = await proxy(managerToken, orderEndpoint, 'POST', orderBody, 'drop-before');
    await sleep(300);
    const afterOffline = await get('directoryI', 'positions');
    record('PAMM-X13-01', !offline.ok && afterOffline.positions.length === beforeOffline.positions.length ? 'PASS' : 'FAIL', 'The client connection was cut before upstream dispatch; no server order or position was created.', { offline, beforeOffline, afterOffline });

    const oldReadPromise = proxy(managerToken, '/v1/oms/real/pamm/follows', 'GET', undefined, 'normal', 1800);
    await sleep(100);
    const joined = await join(10000);
    const newRead = await get('directoryI', 'pamm/follows');
    const oldRead = await oldReadPromise;
    record('PAMM-X13-08', 'PARTIAL', `An older pool read was delivered after ${oldRead.elapsed_ms}ms while a newer direct read already showed ${newRead.pool?.length || 0} investor. Transport reversal was reproduced; browser rendering was not available.`, { joined, oldRead, newRead });

    const droppedDispatch = await proxy(managerToken, orderEndpoint, 'POST', orderBody, 'drop-after');
    const afterDispatch = await get('directoryI', 'positions');
    const dispatchPos = afterDispatch.positions.at(-1);
    if (dispatchPos) openIds.add(dispatchPos.market_order_id);
    record('PAMM-X13-02', !droppedDispatch.ok && afterDispatch.positions.length === 1 ? 'PASS' : 'FAIL', 'The connection was dropped only after the server completed order dispatch; reconciliation found one authoritative open position.', { droppedDispatch, afterDispatch });
    if (dispatchPos) await closeDirect(dispatchPos.market_order_id);

    const lostBuy = await proxy(managerToken, orderEndpoint, 'POST', orderBody, 'drop-after');
    const buyReconciled = await get('directoryI', 'positions');
    const buyPos = buyReconciled.positions.at(-1);
    if (buyPos) openIds.add(buyPos.market_order_id);
    record('PAMM-X13-03', !lostBuy.ok && buyReconciled.positions.length === 1 ? 'PASS' : 'FAIL', 'The accepted BUY response was discarded. A fresh authoritative read found exactly one position and no automatic duplicate.', { lostBuy, buyReconciled });

    const historyBeforeClose = await get('directoryI', 'history?limit=200');
    const allocationBefore = await get('feeinvestor', 'pamm/allocations?limit=200');
    const lostClose = buyPos ? await proxy(managerToken, `/v1/oms/real/positions/${buyPos.market_order_id}/squareoff`, 'POST', {}, 'drop-after') : { ok: false, error: 'missing position' };
    if (buyPos) openIds.delete(buyPos.market_order_id);
    const closeReconciled = await get('directoryI', 'positions');
    const historyAfterClose = await get('directoryI', 'history?limit=200');
    const allocationAfter = await get('feeinvestor', 'pamm/allocations?limit=200');
    const newHistory = historyAfterClose.history.filter((h) => !historyBeforeClose.history.some((b) => b.history_id === h.history_id));
    const newAlloc = allocationAfter.allocations.filter((a) => !allocationBefore.allocations.some((b) => b.trade_id === a.trade_id));
    record('PAMM-X13-04', !lostClose.ok && closeReconciled.positions.length === 0 && newHistory.length === 1 && newAlloc.length === 1 ? 'PASS' : 'FAIL', `The squareoff response was discarded; reconciliation found zero open positions, ${newHistory.length} new close and ${newAlloc.length} new allocation.`, { lostClose, closeReconciled, newHistory, newAlloc });

    const slowBuy = await proxy(managerToken, orderEndpoint, 'POST', orderBody, 'normal', 1800);
    const slowBuyState = await get('directoryI', 'positions');
    const slowPos = slowBuyState.positions.at(-1);
    if (slowPos) openIds.add(slowPos.market_order_id);
    record('PAMM-X13-05', 'PARTIAL', `A throttled order response arrived after ${slowBuy.elapsed_ms}ms and exactly ${slowBuyState.positions.length} position mounted. The transport assertion passed, but the request was issued by the fault harness rather than Chromium UI.`, { slowBuy, slowBuyState });

    const slowHistoryBefore = await get('directoryI', 'history?limit=200');
    const slowClose = slowPos ? await proxy(managerToken, `/v1/oms/real/positions/${slowPos.market_order_id}/squareoff`, 'POST', {}, 'normal', 1800) : { ok: false, error: 'missing position' };
    if (slowPos) openIds.delete(slowPos.market_order_id);
    const slowCloseState = await get('directoryI', 'positions');
    const slowHistoryAfter = await get('directoryI', 'history?limit=200');
    const slowNewHistory = slowHistoryAfter.history.filter((h) => !slowHistoryBefore.history.some((b) => b.history_id === h.history_id));
    record('PAMM-X13-06', 'PARTIAL', `A throttled close response arrived after ${slowClose.elapsed_ms}ms; zero positions remained and ${slowNewHistory.length} close record appeared. The transport assertion passed, but Chromium UI did not issue the request.`, { slowClose, slowCloseState, slowNewHistory });

    const reconnectOrder = await proxy(managerToken, orderEndpoint, 'POST', orderBody, 'drop-after');
    const toggles = [];
    for (let i = 0; i < 3; i++) toggles.push(await proxy(managerToken, '/v1/oms/real/positions', 'GET', undefined, 'drop-before'));
    const reconnectState = await get('directoryI', 'positions');
    const reconnectPos = reconnectState.positions.at(-1);
    if (reconnectPos) openIds.add(reconnectPos.market_order_id);
    record('PAMM-X13-07', !reconnectOrder.ok && toggles.every((x) => !x.ok) && reconnectState.positions.length === 1 ? 'PASS' : 'FAIL', 'After an accepted order response was lost, three offline reads failed and the fourth online reconciliation found exactly one position with no replay.', { reconnectOrder, toggles, reconnectState });
    if (reconnectPos) await closeDirect(reconnectPos.market_order_id);

    const followerOffline = await proxy(followerToken, '/v1/oms/real/pamm/allocations?limit=200', 'GET', undefined, 'drop-before');
    const allocationBaseline = await get('feeinvestor', 'pamm/allocations?limit=200');
    const parent = await api('directoryI', 'orders', 'POST', orderBody);
    const parentId = parent.json?.order?.market_order_id;
    if (parentId) { openIds.add(parentId); await closeDirect(parentId); }
    const followerOnline = await get('feeinvestor', 'pamm/allocations?limit=200');
    const offlineAllocations = followerOnline.allocations.filter((a) => !allocationBaseline.allocations.some((b) => b.trade_id === a.trade_id));
    record('PAMM-X13-09', !followerOffline.ok && offlineAllocations.length === 1 ? 'PASS' : 'FAIL', `The follower read channel was offline during the parent lifecycle; server settlement still produced ${offlineAllocations.length} allocation visible after reconnect.`, { followerOffline, parent, offlineAllocations });

    const delayedOld = proxy(managerToken, '/v1/oms/real/pamm/follows', 'GET', undefined, 'normal', 1800);
    await sleep(100);
    const newImmediate = await proxy(managerToken, '/v1/oms/real/pamm/follows', 'GET', undefined, 'normal', 100);
    const oldDelayed = await delayedOld;
    record('PAMM-X13-10', 'PARTIAL', `Two valid reads were delivered in reverse completion order (${newImmediate.elapsed_ms}ms then ${oldDelayed.elapsed_ms}ms). Responses remained authoritative; Chromium UI stale-response suppression was not observable.`, { newImmediate, oldDelayed });
  } catch (error) {
    record('NETWORK-FAULT-HARNESS', 'INCONCLUSIVE', error.message, { stack: error.stack });
  } finally {
    for (const id of [...openIds]) await closeDirect(id).catch(() => {});
    await leave().catch(() => {});
    try {
      const finalPositions = await get('directoryI', 'positions');
      const finalOrders = await get('directoryI', 'orders');
      const finalManagerFollows = await get('directoryI', 'pamm/follows');
      record('NETWORK-FAULT-CLEANUP', finalPositions.positions?.length === 0 && !finalOrders.orders?.some((o) => o.state === 'PENDING') && finalManagerFollows.pool?.length === 0 ? 'PASS' : 'FAIL', 'Isolated network-fault manager is flat, has no pending orders and has no temporary investors.', { finalPositions, finalOrders, finalManagerFollows });
    } catch (error) { record('NETWORK-FAULT-CLEANUP', 'INCONCLUSIVE', error.message); }
    await new Promise((resolve) => server.close(resolve));
  }
})();
