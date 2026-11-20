const fs = require('fs');
const path = require('path');
const os = require('os');

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

loadEnv(path.resolve(__dirname, '.env'));
const { chromium } = loadPlaywright();

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: findCachedChromium() });
  const context = await browser.newContext({ storageState: path.join(__dirname, 'auth_state', 'admin.json') });
  const page = await context.newPage();
  await page.goto(process.env.ADMIN_URL, { waitUntil: 'networkidle' });

  const res = await page.evaluate(async () => {
    const adminJs = await (await fetch('https://lpadmin.blackfx.com/blackadmin/_next/static/chunks/pages/index-eee95c4c07f81d3b.js')).text();
    const idx = adminJs.indexOf('Creates an ');
    const addModalSnippet = adminJs.slice(Math.max(0, idx - 600), Math.min(adminJs.length, idx + 2200));

    // Also inspect how t6 / eJ is initialized
    const idxT6 = adminJs.indexOf('paper_engine');
    const engineSnippet = idxT6 >= 0 ? adminJs.slice(Math.max(0, idxT6 - 300), Math.min(adminJs.length, idxT6 + 800)) : '';

    return { addModalSnippet, engineSnippet };
  });

  console.log('=== ADD MODAL ===\n', res.addModalSnippet);
  console.log('\n=== ENGINE SNIPPET ===\n', res.engineSnippet);
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
