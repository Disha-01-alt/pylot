// fund-crypto-order.mjs — PayPal's OWN crypto rail (Orders V2, payment_source.crypto).
// Creates a sandbox order that funds the Pylot treasury with PYUSD *through PayPal*,
// so the stablecoin story touches PayPal's rails inbound, not only the on-chain leg out.
// Pay-with-crypto is US-merchant-only (excl. NY) and may be gated in sandbox — this
// script reports that outcome honestly instead of failing.
// Run:  node --env-file=.env scripts/fund-crypto-order.mjs [amountUsd]
import { BASE, token } from '../src/rails/paypalAuth.mjs';

const amount = (Number(process.argv[2]) || 25).toFixed(2);

const access = await token();
const res = await fetch(`${BASE}/v2/checkout/orders`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    intent: 'CAPTURE',
    purchase_units: [{
      description: 'Pylot treasury top-up (PYUSD via PayPal crypto)',
      amount: { currency_code: 'USD', value: amount },
    }],
    payment_source: { crypto: { experience_context: { return_url: 'https://example.com/ok', cancel_url: 'https://example.com/no' } } },
  }),
});
const body = await res.json();

if (res.ok) {
  const approve = (body.links ?? []).find((l) => l.rel === 'payer-action' || l.rel === 'approve')?.href;
  console.log(`✅ Orders V2 crypto order created: ${body.id} (status ${body.status})`);
  if (approve) console.log(`   Approve (choose PYUSD) at: ${approve}`);
  console.log('   This is PayPal\'s native pay-with-crypto rail funding the treasury.');
} else {
  console.log(`⚠️  Orders V2 crypto not available on this sandbox account (${res.status}).`);
  console.log(`   ${JSON.stringify(body?.details ?? body?.message ?? body).slice(0, 300)}`);
  console.log('   Pay-with-crypto is US-merchant-only (excl. NY) and may need account enablement.');
  console.log('   Fallback for the demo: note this in the video; the on-chain PYUSD leg still settles.');
  process.exit(1);
}
