// costModel.mjs — ESTIMATED corridor costs. This is NOT a PayPal quote.
// PayPal exposes no pre-payout fee/FX endpoint, so Pylot routes over an informed
// estimate. What each number is grounded in (real vs modeled):
//   fiat fee/flat     — PayPal's published Payouts fee schedule        (published)
//   fiat fxSpreadPct  — PayPal's published FX spread by corridor       (published)
//   pyusd gas         — static per network; live: provider.getFeeData  (modeled)
//   pyusd off-ramp    — recipient-side conversion % + cash-out flat    (modeled)
//   etaHours          — fixed; upgrade: measure actuals from the ledger (modeled)
// ponytail: static tables are the honest MVP; the upgrade path per line is above.

// Rough, illustrative fiat-corridor estimates keyed by ISO-3166 country.
const FIAT_CORRIDORS = {
  US: { feePct: 0.02, flatUsd: 0.25, fxSpreadPct: 0.00, etaHours: 24,  available: true },
  GB: { feePct: 0.02, flatUsd: 0.30, fxSpreadPct: 0.02, etaHours: 48,  available: true },
  IN: { feePct: 0.03, flatUsd: 0.30, fxSpreadPct: 0.03, etaHours: 72,  available: true },
  PH: { feePct: 0.05, flatUsd: 0.40, fxSpreadPct: 0.04, etaHours: 96,  available: true },
  AR: { feePct: 0.07, flatUsd: 0.50, fxSpreadPct: 0.06, etaHours: 120, available: true },
  NG: { feePct: 0.06, flatUsd: 0.50, fxSpreadPct: 0.05, etaHours: 120, available: false }, // conventional payout often unavailable
};
const FIAT_DEFAULT = { feePct: 0.05, flatUsd: 0.50, fxSpreadPct: 0.05, etaHours: 96, available: true };

// PYUSD economic cost = network gas + recipient OFF-RAMP (PYUSD -> local currency).
// The off-ramp is the dominant cost the naive "$0.01 flat" model hides: local
// exchange conversion %, cash-out flat fee, and time-to-usable-money. US ≈ free
// (PayPal converts PYUSD<->USD 1:1 at no fee); elsewhere a local exchange is modeled.
const PYUSD_GAS_USD = { sepolia: 0.01, ethereum: 2.0, solana: 0.001 };
const OFF_RAMP = {
  US:      { pct: 0.000, flatUsd: 0.00, etaHours: 0.1 },
  GB:      { pct: 0.005, flatUsd: 0.25, etaHours: 12 },
  IN:      { pct: 0.010, flatUsd: 0.50, etaHours: 24 },
  PH:      { pct: 0.010, flatUsd: 0.50, etaHours: 24 },
  AR:      { pct: 0.020, flatUsd: 1.00, etaHours: 24 },
  NG:      { pct: 0.015, flatUsd: 1.00, etaHours: 24 },
  default: { pct: 0.015, flatUsd: 0.50, etaHours: 24 },
};

const round = (n) => Math.round(n * 100) / 100;

export function estimateFiat(country, amountUsd) {
  const c = FIAT_CORRIDORS[country] ?? FIAT_DEFAULT;
  const fee = amountUsd * c.feePct + c.flatUsd;
  const fx = amountUsd * c.fxSpreadPct;
  return {
    rail: 'fiat', available: c.available,
    estimatedCostUsd: round(fee + fx), etaHours: c.etaHours,
    breakdown: { feeUsd: round(fee), fxSpreadUsd: round(fx) }, // fees vs FX, kept apart
  };
}

export function estimatePyusd(amountUsd, hasWallet, country) {
  const gas = PYUSD_GAS_USD[process.env.PYUSD_NETWORK ?? 'sepolia'] ?? 0.01;
  const o = OFF_RAMP[country] ?? OFF_RAMP.default;
  const offRamp = amountUsd * o.pct + o.flatUsd;
  return {
    rail: 'pyusd', available: !!hasWallet,
    estimatedCostUsd: round(gas + offRamp),
    etaHours: 0.01 + o.etaHours, // on-chain settle + time to usable local currency
    breakdown: { gasUsd: gas, offRampUsd: round(offRamp) }, // settlement vs cash-out
  };
}
