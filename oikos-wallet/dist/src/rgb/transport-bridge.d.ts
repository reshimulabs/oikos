/**
 * RGB Transport Bridge — local HTTP proxy for consignment delivery.
 *
 * Bridges between @utexo/wdk-wallet-rgb (which calls HTTP transport endpoints)
 * and rgb-consignment-transport (which delivers via Hyperswarm).
 *
 * Architecture:
 * - WDK RGB wallet module in the Wallet Isolate sends HTTP requests
 *   to this local bridge (e.g., POST /consignment)
 * - The bridge translates these into Hyperswarm sessions via rgb-c-t
 * - Consignments are delivered P2P, no centralized transport server
 *
 * This preserves process isolation:
 * - Wallet Isolate: has keys, no networking (calls HTTP to localhost)
 * - Brain: has networking (Hyperswarm), no keys
 *
 * Pattern reused from rgb-wallet-pear/sidecar/rgb-manager.js.
 *
 * @security This module runs in the Brain process. It NEVER touches
 * seed phrases or private keys. It only relays consignment data.
 */
import { type Server } from 'http';
declare const deriveTopic: (invoice: string | Buffer, senderPubkey: Buffer, nonce: Buffer) => Buffer, generateNonce: () => Buffer;
export interface TransportBridgeOptions {
    mock?: boolean;
    keypair?: {
        publicKey: Buffer;
        secretKey: Buffer;
    };
    storageDir?: string;
    /** HyperDHT testnet (for integration tests). Calls testnet.createNode() per session. */
    testnet?: {
        createNode(): unknown;
    };
}
export interface TransportBridgeHandle {
    server: Server;
    stop: () => Promise<void>;
}
/**
 * Start the RGB transport bridge HTTP server.
 *
 * Each call creates an independent bridge instance with its own state.
 * Multiple bridges can run in the same process (e.g., for integration tests).
 */
export declare function startTransportBridge(port: number, options?: TransportBridgeOptions): TransportBridgeHandle;
export { generateNonce, deriveTopic };
//# sourceMappingURL=transport-bridge.d.ts.map