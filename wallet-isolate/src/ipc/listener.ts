/**
 * IPC Listener — stdin JSON-lines reader with schema validation.
 *
 * Reads newline-delimited JSON from stdin, validates each message
 * against the IPCRequest schema. Malformed messages are silently
 * dropped and logged to the audit trail.
 *
 * @security This module is a trust boundary. Every byte from stdin
 * is untrusted input from the Agent Brain process.
 */

import { validateIPCRequest, type IPCRequest } from './types.js';

export type MessageHandler = (request: IPCRequest) => void;
export type MalformedHandler = (line: string, error: string) => void;

export class IPCListener {
  private buffer = '';
  private readonly onMessage: MessageHandler;
  private readonly onMalformed: MalformedHandler;

  constructor(onMessage: MessageHandler, onMalformed: MalformedHandler) {
    this.onMessage = onMessage;
    this.onMalformed = onMalformed;
  }

  /**
   * Feed raw data from stdin into the listener.
   * Processes complete lines and buffers partial input.
   */
  feed(chunk: string): void {
    this.buffer += chunk;

    let newlineIdx = this.buffer.indexOf('\n');
    while (newlineIdx !== -1) {
      const line = this.buffer.slice(0, newlineIdx).trim();
      this.buffer = this.buffer.slice(newlineIdx + 1);

      if (line.length > 0) {
        this.processLine(line);
      }

      newlineIdx = this.buffer.indexOf('\n');
    }
  }

  private processLine(line: string): void {
    // Parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      this.onMalformed(line, 'Invalid JSON');
      return;
    }

    // Validate schema
    const request = validateIPCRequest(parsed);
    if (request === null) {
      this.onMalformed(line, 'Failed schema validation');
      return;
    }

    this.onMessage(request);
  }
}
