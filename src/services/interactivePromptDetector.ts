export interface InteractivePromptPayload {
  prompt: string;
  context: string;
}

export class InteractivePromptDetector {
  private buffer = '';
  private awaitingResponse = false;
  private lastPrompt = '';

  reset(): void {
    this.buffer = '';
    this.awaitingResponse = false;
    this.lastPrompt = '';
  }

  markResponded(): void {
    this.awaitingResponse = false;
  }

  append(chunk: string): InteractivePromptPayload | undefined {
    if (this.awaitingResponse) {
      return undefined;
    }
    this.buffer += stripAnsi(chunk);
    if (this.buffer.length > 12_000) {
      this.buffer = this.buffer.slice(-12_000);
    }
    const detected = detectPrompt(this.buffer);
    if (!detected || detected.prompt === this.lastPrompt) {
      return undefined;
    }
    this.awaitingResponse = true;
    this.lastPrompt = detected.prompt;
    return detected;
  }
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
}

function detectPrompt(buffer: string): InteractivePromptPayload | undefined {
  const lines = buffer.trimEnd().split('\n');
  if (lines.length === 0) {
    return undefined;
  }

  let promptIndex = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trimEnd() ?? '';
    if (!line) {
      continue;
    }
    if (isPromptLine(line, lines, index)) {
      promptIndex = index;
      break;
    }
  }

  if (promptIndex < 0) {
    return undefined;
  }

  const prompt = extractPromptBlock(lines, promptIndex);
  const context = extractPromptContext(lines, promptIndex);
  return { prompt, context };
}

function isPromptLine(line: string, lines: string[], index: number): boolean {
  if (/请输入[^\n]*[:：]\s*$/.test(line)) {
    return true;
  }
  if (
    /(?:\(y\/n\)|\(Y\/N\)|\[y\/n\]|是否继续)/i.test(line)
    && /[:：?？]\s*$/.test(line)
  ) {
    return true;
  }
  if (
    /(?:请输入|选择|输入|粘贴|编号|device|退出)/i.test(line)
    && /[:：?？]\s*$/.test(line)
  ) {
    return true;
  }

  const tail = lines.slice(Math.max(0, index - 3), index + 1).join('\n');
  return /^.*[:：?？]\s*$/.test(line) && /read -r|choice/i.test(tail);
}

function extractPromptBlock(lines: string[], promptIndex: number): string {
  const start = Math.max(0, promptIndex - 1);
  return lines.slice(start, promptIndex + 1).join('\n').trim();
}

function extractPromptContext(lines: string[], promptIndex: number): string {
  const maxLookback = 30;
  let start = Math.max(0, promptIndex - maxLookback);

  for (let index = promptIndex - 1; index >= start; index -= 1) {
    const line = lines[index]?.trim() ?? '';
    if (!line) {
      continue;
    }
    if (/^\[\d+\/\d+\]/.test(line)) {
      start = index;
      break;
    }
    if (/可用的|设备|device|APK|apk/i.test(line)) {
      start = Math.min(start, index);
    }
    if (/^\s*\d+\)/.test(line)) {
      start = Math.min(start, index);
    }
  }

  return lines.slice(start, promptIndex).join('\n').trim();
}
