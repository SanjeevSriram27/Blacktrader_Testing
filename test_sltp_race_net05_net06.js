const fs = require('fs');
const path = require('path');

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
  return { token: j.token, cookie };
}

async function closeAllPaperPositions(token) {
  const p = (await api('/v1/oms/paper/positions', { token })).json;
  for (const pos of p?.positions || []) {
    await api(`/v1/oms/paper/positions/${encodeURIComponent(pos.market_order_id)}/squareoff`, {
      method: 'POST',
      token,
      body: {},
    });
  }
}

async function cancelAllPaperPending(token) {
  const ords = (await api('/v1/oms/paper/orders', { token })).json?.orders || [];
  for (const o of ords) {
    if (o.state === 'PENDING' || (o.type === 'LIMIT' && o.filled_qty === 0 && o.state !== 'CANCELLED')) {
      await api(`/v1/oms/paper/orders/${o.order_id}`, { method: 'DELETE', token }).catch(() => {});
    }
  }
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function run() {
  console.log('=== STARTING SUITE: SL/TP RACE CONDITIONS (NET05 & NET06) ===');
  const results = [];
  const { token } = await loginClient(creds.master.email, creds.master.password);

  try {
    await closeAllPaperPositions(token);
    await cancelAllPaperPending(token);

    // =========================================================================
    // NET05: Modify SL -> Immediately Modify SL Again (Concurrent / Rapid Update)
    // =========================================================================
    console.log('\n--- [NET05] Modify SL -> Immediately Modify SL Again ---');
    // 1. Open market BUY position
    const buyRes = await api('/v1/oms/paper/orders', {
      method: 'POST',
      token,
      body: {
        symbol: 'BINANCE:BTCUSDT.P',
        quantity: 0.01,
        side: 'BUY',
        source: '1click',
        price: 63500,
      },
    });
    const posId = buyRes.json?.order?.market_order_id;
    console.log('Opened position posId:', posId);
    await sleep(1500);

    // 2. Submit initial SL at 62000
    const sl1 = await api('/v1/oms/paper/orders/pending', {
      method: 'POST',
      token,
      body: {
        symbol: 'BINANCE:BTCUSDT.P',
        quantity: 0.01,
        side: 'SELL',
        type: 'SL',
        price: 62000,
        parent_order_id: posId,
      },
    });
    console.log('SL1 Response:', sl1.status, sl1.json);
    const sl1Id = sl1.json?.order?.order_id;

    // 3. Concurrently fire rapid SL modification (SL2 at 61500 vs SL3 at 61000)
    const [mod1, mod2] = await Promise.all([
      api('/v1/oms/paper/orders/pending', {
        method: 'POST',
        token,
        body: {
          symbol: 'BINANCE:BTCUSDT.P',
          quantity: 0.01,
          side: 'SELL',
          type: 'SL',
          price: 61500,
          parent_order_id: posId,
        },
      }),
      api('/v1/oms/paper/orders/pending', {
        method: 'POST',
        token,
        body: {
          symbol: 'BINANCE:BTCUSDT.P',
          quantity: 0.01,
          side: 'SELL',
          type: 'SL',
          price: 61000,
          parent_order_id: posId,
        },
      }),
    ]);
    console.log('Concurrent SL Mod Responses:', { mod1: mod1.status, mod2: mod2.status });
    await sleep(2000);

    // 4. Inspect active pending orders
    const allPendingRes = await api('/v1/oms/paper/orders', { token });
    const pendingOrders = (allPendingRes.json?.orders || []).filter(o => o.state === 'PENDING' && o.parent_order_id === posId);
    console.log('Active Pending SL Orders for parent pos:', pendingOrders.map(o => ({ id: o.order_id, price: o.price, type: o.type, state: o.state })));

    // Cleanup position
    if (posId) {
      await api(`/v1/oms/paper/positions/${posId}/squareoff`, { method: 'POST', token, body: {} });
    }
    await cancelAllPaperPending(token);
    await sleep(1500);

    const net05Result = {
      id: 'NET05',
      title: 'Modify SL -> Immediately modify SL again',
      status: pendingOrders.length <= 1 ? 'PASS' : 'NOTICE (Multiple pending SL orders attached to single position)',
      activePendingCount: pendingOrders.length,
      orders: pendingOrders.map(o => ({ id: o.order_id, price: o.price })),
    };
    results.push(net05Result);
    console.log('NET05 Verdict:', net05Result);

    // =========================================================================
    // NET06: Modify TP -> Immediately Close Position (Orphan TP Order Check)
    // =========================================================================
    console.log('\n--- [NET06] Modify TP -> Immediately Close Position (Orphan Check) ---');
    // 1. Open market BUY position
    const buy2 = await api('/v1/oms/paper/orders', {
      method: 'POST',
      token,
      body: {
        symbol: 'BINANCE:BTCUSDT.P',
        quantity: 0.01,
        side: 'BUY',
        source: '1click',
        price: 63500,
      },
    });
    const posId2 = buy2.json?.order?.market_order_id;
    console.log('Opened position posId2:', posId2);
    await sleep(1500);

    // 2. Add TP at 65000
    const tpRes = await api('/v1/oms/paper/orders/pending', {
      method: 'POST',
      token,
      body: {
        symbol: 'BINANCE:BTCUSDT.P',
        quantity: 0.01,
        side: 'SELL',
        type: 'TP',
        price: 65000,
        parent_order_id: posId2,
      },
    });
    console.log('TP Response:', tpRes.status, tpRes.json);
    const tpId = tpRes.json?.order?.order_id;

    // 3. Immediately close position
    const closeRes = await api(`/v1/oms/paper/positions/${posId2}/squareoff`, {
      method: 'POST',
      token,
      body: {},
    });
    console.log('Close Position Response:', closeRes.status, closeRes.json);
    await sleep(2500);

    // 4. Check if the TP order is still PENDING (Orphan Order Bug!)
    const postOrdersRes = await api('/v1/oms/paper/orders', { token });
    const orphanOrders = (postOrdersRes.json?.orders || []).filter(o => o.order_id === tpId && o.state === 'PENDING');
    console.log('Orphan TP order count:', orphanOrders.length);

    if (orphanOrders.length > 0) {
      console.log('WARNING: Orphan TP order remained PENDING after position squareoff:', orphanOrders[0]);
      // Clean up orphan
      await api(`/v1/oms/paper/orders/${tpId}`, { method: 'DELETE', token });
    }

    const net06Result = {
      id: 'NET06',
      title: 'Modify TP -> Immediately close position (Orphan order check)',
      status: orphanOrders.length === 0 ? 'PASS' : 'DEFECT (Orphan TP pending order remained active after position was squared off)',
      tpOrderId: tpId,
      orphanOrdersCount: orphanOrders.length,
      isOrphanActive: orphanOrders.length > 0,
    };
    results.push(net06Result);
    console.log('NET06 Verdict:', net06Result);

  } finally {
    await closeAllPaperPositions(token).catch(() => {});
    await cancelAllPaperPending(token).catch(() => {});
  }

  fs.writeFileSync(path.join(__dirname, 'race_sltp_results.json'), JSON.stringify(results, null, 2));
  console.log('\n=== SUITE COMPLETE. Saved to race_sltp_results.json ===');
}

run().catch((err) => {
  console.error('Fatal in test runner:', err);
  process.exit(1);
});
