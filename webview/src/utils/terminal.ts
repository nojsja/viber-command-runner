export const MAX_TERMINAL_CHARS = 500_000;
export const TERMINAL_DEFAULT_PROMPT = '>';

const PROMPT_CONTEXT_LINES = 20;

export interface TerminalStreamState {
  carry: string;
  cursorCol: number;
}

export function createTerminalStreamState(): TerminalStreamState {
  return { carry: '', cursorCol: 0 };
}

function linePrefix(output: string): string {
  const lastNewline = output.lastIndexOf('\n');
  return lastNewline >= 0 ? output.slice(0, lastNewline + 1) : '';
}

function currentLine(output: string): string {
  const lastNewline = output.lastIndexOf('\n');
  return lastNewline >= 0 ? output.slice(lastNewline + 1) : output;
}

function replaceCurrentLine(output: string, line: string): string {
  return `${linePrefix(output)}${line}`;
}

function writeAtCursor(output: string, cursorCol: number, ch: string): { output: string; cursorCol: number } {
  const line = currentLine(output);
  const col = Math.max(0, cursorCol);
  if (col >= line.length) {
    const nextLine = line + ch;
    return {
      output: replaceCurrentLine(output, nextLine),
      cursorCol: nextLine.length,
    };
  }
  const nextLine = `${line.slice(0, col)}${ch}${line.slice(col + 1)}`;
  return {
    output: replaceCurrentLine(output, nextLine),
    cursorCol: col + 1,
  };
}

type CsiAction =
  | { type: 'cursor_col'; col: number }
  | { type: 'cursor_left'; count: number }
  | { type: 'cursor_right'; count: number }
  | { type: 'erase_line' }
  | { type: 'erase_eol' };

type ParsedCsi = { length: number; action: CsiAction | null };

function parseCsiSequence(data: string, start: number): ParsedCsi | null {
  if (data[start] !== '\x1b' || data[start + 1] !== '[') {
    return null;
  }

  let index = start + 2;
  if ('?>=!'.includes(data[index] ?? '')) {
    index += 1;
  }

  const params: number[] = [];
  let current = '';
  while (index < data.length) {
    const ch = data[index];
    if (ch >= '0' && ch <= '9') {
      current += ch;
      index += 1;
      continue;
    }
    if (ch === ';') {
      params.push(current ? Number(current) : 0);
      current = '';
      index += 1;
      continue;
    }
    if (ch >= '@' && ch <= '~') {
      if (current) {
        params.push(Number(current));
      }
      index += 1;
      const length = index - start;
      if (ch === 'G') {
        return { length, action: { type: 'cursor_col', col: Math.max(0, (params[0] || 1) - 1) } };
      }
      if (ch === 'D') {
        return { length, action: { type: 'cursor_left', count: params[0] || 1 } };
      }
      if (ch === 'C') {
        return { length, action: { type: 'cursor_right', count: params[0] || 1 } };
      }
      if (ch === 'K') {
        if (params[0] === 2) {
          return { length, action: { type: 'erase_line' } };
        }
        return { length, action: { type: 'erase_eol' } };
      }
      return { length, action: null };
    }
    return null;
  }
  return null;
}

function applyCsiAction(output: string, cursorCol: number, action: CsiAction): { output: string; cursorCol: number } {
  switch (action.type) {
    case 'cursor_col':
      return { output, cursorCol: action.col };
    case 'cursor_left':
      return { output, cursorCol: Math.max(0, cursorCol - action.count) };
    case 'cursor_right':
      return { output, cursorCol: Math.min(currentLine(output).length, cursorCol + action.count) };
    case 'erase_line':
      return { output: replaceCurrentLine(output, ''), cursorCol: 0 };
    case 'erase_eol': {
      const line = currentLine(output).slice(0, cursorCol);
      return { output: replaceCurrentLine(output, line), cursorCol };
    }
    default:
      return { output, cursorCol };
  }
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

/** Append PTY output to a plain-text buffer with CR/CSI cursor handling for spinners and progress lines. */
export function appendTerminalStream(
  buffer: string,
  chunk: string,
  state: TerminalStreamState,
): string {
  const data = state.carry + chunk;
  state.carry = '';

  let output = buffer;
  let cursorCol = state.cursorCol;
  let index = 0;
  while (index < data.length) {
    const ch = data[index];

    const csi = parseCsiSequence(data, index);
    if (csi) {
      if (csi.action) {
        const applied = applyCsiAction(output, cursorCol, csi.action);
        output = applied.output;
        cursorCol = applied.cursorCol;
      }
      index += csi.length;
      continue;
    }
    if (ch === '\x1b' && data[index + 1] === '[') {
      const escapeLength = consumeEscapeSequence(data, index);
      if (escapeLength > 0) {
        index += escapeLength;
        continue;
      }
      state.carry = data.slice(index);
      break;
    }

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
        cursorCol = 0;
        index += 2;
      } else {
        cursorCol = 0;
        index += 1;
      }
      continue;
    }

    if (ch === '\n') {
      output += '\n';
      cursorCol = 0;
      index += 1;
      continue;
    }

    if (ch === '\b') {
      cursorCol = Math.max(0, cursorCol - 1);
      index += 1;
      continue;
    }

    const written = writeAtCursor(output, cursorCol, ch);
    output = written.output;
    cursorCol = written.cursorCol;
    index += 1;
  }

  state.cursorCol = cursorCol;
  return output;
}

/** Hide shell-echoed exit markers from the rendered terminal log. */
export function stripInternalTerminalNoise(text: string): string {
  return String(text)
    .replace(/; builtin print -r -- '__VIBER_EXIT_[^'\n]+'\n?/g, '')
    .replace(/; command printf '%s\\n' '__VIBER_EXIT_[^'\n]+'\n?/g, '')
    .replace(/__VIBER_EXIT_[a-f0-9-]+\d+__\n?/gi, '');
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

export function isScrolledToBottom(node: HTMLElement, threshold = 0): boolean {
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
