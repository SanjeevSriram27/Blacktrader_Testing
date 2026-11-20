const fs = require('fs');
const path = require('path');
const creds = JSON.parse(fs.readFileSync(path.join(__dirname, 'pamm_credentials.json'), 'utf8'));
const BASE = creds.platform_base_url;

async function main() {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: creds.master.email, password: creds.master.password, remember: true }),
  });
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  const { token } = await (await fetch(`${BASE}/api/auth/chart-token`, { method: 'POST', headers: { Cookie: cookie } })).json();
  const hdrs = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' };

  // Open 1 paper pos with SL & TP to see exact sl_order & tp_order IDs and probe modify endpoints
  const openR = await fetch(`${BASE}/v1/oms/paper/orders`, {
    method: 'POST', headers: hdrs,
    body: JSON.stringify({ symbol: 'BINANCE:BTCUSDT.P', side: 'BUY', qty: 0.001, type: 'MARKET', sl: 60000, tp: 68000 }),
  });
  const openJ = await openR.json();
  const posId = openJ.order?.market_order_id;
  const posR = await (await fetch(`${BASE}/v1/oms/paper/positions`, { headers: hdrs })).json();
  const pos = (posR.positions || []).find((p) => p.market_order_id === posId);
  console.log('Opened Paper Pos with SL/TP:', JSON.stringify({ market_order_id: pos?.market_order_id, sl_order: pos?.sl_order, tp_order: pos?.tp_order }, null, 2));

  const slId = pos?.sl_order?.order_id;
  const tpId = pos?.tp_order?.order_id;
  const probes = [
    ['PUT', `/v1/oms/paper/orders/${slId}`, { price: 60500, trigger_price: 60500 }],
    ['PATCH', `/v1/oms/paper/orders/${slId}`, { price: 60500, trigger_price: 60500 }],
    ['POST', `/v1/oms/paper/orders/${slId}/modify`, { price: 60500, trigger_price: 60500 }],
    ['PUT', `/v1/oms/paper/positions/${posId}/sltp`, { sl: 60500, tp: 68500 }],
    ['POST', `/v1/oms/paper/positions/${posId}/sltp`, { sl: 60500, tp: 68500 }],
    ['POST', `/v1/oms/paper/positions/${posId}/sl-tp`, { sl: 60500, tp: 68500 }],
    ['PUT', `/v1/oms/paper/positions/${posId}/modify`, { sl: 60500, tp: 68500 }],
    ['POST', `/v1/oms/paper/positions/${posId}/modify`, { sl: 60500, tp: 68500 }],
    ['POST', `/v1/oms/paper/positions/${posId}/bracket`, { sl: 60500, tp: 68500 }],
  ];
  for (const [m, p, b] of probes) {
    const pr = await fetch(`${BASE}${p}`, { method: m, headers: hdrs, body: JSON.stringify(b) });
    const txt = (await pr.text()).slice(0, 140);
    if (pr.status !== 404) console.log(`  HIT [${pr.status}] ${m} ${p} -> ${txt}`);
    else console.log(`  [404] ${m} ${p}`);
  }

  // Cleanup all paper positions
  for (const p of (posR.positions || [])) {
    await fetch(`${BASE}/v1/oms/paper/positions/${encodeURIComponent(p.market_order_id)}/squareoff`, { method: 'POST', headers: hdrs, body: '{}' });
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
