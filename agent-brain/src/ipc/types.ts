/**
 * IPC types — shared between Brain and Wallet Isolate.
 *
 * These types mirror the wallet-isolate types. In production,
 * these would be a shared package. For the hackathon, we
 * duplicate the minimal set needed.
 */

export type TokenSymbol = 'USDT' | 'XAUT' | 'BTC';
export type Chain = 'ethereum' | 'polygon' | 'bitcoin';

/** Brain → Wallet: propose a payment */
export interface PaymentProposal {
  to: string;
  amount: string;
  symbol: TokenSymbol;
  chain: Chain;
  reason: string;
  confidence: number;
  strategy: string;
  timestamp: number;
}

/** Brain → Wallet: query balance */
export interface BalanceQuery {
  chain: Chain;
  symbol: TokenSymbol;
}

/** Brain → Wallet: query address */
export interface AddressQuery {
  chain: Chain;
}

/** Brain → Wallet: query audit */
export interface AuditQuery {
  limit?: number;
  since?: string;
}

/** Wallet → Brain: execution result */
export interface ExecutionResult {
  status: 'executed' | 'rejected' | 'failed';
  proposal: PaymentProposal;
  violations: string[];
  txHash?: string;
  error?: string;
  timestamp: number;
}

/** Wallet → Brain: balance response */
export interface BalanceResponse {
  chain: Chain;
  symbol: TokenSymbol;
  balance: string;
  formatted: string;
}

/** Wallet → Brain: address response */
export interface AddressResponse {
  chain: Chain;
  address: string;
}

/** Wallet → Brain: policy status */
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

/** IPC request envelope */
export interface IPCRequest {
  id: string;
  type: 'propose_payment' | 'query_balance' | 'query_address' | 'query_policy' | 'query_audit';
  payload: PaymentProposal | BalanceQuery | AddressQuery | Record<string, unknown> | AuditQuery;
}

/** IPC response envelope */
export interface IPCResponse {
  id: string;
  type: 'execution_result' | 'balance' | 'address' | 'policy_status' | 'audit_entries' | 'error';
  payload: ExecutionResult | BalanceResponse | AddressResponse | { policies: PolicyStatus[] } | { entries: unknown[] } | { message: string };
}
