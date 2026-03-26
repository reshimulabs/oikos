/**
 * IPC types — shared contract between Gateway and Wallet Isolate.
 *
 * These types define the structured messages exchanged over
 * stdin/stdout JSON-lines between the Gateway (or Brain) and
 * the Wallet Isolate process.
 */

// ── Symbols & Chains ──

export type TokenSymbol = 'USDT' | 'BTC' | 'RGB';
export type Chain = 'bitcoin' | 'rgb' | 'spark';

/** Source of a proposal — used for audit trail attribution */
export type ProposalSource = 'llm' | 'companion' | 'swarm' | 'mcp';

// ── Proposal Types (Gateway → Wallet) ──

/** Common fields shared by all proposal types. */
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

// ── Query Types ──

export interface BalanceQuery {
  chain: Chain;
  symbol: TokenSymbol;
}

export interface AddressQuery {
  chain: Chain;
}

export interface AuditQuery {
  limit?: number;
  since?: string;
}

// ── Response Types (Wallet → Gateway) ──

/** Execution result from the wallet */
export interface ExecutionResult {
  status: 'executed' | 'rejected' | 'failed';
  proposalType: string;
  proposal: ProposalCommon;
  violations: string[];
  txHash?: string;
  error?: string;
  timestamp: number;
}

/** Balance response from the wallet */
export interface BalanceResponse {
  chain: Chain;
  symbol: TokenSymbol;
  balance: string;
  formatted: string;
}

/** Address response from the wallet */
export interface AddressResponse {
  chain: Chain;
  address: string;
}

/** Policy status from the wallet */
export interface PolicyStatus {
  id: string;
  name: string;
  state: {
    sessionTotals: Record<string, string>;
    dayTotals: Record<string, string>;
    lastTransactionTime: number;
    currentDay: string;
  };
}

// ── IPC Envelopes ──

export type IPCRequestType =
  | 'propose_payment'
  | 'propose_rgb_issue'
  | 'propose_rgb_transfer'
  | 'query_balance'
  | 'query_balance_all'
  | 'query_address'
  | 'query_policy'
  | 'query_audit'
  | 'query_rgb_assets'
  | 'query_policy_check'
  | 'spark_create_invoice'
  | 'spark_pay_invoice'
  | 'spark_deposit_address';

export interface IPCRequest {
  id: string;
  type: IPCRequestType;
  source?: ProposalSource;
  payload: PaymentProposal
    | RGBIssueProposal | RGBTransferProposal
    | BalanceQuery | AddressQuery | Record<string, unknown> | AuditQuery;
}

/** Dry-run policy check result — evaluate without executing or recording */
export interface PolicyCheckResult {
  wouldApprove: boolean;
  violations: string[];
  policyId: string;
}

export interface IPCResponse {
  id: string;
  type: 'execution_result' | 'balance' | 'balance_all' | 'address' | 'policy_status' | 'audit_entries' | 'rgb_assets' | 'policy_check' | 'error';
  payload: ExecutionResult | BalanceResponse | BalanceResponse[]
    | AddressResponse | { policies: PolicyStatus[] } | { entries: unknown[] } | { message: string }
    | RGBAssetInfo[] | PolicyCheckResult;
}
