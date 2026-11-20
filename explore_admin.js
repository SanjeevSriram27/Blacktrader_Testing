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
    if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
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
      if (fs.existsSync(candidate)) return require(candidate);
    }
  }
  throw new Error('Could not locate playwright module.');
}

function findCachedChromium() {
  const cacheDir = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  if (!fs.existsSync(cacheDir)) return null;
  for (const entry of fs.readdirSync(cacheDir).filter((d) => d.startsWith('chromium-'))) {
    const c = path.join(cacheDir, entry, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
    if (fs.existsSync(c)) return c;
  }
  return null;
}

loadEnv(path.resolve(__dirname, '.env'));
const { chromium } = loadPlaywright();

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: findCachedChromium() || undefined });
  const statePath = path.join(__dirname, 'auth_state', 'admin.json');
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    storageState: fs.existsSync(statePath) ? statePath : undefined,
  });
  const page = await context.newPage();

  const discoveredEndpoints = new Set();
  page.on('response', (res) => {
    const u = res.url();
    if (u.includes('/api/') || u.includes('/v1/')) {
      discoveredEndpoints.add(`${res.request().method()} ${res.status()} ${u}`);
    }
  });

  await page.goto(process.env.ADMIN_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  // Check if logged in
  const token = await page.evaluate(() => localStorage.getItem('oms_admin_token'));
  if (!token) {
    console.log('Re-authenticating...');
    await page.locator('#email').fill(process.env.ADMIN_EMAIL);
    await page.locator('#password').fill(process.env.ADMIN_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await context.storageState({ path: statePath });
  }

  // Expand all sidebar accordions and list navigation items
  const sidebarGroups = ['CHART', 'OMS', 'MONEY', 'PEOPLE', 'INSTALL'];
  const navTree = {};
  for (const grp of sidebarGroups) {
    const btn = page.locator(`aside button:has-text("${grp}"), nav button:has-text("${grp}"), button:has-text("${grp}")`).first();
    if ((await btn.count()) > 0) {
      await btn.click();
      await page.waitForTimeout(300);
    }
  }

  const sidebarDump = await page.evaluate(() => {
    const aside = document.querySelector('aside, nav');
    if (!aside) return document.body.innerText.slice(0, 1500);
    return aside.innerText;
  });
  console.log('=== SIDEBAR TREE ===\n' + sidebarDump);

  // Fetch key admin APIs using the admin bearer token directly from browser context
  const apiResults = await page.evaluate(async () => {
    const tok = localStorage.getItem('oms_admin_token');
    const headers = { Authorization: `Bearer ${tok}` };
    const fetchJson = async (url) => {
      try {
        const r = await fetch(url, { headers });
        return { status: r.status, data: await r.json().catch(() => null) };
      } catch (e) {
        return { error: String(e) };
      }
    };

    const me = await fetchJson('/admin/api/me');
    const instances = await fetchJson('/admin/api/instances');
    const groups = await fetchJson('/admin/api/groups');
    const modules = await fetchJson('/admin/api/modules');
    const membersRes = await fetchJson('/admin/api/members');

    const members = (membersRes.data && membersRes.data.members) || [];
    const existingPm = members.filter((m) =>
      (m.email || '').toLowerCase().startsWith('pmmaster') ||
      (m.email || '').toLowerCase().startsWith('pmf')
    );
    const sampleMembers = members.slice(0, 8);

    return {
      me: me.data,
      instances: instances.data,
      groups: groups.data,
      allowedModules: modules.data && modules.data.allowed,
      totalMembers: members.length,
      existingPm,
      sampleMembers,
    };
  });

  console.log('\n=== API SUMMARY ===');
  console.log(JSON.stringify(apiResults, null, 2));

  // Extract all /admin/api/ and /v1/ endpoint strings from the loaded Next.js index bundle!
  const bundleEndpoints = await page.evaluate(async () => {
    const scripts = Array.from(document.querySelectorAll('script[src]')).map((s) => s.src);
    const found = new Set();
    for (const src of scripts) {
      if (!src.includes('index-') && !src.includes('_app-')) continue;
      try {
        const txt = await (await fetch(src)).text();
        const matches = txt.match(/['"`](\/admin\/api\/[a-zA-Z0-9_\-\/${}?=&]+|\/v1\/[a-zA-Z0-9_\-\/${}?=&]+|\/home\/api\/[a-zA-Z0-9_\-\/${}?=&]+)['"`]/g) || [];
        for (const m of matches) found.add(m.slice(1, -1));
        // Also find pamm occurrences with surrounding context
        const pammCtx = [];
        let idx = 0;
        while ((idx = txt.toLowerCase().indexOf('pamm', idx)) !== -1) {
          pammCtx.push(txt.slice(Math.max(0, idx - 60), Math.min(txt.length, idx + 120)));
          idx += 4;
          if (pammCtx.length > 25) break;
        }
        return { endpoints: [...found].sort(), pammCtx };
      } catch {}
    }
    return { endpoints: [...found].sort(), pammCtx: [] };
  });

  console.log('\n=== DISCOVERED BUNDLE ENDPOINTS ===');
  console.log(JSON.stringify(bundleEndpoints.endpoints, null, 2));
  console.log('\n=== PAMM REFERENCES IN ADMIN BUNDLE ===');
  console.log(JSON.stringify(bundleEndpoints.pammCtx, null, 2));

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
