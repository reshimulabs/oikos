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

export type TokenSymbol = 'USDT' | 'BTC' | 'RGB';
export type Chain = 'bitcoin' | 'rgb' | 'spark';

/** Source of a proposal — used for audit trail attribution */
export type ProposalSource = 'llm' | 'companion' | 'swarm' | 'mcp';

// ── Proposal Types (Brain → Wallet) ──

/** Common fields shared by all proposal types. PolicyEngine evaluates these. */
export interface ProposalCommon {
  amount: string;         // BigInt as string for JSON serialization
  symbol: TokenSymbol;    // Primary asset being spent/moved
  chain: Chain;           // Execution chain
  reason: string;         // Why this proposal (logged in audit)
  confidence: number;     // 0.0–1.0 (LLM confidence)
  strategy: string;       // Strategy name from agent
  timestamp: number;      // Epoch ms
  counterpartyTier?: number; // RGB-A tier (0-4) of counterparty, set by oikos-wallet before IPC
}

/** Send tokens to a recipient address */
export interface PaymentProposal extends ProposalCommon {
  to: string;             // Recipient address
}

/** Issue a new RGB asset on Bitcoin */
export interface RGBIssueProposal extends ProposalCommon {
  ticker: string;       // e.g., "OTKN"
  name: string;         // e.g., "Oikos Token"
  precision: number;    // decimal places (e.g., 6)
}

/** Transfer an RGB asset via invoice */
export interface RGBTransferProposal extends ProposalCommon {
  invoice: string;      // RGB invoice string from receiver
}

/** RGB asset info returned by query_rgb_assets */
export interface RGBAssetInfo {
  assetId: string;
  ticker: string;
  name: string;
  precision: number;
  balance: string;      // smallest-unit string
}

/** Discriminated union of all proposal types */
export type AnyProposal = PaymentProposal | RGBIssueProposal | RGBTransferProposal;

// ── Query Types (Brain → Wallet) ──

export interface BalanceQuery {
  chain: Chain;
  symbol: TokenSymbol;
}

export interface BalanceAllQuery {
  // No fields — returns all balances across all chains/assets
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

// ── IPC Request Envelope ──

// ── Spark/Lightning Query Types ──

export interface SparkInvoiceRequest {
  amountSats?: number;
  memo?: string;
}

export interface SparkPayInvoiceRequest {
  encodedInvoice: string;
  maxFeeSats?: number;
}

/** RGB-A keypair storage payload (Brain → Wallet) */
export interface StoreRgbAKeypairPayload {
  publicKey: string;   // hex-encoded Ed25519 public key
  secretKey: string;   // hex-encoded Ed25519 secret key
}

/** RGB-A keypair load payload (Brain → Wallet) — no fields needed */
export interface LoadRgbAKeypairPayload {}

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
  | 'query_rgb_balance'
  | 'query_policy_check'
  | 'spark_create_invoice'
  | 'spark_pay_invoice'
  | 'spark_deposit_address'
  | 'spark_get_transfers'
  | 'store_rgb_a_keypair'
  | 'load_rgb_a_keypair';

/** Dry-run policy check result — evaluate without executing or recording */
export interface PolicyCheckResult {
  wouldApprove: boolean;
  violations: string[];
  policyId: string;
}

export interface IPCRequest {
  id: string;
  type: IPCRequestType;
  source?: ProposalSource; // Origin of the proposal (for audit trail)
  payload: PaymentProposal
    | RGBIssueProposal | RGBTransferProposal
    | BalanceQuery | BalanceAllQuery | AddressQuery | PolicyQuery | AuditQuery
    | SparkInvoiceRequest | SparkPayInvoiceRequest
    | StoreRgbAKeypairPayload | LoadRgbAKeypairPayload
    | Record<string, unknown>;
}

// ── Wallet → Brain Responses ──

export interface ExecutionResult {
  status: 'executed' | 'rejected' | 'failed';
  proposalType: string;   // 'payment' | 'rgb_issue' | 'rgb_transfer'
  proposal: ProposalCommon;
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

/** RGB-A keypair response (Wallet → Brain) */
export interface RgbAKeypairResponse {
  publicKey: string;  // hex
  secretKey: string;  // hex
}

export type IPCResponseType =
  | 'execution_result'
  | 'balance'
  | 'balance_all'
  | 'address'
  | 'policy_status'
  | 'audit_entries'
  | 'rgb_assets'
  | 'rgb_balance'
  | 'policy_check'
  | 'spark_invoice'
  | 'spark_pay_result'
  | 'spark_deposit'
  | 'spark_transfers'
  | 'rgb_a_keypair'
  | 'error';

export interface IPCResponse {
  id: string;
  type: IPCResponseType;
  payload:
    | ExecutionResult
    | BalanceResponse
    | BalanceResponse[]
    | AddressResponse
    | PolicyStatusResponse
    | AuditEntryResponse
    | RGBAssetInfo[]
    | PolicyCheckResult
    | RgbAKeypairResponse
    | Record<string, unknown>  // Spark and extensible responses
    | { message: string };
}

// ── Audit Entry ──

export interface AuditEntry {
  id: string;
  timestamp: string; // ISO 8601
  type: 'proposal_received' | 'policy_enforcement' | 'execution_success' | 'execution_failure' | 'malformed_message' | 'identity_operation' | 'incoming_transfer';
  proposalType?: string;  // 'payment' | 'rgb_issue' | 'rgb_transfer'
  source?: ProposalSource;
  proposal?: ProposalCommon;
  violations?: string[];
  txHash?: string;
  error?: string;
  // Incoming transfer fields (for type='incoming_transfer')
  transferId?: string;
  senderPublicKey?: string;
  amount?: number;       // satoshis
  transferType?: string; // TRANSFER, PREIMAGE_SWAP, etc.
  direction?: string;    // 'incoming'
}

// ── Validation ──

const VALID_SYMBOLS: ReadonlySet<string> = new Set(['USDT', 'BTC', 'RGB']);
const VALID_CHAINS: ReadonlySet<string> = new Set(['bitcoin', 'rgb', 'spark']);
const VALID_REQUEST_TYPES: ReadonlySet<string> = new Set([
  'propose_payment',
  'propose_rgb_issue', 'propose_rgb_transfer',
  'query_balance', 'query_balance_all', 'query_address', 'query_policy', 'query_audit',
  'query_rgb_assets', 'query_rgb_balance', 'query_policy_check',
  'spark_create_invoice', 'spark_pay_invoice', 'spark_deposit_address', 'spark_get_transfers',
  'store_rgb_a_keypair', 'load_rgb_a_keypair',
]);

export function isValidTokenSymbol(value: unknown): value is TokenSymbol {
  return typeof value === 'string' && VALID_SYMBOLS.has(value);
}

export function isValidChain(value: unknown): value is Chain {
  return typeof value === 'string' && VALID_CHAINS.has(value);
}

/** Extract counterparty from any proposal type (for whitelist evaluation) */
export function getCounterparty(proposal: ProposalCommon): string | undefined {
  if ('to' in proposal) return (proposal as PaymentProposal).to;
  return undefined;
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
    case 'propose_rgb_issue':
      if (!validateRGBIssueProposal(payload)) return null;
      break;
    case 'propose_rgb_transfer':
      if (!validateRGBTransferProposal(payload)) return null;
      break;
    case 'query_rgb_assets':
    case 'query_rgb_balance':
      break; // No payload validation needed (optional assetId filter)
    case 'query_policy_check':
      // Dry-run: validate that the payload is a valid proposal (any type)
      if (!validateProposalCommon(payload)) return null;
      break;
    case 'query_balance':
      if (!isValidChain(payload['chain']) || !isValidTokenSymbol(payload['symbol'])) return null;
      break;
    case 'query_balance_all':
      break; // No payload validation needed
    case 'query_address':
      if (!isValidChain(payload['chain'])) return null;
      break;
    case 'query_policy':
    case 'query_audit':
      break; // Optional fields only
    case 'store_rgb_a_keypair':
      if (typeof payload['publicKey'] !== 'string' || !/^[0-9a-f]{64}$/i.test(payload['publicKey'] as string)) return null;
      if (typeof payload['secretKey'] !== 'string' || !/^[0-9a-f]{128}$/i.test(payload['secretKey'] as string)) return null;
      break;
    case 'load_rgb_a_keypair':
      break; // No payload validation needed
  }

  // Extract optional source field from envelope
  const source = typeof obj['source'] === 'string' ? obj['source'] : undefined;

  return {
    id: obj['id'] as string,
    type,
    source: source as ProposalSource | undefined,
    payload: payload as IPCRequest['payload'],
  };
}

/** Validate fields common to all proposals (amount, symbol, chain, confidence, etc.) */
function validateProposalCommon(obj: Record<string, unknown>): boolean {
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

function validatePaymentProposal(obj: Record<string, unknown>): boolean {
  if (typeof obj['to'] !== 'string' || obj['to'].length === 0) return false;
  return validateProposalCommon(obj);
}

function validateRGBIssueProposal(obj: Record<string, unknown>): boolean {
  if (typeof obj['ticker'] !== 'string' || obj['ticker'].length === 0) return false;
  if (typeof obj['name'] !== 'string' || obj['name'].length === 0) return false;
  if (typeof obj['precision'] !== 'number' || obj['precision'] < 0 || obj['precision'] > 18) return false;
  return validateProposalCommon(obj);
}

function validateRGBTransferProposal(obj: Record<string, unknown>): boolean {
  if (typeof obj['invoice'] !== 'string' || obj['invoice'].length === 0) return false;
  return validateProposalCommon(obj);
}

