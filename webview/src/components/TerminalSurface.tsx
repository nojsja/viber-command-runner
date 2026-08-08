import type { Ref } from 'preact';

interface TerminalSurfaceProps {
  surface: 'panel' | 'sticky' | 'task';
  recordId?: string;
  output: string;
  hasStderr?: boolean;
  prompt: string;
  showInput?: boolean;
  hideInput?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  outputRef?: Ref<HTMLPreElement>;
  onSurfaceClick?: (event: MouseEvent) => void;
  onInputKeyDown?: (event: KeyboardEvent) => void;
  onInputFocus?: () => void;
  onInputBlur?: (event: FocusEvent) => void;
  onInputSubmit?: (value: string, input: HTMLInputElement) => void;
}

export function TerminalSurface({
  surface,
  recordId,
  output,
  hasStderr,
  prompt,
  showInput = true,
  hideInput,
  inputRef,
  outputRef,
  onSurfaceClick,
  onInputKeyDown,
  onInputFocus,
  onInputBlur,
  onInputSubmit,
}: TerminalSurfaceProps) {
  const outputId =
    surface === 'task' && recordId
      ? `task-terminal-output-${recordId}`
      : surface === 'sticky'
        ? 'terminal-sticky-output'
        : 'terminal-output';

  const outputClass =
    surface === 'task'
      ? `terminal-output command-task-output${hasStderr ? ' has-stderr' : ''}`
      : surface === 'sticky'
        ? `terminal-output terminal-sticky-output${hasStderr ? ' has-stderr' : ''}`
        : `terminal-output${hasStderr ? ' has-stderr' : ''}`;

  const handleKeyDown = (event: KeyboardEvent) => {
    if (onInputKeyDown) {
      onInputKeyDown(event);
      return;
    }
    const input = event.currentTarget as HTMLInputElement;
    if (event.key === 'Enter') {
      event.preventDefault();
      onInputSubmit?.(input.value, input);
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      input.value = '';
    }
  };

  return (
    <div
      class={`terminal-surface${surface === 'task' ? ' terminal-surface-task' : ''}`}
      data-terminal-surface={surface}
      data-record-id={recordId}
      onClick={onSurfaceClick}
    >
      <pre ref={outputRef} id={outputId} class={outputClass}>
        {output}
      </pre>
      {showInput ? (
        <div class={`terminal-command-line${surface === 'task' ? ' terminal-command-line-task' : ''}${hideInput ? ' hidden' : ''}`}>
          <span
            class={`terminal-command-prompt${surface === 'task' ? ' task-terminal-prompt' : ''}`}
            data-record-id={recordId}
          >
            {prompt}
          </span>
          <input
            ref={inputRef}
            class={`terminal-command-input${surface === 'task' ? ' task-terminal-input' : ''}`}
            data-record-id={recordId}
            type="text"
            spellcheck={false}
            autocomplete="off"
            autocapitalize="off"
            aria-label="Terminal command"
            disabled={hideInput}
            onKeyDown={handleKeyDown}
            onFocus={onInputFocus}
            onBlur={onInputBlur}
          />
        </div>
      ) : null}
    </div>
  );
}
