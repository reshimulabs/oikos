/**
 * Oikos Services — direct service references for dashboard/MCP.
 *
 * Replaces the GatewayPlugin indirection pattern. The oikos-wallet
 * owns all services directly — no brain plugin needed.
 */
import type { WalletIPCClient } from './ipc/client.js';
import type { EventBus } from './events/bus.js';
import type { BrainAdapter, ChatMessage } from './brain/adapter.js';
import type { CompanionCoordinator } from './companion/coordinator.js';
/** Swarm announcement posting options */
export interface SwarmAnnounceOpts {
    category: 'buyer' | 'seller' | 'auction';
    title: string;
    description: string;
    priceRange: {
        min: string;
        max: string;
        symbol: string;
    };
    tags?: string[];
}
/** Interface that a swarm coordinator must implement */
export interface SwarmInterface {
    getState(): Record<string, unknown>;
    postAnnouncement(opts: SwarmAnnounceOpts): string;
    bidOnAnnouncement(announcementId: string, price: string, symbol: string, reason: string): Promise<void>;
    acceptBestBid(announcementId: string): Promise<unknown>;
    submitPayment(announcementId: string): Promise<void>;
    cancelRoom?(announcementId: string): boolean;
    removeAnnouncement?(announcementId: string): boolean;
    deliverTaskResult?(announcementId: string, result: string, opts?: {
        contentHash?: string;
        contentType?: string;
        filename?: string;
        deliveryMethod?: 'inline' | 'url';
    }): boolean;
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
    swarm: SwarmInterface | null;
    eventBus: EventBus | null;
    companionConnected: boolean;
    instructions: CompanionInstruction[];
    /** Brain adapter for chat (agent-agnostic) */
    brain: BrainAdapter | null;
    /** Chat conversation history */
    chatMessages: ChatMessage[];
    /** Spark/Lightning wallet enabled */
    sparkEnabled: boolean;
    /** Passphrase authentication module */
    auth: import('./auth/passphrase.js').PassphraseAuth | null;
    /** Companion coordinator for Pear app ↔ agent bridging */
    companion: CompanionCoordinator | null;
}
//# sourceMappingURL=types.d.ts.map