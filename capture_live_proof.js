const fs = require('fs');
const path = require('path');
const os = require('os');

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

function loadPlaywright() {
  try { return require('playwright'); } catch {}
  const npxDir = path.join(os.homedir(), '.npm', '_npx');
  for (const entry of fs.readdirSync(npxDir)) {
    const c = path.join(npxDir, entry, 'node_modules', 'playwright');
    if (fs.existsSync(c)) return require(c);
  }
}

function findCachedChromium() {
  const cacheDir = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  for (const entry of fs.readdirSync(cacheDir).filter((d) => d.startsWith('chromium-'))) {
    const c = path.join(cacheDir, entry, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
    if (fs.existsSync(c)) return c;
  }
}

async function main() {
  // 1. Fetch LIVE data directly from https://lpadmin.blackfx.com API right now
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: creds.master.email, password: creds.master.password, remember: true }),
  });
  const cookie = (loginRes.headers.get('set-cookie') || '').split(';')[0];
  const { token } = await (await fetch(`${BASE}/api/auth/chart-token`, { method: 'POST', headers: { Cookie: cookie } })).json();
  const hdrs = { Authorization: `Bearer ${token}`, Accept: 'application/json' };

  const hist = await (await fetch(`${BASE}/v1/oms/real/history?limit=20`, { headers: hdrs })).json();
  const orders = await (await fetch(`${BASE}/v1/oms/real/orders`, { headers: hdrs })).json();
  const allocs = await (await fetch(`${BASE}/v1/oms/real/pamm/allocations?role=master&limit=20`, { headers: hdrs })).json();
  const funds = await (await fetch(`${BASE}/v1/oms/real/funds`, { headers: hdrs })).json();

  console.log('=== LIVE SERVER PROOF (REAL HEDGING INSTANCE) ===');
  console.log('1. Master Funds:', JSON.stringify(funds.funds));
  console.log('2. Closed Trade History (/v1/oms/real/history):', hist.count, 'trades');
  for (const h of hist.history || []) {
    console.log(`   history_id=${h.history_id} | order_id=${h.order_id} | ${h.symbol} ${h.side} ${h.qty} | entry=${h.entry_price} -> exit=${h.exit_price} | pnl=${h.realized_pnl} | at=${h.executed_at}`);
  }
  console.log('3. Orders Log (/v1/oms/real/orders):', orders.count, 'orders');
  for (const o of (orders.orders || []).slice(0, 15)) {
    console.log(`   order_id=${o.order_id} | ${o.symbol} ${o.side} ${o.type} qty=${o.requested_qty} | state=${o.state} | fill=${o.avg_fill_price} | price=${o.price} | at=${o.created_at}`);
  }
  console.log('4. PAMM Allocations (/v1/oms/real/pamm/allocations?role=master):', allocs.count, 'rows');
  for (const a of (allocs.allocations || []).slice(0, 10)) {
    console.log(`   alloc_id=${a.alloc_id} | trade_id=${a.trade_id} | ${a.follower_name} (${a.pamm_id}) | order_pnl=${a.order_pnl} | pct=${a.percentage}% | shared_pnl=${a.shared_pnl} | running=${a.running_pnl}`);
  }

  // 2. Capture LIVE UI Screenshots on BOTH Client Terminal (Real Hedging -> History & Orders) AND Admin (PEOPLE -> Trades)
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: true, executablePath: findCachedChromium() });

  // --- Client WebTrader Screenshot (switch Trades panel from Paper -> Real Hedging -> History) ---
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
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

  // Click the Trades panel gear/account switcher OR click "Paper (Hedging)" inside Trades panel to switch to Real (Hedging)
  // First let's inspect how the Trades panel switches accounts (look for gear icon or Paper (Hedging) button/select)
  const switched = await frame.evaluate(() => {
    const sels = Array.from(document.querySelectorAll('select'));
    let changed = 0;
    for (const s of sels) {
      const realOpt = Array.from(s.options).find((o) => o.value === 'real');
      if (realOpt && s.value !== 'real') {
        s.value = 'real';
        s.dispatchEvent(new Event('change', { bubbles: true }));
        changed++;
      }
    }
    return changed;
  });
  console.log('Switched select dropdowns to real:', switched);

  // Also check if Trades panel has a settings/account button next to "Paper (Hedging)"
  const tradesPaperBtn = frame.locator('text="Paper (Hedging)"').first();
  if ((await tradesPaperBtn.count()) > 0) {
    // Check gear icon next to Paper (Hedging) in Trades panel
    const gearBtn = frame.locator('button[title*="account" i], button[title*="Account" i], button[title*="Settings" i]').first();
    if ((await gearBtn.count()) > 0) {
      await gearBtn.click().catch(() => {});
      await page.waitForTimeout(600);
      const realChoice = frame.locator('button:has-text("Real (Hedging)"), div:has-text("Real (Hedging)")').first();
      if ((await realChoice.count()) > 0) {
        await realChoice.click().catch(() => {});
        await page.waitForTimeout(1000);
      }
    }
  }

  // Click "History" tab inside Trades panel
  const histTab = frame.locator('button:text-is("History")').first();
  if ((await histTab.count()) > 0) {
    await histTab.click();
    await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: path.join(__dirname, 'screenshots', 'proof_client_real_history.png') });

  // Also click "Orders" tab inside Trades panel
  const ordTab = frame.locator('button:text-is("Orders")').first();
  if ((await ordTab.count()) > 0) {
    await ordTab.click();
    await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: path.join(__dirname, 'screenshots', 'proof_client_real_orders.png') });
  await ctx.close();

  // --- Admin Portal Screenshot (PEOPLE -> Trades on Real Hedging) ---
  const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const aPage = await adminCtx.newPage();
  await aPage.goto(process.env.ADMIN_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await aPage.locator('#email').fill(process.env.ADMIN_EMAIL);
  await aPage.locator('#password').fill(process.env.ADMIN_PASSWORD);
  await aPage.locator('button[type="submit"]').click();
  await aPage.waitForLoadState('networkidle');
  await aPage.waitForTimeout(2000);

  await aPage.locator('button:has-text("PEOPLE")').first().click();
  await aPage.waitForTimeout(400);
  await aPage.locator('button:has-text("Trades"), a:has-text("Trades")').first().click();
  await aPage.waitForTimeout(2000);

  // Switch Trades view in Admin to "Real (Hedging)" if there's an instance selector
  const adminSel = aPage.locator('select').first();
  if ((await adminSel.count()) > 0) {
    const opts = await adminSel.evaluate((s) => Array.from(s.options).map((o) => ({ v: o.value, t: o.text })));
    console.log('Admin Trades select options:', opts);
    const realOpt = opts.find((o) => o.v === 'real' || /real.*hedg/i.test(o.t));
    if (realOpt) {
      await adminSel.selectOption(realOpt.v).catch(() => {});
      await aPage.waitForTimeout(2000);
    }
  }
  await aPage.screenshot({ path: path.join(__dirname, 'screenshots', 'proof_admin_real_trades.png'), fullPage: true });
  await adminCtx.close();

  await browser.close();
  console.log('\nSaved live proof screenshots: proof_client_real_history.png, proof_client_real_orders.png, proof_admin_real_trades.png');
}

main().catch((e) => { console.error(e); process.exit(1); });
