/**
 * Integration test: RGB Transport Bridge with real P2P delivery.
 *
 * Uses HyperDHT testnet (no public DHT) to verify consignment
 * delivery between two bridge instances via rgb-consignment-transport.
 *
 * Run: node --test tests/rgb/transport-bridge.test.js
 * (from oikos-wallet directory, after npm install)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import http from 'node:http';

// CJS modules via createRequire (ESM compat)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const HyperDHT = require('hyperdht');
const createTestnet = require('hyperdht/testnet');
const b4a = require('b4a');

const { startTransportBridge } = await import('../../dist/src/rgb/transport-bridge.js');

// ── Helpers ──

function httpRequest(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const isJson = typeof body === 'object' && !Buffer.isBuffer(body);
    const bodyData = isJson ? JSON.stringify(body) : body;
    const headers = {};
    if (isJson) headers['Content-Type'] = 'application/json';
    if (bodyData) headers['Content-Length'] = Buffer.byteLength(bodyData);

    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        const contentType = res.headers['content-type'] || '';
        if (contentType.includes('json')) {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(raw.toString()) });
          } catch {
            resolve({ status: res.statusCode, body: raw });
          }
        } else {
          resolve({ status: res.statusCode, body: raw });
        }
      });
    });
    req.on('error', reject);
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

function waitFor(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Test Suite ──

describe('RGB Transport Bridge — P2P Integration', () => {
  let testnet;
  let bridgeA; // sender
  let bridgeB; // receiver
  const portA = 14100;
  const portB = 14101;
  let keypairA;
  let keypairB;

  before(async () => {
    testnet = await createTestnet(3);
    keypairA = HyperDHT.keyPair();
    keypairB = HyperDHT.keyPair();

    bridgeA = startTransportBridge(portA, {
      mock: false,
      keypair: keypairA,
      testnet,
    });
    bridgeB = startTransportBridge(portB, {
      mock: false,
      keypair: keypairB,
      testnet,
    });

    // Wait for servers to be ready
    await waitFor(500);
  });

  after(async () => {
    if (bridgeA) await bridgeA.stop();
    if (bridgeB) await bridgeB.stop();
    if (testnet) await testnet.destroy();
  });

  it('health endpoint reports live mode', async () => {
    const res = await httpRequest(portA, 'GET', '/health/status', null);
    assert.equal(res.status, 200);
    assert.equal(res.body.mode, 'live');
    assert.equal(res.body.activeSessions, 0);
  });

  it('full send-receive cycle with ACK', async (t) => {
    t.signal.addEventListener('abort', () => {});
    const timeout = setTimeout(() => t.signal, 30000);

    const invoice = 'rgb:test-invoice/RGB20/100+utxob:test-seal-' + randomBytes(4).toString('hex');
    const recipientId = 'utxob:' + randomBytes(16).toString('hex');
    const nonce = randomBytes(32).toString('hex');
    const consignment = randomBytes(5000);

    // 1. Bridge B (receiver) registers a listener
    const listenRes = await httpRequest(portB, 'POST', '/listen', {
      recipientId,
      invoice,
      senderPubkey: b4a.toString(keypairA.publicKey, 'hex'),
      nonce,
    });
    assert.equal(listenRes.status, 200);
    assert.equal(listenRes.body.ok, true);
    assert.ok(listenRes.body.topic, 'should return topic');

    // 2. Bridge A (sender) pre-registers send params
    const prepareRes = await httpRequest(portA, 'POST', '/send-prepare', {
      recipientId,
      invoice,
      receiverPubkey: b4a.toString(keypairB.publicKey, 'hex'),
      nonce,
    });
    assert.equal(prepareRes.status, 200);

    // 3. Bridge A sends consignment (blocks until ACK/NACK)
    //    Meanwhile Bridge B receives in background
    //    We need to also poll GET /consignment on B and POST /ack on B
    const sendPromise = httpRequest(portA, 'POST', `/consignment/${recipientId}`, consignment);

    // 4. Wait for Bridge B to receive the consignment
    let received = null;
    for (let i = 0; i < 60; i++) {
      await waitFor(500);
      const getRes = await httpRequest(portB, 'GET', `/consignment/${recipientId}`, null);
      if (getRes.status === 200) {
        received = getRes.body;
        break;
      }
    }

    assert.ok(received, 'Should receive consignment on bridge B');
    assert.ok(Buffer.isBuffer(received), 'Should be a Buffer');
    assert.equal(received.length, consignment.length, 'Consignment size matches');
    assert.ok(received.equals(consignment), 'Consignment content matches');

    // 5. Bridge B sends ACK (relayed via P2P to sender)
    const ackRes = await httpRequest(portB, 'POST', `/ack/${recipientId}`, { ack: true });
    assert.equal(ackRes.status, 200);

    // 6. Sender should get the ACK result
    const sendRes = await sendPromise;
    assert.equal(sendRes.status, 200);
    assert.equal(sendRes.body.ok, true);
    assert.equal(sendRes.body.isAck, true);

    // 7. Verify sessions cleaned up
    await waitFor(500);
    const healthA = await httpRequest(portA, 'GET', '/health/status', null);
    const healthB = await httpRequest(portB, 'GET', '/health/status', null);
    assert.equal(healthA.body.activeSessions, 0, 'Sender sessions cleaned up');
    assert.equal(healthB.body.activeSessions, 0, 'Receiver sessions cleaned up');

    clearTimeout(timeout);
  });

  it('NACK flow: receiver rejects consignment', async (t) => {
    const invoice = 'rgb:nack-test/RGB20/50+utxob:nack-seal-' + randomBytes(4).toString('hex');
    const recipientId = 'utxob:nack-' + randomBytes(16).toString('hex');
    const nonce = randomBytes(32).toString('hex');
    const consignment = randomBytes(3000);

    // Receiver listens
    await httpRequest(portB, 'POST', '/listen', {
      recipientId,
      invoice,
      senderPubkey: b4a.toString(keypairA.publicKey, 'hex'),
      nonce,
    });

    // Sender prepares
    await httpRequest(portA, 'POST', '/send-prepare', {
      recipientId,
      invoice,
      receiverPubkey: b4a.toString(keypairB.publicKey, 'hex'),
      nonce,
    });

    // Sender sends
    const sendPromise = httpRequest(portA, 'POST', `/consignment/${recipientId}`, consignment);

    // Wait for consignment to arrive at B
    for (let i = 0; i < 60; i++) {
      await waitFor(500);
      const getRes = await httpRequest(portB, 'GET', `/consignment/${recipientId}`, null);
      if (getRes.status === 200) break;
    }

    // Receiver sends NACK
    await httpRequest(portB, 'POST', `/ack/${recipientId}`, { ack: false });

    // Sender should get NACK
    const sendRes = await sendPromise;
    assert.equal(sendRes.status, 200);
    assert.equal(sendRes.body.isAck, false);
  });
});

describe('RGB Transport Bridge — Mock Mode', () => {
  let bridge;
  const port = 14200;

  before(async () => {
    bridge = startTransportBridge(port, { mock: true });
    await waitFor(300);
  });

  after(async () => {
    if (bridge) await bridge.stop();
  });

  it('stores and retrieves consignment in mock mode', async () => {
    const recipientId = 'mock-recipient-' + randomBytes(4).toString('hex');
    const data = randomBytes(1000);

    // Store
    const postRes = await httpRequest(port, 'POST', `/consignment/${recipientId}`, data);
    assert.equal(postRes.status, 200);

    // Retrieve
    const getRes = await httpRequest(port, 'GET', `/consignment/${recipientId}`, null);
    assert.equal(getRes.status, 200);
    assert.ok(Buffer.isBuffer(getRes.body));
    assert.ok(getRes.body.equals(data));

    // Gone after retrieval
    const gone = await httpRequest(port, 'GET', `/consignment/${recipientId}`, null);
    assert.equal(gone.status, 404);
  });

  it('stores and retrieves ACK in mock mode', async () => {
    const recipientId = 'mock-ack-' + randomBytes(4).toString('hex');

    await httpRequest(port, 'POST', `/ack/${recipientId}`, { ack: true });
    const getRes = await httpRequest(port, 'GET', `/ack/${recipientId}`, null);
    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.ack, true);
  });

  it('mock listen returns immediately', async () => {
    const res = await httpRequest(port, 'POST', '/listen', {
      recipientId: 'mock-listen',
      invoice: 'rgb:mock',
      senderPubkey: randomBytes(32).toString('hex'),
      nonce: randomBytes(32).toString('hex'),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.transferId, 'mock');
  });

  it('health shows mock mode', async () => {
    const res = await httpRequest(port, 'GET', '/health/status', null);
    assert.equal(res.status, 200);
    assert.equal(res.body.mode, 'mock');
  });
});
