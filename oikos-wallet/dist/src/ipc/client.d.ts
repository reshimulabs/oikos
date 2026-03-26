/**
 * IPC Client — Gateway's interface to the Wallet Isolate.
 *
 * Spawns the wallet-isolate as a child process (via Bare Runtime)
 * and communicates over stdin/stdout JSON-lines.
 *
 * @security The Gateway NEVER sees seed phrases. It sends structured
 * requests and receives structured responses. Period.
 */
import type { PaymentProposal, RGBIssueProposal, RGBTransferProposal, RGBAssetInfo, ProposalCommon, ProposalSource, ExecutionResult, BalanceResponse, AddressResponse, PolicyStatus, PolicyCheckResult } from './types.js';
/**
 * Spawns and manages IPC communication with the wallet-isolate process.
 */
export declare class WalletIPCClient {
    private child;
    private pending;
    private buffer;
    private running;
    /** Timeout for IPC requests in ms */
    private readonly requestTimeoutMs;
    /** Event listeners for connection state */
    private onDisconnectHandler;
    /**
     * Spawn the wallet-isolate process.
     *
     * @param entryPath Path to the wallet-isolate dist/src/main.js
     * @param runtime 'bare' for Bare Runtime, 'node' for Node.js (testing)
     * @param env Environment variables to pass to the child process
     */
    start(entryPath: string, runtime: 'bare' | 'node', env: Record<string, string>): void;
    /** Register a disconnect handler */
    onDisconnect(handler: (error?: string) => void): void;
    /** Check if the wallet process is running */
    isRunning(): boolean;
    /** Stop the wallet process */
    stop(): void;
    /** Propose a payment to the wallet for policy evaluation and execution */
    proposePayment(proposal: PaymentProposal, source?: ProposalSource): Promise<ExecutionResult>;
    /**
     * Universal entry point for external proposal sources.
     * Routes to the appropriate propose method with source attribution.
     * Used by companion channel and swarm negotiation.
     */
    proposalFromExternal(source: ProposalSource, _type: 'payment', proposal: ProposalCommon): Promise<ExecutionResult>;
    /** Query balance for a specific chain and token */
    queryBalance(chain: string, symbol: string): Promise<BalanceResponse>;
    /** Query all balances across all chains and assets */
    queryBalanceAll(): Promise<BalanceResponse[]>;
    /** Query wallet address for a specific chain */
    queryAddress(chain: string): Promise<AddressResponse>;
    /** Query current policy status */
    queryPolicy(): Promise<PolicyStatus[]>;
    /** Query audit log entries */
    queryAudit(limit?: number, since?: string): Promise<unknown[]>;
    /** Simulate a proposal against the policy engine without executing or burning cooldown. */
    simulateProposal(proposal: ProposalCommon): Promise<PolicyCheckResult>;
    /** Propose issuing a new RGB asset. */
    proposeRGBIssue(proposal: RGBIssueProposal, source?: ProposalSource): Promise<ExecutionResult>;
    /** Propose transferring an RGB asset via invoice. */
    proposeRGBTransfer(proposal: RGBTransferProposal, source?: ProposalSource): Promise<ExecutionResult>;
    /** Query all RGB assets with balances. */
    queryRGBAssets(): Promise<RGBAssetInfo[]>;
    /** Query Spark wallet balance in satoshis. */
    querySparkBalance(): Promise<{
        chain: string;
        symbol: string;
        balanceSats: number;
        formatted: string;
    }>;
    /** Query Spark address — routes through standard query_address with chain='spark'. */
    querySparkAddress(type?: string): Promise<{
        chain: string;
        address: string;
        type: string;
    }>;
    /** Propose sending sats via Spark. Routes through standard propose_payment with chain='spark'. */
    proposeSparkSend(proposal: Record<string, unknown>, source?: ProposalSource): Promise<ExecutionResult>;
    /** Create a Lightning invoice for receiving — uses dedicated IPC message. */
    querySparkCreateInvoice(amountSats?: number, memo?: string): Promise<{
        invoice: string;
        id: string;
        amountSats: number;
        memo?: string;
    }>;
    /** Pay a Lightning invoice via Spark — uses dedicated IPC message. */
    proposeSparkPayInvoice(proposal: Record<string, unknown>, _source?: ProposalSource): Promise<ExecutionResult>;
    /** Query Spark transfer history. */
    querySparkTransfers(direction?: 'incoming' | 'outgoing' | 'all', limit?: number): Promise<unknown[]>;
    private send;
    private processBuffer;
}
//# sourceMappingURL=client.d.ts.map