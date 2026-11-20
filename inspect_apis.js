const fs = require('fs');
const path = require('path');
const os = require('os');

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return;
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

  const info = await page.evaluate(async () => {
    const adminJs = await (await fetch('https://lpadmin.blackfx.com/blackadmin/_next/static/chunks/pages/index-eee95c4c07f81d3b.js')).text();
    const clientJs = await (await fetch('https://lpadmin.blackfx.com/assets/app.js')).text();

    const extractAround = (txt, needle, before = 120, after = 380, max = 6) => {
      const res = [];
      let idx = 0;
      while ((idx = txt.indexOf(needle, idx)) !== -1 && res.length < max) {
        res.push(txt.slice(Math.max(0, idx - before), Math.min(txt.length, idx + after)));
        idx += needle.length;
      }
      return res;
    };

    return {
      createMember: extractAround(adminJs, '"/api/members"', 100, 450, 5),
      setBalance: extractAround(adminJs, '"/balance"', 150, 450, 5),
      chartLink: extractAround(adminJs, 'chart-token', 100, 400, 5),
      chartLink2: extractAround(adminJs, 'chartLink', 100, 400, 5),
      clientLogin: extractAround(clientJs, 'login', 100, 350, 6),
      clientPamm: extractAround(clientJs, 'pamm', 100, 350, 6),
      clientEndpoints: [...new Set((clientJs.match(/['"`](\/[a-zA-Z0-9_\-\/]+)['"`]/g) || []).filter((s) => s.includes('api') || s.includes('oms') || s.includes('pamm') || s.includes('home')))].sort(),
    };
  });

  console.log(JSON.stringify(info, null, 2));
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
