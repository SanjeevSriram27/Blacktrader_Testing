const fs = require('fs');
const path = require('path');

const creds = JSON.parse(fs.readFileSync(path.join(__dirname, 'pamm_credentials.json'), 'utf8'));
const BASE = creds.platform_base_url;

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
  return { token: j.token, cookie };
}

async function probe() {
  console.log('--- Probing Algo Architecture & API routes ---');
  const { token, cookie } = await loginClient(creds.master.email, creds.master.password);

  // 1. Fetch frontend bundle strategyManager and search for endpoints
  const smResp = await fetch('https://chartv2.blacktrader.com/assets/strategyManager.svelte-cnej3GWw.js');
  const smCode = await smResp.text();
  console.log('strategyManager code length:', smCode.length);

  // Find all endpoints mentioned in code
  const urlRegex = /["'](\/[a-zA-Z0-9_\-\/]+|https?:\/\/[a-zA-Z0-9_\-\.\/]+)["']/g;
  let match;
  const urls = new Set();
  while ((match = urlRegex.exec(smCode)) !== null) {
    if (match[1].includes('algo') || match[1].includes('strategy') || match[1].includes('cloud') || match[1].includes('/v1/')) {
      urls.add(match[1]);
    }
  }
  console.log('Relevant paths in strategyManager:', Array.from(urls));

  // 2. Test candidate endpoints with token
  const candidates = [
    { method: 'POST', url: `${BASE}/v1/chart/algo/listAlgo`, body: {} },
    { method: 'POST', url: `${BASE}/v1/chart/algo/createAlgo`, body: { name: 'Test', strategy: 'sma' } },
    { method: 'POST', url: 'https://terminal.blacktrader.com/api/cloud-algos/list', body: {} },
    { method: 'POST', url: 'https://terminal.blacktrader.com/api/cloud-algos/runs', body: {} },
    { method: 'GET', url: `${BASE}/v1/oms/paper/algo/list` },
    { method: 'GET', url: `${BASE}/v1/oms/paper/algos` },
  ];

  const results = [];
  for (const c of candidates) {
    try {
      const res = await fetch(c.url, {
        method: c.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
          Cookie: cookie,
        },
        body: c.body ? JSON.stringify(c.body) : undefined,
      });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}
      console.log(`${c.method} ${c.url} => ${res.status}:`, text.slice(0, 160));
      results.push({ url: c.url, method: c.method, status: res.status, json, preview: text.slice(0, 200) });
    } catch (e) {
      console.log(`${c.method} ${c.url} => Error: ${e.message}`);
    }
  }

  fs.writeFileSync('algo_probe_results.json', JSON.stringify({ urls: Array.from(urls), results }, null, 2));
}

probe().catch(console.error);
