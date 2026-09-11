import {
  appendTerminalStream,
  createTerminalStreamState,
  MAX_TERMINAL_CHARS,
  stripInternalTerminalNoise,
  type TerminalStreamState,
} from './terminal';

const MAX_TERMINAL_LINES = 10_000;
const FLUSH_IDLE_MS = 32;

type TerminalListener = () => void;

export class TerminalLog {
  private buffer = '';
  private streamState: TerminalStreamState = createTerminalStreamState();
  private pending = '';
  private flushFrame = 0;
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<TerminalListener>();

  readonly lines: string[] = [''];
  revision = 0;

  subscribe(listener: TerminalListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getBuffer(): string {
    return this.buffer;
  }

  append(chunk: string): void {
    if (!chunk) {
      return;
    }
    this.pending += chunk;
    this.scheduleFlush();
  }

  clear(): void {
    this.pending = '';
    this.buffer = '';
    this.lines.length = 0;
    this.lines.push('');
    this.streamState = createTerminalStreamState();
    this.cancelScheduledFlush();
    this.bumpRevision();
  }

  private scheduleFlush(): void {
    if (this.flushFrame || this.flushTimer) {
      return;
    }
    this.flushFrame = requestAnimationFrame(() => {
      this.flushFrame = 0;
      this.flush();
      if (this.pending) {
        this.flushTimer = setTimeout(() => {
          this.flushTimer = undefined;
          this.scheduleFlush();
        }, FLUSH_IDLE_MS);
      }
    });
  }

  private cancelScheduledFlush(): void {
    if (this.flushFrame) {
      cancelAnimationFrame(this.flushFrame);
      this.flushFrame = 0;
    }
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  private flush(): void {
    if (!this.pending) {
      return;
    }
    const chunk = this.pending;
    this.pending = '';

    const previous = this.buffer;
    let next = stripInternalTerminalNoise(appendTerminalStream(previous, chunk, this.streamState));
    if (next.length > MAX_TERMINAL_CHARS) {
      next = next.slice(-MAX_TERMINAL_CHARS);
      this.buffer = next;
      this.streamState = createTerminalStreamState();
      this.rebuildLines();
      this.bumpRevision();
      return;
    }

    if (next.startsWith(previous)) {
      this.applySuffixDelta(next.slice(previous.length));
    } else {
      this.buffer = next;
      this.rebuildLines();
    }

    this.buffer = next;
    this.trimLines();
    this.bumpRevision();
  }

  private applySuffixDelta(delta: string): void {
    if (!delta) {
      return;
    }
    const parts = delta.split('\n');
    if (parts.length === 1) {
      this.lines[this.lines.length - 1] += parts[0];
      return;
    }
    this.lines[this.lines.length - 1] += parts[0];
    for (let index = 1; index < parts.length; index += 1) {
      this.lines.push(parts[index]);
    }
  }

  private rebuildLines(): void {
    this.lines.length = 0;
    for (const line of this.buffer.split('\n')) {
      this.lines.push(line);
    }
    if (this.lines.length === 0) {
      this.lines.push('');
    }
  }

  private trimLines(): void {
    if (this.lines.length <= MAX_TERMINAL_LINES) {
      return;
    }
    const drop = this.lines.length - MAX_TERMINAL_LINES;
    this.lines.splice(0, drop);
    this.buffer = this.lines.join('\n');
  }

  private bumpRevision(): void {
    this.revision += 1;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
