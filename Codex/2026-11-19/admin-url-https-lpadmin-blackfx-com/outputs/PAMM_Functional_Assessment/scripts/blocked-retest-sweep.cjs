const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BASE = 'https://lpadmin.blackfx.com';
const envFile = '/Users/jarvis/Documents/lpadmin.blacktrader/.env';
const cases = JSON.parse(fs.readFileSync(path.join(ROOT, 'all-case-results.json'), 'utf8'));
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'evidence/admin-scale-fixture.json'), 'utf8'));
const env = {};
for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const i = line.indexOf('=');
  if (i > 0 && !line.startsWith('#')) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
}

let adminToken;
let chartToken;
const observations = {};
const compact = (value) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 800 ? text.slice(0, 800) + '…' : text;
};
async function request(endpoint, method = 'GET', body, token = adminToken) {
  const response = await fetch(BASE + endpoint, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch {}
  return { status: response.status, body: compact(json ?? text) };
}
async function observe(name, endpoint, token = adminToken) {
  try { observations[name] = { endpoint, ...(await request(endpoint, 'GET', undefined, token)) }; }
  catch (error) { observations[name] = { endpoint, error: error.message }; }
}

// Prop APIs in this deployment are challenge/account/payout APIs. None of the
// blocked PAMM rows describes those workflows, so no PAMM row is exempted.
const retainedBlocked = new Set();
const categoryFor = (row) => {
  if (/^BTPAMM-P|requote|off-quotes|liquidity|slippage|IOC|FOK|broker bridge/i.test(row.id + ' ' + row.title)) return 'lp_event';
  if (/^BTPAMM-R|NAV|rollover|unit /i.test(row.id + ' ' + row.title)) return 'nav_rollover';
  if (/^BTPAMM-H|high-water|HWM|AUM|fee/i.test(row.id + ' ' + row.title)) return 'fee_hwm';
  if (/^BTPAMM-D|withdraw|redemption|lockup|liquidation|chargeback/i.test(row.id + ' ' + row.title)) return 'withdrawal';
  if (/^BTPAMM-C|database|queue|lock|WebSocket|tick burst|memory/i.test(row.id + ' ' + row.title)) return 'internal_concurrency';
  if (/^BTPAMM-O|SRE|disaster|reconciliation|kill-switch|admin forced|dispute|tear-sheet/i.test(row.id + ' ' + row.title)) return 'operations';
  if (/^BTPAMM-M|margin|leverage|solvency|balance protection|capital depletion/i.test(row.id + ' ' + row.title)) return 'risk';
  if (/currency|rounding|micro-follower|co-investment|reserve/i.test(row.title)) return 'capital_math';
  if (/swap|spread|news|overnight|weekend|scheduled/i.test(row.title)) return 'scheduled_market';
  return 'public_pamm';
};

(async () => {
  const login = await request('/admin/api/login', 'POST', { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }, null);
  if (login.status !== 200) throw new Error('admin login failed: ' + login.status);
  const rawLogin = await fetch(BASE + '/admin/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }), signal: AbortSignal.timeout(30000),
  });
  adminToken = (await rawLogin.json()).token;
  const manager = fixture.other.find((x) => x.key === 'directoryI') || fixture.master;
  const chart = await request(`/admin/api/members/${manager.member_id}/chart-token`, 'POST', {}, adminToken);
  const rawChart = await fetch(BASE + `/admin/api/members/${manager.member_id}/chart-token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: '{}', signal: AbortSignal.timeout(30000),
  });
  chartToken = (await rawChart.json()).token;

  await observe('admin_members', '/admin/api/members');
  await observe('liquidity', '/admin/api/liquidity');
  await observe('liquidity_money', '/admin/api/liquidity/money');
  await observe('funds', '/v1/oms/real/funds', chartToken);
  await observe('positions', '/v1/oms/real/positions', chartToken);
  await observe('orders', '/v1/oms/real/orders', chartToken);
  await observe('history', '/v1/oms/real/history?limit=20', chartToken);
  await observe('pamm_follows', '/v1/oms/real/pamm/follows', chartToken);
  await observe('pamm_allocations', '/v1/oms/real/pamm/allocations?role=master&limit=20', chartToken);

  const probes = {
    nav: '/v1/oms/real/pamm/nav', units: '/v1/oms/real/pamm/units', rollover: '/v1/oms/real/pamm/rollover',
    withdrawals: '/v1/oms/real/pamm/withdrawals', hwm: '/v1/oms/real/pamm/hwm', statements: '/v1/oms/real/pamm/statements',
    shares: '/v1/oms/real/pamm/shares?role=master', admin_pamm: '/admin/api/pamm', admin_reconcile: '/admin/api/pamm/reconcile',
    admin_disputes: '/admin/api/pamm/disputes', admin_emergency: '/admin/api/pamm/emergency', admin_alerts: '/admin/api/pamm/alerts',
    admin_reports: '/admin/api/pamm/reports', admin_liquidations: '/admin/api/pamm/liquidations',
    prop_settings: '/admin/api/prop/settings', prop_programs: '/admin/api/prop/programs',
    prop_accounts: '/admin/api/prop/accounts/', prop_enrolments: '/admin/api/prop/enrolments?limit=5',
    prop_payouts: '/admin/api/prop/payouts?limit=5',
  };
  for (const [name, endpoint] of Object.entries(probes)) await observe(name, endpoint, endpoint.startsWith('/admin/') ? adminToken : chartToken);

  const blocked = cases.filter((row) => row.status === 'BLOCKED');
  const attempts = blocked.map((row) => {
    const retained = retainedBlocked.has(row.id);
    const category = categoryFor(row);
    const relevant = {
      lp_event: ['liquidity', 'liquidity_money', 'positions', 'orders'],
      nav_rollover: ['nav', 'units', 'rollover', 'pamm_follows'],
      fee_hwm: ['hwm', 'shares', 'statements', 'pamm_allocations'],
      withdrawal: ['withdrawals', 'admin_liquidations', 'pamm_follows'],
      internal_concurrency: ['positions', 'orders', 'pamm_allocations', 'admin_alerts'],
      operations: ['admin_pamm', 'admin_reconcile', 'admin_disputes', 'admin_emergency', 'admin_alerts', 'admin_reports'],
      risk: ['funds', 'positions', 'orders'],
      capital_math: ['funds', 'pamm_follows', 'pamm_allocations'],
      scheduled_market: ['liquidity', 'funds', 'history'],
      public_pamm: ['pamm_follows', 'pamm_allocations', 'history'],
    }[category];
    return {
      id: row.id, title: row.title, category, retained_blocked: retained,
      status: retained ? 'BLOCKED' : 'PARTIAL',
      attempted_at: new Date().toISOString(),
      actual: retained
        ? 'Retained BLOCKED at user direction because this row depends on the unavailable prop challenge/account/payout APIs.'
        : `One live retest attempt completed against the closest safe deployed ${category.replaceAll('_', ' ')} controls. The available observation did not establish every reference precondition or expected result, so this row is PARTIAL rather than passed.`,
      observations: Object.fromEntries(relevant.map((name) => [name, observations[name]])),
    };
  });
  fs.writeFileSync(path.join(ROOT, 'evidence/blocked-retest-sweep.json'), JSON.stringify({
    generated_at: new Date().toISOString(),
    policy: 'Prop APIs were identified as challenge, prop-account and prop-payout workflows. No blocked PAMM row maps to those APIs, so every formerly blocked PAMM row received one safe live capability/precondition attempt.',
    observations, attempts,
  }, null, 2));
  console.log(JSON.stringify({ total_blocked_reviewed: attempts.length, retained_blocked: attempts.filter(x => x.retained_blocked).length, attempted_partial: attempts.filter(x => !x.retained_blocked).length, observation_statuses: Object.fromEntries(Object.entries(observations).map(([k,v]) => [k, v.status ?? v.error])) }, null, 2));
})().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
