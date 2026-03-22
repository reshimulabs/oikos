/**
 * Lazy ERC-8004 Registration — always-on identity with gas-aware deferred registration.
 *
 * ERC-8004 identity is always-on. But registration costs gas (ETH), and a
 * brand-new wallet starts with zero ETH. This module solves the chicken-and-egg:
 *
 *   1. At startup, check if identity is already persisted (.oikos-identity.json)
 *   2. If yes → load it, done
 *   3. If no → check ETH balance
 *   4. If ETH >= MIN_GAS → register immediately
 *   5. If ETH < MIN_GAS → start a watcher (every 60s) that retries
 *   6. On incoming transfer events → also trigger a registration attempt
 *   7. When registration succeeds → save to disk, stop watcher, propagate
 *
 * "When you get your first sats, you get your identity."
 */

import type { WalletIPCClient } from '../ipc/client.js';
import type { IdentityState } from '../types.js';
import { loadIdentity, saveIdentity } from './store.js';
import type { PersistedIdentity } from './store.js';

/** Minimum ETH balance (in wei) needed for registration gas. ~0.001 ETH = 2-3 registrations. */
const MIN_GAS_WEI = '1000000000000000'; // 0.001 ETH = 10^15 wei

/** Watcher interval: check balance every 60 seconds. */
const WATCHER_INTERVAL_MS = 60_000;

export interface LazyRegistrarConfig {
  /** Path to the identity persistence file. */
  identityPath: string;
  /** Dashboard port for constructing agentURI. */
  dashboardPort: number;
  /** Dashboard host for constructing agentURI. */
  dashboardHost: string;
}

export interface LazyRegistrarCallbacks {
  /** Called when registration succeeds. Update services, swarm, bridge. */
  onRegistered: (identity: IdentityState) => void;
}

export class LazyRegistrar {
  private wallet: WalletIPCClient;
  private identity: IdentityState;
  private config: LazyRegistrarConfig;
  private callbacks: LazyRegistrarCallbacks;
  private watcherInterval: ReturnType<typeof setInterval> | null = null;
  private registering = false; // Guard against concurrent registration attempts

  constructor(
    wallet: WalletIPCClient,
    identity: IdentityState,
    config: LazyRegistrarConfig,
    callbacks: LazyRegistrarCallbacks,
  ) {
    this.wallet = wallet;
    this.identity = identity;
    this.config = config;
    this.callbacks = callbacks;
  }

  /**
   * Try to load identity from disk. If found, populates identity state.
   * Returns true if identity was loaded (already registered).
   */
  tryLoad(): boolean {
    const persisted = loadIdentity(this.config.identityPath);
    if (!persisted) return false;

    this.identity.registered = true;
    this.identity.agentId = persisted.agentId;
    this.identity.walletSet = persisted.walletSet;
    this.identity.agentURI = persisted.agentURI;
    this.identity.registrationTxHash = persisted.registrationTxHash;

    console.error(`[erc8004] Loaded identity (agentId: ${persisted.agentId})`);
    return true;
  }

  /**
   * Attempt registration. Returns true if successful.
   *
   * Safe to call multiple times — guards against concurrent attempts
   * and skips if already registered.
   */
  async tryRegister(): Promise<boolean> {
    // Already registered
    if (this.identity.registered) return true;

    // Guard against concurrent registration attempts
    if (this.registering) return false;
    this.registering = true;

    try {
      // Check ETH balance
      const balanceResult = await this.wallet.queryBalance('ethereum', 'ETH');
      const balanceWei = BigInt(balanceResult.balance);

      if (balanceWei < BigInt(MIN_GAS_WEI)) {
        // Not enough gas — will retry later
        return false;
      }

      console.error('[erc8004] Funded! Registering on-chain identity...');

      // Register identity
      const agentURI = `http://${this.config.dashboardHost}:${this.config.dashboardPort}/agent-card.json`;
      const regResult = await this.wallet.registerIdentity(agentURI);

      if (regResult.status !== 'registered' || !regResult.agentId) {
        console.error(`[erc8004] Registration failed: ${regResult.error ?? 'unknown error'}`);
        return false;
      }

      // Set wallet address (deadline: 1 hour from now)
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const walletResult = await this.wallet.setAgentWallet(regResult.agentId, deadline);
      const walletSet = walletResult.status === 'wallet_set';

      // Update in-memory state
      this.identity.registered = true;
      this.identity.agentId = regResult.agentId;
      this.identity.walletSet = walletSet;
      this.identity.agentURI = agentURI;
      this.identity.registrationTxHash = regResult.txHash ?? null;

      // Persist to disk
      const persisted: PersistedIdentity = {
        agentId: regResult.agentId,
        walletSet,
        agentURI,
        registrationTxHash: regResult.txHash ?? '',
        registeredAt: new Date().toISOString(),
      };
      saveIdentity(this.config.identityPath, persisted);

      console.error(`[erc8004] Registered (agentId: ${regResult.agentId}, wallet: ${walletSet ? 'linked' : 'pending'})`);

      // Stop watcher if running
      this.stopWatcher();

      // Notify callbacks (update swarm, bridge, etc.)
      this.callbacks.onRegistered(this.identity);

      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      console.error(`[erc8004] Registration attempt failed: ${msg}`);
      return false;
    } finally {
      this.registering = false;
    }
  }

  /**
   * Start the periodic watcher that retries registration every 60s.
   * Called when the wallet has no ETH at startup.
   */
  startWatcher(): void {
    if (this.watcherInterval) return; // Already watching
    if (this.identity.registered) return; // Already registered

    console.error('[erc8004] No ETH for gas — will register when funded (checking every 60s)');

    this.watcherInterval = setInterval(() => {
      if (this.identity.registered) {
        this.stopWatcher();
        return;
      }
      void this.tryRegister();
    }, WATCHER_INTERVAL_MS);
  }

  /**
   * Stop the periodic watcher.
   */
  stopWatcher(): void {
    if (this.watcherInterval) {
      clearInterval(this.watcherInterval);
      this.watcherInterval = null;
    }
  }
}
