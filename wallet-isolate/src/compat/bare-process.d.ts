/**
 * Type declarations for bare-process — Bare Runtime's process module.
 * Provides Node.js-compatible process API subset.
 */
declare module 'bare-process' {
  interface BareReadStream {
    setEncoding(encoding: string): void;
    on(event: 'data', handler: (chunk: string) => void): void;
    on(event: 'end', handler: () => void): void;
  }

  interface BareWriteStream {
    write(data: string): boolean;
  }

  interface BareProcess {
    env: Record<string, string | undefined>;
    stdin: BareReadStream;
    stdout: BareWriteStream;
    stderr: BareWriteStream;
    exit(code?: number): never;
    on(event: 'SIGTERM' | 'SIGINT', handler: () => void): void;
  }

  const process: BareProcess;
  export default process;
}
