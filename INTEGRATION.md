# Pylot × PayPal — Integration Guide (for PayPal developers)

How Pylot plugs into PayPal's platform today, and exactly what it would take to make
it native. Pylot is an **MCP extension to PayPal's agent surface**: it adds the
outbound-payout and PYUSD tools the Agent Toolkit does not ship, and keeps PayPal's
native surfaces in the loop at both ends.

## Where Pylot touches PayPal (five integration points)

| # | PayPal surface | Direction | Pylot module | Call |
|---|---|---|---|---|
| 1 | OAuth2 (`/v1/oauth2/token`) | — | `src/rails/paypalAuth.mjs` | client-credentials token, shared by all REST calls |
| 2 | Invoicing v2 (`/v2/invoicing/invoices`) | obligation **in** | `src/rails/paypalInvoicing.mjs` | the batch to be paid originates as a PayPal invoice (native Agent Toolkit domain) |
| 3 | Payouts v1 (`/v1/payments/payouts`) | money **out** | `src/rails/paypalPayouts.mjs` | fiat leg; `recipient_wallet: PAYPAL`; batch id stored as the ledger ref |
| 4 | Payouts v1 GET + Reporting (`/v1/reporting/transactions`) | verify | `src/reconcile.mjs` | exact payout-batch status lookup first, Transaction Search cross-check as fallback |
| 5 | Orders V2 pay-with-crypto (`payment_source.crypto`) | treasury **in** | `scripts/fund-crypto-order.mjs` | funds the payout treasury in PYUSD over PayPal's own crypto rail |

The PYUSD **outbound** leg settles on-chain (Sepolia ERC-20 transfer, `src/rails/pyusdChain.mjs`)
because self-serve Payouts cannot send PYUSD — that is precisely the platform gap Pylot
demonstrates (production path: Enterprise Payouts / Hyperwallet).

## The agent surface (MCP)

`src/mcp-server.mjs` exposes three tools over stdio MCP — the shape we propose for the
Agent Toolkit itself:

| Tool | Contract |
|---|---|
| `route_payout` | `{country, amountUsd, preference?, hasCryptoWallet?}` → rail + cost/ETA estimate + reasoning. Pure decision, no side effects. |
| `pay_batch` | `{label, recipients[], approvalThresholdUsd?}` → invoices the obligation, routes & settles each payout, returns ledger rows. Dry-run unless `PYLOT_LIVE=1`. |
| `get_ledger` | `{}` → full audit trail: decision reasoning, rail, refs (payout batch ids / tx hashes), reconciliation status. |

Plug into any MCP client (Claude Desktop/Code, Cursor, Cline):

```json
{
  "mcpServers": {
    "pylot": {
      "command": "node",
      "args": ["/path/to/paypal-ai/src/mcp-server.mjs"],
      "env": { "PYLOT_LIVE": "0" }
    }
  }
}
```

Then a natural-language instruction like *"pay the City Nights collaborators, hold
anything over $1000"* becomes `pay_batch` with policy — the agent decides, Pylot
executes, the ledger proves it.

## Safety model (what keeps an agent from misfiring money)

1. **Dry-run by default** — `PYLOT_LIVE=1` is an explicit operator opt-in, per process.
2. **Deterministic rules decide every clear case** (`src/router.mjs`, pure + tested);
   the LLM is consulted only for flagged-ambiguous routing and any LLM failure falls
   back to the rule (`src/brain.mjs`). The rule always wins when it serves.
3. **Approval threshold** — amounts ≥ `approvalThresholdUsd` never auto-settle; they
   escalate to a human Approve button on the dashboard.
4. **Append-only ledger** (`ledger.jsonl`) — reasoning + rail + ref + reconciliation for
   every event, including failures and escalations. PayPal's reporting surface cannot
   store agent reasoning or tx hashes; Pylot's ledger is the join table.
5. **Honest estimates** — routing costs come from a labelled static model
   (`src/costModel.mjs`), never presented as PayPal quotes, because no pre-payout
   fee/FX quote endpoint exists today.

## What PayPal would ship to make this native (the ask)

1. **Payouts in the Agent Toolkit** — `create_payout` / `get_payout_status` functions
   mirroring tools #3–4 above. Pylot's MCP schemas are a working draft.
2. **PYUSD as a Payouts `recipient_wallet`** — collapse our on-chain leg into one API.
3. **A pre-payout quote endpoint** (fee + FX by corridor) — replaces `costModel.mjs`
   estimates with authoritative numbers; this is what makes *routing* a real product.
   Concretely, quote-then-execute:

   ```
   POST /v1/payouts/quote  { receiver: {country, method}, amount }
   → { quote_id, expires_at, rails: [
       { rail, all_in_cost, fx_rate_guaranteed, eta_p50, eta_p95, eligible } ] }
   ```

   with `pay_batch` executing against the `quote_id` (price routed on = price paid).
   Every static line in `costModel.mjs` maps to a system PayPal already runs: fees →
   the internal pricing engine; FX → treasury rate-lock; PYUSD gas → internal-ledger
   (free, instant) vs batched on-chain; off-ramp → Hyperwallet partner contract rates;
   ETAs → measured p50/p95 settlement telemetry; availability → the compliance matrix.
   Pylot's router already consumes exactly this shape (`{available, estimatedCostUsd,
   etaHours, breakdown}`) — swap the estimate functions for the quote call and nothing
   else changes. The static table is a mock of this endpoint.
4. **Reasoning metadata on payout batches** — a freeform `agent_context` field, so audit
   trails like Pylot's ledger can live server-side.

## Run it

```bash
node demo.mjs        # dry-run end-to-end, zero credentials
node --test          # 13 self-checks
npm run check        # PayPal sandbox auth preflight
npm run check:pyusd  # on-chain leg preflight
PYLOT_LIVE=1 npm run live   # live dashboard (see RUNBOOK.md)
```
