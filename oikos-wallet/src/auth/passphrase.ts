/**
 * Passphrase Authentication Module
 *
 * Opt-in security layer for high-value operations.
 * The passphrase is NEVER sent to the LLM, NEVER transmitted over
 * companion channels, and NEVER logged. It's verified locally
 * (in the Pear app, CLI, or dashboard) and only a boolean
 * "authorized" signal reaches the Brain.
 *
 * Storage: ~/.oikos/auth.json
 * Hash: SHA-256 + random salt
 * Timeout: configurable (default 15 min)
 */

import { createHash, randomBytes } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ── Types ──

export interface AuthConfig {
  enabled: boolean;
  hash: string | null;       // SHA-256 hex
  salt: string | null;       // random hex salt
  threshold: number;         // USDT amount above which auth is required
  timeoutMinutes: number;    // how long auth stays valid
  requireForPolicyChanges: boolean;  // always require for policy edits
  requireForStrategyActivation: boolean;  // always require for new strategies
}

export interface AuthStatus {
  enabled: boolean;
  threshold: number;
  timeoutMinutes: number;
  authenticated: boolean;    // currently within timeout window
  expiresAt: number | null;  // epoch ms when current auth expires
  requireForPolicyChanges: boolean;
  requireForStrategyActivation: boolean;
}

export interface PendingAuth {
  proposalId: string;
  description: string;     // human-readable summary
  amount: number;          // USDT-equivalent
  createdAt: number;       // epoch ms
  expiresAt: number;       // epoch ms (5 min default)
  resolved: boolean;
  approved: boolean;
  resolver?: (approved: boolean) => void;  // promise resolver
}

// ── Constants ──

const AUTH_DIR = join(homedir(), '.oikos');
const AUTH_FILE = join(AUTH_DIR, 'auth.json');
const DEFAULT_CONFIG: AuthConfig = {
  enabled: false,
  hash: null,
  salt: null,
  threshold: 100,           // 100 USDT default
  timeoutMinutes: 15,
  requireForPolicyChanges: true,
  requireForStrategyActivation: true,
};
const PENDING_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes for pending auth requests

// ── Hashing ──

function hashPassphrase(passphrase: string, salt: string): string {
  return createHash('sha256').update(salt + passphrase).digest('hex');
}

function generateSalt(): string {
  return randomBytes(32).toString('hex');
}

// ── Auth Manager ──

export class PassphraseAuth {
  private config: AuthConfig;
  private lastAuthAt: number = 0;  // epoch ms of last successful auth
  private pendingAuths: Map<string, PendingAuth> = new Map();

  constructor() {
    this.config = this.loadConfig();
  }

  // ── Config Management ──

  private loadConfig(): AuthConfig {
    try {
      if (existsSync(AUTH_FILE)) {
        const raw = readFileSync(AUTH_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<AuthConfig>;
        return { ...DEFAULT_CONFIG, ...parsed };
      }
    } catch {
      // Corrupted config — use defaults
    }
    return { ...DEFAULT_CONFIG };
  }

  private saveConfig(): void {
    try {
      if (!existsSync(AUTH_DIR)) {
        mkdirSync(AUTH_DIR, { recursive: true });
      }
      writeFileSync(AUTH_FILE, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (err) {
      console.error('[auth] Failed to save config:', err instanceof Error ? err.message : err);
    }
  }

  // ── Setup & Management ──

  /** Set up passphrase auth. Returns true on success. */
  setup(passphrase: string, options?: { threshold?: number; timeoutMinutes?: number }): boolean {
    if (!passphrase || passphrase.length < 4) {
      return false; // Minimum 4 characters
    }

    const salt = generateSalt();
    const hash = hashPassphrase(passphrase, salt);

    this.config.enabled = true;
    this.config.hash = hash;
    this.config.salt = salt;
    if (options?.threshold !== undefined) this.config.threshold = options.threshold;
    if (options?.timeoutMinutes !== undefined) this.config.timeoutMinutes = options.timeoutMinutes;

    this.saveConfig();
    console.log('[auth] Passphrase auth enabled. Threshold:', this.config.threshold, 'USDT');
    return true;
  }

  /** Disable passphrase auth. Requires current passphrase. */
  disable(passphrase: string): boolean {
    if (!this.verify(passphrase)) return false;
    this.config.enabled = false;
    this.config.hash = null;
    this.config.salt = null;
    this.lastAuthAt = 0;
    this.saveConfig();
    console.log('[auth] Passphrase auth disabled.');
    return true;
  }

  /** Change passphrase. Requires current passphrase. */
  change(currentPassphrase: string, newPassphrase: string): boolean {
    if (!this.verify(currentPassphrase)) return false;
    if (!newPassphrase || newPassphrase.length < 4) return false;

    const salt = generateSalt();
    this.config.hash = hashPassphrase(newPassphrase, salt);
    this.config.salt = salt;
    this.saveConfig();
    console.log('[auth] Passphrase changed.');
    return true;
  }

  /** Update threshold and timeout without changing passphrase. */
  updateSettings(options: { threshold?: number; timeoutMinutes?: number; requireForPolicyChanges?: boolean; requireForStrategyActivation?: boolean }): void {
    if (options.threshold !== undefined) this.config.threshold = options.threshold;
    if (options.timeoutMinutes !== undefined) this.config.timeoutMinutes = options.timeoutMinutes;
    if (options.requireForPolicyChanges !== undefined) this.config.requireForPolicyChanges = options.requireForPolicyChanges;
    if (options.requireForStrategyActivation !== undefined) this.config.requireForStrategyActivation = options.requireForStrategyActivation;
    this.saveConfig();
  }

  // ── Verification ──

  /** Verify a passphrase. Returns true if correct. Records auth timestamp. */
  verify(passphrase: string): boolean {
    if (!this.config.enabled || !this.config.hash || !this.config.salt) {
      return true; // Auth not enabled — always passes
    }
    const hash = hashPassphrase(passphrase, this.config.salt);
    const valid = hash === this.config.hash;
    if (valid) {
      this.lastAuthAt = Date.now();
    }
    return valid;
  }

  /** Check if currently within the auth timeout window. */
  isAuthenticated(): boolean {
    if (!this.config.enabled) return true;
    if (this.lastAuthAt === 0) return false;
    const elapsed = Date.now() - this.lastAuthAt;
    return elapsed < this.config.timeoutMinutes * 60 * 1000;
  }

  // ── Authorization Check ──

  /**
   * Check if a proposal requires authorization.
   * Returns true if auth is needed (not yet authorized).
   */
  requiresAuth(amountUsdt: number, operationType: 'payment' | 'swap' | 'bridge' | 'yield' | 'policy' | 'strategy'): boolean {
    if (!this.config.enabled) return false;
    if (this.isAuthenticated()) return false; // Within timeout window

    // Policy changes always require auth if configured
    if (operationType === 'policy' && this.config.requireForPolicyChanges) return true;
    if (operationType === 'strategy' && this.config.requireForStrategyActivation) return true;

    // Financial operations: check threshold
    return amountUsdt >= this.config.threshold;
  }

  // ── Status ──

  getStatus(): AuthStatus {
    const authenticated = this.isAuthenticated();
    let expiresAt: number | null = null;
    if (authenticated && this.lastAuthAt > 0) {
      expiresAt = this.lastAuthAt + this.config.timeoutMinutes * 60 * 1000;
    }

    return {
      enabled: this.config.enabled,
      threshold: this.config.threshold,
      timeoutMinutes: this.config.timeoutMinutes,
      authenticated,
      expiresAt,
      requireForPolicyChanges: this.config.requireForPolicyChanges,
      requireForStrategyActivation: this.config.requireForStrategyActivation,
    };
  }

  // ── Pending Auth Requests (for remote/async authorization) ──

  /** Create a pending auth request. Returns proposalId and auth URL path. */
  createPendingAuth(description: string, amount: number): PendingAuth {
    const proposalId = 'auth_' + Date.now().toString(36) + '_' + randomBytes(4).toString('hex');
    const pending: PendingAuth = {
      proposalId,
      description,
      amount,
      createdAt: Date.now(),
      expiresAt: Date.now() + PENDING_EXPIRY_MS,
      resolved: false,
      approved: false,
    };
    this.pendingAuths.set(proposalId, pending);

    // Cleanup expired
    this.cleanupExpired();

    return pending;
  }

  /** Get a pending auth request by ID. */
  getPending(proposalId: string): PendingAuth | undefined {
    const pending = this.pendingAuths.get(proposalId);
    if (pending && Date.now() > pending.expiresAt) {
      pending.resolved = true;
      pending.approved = false;
      return pending;
    }
    return pending;
  }

  /** Resolve a pending auth (verify passphrase + approve/reject). */
  resolvePending(proposalId: string, passphrase: string): boolean {
    const pending = this.pendingAuths.get(proposalId);
    if (!pending || pending.resolved || Date.now() > pending.expiresAt) {
      return false;
    }

    const valid = this.verify(passphrase);
    pending.resolved = true;
    pending.approved = valid;

    if (pending.resolver) {
      pending.resolver(valid);
    }

    return valid;
  }

  /** Wait for a pending auth to be resolved (async). Returns true if approved. */
  waitForAuth(proposalId: string, timeoutMs?: number): Promise<boolean> {
    const pending = this.pendingAuths.get(proposalId);
    if (!pending) return Promise.resolve(false);
    if (pending.resolved) return Promise.resolve(pending.approved);

    const timeout = timeoutMs || PENDING_EXPIRY_MS;
    return new Promise<boolean>((resolve) => {
      pending.resolver = resolve;

      // Timeout fallback
      setTimeout(() => {
        if (!pending.resolved) {
          pending.resolved = true;
          pending.approved = false;
          resolve(false);
        }
      }, timeout);
    });
  }

  /** Get all pending (unresolved) auth requests. */
  getPendingList(): PendingAuth[] {
    this.cleanupExpired();
    return Array.from(this.pendingAuths.values()).filter(p => !p.resolved);
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [id, pending] of this.pendingAuths) {
      if (now > pending.expiresAt + 60000) { // cleanup 1 min after expiry
        this.pendingAuths.delete(id);
      }
    }
  }
}
