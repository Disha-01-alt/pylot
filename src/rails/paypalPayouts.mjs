// rails/paypalPayouts.mjs — conventional wallet payout via PayPal Payouts REST v1.
// Wrapped here because the PayPal Agent Toolkit does NOT expose outbound payouts.
// Dry-run (default) needs no credentials; live mode uses fetch against the sandbox.
import { BASE, token } from './paypalAuth.mjs';

export async function sendFiatPayout({ recipient, amountUsd }, { dryRun = true } = {}) {
  // Sandbox negative-testing: a recipient flagged forceFail simulates a failed payout (e.g. ERRPYO002).
  if (dryRun) {
    if (recipient.forceFail) return { ok: false, status: 'FAILED', ref: null, reason: 'simulated sandbox failure (ERRPYO002)' };
    return { ok: true, status: 'SUCCESS', ref: `DRYRUN-FIAT-${recipient.id}`, rail: 'fiat' };
  }
  // Live: every demo/dashboard recipient settles to your sandbox personal account.
  // ponytail: one fallback here covers all callers instead of per-recipient emails.
  const receiver = recipient.email ?? process.env.PAYPAL_SB_RECEIVER;
  if (!receiver) throw new Error('live payout needs recipient.email or PAYPAL_SB_RECEIVER in .env');
  const access = await token();
  const res = await fetch(`${BASE}/v1/payments/payouts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender_batch_header: {
        email_subject: 'You have a payout from Pylot',
        sender_batch_id: `pylot-${recipient.id}-${Date.now()}`,
      },
      items: [{
        recipient_type: 'EMAIL',
        receiver,
        amount: { value: amountUsd.toFixed(2), currency: 'USD' },
        note: 'Paid via Pylot',
        recipient_wallet: 'PAYPAL', // Payouts sandbox supports PAYPAL / VENMO only — not PYUSD
      }],
    }),
  });
  const body = await res.json();
  return { ok: res.ok, status: res.ok ? 'PENDING' : 'FAILED', ref: body?.batch_header?.payout_batch_id ?? null, raw: body };
}
