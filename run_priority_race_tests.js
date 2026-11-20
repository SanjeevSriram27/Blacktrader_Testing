const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const creds = JSON.parse(fs.readFileSync(path.join(__dirname, 'pamm_credentials.json'), 'utf8'));
const BASE = creds.platform_base_url;
const SYMBOL = 'BINANCE:BTCUSDT.P';

function loadPlaywright() {
  try { return require('playwright'); } catch {}
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
  if (!j.token) throw new Error(`Failed chart-token for ${email}: ${ct.status}`);
  return { token: j.token, cookie };
}

async function loginDashboardPage(browser, email, password) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');

  await page.goto(creds.client_login_url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
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

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function closeAllPaperPositions(token) {
  const p = (await api('/v1/oms/paper/positions', { token })).json;
  for (const pos of p?.positions || []) {
    await api(`/v1/oms/paper/positions/${encodeURIComponent(pos.market_order_id)}/squareoff`, {
      method: 'POST', token, body: {},
    });
  }
}

async function setSlow3G(cdp) {
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 1500,
    downloadThroughput: (50 * 1024) / 8,
    uploadThroughput: (50 * 1024) / 8,
  });
}

async function setOffline(cdp) {
  await cdp.send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });
}

async function setOnline(cdp) {
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
}

async function main() {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: true, executablePath: findCachedChromium() });
  const results = [];

  function record(id, title, status, details) {
    results.push({ id, title, status, details });
    const icon = status === 'PASS' ? '✅' : status === 'DEFECT' ? '🔴' : status === 'FAIL' ? '❌' : 'ℹ️';
    console.log(`\n${icon} [${status}] ${id} — ${title}`);
    console.log('   ', typeof details === 'string' ? details : JSON.stringify(details).slice(0, 420));
  }

  const { token: masterToken } = await loginClientApi(creds.master.email, creds.master.password);
  const f10 = creds.followers[9];
  const { token: f10Token } = await loginClientApi(f10.email, f10.password);

  try {
    // Clean any leftover paper positions on pmmaster first
    await closeAllPaperPositions(masterToken);
    await sleep(500);

    // =========================================================================
    // PRIORITY 1: NET03 — Slow 3G -> Click BUY -> Immediate Offline -> Reconnect
    // (Executed on Paper Hedging using pmmaster@mailinator.com, 5 timing iterations)
    // =========================================================================
    console.log('=== [1/6] NET03: Slow 3G -> BUY -> Immediate Offline -> Reconnect (5 timings) ===');
    const net03Session = await loginDashboardPage(browser, creds.master.email, creds.master.password);
    const { page: p3, frame: f3, cdp: cdp3 } = net03Session;
    const net03Requests = [];
    p3.on('request', (req) => {
      if (req.url().includes('/orders') && req.method() === 'POST') {
        net03Requests.push({ ts: Date.now(), url: req.url(), postData: req.postData() });
      }
    });

    const net03Runs = [];
    const disconnectDelays = [30, 80, 150, 300, 500];

    for (const delayMs of disconnectDelays) {
      await closeAllPaperPositions(masterToken);
      await sleep(500);
      const beforeOrders = (await api('/v1/oms/paper/orders', { token: masterToken })).json?.count || 0;
      const beforePos = (await api('/v1/oms/paper/positions', { token: masterToken })).json?.count || 0;
      const reqCountBefore = net03Requests.length;

      await setSlow3G(cdp3);
      // Click the 1-click BUY button on the Chart overlay ("B" button with live ask price)
      const buyBtn = f3.locator('button:has-text("B"):not(:has-text("BTC"))').first();
      const hasBuyBtn = (await buyBtn.count()) > 0;
      if (hasBuyBtn) {
        await buyBtn.click({ force: true }).catch(() => {});
      }
      // Disconnect immediately after delayMs before response arrives
      await sleep(delayMs);
      await setOffline(cdp3);
      await sleep(2500);
      await setOnline(cdp3);
      await sleep(3000);

      const afterOrders = (await api('/v1/oms/paper/orders', { token: masterToken })).json;
      const afterPos = (await api('/v1/oms/paper/positions', { token: masterToken })).json;
      const newOrders = (afterOrders?.count || 0) - beforeOrders;
      const newPos = (afterPos?.count || 0) - beforePos;
      const clientPosts = net03Requests.length - reqCountBefore;

      // Also check UI reconciliation (does UI position count match backend position count?)
      const uiPosRows = await f3.evaluate(() => {
        const txt = document.body.innerText || '';
        return { showsNoPositions: txt.includes('No positions'), hasBtcInTrades: /BINANCE:BTCUSDT\.P|BTCUSDT\.P/.test(txt.slice(txt.indexOf('Positions'))) };
      });

      net03Runs.push({
        disconnectDelayMs: delayMs,
        clickedUiBuy: hasBuyBtn,
        clientPostCount: clientPosts,
        serverNewOrders: newOrders,
        serverOpenPositions: afterPos?.count || 0,
        uiShowsNoPositions: uiPosRows.showsNoPositions,
        reconciled: (afterPos?.count === 0 && uiPosRows.showsNoPositions) || (afterPos?.count > 0 && !uiPosRows.showsNoPositions),
      });
    }
    await p3.screenshot({ path: path.join(__dirname, 'screenshots', 'race_net03_after_reconnect.png') });
    await closeAllPaperPositions(masterToken);
    await net03Session.context.close();

    const net03Duplicates = net03Runs.some((r) => r.serverNewOrders > 1 || r.clientPostCount > 1);
    const net03Mismatch = net03Runs.some((r) => !r.reconciled);
    record('NET03', 'Slow 3G -> Click BUY -> Immediate Offline -> Reconnect (5 timings)',
      (!net03Duplicates && !net03Mismatch) ? 'PASS' : 'DEFECT',
      { duplicatesFound: net03Duplicates, uiReconciliationMismatch: net03Mismatch, runs: net03Runs });

    // =========================================================================
    // PRIORITY 2: NET07 — Click Close Position Repeatedly on Slow Internet
    // (1 open position on Paper Hedging -> 5 rapid concurrent squareoff calls + UI check)
    // =========================================================================
    console.log('\n=== [2/6] NET07: Repeated Close Position Clicks on Slow Internet ===');
    await closeAllPaperPositions(masterToken);
    const open7 = await api('/v1/oms/paper/orders', {
      method: 'POST', token: masterToken,
      body: { symbol: SYMBOL, side: 'BUY', qty: 0.01, type: 'MARKET' },
    });
    const posId7 = open7.json?.order?.market_order_id;
    const histBefore7 = (await api('/v1/oms/paper/history?limit=50', { token: masterToken })).json?.total || 0;
    const balBefore7 = (await api('/v1/oms/paper/funds', { token: masterToken })).json?.funds?.balance;

    // Fire 5 rapid close/squareoff clicks simultaneously (simulating frantic slow-internet clicks)
    const closeBurst7 = await Promise.all(
      Array.from({ length: 5 }, () =>
        api(`/v1/oms/paper/positions/${encodeURIComponent(posId7)}/squareoff`, {
          method: 'POST', token: masterToken, body: {},
        })
      )
    );
    await sleep(1000);
    const posAfter7 = (await api('/v1/oms/paper/positions', { token: masterToken })).json;
    const histAfter7 = (await api('/v1/oms/paper/history?limit=50', { token: masterToken })).json;
    const okCloses7 = closeBurst7.filter((r) => r.ok).length;
    const newHist7 = (histAfter7?.total || 0) - histBefore7;

    record('NET07', 'Click Close Position Repeatedly (5x Concurrent Squareoff Burst)',
      (okCloses7 === 1 && posAfter7?.count === 0 && newHist7 === 1) ? 'PASS' : 'DEFECT',
      {
        posId: posId7,
        statuses: closeBurst7.map((r) => r.status),
        okClosesCount: okCloses7,
        remainingOpenPositions: posAfter7?.count,
        newHistoryRecords: newHist7,
        sampleReject: closeBurst7.find((r) => !r.ok)?.text?.slice(0, 140),
      });

    // =========================================================================
    // PRIORITY 3: BR07 — Two Separate Browser Tabs/Contexts Close Same Position Simultaneously
    // =========================================================================
    console.log('\n=== [3/6] BR07: Two Browser Sessions Close Same Position Simultaneously ===');
    await closeAllPaperPositions(masterToken);
    const openBr7 = await api('/v1/oms/paper/orders', {
      method: 'POST', token: masterToken,
      body: { symbol: SYMBOL, side: 'BUY', qty: 0.01, type: 'MARKET' },
    });
    const posIdBr7 = openBr7.json?.order?.market_order_id;
    const histBeforeBr7 = (await api('/v1/oms/paper/history?limit=50', { token: masterToken })).json?.total || 0;

    // Login two independent browser sessions (simulating Chrome + Edge / two profiles)
    const [tabA, tabB] = await Promise.all([
      loginClientApi(creds.master.email, creds.master.password),
      loginClientApi(creds.master.email, creds.master.password),
    ]);

    // Both independent sessions fire Close Position at the exact same millisecond
    const [resTabA, resTabB] = await Promise.all([
      api(`/v1/oms/paper/positions/${encodeURIComponent(posIdBr7)}/squareoff`, { method: 'POST', token: tabA.token, body: {} }),
      api(`/v1/oms/paper/positions/${encodeURIComponent(posIdBr7)}/squareoff`, { method: 'POST', token: tabB.token, body: {} }),
    ]);
    await sleep(1000);
    const posAfterBr7 = (await api('/v1/oms/paper/positions', { token: masterToken })).json;
    const histAfterBr7 = (await api('/v1/oms/paper/history?limit=50', { token: masterToken })).json;
    const okBr7 = [resTabA, resTabB].filter((r) => r.ok).length;
    const newHistBr7 = (histAfterBr7?.total || 0) - histBeforeBr7;

    record('BR07', 'Two Independent Browser Sessions Close Same Position Simultaneously',
      (okBr7 === 1 && posAfterBr7?.count === 0 && newHistBr7 === 1) ? 'PASS' : 'DEFECT',
      {
        posId: posIdBr7,
        sessionAStatus: resTabA.status,
        sessionBStatus: resTabB.status,
        okClosesCount: okBr7,
        remainingOpenPositions: posAfterBr7?.count,
        newHistoryRecords: newHistBr7,
      });

    // =========================================================================
    // PRIORITY 4: BR08 — Browser A Switches Account (Paper -> Real) While Browser B Places Paper Order
    // =========================================================================
    console.log('\n=== [4/6] BR08: Browser A Switches Broker/Instance While Browser B Places Order ===');
    const [sessA, sessB] = await Promise.all([
      loginDashboardPage(browser, creds.master.email, creds.master.password),
      loginDashboardPage(browser, creds.master.email, creds.master.password),
    ]);
    const realOrdersBefore = (await api('/v1/oms/real/orders', { token: masterToken })).json?.count || 0;
    const paperOrdersBefore = (await api('/v1/oms/paper/orders', { token: masterToken })).json?.count || 0;

    // In Browser A, switch Trade Statistics / instance select to Real (Hedging)
    await sessA.frame.evaluate(() => {
      for (const s of document.querySelectorAll('select')) {
        const realOpt = Array.from(s.options).find((o) => o.value === 'real');
        if (realOpt) {
          s.value = 'real';
          s.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    });
    // Simultaneously in Browser B (which is still on Paper Hedging), click 1-click BUY!
    const bBuyBtn = sessB.frame.locator('button:has-text("B"):not(:has-text("BTC"))').first();
    if ((await bBuyBtn.count()) > 0) {
      await bBuyBtn.click({ force: true }).catch(() => {});
    }
    await sleep(2500);

    const realOrdersAfter = (await api('/v1/oms/real/orders', { token: masterToken })).json?.count || 0;
    const paperOrdersAfter = (await api('/v1/oms/paper/orders', { token: masterToken })).json?.count || 0;
    const wrongRealRouted = realOrdersAfter > realOrdersBefore;

    await closeAllPaperPositions(masterToken);
    await sessA.context.close();
    await sessB.context.close();

    record('BR08', 'Browser A Switches Instance (Paper->Real) While Browser B Submits Paper Order',
      (!wrongRealRouted && paperOrdersAfter >= paperOrdersBefore) ? 'PASS' : 'DEFECT',
      {
        realOrdersDelta: realOrdersAfter - realOrdersBefore,
        paperOrdersDelta: paperOrdersAfter - paperOrdersBefore,
        routedToWrongRealAccount: wrongRealRouted,
      });

    // =========================================================================
    // PRIORITY 5: CP04 — Follower Clicks Unfollow While Master Simultaneously Places BUY (Live Real PAMM!)
    // =========================================================================
    console.log('\n=== [5/6] CP04: Concurrent Follower Unfollow (pmf10) vs Master BUY (pmmaster) ===');
    // Verify pmf10 is active before race
    const preCp04 = (await api('/v1/oms/real/pamm/follows', { token: masterToken })).json;
    const f10BalPreCp04 = (await api('/v1/oms/real/funds', { token: f10Token })).json?.funds?.balance;

    // Fire BOTH simultaneously at the exact same millisecond:
    // - pmf10 calls POST /v1/oms/real/pamm/unfollow
    // - pmmaster calls POST /v1/oms/real/orders (tiny 0.001 lot BUY)
    const [cp04Unfollow, cp04Buy] = await Promise.all([
      api('/v1/oms/real/pamm/unfollow', {
        method: 'POST', token: f10Token,
        body: { master_client_id: creds.master.member_id },
      }),
      api('/v1/oms/real/orders', {
        method: 'POST', token: masterToken,
        body: { symbol: SYMBOL, side: 'BUY', qty: 0.001, type: 'MARKET' },
      }),
    ]);
    await sleep(1200);

    const cp04PosId = cp04Buy.json?.order?.market_order_id;
    const midFollows = (await api('/v1/oms/real/pamm/follows', { token: masterToken })).json;
    const f10StillInPool = (midFollows?.pool || []).some((p) => p.follower_client_id === f10.member_id && p.status === 'active');

    // Close the tiny 0.001 master trade cleanly
    let cp04Close = null;
    if (cp04PosId) {
      cp04Close = await api(`/v1/oms/real/positions/${encodeURIComponent(cp04PosId)}/squareoff`, {
        method: 'POST', token: masterToken, body: {},
      });
      await sleep(800);
    }

    const f10BalPostCp04 = (await api('/v1/oms/real/funds', { token: f10Token })).json?.funds?.balance;
    // Check legal serialization outcomes:
    // Legal A: Unfollow won BEFORE Buy -> unfollow=200, buy=200, pmf10 NOT in pool, pmf10 got ~$100 back
    // Legal B: Buy won BEFORE Unfollow -> buy=200, unfollow=400 ("open trades"), pmf10 STILL in pool, pmf10 balance unchanged
    const legalA = cp04Unfollow.ok && cp04Buy.ok && !f10StillInPool && Math.abs((f10BalPostCp04 - f10BalPreCp04) - 100) < 0.5;
    const legalB = !cp04Unfollow.ok && cp04Buy.ok && f10StillInPool && Math.abs(f10BalPostCp04 - f10BalPreCp04) < 0.01;
    const cp04Consistent = legalA || legalB;

    // Re-join pmf10 if unfollow won so all 10 followers are restored
    if (!f10StillInPool) {
      await api('/v1/oms/real/pamm/join', {
        method: 'POST', token: f10Token,
        body: {
          master_client_id: creds.master.member_id,
          deposit: 100,
          operation_key: `cp04-restore-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
        },
      });
      await sleep(500);
    }

    record('CP04', 'Follower Unfollow (pmf10) vs Master BUY (pmmaster) Simultaneous Race',
      cp04Consistent ? 'PASS' : 'DEFECT',
      {
        winner: legalA ? 'UNFOLLOW_BEFORE_BUY (clean cutoff)' : legalB ? 'BUY_BEFORE_UNFOLLOW (unfollow blocked cleanly)' : 'INCONSISTENT_STATE',
        unfollowStatus: cp04Unfollow.status,
        unfollowResp: cp04Unfollow.text.slice(0, 180),
        buyStatus: cp04Buy.status,
        f10StillInPoolDuringTrade: f10StillInPool,
        f10BalanceDelta: Number((f10BalPostCp04 - f10BalPreCp04).toFixed(4)),
        masterClosePnl: cp04Close?.json?.realized_pnl,
      });

    // =========================================================================
    // PRIORITY 6: AL07 — Stop Algo -> Immediately Restart (Probe Live Algo API + Race)
    // =========================================================================
    console.log('\n=== [6/6] AL07: Stop Algo -> Immediately Restart (Duplicate Instance Race) ===');
    const algoProbes = [
      '/v1/oms/paper/algos',
      '/v1/oms/paper/algo/instances',
      '/v1/oms/paper/strategies',
      '/v1/chart/algo/list',
      '/v1/chart/algos',
    ];
    const algoProbeRes = [];
    for (const ep of algoProbes) {
      const r = await api(ep, { token: masterToken });
      algoProbeRes.push({ ep, status: r.status, preview: r.text.slice(0, 140) });
    }
    // Also inspect Algo widget in Playwright UI to discover real Algo endpoints/controls
    const algoSess = await loginDashboardPage(browser, creds.master.email, creds.master.password);
    const algoNet = [];
    algoSess.page.on('response', async (res) => {
      if (/algo|strateg|script|cloud/i.test(res.url())) {
        let prev = '';
        try { prev = (await res.text()).slice(0, 180); } catch {}
        algoNet.push({ method: res.request().method(), status: res.status(), url: res.url(), prev });
      }
    });
    const gridBtn = algoSess.frame.locator('button.tw-grid[title="Add widget"], button.tw-grid').first();
    await gridBtn.click({ timeout: 8000 }).catch(() => {});
    await sleep(600);
    const algoWidgetBtn = algoSess.frame.locator('button:has-text("Algo"), div:text-is("Algo")').first();
    let algoWidgetOpened = false;
    if ((await algoWidgetBtn.count()) > 0) {
      await algoWidgetBtn.click({ timeout: 8000 }).catch(() => {});
      await sleep(2500);
      algoWidgetOpened = true;
      await algoSess.page.screenshot({ path: path.join(__dirname, 'screenshots', 'race_al07_algo_widget.png') });
    }
    const algoUiText = await algoSess.frame.evaluate(() => {
      const t = document.body.innerText || '';
      const idx = t.indexOf('Algo');
      return idx >= 0 ? t.slice(idx, idx + 800) : '';
    });
    await algoSess.context.close();

    record('AL07', 'Stop Algo -> Immediately Restart (Discovery & Readiness Check)',
      'INFO',
      {
        algoWidgetOpened,
        algoApiProbes: algoProbeRes,
        algoUiNetworkCalls: algoNet.slice(0, 10),
        algoUiExcerpt: algoUiText.slice(0, 400),
      });
  } finally {
    await closeAllPaperPositions(masterToken).catch(() => {});
    await browser.close();
  }

  fs.writeFileSync(path.join(__dirname, 'priority_race_test_results.json'), JSON.stringify({
    executed_at: new Date().toISOString(),
    accounts_used: [creds.master.email, creds.followers[9].email],
    results,
  }, null, 2));
  console.log('\nSaved priority_race_test_results.json');
}

main().catch((e) => { console.error('Race test failed:', e); process.exit(1); });
