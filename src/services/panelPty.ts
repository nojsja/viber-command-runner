import * as fs from 'fs';
import * as path from 'path';
import type * as Pty from 'node-pty';

let cached: typeof Pty | undefined;

/** Prefer the editor-bundled node-pty (Electron ABI); fall back to the extension dependency. */
export function loadPanelPty(): typeof Pty {
  if (cached) {
    return cached;
  }

  const candidates = [
    path.join(path.dirname(process.execPath), '../../../../Resources/app/node_modules/node-pty'),
    path.join(path.dirname(process.execPath), '../../../node_modules/node-pty'),
    'node-pty',
  ];

  const errors: string[] = [];
  for (const candidate of candidates) {
    if (candidate !== 'node-pty' && !fs.existsSync(candidate)) {
      continue;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      cached = require(candidate) as typeof Pty;
      return cached;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${candidate}: ${message}`);
    }
  }

  throw new Error(`node-pty is not available (${errors.join('; ')})`);
}

/** PTY terminals expect carriage return to submit a line. */
export function formatPtyInput(text: string): string {
  const line = text.replace(/[\r\n]+$/, '');
  return line.length === 0 ? '\r' : `${line}\r`;
}
