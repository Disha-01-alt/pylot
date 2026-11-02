# Pylot

An **agentic payout brain** for the global creator and gig economy. Pylot routes each
disbursement to the right rail — conventional **PayPal Payouts** (fiat) or **PYUSD** settled
on-chain — based on destination country, estimated cost and speed, recipient preference, and
a configurable approval threshold. It is a **custom MCP extension** to PayPal's agent surface:
PayPal's Agent Toolkit exposes orders, invoices, disputes, subscriptions, catalog, shipment
tracking, and reporting — but **not** outbound payouts, and the self-serve Payouts sandbox
**cannot** send PYUSD. Pylot adds exactly those missing pieces and lets an LLM agent drive them.

## Why

The first wave of agentic commerce crowded into *inbound* checkout. Pylot works the other
direction — paying people worldwide — where PayPal's mass-payout reach and PYUSD are a genuine
moat and where a stablecoin's properties are actually load-bearing (cross-border, instant,
permissionless settlement).

**Live demo:** <https://pylot-crm4.onrender.com> — hosted on Render (free tier: first load after idle takes ~1 min to wake). Type an instruction like *"pay only the editor and director, no crypto, hold over $120"* and watch the agent route, escalate, and reconcile. Safe dry-run — no funds move.

## Quick start (zero install, safe dry-run)

```bash
node demo.mjs      # end-to-end: split a creator invoice, route each share, print the ledger
node --test        # run the decision-brain + reconciliation self-checks
node dashboard.mjs # treasury dashboard + NL agent box -> http://localhost:3000 (set PORT=... if in use)
                   # type e.g. "pay only the editor and director, no crypto, hold over $120"
```

Everything defaults to **dry-run** — no credentials, no funds moved. The demo shows a payout
settled on fiat, two routed to PYUSD (one because the fiat corridor is unavailable, one because
PYUSD is cheaper), one escalated for approval over the threshold, and one deliberate failure.

## Going live

Copy `.env.example` to `.env` and fill in credentials:
- **Fiat leg:** a PayPal sandbox app (`PAYPAL_CLIENT_ID` / `PAYPAL_SECRET`) — uses Payouts REST v1.
- **PYUSD leg:** `npm i ethers`, a testnet RPC, a faucet-funded key, and the PYUSD token address
  (Ethereum Sepolia or Solana Devnet).
- **MCP server:** `npm i @modelcontextprotocol/sdk`, then `node src/mcp-server.mjs` to expose
  `route_payout`, `pay_batch`, and `get_ledger` to an MCP client (Claude, Cursor, …).
- **LLM routing judgment (optional):** `npm i @anthropic-ai/sdk` and set your **own**
  `ANTHROPIC_API_KEY` in `.env` (never a shared account). Consulted only for *ambiguous*
  routing (auto preference, both rails viable, amount ≥ materiality); unset → deterministic
  fallback. The rule wins on every clear case.

## Architecture

```
agent / NL instruction
        │  (MCP: route_payout, pay_batch, get_ledger)
        ▼
   router.mjs ── decision brain (pure, deterministic, tested)
        │        cost/speed estimate ← costModel.mjs  (ESTIMATE, not a PayPal quote)
        ▼
  pylot.mjs ── orchestrate: route · execute · escalate · log
        ├── rails/paypalPayouts.mjs   (fiat — Payouts REST v1, wrapped)
        └── rails/pyusdChain.mjs      (PYUSD — on-chain testnet)
        ▼
   ledger.mjs ── append-only audit trail (reasoning + rail + result + ref)
```

## PayPal tools used

| Tool | Role | Native or custom |
|---|---|---|
| MCP server | Agent connectivity / context | Native |
| Agent Toolkit — Invoicing (v2) | Originate the payout obligation (`rails/paypalInvoicing.mjs`) | Native toolkit |
| Agent Toolkit — Reporting / Transaction Search | Reconcile the fiat leg (`reconcile.mjs`) | Native toolkit |
| Payouts REST API v1 (sandbox) | Execute fiat payouts | **Wrapped** (not in the toolkit) |
| PYUSD (token) | Stablecoin settlement leg | On-chain (not via Payouts) |
| Sandbox negative-testing | Trigger real failure paths | Native sandbox |

Deliberately **unused**: Disputes, Subscriptions, Catalog, Orders/checkout. (Native Agent Toolkit touches both ends — Invoicing in, Reporting out.)

## Honest limitations

- **Not pure Agent Toolkit** — payouts and PYUSD require the custom tools above.
- **Routing cost is an estimate** — PayPal exposes no pre-payout fee/FX quote, so `costModel.mjs`
  models each rail's *all-in economic cost*, decomposed: fiat = published fee schedule + FX spread
  (kept apart); PYUSD = network gas + recipient **off-ramp** (conversion % + cash-out + time to
  usable local currency — the cost a naive "$0.01 flat" model hides). Never presented as a
  PayPal-sourced figure; each component's upgrade path to live data is documented in the file.
- **PYUSD leg is on-chain/testnet** — the self-serve Payouts endpoint can't send PYUSD; production
  would use Enterprise Payouts (separate onboarding).

## More docs

- [`INTEGRATION.md`](INTEGRATION.md) — how Pylot plugs into PayPal's platform today, and the five
  integration points that would make it native (written for PayPal developers).
- [`RUNBOOK.md`](RUNBOOK.md) — operator steps for a live run (sandbox fiat + testnet PYUSD).

## License

MIT
