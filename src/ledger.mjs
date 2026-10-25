// ledger.mjs — append-only audit trail. Pairs the agent's reasoning with the
// executed result; PayPal's reporting surface cannot store reasoning or on-chain
// hashes, so Pylot keeps its own.
// ponytail: JSONL file is the honest MVP; move to SQLite when queries grow.
import { appendFileSync, readFileSync, existsSync, writeFileSync } from 'node:fs';

const PATH = process.env.PYLOT_LEDGER ?? 'ledger.jsonl';

export function clear(path = PATH) { writeFileSync(path, ''); }

export function record(entry) {
  const row = { ts: new Date().toISOString(), ...entry };
  appendFileSync(PATH, JSON.stringify(row) + '\n');
  return row;
}

export function readAll(path = PATH) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
