import { useEffect, useRef } from 'preact/hooks';
import { t } from '../i18n';
import { usePanel } from '../context/PanelContext';
import type { TaskSessionView } from '../types';
import { detectTerminalPrompt, stripTrailingPromptLine } from '../utils/terminal';
import { TerminalSurface } from './TerminalSurface';
import { ClearIcon } from './icons';

interface TaskTerminalProps {
  session: TaskSessionView;
}

export function TaskTerminal({ session }: TaskTerminalProps) {
  const {
    getTaskOutput,
    getTaskTerminalPreview,
    isTaskTerminalExpanded,
    setTaskTerminalFold,
    clearTerminal,
    cancelRun,
    submitTaskTerminalLine,
    setActiveTaskTerminalFocus,
    scrollTaskTerminalToBottom,
  } = usePanel();
  const outputRef = useRef<HTMLPreElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recordId = session.recordId;
  const output = getTaskOutput(recordId);
  const expanded = isTaskTerminalExpanded(recordId);
  const preview = getTaskTerminalPreview(recordId);
  const prompt = detectTerminalPrompt(output.buffer);
  const logBuffer = stripTrailingPromptLine(output.buffer, prompt);

  const isRunning = session.status === 'running';
  const statusClass = isRunning ? 'running' : session.status === 'failed' ? 'failed' : '';
  const statusText = isRunning
    ? t('terminal.running')
    : session.status === 'success'
      ? t('status.success')
      : session.status === 'cancelled'
        ? t('status.cancelled')
        : t('terminal.failed', {
            exit: session.exitCode !== undefined ? ` (exit ${session.exitCode})` : '',
          });

  useEffect(() => {
    requestAnimationFrame(() => {
      scrollTaskTerminalToBottom(recordId, outputRef.current);
    });
  }, [output.buffer, recordId, scrollTaskTerminalToBottom]);

  const handleFoldClick = () => {
    setTaskTerminalFold(recordId, !expanded);
  };

  const handleInputFocus = () => {
    setActiveTaskTerminalFocus(recordId);
  };

  const handleInputBlur = (event: FocusEvent) => {
    const related = event.relatedTarget as HTMLElement | null;
    if (related?.closest('.command-task-terminal')) {
      return;
    }
    setActiveTaskTerminalFocus(undefined);
  };

  const handleInputKeyDown = (event: KeyboardEvent) => {
    const input = event.currentTarget as HTMLInputElement;
    if (event.key === 'Enter') {
      event.preventDefault();
      submitTaskTerminalLine(recordId, input.value, input);
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      input.value = '';
    }
  };

  const handleSurfaceClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest('.terminal-command-input')) {
      return;
    }
    const selection = window.getSelection?.()?.toString() ?? '';
    if (selection.trim()) {
      return;
    }
    inputRef.current?.focus();
  };

  return (
    <div
      class={`command-task-terminal panel${expanded ? '' : ' terminal-collapsed'}`}
      data-record-id={recordId}
    >
      <div class="command-task-terminal-head terminal-head">
        <button
          type="button"
          class="terminal-fold-toggle"
          data-task-fold={recordId}
          aria-expanded={expanded ? 'true' : 'false'}
          aria-label={t(expanded ? 'terminal.foldCollapse' : 'terminal.foldExpand')}
          onClick={handleFoldClick}
        >
          <span class="terminal-fold-chevron" aria-hidden="true" />
          <span class="terminal-fold-title">{session.label || statusText}</span>
          <span id={`task-terminal-preview-${recordId}`} class="terminal-fold-preview">
            {preview}
          </span>
        </button>
        <div class="command-task-terminal-actions">
          <button
            type="button"
            class="ghost terminal-clear-btn icon-btn"
            title={t('btn.clearTerminalTitle')}
            aria-label={t('btn.clearTerminalTitle')}
            onClick={(e) => {
              e.stopPropagation();
              clearTerminal(recordId);
            }}
          >
            <ClearIcon />
          </button>
          {isRunning ? (
            <button
              type="button"
              class="danger ghost task-stop-btn"
              onClick={() => cancelRun(recordId)}
            >
              {t('btn.abort')}
            </button>
          ) : null}
          <span class={`terminal-status ${statusClass}`} title={statusText}>
            {statusText}
          </span>
        </div>
      </div>
      <div class="command-task-terminal-body">
        <TerminalSurface
          surface="task"
          recordId={recordId}
          output={logBuffer}
          hasStderr={output.hasStderr}
          prompt={prompt}
          showInput
          inputRef={inputRef}
          outputRef={outputRef}
          onSurfaceClick={handleSurfaceClick}
          onInputFocus={handleInputFocus}
          onInputBlur={handleInputBlur}
          onInputKeyDown={handleInputKeyDown}
        />
      </div>
    </div>
  );
}
