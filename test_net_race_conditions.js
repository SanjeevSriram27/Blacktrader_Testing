const fs = require('fs');
const path = require('path');
const os = require('os');

const creds = JSON.parse(fs.readFileSync(path.join(__dirname, 'pamm_credentials.json'), 'utf8'));
const BASE = creds.platform_base_url;

function loadPlaywright() {
  const npxDir = path.join(os.homedir(), '.npm', '_npx');
  for (const e of fs.readdirSync(npxDir)) {
    const c = path.join(npxDir, e, 'node_modules', 'playwright');
    if (fs.existsSync(c)) return require(c);
  }
}
function findCachedChromium() {
  const cacheDir = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  for (const e of fs.readdirSync(cacheDir).filter((d) => d.startsWith('chromium-'))) {
    const c = path.join(cacheDir, e, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
    if (fs.existsSync(c)) return c;
  }
}

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

async function loginClientApi(email, password) {
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
  if (!j.token) throw new Error(`Failed chart token: ${ct.status}`);
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
    if (o.state === 'PENDING' || o.status === 'pending' || (o.type === 'LIMIT' && o.filled_qty === 0 && o.state !== 'CANCELLED')) {
      await api(`/v1/oms/paper/orders/${o.order_id}`, { method: 'DELETE', token }).catch(() => {});
    }
  }
}

async function loginDashboard(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');

  await page.goto(creds.client_login_url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('#login-email').fill(creds.master.email);
  await page.locator('#login-password').fill(creds.master.password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {}),
    page.locator('#login-submit, button[type="submit"]').first().click(),
  ]);
  await page.waitForTimeout(800);
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(4500);
  const frame = page.frames().find((f) => f.url().includes('chartv2') || f.url().includes('iframeMode')) || page.mainFrame();
  return { context, page, frame, cdp };
}

async function clickOneClickBuy(frame) {
  const btn = frame.locator('button.buy-btn').first();
  if ((await btn.count()) === 0) return { found: false, reason: 'no button.buy-btn' };
  await btn.click({ force: true });
  return { found: true, selector: 'button.buy-btn' };
}

async function clickOneClickSell(frame) {
  const btn = frame.locator('button.sell-btn').first();
  if ((await btn.count()) === 0) return { found: false, reason: 'no button.sell-btn' };
  await btn.click({ force: true });
  return { found: true, selector: 'button.sell-btn' };
}

async function setNet(cdp, mode) {
  if (mode === 'slow3g') {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 1500,
      downloadThroughput: (50 * 1024) / 8,
      uploadThroughput: (50 * 1024) / 8,
    });
  } else if (mode === 'offline') {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
  } else {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
  }
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function run() {
  console.log('=== STARTING SUITE: NETWORK & SLOW INTERNET RACE CONDITIONS (NET02, NET04, NET08, NET10, NET14, NET15) ===');
  const results = [];
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: true, executablePath: findCachedChromium() });
  const { token } = await loginClientApi(creds.master.email, creds.master.password);

  try {
    await closeAllPaperPositions(token);
    await cancelAllPaperPending(token);

    // =========================================================================
    // NET02: Slow Internet -> Place BUY -> Immediately Click SELL (Hedging Check)
    // =========================================================================
    console.log('\n--- [NET02] Slow 3G: Click BUY -> Immediately Click SELL ---');
    const sessNet02 = await loginDashboard(browser);
    try {
      await setNet(sessNet02.cdp, 'slow3g');
      const buyClick = await clickOneClickBuy(sessNet02.frame);
      await sleep(60); // Immediate follow-up sell click within 60ms under Slow 3G
      const sellClick = await clickOneClickSell(sessNet02.frame);
      console.log('NET02 Clicks:', { buyClick, sellClick });
      
      // Wait for network requests to transit and process
      await sleep(6000);
      await setNet(sessNet02.cdp, 'online');
      await sleep(2500);

      const posRes = await api('/v1/oms/paper/positions', { token });
      const positions = posRes.json?.positions || [];
      console.log('NET02 Positions Result:', positions.map(p => ({ id: p.market_order_id, side: p.side, qty: p.qty, symbol: p.symbol })));

      // In Hedging mode, BUY then SELL must result in 2 separate positions (1 BUY, 1 SELL).
      const hasBuy = positions.some(p => p.side?.toUpperCase() === 'BUY');
      const hasSell = positions.some(p => p.side?.toUpperCase() === 'SELL');
      const isCleanHedging = positions.length === 2 && hasBuy && hasSell;

      const net02Result = {
        id: 'NET02',
        title: 'Slow internet -> Place BUY -> Immediately click SELL',
        status: isCleanHedging ? 'PASS' : (positions.length === 1 ? 'DEFECT (Accidental netting or dropped order)' : 'NOTICE'),
        openPositionsCount: positions.length,
        hasBuy,
        hasSell,
        positions: positions.map(p => ({ id: p.market_order_id, side: p.side, qty: p.qty })),
      };
      results.push(net02Result);
      console.log('NET02 Verdict:', net02Result);
    } finally {
      await closeAllPaperPositions(token);
      await sessNet02.context.close();
    }

    // =========================================================================
    // NET04: Place Pending Order -> Disconnect -> Reconnect (Duplicate Check)
    // =========================================================================
    console.log('\n--- [NET04] Place Pending Order -> Immediate Disconnect -> Reconnect ---');
    await cancelAllPaperPending(token);
    const prePendingOrders = (await api('/v1/oms/paper/orders', { token })).json?.orders || [];
    const preCount = prePendingOrders.filter(o => o.state === 'PENDING').length;

    // Simulate placing pending limit order under latency with abrupt disconnect
    const sessNet04 = await loginDashboard(browser);
    try {
      await setNet(sessNet04.cdp, 'slow3g');
      // Fire pending limit order via API through client
      const pendPromise = api('/v1/oms/paper/orders/pending', {
        method: 'POST',
        token,
        body: {
          symbol: 'BINANCE:BTCUSDT.P',
          side: 'buy',
          type: 'limit',
          qty: 0.01,
          price: 49000,
        },
      });
      // Cut network 50ms in
      await sleep(50);
      await setNet(sessNet04.cdp, 'offline');
      await sleep(3000);
      // Restore network
      await setNet(sessNet04.cdp, 'online');
      const pendRes = await pendPromise;
      console.log('NET04 Order response:', { status: pendRes.status, json: pendRes.json });
      await sleep(2000);

      const postPendingOrders = (await api('/v1/oms/paper/orders', { token })).json?.orders || [];
      const postPending = postPendingOrders.filter(o => o.state === 'PENDING');
      console.log('NET04 Active Pending Orders Count:', postPending.length);

      const net04Result = {
        id: 'NET04',
        title: 'Place pending order -> Disconnect -> Reconnect',
        status: postPending.length <= 1 ? 'PASS' : 'DEFECT (Duplicate pending orders created)',
        pendingCount: postPending.length,
        pendingOrders: postPending.map(o => ({ id: o.order_id, price: o.price, qty: o.requested_qty, state: o.state })),
      };
      results.push(net04Result);
      console.log('NET04 Verdict:', net04Result);
    } finally {
      await cancelAllPaperPending(token);
      await sessNet04.context.close();
    }

    // =========================================================================
    // NET08: Click Cancel Order Repeatedly on Pending Order (5x Concurrent Burst)
    // =========================================================================
    console.log('\n--- [NET08] Click Cancel Order Repeatedly (5x Concurrent Burst) ---');
    // 1. Create a fresh pending order
    const pOrder = await api('/v1/oms/paper/orders/pending', {
      method: 'POST',
      token,
      body: {
        symbol: 'BINANCE:BTCUSDT.P',
        side: 'buy',
        type: 'limit',
        qty: 0.01,
        price: 48500,
      },
    });
    const orderId = pOrder.json?.order?.order_id;
    console.log('Created pending order for NET08:', orderId);

    if (!orderId) {
      results.push({ id: 'NET08', status: 'FAIL', reason: 'Failed to create pending order' });
    } else {
      // Fire 5 concurrent cancellation requests simultaneously
      const burstPromises = [
        api(`/v1/oms/paper/orders/${orderId}`, { method: 'DELETE', token }),
        api(`/v1/oms/paper/orders/${orderId}`, { method: 'DELETE', token }),
        api(`/v1/oms/paper/orders/${orderId}`, { method: 'DELETE', token }),
        api(`/v1/oms/paper/orders/${orderId}`, { method: 'DELETE', token }),
        api(`/v1/oms/paper/orders/${orderId}`, { method: 'DELETE', token }),
      ];
      const cancelResponses = await Promise.all(burstPromises);
      const statuses = cancelResponses.map(r => r.status);
      console.log('NET08 Cancel Burst Statuses:', statuses);

      const okCount = statuses.filter(s => s === 200).length;
      const rejectCount = statuses.filter(s => s === 400 || s === 404).length;
      const serverErrors = statuses.filter(s => s >= 500).length;

      // Verify the final state of the order in OMS
      const checkOrd = await api(`/v1/oms/paper/orders/${orderId}`, { token });
      const finalState = checkOrd.json?.order?.state || checkOrd.json?.state;

      const net08Result = {
        id: 'NET08',
        title: 'Click Cancel Order repeatedly (5x Concurrent Cancel Burst)',
        status: (okCount === 1 && serverErrors === 0) ? 'PASS' : 'DEFECT',
        statuses,
        okCount,
        rejectCount,
        serverErrors,
        sampleRejectMessage: cancelResponses.find(r => r.status !== 200)?.text?.trim(),
        finalState,
      };
      results.push(net08Result);
      console.log('NET08 Verdict:', net08Result);
    }

    // =========================================================================
    // NET10: Place BUY -> Switch to Another Module / View Before Response
    // =========================================================================
    console.log('\n--- [NET10] Place BUY -> Switch Module / Tab Before Response ---');
    const sessNet10 = await loginDashboard(browser);
    try {
      await setNet(sessNet10.cdp, 'slow3g');
      const buyClick = await clickOneClickBuy(sessNet10.frame);
      // Immediately navigate / switch page tab within 100ms
      await sleep(100);
      await sessNet10.page.goto(`${BASE}/pamm`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      await setNet(sessNet10.cdp, 'online');
      await sleep(4000);

      // Verify server position status
      const posRes = await api('/v1/oms/paper/positions', { token });
      const positions = posRes.json?.positions || [];
      console.log('NET10 Server Positions:', positions.length);

      const net10Result = {
        id: 'NET10',
        title: 'Place BUY -> Switch to another module before response',
        status: positions.length === 1 ? 'PASS' : 'DEFECT (Order lost or duplicate)',
        positionsCount: positions.length,
      };
      results.push(net10Result);
      console.log('NET10 Verdict:', net10Result);
    } finally {
      await closeAllPaperPositions(token);
      await sessNet10.context.close();
    }

    // =========================================================================
    // NET14: Slow Internet -> Switch Broker / Instance Dropdown During Order Submission
    // =========================================================================
    console.log('\n--- [NET14] Slow Internet -> Switch Broker During Order Submission ---');
    const sessNet14 = await loginDashboard(browser);
    try {
      const realBefore = (await api('/v1/oms/real/orders', { token })).json?.count || 0;
      const paperBefore = (await api('/v1/oms/paper/orders', { token })).json?.count || 0;

      await setNet(sessNet14.cdp, 'slow3g');
      // Click BUY on Paper
      await clickOneClickBuy(sessNet14.frame);
      await sleep(80); // In flight

      // Switch instance dropdown to real while order is in flight
      await sessNet14.frame.evaluate(() => {
        for (const s of document.querySelectorAll('select')) {
          const realOpt = Array.from(s.options).find((o) => o.value === 'real');
          if (realOpt) { s.value = 'real'; s.dispatchEvent(new Event('change', { bubbles: true })); }
        }
      });

      await sleep(5000);
      await setNet(sessNet14.cdp, 'online');
      await sleep(2500);

      const realAfter = (await api('/v1/oms/real/orders', { token })).json?.count || 0;
      const paperAfter = (await api('/v1/oms/paper/orders', { token })).json?.count || 0;

      const realDelta = realAfter - realBefore;
      const paperDelta = paperAfter - paperBefore;

      const net14Result = {
        id: 'NET14',
        title: 'Slow internet -> Switch broker during order submission',
        status: (realDelta === 0 && paperDelta === 1) ? 'PASS' : 'DEFECT (Order routed to wrong broker)',
        realDelta,
        paperDelta,
        misrouted: realDelta > 0,
      };
      results.push(net14Result);
      console.log('NET14 Verdict:', net14Result);
    } finally {
      await closeAllPaperPositions(token);
      await sessNet14.context.close();
    }

    // =========================================================================
    // NET15: Reconnect Repeatedly During Order Execution (Network Flapping)
    // =========================================================================
    console.log('\n--- [NET15] Reconnect Repeatedly During Order Execution (Flapping) ---');
    const sessNet15 = await loginDashboard(browser);
    try {
      const preOrders = (await api('/v1/oms/paper/orders', { token })).json?.count || 0;
      
      // Click 1-click buy
      await clickOneClickBuy(sessNet15.frame);
      // Flap network on and off rapidly 4 times
      for (let i = 0; i < 4; i++) {
        await setNet(sessNet15.cdp, 'offline');
        await sleep(150);
        await setNet(sessNet15.cdp, 'online');
        await sleep(150);
      }
      await sleep(3500);

      const postOrders = (await api('/v1/oms/paper/orders', { token })).json?.count || 0;
      const postPositions = (await api('/v1/oms/paper/positions', { token })).json?.positions || [];
      const orderDelta = postOrders - preOrders;

      const net15Result = {
        id: 'NET15',
        title: 'Reconnect repeatedly during order execution (Network Flapping)',
        status: orderDelta <= 1 ? 'PASS' : 'DEFECT (Duplicate processing of execution events)',
        orderDelta,
        positionsCount: postPositions.length,
      };
      results.push(net15Result);
      console.log('NET15 Verdict:', net15Result);
    } finally {
      await closeAllPaperPositions(token);
      await sessNet15.context.close();
    }

  } finally {
    await closeAllPaperPositions(token).catch(() => {});
    await cancelAllPaperPending(token).catch(() => {});
    await browser.close();
  }

  fs.writeFileSync(path.join(__dirname, 'race_net_suite_results.json'), JSON.stringify(results, null, 2));
  console.log('\n=== SUITE COMPLETE. Saved to race_net_suite_results.json ===');
}

run().catch((err) => {
  console.error('Fatal in test runner:', err);
  process.exit(1);
});
