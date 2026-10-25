// llm.mjs — OPTIONAL LLM judgment, consulted ONLY for genuinely ambiguous routing
// (the deterministic router decides every clear case; the rule wins when it serves).
//
// Account isolation: this uses the official Anthropic SDK with ONLY the hackathon's
// own ANTHROPIC_API_KEY from the environment. No shared credential, no Claude Code /
// `ant` profile, no session account. No key set, or SDK not installed, or any error
// -> returns null, and the caller falls back to the deterministic decision.
//
// Enable:  npm i @anthropic-ai/sdk   and set ANTHROPIC_API_KEY in your own .env
const MODEL = process.env.PYLOT_LLM_MODEL ?? 'claude-opus-4-8';

export async function judgeRail({ recipient, factors }) {
  if (!process.env.ANTHROPIC_API_KEY) return null;         // no key -> deterministic fallback
  let Anthropic;
  try { ({ default: Anthropic } = await import('@anthropic-ai/sdk')); }
  catch { return null; }                                   // SDK absent -> deterministic fallback

  try {
    const client = new Anthropic();                        // reads ANTHROPIC_API_KEY only
    const prompt =
      'You are a cross-border payouts routing analyst. A payout can settle on ' +
      '"fiat" (a conventional PayPal payout) or "pyusd" (PYUSD stablecoin, on-chain). ' +
      'Pick the better rail for this recipient and justify it in one sentence.\n\n' +
      `Recipient: ${JSON.stringify(recipient)}\n` +
      `Cost/speed estimates (ESTIMATES, not PayPal quotes): ${JSON.stringify(factors)}\n\n` +
      'Respond with ONLY a JSON object: {"rail":"fiat"|"pyusd","reasoning":"..."}';
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      // Structured outputs: constrain the reply to exactly this schema (guaranteed-valid
      // JSON, not a best-effort regex parse). Supported on claude-opus-4-8.
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['rail', 'reasoning'],
            properties: {
              rail: { type: 'string', enum: ['fiat', 'pyusd'] },
              reasoning: { type: 'string' },
            },
          },
        },
      },
      messages: [{ role: 'user', content: prompt }],
    });
    const text = (res.content ?? []).map((b) => (b.type === 'text' ? b.text : '')).join('');
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const out = JSON.parse(match[0]);
    if (out.rail !== 'fiat' && out.rail !== 'pyusd') return null;
    return { rail: out.rail, reasoning: String(out.reasoning ?? 'LLM judgment') };
  } catch {
    return null;                                           // API / parse error -> deterministic fallback
  }
}
