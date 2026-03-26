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
import type {
  ChainConfig, WalletBalance, TransactionResult, WalletOperations,
} from './types.js';

/** Decimals per token for formatting */
function getDecimals(symbol: TokenSymbol): number {
  switch (symbol) {
    case 'BTC': return 8;
    default: return 6; // USDT, RGB tokens
  }
}

/** Format raw balance to human-readable string */
function formatBalance(raw: bigint, symbol: TokenSymbol): string {
  const decimals = getDecimals(symbol);
  const divisor = BigInt(10 ** decimals);
  const whole = raw / divisor;
  const fraction = raw % divisor;
  const fractionStr = fraction.toString().padStart(decimals, '0');
  // Trim trailing zeros for readability, keep at least 2
  const trimmed = fractionStr.replace(/0+$/, '').padEnd(2, '0');
  return `${whole}.${trimmed} ${symbol}`;
}

// ── WDK Account Type Assertions ──
// WDK has loose runtime typing. These interfaces capture what we need.

interface WdkAccount {
  getAddress(): Promise<string>;
  getBalance(): Promise<bigint>;
  sendTransaction(tx: {
    to: string;
    value: number | bigint;
    data?: string;
    gasLimit?: number | bigint;
  }): Promise<{ hash: string; fee: bigint }>;
}

interface WdkInstance {
  getAccount(chain: string, index: number): Promise<WdkAccount>;
}

/** Spark account interface — ESM module, separate from WDK core */
interface SparkAccount {
  getAddress(): Promise<string>;
  getBalance(): Promise<bigint>;
  sendTransaction(tx: { to: string; value: number | bigint }): Promise<{ hash: string; fee: bigint }>;
  createLightningInvoice(opts: { amountSats?: number; memo?: string }): Promise<{ invoice: string; id: string; amountSats: number }>;
  payLightningInvoice(opts: { encodedInvoice: string; maxFeeSats?: number }): Promise<{ id: string; status: string }>;
  getSingleUseDepositAddress(): Promise<string>;
  getStaticDepositAddress(): Promise<string>;
  getTransfers(opts?: Record<string, unknown>): Promise<unknown[]>;
  dispose(): void;
}

interface SparkManager {
  getAccount(index?: number): Promise<SparkAccount>;
  dispose(): void;
}

/** RGB account interface — @utexo/wdk-wallet-rgb (WalletAccountRgb) */
interface RgbAccount {
  issueAssetNia(opts: { ticker: string; name: string; precision: number; amounts: number[] }): { assetId: string };
  transfer(opts: { token: string; recipient: string; amount: number | bigint; feeRate?: number; minConfirmations?: number }): Promise<{ txid?: string }>;
  receiveAsset(opts: { assetId?: string; amount: number; witness: boolean }): { invoice: string; recipientId?: string };
  listAssets(): Array<{ assetId?: string; ticker?: string; name?: string; precision?: number; balance?: { settled?: number } }>;
  refreshWallet(): void;
}

interface RgbManager {
  getAccount(index?: number): Promise<RgbAccount>;
}

/**
 * WDK Wallet Manager — real implementation using @tetherto/wdk.
 *
 * Initializes WDK with the seed phrase and registers chain wallets.
 * Provides getAddress, getBalance, sendTransaction for BTC + Spark.
 * RGB operations powered by @utexo/wdk-wallet-rgb (Spark-style init).
 */
export class WalletManager implements WalletOperations {
  private wdk: WdkInstance | null = null;
  private sparkManager: SparkManager | null = null;
  private sparkAccount: SparkAccount | null = null;
  private sparkAddress: string = '';
  private rgbManager: RgbManager | null = null;
  private rgbAccount: RgbAccount | null = null;
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
      if (config.chain === 'bitcoin') {
        const { default: WalletManagerBtc } = await import('@tetherto/wdk-wallet-btc');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WDK registerWallet has loose typing
        (wdk as any).registerWallet(config.chain, WalletManagerBtc, {
          network: config.network,
          host: config.host,
          port: config.port
        });
      } else if (config.chain === 'spark') {
        try {
          const { default: WalletManagerSpark } = await import('@tetherto/wdk-wallet-spark');
          const sparkConfig: Record<string, unknown> = {};
          if (config.network) sparkConfig.network = config.network;
          if (config.sparkScanApiKey) sparkConfig.sparkScanApiKey = config.sparkScanApiKey;
          this.sparkManager = new WalletManagerSpark(seed, sparkConfig) as unknown as SparkManager;
          try {
            this.sparkAccount = await this.sparkManager.getAccount(0);
            const rawAddr = await this.sparkAccount.getAddress();
            if (typeof rawAddr === 'string') this.sparkAddress = rawAddr;
            else if (rawAddr && typeof rawAddr === 'object') {
              const a = rawAddr as Record<string, unknown>;
              this.sparkAddress = (typeof a.address === 'string' ? a.address : typeof a.sparkAddress === 'string' ? a.sparkAddress : String(rawAddr));
            } else {
              this.sparkAddress = String(rawAddr);
            }
            console.error(`[wallet-isolate] Spark wallet initialized (${config.network || 'MAINNET'}) addr: ${this.sparkAddress.slice(0, 20)}...`);
          } catch (accErr) {
            console.error('[wallet-isolate] Spark getAccount failed:', accErr instanceof Error ? accErr.message : accErr);
          }
        } catch (err) {
          console.error('[wallet-isolate] Spark init failed:', err instanceof Error ? err.message : err);
        }
      }
      else if (config.chain === 'rgb') {
        try {
          const { default: WalletManagerRgb } = await import('@utexo/wdk-wallet-rgb');
          const network = (config.network || 'testnet') as 'mainnet' | 'testnet' | 'regtest';
          const rgbConfig: Record<string, unknown> = { network };
          if (config.indexerUrl) rgbConfig.indexerUrl = config.indexerUrl;
          if (config.dataDir) rgbConfig.dataDir = config.dataDir;
          if (config.transportEndpoint) rgbConfig.transportEndpoint = config.transportEndpoint;
          this.rgbManager = new WalletManagerRgb(seed, rgbConfig as { network: typeof network }) as unknown as RgbManager;
          this.rgbAccount = await this.rgbManager.getAccount();
          console.error(`[wallet-isolate] RGB chain module initialized (${network})`);
        } catch (err) {
          console.error('[wallet-isolate] RGB init failed:', err instanceof Error ? err.message : err);
        }
      }
    }

    this.wdk = wdk as unknown as WdkInstance;
    this.initialized = true;
  }

  async getAddress(chain: Chain): Promise<string> {
    if (chain === 'spark') {
      if (this.sparkAddress) return this.sparkAddress;
      throw new Error('Spark wallet not initialized or address not available');
    }
    const account = await this.getAccount(chain);
    const BTC_TIMEOUT_MS = 10_000;
    if (chain === 'bitcoin') {
      return Promise.race([
        account.getAddress(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('BTC getAddress timed out')), BTC_TIMEOUT_MS)
        ),
      ]);
    }
    return account.getAddress();
  }

  async getBalance(chain: Chain, symbol: TokenSymbol): Promise<WalletBalance> {
    if (chain === 'spark') {
      const sparkAccount = await this.getSparkAccount();
      const raw = await sparkAccount.getBalance();
      return { chain, symbol: 'BTC', raw, formatted: formatBalance(raw, 'BTC') };
    }
    const account = await this.getAccount(chain);

    // Native balance (BTC) — timeout guards against Electrum reconnect stalls
    const BTC_TIMEOUT_MS = 10_000;
    if (chain === 'bitcoin') {
      const raw = await Promise.race([
        account.getBalance(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('BTC balance query timed out')), BTC_TIMEOUT_MS)
        ),
      ]);
      return { chain, symbol, raw, formatted: formatBalance(raw, symbol) };
    }
    const raw = await account.getBalance();
    return { chain, symbol, raw, formatted: formatBalance(raw, symbol) };
  }

  async getBalances(): Promise<WalletBalance[]> {
    this.ensureInitialized();
    const results: WalletBalance[] = [];

    const queries: Array<{ chain: Chain; symbol: TokenSymbol }> = [
      { chain: 'bitcoin', symbol: 'BTC' },
      { chain: 'spark', symbol: 'BTC' },
    ];

    const settled = await Promise.allSettled(
      queries.map(async (q) => {
        try {
          return await this.getBalance(q.chain, q.symbol);
        } catch {
          return null;
        }
      })
    );

    for (const result of settled) {
      if (result.status === 'fulfilled' && result.value && result.value.raw > 0n) {
        results.push(result.value);
      }
    }

    return results;
  }

  /**
   * @security THE CODE PATH THAT MOVES FUNDS FOR PAYMENTS.
   * This must only be called from ProposalExecutor after policy approval.
   */
  async sendTransaction(chain: Chain, to: string, amount: bigint, _symbol: TokenSymbol): Promise<TransactionResult> {
    this.ensureInitialized();

    try {
      if (chain === 'spark') {
        const sparkAccount = await this.getSparkAccount();
        const SPARK_TIMEOUT_MS = 15_000;
        const result = await Promise.race([
          sparkAccount.sendTransaction({ to, value: amount }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Spark send timed out after 15s')), SPARK_TIMEOUT_MS)
          ),
        ]);
        return { success: true, txHash: (result as { hash: string }).hash };
      }

      const account = await this.getAccount(chain);
      const result = await account.sendTransaction({ to, value: amount });
      return { success: true, txHash: result.hash };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown transaction error';
      return { success: false, error: message };
    }
  }

  // ── RGB Asset Operations ──
  // Powered by @utexo/wdk-wallet-rgb — initialized in the chain loop above.

  async rgbIssueAsset(ticker: string, name: string, supply: bigint, precision: number): Promise<TransactionResult & { assetId?: string }> {
    if (!this.rgbAccount) {
      return { success: false, error: 'RGB wallet module not configured.' };
    }
    try {
      const nia = this.rgbAccount.issueAssetNia({
        ticker, name, precision, amounts: [Number(supply)],
      });
      return { success: true, assetId: nia.assetId };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'RGB issue failed';
      return { success: false, error: message };
    }
  }

  async rgbTransfer(invoice: string, amount: bigint, assetId: string): Promise<TransactionResult> {
    if (!this.rgbAccount) {
      return { success: false, error: 'RGB wallet module not configured.' };
    }
    try {
      const result = await this.rgbAccount.transfer({
        recipient: invoice,
        token: assetId,
        amount: Number(amount),
        minConfirmations: 1,
      });
      return { success: true, txHash: result.txid || '' };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'RGB transfer failed';
      return { success: false, error: message };
    }
  }

  async rgbReceiveAsset(assetId?: string): Promise<{ invoice: string; recipientId: string }> {
    if (!this.rgbAccount) {
      throw new Error('RGB wallet module not configured.');
    }
    const inv = this.rgbAccount.receiveAsset({
      ...(assetId ? { assetId } : {}),
      amount: 0,       // 0 = open amount (receiver doesn't fix the amount)
      witness: true,    // witness-based receive — no pre-existing UTXOs needed
    });
    return { invoice: inv.invoice, recipientId: inv.recipientId || '' };
  }

  async rgbListAssets(): Promise<Array<{ assetId: string; ticker: string; name: string; precision: number; balance: string }>> {
    if (!this.rgbAccount) return [];
    const assets = this.rgbAccount.listAssets();
    return assets.map(a => ({
      assetId: a.assetId || '',
      ticker: a.ticker || '',
      name: a.name || '',
      precision: a.precision || 0,
      balance: String(a.balance?.settled || 0),
    }));
  }

  // ── Spark Lightning Operations ──

  /** Create a Lightning invoice for receiving payments. */
  async sparkCreateInvoice(amountSats?: number, memo?: string): Promise<{ invoice: string; id: string; amountSats: number }> {
    const sparkAccount = await this.getSparkAccount();
    return sparkAccount.createLightningInvoice({ amountSats, memo });
  }

  /** Pay a Lightning invoice. */
  async sparkPayInvoice(encodedInvoice: string, maxFeeSats?: number): Promise<TransactionResult> {
    try {
      const sparkAccount = await this.getSparkAccount();
      const result = await sparkAccount.payLightningInvoice({ encodedInvoice, maxFeeSats });
      return { success: true, txHash: result.id };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown Lightning payment error';
      return { success: false, error: message };
    }
  }

  /** Get a deposit address for bridging BTC L1 → Spark L2. */
  async sparkGetDepositAddress(): Promise<string> {
    const sparkAccount = await this.getSparkAccount();
    return sparkAccount.getStaticDepositAddress();
  }

  /** Get Spark transfer history. */
  async sparkGetTransfers(direction?: 'incoming' | 'outgoing' | 'all', limit?: number): Promise<unknown[]> {
    const sparkAccount = await this.getSparkAccount();
    const opts: Record<string, unknown> = {};
    if (direction) opts.direction = direction;
    if (limit) opts.limit = limit;
    const transfers = await sparkAccount.getTransfers(opts);
    return Array.isArray(transfers) ? transfers : [];
  }

  // ── Private Helpers ──

  private async getSparkAccount(): Promise<SparkAccount> {
    this.ensureInitialized();
    if (this.sparkAccount) return this.sparkAccount;
    if (!this.sparkManager) {
      throw new Error('Spark wallet not initialized. Add spark chain to config.');
    }
    this.sparkAccount = await this.sparkManager.getAccount(0);
    return this.sparkAccount;
  }

  private async getAccount(chain: Chain): Promise<WdkAccount> {
    this.ensureInitialized();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.wdk!.getAccount(chain, 0);
  }

  private ensureInitialized(): void {
    if (!this.initialized || this.wdk === null) {
      throw new Error('WalletManager not initialized');
    }
  }
}

/**
 * Mock Wallet Manager — for testing and demo without real WDK.
 * Returns predictable values, never touches a blockchain.
 */
export class MockWalletManager implements WalletOperations {
  private balances: Map<string, bigint> = new Map();
  private initialized = false;
  private mockRgbAssets: Map<string, { ticker: string; name: string; precision: number; balance: bigint }> = new Map();
  private nextRgbAssetId = 1;

  async initialize(_seed: string, chains: ChainConfig[]): Promise<void> {
    for (const chain of chains) {
      if (chain.chain === 'bitcoin') {
        this.balances.set(`${chain.chain}:BTC`, 10_000_000n);  // 0.1 BTC (8 decimals)
      } else if (chain.chain === 'spark') {
        this.balances.set(`${chain.chain}:BTC`, 100_000n);  // 100,000 sats = 0.001 BTC on Spark
      }
    }
    this.initialized = true;
  }

  async getAddress(chain: Chain): Promise<string> {
    this.ensureInit();
    if (chain === 'bitcoin') return 'tb1qmock000000000000000000000000000000dead';
    if (chain === 'spark') return 'spark1mock000000000000000000000dead';
    return `mock-${chain}-address`;
  }

  // ── Spark Mock Operations ──
  async sparkCreateInvoice(amountSats?: number, _memo?: string): Promise<{ invoice: string; id: string; amountSats: number }> {
    this.ensureInit();
    return {
      invoice: `lnbc${amountSats || 1000}u1mock${Date.now().toString(36)}`,
      id: `inv-mock-${Date.now().toString(36)}`,
      amountSats: amountSats || 1000,
    };
  }
  async sparkPayInvoice(encodedInvoice: string, _maxFeeSats?: number): Promise<TransactionResult> {
    this.ensureInit();
    void encodedInvoice;
    return { success: true, txHash: `spark-pay-mock-${Date.now().toString(36)}` };
  }
  async sparkGetDepositAddress(): Promise<string> {
    this.ensureInit();
    return 'tb1qspark-deposit-mock-address';
  }

  async getBalance(chain: Chain, symbol: TokenSymbol): Promise<WalletBalance> {
    this.ensureInit();
    const raw = this.balances.get(`${chain}:${symbol}`) ?? 0n;
    return { chain, symbol, raw, formatted: formatBalance(raw, symbol) };
  }

  async getBalances(): Promise<WalletBalance[]> {
    this.ensureInit();
    const results: WalletBalance[] = [];
    for (const [key, raw] of this.balances) {
      const [chain, symbol] = key.split(':') as [Chain, TokenSymbol];
      if (raw > 0n) {
        results.push({ chain, symbol, raw, formatted: formatBalance(raw, symbol) });
      }
    }
    return results;
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

  // ── RGB Asset Operations (Mock) ──

  async rgbIssueAsset(ticker: string, name: string, supply: bigint, precision: number): Promise<TransactionResult & { assetId?: string }> {
    this.ensureInit();
    const assetId = `rgb:mock-${this.nextRgbAssetId++}-${ticker.toLowerCase()}`;
    this.mockRgbAssets.set(assetId, { ticker, name, precision, balance: supply });
    const mockHash = `0xrgbissue${Date.now().toString(16)}`;
    return { success: true, txHash: mockHash, assetId };
  }

  async rgbTransfer(invoice: string, amount: bigint, assetId: string): Promise<TransactionResult> {
    this.ensureInit();
    const asset = this.mockRgbAssets.get(assetId);
    if (!asset) return { success: false, error: `RGB asset not found: ${assetId}` };
    if (amount > asset.balance) return { success: false, error: `Insufficient RGB balance for ${asset.ticker}` };
    asset.balance -= amount;
    const mockHash = `0xrgbtransfer${Date.now().toString(16)}`;
    void invoice;
    return { success: true, txHash: mockHash };
  }

  async rgbReceiveAsset(assetId?: string): Promise<{ invoice: string; recipientId: string }> {
    this.ensureInit();
    const recipientId = `mock-recipient-${Date.now().toString(36)}`;
    const invoiceAsset = assetId ? assetId.slice(0, 20) : 'any';
    return {
      invoice: `rgb:invoice:${invoiceAsset}:${recipientId}`,
      recipientId,
    };
  }

  async rgbListAssets(): Promise<Array<{ assetId: string; ticker: string; name: string; precision: number; balance: string }>> {
    this.ensureInit();
    const results: Array<{ assetId: string; ticker: string; name: string; precision: number; balance: string }> = [];
    for (const [assetId, asset] of this.mockRgbAssets) {
      results.push({
        assetId,
        ticker: asset.ticker,
        name: asset.name,
        precision: asset.precision,
        balance: asset.balance.toString(),
      });
    }
    return results;
  }

  private ensureInit(): void {
    if (!this.initialized) throw new Error('MockWalletManager not initialized');
  }
}
