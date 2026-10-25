// Self-check: payBatch originates a PayPal invoice obligation, then routes payouts.
// Run deterministically with key unset:  env -u ANTHROPIC_API_KEY node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// Isolate the ledger so the test doesn't touch the real ledger.jsonl.
process.env.PYLOT_LEDGER = path.join(os.tmpdir(), `pylot-test-${process.pid}.jsonl`);
const { payBatch } = await import('../src/pylot.mjs');

test('payBatch invoices (Agent Toolkit Invoicing) then routes payouts', async () => {
  const rows = await payBatch(
    { label: 'test', recipients: [{ id: 'a', country: 'US', amountUsd: 50, hasCryptoWallet: false }] },
    {},
    { dryRun: true, useLlm: false },
  );
  assert.equal(rows[0].event, 'INVOICED');          // obligation originated first
  assert.ok(rows[0].invoiceId);
  assert.ok(rows.some((r) => r.event === 'PAID'));   // then the payout routed
  fs.rmSync(process.env.PYLOT_LEDGER, { force: true });
});
