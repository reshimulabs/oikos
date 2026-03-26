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
import { createServer } from 'http';
import { randomBytes } from 'crypto';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, rmSync } from 'fs';
// rgb-consignment-transport (CJS, types in swarm/modules.d.ts)
import rgbTransport from 'rgb-consignment-transport';
const { createSession, deriveTopic, generateNonce } = rgbTransport;
import b4a from 'b4a';
// Session safety timeout (5 minutes)
const SESSION_TIMEOUT_MS = 5 * 60 * 1000;
// ── Pure helpers ──
function makeSessionStorage(baseDir) {
    const dir = join(baseDir, 'session-' + randomBytes(8).toString('hex'));
    mkdirSync(dir, { recursive: true });
    return dir;
}
function cleanupSessionStorage(storagePath) {
    try {
        rmSync(storagePath, { recursive: true, force: true });
    }
    catch {
        // best effort
    }
}
function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}
function jsonResponse(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}
// ── Main ──
/**
 * Start the RGB transport bridge HTTP server.
 *
 * Each call creates an independent bridge instance with its own state.
 * Multiple bridges can run in the same process (e.g., for integration tests).
 */
export function startTransportBridge(port, options) {
    const mock = options?.mock ?? true;
    const keypair = options?.keypair;
    const storageDir = options?.storageDir ?? join(tmpdir(), 'oikos-rgb-transport');
    const testnet = options?.testnet;
    mkdirSync(storageDir, { recursive: true });
    // Per-instance state (NOT module-level)
    const pendingConsignments = new Map();
    const pendingAcks = new Map();
    const pendingSends = new Map();
    const activeSessions = new Map();
    const recipientToTransfer = new Map();
    function destroySession(transferId) {
        const entry = activeSessions.get(transferId);
        if (!entry)
            return;
        if (entry.timeoutTimer)
            clearTimeout(entry.timeoutTimer);
        recipientToTransfer.delete(entry.recipientId);
        activeSessions.delete(transferId);
        entry.session.destroy().catch(() => { });
        cleanupSessionStorage(entry.storagePath);
    }
    function registerSession(transferId, session, role, recipientId, storagePath) {
        const timeoutTimer = setTimeout(() => {
            console.error(`[rgb-bridge] Session ${transferId} timed out (${role}), destroying`);
            destroySession(transferId);
        }, SESSION_TIMEOUT_MS);
        activeSessions.set(transferId, {
            session,
            role,
            recipientId,
            storagePath,
            createdAt: Date.now(),
            timeoutTimer,
        });
        recipientToTransfer.set(recipientId, transferId);
    }
    const server = createServer(async (req, res) => {
        const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
        const parts = url.pathname.split('/').filter(Boolean);
        const type = parts[0] ?? '';
        const recipientId = parts[1] ?? '';
        res.setHeader('Access-Control-Allow-Origin', '127.0.0.1');
        try {
            // ── POST /send-prepare ──
            if (type === 'send-prepare' && req.method === 'POST') {
                const body = JSON.parse((await readBody(req)).toString());
                pendingSends.set(body.recipientId, {
                    invoice: body.invoice,
                    receiverPubkey: body.receiverPubkey,
                    nonce: body.nonce,
                });
                console.error(`[rgb-bridge] Registered send-prepare for ${body.recipientId}`);
                jsonResponse(res, 200, { ok: true });
                return;
            }
            // ── POST /listen ──
            if (type === 'listen' && req.method === 'POST') {
                const body = JSON.parse((await readBody(req)).toString());
                if (mock) {
                    console.error(`[rgb-bridge] Mock listen registered for ${body.recipientId}`);
                    jsonResponse(res, 200, { ok: true, transferId: 'mock', topic: '0'.repeat(64) });
                    return;
                }
                if (!keypair) {
                    jsonResponse(res, 500, { error: 'No keypair configured for live mode' });
                    return;
                }
                const transferId = randomBytes(8).toString('hex');
                const sessionStorage = makeSessionStorage(storageDir);
                const senderPubkey = b4a.from(body.senderPubkey, 'hex');
                const nonce = b4a.from(body.nonce, 'hex');
                const topic = deriveTopic(body.invoice, senderPubkey, nonce);
                const sessionOpts = {
                    invoice: body.invoice,
                    senderPubkey,
                    nonce,
                    role: 'receiver',
                    storage: sessionStorage,
                    keyPair: keypair,
                    timeout: 120000,
                    ackTimeout: 300000,
                };
                if (testnet)
                    sessionOpts.dht = testnet.createNode();
                const session = createSession(sessionOpts);
                registerSession(transferId, session, 'receiver', body.recipientId, sessionStorage);
                // Promise that resolves when POST /ack triggers the decision
                const ackPromise = new Promise((resolve) => {
                    const entry = activeSessions.get(transferId);
                    if (entry)
                        entry.ackResolver = resolve;
                });
                // Background: open → receive → wait for ACK decision → send ACK/NACK → destroy
                session.open()
                    .then(() => session.receiveConsignment())
                    .then(async ({ payload }) => {
                    pendingConsignments.set(body.recipientId, payload);
                    console.error(`[rgb-bridge] Received consignment for ${body.recipientId} (${payload.length} bytes) via P2P`);
                    const ack = await ackPromise;
                    if (ack) {
                        await session.sendAck();
                        console.error(`[rgb-bridge] Sent ACK for ${body.recipientId} via P2P`);
                    }
                    else {
                        await session.sendNack(0x0010, 'RGB validation failed');
                        console.error(`[rgb-bridge] Sent NACK for ${body.recipientId} via P2P`);
                    }
                })
                    .catch((err) => {
                    console.error(`[rgb-bridge] Receive error for ${body.recipientId}: ${err.message}`);
                })
                    .finally(() => {
                    destroySession(transferId);
                });
                console.error(`[rgb-bridge] Listening for ${body.recipientId} on topic ${b4a.toString(topic, 'hex').slice(0, 16)}...`);
                jsonResponse(res, 200, {
                    ok: true,
                    transferId,
                    topic: b4a.toString(topic, 'hex'),
                });
                return;
            }
            // ── POST /cancel/:recipientId ──
            if (type === 'cancel' && recipientId && req.method === 'POST') {
                const transferId = recipientToTransfer.get(recipientId);
                if (transferId) {
                    destroySession(transferId);
                    console.error(`[rgb-bridge] Cancelled listener for ${recipientId}`);
                }
                jsonResponse(res, 200, { ok: true });
                return;
            }
            // ── Require recipientId for remaining endpoints ──
            if (!type || (!recipientId && type !== 'health')) {
                jsonResponse(res, 400, { error: 'Missing type or recipientId' });
                return;
            }
            if (type === 'consignment') {
                if (req.method === 'POST') {
                    const body = await readBody(req);
                    if (mock || !keypair) {
                        pendingConsignments.set(recipientId, body);
                        console.error(`[rgb-bridge] Stored consignment for ${recipientId} (${body.length} bytes)`);
                        jsonResponse(res, 200, { ok: true });
                        return;
                    }
                    // Live mode: check for pre-registered send params
                    const sendParams = pendingSends.get(recipientId);
                    if (!sendParams) {
                        pendingConsignments.set(recipientId, body);
                        console.error(`[rgb-bridge] No send-prepare for ${recipientId}, stored locally (${body.length} bytes)`);
                        jsonResponse(res, 200, { ok: true });
                        return;
                    }
                    pendingSends.delete(recipientId);
                    const transferId = randomBytes(8).toString('hex');
                    const sessionStorage = makeSessionStorage(storageDir);
                    const nonce = b4a.from(sendParams.nonce, 'hex');
                    const receiverPubkey = b4a.from(sendParams.receiverPubkey, 'hex');
                    const sessionOpts = {
                        invoice: sendParams.invoice,
                        senderPubkey: keypair.publicKey,
                        nonce,
                        role: 'sender',
                        storage: sessionStorage,
                        keyPair: keypair,
                        receiverPubkey,
                        timeout: 120000,
                        ackTimeout: 300000,
                    };
                    if (testnet)
                        sessionOpts.dht = testnet.createNode();
                    const session = createSession(sessionOpts);
                    registerSession(transferId, session, 'sender', recipientId, sessionStorage);
                    try {
                        await session.open();
                        console.error(`[rgb-bridge] Sending consignment for ${recipientId} (${body.length} bytes) via P2P`);
                        const result = await session.sendConsignment(body);
                        pendingAcks.set(recipientId, result.isAck);
                        console.error(`[rgb-bridge] Send result for ${recipientId}: ${result.isAck ? 'ACK' : 'NACK'}`);
                        jsonResponse(res, 200, {
                            ok: true,
                            isAck: result.isAck,
                            errorCode: result.errorCode,
                            message: result.payloadString,
                        });
                    }
                    catch (err) {
                        const msg = err instanceof Error ? err.message : 'Send failed';
                        console.error(`[rgb-bridge] Send error for ${recipientId}: ${msg}`);
                        jsonResponse(res, 500, { error: msg });
                    }
                    finally {
                        destroySession(transferId);
                    }
                }
                else if (req.method === 'GET') {
                    const data = pendingConsignments.get(recipientId);
                    if (data) {
                        pendingConsignments.delete(recipientId);
                        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
                        res.end(data);
                    }
                    else {
                        jsonResponse(res, 404, { error: 'No consignment for this recipient' });
                    }
                }
                else {
                    jsonResponse(res, 405, { error: 'Method not allowed' });
                }
            }
            else if (type === 'ack') {
                if (req.method === 'POST') {
                    const body = await readBody(req);
                    const { ack } = JSON.parse(body.toString());
                    // Trigger ackResolver on the active receiver session (if any)
                    const transferId = recipientToTransfer.get(recipientId);
                    const entry = transferId ? activeSessions.get(transferId) : undefined;
                    if (entry && entry.role === 'receiver' && entry.ackResolver) {
                        entry.ackResolver(ack);
                        console.error(`[rgb-bridge] ACK decision for ${recipientId}: ${ack}`);
                    }
                    pendingAcks.set(recipientId, ack);
                    jsonResponse(res, 200, { ok: true });
                }
                else if (req.method === 'GET') {
                    const ack = pendingAcks.get(recipientId);
                    if (ack !== undefined) {
                        pendingAcks.delete(recipientId);
                        jsonResponse(res, 200, { ack });
                    }
                    else {
                        jsonResponse(res, 404, { error: 'No ACK for this recipient' });
                    }
                }
                else {
                    jsonResponse(res, 405, { error: 'Method not allowed' });
                }
            }
            else if (type === 'health') {
                jsonResponse(res, 200, {
                    status: 'ok',
                    mode: mock ? 'mock' : 'live',
                    pendingConsignments: pendingConsignments.size,
                    pendingAcks: pendingAcks.size,
                    pendingSends: pendingSends.size,
                    activeSessions: activeSessions.size,
                });
            }
            else {
                jsonResponse(res, 404, { error: `Unknown endpoint: ${type}` });
            }
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'Internal error';
            console.error(`[rgb-bridge] Error: ${msg}`);
            jsonResponse(res, 500, { error: msg });
        }
    });
    server.listen(port, '127.0.0.1', () => {
        console.error(`[rgb-bridge] Transport bridge listening on http://127.0.0.1:${port} (${mock ? 'mock' : 'live'})`);
    });
    return {
        server,
        stop: async () => {
            const destroyPromises = [];
            for (const [, entry] of activeSessions) {
                if (entry.timeoutTimer)
                    clearTimeout(entry.timeoutTimer);
                destroyPromises.push(entry.session.destroy().catch(() => { }));
                cleanupSessionStorage(entry.storagePath);
            }
            await Promise.all(destroyPromises);
            activeSessions.clear();
            recipientToTransfer.clear();
            pendingConsignments.clear();
            pendingAcks.clear();
            pendingSends.clear();
            server.close();
        },
    };
}
// Re-export utilities for use by brain logic
export { generateNonce, deriveTopic };
//# sourceMappingURL=transport-bridge.js.map