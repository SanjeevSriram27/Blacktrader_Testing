const fs = require('fs');
const path = require('path');
const os = require('os');

const creds = JSON.parse(fs.readFileSync(path.join(__dirname, 'pamm_credentials.json'), 'utf8'));
for (const rawLine of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#') || !line.includes('=')) continue;
  const idx = line.indexOf('=');
  const k = line.slice(0, idx).trim();
  let v = line.slice(idx + 1).trim();
  if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) v = v.slice(1, -1);
  if (!(k in process.env)) process.env[k] = v;
}

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

  await page.goto(process.env.ADMIN_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('#email').fill(process.env.ADMIN_EMAIL);
  await page.locator('#password').fill(process.env.ADMIN_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  await page.locator('button:has-text("PEOPLE")').first().click();
  await page.waitForTimeout(300);
  await page.locator('button:has-text("Trades"), a:has-text("Trades")').first().click();
  await page.waitForTimeout(1500);

  // Select pmmaster@mailinator.com in the Member dropdown!
  await page.locator('select').first().selectOption(creds.master.member_id);
  await page.waitForTimeout(2500);

  const tableText = await page.evaluate(() => document.body.innerText);
  console.log('Admin PEOPLE -> Trades (pmmaster@mailinator.com):\n', tableText.slice(tableText.indexOf('Trades')));

  await page.screenshot({ path: path.join(__dirname, 'screenshots', 'proof_admin_pmmaster_trades.png'), fullPage: true });
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
