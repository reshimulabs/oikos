/**
 * ERC-8004 Identity Persistence — load/save agentId to disk.
 *
 * Prevents re-registration on every restart (which would mint a new NFT).
 * Same pattern as swarm keypair persistence in `swarm/identity.ts`.
 *
 * File: `.oikos-identity.json` (alongside `.oikos-keypair.json`).
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/** Persisted identity state — what survives restarts. */
export interface PersistedIdentity {
  agentId: string;
  walletSet: boolean;
  agentURI: string;
  registrationTxHash: string;
  registeredAt: string; // ISO 8601
}

/**
 * Load persisted identity from disk.
 * Returns null if file doesn't exist or is malformed.
 */
export function loadIdentity(path: string): PersistedIdentity | null {
  if (!existsSync(path)) return null;

  try {
    const raw = readFileSync(path, 'utf-8');
    const data = JSON.parse(raw) as Record<string, unknown>;

    // Validate required fields
    if (typeof data['agentId'] !== 'string' || data['agentId'].length === 0) return null;
    if (typeof data['registeredAt'] !== 'string') return null;

    return {
      agentId: data['agentId'] as string,
      walletSet: data['walletSet'] === true,
      agentURI: (data['agentURI'] as string) ?? '',
      registrationTxHash: (data['registrationTxHash'] as string) ?? '',
      registeredAt: data['registeredAt'] as string,
    };
  } catch {
    // Malformed file — treat as not registered
    return null;
  }
}

/**
 * Save identity state to disk. Overwrites existing file.
 */
export function saveIdentity(path: string, identity: PersistedIdentity): void {
  writeFileSync(path, JSON.stringify(identity, null, 2), 'utf-8');
}
