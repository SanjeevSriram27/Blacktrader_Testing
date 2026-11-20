const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

function loadEnv(envPath) {
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
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

loadEnv(path.resolve(__dirname, '.env'));

const BASE_URL = 'https://lpadmin.blackfx.com';
const MASTER_EMAIL = 'pmmaster@mailinator.com';
const FOLLOWER_EMAILS = Array.from({ length: 10 }, (_, i) => `pmf${i + 1}@mailinator.com`);
const FOLLOWER_WORDS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
const ALL_ACCOUNTS = [
  { email: MASTER_EMAIL, name: 'PM Master', role: 'master' },
  ...FOLLOWER_EMAILS.map((email, idx) => ({
    email,
    name: `PM Follower ${FOLLOWER_WORDS[idx]}`,
    role: 'follower',
  })),
];
const ACCOUNT_PASSWORD = process.env.CLIENT_PASSWORD || 'PammTest@123';
const INITIAL_BALANCE = 1000;
const POOL_DEPOSIT = 100;
const MASTER_DISPLAY_NAME = 'PM Master';
const MASTER_SHARE_PERCENT = 20;

async function apiReq(url, { method = 'GET', token, body, headers = {} } = {}) {
  const hdrs = { ...headers };
  if (token) hdrs['Authorization'] = `Bearer ${token}`;
  if (body !== undefined) hdrs['Content-Type'] = 'application/json';
  const res = await fetch(url, {
    method,
    headers: hdrs,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { ok: res.ok, status: res.status, json, text };
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForOperation(adminToken, opId) {
  for (let i = 0; i < 20; i++) {
    const r = await apiReq(`${BASE_URL}/admin/api/money/operations/${encodeURIComponent(opId)}`, {
      token: adminToken,
    });
    if (r.ok && r.json && r.json.status && r.json.status !== 'processing' && r.json.status !== 'pending') {
      return r.json;
    }
    await sleep(500);
  }
  return null;
}

async function getMemberOmsToken(adminToken, member) {
  // Mint chart-token via admin API (or login via /api/auth/login if needed)
  const ct = await apiReq(
    `${BASE_URL}/admin/api/members/${encodeURIComponent(member.member_id)}/chart-token`,
    { method: 'POST', token: adminToken }
  );
  if (ct.ok && ct.json && ct.json.token) {
    return ct.json.token;
  }
  throw new Error(`Failed to mint chart-token for ${member.email}: [${ct.status}] ${ct.text}`);
}

async function main() {
  console.log('1. Authenticating to Admin API...');
  const loginRes = await apiReq(`${BASE_URL}/admin/api/login`, {
    method: 'POST',
    body: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD },
  });
  if (!loginRes.ok || !loginRes.json || !loginRes.json.token) {
    throw new Error(`Admin login failed: [${loginRes.status}] ${loginRes.text}`);
  }
  const adminToken = loginRes.json.token;
  console.log('   Admin authenticated successfully.');

  // Fetch existing members
  const existingRes = await apiReq(`${BASE_URL}/admin/api/members`, { token: adminToken });
  if (!existingRes.ok) throw new Error(`Failed to list members: ${existingRes.status}`);
  const existingByEmail = new Map();
  for (const m of existingRes.json.members || []) {
    existingByEmail.set((m.email || '').toLowerCase(), m);
  }

  console.log('\n2. Creating accounts (1 master + 10 followers)...');
  const membersMap = new Map();
  for (const acc of ALL_ACCOUNTS) {
    const existing = existingByEmail.get(acc.email.toLowerCase());
    if (existing) {
      console.log(`   [EXISTS] ${acc.email} -> ${existing.member_id} (real bal: ${existing.balances?.real ?? 'none'})`);
      membersMap.set(acc.email, existing);
      continue;
    }
    const createRes = await apiReq(`${BASE_URL}/admin/api/members`, {
      method: 'POST',
      token: adminToken,
      body: {
        email: acc.email,
        name: acc.name,
        password: ACCOUNT_PASSWORD,
        paper_engine: 'hedging',
        real_engine: 'hedging',
      },
    });
    if (!createRes.ok) {
      throw new Error(`Failed to create ${acc.email}: [${createRes.status}] ${createRes.text}`);
    }
    const m = createRes.json.member || createRes.json;
    console.log(`   [CREATED] ${acc.email} -> ${m.member_id} (public_id: ${m.public_id})`);
    membersMap.set(acc.email, m);
  }

  console.log(`\n3. Setting $${INITIAL_BALANCE} balance on "real" instance for all 11 accounts...`);
  for (const acc of ALL_ACCOUNTS) {
    const m = membersMap.get(acc.email);
    const balRes = await apiReq(
      `${BASE_URL}/admin/api/members/${encodeURIComponent(m.member_id)}/balance`,
      {
        method: 'POST',
        token: adminToken,
        body: {
          instance: 'real',
          balance: INITIAL_BALANCE,
          remark: 'PAMM initial setup deposit 1000',
        },
      }
    );
    if (!balRes.ok) {
      throw new Error(`Failed to set balance for ${acc.email}: [${balRes.status}] ${balRes.text}`);
    }
    let finalInfo = balRes.json;
    if (balRes.json && balRes.json.status === 'processing' && balRes.json.operation_id) {
      const done = await waitForOperation(adminToken, balRes.json.operation_id);
      if (done) finalInfo = done;
    }
    console.log(`   [FUNDED] ${acc.email} -> status=${finalInfo.status || 'ok'}, balance=${finalInfo.balance ?? INITIAL_BALANCE}`);
  }

  // Refresh member records to get latest balances and IDs
  const refreshedRes = await apiReq(`${BASE_URL}/admin/api/members`, { token: adminToken });
  for (const m of refreshedRes.json.members || []) {
    if (membersMap.has((m.email || '').toLowerCase())) {
      membersMap.set(m.email.toLowerCase(), m);
    }
  }

  console.log('\n4. Registering pmmaster@mailinator.com as PAMM Master on Real (Hedging)...');
  const masterMember = membersMap.get(MASTER_EMAIL);
  const masterToken = await getMemberOmsToken(adminToken, masterMember);

  // Check current OMS state & PAMM follows for master
  const masterFollowsBefore = await apiReq(`${BASE_URL}/v1/oms/real/pamm/follows`, { token: masterToken });
  console.log(`   Master /pamm/follows before: [${masterFollowsBefore.status}] ${masterFollowsBefore.text.slice(0, 300)}`);

  // Register as PAMM master
  const regMasterRes = await apiReq(`${BASE_URL}/v1/oms/real/pamm/master`, {
    method: 'POST',
    token: masterToken,
    body: {
      display_name: MASTER_DISPLAY_NAME,
      share_percent: MASTER_SHARE_PERCENT,
    },
  });
  console.log(`   POST /v1/oms/real/pamm/master -> [${regMasterRes.status}] ${regMasterRes.text}`);
  if (!regMasterRes.ok) {
    throw new Error(`Failed to register PAMM master: [${regMasterRes.status}] ${regMasterRes.text}`);
  }

  // Fetch PAMM masters list to find exact master_client_id
  const mastersListRes = await apiReq(`${BASE_URL}/v1/oms/real/pamm/masters`, { token: masterToken });
  console.log(`   GET /v1/oms/real/pamm/masters -> [${mastersListRes.status}] count=${(mastersListRes.json?.masters || mastersListRes.json || []).length}`);

  const mastersArr = Array.isArray(mastersListRes.json)
    ? mastersListRes.json
    : mastersListRes.json?.masters || [];
  const ourMaster = mastersArr.find(
    (x) =>
      x.display_name === MASTER_DISPLAY_NAME ||
      x.client_id === masterMember.public_id ||
      x.client_id === masterMember.member_id ||
      x.master_client_id === masterMember.public_id ||
      x.email === MASTER_EMAIL
  );

  // Also check master's /pamm/follows after registration
  const masterFollowsAfter = await apiReq(`${BASE_URL}/v1/oms/real/pamm/follows`, { token: masterToken });
  console.log(`   Master /pamm/follows after: [${masterFollowsAfter.status}] ${masterFollowsAfter.text}`);

  const masterClientId =
    ourMaster?.client_id ||
    ourMaster?.master_client_id ||
    regMasterRes.json?.master?.client_id ||
    regMasterRes.json?.client_id ||
    masterFollowsAfter.json?.master?.client_id ||
    masterMember.public_id;

  console.log(`   Resolved master_client_id: ${masterClientId}`);
  if (ourMaster) {
    console.log('   Master directory record:', JSON.stringify(ourMaster));
  }

  console.log(`\n5. Joining all 10 followers to ${MASTER_EMAIL} with $${POOL_DEPOSIT} each...`);
  const followerResults = [];
  for (const email of FOLLOWER_EMAILS) {
    const fMember = membersMap.get(email);
    const fToken = await getMemberOmsToken(adminToken, fMember);
    const opKey = `pamm-join-${email.split('@')[0]}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

    // Check if already following
    const fBefore = await apiReq(`${BASE_URL}/v1/oms/real/pamm/follows`, { token: fToken });
    const existingFollows = fBefore.json?.follows || fBefore.json?.following || [];
    const alreadyFollowing = Array.isArray(existingFollows)
      ? existingFollows.some((f) => f.master_client_id === masterClientId && f.status === 'active')
      : false;

    if (alreadyFollowing) {
      console.log(`   [ALREADY JOINED] ${email}`);
      followerResults.push({ email, member_id: fMember.member_id, status: 'already_joined', follows: fBefore.json });
      continue;
    }

    const joinRes = await apiReq(`${BASE_URL}/v1/oms/real/pamm/join`, {
      method: 'POST',
      token: fToken,
      body: {
        master_client_id: masterClientId,
        deposit: POOL_DEPOSIT,
        operation_key: opKey,
      },
    });
    console.log(`   [JOIN ${joinRes.status}] ${email} -> ${joinRes.text.slice(0, 350)}`);
    if (!joinRes.ok) {
      followerResults.push({ email, member_id: fMember.member_id, ok: false, status: joinRes.status, error: joinRes.text });
    } else {
      followerResults.push({ email, member_id: fMember.member_id, ok: true, status: joinRes.status, data: joinRes.json });
    }
  }

  console.log('\n6. Verifying final balances and PAMM pool state...');
  const finalMembersRes = await apiReq(`${BASE_URL}/admin/api/members`, { token: adminToken });
  const finalMembers = {};
  for (const m of finalMembersRes.json.members || []) {
    const em = (m.email || '').toLowerCase();
    if (em === MASTER_EMAIL || FOLLOWER_EMAILS.includes(em)) {
      finalMembers[em] = {
        member_id: m.member_id,
        public_id: m.public_id,
        status: m.status,
        plan: m.plan || 'default(premium)',
        real_engine: m.real_engine,
        balances: m.balances,
      };
    }
  }

  const finalMasterFollows = await apiReq(`${BASE_URL}/v1/oms/real/pamm/follows`, { token: masterToken });
  const finalMastersList = await apiReq(`${BASE_URL}/v1/oms/real/pamm/masters`, { token: masterToken });
  const finalMasterEntry = (
    Array.isArray(finalMastersList.json) ? finalMastersList.json : finalMastersList.json?.masters || []
  ).find((x) => x.client_id === masterClientId || x.display_name === MASTER_DISPLAY_NAME);

  // Also check master OMS funds endpoint if available
  const masterFunds = await apiReq(`${BASE_URL}/v1/oms/real/funds`, { token: masterToken });

  const report = {
    created_at: new Date().toISOString(),
    instance: 'real (Real Hedging)',
    password_stored_in_env: 'CLIENT_PASSWORD',
    master: {
      email: MASTER_EMAIL,
      member: finalMembers[MASTER_EMAIL],
      master_client_id: masterClientId,
      directory_entry: finalMasterEntry,
      pamm_follows_response: finalMasterFollows.json,
      oms_funds: masterFunds.json,
    },
    followers: FOLLOWER_EMAILS.map((email) => ({
      email,
      member: finalMembers[email],
      join_result: followerResults.find((r) => r.email === email),
    })),
  };

  const reportPath = path.join(__dirname, 'pamm_setup_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nSaved complete verification report to ${reportPath}`);
  console.log('\n=== SUMMARY TABLE ===');
  for (const acc of ALL_ACCOUNTS) {
    const fm = finalMembers[acc.email];
    console.log(
      `  ${acc.role.padEnd(8)} | ${acc.email.padEnd(26)} | ${fm?.member_id || 'N/A'} | real_bal=${JSON.stringify(fm?.balances)}`
    );
  }
  console.log('\nMaster Directory Entry:', JSON.stringify(finalMasterEntry, null, 2));
  console.log('Master OMS Funds:', JSON.stringify(masterFunds.json, null, 2));
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
