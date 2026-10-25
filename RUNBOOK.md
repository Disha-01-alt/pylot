# Pylot — Go-Live Runbook (operator steps)

Everything below is **already wired and tested dry-run**. These are the only steps a human
must do, in order. Total hands-on time: ~20 minutes + video recording.

## State right now

| Leg | Status |
|---|---|
| PayPal sandbox auth | ✅ verified (`npm run check` passes) |
| Fiat payout path (Payouts v1) | ✅ wired; needs `PAYPAL_SB_RECEIVER` set (step 1) |
| PYUSD on-chain path (Sepolia) | ✅ wired; RPC + token verified live (symbol=PYUSD); wallet needs faucet funds (step 2) |
| Reconciliation | ✅ fiat = exact payout-batch lookup; PYUSD = tx receipt |
| Orders V2 pay-with-crypto | script ready (`npm run crypto-order`) — may be gated on sandbox, handles that |
| Demo video | ❌ yours (shot list below) |

## Step 1 — fiat receiver (2 min)

developer.paypal.com → Testing Tools → **Sandbox Accounts** → copy the **personal**
account's email → paste into `.env` as `PAYPAL_SB_RECEIVER=`.
Also confirm your **business** sandbox account has balance (sandbox accounts start with
fake money; top up from the account's "Duplicate/Fund" options if needed).

## Step 2 — fund the testnet wallet (5 min)

Wallet (fresh, testnet-only): `0xb9D148EAC2D9c289352061C0d79736ae5408B5BD`

1. **Sepolia ETH (gas):** https://cloud.google.com/application/web3/faucet/ethereum/sepolia
   (or sepoliafaucet.com) → paste the address.
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

Optional but worth 30 seconds of video: `npm run crypto-order` — creates a real
Orders V2 order with `payment_source.crypto` (PayPal's own crypto rail funding the
treasury). If your sandbox account is gated for pay-with-crypto it says so cleanly —
either way you have an honest line for the video.

## Step 4 — the < 3-min video (shot list)

| t | Shot | Say |
|---|---|---|
| 0:00–0:20 | Title + one slide | "Agentic commerce went inbound. Pylot goes outbound: an agent that routes every payout to the best rail — PayPal fiat or PYUSD — and proves it." |
| 0:20–0:50 | Terminal: `node demo.mjs` | Narrate the six outcomes: routed, rerouted (NG), cheaper-rail (PH), escalated, failed. "Every decision has reasoning in an audit ledger." |
| 0:50–1:50 | Dashboard, **LIVE badge** | Type *"Pay the City Nights crew; hold anything over $100"* into the agent box and hit Send. Point at: the agent's interpretation banner, real payout batch ids, a PYUSD tx — **click through to Etherscan**. Click Approve on the held payout. Then type *"pay only the editor, no crypto"* to show the agent obeying policy from plain English. |
| 1:50–2:20 | **The money shot** — terminal + dashboard side-by-side. In a fresh Claude Code session in this repo (pylot MCP is already registered), type: *"Use the pylot tools to pay the City Nights crew, hold anything over $100, then show me the ledger."* Claude calls `pay_batch`; within 4s the dashboard grid fills **on its own** — a real LLM agent moving money, no API key, no mock. | "Claude itself is the treasurer. These are the payout tools PayPal's Agent Toolkit doesn't ship yet — exposed over MCP, any agent can drive them." |
| 2:20–2:50 | `npm run crypto-order` output + close | "Treasury funds in via PayPal's own pay-with-crypto rail; obligations originate as PayPal invoices; the fiat leg reconciles via PayPal Reporting. PayPal at both ends." |

Keep the LIVE badge visible in every dashboard shot. Record 1080p, no dead air.

## Step 5 — submit

Public repo (push it yourself, per your workflow), MIT license ✅, README ✅,
`INTEGRATION.md` as the docs artifact, video link, AI-tools disclosure
(Claude Code used for development; optional in-product LLM routing documented in README).

## If something fails live

- `payout needs recipient.email or PAYPAL_SB_RECEIVER` → step 1 skipped.
- Payout `DENIED` → sandbox business account has no balance; fund it.
- PYUSD tx fails → `npm run check:pyusd`; gas or token balance is 0.
- Dashboard port in use → `PORT=3001 PYLOT_LIVE=1 npm run live`.
