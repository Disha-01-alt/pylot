// Self-check for the MCP layer itself: a real client spawns the real server over
// stdio and exercises all three tools (dry-run, isolated ledger). Run:  node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const SERVER = new URL('../src/mcp-server.mjs', import.meta.url).pathname;
const LEDGER = path.join(os.tmpdir(), `pylot-mcp-test-${process.pid}.jsonl`);

test('MCP server: tools listed with safety annotations; all three callable', async () => {
  const transport = new StdioClientTransport({
    command: 'node', args: [SERVER],
    env: { ...process.env, PYLOT_LEDGER: LEDGER, PYLOT_LIVE: '0' },
  });
  const client = new Client({ name: 'self-check', version: '0.0.1' });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    assert.deepEqual(Object.keys(byName).sort(), ['get_ledger', 'pay_batch', 'route_payout']);
    assert.equal(byName.route_payout.annotations.readOnlyHint, true);
    assert.equal(byName.pay_batch.annotations.destructiveHint, true);  // money moves in live mode
    assert.equal(byName.get_ledger.annotations.readOnlyHint, true);

    const route = await client.callTool({ name: 'route_payout', arguments: { country: 'NG', amountUsd: 200, hasCryptoWallet: true } });
    assert.equal(JSON.parse(route.content[0].text).rail, 'pyusd'); // NG fiat corridor unavailable

    const paid = await client.callTool({ name: 'pay_batch', arguments: {
      label: 'mcp self-check', approvalThresholdUsd: 100,
      recipients: [{ id: 'a', country: 'US', amountUsd: 50, hasCryptoWallet: false }],
    } });
    assert.ok(JSON.parse(paid.content[0].text).some((r) => r.event === 'PAID'));

    const ledger = await client.callTool({ name: 'get_ledger', arguments: {} });
    const rows = JSON.parse(ledger.content[0].text);
    assert.equal(rows[0].event, 'INSTRUCTED'); // the agent's instruction is the first audit row
    assert.ok(rows.every((r) => !String(r.ref ?? '').includes('0x') || r.ref.startsWith('0xDRYRUN'))); // nothing live
  } finally {
    await client.close();
    fs.rmSync(LEDGER, { force: true });
  }
});
