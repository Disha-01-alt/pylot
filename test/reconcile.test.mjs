// Self-check for reconciliation (Phase 5). Run:  node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileEntry } from '../src/reconcile.mjs';

test('escalated entry -> pending_approval', async () => {
  const r = await reconcileEntry({ event: 'ESCALATED', rail: 'fiat', amountUsd: 1500 });
  assert.equal(r.reconciliation.status, 'pending_approval');
});

test('failed entry -> unsettled', async () => {
  const r = await reconcileEntry({ event: 'FAILED', rail: 'fiat', amountUsd: 60, detail: 'x' });
  assert.equal(r.reconciliation.status, 'unsettled');
});

test('dry-run fiat payout reconciles via reporting', async () => {
  const r = await reconcileEntry({ event: 'PAID', rail: 'fiat', amountUsd: 120, ref: 'DRYRUN-FIAT-x' }, { dryRun: true });
  assert.equal(r.reconciliation.status, 'reconciled');
  assert.equal(r.reconciliation.source, 'paypal-reporting');
});

test('dry-run PYUSD payout reconciles on-chain', async () => {
  const r = await reconcileEntry({ event: 'PAID', rail: 'pyusd', amountUsd: 300, ref: '0xDRYRUN-y' }, { dryRun: true });
  assert.equal(r.reconciliation.status, 'reconciled');
  assert.equal(r.reconciliation.source, 'onchain');
});
