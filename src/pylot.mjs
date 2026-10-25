// pylot.mjs — orchestrator. For each obligation: decide the rail, execute on it
// (or escalate above the approval threshold), and log reasoning + outcome to the ledger.
import { route } from './brain.mjs';
import { record } from './ledger.mjs';
import { createInvoice } from './rails/paypalInvoicing.mjs';
import { sendFiatPayout } from './rails/paypalPayouts.mjs';
import { sendPyusdPayout } from './rails/pyusdChain.mjs';

export async function payBatch(batch, policy = {}, opts = {}) {
  const { dryRun = true, approvals = {}, useLlm, invoice = true } = opts;
  const results = [];

  // Originate the obligation via PayPal Invoicing (native Agent Toolkit capability).
  let invoiceId = null;
  if (invoice) {
    const inv = await createInvoice({ label: batch.label, recipients: batch.recipients }, { dryRun });
    invoiceId = inv.invoiceId;
    results.push(record({
      event: 'INVOICED', batch: batch.label, invoiceId, amountUsd: inv.total, status: inv.status,
    }));
  }

  for (const recipient of batch.recipients) {
    const decision = await route(recipient, policy, { useLlm });

    if (decision.requiresApproval && !approvals[recipient.id]) {
      results.push(record({
        event: 'ESCALATED', batch: batch.label, recipient: recipient.id, invoiceId,
        rail: decision.rail, amountUsd: recipient.amountUsd,
        estimatedCostUsd: decision.estimatedCostUsd,
        altFiatCostUsd: decision.factors.fiat.estimatedCostUsd,
        altFiatEtaHours: decision.factors.fiat.etaHours,
        reasoning: decision.reasoning, decidedBy: decision.decidedBy, status: 'AWAITING_APPROVAL',
      }));
      continue;
    }

    let exec;
    try {
      exec = decision.rail === 'pyusd'
        ? await sendPyusdPayout({ recipient, amountUsd: recipient.amountUsd }, { dryRun })
        : await sendFiatPayout({ recipient, amountUsd: recipient.amountUsd }, { dryRun });
    } catch (e) {
      exec = { ok: false, status: 'ERROR', ref: null, reason: e.message };
    }

    results.push(record({
      event: exec.ok ? 'PAID' : 'FAILED', batch: batch.label, recipient: recipient.id, invoiceId,
      rail: decision.rail, amountUsd: recipient.amountUsd,
      estimatedCostUsd: decision.estimatedCostUsd, etaHours: decision.etaHours,
      altFiatCostUsd: decision.factors.fiat.estimatedCostUsd,
      altFiatEtaHours: decision.factors.fiat.etaHours,
      reasoning: decision.reasoning, decidedBy: decision.decidedBy,
      status: exec.status, ref: exec.ref,
      ...(exec.reason ? { detail: exec.reason } : {}),
    }));
  }
  return results;
}
