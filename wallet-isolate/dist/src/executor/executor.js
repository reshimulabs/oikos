/**
 * Proposal Executor — THE SINGLE CODE PATH THAT MOVES FUNDS.
 *
 * Flow: evaluate policy -> if approved -> execute operation -> log result
 *
 * Handles all proposal types: payment, rgb_issue, rgb_transfer.
 *
 * @security This is the most critical module in the entire system.
 * A rejected proposal MUST NEVER result in a signed transaction.
 * This invariant is the #1 test target.
 *
 * The executor does NOT retry failed operations.
 * The Brain may submit a new proposal if it wants to retry.
 */
export class ProposalExecutor {
    policy;
    wallet;
    audit;
    constructor(policy, wallet, audit) {
        this.policy = policy;
        this.wallet = wallet;
        this.audit = audit;
    }
    /**
     * Process any proposal through the full pipeline:
     * 1. Log receipt
     * 2. Evaluate policy
     * 3. If rejected -> log enforcement, return rejection
     * 4. If approved -> execute operation
     * 5. Log success or failure
     * 6. If success -> record in policy state
     *
     * @security A rejected proposal NEVER reaches step 4.
     */
    async execute(proposalType, proposal, source) {
        // Step 1: Log receipt
        this.audit.logProposalReceived(proposal, proposalType, source);
        // Step 2: Evaluate policy
        const evaluation = this.policy.evaluate(proposal);
        // Step 3: If rejected, stop here. NEVER proceed to execution.
        if (!evaluation.approved) {
            this.audit.logPolicyEnforcement(proposal, evaluation.violations, proposalType, source);
            return {
                status: 'rejected',
                proposalType,
                proposal,
                violations: evaluation.violations,
                timestamp: Date.now()
            };
        }
        // Step 4: Approved — execute the operation
        const result = await this.executeOperation(proposalType, proposal);
        // Step 5: Log result
        if (result.success && result.txHash) {
            this.audit.logExecutionSuccess(proposal, result.txHash, proposalType, source);
            // Step 6: Record in policy state (for budget tracking)
            this.policy.recordExecution(proposal);
            return {
                status: 'executed',
                proposalType,
                proposal,
                violations: [],
                txHash: result.txHash,
                timestamp: Date.now()
            };
        }
        else {
            this.audit.logExecutionFailure(proposal, result.error ?? 'Unknown error', proposalType, source);
            return {
                status: 'failed',
                proposalType,
                proposal,
                violations: [],
                error: result.error,
                timestamp: Date.now()
            };
        }
    }
    /** Route to the appropriate wallet operation based on proposal type. */
    async executeOperation(proposalType, proposal) {
        switch (proposalType) {
            case 'payment': {
                const p = proposal;
                return this.wallet.sendTransaction(p.chain, p.to, BigInt(p.amount), p.symbol);
            }
            case 'rgb_issue': {
                const p = proposal;
                return this.wallet.rgbIssueAsset(p.ticker, p.name, BigInt(p.amount), p.precision);
            }
            case 'rgb_transfer': {
                const p = proposal;
                return this.wallet.rgbTransfer(p.invoice, BigInt(p.amount), p.symbol);
            }
            default:
                return { success: false, error: `Unknown proposal type: ${proposalType}` };
        }
    }
}
// Re-export for backward compatibility
export { ProposalExecutor as PaymentExecutor };
//# sourceMappingURL=executor.js.map