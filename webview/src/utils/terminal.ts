export const MAX_TERMINAL_CHARS = 500_000;
export const TERMINAL_DEFAULT_PROMPT = '>';

const PROMPT_CONTEXT_LINES = 20;

export interface TerminalStreamState {
  carry: string;
}

export function createTerminalStreamState(): TerminalStreamState {
  return { carry: '' };
}

function consumeOscBody(data: string, start: number): number {
  let index = start;
  while (index < data.length) {
    const ch = data[index];
    if (ch === '\x07') {
      return index - start + 1;
    }
    if (ch === '\x1b' && data[index + 1] === '\\') {
      return index - start + 2;
    }
    index += 1;
  }
  return 0;
}

function consumeEscapeSequence(data: string, start: number): number {
  if (data[start] !== '\x1b') {
    return 0;
  }
  if (start + 1 >= data.length) {
    return 0;
  }

  const next = data[start + 1];
  if (next === ']') {
    const bodyLength = consumeOscBody(data, start + 2);
    return bodyLength === 0 ? 0 : 2 + bodyLength;
  }

  if (next === '[') {
    let index = start + 2;
    while (index < data.length) {
      const ch = data[index];
      if (ch >= '@' && ch <= '~') {
        return index - start + 1;
      }
      index += 1;
    }
    return 0;
  }

  if ('() #%-'.includes(next)) {
    return start + 2 < data.length ? 3 : 0;
  }

  return start + 1 < data.length ? 2 : 0;
}

function consumeOrphanOsc(data: string, start: number): number {
  if (data[start] !== ']' || !/\d/.test(data[start + 1] ?? '')) {
    return 0;
  }
  const bodyLength = consumeOscBody(data, start + 1);
  return bodyLength === 0 ? 0 : 1 + bodyLength;
}

/** Append PTY output to a plain-text buffer with correct CR and escape handling. */
export function appendTerminalStream(
  buffer: string,
  chunk: string,
  state: TerminalStreamState,
): string {
  const data = state.carry + chunk;
  state.carry = '';

  let output = buffer;
  let index = 0;
  while (index < data.length) {
    const ch = data[index];

    const escapeLength = consumeEscapeSequence(data, index);
    if (escapeLength > 0) {
      index += escapeLength;
      continue;
    }
    if (ch === '\x1b') {
      state.carry = data.slice(index);
      break;
    }

    const orphanOscLength = consumeOrphanOsc(data, index);
    if (orphanOscLength > 0) {
      index += orphanOscLength;
      continue;
    }
    if (ch === ']' && /\d/.test(data[index + 1] ?? '')) {
      state.carry = data.slice(index);
      break;
    }

    if (ch === '\x07') {
      index += 1;
      continue;
    }

    if (ch === '\r') {
      if (data[index + 1] === '\n') {
        output += '\n';
        index += 2;
      } else {
        const lastNewline = output.lastIndexOf('\n');
        output = lastNewline >= 0 ? output.slice(0, lastNewline + 1) : '';
        index += 1;
      }
      continue;
    }

    output += ch;
    index += 1;
  }

  return output;
}

export function stripAnsiForDisplay(text: string): string {
  return String(text)
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[?:0-9;]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[()%#\- ]./g, '')
    .replace(/\][0-9]+;[^\x07\n]*(?:\x07|\x1b\\)?/g, '')
    .replace(/\x07/g, '');
}

export function stripAnsi(text: string): string {
  return stripAnsiForDisplay(text);
}

/** @deprecated Use appendTerminalStream for PTY output. */
export function sanitizeTerminalOutput(text: string): string {
  return stripAnsiForDisplay(text);
}

/** @deprecated Use appendTerminalStream for PTY output. */
export function normalizeTerminalNewlines(text: string): string {
  const state = createTerminalStreamState();
  return appendTerminalStream('', text, state);
}

/** @deprecated Use appendTerminalStream for PTY output. */
export function formatTerminalChunk(chunk: string): string {
  const state = createTerminalStreamState();
  return appendTerminalStream('', chunk, state);
}

function isShellPromptLine(line: string): boolean {
  const trimmed = stripAnsiForDisplay(line).trimEnd();
  if (!trimmed) {
    return false;
  }
  if (/[➜❯]\s/.test(trimmed)) {
    return true;
  }
  if (/^%\s/.test(trimmed) || /\s%\s*$/.test(trimmed)) {
    return true;
  }
  if (/\bgit:\([^)]+\)/.test(trimmed)) {
    return true;
  }
  if (/>\s*$/.test(trimmed) && trimmed.length < 160) {
    return true;
  }
  return false;
}

export function detectTerminalPrompt(buffer: string): string {
  const clean = stripAnsiForDisplay(buffer).trimEnd();
  if (!clean) {
    return TERMINAL_DEFAULT_PROMPT;
  }
  const lines = clean.split('\n');
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    const winPrompt = line.match(/([A-Za-z]:\\(?:[^>\n\\]|\\.)*>)\s*$/);
    if (winPrompt) {
      return winPrompt[1];
    }
    if (/>\s*$/.test(line)) {
      const generic = line.match(/(.*?>\s*)$/);
      if (generic) {
        return generic[1].trimEnd();
      }
      return '>';
    }
    if (/\$\s*$/.test(line)) {
      return '$';
    }
  }
  return TERMINAL_DEFAULT_PROMPT;
}

export function stripTrailingPromptLine(buffer: string, prompt: string): string {
  if (!buffer) {
    return buffer;
  }
  const clean = stripAnsiForDisplay(buffer);
  const lines = clean.split('\n');
  const lastLine = lines[lines.length - 1] ?? '';
  if (isShellPromptLine(lastLine)) {
    const withoutPrompt = lines.slice(0, -1).join('\n');
    if (withoutPrompt.length < buffer.length) {
      return withoutPrompt;
    }
    const promptIndex = buffer.lastIndexOf(lastLine);
    return promptIndex > 0 ? buffer.slice(0, promptIndex) : '';
  }
  if (!prompt) {
    return buffer;
  }
  const normalizedPrompt = prompt.trimEnd();
  const normalizedLast = lastLine.trimEnd();
  if (normalizedLast !== normalizedPrompt && !normalizedLast.endsWith(normalizedPrompt)) {
    return buffer;
  }
  const promptIndex = clean.lastIndexOf(lastLine);
  if (promptIndex <= 0) {
    return '';
  }
  return buffer.slice(0, promptIndex);
}

export function splitPromptContext(
  buffer: string,
  prompt: string,
): { context: string; promptLines: string } {
  const cleanBuffer = stripAnsiForDisplay(buffer).trimEnd();
  const cleanPrompt = stripAnsiForDisplay(prompt).trim();
  const lines = cleanBuffer ? cleanBuffer.split('\n') : [];
  const promptLines = cleanPrompt ? cleanPrompt.split('\n').filter((line) => line.trim()) : [];
  let cutIndex = lines.length;

  if (promptLines.length > 0) {
    const anchor = promptLines[promptLines.length - 1].trim();
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index].trim();
      if (!line) {
        continue;
      }
      if (line.includes(anchor) || (line.length > 10 && anchor.includes(line))) {
        cutIndex = index;
        break;
      }
    }
  }

  let contextStart = Math.max(0, cutIndex - PROMPT_CONTEXT_LINES);
  for (let index = cutIndex - 1; index >= contextStart; index -= 1) {
    const line = lines[index]?.trim() ?? '';
    if (!line) {
      continue;
    }
    if (/^\[\d+\/\d+\]/.test(line)) {
      contextStart = index;
      break;
    }
    if (/可用的|设备|device|APK|apk/i.test(line)) {
      contextStart = Math.min(contextStart, index);
    }
    if (/^\s*\d+\)/.test(line)) {
      contextStart = Math.min(contextStart, index);
    }
  }

  const context = lines.slice(contextStart, cutIndex).join('\n').trim();
  const promptDisplay = lines.slice(cutIndex).join('\n').trim() || cleanPrompt;

  return {
    context,
    promptLines: promptDisplay,
  };
}

export function terminalPreviewLine(buffer: string): string {
  const clean = buffer.trimEnd();
  if (!clean) {
    return '';
  }
  const lines = clean.split('\n').filter((line) => line.trim());
  if (!lines.length) {
    return '';
  }
  const last = lines[lines.length - 1].trim();
  return last.length > 96 ? `${last.slice(0, 93)}...` : last;
}

export function isScrolledToBottom(node: HTMLElement, threshold = 12): boolean {
  return node.scrollHeight - node.scrollTop - node.clientHeight <= threshold;
}

export function handleTerminalShortcut(
  event: KeyboardEvent,
  handlers: {
    onSubmit?: () => void;
    onClearLine?: () => void;
    onInterrupt?: () => void;
    onClearScreen?: () => void;
  },
): boolean {
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();

  if (event.key === 'Enter' && handlers.onSubmit) {
    event.preventDefault();
    handlers.onSubmit();
    return true;
  }
  if (event.key === 'Escape' && handlers.onClearLine) {
    event.preventDefault();
    handlers.onClearLine();
    return true;
  }
  if (mod && key === 'c' && handlers.onInterrupt) {
    event.preventDefault();
    handlers.onInterrupt();
    return true;
  }
  if (mod && key === 'l' && handlers.onClearScreen) {
    event.preventDefault();
    handlers.onClearScreen();
    return true;
  }
  return false;
}
