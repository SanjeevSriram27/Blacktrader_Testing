const fs = require('fs');
const path = require('path');
const os = require('os');

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if (
      (val.startsWith("'") && val.endsWith("'")) ||
      (val.startsWith('"') && val.endsWith('"'))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
}

function loadPlaywright() {
  try {
    return require('playwright');
  } catch {}
  const npxDir = path.join(os.homedir(), '.npm', '_npx');
  if (fs.existsSync(npxDir)) {
    for (const entry of fs.readdirSync(npxDir)) {
      const candidate = path.join(npxDir, entry, 'node_modules', 'playwright');
      if (fs.existsSync(candidate)) {
        return require(candidate);
      }
    }
  }
  throw new Error('Could not locate playwright module.');
}

function findCachedChromium() {
  const cacheDir = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  if (!fs.existsSync(cacheDir)) return null;
  const entries = fs.readdirSync(cacheDir).filter((d) => d.startsWith('chromium-'));
  for (const entry of entries) {
    const candidates = [
      path.join(
        cacheDir,
        entry,
        'chrome-mac-arm64',
        'Google Chrome for Testing.app',
        'Contents',
        'MacOS',
        'Google Chrome for Testing'
      ),
      path.join(
        cacheDir,
        entry,
        'chrome-mac',
        'Chromium.app',
        'Contents',
        'MacOS',
        'Chromium'
      ),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
  }
  return null;
}

loadEnv(path.resolve(__dirname, '.env'));
const { chromium } = loadPlaywright();

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (err) {
    const cached = findCachedChromium();
    if (cached) {
      console.log(`Using cached Chromium binary: ${cached}`);
      return await chromium.launch({ headless: true, executablePath: cached });
    }
    throw err;
  }
}

async function main() {
  const url = process.env.ADMIN_URL;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!url || !email || !password) {
    console.error('Missing ADMIN_URL, ADMIN_EMAIL, or ADMIN_PASSWORD in .env');
    process.exit(1);
  }

  console.log(`Target URL: ${url}`);
  console.log(`Email: ${email}`);
  console.log(`Password length: ${password.length}`);

  fs.mkdirSync(path.join(__dirname, 'screenshots'), { recursive: true });
  fs.mkdirSync(path.join(__dirname, 'auth_state'), { recursive: true });

  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const apiCalls = [];
  page.on('response', async (res) => {
    const reqUrl = res.url();
    const ct = res.headers()['content-type'] || '';
    if (
      ct.includes('application/json') ||
      reqUrl.includes('/api/') ||
      reqUrl.includes('/v1/') ||
      reqUrl.includes('login') ||
      reqUrl.includes('auth') ||
      reqUrl.includes('blackadmin')
    ) {
      let bodyPreview = '';
      if (ct.includes('application/json')) {
        try {
          const text = await res.text();
          bodyPreview = text.slice(0, 400);
        } catch {}
      }
      apiCalls.push({
        method: res.request().method(),
        status: res.status(),
        url: reqUrl,
        contentType: ct,
        bodyPreview,
      });
    }
  });

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  console.log('Navigating to admin portal...');
  const navRes = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  console.log(`Initial HTTP status: ${navRes ? navRes.status() : 'unknown'}`);
  console.log(`Loaded URL: ${page.url()}`);
  console.log(`Page Title: ${await page.title()}`);

  await page.screenshot({ path: path.join(__dirname, 'screenshots', 'admin_login.png'), fullPage: true });

  const formInfo = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input')).map((el) => ({
      type: el.type,
      name: el.name,
      id: el.id,
      placeholder: el.placeholder,
      autocomplete: el.autocomplete,
      visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
    }));
    const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]')).map((el) => ({
      tag: el.tagName,
      type: el.type,
      text: (el.innerText || el.value || '').trim(),
      visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
    }));
    const textPreview = (document.body.innerText || '').trim().slice(0, 500);
    return { inputs, buttons, textPreview };
  });

  console.log('Login page form info:', JSON.stringify(formInfo, null, 2));

  const emailSelector =
    'input[type="email"], input[name*="email" i], input[name*="user" i], input[id*="email" i], input[placeholder*="email" i], input[type="text"]';
  const passwordSelector = 'input[type="password"]';

  const emailInput = page.locator(emailSelector).first();
  const passwordInput = page.locator(passwordSelector).first();

  if ((await emailInput.count()) === 0 || (await passwordInput.count()) === 0) {
    console.error('Could not locate email or password input fields.');
    await browser.close();
    process.exit(2);
  }

  await emailInput.fill(email);
  await passwordInput.fill(password);

  const submitBtn = page
    .locator('button[type="submit"], input[type="submit"], button:has-text("Sign in"), button:has-text("Login"), button:has-text("Log in")')
    .first();

  console.log('Submitting credentials...');
  if ((await submitBtn.count()) > 0) {
    await Promise.all([
      page.waitForLoadState('networkidle').catch(() => {}),
      submitBtn.click(),
    ]);
  } else {
    await passwordInput.press('Enter');
    await page.waitForLoadState('networkidle').catch(() => {});
  }

  await page.waitForTimeout(4000);

  const postUrl = page.url();
  const postTitle = await page.title();
  console.log(`Post-login URL: ${postUrl}`);
  console.log(`Post-login Title: ${postTitle}`);

  await page.screenshot({ path: path.join(__dirname, 'screenshots', 'admin_after_login.png'), fullPage: true });

  const postState = await page.evaluate(() => {
    const bodyText = (document.body.innerText || '').trim().slice(0, 1200);
    const localStorageKeys = Object.keys(window.localStorage || {});
    const sessionStorageKeys = Object.keys(window.sessionStorage || {});
    const hasPasswordField = document.querySelectorAll('input[type="password"]').length > 0;
    const navItems = Array.from(document.querySelectorAll('nav a, aside a, [role="navigation"] a, .sidebar a, button'))
      .map((el) => (el.innerText || '').trim())
      .filter((t) => t.length > 0 && t.length < 60);
    return {
      bodyText,
      localStorageKeys,
      sessionStorageKeys,
      hasPasswordField,
      navItems: [...new Set(navItems)].slice(0, 40),
    };
  });

  const cookies = await context.cookies();
  console.log('Cookies set:', cookies.map((c) => ({ name: c.name, domain: c.domain, path: c.path, httpOnly: c.httpOnly, secure: c.secure })));
  console.log('Post-login page state:', JSON.stringify(postState, null, 2));
  console.log('API/Auth responses observed:');
  for (const call of apiCalls) {
    const safePreview = call.bodyPreview
      .replace(/"(access_token|token|refresh_token|jwt)"\s*:\s*"[^"]+"/gi, '"$1":"[REDACTED]"');
    console.log(`  [${call.status}] ${call.method} ${call.url} ${safePreview ? '-> ' + safePreview : ''}`);
  }
  if (consoleErrors.length) {
    console.log('Console errors:', consoleErrors);
  }

  await context.storageState({ path: path.join(__dirname, 'auth_state', 'admin.json') });
  console.log('Saved browser storageState to auth_state/admin.json');

  await browser.close();
}

main().catch((err) => {
  console.error('Auth script failed:', err);
  process.exit(1);
});
