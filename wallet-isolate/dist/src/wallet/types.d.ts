/**
 * Wallet Types
 *
 * Abstracts WDK wallet operations behind a clean interface.
 * This keeps the rest of the codebase decoupled from WDK internals.
 */
import type { Chain, TokenSymbol } from '../ipc/types.js';
export interface ChainConfig {
    chain: Chain;
    provider?: string;
    network?: string;
    host?: string;
    port?: number;
    indexerUrl?: string;
    transportEndpoint?: string;
    dataDir?: string;
    sparkScanApiKey?: string;
}
export interface WalletBalance {
    chain: Chain;
    symbol: TokenSymbol;
    raw: bigint;
    formatted: string;
}
export interface TransactionResult {
    success: boolean;
    txHash?: string;
    error?: string;
}
export interface WalletOperations {
    /** Initialize the wallet with a seed phrase and register chains. */
    initialize(seed: string, chains: ChainConfig[]): Promise<void>;
    /** Get the wallet address for a chain. */
    getAddress(chain: Chain): Promise<string>;
    /** Get the balance for a chain and token. */
    getBalance(chain: Chain, symbol: TokenSymbol): Promise<WalletBalance>;
    /** Get all balances across all chains and assets. */
    getBalances(): Promise<WalletBalance[]>;
    /**
     * Send a transaction.
     * @security This is the code path that moves funds for payments.
     */
    sendTransaction(chain: Chain, to: string, amount: bigint, symbol: TokenSymbol): Promise<TransactionResult>;
    /** Issue a new RGB asset with given ticker, name, supply, and precision. */
    rgbIssueAsset(ticker: string, name: string, supply: bigint, precision: number): Promise<TransactionResult & {
        assetId?: string;
    }>;
    /** Transfer an RGB asset to a receiver via invoice. */
    rgbTransfer(invoice: string, amount: bigint, assetId: string): Promise<TransactionResult>;
    /** Generate a receive invoice for incoming RGB transfers. */
    rgbReceiveAsset(assetId?: string): Promise<{
        invoice: string;
        recipientId: string;
    }>;
    /** List all RGB assets with balances. */
    rgbListAssets(): Promise<Array<{
        assetId: string;
        ticker: string;
        name: string;
        precision: number;
        balance: string;
    }>>;
}
//# sourceMappingURL=types.d.ts.map