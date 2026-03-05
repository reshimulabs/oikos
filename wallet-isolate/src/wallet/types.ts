/**
 * Wallet Types
 *
 * Abstracts WDK wallet operations behind a clean interface.
 * This keeps the rest of the codebase decoupled from WDK internals.
 */

import type { Chain, TokenSymbol } from '../ipc/types.js';

export interface ChainConfig {
  chain: Chain;
  provider?: string;     // RPC URL for EVM chains
  network?: string;      // 'testnet' | 'mainnet' for BTC
  host?: string;         // Electrum host for BTC
  port?: number;         // Electrum port for BTC
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

  /**
   * Send a transaction.
   * @security This is the ONLY function that moves funds.
   */
  sendTransaction(chain: Chain, to: string, amount: bigint, symbol: TokenSymbol): Promise<TransactionResult>;
}
