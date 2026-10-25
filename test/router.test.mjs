// Self-check for the decision brain (Appendix D). Run:  node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideRoute } from '../src/router.mjs';

test('PYUSD chosen when the fiat corridor is unavailable', () => {
  assert.equal(decideRoute({ country: 'NG', amountUsd: 200, hasCryptoWallet: true }).rail, 'pyusd');
});

test('fiat chosen when recipient has no PYUSD wallet', () => {
  assert.equal(decideRoute({ country: 'PH', amountUsd: 90, hasCryptoWallet: false }).rail, 'fiat');
});

test('explicit fiat preference honored when available', () => {
  assert.equal(decideRoute({ country: 'GB', amountUsd: 100, preference: 'fiat', hasCryptoWallet: true }).rail, 'fiat');
});

test('auto picks PYUSD when cheaper and a wallet is present', () => {
  assert.equal(decideRoute({ country: 'PH', amountUsd: 90, preference: 'auto', hasCryptoWallet: true }).rail, 'pyusd');
});

test('amount at/over threshold requires approval', () => {
  assert.equal(decideRoute({ country: 'GB', amountUsd: 1500, hasCryptoWallet: false }, { approvalThresholdUsd: 1000 }).requiresApproval, true);
});
