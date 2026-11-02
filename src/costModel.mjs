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
// Tiers: USD-domestic < developed (low FX spread) < emerging (higher fee + FX) < restricted.
const FIAT_CORRIDORS = {
  // domestic / developed
  US: { feePct: 0.02, flatUsd: 0.25, fxSpreadPct: 0.00, etaHours: 24,  available: true },
  CA: { feePct: 0.02, flatUsd: 0.30, fxSpreadPct: 0.02, etaHours: 48,  available: true },
  GB: { feePct: 0.02, flatUsd: 0.30, fxSpreadPct: 0.02, etaHours: 48,  available: true },
  DE: { feePct: 0.02, flatUsd: 0.30, fxSpreadPct: 0.02, etaHours: 48,  available: true },
  FR: { feePct: 0.02, flatUsd: 0.30, fxSpreadPct: 0.02, etaHours: 48,  available: true },
  ES: { feePct: 0.02, flatUsd: 0.30, fxSpreadPct: 0.02, etaHours: 48,  available: true },
  IT: { feePct: 0.02, flatUsd: 0.30, fxSpreadPct: 0.02, etaHours: 48,  available: true },
  PL: { feePct: 0.03, flatUsd: 0.30, fxSpreadPct: 0.025, etaHours: 48, available: true },
  AU: { feePct: 0.02, flatUsd: 0.30, fxSpreadPct: 0.02, etaHours: 48,  available: true },
  JP: { feePct: 0.02, flatUsd: 0.35, fxSpreadPct: 0.025, etaHours: 48, available: true },
  KR: { feePct: 0.03, flatUsd: 0.35, fxSpreadPct: 0.03, etaHours: 72,  available: true },
  // emerging — creator/gig heavy
  IN: { feePct: 0.03, flatUsd: 0.30, fxSpreadPct: 0.03, etaHours: 72,  available: true },
  PH: { feePct: 0.05, flatUsd: 0.40, fxSpreadPct: 0.04, etaHours: 96,  available: true },
  ID: { feePct: 0.05, flatUsd: 0.40, fxSpreadPct: 0.04, etaHours: 96,  available: true },
  VN: { feePct: 0.05, flatUsd: 0.40, fxSpreadPct: 0.045, etaHours: 96, available: true },
  TH: { feePct: 0.04, flatUsd: 0.40, fxSpreadPct: 0.035, etaHours: 72, available: true },
  MY: { feePct: 0.04, flatUsd: 0.35, fxSpreadPct: 0.03, etaHours: 72,  available: true },
  PK: { feePct: 0.06, flatUsd: 0.50, fxSpreadPct: 0.05, etaHours: 120, available: true },
  BD: { feePct: 0.06, flatUsd: 0.50, fxSpreadPct: 0.05, etaHours: 120, available: true },
  LK: { feePct: 0.06, flatUsd: 0.50, fxSpreadPct: 0.05, etaHours: 120, available: true },
  MX: { feePct: 0.04, flatUsd: 0.40, fxSpreadPct: 0.035, etaHours: 72, available: true },
  BR: { feePct: 0.05, flatUsd: 0.45, fxSpreadPct: 0.04, etaHours: 96,  available: true },
  CO: { feePct: 0.05, flatUsd: 0.45, fxSpreadPct: 0.045, etaHours: 96, available: true },
  PE: { feePct: 0.05, flatUsd: 0.45, fxSpreadPct: 0.045, etaHours: 96, available: true },
  CL: { feePct: 0.04, flatUsd: 0.40, fxSpreadPct: 0.035, etaHours: 72, available: true },
  TR: { feePct: 0.05, flatUsd: 0.45, fxSpreadPct: 0.05, etaHours: 96,  available: true },
  ZA: { feePct: 0.05, flatUsd: 0.45, fxSpreadPct: 0.04, etaHours: 96,  available: true },
  KE: { feePct: 0.06, flatUsd: 0.50, fxSpreadPct: 0.05, etaHours: 120, available: true },
  EG: { feePct: 0.06, flatUsd: 0.50, fxSpreadPct: 0.05, etaHours: 120, available: true },
  MA: { feePct: 0.05, flatUsd: 0.45, fxSpreadPct: 0.045, etaHours: 96, available: true },
  // restricted / high-friction — conventional payout often unavailable
  AR: { feePct: 0.07, flatUsd: 0.50, fxSpreadPct: 0.06, etaHours: 120, available: true },
  NG: { feePct: 0.06, flatUsd: 0.50, fxSpreadPct: 0.05, etaHours: 120, available: false },
  GH: { feePct: 0.06, flatUsd: 0.50, fxSpreadPct: 0.05, etaHours: 120, available: false },
  UA: { feePct: 0.05, flatUsd: 0.45, fxSpreadPct: 0.05, etaHours: 120, available: false },
};
const FIAT_DEFAULT = { feePct: 0.05, flatUsd: 0.50, fxSpreadPct: 0.05, etaHours: 96, available: true };

// PYUSD economic cost = network gas + recipient OFF-RAMP (PYUSD -> local currency).
// The off-ramp is the dominant cost the naive "$0.01 flat" model hides: local
// exchange conversion %, cash-out flat fee, and time-to-usable-money. US ≈ free
// (PayPal converts PYUSD<->USD 1:1 at no fee); elsewhere a local exchange is modeled.
const PYUSD_GAS_USD = { sepolia: 0.01, ethereum: 2.0, solana: 0.001 };
const OFF_RAMP = {
  US:      { pct: 0.000, flatUsd: 0.00, etaHours: 0.1 }, // PayPal PYUSD<->USD 1:1, no fee
  CA:      { pct: 0.005, flatUsd: 0.25, etaHours: 12 },
  GB:      { pct: 0.005, flatUsd: 0.25, etaHours: 12 },
  DE:      { pct: 0.005, flatUsd: 0.25, etaHours: 12 },
  FR:      { pct: 0.005, flatUsd: 0.25, etaHours: 12 },
  ES:      { pct: 0.005, flatUsd: 0.25, etaHours: 12 },
  IT:      { pct: 0.005, flatUsd: 0.25, etaHours: 12 },
  PL:      { pct: 0.007, flatUsd: 0.30, etaHours: 12 },
  AU:      { pct: 0.005, flatUsd: 0.25, etaHours: 12 },
  JP:      { pct: 0.007, flatUsd: 0.30, etaHours: 12 },
  KR:      { pct: 0.008, flatUsd: 0.30, etaHours: 12 },
  IN:      { pct: 0.010, flatUsd: 0.50, etaHours: 24 },
  PH:      { pct: 0.010, flatUsd: 0.50, etaHours: 24 },
  ID:      { pct: 0.010, flatUsd: 0.50, etaHours: 24 },
  VN:      { pct: 0.012, flatUsd: 0.50, etaHours: 24 },
  TH:      { pct: 0.010, flatUsd: 0.40, etaHours: 24 },
  MY:      { pct: 0.008, flatUsd: 0.40, etaHours: 24 },
  PK:      { pct: 0.015, flatUsd: 0.75, etaHours: 24 },
  BD:      { pct: 0.015, flatUsd: 0.75, etaHours: 24 },
  LK:      { pct: 0.015, flatUsd: 0.75, etaHours: 24 },
  MX:      { pct: 0.010, flatUsd: 0.50, etaHours: 24 },
  BR:      { pct: 0.010, flatUsd: 0.50, etaHours: 24 },
  CO:      { pct: 0.012, flatUsd: 0.60, etaHours: 24 },
  PE:      { pct: 0.012, flatUsd: 0.60, etaHours: 24 },
  CL:      { pct: 0.010, flatUsd: 0.50, etaHours: 24 },
  TR:      { pct: 0.012, flatUsd: 0.60, etaHours: 24 },
  ZA:      { pct: 0.012, flatUsd: 0.60, etaHours: 24 },
  KE:      { pct: 0.015, flatUsd: 0.75, etaHours: 24 }, // mobile-money rails keep this competitive
  EG:      { pct: 0.015, flatUsd: 0.75, etaHours: 24 },
  MA:      { pct: 0.015, flatUsd: 0.75, etaHours: 24 },
  AR:      { pct: 0.020, flatUsd: 1.00, etaHours: 24 },
  NG:      { pct: 0.015, flatUsd: 1.00, etaHours: 24 },
  GH:      { pct: 0.015, flatUsd: 1.00, etaHours: 24 },
  UA:      { pct: 0.012, flatUsd: 0.60, etaHours: 24 },
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
