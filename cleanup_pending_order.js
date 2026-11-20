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
  const hdrs = { Authorization: `Bearer ${token}`, Accept: 'application/json' };

  const ordersRes = await fetch(`${BASE}/v1/oms/real/orders`, { headers: hdrs });
  const ordersJson = await ordersRes.json();
  const pending = (ordersJson.orders || []).filter((o) => String(o.state || o.status || '').toUpperCase() === 'PENDING');
  console.log('Pending orders found:', pending.map((o) => ({ id: o.order_id, type: o.type, price: o.price, state: o.state })));

  for (const o of pending) {
    const id = o.order_id;
    let c = await fetch(`${BASE}/v1/oms/real/orders/${encodeURIComponent(id)}`, { method: 'DELETE', headers: hdrs });
    if (!c.ok) c = await fetch(`${BASE}/v1/oms/real/orders/${encodeURIComponent(id)}/cancel`, { method: 'POST', headers: { ...hdrs, 'Content-Type': 'application/json' }, body: '{}' });
    console.log(`Cancel ${id} -> [${c.status}] ${(await c.text()).slice(0, 180)}`);
  }

  const after = await (await fetch(`${BASE}/v1/oms/real/orders`, { headers: hdrs })).json();
  const remainingPending = (after.orders || []).filter((o) => String(o.state || o.status || '').toUpperCase() === 'PENDING');
  console.log('Remaining pending orders:', remainingPending.length);
}
main().catch((e) => { console.error(e); process.exit(1); });
