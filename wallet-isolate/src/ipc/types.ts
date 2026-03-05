/**
 * IPC Protocol Types
 *
 * Defines the structured message format for communication between
 * the Agent Brain (Node.js) and Wallet Isolate (Bare Runtime).
 *
 * Messages are newline-delimited JSON over stdin/stdout.
 * Every request gets exactly one response, correlated by `id`.
 */

// ── Symbols & Chains ──

export type TokenSymbol = 'USDT' | 'BTC' | 'XAUT';
export type Chain = 'ethereum' | 'polygon' | 'bitcoin';

// ── Brain → Wallet Requests ──

export interface PaymentProposal {
  to: string;
  amount: string; // BigInt as string for JSON serialization
  symbol: TokenSymbol;
  chain: Chain;
  reason: string;
  confidence: number; // 0.0–1.0
  strategy: string;
  timestamp: number; // ISO epoch ms
}

export interface BalanceQuery {
  chain: Chain;
  symbol: TokenSymbol;
}

export interface AddressQuery {
  chain: Chain;
}

export interface PolicyQuery {
  policyId?: string; // If omitted, return all policy statuses
}

export interface AuditQuery {
  limit?: number;
  since?: number; // Epoch ms
}

export type IPCRequestType =
  | 'propose_payment'
  | 'query_balance'
  | 'query_address'
  | 'query_policy'
  | 'query_audit';

export interface IPCRequest {
  id: string;
  type: IPCRequestType;
  payload: PaymentProposal | BalanceQuery | AddressQuery | PolicyQuery | AuditQuery;
}

// ── Wallet → Brain Responses ──

export interface ExecutionResult {
  status: 'executed' | 'rejected' | 'failed';
  proposal: PaymentProposal;
  violations: string[];
  txHash?: string;
  error?: string;
  timestamp: number;
}

export interface BalanceResponse {
  chain: Chain;
  symbol: TokenSymbol;
  balance: string; // BigInt as string
  formatted: string; // Human-readable (e.g., "5.00 USDT")
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

export type IPCResponseType =
  | 'execution_result'
  | 'balance'
  | 'address'
  | 'policy_status'
  | 'audit_entries'
  | 'error';

export interface IPCResponse {
  id: string;
  type: IPCResponseType;
  payload:
    | ExecutionResult
    | BalanceResponse
    | AddressResponse
    | PolicyStatusResponse
    | AuditEntryResponse
    | { message: string };
}

// ── Audit Entry ──

export interface AuditEntry {
  id: string;
  timestamp: string; // ISO 8601
  type: 'proposal_received' | 'policy_enforcement' | 'execution_success' | 'execution_failure' | 'malformed_message';
  proposal?: PaymentProposal;
  violations?: string[];
  txHash?: string;
  error?: string;
}

// ── Validation ──

const VALID_SYMBOLS: ReadonlySet<string> = new Set(['USDT', 'BTC', 'XAUT']);
const VALID_CHAINS: ReadonlySet<string> = new Set(['ethereum', 'polygon', 'bitcoin']);
const VALID_REQUEST_TYPES: ReadonlySet<string> = new Set([
  'propose_payment', 'query_balance', 'query_address', 'query_policy', 'query_audit'
]);

export function isValidTokenSymbol(value: unknown): value is TokenSymbol {
  return typeof value === 'string' && VALID_SYMBOLS.has(value);
}

export function isValidChain(value: unknown): value is Chain {
  return typeof value === 'string' && VALID_CHAINS.has(value);
}

export function validateIPCRequest(raw: unknown): IPCRequest | null {
  if (typeof raw !== 'object' || raw === null) return null;

  const obj = raw as Record<string, unknown>;

  if (typeof obj['id'] !== 'string' || obj['id'].length === 0) return null;
  if (typeof obj['type'] !== 'string' || !VALID_REQUEST_TYPES.has(obj['type'])) return null;
  if (typeof obj['payload'] !== 'object' || obj['payload'] === null) return null;

  const type = obj['type'] as IPCRequestType;
  const payload = obj['payload'] as Record<string, unknown>;

  switch (type) {
    case 'propose_payment':
      if (!validatePaymentProposal(payload)) return null;
      break;
    case 'query_balance':
      if (!isValidChain(payload['chain']) || !isValidTokenSymbol(payload['symbol'])) return null;
      break;
    case 'query_address':
      if (!isValidChain(payload['chain'])) return null;
      break;
    case 'query_policy':
    case 'query_audit':
      break; // Optional fields only
  }

  return { id: obj['id'] as string, type, payload: payload as IPCRequest['payload'] };
}

function validatePaymentProposal(obj: Record<string, unknown>): boolean {
  if (typeof obj['to'] !== 'string' || obj['to'].length === 0) return false;
  if (typeof obj['amount'] !== 'string' || obj['amount'].length === 0) return false;
  if (!isValidTokenSymbol(obj['symbol'])) return false;
  if (!isValidChain(obj['chain'])) return false;
  if (typeof obj['reason'] !== 'string') return false;
  if (typeof obj['confidence'] !== 'number' || obj['confidence'] < 0 || obj['confidence'] > 1) return false;
  if (typeof obj['strategy'] !== 'string') return false;
  if (typeof obj['timestamp'] !== 'number') return false;

  // Validate amount is a valid non-negative integer string (BigInt)
  try {
    const val = BigInt(obj['amount']);
    if (val < 0n) return false;
  } catch {
    return false;
  }

  return true;
}
