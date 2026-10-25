// router.mjs — the decision brain. Pure + deterministic, so it is fully testable.
// Rules decide the clear cases; an LLM (via the MCP server) is reserved for genuine
// ambiguity and natural-language intent, per the proposal. When a rule serves, it wins.
import { estimateFiat, estimatePyusd } from './costModel.mjs';

export function decideRoute(recipient, policy = {}) {
  const { country, amountUsd, preference = 'auto', hasCryptoWallet = false } = recipient;
  const threshold = policy.approvalThresholdUsd ?? 1000;
  const allowPyusd = policy.allowPyusd ?? true;

  const fiat = estimateFiat(country, amountUsd);
  const pyusd = estimatePyusd(amountUsd, hasCryptoWallet && allowPyusd, country);

  let rail, why;
  if (preference === 'fiat' && fiat.available) {
    rail = 'fiat'; why = 'recipient prefers fiat and the corridor is available';
  } else if (preference === 'pyusd' && pyusd.available) {
    rail = 'pyusd'; why = 'recipient prefers PYUSD and holds a wallet';
  } else if (!fiat.available && pyusd.available) {
    rail = 'pyusd'; why = `conventional payout unavailable for ${country}; PYUSD is the viable rail (all-in est $${pyusd.estimatedCostUsd} incl. off-ramp)`;
  } else if (!pyusd.available) {
    rail = 'fiat'; why = 'no PYUSD wallet on file; routing conventional payout';
  } else if (pyusd.estimatedCostUsd < fiat.estimatedCostUsd) {
    rail = 'pyusd'; why = `PYUSD cheaper (est $${pyusd.estimatedCostUsd} vs $${fiat.estimatedCostUsd}) and faster for ${country}`;
  } else {
    rail = 'fiat'; why = `fiat cost-competitive (est $${fiat.estimatedCostUsd} vs $${pyusd.estimatedCostUsd}) for ${country}`;
  }

  const chosen = rail === 'pyusd' ? pyusd : fiat;
  const requiresApproval = amountUsd >= threshold;

  // Ambiguous = auto preference, both rails viable, and a material amount — the one
  // case worth escalating to an LLM. Below materiality, "cheapest wins" is clearly right.
  const ambiguous = preference === 'auto' && fiat.available && pyusd.available
    && amountUsd >= (policy.materialityUsd ?? 500);

  return {
    rail,
    estimatedCostUsd: chosen.estimatedCostUsd,
    etaHours: chosen.etaHours,
    requiresApproval,
    ambiguous,
    confidence: ambiguous ? 'low' : 'high',
    reasoning: requiresApproval
      ? `${why}; amount $${amountUsd} >= $${threshold} approval threshold -> escalate`
      : why,
    factors: { fiat, pyusd }, // full estimate kept for the audit trail (ESTIMATE, not a PayPal quote)
  };
}
