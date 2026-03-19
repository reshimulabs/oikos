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
export interface AuthConfig {
    enabled: boolean;
    hash: string | null;
    salt: string | null;
    threshold: number;
    timeoutMinutes: number;
    requireForPolicyChanges: boolean;
    requireForStrategyActivation: boolean;
}
export interface AuthStatus {
    enabled: boolean;
    threshold: number;
    timeoutMinutes: number;
    authenticated: boolean;
    expiresAt: number | null;
    requireForPolicyChanges: boolean;
    requireForStrategyActivation: boolean;
}
export interface PendingAuth {
    proposalId: string;
    description: string;
    amount: number;
    createdAt: number;
    expiresAt: number;
    resolved: boolean;
    approved: boolean;
    resolver?: (approved: boolean) => void;
}
export declare class PassphraseAuth {
    private config;
    private lastAuthAt;
    private pendingAuths;
    constructor();
    private loadConfig;
    private saveConfig;
    /** Set up passphrase auth. Returns true on success. */
    setup(passphrase: string, options?: {
        threshold?: number;
        timeoutMinutes?: number;
    }): boolean;
    /** Disable passphrase auth. Requires current passphrase. */
    disable(passphrase: string): boolean;
    /** Change passphrase. Requires current passphrase. */
    change(currentPassphrase: string, newPassphrase: string): boolean;
    /** Update threshold and timeout without changing passphrase. */
    updateSettings(options: {
        threshold?: number;
        timeoutMinutes?: number;
        requireForPolicyChanges?: boolean;
        requireForStrategyActivation?: boolean;
    }): void;
    /** Verify a passphrase. Returns true if correct. Records auth timestamp. */
    verify(passphrase: string): boolean;
    /** Check if currently within the auth timeout window. */
    isAuthenticated(): boolean;
    /**
     * Check if a proposal requires authorization.
     * Returns true if auth is needed (not yet authorized).
     */
    requiresAuth(amountUsdt: number, operationType: 'payment' | 'swap' | 'bridge' | 'yield' | 'policy' | 'strategy'): boolean;
    getStatus(): AuthStatus;
    /** Create a pending auth request. Returns proposalId and auth URL path. */
    createPendingAuth(description: string, amount: number): PendingAuth;
    /** Get a pending auth request by ID. */
    getPending(proposalId: string): PendingAuth | undefined;
    /** Resolve a pending auth (verify passphrase + approve/reject). */
    resolvePending(proposalId: string, passphrase: string): boolean;
    /** Wait for a pending auth to be resolved (async). Returns true if approved. */
    waitForAuth(proposalId: string, timeoutMs?: number): Promise<boolean>;
    /** Get all pending (unresolved) auth requests. */
    getPendingList(): PendingAuth[];
    private cleanupExpired;
}
//# sourceMappingURL=passphrase.d.ts.map