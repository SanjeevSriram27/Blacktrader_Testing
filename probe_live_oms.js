const fs = require('fs');
const path = require('path');
const os = require('os');

const creds = JSON.parse(fs.readFileSync(path.join(__dirname, 'pamm_credentials.json'), 'utf8'));
const BASE = creds.platform_base_url;

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

async function loginClientApi(email, password) {
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, remember: true }),
  });
  const setCookie = loginRes.headers.get('set-cookie') || '';
  const cookie = setCookie.split(';')[0];
  const loginBody = await loginRes.text();

  const ctRes = await fetch(`${BASE}/api/auth/chart-token`, {
    method: 'POST',
    headers: { Cookie: cookie },
  });
  const ctJson = await ctRes.json().catch(() => ({}));
  return { loginStatus: loginRes.status, loginBody: loginBody.slice(0, 200), cookie, chartTokenStatus: ctRes.status, token: ctJson.token };
}

async function getJson(url, token) {
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text: text.slice(0, 500) };
}

async function main() {
  console.log('1. Testing Site 2 Client Auth (/api/auth/login + /api/auth/chart-token) for pmmaster & pmf1...');
  const masterAuth = await loginClientApi(creds.master.email, creds.master.password);
  const f1Auth = await loginClientApi(creds.followers[0].email, creds.followers[0].password);
  console.log('   Master auth:', { loginStatus: masterAuth.loginStatus, chartTokenStatus: masterAuth.chartTokenStatus, hasToken: !!masterAuth.token });
  console.log('   F1 auth:', { loginStatus: f1Auth.loginStatus, chartTokenStatus: f1Auth.chartTokenStatus, hasToken: !!f1Auth.token });

  console.log('\n2. Probing live OMS & PAMM read endpoints...');
  const endpoints = [
    '/v1/oms/real/funds',
    '/v1/oms/real/positions',
    '/v1/oms/real/orders',
    '/v1/oms/real/history?limit=10',
    '/v1/oms/real/symbols',
    '/v1/oms/real/quotes',
    '/v1/oms/real/pamm/masters',
    '/v1/oms/real/pamm/follows',
    '/v1/oms/real/pamm/allocations?role=master&limit=10',
    '/v1/oms/real/pamm/shares?role=master',
    '/v1/oms/real/portal/methods',
    '/v1/oms/real/portal/summary',
  ];
  for (const ep of endpoints) {
    const r = await getJson(`${BASE}${ep}`, masterAuth.token);
    console.log(`   [MASTER ${r.status}] ${ep} -> ${r.text.slice(0, 220)}`);
  }

  console.log('\n3. Probing follower endpoints (pmf1)...');
  for (const ep of ['/v1/oms/real/funds', '/v1/oms/real/positions', '/v1/oms/real/pamm/follows', '/v1/oms/real/pamm/allocations', '/v1/oms/real/pamm/shares']) {
    const r = await getJson(`${BASE}${ep}`, f1Auth.token);
    console.log(`   [PMF1   ${r.status}] ${ep} -> ${r.text.slice(0, 220)}`);
  }

  console.log('\n4. Probing Site 2 Browser UI login as pmmaster@mailinator.com...');
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: true, executablePath: findCachedChromium() });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  const failed401s = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('response', (res) => { if (res.status() === 401) failed401s.push(`${res.request().method()} ${res.url()}`); });

  await page.goto(creds.client_login_url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('#login-email').fill(creds.master.email);
  await page.locator('#login-password').fill(creds.master.password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {}),
    page.locator('#login-submit, button[type="submit"]').first().click(),
  ]);
  await page.waitForTimeout(2500);
  console.log('   Post-login URL:', page.url(), '| Title:', await page.title());
  await page.screenshot({ path: path.join(__dirname, 'screenshots', 'client_master_account.png'), fullPage: true });

  const uiLinks = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a, button')).map((el) => ({
      tag: el.tagName,
      text: (el.innerText || '').trim().slice(0, 60),
      href: el.getAttribute('href') || '',
    })).filter((x) => x.text);
    const iframes = Array.from(document.querySelectorAll('iframe')).map((f) => f.src);
    return { links: links.slice(0, 30), iframes, textPreview: (document.body.innerText || '').slice(0, 700) };
  });
  console.log('   Client Account UI:', JSON.stringify(uiLinks, null, 2));
  console.log('   Console errors:', consoleErrors);
  console.log('   401 responses:', failed401s);

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
