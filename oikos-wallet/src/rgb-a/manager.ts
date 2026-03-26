/**
 * RGB-A Manager — Agent trust protocol orchestration.
 *
 * Manages identity (AgentCard + SwarmAttestation), reputation store (Hyperbee),
 * receipt exchange, disclosure, and tier computation via rgb-a-node.
 *
 * Runs on the oikos-wallet (Node.js) side — NOT in wallet-isolate.
 * Keypair persistence delegated to wallet-isolate via IPC.
 *
 * Per-instance state (no module-level singletons) — supports multiple
 * instances in tests.
 */

import type {
  AgentCard,
  Receipt,
  LedgerState,
  IdentityBundle,
  DisclosurePackage,
  VerifyDisclosureResult,
  TierResult,
  EsploraClient,
} from 'rgb-a-node';

import {
  sign,
  sha256,
  RgbASwarm,
  createIdentity,
  createReputationStore,
  ReputationStore,
  createWitnessHandler,
  createReceiptExchangeHandler,
  createDisclosureHandler,
  buildDisclosure as rgbABuildDisclosure,
  verifyDisclosure as rgbAVerifyDisclosure,
  DisclosureLevel,
  initiateReceiptExchange,
  buildReceiptSignData,
  computeFullTier,
  createEsploraClient,
  Role,
  PaymentType,
} from 'rgb-a-node';

export interface RgbAManagerOpts {
  keypair?: { publicKey: Uint8Array; secretKey: Uint8Array };
  storagePath: string;
  esploraUrl: string;
  dht?: unknown;
}

export class RgbAManager {
  private identity: IdentityBundle | null = null;
  private store: ReputationStore | null = null;
  private swarm: RgbASwarm | null = null;
  private esplora: EsploraClient | null = null;
  private peerTiers: Map<string, number> = new Map();

  async start(opts: RgbAManagerOpts): Promise<IdentityBundle> {
    // Create Esplora client for bond verification
    this.esplora = createEsploraClient(opts.esploraUrl);

    // Create RGB-A swarm (uses its own Protomux protocol, separate from oikos swarm)
    this.swarm = new RgbASwarm(opts.dht ? { dht: opts.dht } : undefined);

    // Create identity (AgentCard + SwarmAttestation via witness quorum)
    // Use quorumTarget: 0 to skip quorum for initial bootstrap (single agent)
    this.identity = await createIdentity(this.swarm, {
      quorumTarget: 0,
    });

    // Override with provided keypair for persistence (identity generates its own)
    if (opts.keypair) {
      this.identity.publicKey = opts.keypair.publicKey;
      this.identity.secretKey = opts.keypair.secretKey;
    }

    // Create reputation store (Hypercore + Hyperbee)
    this.store = await createReputationStore({
      identitySecretKey: this.identity.secretKey,
      agentPubkey: this.identity.publicKey,
      storagePath: opts.storagePath,
    });

    // Register protocol handlers
    const agentKeypair = {
      publicKey: this.identity.publicKey,
      secretKey: this.identity.secretKey,
    };

    // Witness: respond to attestation requests from other agents
    createWitnessHandler(this.swarm, agentKeypair);

    // Receipt exchange: countersign and store inbound receipts
    createReceiptExchangeHandler(this.swarm, this.store, agentKeypair);

    // Disclosure: respond to disclosure requests
    createDisclosureHandler(this.swarm, this.store);

    return this.identity;
  }

  /**
   * Record a transfer receipt and exchange signatures with counterparty.
   * Called after a successful RGB transfer.
   */
  async recordTransferReceipt(opts: {
    counterpartyPubkey: Uint8Array;
    amount: number;
    assetId: string;
    paymentRef: Uint8Array;
    role: 'Payer' | 'Provider';
  }): Promise<Receipt | null> {
    if (!this.swarm || !this.store || !this.identity) {
      throw new Error('RgbAManager not started');
    }

    const receiptId = sha256(
      new Uint8Array([
        ...opts.counterpartyPubkey,
        ...opts.paymentRef,
        ...new TextEncoder().encode(String(Date.now())),
      ])
    );

    const receipt: Receipt = {
      receipt_id: receiptId,
      counterparty_id: opts.counterpartyPubkey,
      service_category: 0, // default category
      amount_msat: opts.amount * 1000, // convert sats to msat
      outcome: 1, // success
      role: opts.role === 'Payer' ? Role.Payer : Role.Provider,
      timestamp: Date.now(),
      payment_ref: opts.paymentRef,
      payment_type: PaymentType.BtcRgb,
      counterparty_sig: new Uint8Array(64), // will be filled by exchange
      detail_hash: sha256(new TextEncoder().encode(opts.assetId)),
    };

    // Find peer in swarm by pubkey hex
    const peerKeyHex = Buffer.from(opts.counterpartyPubkey).toString('hex');

    // Try to exchange receipt with counterparty (requires them to be connected)
    try {
      const signed = await initiateReceiptExchange(
        this.swarm,
        this.store,
        peerKeyHex,
        receipt,
        this.identity.secretKey
      );
      return signed;
    } catch (err) {
      // If counterparty not connected, append locally without countersignature
      console.error(`[rgb-a] Receipt exchange failed (peer offline?): ${err instanceof Error ? err.message : String(err)}`);

      // Sign our side
      const signData = buildReceiptSignData(receipt);
      receipt.counterparty_sig = sign(signData, this.identity.secretKey);
      await this.store.appendReceipt(receipt);
      return receipt;
    }
  }

  /** Build disclosure package for sharing reputation with peers. */
  async buildDisclosure(level?: DisclosureLevel): Promise<DisclosurePackage> {
    if (!this.store) throw new Error('RgbAManager not started');
    return rgbABuildDisclosure(this.store, level ?? DisclosureLevel.Standard);
  }

  /** Verify a peer's disclosure package. */
  async verifyPeerDisclosure(pkg: DisclosurePackage): Promise<VerifyDisclosureResult> {
    return rgbAVerifyDisclosure(pkg);
  }

  /** Compute this agent's trust tier. */
  async computeTier(): Promise<TierResult> {
    if (!this.store || !this.identity || !this.esplora) {
      throw new Error('RgbAManager not started');
    }

    return computeFullTier({
      store: this.store,
      card: this.identity.card,
      attestation: this.identity.attestation,
      validationCerts: [],
      esplora: this.esplora,
      witnessCount: 0,
      tier3Since: null,
      hasVouch: false,
      now: Date.now(),
    });
  }

  /** Get this agent's card. */
  getAgentCard(): AgentCard | null {
    return this.identity?.card ?? null;
  }

  /** Get this agent's public key (hex). */
  getPublicKeyHex(): string | null {
    if (!this.identity) return null;
    return Buffer.from(this.identity.publicKey).toString('hex');
  }

  /** Get ledger state (reputation summary). */
  async getLedgerState(): Promise<LedgerState | null> {
    if (!this.store) return null;
    return this.store.getLedgerState();
  }

  /** Track a peer's tier after disclosure verification. */
  setPeerTier(peerKeyHex: string, tier: number): void {
    this.peerTiers.set(peerKeyHex, tier);
  }

  /** Get a tracked peer's tier. */
  getPeerTier(peerKeyHex: string): number | undefined {
    return this.peerTiers.get(peerKeyHex);
  }

  /** Handle peer connection event from SwarmCoordinator. */
  handlePeerConnected(peerKeyHex: string): void {
    // For now, just log. Full disclosure exchange happens via RgbASwarm's
    // built-in handlers when both sides are on the RGB-A protocol.
    console.error(`[rgb-a] Peer connected: ${peerKeyHex.slice(0, 12)}...`);
  }

  /** Graceful shutdown. */
  async stop(): Promise<void> {
    if (this.store) {
      await this.store.close();
      this.store = null;
    }
    this.swarm = null;
    this.identity = null;
    this.esplora = null;
    this.peerTiers.clear();
  }
}
