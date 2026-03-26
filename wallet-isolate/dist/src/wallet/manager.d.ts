/**
 * Wallet Manager — WDK initialization and operations.
 *
 * THE ONLY MODULE THAT TOUCHES THE SEED PHRASE.
 * THE ONLY MODULE THAT INTERACTS WITH WDK.
 *
 * @security The seed phrase is passed to `new WDK(seed)` exactly once.
 * After initialization, no other module can access the seed.
 * This module NEVER logs, returns, or exposes the seed in any way.
 */
import type { Chain, TokenSymbol } from '../ipc/types.js';
import type { ChainConfig, WalletBalance, TransactionResult, WalletOperations } from './types.js';
/**
 * WDK Wallet Manager — real implementation using @tetherto/wdk.
 *
 * Initializes WDK with the seed phrase and registers chain wallets.
 * Provides getAddress, getBalance, sendTransaction for BTC + Spark.
 * RGB operations are stubbed until wdk-wallet-rgb is wired (Step 2).
 */
export declare class WalletManager implements WalletOperations {
    private wdk;
    private sparkManager;
    private sparkAccount;
    private sparkAddress;
    private initialized;
    /**
     * Initialize the wallet.
     * @security Seed is consumed here and NEVER stored or exposed.
     */
    initialize(seed: string, chains: ChainConfig[]): Promise<void>;
    getAddress(chain: Chain): Promise<string>;
    getBalance(chain: Chain, symbol: TokenSymbol): Promise<WalletBalance>;
    getBalances(): Promise<WalletBalance[]>;
    /**
     * @security THE CODE PATH THAT MOVES FUNDS FOR PAYMENTS.
     * This must only be called from ProposalExecutor after policy approval.
     */
    sendTransaction(chain: Chain, to: string, amount: bigint, symbol: TokenSymbol): Promise<TransactionResult>;
    rgbIssueAsset(_ticker: string, _name: string, _supply: bigint, _precision: number): Promise<TransactionResult & {
        assetId?: string;
    }>;
    rgbTransfer(_invoice: string, _amount: bigint, _assetId: string): Promise<TransactionResult>;
    rgbReceiveAsset(_assetId?: string): Promise<{
        invoice: string;
        recipientId: string;
    }>;
    rgbListAssets(): Promise<Array<{
        assetId: string;
        ticker: string;
        name: string;
        precision: number;
        balance: string;
    }>>;
    /** Create a Lightning invoice for receiving payments. */
    sparkCreateInvoice(amountSats?: number, memo?: string): Promise<{
        invoice: string;
        id: string;
        amountSats: number;
    }>;
    /** Pay a Lightning invoice. */
    sparkPayInvoice(encodedInvoice: string, maxFeeSats?: number): Promise<TransactionResult>;
    /** Get a deposit address for bridging BTC L1 → Spark L2. */
    sparkGetDepositAddress(): Promise<string>;
    /** Get Spark transfer history. */
    sparkGetTransfers(direction?: 'incoming' | 'outgoing' | 'all', limit?: number): Promise<unknown[]>;
    private getSparkAccount;
    private getAccount;
    private ensureInitialized;
}
/**
 * Mock Wallet Manager — for testing and demo without real WDK.
 * Returns predictable values, never touches a blockchain.
 */
export declare class MockWalletManager implements WalletOperations {
    private balances;
    private initialized;
    private mockRgbAssets;
    private nextRgbAssetId;
    initialize(_seed: string, chains: ChainConfig[]): Promise<void>;
    getAddress(chain: Chain): Promise<string>;
    sparkCreateInvoice(amountSats?: number, _memo?: string): Promise<{
        invoice: string;
        id: string;
        amountSats: number;
    }>;
    sparkPayInvoice(encodedInvoice: string, _maxFeeSats?: number): Promise<TransactionResult>;
    sparkGetDepositAddress(): Promise<string>;
    getBalance(chain: Chain, symbol: TokenSymbol): Promise<WalletBalance>;
    getBalances(): Promise<WalletBalance[]>;
    sendTransaction(chain: Chain, _to: string, amount: bigint, symbol: TokenSymbol): Promise<TransactionResult>;
    rgbIssueAsset(ticker: string, name: string, supply: bigint, precision: number): Promise<TransactionResult & {
        assetId?: string;
    }>;
    rgbTransfer(invoice: string, amount: bigint, assetId: string): Promise<TransactionResult>;
    rgbReceiveAsset(assetId?: string): Promise<{
        invoice: string;
        recipientId: string;
    }>;
    rgbListAssets(): Promise<Array<{
        assetId: string;
        ticker: string;
        name: string;
        precision: number;
        balance: string;
    }>>;
    private ensureInit;
}
//# sourceMappingURL=manager.d.ts.map