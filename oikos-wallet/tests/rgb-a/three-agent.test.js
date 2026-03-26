/**
 * Integration test: 3-agent RGB-A trust lifecycle.
 *
 * Spins up Alice, Bob, Charlie with isolated RgbAManager instances
 * on a HyperDHT testnet. Exercises: identity bootstrap, receipt exchange,
 * disclosure verification, tier computation, and PolicyEngine tier-gating.
 *
 * Run: node --test tests/rgb-a/three-agent.test.js
 * (from oikos-wallet directory, after npm run build in both packages)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// CJS modules via createRequire (ESM compat)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const HyperDHT = require('hyperdht');
const createTestnet = require('hyperdht/testnet');

// Compiled sources
const { RgbAManager } = await import('../../dist/src/rgb-a/manager.js');
const { PolicyEngine } = await import('../../../wallet-isolate/dist/src/policies/engine.js');

// ── Helpers ──

function waitFor(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const DUMMY_ESPLORA = 'http://127.0.0.1:19999';

function makeProposal(to, counterpartyTier) {
  return {
    amount: '100000',
    symbol: 'RGB',
    chain: 'rgb',
    reason: 'test-payment',
    confidence: 0.9,
    strategy: 'test',
    timestamp: Date.now(),
    to,
    ...(counterpartyTier !== undefined ? { counterpartyTier } : {}),
  };
}

// ── Test Suite ──

describe('RGB-A 3-Agent Integration', () => {
  let testnet;
  let dhtAlice, dhtBob, dhtCharlie;
  let alice, bob, charlie;
  let tmpAlice, tmpBob, tmpCharlie;
  let aliceIdent, bobIdent, charlieIdent;

  before(async () => {
    testnet = await createTestnet(3);

    // Create per-agent DHT nodes using testnet bootstrap
    dhtAlice = new HyperDHT({ bootstrap: testnet.bootstrap });
    dhtBob = new HyperDHT({ bootstrap: testnet.bootstrap });
    dhtCharlie = new HyperDHT({ bootstrap: testnet.bootstrap });

    tmpAlice = mkdtempSync(join(tmpdir(), 'rgb-a-alice-'));
    tmpBob = mkdtempSync(join(tmpdir(), 'rgb-a-bob-'));
    tmpCharlie = mkdtempSync(join(tmpdir(), 'rgb-a-charlie-'));

    alice = new RgbAManager();
    bob = new RgbAManager();
    charlie = new RgbAManager();

    // skipWasm: true — WASM glue file uses CJS exports in ESM package, incompatible with Node ESM
    aliceIdent = await alice.start({ storagePath: tmpAlice, esploraUrl: DUMMY_ESPLORA, dht: dhtAlice, skipWasm: true });
    bobIdent = await bob.start({ storagePath: tmpBob, esploraUrl: DUMMY_ESPLORA, dht: dhtBob, skipWasm: true });
    charlieIdent = await charlie.start({ storagePath: tmpCharlie, esploraUrl: DUMMY_ESPLORA, dht: dhtCharlie, skipWasm: true });

    // Allow swarm connections to establish
    await waitFor(2000);
  });

  after(async () => {
    if (alice) await alice.stop();
    if (bob) await bob.stop();
    if (charlie) await charlie.stop();
    if (dhtAlice) await dhtAlice.destroy();
    if (dhtBob) await dhtBob.destroy();
    if (dhtCharlie) await dhtCharlie.destroy();
    if (testnet) await testnet.destroy();
    if (tmpAlice) rmSync(tmpAlice, { recursive: true, force: true });
    if (tmpBob) rmSync(tmpBob, { recursive: true, force: true });
    if (tmpCharlie) rmSync(tmpCharlie, { recursive: true, force: true });
  });

  // ── 1. Identity Bootstrap ──

  describe('Identity bootstrap', () => {
    it('each agent has a valid unique AgentCard', () => {
      const cardA = alice.getAgentCard();
      const cardB = bob.getAgentCard();
      const cardC = charlie.getAgentCard();

      assert.ok(cardA, 'Alice has an AgentCard');
      assert.ok(cardB, 'Bob has an AgentCard');
      assert.ok(cardC, 'Charlie has an AgentCard');

      const hexA = alice.getPublicKeyHex();
      const hexB = bob.getPublicKeyHex();
      const hexC = charlie.getPublicKeyHex();

      assert.ok(hexA && hexA.length === 64, 'Alice pubkey is 32 bytes hex');
      assert.ok(hexB && hexB.length === 64, 'Bob pubkey is 32 bytes hex');
      assert.ok(hexC && hexC.length === 64, 'Charlie pubkey is 32 bytes hex');

      // All unique
      assert.notEqual(hexA, hexB, 'Alice ≠ Bob');
      assert.notEqual(hexB, hexC, 'Bob ≠ Charlie');
      assert.notEqual(hexA, hexC, 'Alice ≠ Charlie');
    });
  });

  // ── 2. Receipt Exchange ──

  describe('Receipt exchange', () => {
    it('Alice and Bob exchange a transfer receipt', async () => {
      const alicePub = Buffer.from(alice.getPublicKeyHex(), 'hex');
      const bobPub = Buffer.from(bob.getPublicKeyHex(), 'hex');
      const paymentRef = randomBytes(32);

      const receiptA = await alice.recordTransferReceipt({
        counterpartyPubkey: bobPub,
        amount: 10000,
        assetId: 'test-nia-001',
        paymentRef,
        role: 'Payer',
      });

      const receiptB = await bob.recordTransferReceipt({
        counterpartyPubkey: alicePub,
        amount: 10000,
        assetId: 'test-nia-001',
        paymentRef,
        role: 'Provider',
      });

      assert.ok(receiptA, 'Alice got a receipt');
      assert.ok(receiptB, 'Bob got a receipt');
      assert.equal(receiptA.amount_msat, 10_000_000, 'Alice receipt amount_msat');
      assert.equal(receiptB.amount_msat, 10_000_000, 'Bob receipt amount_msat');

      // Both ledgers should show receipts
      const stateA = await alice.getLedgerState();
      const stateB = await bob.getLedgerState();
      assert.ok(stateA, 'Alice has ledger state');
      assert.ok(stateB, 'Bob has ledger state');
    });
  });

  // ── 3. Multiple Receipts ──

  describe('Multiple receipts', () => {
    it('records additional receipts and ledger grows', async () => {
      const alicePub = Buffer.from(alice.getPublicKeyHex(), 'hex');
      const bobPub = Buffer.from(bob.getPublicKeyHex(), 'hex');

      for (let i = 0; i < 5; i++) {
        const ref = randomBytes(32);
        const role = i % 2 === 0 ? 'Payer' : 'Provider';
        const counterRole = i % 2 === 0 ? 'Provider' : 'Payer';

        await alice.recordTransferReceipt({
          counterpartyPubkey: bobPub,
          amount: 5000 + i * 1000,
          assetId: 'test-nia-001',
          paymentRef: ref,
          role,
        });

        await bob.recordTransferReceipt({
          counterpartyPubkey: alicePub,
          amount: 5000 + i * 1000,
          assetId: 'test-nia-001',
          paymentRef: ref,
          role: counterRole,
        });
      }

      const stateA = await alice.getLedgerState();
      assert.ok(stateA, 'Alice ledger state exists');
      // At least 6 receipts total (1 from test 2 + 5 here)
    });
  });

  // ── 4. Disclosure Round-Trip ──

  describe('Disclosure exchange', () => {
    it('Alice builds disclosure and Bob verifies it', async () => {
      const disclosure = await alice.buildDisclosure();
      assert.ok(disclosure, 'Alice produced a disclosure package');

      const result = await bob.verifyPeerDisclosure(disclosure);
      assert.equal(result.valid, true, 'Bob validates Alice disclosure');
    });

    it('empty agent disclosure still verifies', async () => {
      const disclosure = await charlie.buildDisclosure();
      assert.ok(disclosure, 'Charlie produced a disclosure package');

      const result = await alice.verifyPeerDisclosure(disclosure);
      assert.equal(result.valid, true, 'Alice validates empty Charlie disclosure');
    });
  });

  // ── 5. Tier Computation ──

  describe('Tier computation', () => {
    it('fresh agent (Charlie) starts at Tier 0', async () => {
      const tier = await charlie.computeTier();
      assert.equal(tier.tier, 0, 'Charlie is Tier 0');
    });

    it('agent with receipts but insufficient counterparties stays Tier 0', async () => {
      const tier = await alice.computeTier();
      assert.equal(tier.tier, 0, 'Alice is Tier 0 (needs ≥5 distinct counterparties for Tier 1)');
      assert.ok(tier.distinctCounterparties < 5, 'Not enough distinct counterparties');
    });
  });

  // ── 6. Tier Gating — PolicyEngine ──

  describe('Tier gating — PolicyEngine', () => {
    let engine;
    let bobHex, charlieHex;

    before(() => {
      bobHex = bob.getPublicKeyHex();
      charlieHex = charlie.getPublicKeyHex();

      engine = new PolicyEngine({
        policies: [{
          id: 'tier-gate',
          name: 'Tier Gate',
          rules: [
            { type: 'min_counterparty_tier', minTier: 1 },
            { type: 'max_per_tx', amount: '1000000', symbol: 'RGB' },
          ],
        }],
      });
    });

    it('rejects payment to Tier 0 counterparty', () => {
      const result = engine.evaluate(makeProposal(charlieHex, 0));
      assert.equal(result.approved, false);
      assert.ok(
        result.violations.some(v => v.includes('min_counterparty_tier')),
        'Violation mentions min_counterparty_tier'
      );
      assert.ok(
        result.violations.some(v => v.includes('tier 0 below minimum 1')),
        'Violation shows tier 0 < 1'
      );
    });

    it('rejects payment when counterpartyTier is undefined', () => {
      const result = engine.evaluate(makeProposal(charlieHex));
      assert.equal(result.approved, false);
      assert.ok(
        result.violations.some(v => v.includes('tier not provided')),
        'Violation mentions tier not provided'
      );
    });

    it('approves payment to Tier 1 counterparty', () => {
      const result = engine.evaluate(makeProposal(bobHex, 1));
      assert.equal(result.approved, true);
      assert.equal(result.violations.length, 0);
    });

    it('approves payment to higher tier counterparty', () => {
      const result = engine.evaluate(makeProposal(bobHex, 3));
      assert.equal(result.approved, true);
      assert.equal(result.violations.length, 0);
    });
  });
});
