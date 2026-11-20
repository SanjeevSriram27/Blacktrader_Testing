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

async function main() {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: true, executablePath: findCachedChromium() });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const orderReqs = [];
  page.on('request', (r) => {
    if (r.url().includes('/orders') || r.url().includes('/positions')) {
      orderReqs.push(`${r.method()} ${r.url()}`);
    }
  });

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

  for (let i = 0; i < page.frames().length; i++) {
    const f = page.frames()[i];
    const info = await f.evaluate(() => {
      const els = Array.from(document.querySelectorAll('*')).filter((el) => {
        const r = el.getBoundingClientRect();
        // Top-left of chart where S | 0.001 | B sits: x ~ 300..500, y ~ 120..190
        return r.left > 280 && r.left < 500 && r.top > 110 && r.top < 200 && r.width > 10 && r.width < 120 && r.height > 10 && r.height < 60;
      }).map((el) => {
        const r = el.getBoundingClientRect();
        return { tag: el.tagName, cls: String(el.className).slice(0, 60), text: (el.innerText || el.value || '').trim().slice(0, 30), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
      });
      return els;
    }).catch(() => []);
    if (info.length > 0) {
      console.log(`Frame[${i}] (${f.url().slice(0, 80)}):`, JSON.stringify(info, null, 2));
    }
  }

  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
