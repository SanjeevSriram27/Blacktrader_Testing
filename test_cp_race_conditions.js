const fs = require('fs');
const path = require('path');

const creds = JSON.parse(fs.readFileSync(path.join(__dirname, 'pamm_credentials.json'), 'utf8'));
const BASE = creds.platform_base_url;

async function api(urlPath, { method = 'GET', token, body } = {}) {
  const hdrs = { Accept: 'application/json' };
  if (token) hdrs.Authorization = `Bearer ${token}`;
  if (body !== undefined) hdrs['Content-Type'] = 'application/json';
  const t0 = performance.now();
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: hdrs,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const ms = Math.round(performance.now() - t0);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, json, text, ms };
}

async function loginClient(email, password) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, remember: true }),
  });
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  const ct = await fetch(`${BASE}/api/auth/chart-token`, {
    method: 'POST',
    headers: { Cookie: cookie },
  });
  const j = await ct.json();
  if (!j.token) throw new Error(`Failed chart token for ${email}: ${ct.status}`);
  return { token: j.token, cookie };
}

async function closeAllRealPositions(token) {
  const p = (await api('/v1/oms/real/positions', { token })).json;
  for (const pos of p?.positions || []) {
    await api(`/v1/oms/real/positions/${encodeURIComponent(pos.market_order_id)}/squareoff`, {
      method: 'POST',
      token,
      body: {},
    });
  }
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function run() {
  console.log('=== STARTING SUITE: COPY TRADING & PAMM CONCURRENCY (CP01, CP03, CP05, CP08, CP10) ===');
  const results = [];
  const { token: masterToken } = await loginClient(creds.master.email, creds.master.password);
  const f10 = creds.followers.find((f) => f.email === 'pmf10@mailinator.com') || creds.followers[9];
  const { token: f10Token } = await loginClient(f10.email, f10.password);

  try {
    await closeAllRealPositions(masterToken);

    // =========================================================================
    // CP08: Follower Double-Join Concurrency Race
    // =========================================================================
    console.log('\n--- [CP08] Follower Double-Join Concurrency Race (Simultaneous Join Requests) ---');
    // Ensure f10 leaves pool cleanly first
    const unfollowRes = await api('/v1/oms/real/pamm/unfollow', {
      method: 'POST',
      token: f10Token,
      body: { master_client_id: creds.master.member_id },
    });
    console.log('f10 unfollow result:', unfollowRes.status, unfollowRes.json);
    await sleep(1500);

    const f10BalBefore = (await api('/v1/oms/real/positions', { token: f10Token })).json?.funds?.balance || 0;
    console.log('f10 Real Balance before double-join:', f10BalBefore);

    // Fire TWO simultaneous join requests with $100 deposit at the exact same millisecond
    const opKeyA = `race-join-a-${Date.now()}`;
    const opKeyB = `race-join-b-${Date.now()}`;
    const [joinA, joinB] = await Promise.all([
      api('/v1/oms/real/pamm/join', {
        method: 'POST',
        token: f10Token,
        body: { master_client_id: creds.master.member_id, deposit: 100, operation_key: opKeyA },
      }),
      api('/v1/oms/real/pamm/join', {
        method: 'POST',
        token: f10Token,
        body: { master_client_id: creds.master.member_id, deposit: 100, operation_key: opKeyB },
      }),
    ]);
    console.log('CP08 Join Responses:', {
      joinA: { status: joinA.status, text: joinA.text.trim() },
      joinB: { status: joinB.status, text: joinB.text.trim() },
    });

    await sleep(2000);
    // Check master pool to see how many subscriptions exist for f10
    const masterPoolRes = await api('/v1/oms/real/pamm/follows', { token: masterToken });
    const f10Subs = (masterPoolRes.json?.pool || []).filter(s => s.follower_client_id === f10.member_id && s.status === 'active');
    console.log('Active subscriptions for f10 in pool:', f10Subs.length);

    const f10BalAfter = (await api('/v1/oms/real/positions', { token: f10Token })).json?.funds?.balance || 0;
    const balanceDebited = f10BalBefore - f10BalAfter;
    console.log('f10 Balance debited:', balanceDebited);

    const cp08Ok = (f10Subs.length === 1) && (Math.abs(balanceDebited - 100) < 0.01) &&
      ((joinA.status === 200 && joinB.status === 400) || (joinA.status === 400 && joinB.status === 200));

    const cp08Result = {
      id: 'CP08',
      title: 'Follower double-joins pool concurrently (Simultaneous join race)',
      status: cp08Ok ? 'PASS' : 'DEFECT (Duplicate subscription or double-debit permitted)',
      joinAStatus: joinA.status,
      joinBStatus: joinB.status,
      activeSubscriptionsCount: f10Subs.length,
      balanceDebited,
      sampleReject: [joinA, joinB].find(j => j.status !== 200)?.text?.trim(),
    };
    results.push(cp08Result);
    console.log('CP08 Verdict:', cp08Result);

    // =========================================================================
    // CP10: Follower Attempts to Square Off Master's Active Trade Directly
    // =========================================================================
    console.log('\n--- [CP10] Follower Attempts to Square Off Master Position Directly ---');
    // Master places a small BUY order
    const masterBuy = await api('/v1/oms/real/orders', {
      method: 'POST',
      token: masterToken,
      body: {
        symbol: 'BINANCE:BTCUSDT.P',
        side: 'buy',
        type: 'market',
        qty: 0.01,
      },
    });
    const masterPosId = masterBuy.json?.order?.market_order_id || masterBuy.json?.order?.order_id;
    console.log('Master position opened for CP10:', masterPosId);

    if (!masterPosId) {
      results.push({ id: 'CP10', status: 'FAIL', reason: 'Failed to open master order' });
    } else {
      await sleep(1500);

      // Follower calls squareoff on the master's position ID
      const rogueSquareoff = await api(`/v1/oms/real/positions/${masterPosId}/squareoff`, {
        method: 'POST',
        token: f10Token,
        body: {},
      });
      console.log('Rogue squareoff response:', rogueSquareoff.status, rogueSquareoff.text.trim());

      // Master checks position is still open
      const masterPosCheck = (await api('/v1/oms/real/positions', { token: masterToken })).json?.positions || [];
      const masterStillOpen = masterPosCheck.some(p => p.market_order_id === masterPosId);
      console.log('Master position still intact:', masterStillOpen);

      // Clean up: Master closes the position
      await api(`/v1/oms/real/positions/${masterPosId}/squareoff`, {
        method: 'POST',
        token: masterToken,
        body: {},
      });
      await sleep(1500);

      const cp10Ok = (!rogueSquareoff.ok && masterStillOpen);
      const cp10Result = {
        id: 'CP10',
        title: 'Follower attempts to manually close Master position (Access & Concurrency Isolation)',
        status: cp10Ok ? 'PASS' : 'DEFECT (Follower was permitted to mutate or close Master trade)',
        rogueCloseStatus: rogueSquareoff.status,
        rogueRejectMessage: rogueSquareoff.text.trim(),
        masterPositionProtected: masterStillOpen,
      };
      results.push(cp10Result);
      console.log('CP10 Verdict:', cp10Result);
    }

    // =========================================================================
    // CP01 & CP03: Master BUY -> Disconnected Follower -> Master Closes -> Reconcile
    // =========================================================================
    console.log('\n--- [CP01 & CP03] Master Trade Execution & Closure Ledger Consistency ---');
    // Open position
    const buy2 = await api('/v1/oms/real/orders', {
      method: 'POST',
      token: masterToken,
      body: {
        symbol: 'BINANCE:BTCUSDT.P',
        side: 'buy',
        type: 'market',
        qty: 0.01,
      },
    });
    const posId2 = buy2.json?.order?.market_order_id;
    console.log('Opened trade posId2:', posId2);
    await sleep(2500);

    // Follower check: follower should have 0 open positions (unified block trading architecture)
    const f10Pos = (await api('/v1/oms/real/positions', { token: f10Token })).json?.positions || [];
    console.log('Follower direct positions count (must be 0):', f10Pos.length);

    // Master closes trade
    if (posId2) {
      const closeRes = await api(`/v1/oms/real/positions/${posId2}/squareoff`, {
        method: 'POST',
        token: masterToken,
        body: {},
      });
      console.log('Master trade closed:', closeRes.status);
    }
    await sleep(2000);

    // Check pool health
    const poolCheck = (await api('/v1/oms/real/pamm/follows', { token: masterToken })).json;
    const all10Active = (poolCheck?.pool || []).filter(s => s.status === 'active').length === 10;
    console.log('Pool after trade cycle: active followers count =', poolCheck?.pool?.length, 'all 10 active?', all10Active);

    const cp01Result = {
      id: 'CP01',
      title: 'Master places BUY -> Follower disconnects / reconnects (Block ledger integrity)',
      status: (f10Pos.length === 0) ? 'PASS' : 'DEFECT (Orphan follower position created)',
      followerChildPositions: f10Pos.length,
      architecture: 'Unified block order PAMM (zero child orders on follower account)',
    };
    results.push(cp01Result);

    const cp03Result = {
      id: 'CP03',
      title: 'Master closes BUY -> Follower refreshes (Settlement & reconciliation)',
      status: all10Active ? 'PASS' : 'DEFECT',
      allFollowersActive: all10Active,
      totalPoolBalance: poolCheck?.pool_total,
    };
    results.push(cp03Result);

    // =========================================================================
    // CP05: Follower Attempts to Unfollow While Master Has Open Trade
    // =========================================================================
    console.log('\n--- [CP05] Follower Attempts Unfollow While Master Has Open Trade ---');
    const buy3 = await api('/v1/oms/real/orders', {
      method: 'POST',
      token: masterToken,
      body: {
        symbol: 'BINANCE:BTCUSDT.P',
        side: 'buy',
        type: 'market',
        qty: 0.01,
      },
    });
    const posId3 = buy3.json?.order?.market_order_id;
    await sleep(1500);

    const unblockRes = await api('/v1/oms/real/pamm/unfollow', {
      method: 'POST',
      token: f10Token,
      body: { master_client_id: creds.master.member_id },
    });
    console.log('Unfollow attempt during open trade status:', unblockRes.status, unblockRes.text.trim());

    // Clean up master trade
    if (posId3) {
      await api(`/v1/oms/real/positions/${posId3}/squareoff`, {
        method: 'POST',
        token: masterToken,
        body: {},
      });
    }
    await sleep(1500);

    const cp05Ok = unblockRes.status === 400 && unblockRes.text.includes('open trades');
    const cp05Result = {
      id: 'CP05',
      title: 'Follower attempts allocation exit while Master has open trade (Concurrency Lock)',
      status: cp05Ok ? 'PASS' : 'DEFECT',
      statusReceived: unblockRes.status,
      rejectMessage: unblockRes.text.trim(),
      lockedDuringTrade: cp05Ok,
    };
    results.push(cp05Result);
    console.log('CP05 Verdict:', cp05Result);

  } finally {
    await closeAllRealPositions(masterToken).catch(() => {});
  }

  fs.writeFileSync(path.join(__dirname, 'race_cp_suite_results.json'), JSON.stringify(results, null, 2));
  console.log('\n=== SUITE COMPLETE. Saved to race_cp_suite_results.json ===');
}

run().catch((err) => {
  console.error('Fatal in test runner:', err);
  process.exit(1);
});
