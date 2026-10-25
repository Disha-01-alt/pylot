// demo.mjs — end-to-end dry run: split a collaborative creator invoice across
// contributors in different corridors, route each to the right rail, settle, and
// print the audit ledger. Run:  node demo.mjs
import { payBatch } from './src/pylot.mjs';

const batch = {
  label: 'Creator collab #4812 — "City Nights" music video',
  recipients: [
    { id: 'editor-us',   country: 'US', amountUsd: 120,  preference: 'auto', hasCryptoWallet: false },                      // cheap fiat
    { id: 'vfx-ng',      country: 'NG', amountUsd: 300,  preference: 'auto', hasCryptoWallet: true  },                      // fiat unavailable -> PYUSD
    { id: 'music-ph',    country: 'PH', amountUsd: 90,   preference: 'auto', hasCryptoWallet: true  },                      // PYUSD cheaper -> PYUSD
    { id: 'producer-in', country: 'IN', amountUsd: 600,  preference: 'auto', hasCryptoWallet: true  },                      // ambiguous (>= $500) -> LLM decides, else rule-fallback
    { id: 'director-gb', country: 'GB', amountUsd: 1500, preference: 'fiat', hasCryptoWallet: false },                      // over threshold -> escalate
    { id: 'thumb-ar',    country: 'AR', amountUsd: 60,   preference: 'fiat', hasCryptoWallet: false, forceFail: true },     // fiat, simulated failure
  ],
};

const policy = { approvalThresholdUsd: 1000, allowPyusd: true };
const rows = await payBatch(batch, policy, { dryRun: true });

const tag = { PAID: '[PAID]', ESCALATED: '[HOLD]', FAILED: '[FAIL]' };
console.log(`\nPylot — ${batch.label}\n` + '='.repeat(64));
for (const r of rows) {
  if (r.event === 'INVOICED') {
    console.log(`\n[INV ]  PayPal invoice ${r.invoiceId} created for $${r.amountUsd} total (obligation)`);
    continue;
  }
  console.log(`\n${tag[r.event] ?? r.event}  ${r.recipient}  $${r.amountUsd}  ->  ${r.rail.toUpperCase()}  (est $${r.estimatedCostUsd}, ${r.status}, by ${r.decidedBy})`);
  console.log(`   why: ${r.reasoning}`);
  if (r.ref) console.log(`   ref: ${r.ref}`);
  if (r.detail) console.log(`   detail: ${r.detail}`);
}
const n = (e) => rows.filter((r) => r.event === e).length;
console.log('\n' + '='.repeat(64));
console.log(`${n('PAID')} settled, ${n('ESCALATED')} escalated for approval, ${n('FAILED')} failed.`);
console.log('NOTE: costs are Pylot estimates, not PayPal quotes. Dry-run — no funds moved.\n');
