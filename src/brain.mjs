// brain.mjs — the full decision brain. Deterministic rules decide every clear case;
// the LLM is consulted only when the rules flag the decision as ambiguous. When a
// rule serves, the rule wins. Each decision is tagged with how it was made:
//   'rule'          — a clear case the rules resolved
//   'llm'           — an ambiguous case the LLM judged
//   'rule-fallback' — ambiguous, but no LLM available (no key/SDK) or it errored
import { decideRoute } from './router.mjs';
import { judgeRail } from './llm.mjs';

export async function route(recipient, policy = {}, opts = {}) {
  const rule = decideRoute(recipient, policy);
  const useLlm = opts.useLlm ?? true;

  if (!rule.ambiguous || !useLlm) return { ...rule, decidedBy: 'rule' };

  const llm = await judgeRail({ recipient, factors: rule.factors });
  if (!llm) return { ...rule, decidedBy: 'rule-fallback' };

  const chosen = llm.rail === 'pyusd' ? rule.factors.pyusd : rule.factors.fiat;
  return {
    ...rule,
    rail: llm.rail,
    estimatedCostUsd: chosen.estimatedCostUsd,
    etaHours: chosen.etaHours,
    reasoning: rule.requiresApproval
      ? `${llm.reasoning}; amount $${recipient.amountUsd} >= approval threshold -> escalate`
      : llm.reasoning,
    decidedBy: 'llm',
  };
}
