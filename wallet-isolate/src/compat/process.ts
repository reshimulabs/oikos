/**
 * Runtime-agnostic process access.
 *
 * Bare Runtime provides `bare-process` (must be imported).
 * Node.js has `process` as a global.
 *
 * This module exports a unified process interface that works on both.
 */

/** Minimal process interface — only what wallet-isolate actually uses. */
export interface RuntimeProcess {
  env: Record<string, string | undefined>;
  stdin: {
    setEncoding(encoding: string): void;
    on(event: 'data', handler: (chunk: string) => void): void;
    on(event: 'end', handler: () => void): void;
  };
  stdout: {
    write(data: string): boolean;
  };
  exit(code?: number): never;
  on(event: 'SIGTERM' | 'SIGINT', handler: () => void): void;
}

async function loadProcess(): Promise<RuntimeProcess> {
  // Check if Node.js process global exists
  if (typeof globalThis !== 'undefined' && 'process' in globalThis) {
    const gProcess = (globalThis as { process: RuntimeProcess }).process;
    if (gProcess && typeof gProcess.exit === 'function') {
      return gProcess;
    }
  }

  // Bare Runtime — import from bare-process
  const mod = await import('bare-process');
  return mod.default as RuntimeProcess;
}

/** Process instance — resolved once at module load. */
export const proc: RuntimeProcess = await loadProcess();
