/**
 * Oikos Services — direct service references for dashboard/MCP.
 *
 * Replaces the GatewayPlugin indirection pattern. The oikos-app
 * owns all services directly — no brain plugin needed.
 */

import type { WalletIPCClient } from './ipc/client.js';
import type { EventBus } from './events/bus.js';
import type { PricingService } from './pricing/client.js';

/** Swarm announcement posting options */
export interface SwarmAnnounceOpts {
  category: 'service' | 'auction' | 'request';
  title: string;
  description: string;
  priceRange: { min: string; max: string; symbol: string };
}

/** Interface that a swarm coordinator must implement */
export interface SwarmInterface {
  getState(): Record<string, unknown>;
  postAnnouncement(opts: SwarmAnnounceOpts): string;
}

/** ERC-8004 identity state */
export interface IdentityState {
  registered: boolean;
  agentId: string | null;
  walletSet: boolean;
  agentURI: string | null;
  registrationTxHash: string | null;
}

/** Companion instruction (queued for any connected agent to read) */
export interface CompanionInstruction {
  text: string;
  timestamp: number;
}

/**
 * All services available to the dashboard/MCP layer.
 * Every field is nullable — services are optional.
 */
export interface OikosServices {
  wallet: WalletIPCClient;
  pricing: PricingService | null;
  swarm: SwarmInterface | null;
  eventBus: EventBus | null;
  identity: IdentityState;
  companionConnected: boolean;
  instructions: CompanionInstruction[];
}
