export const MAX_TERMINAL_CHARS = 500_000;
export const TERMINAL_DEFAULT_PROMPT = '>';

const PROMPT_CONTEXT_LINES = 20;

export function stripAnsi(text: string): string {
  return String(text).replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
}

export function detectTerminalPrompt(buffer: string): string {
  const clean = stripAnsi(buffer).trimEnd();
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
  if (!buffer || !prompt) {
    return buffer;
  }
  const clean = stripAnsi(buffer);
  const lines = clean.split('\n');
  const lastLine = lines[lines.length - 1] ?? '';
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
  const cleanBuffer = stripAnsi(buffer).trimEnd();
  const cleanPrompt = stripAnsi(prompt).trim();
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
