/**
 * Payment Executor — THE SINGLE CODE PATH THAT MOVES FUNDS.
 *
 * Flow: evaluate policy → if approved → send transaction → log result
 *
 * @security This is the most critical module in the entire system.
 * A rejected proposal MUST NEVER result in a signed transaction.
 * This invariant is the #1 test target.
 *
 * The executor does NOT retry failed transactions.
 * The Brain may submit a new proposal if it wants to retry.
 */

import type { PaymentProposal, ExecutionResult } from '../ipc/types.js';
import type { PolicyEngine } from '../policies/engine.js';
import type { WalletOperations } from '../wallet/types.js';
import type { AuditLog } from '../audit/log.js';

export class PaymentExecutor {
  private readonly policy: PolicyEngine;
  private readonly wallet: WalletOperations;
  private readonly audit: AuditLog;

  constructor(policy: PolicyEngine, wallet: WalletOperations, audit: AuditLog) {
    this.policy = policy;
    this.wallet = wallet;
    this.audit = audit;
  }

  /**
   * Process a payment proposal through the full pipeline:
   * 1. Log receipt
   * 2. Evaluate policy
   * 3. If rejected → log enforcement, return rejection
   * 4. If approved → execute transaction
   * 5. Log success or failure
   * 6. If success → record in policy state
   *
   * @security A rejected proposal NEVER reaches step 4.
   */
  async execute(proposal: PaymentProposal): Promise<ExecutionResult> {
    // Step 1: Log receipt
    this.audit.logProposalReceived(proposal);

    // Step 2: Evaluate policy
    const evaluation = this.policy.evaluate(proposal);

    // Step 3: If rejected, stop here. NEVER proceed to signing.
    if (!evaluation.approved) {
      this.audit.logPolicyEnforcement(proposal, evaluation.violations);
      return {
        status: 'rejected',
        proposal,
        violations: evaluation.violations,
        timestamp: Date.now()
      };
    }

    // Step 4: Approved — execute the transaction
    const result = await this.wallet.sendTransaction(
      proposal.chain,
      proposal.to,
      BigInt(proposal.amount),
      proposal.symbol
    );

    // Step 5: Log result
    if (result.success && result.txHash) {
      this.audit.logExecutionSuccess(proposal, result.txHash);

      // Step 6: Record in policy state (for budget tracking)
      this.policy.recordExecution(proposal);

      return {
        status: 'executed',
        proposal,
        violations: [],
        txHash: result.txHash,
        timestamp: Date.now()
      };
    } else {
      this.audit.logExecutionFailure(proposal, result.error ?? 'Unknown error');
      return {
        status: 'failed',
        proposal,
        violations: [],
        error: result.error,
        timestamp: Date.now()
      };
    }
  }
}
