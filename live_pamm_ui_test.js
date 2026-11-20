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

async function loginAndOpenDashboard(browser, email, password) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  const networkLog = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('response', async (res) => {
    const u = res.url();
    if (u.includes('/pamm') || res.status() >= 400) {
      let preview = '';
      try { preview = (await res.text()).slice(0, 260); } catch {}
      networkLog.push({ method: res.request().method(), status: res.status(), url: u, preview });
    }
  });

  await page.goto(creds.client_login_url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {}),
    page.locator('#login-submit, button[type="submit"]').first().click(),
  ]);
  await page.waitForTimeout(800);

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(4500);

  const workFrame = page.frames().find((f) => f.url().includes('chartv2') || f.url().includes('iframeMode')) || page.mainFrame();
  return { context, page, workFrame, consoleErrors, networkLog };
}

async function openPammWidget(page, frame) {
  // Check if PAMM widget is already mounted in persisted workspace
  if ((await frame.locator('button:has-text("PAMM managers")').count()) > 0) {
    return true;
  }
  const gridBtn = frame.locator('button.tw-grid[title="Add widget"], button.tw-grid').first();
  await gridBtn.click({ timeout: 10000 });
  await page.waitForTimeout(600);
  const pammBtn = frame.locator('button:has-text("PAMM"), [role="menuitem"]:has-text("PAMM"), div:text-is("PAMM")').last();
  if ((await pammBtn.count()) > 0) {
    await pammBtn.click({ timeout: 10000 });
    await page.waitForTimeout(2500);
    return true;
  }
  return false;
}

async function main() {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: true, executablePath: findCachedChromium() });
  const results = [];

  function record(tc_id, title, status, details) {
    results.push({ tc_id, title, status, details });
    const icon = status === 'PASS' ? '✅' : status === 'DEFECT' ? '🔴' : status === 'FAIL' ? '❌' : 'ℹ️';
    console.log(`${icon} [${status}] ${tc_id} - ${title}: ${typeof details === 'string' ? details : JSON.stringify(details).slice(0, 280)}`);
  }

  try {
    // 1. MASTER UI FLOW (pmmaster@mailinator.com)
    console.log('\n=== LIVE UI TESTS AS MASTER (pmmaster@mailinator.com) ===');
    const masterSession = await loginAndOpenDashboard(browser, creds.master.email, creds.master.password);
    const { page: mPage, workFrame: mFrame, consoleErrors: mConsole, networkLog: mNet } = masterSession;

    const mounted = await openPammWidget(mPage, mFrame);

    // Inspect PAMM managers directory (cards or rows)
    const dirInfo = await mFrame.evaluate(() => {
      const txt = document.body.innerText || '';
      const pammIdx = txt.indexOf('PAMM managers');
      const pammText = pammIdx >= 0 ? txt.slice(pammIdx, pammIdx + 3500) : '';
      const joinBtns = Array.from(document.querySelectorAll('button'))
        .filter((b) => /\binvest\b|\bjoin\b/i.test(b.innerText))
        .map((b) => ({ text: b.innerText.trim(), disabled: b.disabled, title: b.title || '' }));
      const tabTitles = Array.from(document.querySelectorAll('.tw-tab')).map((t) => t.innerText.trim());
      return {
        tabTitles,
        hasPammManagers: txt.includes('PAMM managers'),
        hasMySub: txt.includes('My subscription'),
        hasPmMasterCard: pammText.includes('PM Master'),
        hasMasterBlockedBanner: pammText.includes("Master accounts can't follow another master"),
        joinBtns: joinBtns.slice(0, 6),
      };
    });

    record('BTPAMM-F001', 'Open PAMM Window & Mount Dock Widget (Live UI)',
      (mounted && dirInfo.tabTitles.includes('PAMM') && dirInfo.hasPammManagers) ? 'PASS' : 'FAIL',
      { mounted, tabTitles: dirInfo.tabTitles });

    record('BTPAMM-F012-UI', 'PM Master Visible in PAMM Managers Leaderboard (Live UI)',
      dirInfo.hasPmMasterCard ? 'PASS' : 'FAIL',
      { hasPmMasterCard: dirInfo.hasPmMasterCard });

    record('BTPAMM-F007-UI', 'Role Exclusivity: Master Invest/Join Disabled in UI (pmmaster)',
      (dirInfo.hasMasterBlockedBanner && dirInfo.joinBtns.length > 0 && dirInfo.joinBtns.every((b) => b.disabled)) ? 'PASS' : 'FAIL',
      { hasMasterBlockedBanner: dirInfo.hasMasterBlockedBanner, sampleBtn: dirInfo.joinBtns[0] });

    // Switch to My subscription tab
    await mFrame.locator('button:has-text("My subscription")').first().click();
    await mPage.waitForTimeout(2000);

    // Click Settings inside MANAGING A POOL to inspect share form & footnote (BTPAMM-F004 & BUG-UI-007)
    const settingsBtn = mFrame.locator('button:text-is("Settings")').first();
    let settingsOpened = false;
    if ((await settingsBtn.count()) > 0) {
      await settingsBtn.click();
      await mPage.waitForTimeout(1000);
      settingsOpened = true;
      await mPage.screenshot({ path: path.join(__dirname, 'screenshots', 'ui_master_pamm_settings.png') });
    }

    const subDom = await mFrame.evaluate(() => {
      const txt = document.body.innerText || '';
      const subIdx = txt.indexOf('My subscription');
      const subTxt = subIdx >= 0 ? txt.slice(subIdx, subIdx + 2000) : '';
      return {
        hasManagingPool: /MANAGING A POOL/i.test(subTxt),
        hasPmMaster: subTxt.includes('PM Master'),
        hasInvestorsTable: /INVESTORS/i.test(subTxt) && subTxt.includes('PM Follower'),
        hasShareFootnote: /Changing your share affects followers who join after/i.test(subTxt),
        hasSaveBtn: /Save|Update/i.test(subTxt),
        subExcerpt: subTxt.slice(0, 900),
      };
    });

    record('BTPAMM-F002', 'Navigate PAMM managers <-> My subscription (Live UI)',
      (subDom.hasManagingPool && subDom.hasPmMaster && subDom.hasInvestorsTable) ? 'PASS' : 'FAIL',
      { hasManagingPool: subDom.hasManagingPool, hasPmMaster: subDom.hasPmMaster, hasInvestorsTable: subDom.hasInvestorsTable });

    record('BTPAMM-F004', 'Granular Share Adjustment Notice in Settings Drawer (Live UI)',
      subDom.hasShareFootnote ? 'PASS' : 'FAIL',
      { settingsOpened, hasShareFootnote: subDom.hasShareFootnote, excerpt: subDom.subExcerpt.slice(0, 450) });

    record('DEFECT-UI-007', 'PAMM Managing Settings Drawer Renders Properly (Re-verify BUG-UI-007)',
      (settingsOpened && subDom.hasSaveBtn) ? 'PASS' : 'DEFECT',
      { settingsOpened, hasSaveBtn: subDom.hasSaveBtn });

    // BTPAMM-F015: Maximize & restore via DOM click on PAMM panel maximize button
    const toggledMax = await mFrame.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('.tw-tab'));
      const pammTab = tabs.find((t) => t.innerText.includes('PAMM'));
      const panel = pammTab?.closest('.tw-panel, .tw-pane, [class*="tw-p"]');
      const maxBtn = panel?.querySelector('.tw-ph-max') || document.querySelectorAll('.tw-ph-max')[document.querySelectorAll('.tw-ph-max').length - 1];
      if (!maxBtn) return false;
      maxBtn.click();
      maxBtn.click();
      return true;
    });
    record('BTPAMM-F015', 'PAMM Dock Tab Maximize & Restore Controls (Live UI)', toggledMax ? 'PASS' : 'FAIL', { toggledMax });

    const cspBugs = mConsole.filter((e) => e.includes('Content Security Policy'));
    const pammNetCalls = mNet.filter((n) => n.url.includes('/pamm'));
    const err401s = mNet.filter((n) => n.status === 401);
    record('DEFECT-CSP', 'Cloudflare CSP Console Violation (BUG-SEC-003)', cspBugs.length === 0 ? 'PASS' : 'DEFECT', { count: cspBugs.length, sample: (cspBugs[0] || '').slice(0, 180) });
    record('DEFECT-401', 'Premature 401 Errors During Dashboard Load (BUG-AUTH-002)', err401s.length === 0 ? 'PASS' : 'DEFECT', { count: err401s.length, urls: err401s.map((x) => x.url) });
    console.log('   Master UI PAMM Network Calls:', pammNetCalls.map((n) => `${n.status} ${n.method} ${n.url}`));

    await masterSession.context.close();

    // 2. FOLLOWER UI FLOW (pmf1@mailinator.com)
    console.log('\n=== LIVE UI TESTS AS FOLLOWER (pmf1@mailinator.com) ===');
    const f1 = creds.followers[0];
    const fSession = await loginAndOpenDashboard(browser, f1.email, f1.password);
    const { page: fPage, workFrame: fFrame, networkLog: fNet } = fSession;

    await openPammWidget(fPage, fFrame);
    await fFrame.locator('button:has-text("My subscription")').first().click();
    await fPage.waitForTimeout(2500);
    await fPage.screenshot({ path: path.join(__dirname, 'screenshots', 'ui_pmf1_my_subscription.png') });

    const fDom = await fFrame.evaluate(() => {
      const txt = document.body.innerText || '';
      const subIdx = txt.indexOf('My subscription');
      const subTxt = subIdx >= 0 ? txt.slice(subIdx, subIdx + 2000) : txt.slice(-1500);
      const becomeBtn = Array.from(document.querySelectorAll('button')).find((b) => /become a manager/i.test(b.innerText));
      return {
        showsPmMaster: subTxt.includes('PM Master'),
        showsDeposit100: subTxt.includes('100'),
        showsBlockedText: /follow.*can't become a master|cannot become a master/i.test(subTxt),
        becomeBtnDisabled: becomeBtn ? becomeBtn.disabled : null,
        excerpt: subTxt.slice(0, 700),
      };
    });

    record('BTPAMM-F008-UI', 'Follower My Subscription View & Role Exclusivity in UI (pmf1)',
      (fDom.showsPmMaster && (fDom.showsBlockedText || fDom.becomeBtnDisabled === true)) ? 'PASS' : 'FAIL',
      { showsPmMaster: fDom.showsPmMaster, showsDeposit100: fDom.showsDeposit100, showsBlockedText: fDom.showsBlockedText, becomeBtnDisabled: fDom.becomeBtnDisabled, excerpt: fDom.excerpt.slice(0, 400) });

    console.log('   Follower UI PAMM Network Calls:', fNet.filter((n) => n.url.includes('/pamm')).map((n) => `${n.status} ${n.method} ${n.url}`));
    await fSession.context.close();
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(__dirname, 'live_ui_test_results.json'), JSON.stringify(results, null, 2));
  console.log('\nSaved live_ui_test_results.json');
}

main().catch((e) => { console.error(e); process.exit(1); });
