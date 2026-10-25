// reconcile.mjs — close the loop on every payout (Phase 5).
//   fiat leg  -> PayPal Reporting / Transaction Search (read)
//   PYUSD leg -> on-chain transaction receipt
// PayPal's reporting surface cannot store reasoning or on-chain hashes, so
// reconciliation JOINS the ledger (reasoning + refs) to each source of truth and
// marks the entry. Dry-run synthesizes verdicts from the DRYRUN refs; live calls out.
import { BASE, token } from './rails/paypalAuth.mjs';

const mark = (entry, status, source, detail) => ({ ...entry, reconciliation: { status, source, detail } });
const isoDate = (d) => d.toISOString().replace(/\.\d{3}Z$/, '-0000'); // Transaction Search wants ...-0000

export async function reconcileEntry(entry, { dryRun = true } = {}) {
  if (entry.event === 'INSTRUCTED') return mark(entry, 'instruction', 'agent', entry.detail ?? '');
  if (entry.event === 'INVOICED')  return mark(entry, 'invoice_created', 'paypal-invoicing', `invoice ${entry.invoiceId}`);
  if (entry.event === 'ESCALATED') return mark(entry, 'pending_approval', 'ledger', 'awaiting human approval');
  if (entry.event === 'FAILED')    return mark(entry, 'unsettled', 'ledger', entry.detail ?? 'payout failed');

  if (entry.rail === 'pyusd') {
    const v = await reconcilePyusd(entry, dryRun);
    return mark(entry, v.status, 'onchain', v.detail);
  }
  const v = await reconcileFiat(entry, dryRun);
  return mark(entry, v.status, 'paypal-reporting', v.detail);
}

export async function reconcileAll(rows, opts = {}) {
  return Promise.all(rows.map((r) => reconcileEntry(r, opts)));
}

async function reconcileFiat(entry, dryRun) {
  if (dryRun || String(entry.ref ?? '').startsWith('DRYRUN')) {
    return { status: 'reconciled', detail: 'dry-run: matched simulated payout' };
  }
  try {
    const access = await token();
    // Primary: the stored ref IS the payout batch id — exact match, no amount collisions.
    if (entry.ref) {
      const res = await fetch(`${BASE}/v1/payments/payouts/${entry.ref}`, {
        headers: { Authorization: `Bearer ${access}` },
      });
      if (res.ok) {
        const s = (await res.json())?.batch_header?.batch_status;
        if (s === 'SUCCESS') return { status: 'reconciled', detail: `payout batch ${s}` };
        if (s === 'DENIED' || s === 'CANCELED') return { status: 'unsettled', detail: `payout batch ${s}` };
        return { status: 'pending', detail: `payout batch ${s ?? 'UNKNOWN'}` };
      }
    }
    // Fallback: Transaction Search (Reporting) amount match — lags up to ~3h.
    const end = new Date(), start = new Date(end.getTime() - 31 * 24 * 3600 * 1000);
    const url = `${BASE}/v1/reporting/transactions?start_date=${isoDate(start)}&end_date=${isoDate(end)}`
      + `&fields=transaction_info&page_size=100`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${access}` } });
    if (!res.ok) return { status: 'unverifiable', detail: `reporting ${res.status}` };
    const body = await res.json();
    const want = entry.amountUsd.toFixed(2);
    const hit = (body.transaction_details ?? []).some((t) => {
      const v = t?.transaction_info?.transaction_amount?.value;
      return v != null && Math.abs(parseFloat(v)).toFixed(2) === want;
    });
    // Transaction Search lags up to ~3h, so a miss may just be pending, not wrong.
    return hit
      ? { status: 'reconciled', detail: 'matched in Transaction Search' }
      : { status: 'pending', detail: 'not yet in Transaction Search (up to ~3h delay)' };
  } catch (e) {
    return { status: 'unverifiable', detail: e.message };
  }
}

async function reconcilePyusd(entry, dryRun) {
  if (dryRun || String(entry.ref ?? '').startsWith('0xDRYRUN')) {
    return { status: 'reconciled', detail: 'dry-run: simulated on-chain confirmation' };
  }
  let ethers;
  try { ({ ethers } = await import('ethers')); }
  catch { return { status: 'unverifiable', detail: 'install ethers to verify on-chain' }; }
  try {
    const provider = new ethers.JsonRpcProvider(process.env.PYUSD_RPC_URL);
    const rcpt = await provider.getTransactionReceipt(entry.ref);
    if (!rcpt) return { status: 'pending', detail: 'tx not yet mined' };
    return rcpt.status === 1
      ? { status: 'reconciled', detail: `confirmed in block ${rcpt.blockNumber}` }
      : { status: 'unsettled', detail: 'tx reverted' };
  } catch (e) {
    return { status: 'unverifiable', detail: e.message };
  }
}
