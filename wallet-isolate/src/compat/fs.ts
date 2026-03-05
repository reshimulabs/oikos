/**
 * Runtime-agnostic filesystem access.
 *
 * Bare Runtime provides `bare-fs` (bundled in the runtime).
 * Node.js provides built-in `fs`.
 * Both have compatible APIs for readFileSync / appendFileSync.
 *
 * This module tries bare-fs first (Bare Runtime), falls back to
 * Node.js fs. The detection happens once at module load via
 * top-level await.
 */

type ReadFileSyncFn = (path: string, encoding: 'utf-8') => string;
type AppendFileSyncFn = (path: string, data: string) => void;

interface FsSubset {
  readFileSync: ReadFileSyncFn;
  appendFileSync: AppendFileSyncFn;
}

async function loadFs(): Promise<FsSubset> {
  try {
    // Bare Runtime — bare-fs is bundled in the runtime
    const mod: FsSubset = await import('bare-fs');
    return mod;
  } catch {
    // Node.js — use built-in fs
    const mod = await import('fs');
    return {
      readFileSync: mod.readFileSync as ReadFileSyncFn,
      appendFileSync: mod.appendFileSync as AppendFileSyncFn
    };
  }
}

const fs = await loadFs();

export const readFileSync: ReadFileSyncFn = fs.readFileSync;
export const appendFileSync: AppendFileSyncFn = fs.appendFileSync;
