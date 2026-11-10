// mcp-server.mjs — exposes Pylot as an MCP tool server: the "custom extension"
// to PayPal's agent surface, which lacks payout/PYUSD tools. An LLM agent calls
// these tools to turn a natural-language payout instruction into routed settlements.
// Needs the SDK:  npm i @modelcontextprotocol/sdk   (verify the API vs your version)
// Run:  node src/mcp-server.mjs
import { decideRoute } from './router.mjs';
import { payBatch } from './pylot.mjs';
import { readAll, record } from './ledger.mjs';

let Server, StdioServerTransport, types;
try {
  ({ Server } = await import('@modelcontextprotocol/sdk/server/index.js'));
  ({ StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js'));
  types = await import('@modelcontextprotocol/sdk/types.js');
} catch {
  console.error('Pylot MCP server needs the SDK:  npm i @modelcontextprotocol/sdk');
  process.exit(1);
}
const { ListToolsRequestSchema, CallToolRequestSchema } = types;

const TOOLS = [
  {
    name: 'route_payout',
    description: 'Decide the best rail (fiat or PYUSD) for one payout, with reasoning. No funds move.',
    annotations: { title: 'Route a payout (decision only)', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      type: 'object', required: ['country', 'amountUsd'],
      properties: {
        country: { type: 'string' }, amountUsd: { type: 'number' },
        preference: { type: 'string', enum: ['auto', 'fiat', 'pyusd'] },
        hasCryptoWallet: { type: 'boolean' },
      },
    },
  },
  {
    name: 'pay_batch',
    description: 'Route and settle a batch of payouts (dry-run unless PYLOT_LIVE=1). Logs to the audit ledger.',
    // MONEY MOVES when PYLOT_LIVE=1: declared destructive + open-world so MCP hosts warn first.
    annotations: { title: 'Pay a batch (moves funds in live mode)', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    inputSchema: {
      type: 'object', required: ['label', 'recipients'],
      properties: {
        label: { type: 'string' }, recipients: { type: 'array' },
        approvalThresholdUsd: { type: 'number' },
        allowPyusd: { type: 'boolean', description: 'false -> fiat only (e.g. "no crypto")' },
      },
    },
  },
  { name: 'get_ledger', description: 'Return the audit ledger: every routing decision, its reasoning, and outcome.',
    annotations: { title: 'Read the audit ledger', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: { type: 'object', properties: {} } },
];

const text = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });

const server = new Server({ name: 'pylot', version: '0.1.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: a = {} } = req.params;
  if (name === 'route_payout') return text(decideRoute(a));
  if (name === 'pay_batch') {
    // The agent's instruction is the first audit-trail entry, same as the dashboard path.
    record({
      event: 'INSTRUCTED', detail: a.label, decidedBy: 'agent',
      reasoning: `Agent (via MCP): paying ${a.recipients?.length ?? 0} recipients`
        + (a.approvalThresholdUsd != null ? `; hold anything >= $${a.approvalThresholdUsd} for approval` : '')
        + (a.allowPyusd === false ? '; PYUSD disabled — fiat only' : ''),
    });
    const rows = await payBatch(
      { label: a.label, recipients: a.recipients },
      { approvalThresholdUsd: a.approvalThresholdUsd, ...(a.allowPyusd != null && { allowPyusd: a.allowPyusd }) },
      { dryRun: process.env.PYLOT_LIVE !== '1' },
    );
    return text(rows);
  }
  if (name === 'get_ledger') return text(readAll());
  throw new Error(`unknown tool: ${name}`);
});

await server.connect(new StdioServerTransport());
