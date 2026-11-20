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
  const res = await fetch(`${BASE}${urlPath}`, { method, headers: hdrs, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, json, text };
}

async function loginClientApi(email, password) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, remember: true }),
  });
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  const ct = await fetch(`${BASE}/api/auth/chart-token`, { method: 'POST', headers: { Cookie: cookie } });
  return (await ct.json()).token;
}

async function closeAllPaperPositions(token) {
  const p = (await api('/v1/oms/paper/positions', { token })).json;
  for (const pos of p?.positions || []) {
    await api(`/v1/oms/paper/positions/${encodeURIComponent(pos.market_order_id)}/squareoff`, { method: 'POST', token, body: {} });
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

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function setNet(cdp, mode) {
  if (mode === 'slow3g') {
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 1500, downloadThroughput: (50 * 1024) / 8, uploadThroughput: (50 * 1024) / 8 });
  } else if (mode === 'offline') {
    await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  } else {
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  }
}

async function main() {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: true, executablePath: findCachedChromium() });
  const token = await loginClientApi(creds.master.email, creds.master.password);
  const results = [];

  try {
    await closeAllPaperPositions(token);
    const { context, page, frame, cdp } = await loginDashboard(browser);

    const postLog = [];
    page.on('request', (req) => {
      if (req.url().includes('/orders') && req.method() === 'POST') {
        postLog.push({ ts: Date.now(), url: req.url(), postData: req.postData() });
      }
    });

    // Verify 1-click BUY actually works on Online first (sanity check!)
    const preSanityOrders = (await api('/v1/oms/paper/orders', { token })).json?.count || 0;
    const clickInfo = await clickOneClickBuy(frame);
    await sleep(2500);
    const postSanityOrders = (await api('/v1/oms/paper/orders', { token })).json?.count || 0;
    console.log('1-Click BUY Sanity Check:', { clickInfo, newPaperOrders: postSanityOrders - preSanityOrders, clientPosts: postLog.length });
    await closeAllPaperPositions(token);
    await sleep(800);

    // =========================================================================
    // NET01: Slow 3G -> Click BUY 5x rapidly before response arrives (Duplicate BUY test!)
    // =========================================================================
    console.log('\n=== NET01: Slow 3G -> Rapidly Click BUY 5x Before First Response ===');
    const preN1Orders = (await api('/v1/oms/paper/orders', { token })).json?.count || 0;
    const preN1Posts = postLog.length;
    await setNet(cdp, 'slow3g');
    for (let i = 0; i < 5; i++) {
      await clickOneClickBuy(frame);
      await sleep(80);
    }
    await sleep(5000);
    await setNet(cdp, 'online');
    await sleep(2000);
    const postN1Orders = (await api('/v1/oms/paper/orders', { token })).json?.count || 0;
    const postN1Pos = (await api('/v1/oms/paper/positions', { token })).json?.count || 0;
    const n1ClientPosts = postLog.length - preN1Posts;
    const n1ServerOrders = postN1Orders - preN1Orders;
    const net01Res = {
      id: 'NET01',
      status: n1ServerOrders <= 1 ? 'PASS' : 'DEFECT',
      clicksSent: 5,
      clientHttpPostsFired: n1ClientPosts,
      serverOrdersCreated: n1ServerOrders,
      serverOpenPositions: postN1Pos,
    };
    results.push(net01Res);
    console.log('NET01 Result:', JSON.stringify(net01Res));
    await closeAllPaperPositions(token);
    await sleep(1000);

    // =========================================================================
    // NET03: Slow 3G -> Click BUY -> Immediate Offline -> Reconnect (5 timings!)
    // =========================================================================
    console.log('\n=== NET03: Slow 3G -> Click BUY -> Immediate Offline -> Reconnect (REAL POSTs) ===');
    const net03Runs = [];
    for (const delayMs of [30, 120, 300, 700, 1400]) {
      await closeAllPaperPositions(token);
      await sleep(600);
      const beforeOrd = (await api('/v1/oms/paper/orders', { token })).json?.count || 0;
      const beforePosts = postLog.length;

      await setNet(cdp, 'slow3g');
      await clickOneClickBuy(frame);
      await sleep(delayMs);
      await setNet(cdp, 'offline');
      await sleep(2500);
      await setNet(cdp, 'online');
      await sleep(3000);

      const afterOrd = (await api('/v1/oms/paper/orders', { token })).json?.count || 0;
      const afterPos = (await api('/v1/oms/paper/positions', { token })).json?.count || 0;
      const uiState = await frame.evaluate(() => {
        const t = document.body.innerText || '';
        const pIdx = t.indexOf('Positions');
        const sub = pIdx >= 0 ? t.slice(pIdx, pIdx + 400) : '';
        return { showsNoPositions: sub.includes('No positions'), hasBtcPos: sub.includes('BTCUSDT') };
      });
      const reconciled = (afterPos === 0 && uiState.showsNoPositions) || (afterPos > 0 && uiState.hasBtcPos);
      net03Runs.push({
        disconnectDelayMs: delayMs,
        clientPosts: postLog.length - beforePosts,
        serverNewOrders: afterOrd - beforeOrd,
        serverOpenPositions: afterPos,
        uiShowsNoPositions: uiState.showsNoPositions,
        uiHasBtcPos: uiState.hasBtcPos,
        reconciled,
      });
    }
    await page.screenshot({ path: path.join(__dirname, 'screenshots', 'race_net03_real_verified.png') });
    await closeAllPaperPositions(token);
    const n3Dupes = net03Runs.some((r) => r.serverNewOrders > 1);
    const n3UiDesync = net03Runs.some((r) => !r.reconciled);
    const net03Res = {
      id: 'NET03',
      status: (!n3Dupes && !n3UiDesync) ? 'PASS' : 'DEFECT',
      duplicatesFound: n3Dupes,
      uiReconciliationDesync: n3UiDesync,
      runs: net03Runs,
    };
    results.push(net03Res);
    console.log('NET03 Result:', JSON.stringify(net03Res, null, 2));

    // =========================================================================
    // NET09: Slow 3G -> Click BUY -> Immediately Refresh Page While Loading
    // =========================================================================
    console.log('\n=== NET09: Slow 3G -> Click BUY -> Refresh While Loading ===');
    const preN9Ord = (await api('/v1/oms/paper/orders', { token })).json?.count || 0;
    const preN9Posts = postLog.length;
    await setNet(cdp, 'slow3g');
    await clickOneClickBuy(frame);
    await sleep(250);
    await setNet(cdp, 'online');
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    await sleep(4000);
    const postN9Ord = (await api('/v1/oms/paper/orders', { token })).json?.count || 0;
    const postN9Pos = (await api('/v1/oms/paper/positions', { token })).json?.count || 0;
    const net09Res = {
      id: 'NET09',
      status: (postN9Ord - preN9Ord) <= 1 ? 'PASS' : 'DEFECT',
      clientPosts: postLog.length - preN9Posts,
      serverNewOrders: postN9Ord - preN9Ord,
      serverOpenPositions: postN9Pos,
    };
    results.push(net09Res);
    console.log('NET09 Result:', JSON.stringify(net09Res));
    await closeAllPaperPositions(token);
    await context.close();

    // =========================================================================
    // BR08: Browser A switches to Real while Browser B clicks 1-click BUY on Paper
    // =========================================================================
    console.log('\n=== BR08: Browser A Switches to Real While Browser B Clicks 1-Click BUY on Paper ===');
    const [sessA, sessB] = await Promise.all([loginDashboard(browser), loginDashboard(browser)]);
    const realBefore = (await api('/v1/oms/real/orders', { token })).json?.count || 0;
    const paperBefore = (await api('/v1/oms/paper/orders', { token })).json?.count || 0;

    await sessA.frame.evaluate(() => {
      for (const s of document.querySelectorAll('select')) {
        const realOpt = Array.from(s.options).find((o) => o.value === 'real');
        if (realOpt) { s.value = 'real'; s.dispatchEvent(new Event('change', { bubbles: true })); }
      }
    });
    const br08Click = await clickOneClickBuy(sessB.frame);
    await sleep(2500);
    const realAfter = (await api('/v1/oms/real/orders', { token })).json?.count || 0;
    const paperAfter = (await api('/v1/oms/paper/orders', { token })).json?.count || 0;
    await closeAllPaperPositions(token);
    await sessA.context.close();
    await sessB.context.close();

    const br08Res = {
      id: 'BR08',
      status: (realAfter === realBefore && paperAfter - paperBefore === 1) ? 'PASS' : 'DEFECT',
      br08Click,
      realOrdersDelta: realAfter - realBefore,
      paperOrdersDelta: paperAfter - paperBefore,
    };
    results.push(br08Res);
    console.log('BR08 Result:', JSON.stringify(br08Res));
  } finally {
    await closeAllPaperPositions(token).catch(() => {});
    await browser.close();
  }

  fs.writeFileSync(path.join(__dirname, 'race_net01_03_09_br08_results.json'), JSON.stringify(results, null, 2));
  console.log('\nSaved race_net01_03_09_br08_results.json');
}

main().catch((e) => { console.error(e); process.exit(1); });
