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

  await page.goto(process.env.ADMIN_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);

  // Inspect ALL loaded JS scripts in blackadmin for API paths!
  const jsInfo = await page.evaluate(async () => {
    const scripts = Array.from(document.querySelectorAll('script[src]')).map((s) => s.src);
    const endpoints = new Set();
    const snippets = [];
    for (const src of scripts) {
      try {
        const txt = await (await fetch(src)).text();
        const matches = txt.match(/['"`](\/[a-zA-Z0-9_\-]+\/api\/[a-zA-Z0-9_\-\/${}?=&]+|\/api\/[a-zA-Z0-9_\-\/${}?=&]+|\/v1\/[a-zA-Z0-9_\-\/${}?=&]+)['"`]/g) || [];
        for (const m of matches) endpoints.add(m.slice(1, -1));
        for (const kw of ['members', 'deposit', 'balance', 'credit', 'pamm', 'chart-token', 'impersonate', 'fund']) {
          let idx = 0;
          let count = 0;
          while ((idx = txt.indexOf(`/members`, idx)) !== -1 && count < 10 && kw === 'members') {
            snippets.push(txt.slice(Math.max(0, idx - 80), Math.min(txt.length, idx + 200)));
            idx += 8;
            count++;
          }
        }
      } catch {}
    }
    return { scripts, endpoints: [...endpoints].sort(), memberSnippets: snippets };
  });

  console.log('=== SCRIPTS ===', jsInfo.scripts);
  console.log('=== ENDPOINTS ===\n' + JSON.stringify(jsInfo.endpoints, null, 2));
  console.log('=== /members SNIPPETS ===\n' + jsInfo.memberSnippets.join('\n---\n'));

  // Navigate to PEOPLE -> Members
  await page.locator('button:has-text("PEOPLE")').first().click();
  await page.waitForTimeout(300);
  await page.locator('button:has-text("Members"), a:has-text("Members")').first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(__dirname, 'screenshots', 'admin_members.png'), fullPage: true });

  const membersUi = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button')).map((b) => b.innerText.trim()).filter(Boolean);
    return { buttons: [...new Set(buttons)].slice(0, 40), text: document.body.innerText.slice(0, 1200) };
  });
  console.log('\n=== MEMBERS UI ===\n', JSON.stringify(membersUi, null, 2));

  // Click Add member button if present
  const addBtn = page.locator('button:has-text("Add"), button:has-text("New"), button:has-text("Create")').first();
  if ((await addBtn.count()) > 0) {
    console.log('Clicking add member button:', await addBtn.innerText());
    await addBtn.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(__dirname, 'screenshots', 'admin_add_member.png'), fullPage: true });
    const modalInfo = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, select, textarea')).map((el) => ({
        tag: el.tagName,
        type: el.type,
        name: el.name,
        id: el.id,
        placeholder: el.placeholder,
        options: el.tagName === 'SELECT' ? Array.from(el.options).map((o) => ({ value: o.value, text: o.text })) : undefined,
      }));
      return { inputs, text: document.body.innerText.slice(-1500) };
    });
    console.log('\n=== ADD MEMBER FORM ===\n', JSON.stringify(modalInfo, null, 2));
  }

  // Also check Site 2 login page
  const page2 = await context.newPage();
  await page2.goto(process.env.CLIENT_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page2.waitForTimeout(1000);
  const clientLoginInfo = await page2.evaluate(async () => {
    const inputs = Array.from(document.querySelectorAll('input')).map((el) => ({
      type: el.type,
      name: el.name,
      id: el.id,
      placeholder: el.placeholder,
    }));
    const buttons = Array.from(document.querySelectorAll('button')).map((b) => b.innerText.trim()).filter(Boolean);
    const scripts = Array.from(document.querySelectorAll('script[src]')).map((s) => s.src);
    return { url: location.href, title: document.title, inputs, buttons, scripts, text: document.body.innerText.slice(0, 800) };
  });
  console.log('\n=== SITE 2 LOGIN INFO ===\n', JSON.stringify(clientLoginInfo, null, 2));

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
