/**
 * Lazy Identity Registration — stubbed (ERC-8004 removed).
 *
 * Kept as a no-op so main.ts compiles without changes.
 */

import type { WalletIPCClient } from '../ipc/client.js';

/** Stub identity state — always unregistered. */
export interface IdentityState {
  registered: boolean;
  agentId: string | null;
  walletSet: boolean;
  agentURI: string | null;
  registrationTxHash: string | null;
}

export interface LazyRegistrarConfig {
  /** Path to the identity persistence file. */
  identityPath: string;
  /** Dashboard port for constructing agentURI. */
  dashboardPort: number;
  /** Dashboard host for constructing agentURI. */
  dashboardHost: string;
}

export interface LazyRegistrarCallbacks {
  /** Called when registration succeeds. */
  onRegistered: (identity: IdentityState) => void;
}

export class LazyRegistrar {
  constructor(
    _wallet: WalletIPCClient,
    _identity: IdentityState,
    _config: LazyRegistrarConfig,
    _callbacks: LazyRegistrarCallbacks,
  ) {}

  /** No-op — always returns false (identity registration removed). */
  tryLoad(): boolean {
    return false;
  }

  /** No-op — always returns false (identity registration removed). */
  async tryRegister(): Promise<boolean> {
    return false;
  }

  /** No-op — watcher disabled. */
  startWatcher(): void {}

  /** No-op. */
  stopWatcher(): void {}
}
