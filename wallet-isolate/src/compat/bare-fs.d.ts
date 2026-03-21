/**
 * Type declarations for bare-fs — Bare Runtime's filesystem module.
 * API-compatible with Node.js fs for the subset we use.
 */
declare module 'bare-fs' {
  export function readFileSync(path: string, encoding: 'utf-8'): string;
  export function appendFileSync(path: string, data: string): void;
}
