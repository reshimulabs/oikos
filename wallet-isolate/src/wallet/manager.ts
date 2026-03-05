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
 * Provides getAddress, getBalance, and sendTransaction.
 */
export class WalletManager implements WalletOperations {
  private wdk: unknown = null;
  private initialized = false;

  /**
   * Initialize the wallet.
   * @security Seed is consumed here and NEVER stored or exposed.
   */
  async initialize(seed: string, chains: ChainConfig[]): Promise<void> {
    if (this.initialized) {
      throw new Error('WalletManager already initialized');
    }

    // Dynamic import — WDK may need Bare-specific loading
    const { default: WDK } = await import('@tetherto/wdk');

    const wdk = new WDK(seed);

    for (const config of chains) {
      if (config.chain === 'ethereum' || config.chain === 'polygon') {
        const { default: WalletManagerEvm } = await import('@tetherto/wdk-wallet-evm');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WDK registerWallet has loose typing
        (wdk as any).registerWallet(config.chain, WalletManagerEvm, {
          provider: config.provider
        });
      } else if (config.chain === 'bitcoin') {
        const { default: WalletManagerBtc } = await import('@tetherto/wdk-wallet-btc');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WDK registerWallet has loose typing
        (wdk as any).registerWallet(config.chain, WalletManagerBtc, {
          network: config.network,
          host: config.host,
          port: config.port
        });
      }
    }

    this.wdk = wdk;
    this.initialized = true;
  }

  async getAddress(chain: Chain): Promise<string> {
    this.ensureInitialized();
    const wdk = this.wdk as { getAccount: (chain: string, index: number) => Promise<{ getAddress: () => Promise<string> }> };
    const account = await wdk.getAccount(chain, 0);
    return account.getAddress();
  }

  async getBalance(chain: Chain, symbol: TokenSymbol): Promise<WalletBalance> {
    this.ensureInitialized();
    const wdk = this.wdk as { getAccount: (chain: string, index: number) => Promise<{ getBalance: () => Promise<bigint> }> };
    const account = await wdk.getAccount(chain, 0);
    const raw = await account.getBalance();
    const formatted = this.formatBalance(raw, symbol);
    return { chain, symbol, raw, formatted };
  }

  /**
   * @security THE SINGLE CODE PATH THAT MOVES FUNDS.
   * This must only be called from PaymentExecutor after policy approval.
   */
  async sendTransaction(chain: Chain, to: string, amount: bigint, _symbol: TokenSymbol): Promise<TransactionResult> {
    this.ensureInitialized();

    try {
      const wdk = this.wdk as {
        getAccount: (chain: string, index: number) => Promise<{
          sendTransaction: (opts: { to: string; value: bigint }) => Promise<{ hash: string }>
        }>
      };
      const account = await wdk.getAccount(chain, 0);
      const result = await account.sendTransaction({ to, value: amount });
      return { success: true, txHash: result.hash };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown transaction error';
      return { success: false, error: message };
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized || this.wdk === null) {
      throw new Error('WalletManager not initialized');
    }
  }

  private formatBalance(raw: bigint, symbol: TokenSymbol): string {
    const decimals = symbol === 'BTC' ? 8 : 6; // USDT/XAUT use 6
    const divisor = BigInt(10 ** decimals);
    const whole = raw / divisor;
    const fraction = raw % divisor;
    const fractionStr = fraction.toString().padStart(decimals, '0');
    return `${whole}.${fractionStr} ${symbol}`;
  }
}

/**
 * Mock Wallet Manager — for testing and demo without real WDK.
 * Returns predictable values, never touches a blockchain.
 */
export class MockWalletManager implements WalletOperations {
  private balances: Map<string, bigint> = new Map();
  private initialized = false;

  async initialize(_seed: string, chains: ChainConfig[]): Promise<void> {
    // Seed up mock balances
    for (const chain of chains) {
      this.balances.set(`${chain.chain}:USDT`, 100_000_000n); // 100 USDT
      this.balances.set(`${chain.chain}:BTC`, 10_000_000n);    // 0.1 BTC
      this.balances.set(`${chain.chain}:XAUT`, 1_000_000n);    // 1 XAUT
    }
    this.initialized = true;
  }

  async getAddress(chain: Chain): Promise<string> {
    this.ensureInit();
    if (chain === 'bitcoin') return 'tb1qmock000000000000000000000000000000dead';
    return '0xMOCK0000000000000000000000000000DEAD';
  }

  async getBalance(chain: Chain, symbol: TokenSymbol): Promise<WalletBalance> {
    this.ensureInit();
    const raw = this.balances.get(`${chain}:${symbol}`) ?? 0n;
    const decimals = symbol === 'BTC' ? 8 : 6;
    const divisor = BigInt(10 ** decimals);
    const whole = raw / divisor;
    const fraction = raw % divisor;
    return {
      chain,
      symbol,
      raw,
      formatted: `${whole}.${fraction.toString().padStart(decimals, '0')} ${symbol}`
    };
  }

  async sendTransaction(chain: Chain, _to: string, amount: bigint, symbol: TokenSymbol): Promise<TransactionResult> {
    this.ensureInit();
    const key = `${chain}:${symbol}`;
    const balance = this.balances.get(key) ?? 0n;
    if (amount > balance) {
      return { success: false, error: 'Insufficient mock balance' };
    }
    this.balances.set(key, balance - amount);
    const mockHash = `0xmock${Date.now().toString(16)}`;
    return { success: true, txHash: mockHash };
  }

  private ensureInit(): void {
    if (!this.initialized) throw new Error('MockWalletManager not initialized');
  }
}
