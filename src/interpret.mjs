// interpret.mjs — turn a natural-language payout instruction into a batch + policy.
// Same philosophy as the routing brain: deterministic parsing handles the clear
// patterns and always works (no key, no network); an LLM (your OWN key only) is
// used for richer parsing when available. Any LLM failure -> rules.
// Note: via MCP, the LLM agent itself is the driver; this box is the in-product path.

export function parseRules(text, roster) {
  const t = text.toLowerCase();

  // approval threshold: "hold/approve/review/escalate ... $N" or "over/above $N"
  const th = t.match(/(?:hold|approv\w*|review|escalat\w*)[^$\d]*\$?\s*([\d,]+)/)
        ?? t.match(/(?:over|above)\s*\$?\s*([\d,]+)/);
  const approvalThresholdUsd = th ? Number(th[1].replace(/,/g, '')) : undefined;

  // "no crypto / without pyusd / avoid stablecoin" -> fiat-only policy
  const allowPyusd = !/\b(?:no|without|skip|avoid)\s+(?:pyusd|crypto|stablecoin)/.test(t);

  // recipients: a named subset (by role word or country code), else the whole roster
  const named = roster.filter((r) => {
    const words = [r.id, ...r.id.split('-').filter((w) => w.length >= 3)];
    if (words.some((w) => new RegExp(`\\b${w}\\b`).test(t))) return true;
    return new RegExp(`\\b${r.country}\\b`).test(text); // 2-letter codes: uppercase only
  });

  return {
    recipients: named.length ? named : roster,
    policy: { allowPyusd, ...(approvalThresholdUsd != null && { approvalThresholdUsd }) },
    parsedBy: 'rules',
  };
}

async function parseLlm(text, roster) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  let Anthropic;
  try { ({ default: Anthropic } = await import('@anthropic-ai/sdk')); }
  catch { return null; }
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: process.env.PYLOT_LLM_MODEL ?? 'claude-opus-4-8',
      max_tokens: 512,
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            type: 'object', additionalProperties: false,
            required: ['recipientIds', 'summary'],
            properties: {
              recipientIds: { type: 'array', items: { type: 'string' } },
              approvalThresholdUsd: { type: 'number' },
              allowPyusd: { type: 'boolean' },
              summary: { type: 'string' },
            },
          },
        },
      },
      messages: [{
        role: 'user',
        content: 'Parse this payout instruction against the roster. Pick the recipients it refers to '
          + '(all of them if it addresses the whole batch/crew), an approval threshold if stated, '
          + `and whether PYUSD/crypto is excluded.\n\nInstruction: ${text}\n\nRoster: ${JSON.stringify(roster)}`,
      }],
    });
    const out = JSON.parse((res.content ?? []).map((b) => (b.type === 'text' ? b.text : '')).join('').match(/\{[\s\S]*\}/)[0]);
    const ids = new Set(out.recipientIds);
    const recipients = roster.filter((r) => ids.has(r.id));
    if (!recipients.length) return null;
    return {
      recipients,
      policy: {
        ...(out.allowPyusd != null && { allowPyusd: out.allowPyusd }),
        ...(out.approvalThresholdUsd != null && { approvalThresholdUsd: out.approvalThresholdUsd }),
      },
      parsedBy: 'llm',
    };
  } catch { return null; }
}

export async function interpret(text, roster) {
  const p = (await parseLlm(text, roster)) ?? parseRules(text, roster);
  const bits = [`paying ${p.recipients.length} of ${roster.length} recipients`];
  if (p.policy.approvalThresholdUsd != null) bits.push(`hold anything ≥ $${p.policy.approvalThresholdUsd} for approval`);
  if (p.policy.allowPyusd === false) bits.push('PYUSD disabled — fiat only');
  const via = p.parsedBy === 'llm' ? 'parsed by Claude' : 'Pylot policy engine';
  return { ...p, interpretation: `Agent: ${bits.join('; ')} (${via})` };
}
