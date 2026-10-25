// rails/paypalInvoicing.mjs — originate the payout obligation via PayPal Invoicing v2
// (a capability the Agent Toolkit DOES expose). This puts the native PayPal AI tooling
// on the way IN (the collab invoice being split) as well as the way OUT (Reporting),
// not just at reconciliation. Dry-run (default) needs no credentials.
import { BASE, token } from './paypalAuth.mjs';

export async function createInvoice({ label, recipients, currency = 'USD' }, { dryRun = true } = {}) {
  const total = recipients.reduce((a, r) => a + (r.amountUsd || 0), 0);

  if (dryRun) {
    return { ok: true, invoiceId: `DRYRUN-INV-${recipients.length}`, total, status: 'DRAFT' };
  }

  const access = await token();
  const res = await fetch(`${BASE}/v2/invoicing/invoices`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      detail: { currency_code: currency, note: label },
      items: recipients.map((r) => ({
        name: r.id,
        quantity: '1',
        unit_amount: { currency_code: currency, value: (r.amountUsd).toFixed(2) },
      })),
    }),
  });
  const body = await res.json();
  return { ok: res.ok, invoiceId: body?.id ?? null, total, status: res.ok ? 'DRAFT' : 'FAILED', raw: body };
}
