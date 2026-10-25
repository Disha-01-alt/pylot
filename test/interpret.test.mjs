// Self-check for the NL instruction parser (the agent box). Run:  node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRules } from '../src/interpret.mjs';

const ROSTER = [
  { id: 'editor-us',   country: 'US', amountUsd: 12 },
  { id: 'vfx-ng',      country: 'NG', amountUsd: 30 },
  { id: 'director-gb', country: 'GB', amountUsd: 150 },
];

test('threshold parsed from "hold anything over $N"', () => {
  const p = parseRules('Pay the crew; hold anything over $1,000', ROSTER);
  assert.equal(p.policy.approvalThresholdUsd, 1000);
  assert.equal(p.recipients.length, 3); // whole crew
});

test('named subset selected by role word', () => {
  const p = parseRules('pay the editor and the director today', ROSTER);
  assert.deepEqual(p.recipients.map((r) => r.id).sort(), ['director-gb', 'editor-us']);
});

test('"no crypto" disables PYUSD', () => {
  const p = parseRules('pay everyone, no crypto please', ROSTER);
  assert.equal(p.policy.allowPyusd, false);
});

test('country code (uppercase) selects a recipient', () => {
  const p = parseRules('send the NG payment', ROSTER);
  assert.deepEqual(p.recipients.map((r) => r.id), ['vfx-ng']);
});
