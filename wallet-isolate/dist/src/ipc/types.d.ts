/**
 * IPC Protocol Types
 *
 * Defines the structured message format for communication between
 * the Agent Brain (Node.js) and Wallet Isolate (Bare Runtime).
 *
 * Messages are newline-delimited JSON over stdin/stdout.
 * Every request gets exactly one response, correlated by `id`.
 */
export type TokenSymbol = 'USDT' | 'BTC' | 'RGB';
export type Chain = 'bitcoin' | 'rgb' | 'spark';
/** Source of a proposal — used for audit trail attribution */
export type ProposalSource = 'llm' | 'companion' | 'swarm' | 'mcp';
/** Common fields shared by all proposal types. PolicyEngine evaluates these. */
export interface ProposalCommon {
    amount: string;
    symbol: TokenSymbol;
    chain: Chain;
    reason: string;
    confidence: number;
    strategy: string;
    timestamp: number;
}
/** Send tokens to a recipient address */
export interface PaymentProposal extends ProposalCommon {
    to: string;
}
/** Issue a new RGB asset on Bitcoin */
export interface RGBIssueProposal extends ProposalCommon {
    ticker: string;
    name: string;
    precision: number;
}
/** Transfer an RGB asset via invoice */
export interface RGBTransferProposal extends ProposalCommon {
    invoice: string;
}
/** RGB asset info returned by query_rgb_assets */
export interface RGBAssetInfo {
    assetId: string;
    ticker: string;
    name: string;
    precision: number;
    balance: string;
}
/** Discriminated union of all proposal types */
export type AnyProposal = PaymentProposal | RGBIssueProposal | RGBTransferProposal;
export interface BalanceQuery {
    chain: Chain;
    symbol: TokenSymbol;
}
export interface BalanceAllQuery {
}
export interface AddressQuery {
    chain: Chain;
}
export interface PolicyQuery {
    policyId?: string;
}
export interface AuditQuery {
    limit?: number;
    since?: number;
}
export interface SparkInvoiceRequest {
    amountSats?: number;
    memo?: string;
}
export interface SparkPayInvoiceRequest {
    encodedInvoice: string;
    maxFeeSats?: number;
}
export type IPCRequestType = 'propose_payment' | 'propose_rgb_issue' | 'propose_rgb_transfer' | 'query_balance' | 'query_balance_all' | 'query_address' | 'query_policy' | 'query_audit' | 'query_rgb_assets' | 'query_policy_check' | 'spark_create_invoice' | 'spark_pay_invoice' | 'spark_deposit_address' | 'spark_get_transfers';
/** Dry-run policy check result — evaluate without executing or recording */
export interface PolicyCheckResult {
    wouldApprove: boolean;
    violations: string[];
    policyId: string;
}
export interface IPCRequest {
    id: string;
    type: IPCRequestType;
    source?: ProposalSource;
    payload: PaymentProposal | RGBIssueProposal | RGBTransferProposal | BalanceQuery | BalanceAllQuery | AddressQuery | PolicyQuery | AuditQuery | SparkInvoiceRequest | SparkPayInvoiceRequest | Record<string, unknown>;
}
export interface ExecutionResult {
    status: 'executed' | 'rejected' | 'failed';
    proposalType: string;
    proposal: ProposalCommon;
    violations: string[];
    txHash?: string;
    error?: string;
    timestamp: number;
}
export interface BalanceResponse {
    chain: Chain;
    symbol: TokenSymbol;
    balance: string;
    formatted: string;
}
export interface AddressResponse {
    chain: Chain;
    address: string;
}
export interface PolicyStatusResponse {
    policies: Array<{
        id: string;
        name: string;
        state: Record<string, unknown>;
    }>;
}
export interface AuditEntryResponse {
    entries: AuditEntry[];
}
export type IPCResponseType = 'execution_result' | 'balance' | 'balance_all' | 'address' | 'policy_status' | 'audit_entries' | 'rgb_assets' | 'policy_check' | 'spark_invoice' | 'spark_pay_result' | 'spark_deposit' | 'spark_transfers' | 'error';
export interface IPCResponse {
    id: string;
    type: IPCResponseType;
    payload: ExecutionResult | BalanceResponse | BalanceResponse[] | AddressResponse | PolicyStatusResponse | AuditEntryResponse | RGBAssetInfo[] | PolicyCheckResult | Record<string, unknown> | {
        message: string;
    };
}
export interface AuditEntry {
    id: string;
    timestamp: string;
    type: 'proposal_received' | 'policy_enforcement' | 'execution_success' | 'execution_failure' | 'malformed_message' | 'identity_operation' | 'incoming_transfer';
    proposalType?: string;
    source?: ProposalSource;
    proposal?: ProposalCommon;
    violations?: string[];
    txHash?: string;
    error?: string;
    transferId?: string;
    senderPublicKey?: string;
    amount?: number;
    transferType?: string;
    direction?: string;
}
export declare function isValidTokenSymbol(value: unknown): value is TokenSymbol;
export declare function isValidChain(value: unknown): value is Chain;
/** Extract counterparty from any proposal type (for whitelist evaluation) */
export declare function getCounterparty(proposal: ProposalCommon): string | undefined;
export declare function validateIPCRequest(raw: unknown): IPCRequest | null;
//# sourceMappingURL=types.d.ts.map