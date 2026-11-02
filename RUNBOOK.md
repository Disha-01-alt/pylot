# Pylot — Live-Run Guide

Everything below is **already wired and tested dry-run** (the default mode needs no
credentials at all — see the README quick start). These steps switch the rails to live
sandbox/testnet. Total hands-on time: ~15 minutes.

## State right now

| Leg | Status |
|---|---|
| PayPal sandbox auth | ✅ verified (`npm run check` passes) |
| Fiat payout path (Payouts v1) | ✅ wired; needs `PAYPAL_SB_RECEIVER` set (step 1) |
| PYUSD on-chain path (Sepolia) | ✅ wired; RPC + token verified live (symbol=PYUSD); wallet needs faucet funds (step 2) |
| Reconciliation | ✅ fiat = exact payout-batch lookup; PYUSD = tx receipt |
| Orders V2 pay-with-crypto | script ready (`npm run crypto-order`) — may be gated on sandbox, handles that |

## Step 1 — fiat receiver (2 min)

developer.paypal.com → Testing Tools → **Sandbox Accounts** → copy the **personal**
account's email → paste into `.env` as `PAYPAL_SB_RECEIVER=`.
Also confirm your **business** sandbox account has balance (sandbox accounts start with
fake money; top up from the account's "Duplicate/Fund" options if needed).

## Step 2 — fund the testnet wallet (5 min)

Use a fresh, testnet-only wallet; put its private key in `.env` as `PYUSD_PRIVATE_KEY`.

1. **Sepolia ETH (gas):** https://cloud.google.com/application/web3/faucet/ethereum/sepolia
   (or sepoliafaucet.com) → paste your wallet address.
2. **Test PYUSD:** Google Cloud Web3 faucet also dispenses PYUSD on Sepolia
   (faucet page → select PYUSD), or PayPal/Paxos dev faucet. ~50 test PYUSD is plenty —
   the dashboard sample batch uses 45.
3. Verify: `npm run check:pyusd` → must print both balances > 0 and exit 0.

## Step 3 — one live rehearsal (5 min)

```bash
npm run check            # PayPal auth OK
npm run check:pyusd      # wallet funded
PYLOT_LIVE=1 npm run live   # dashboard at http://localhost:3000, badge says LIVE
```

In the browser: type an instruction in the **agent box** (prefilled: *"Pay the City Nights
crew; hold anything over $100"*) and hit **▶ Send to agent**. Expect:
- fiat rows → real `payout_batch_id` refs, reconciliation flips to `payout batch SUCCESS`
  (may show `PENDING` for a minute — the 4s auto-refresh will catch up);
- PYUSD rows → real `0x…` tx hashes, **clickable to sepolia.etherscan.io**;
- `director-gb` escalates → click **Approve** → settles live;
- check the sandbox personal account at sandbox.paypal.com — the fiat money arrived.

Optional: `npm run crypto-order` — creates a real Orders V2 order with
`payment_source.crypto` (PayPal's own crypto rail funding the treasury). If your sandbox
account is gated for pay-with-crypto it says so cleanly.

## Driving Pylot from an agent (MCP)

Register `src/mcp-server.mjs` with any MCP client (Claude Code, Cursor, …) per the
snippet in `INTEGRATION.md`, then ask in plain English — e.g. *"Use the pylot tools to
pay the City Nights crew, hold anything over $100, then show me the ledger."* The agent
calls `pay_batch`; the dashboard's 4-second poll picks the rows up on its own.

## If something fails live

- `payout needs recipient.email or PAYPAL_SB_RECEIVER` → step 1 skipped.
- Payout `DENIED` → sandbox business account has no balance; fund it.
- PYUSD tx fails → `npm run check:pyusd`; gas or token balance is 0.
- Dashboard port in use → `PORT=3001 PYLOT_LIVE=1 npm run live`.
