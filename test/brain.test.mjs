// Self-check for the brain's rule/LLM routing (Phase 3).
// Run deterministically with the key unset:  env -u ANTHROPIC_API_KEY node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { route } from '../src/brain.mjs';

test('clear case is decided by the rules', async () => {
  const d = await route({ country: 'NG', amountUsd: 200, hasCryptoWallet: true });
  assert.equal(d.decidedBy, 'rule');
  assert.equal(d.rail, 'pyusd');
});

test('ambiguous case falls back to the rule when no LLM key is set', async () => {
  const d = await route({ country: 'IN', amountUsd: 600, preference: 'auto', hasCryptoWallet: true });
  assert.equal(d.decidedBy, 'rule-fallback');
});

test('useLlm:false forces the deterministic path even when ambiguous', async () => {
  const d = await route({ country: 'IN', amountUsd: 600, preference: 'auto', hasCryptoWallet: true }, {}, { useLlm: false });
  assert.equal(d.decidedBy, 'rule');
});
