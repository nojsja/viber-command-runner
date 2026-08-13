import { useEffect, useRef } from 'preact/hooks';
import { t } from '../i18n';
import { getMainTerminalLogBuffer, usePanel } from '../context/PanelContext';
import { TerminalSurface } from './TerminalSurface';
import { ClearIcon } from './icons';

export function StickyTerminal() {
  const {
    showStickyTerminal,
    stickyStatusText,
    stickyStatusClass,
    isRunning,
    panelState,
    clearTerminal,
    cancelRun,
    interruptTerminal,
    toggleTerminalFold,
    isTerminalExpanded,
    terminalPreview,
    terminalBuffer,
    terminalHasStderr,
    terminalPrompt,
    submitMainTerminalLine,
    positionStickyTerminal,
    setStickyTerminalHidden,
  } = usePanel();

  const stickyRef = useRef<HTMLElement>(null);
  const outputRef = useRef<HTMLPreElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const parallelMode = !!panelState?.parallelMode;
  const expanded = isTerminalExpanded('sticky');
  const logBuffer = getMainTerminalLogBuffer(terminalBuffer, terminalPrompt);

  useEffect(() => {
    if (showStickyTerminal) {
      requestAnimationFrame(() => positionStickyTerminal(stickyRef.current));
    }
  }, [showStickyTerminal, positionStickyTerminal, terminalBuffer]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [terminalBuffer]);

  if (!showStickyTerminal) {
    return (
      <section id="terminal-sticky" class="terminal-sticky hidden" aria-hidden="true" />
    );
  }

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
    <section
      id="terminal-sticky"
      ref={stickyRef}
      class={`terminal-sticky${expanded ? '' : ' terminal-collapsed'}`}
      aria-hidden="false"
    >
      <div class="terminal-sticky-inner panel">
        <div class="panel-head terminal-head">
          <button
            id="btn-sticky-fold"
            type="button"
            class="terminal-fold-toggle"
            aria-expanded={expanded ? 'true' : 'false'}
            aria-label={t(expanded ? 'terminal.foldCollapse' : 'terminal.foldExpand')}
            onClick={() => toggleTerminalFold('sticky')}
          >
            <span class="terminal-fold-chevron" aria-hidden="true" />
            <span class="terminal-fold-title">{t('terminal.runLog')}</span>
            <span id="terminal-sticky-preview" class="terminal-fold-preview">
              {terminalPreview}
            </span>
          </button>
          <div class="terminal-sticky-actions">
            <button
              id="btn-sticky-clear"
              type="button"
              class="ghost terminal-clear-btn icon-btn"
              title={t('btn.clearTerminalTitle')}
              aria-label={t('btn.clearTerminalTitle')}
              onClick={() => clearTerminal()}
            >
              <ClearIcon />
            </button>
            {isRunning && !parallelMode ? (
              <button
                id="btn-sticky-stop"
                type="button"
                class="danger terminal-stop-btn"
                onClick={() => cancelRun()}
              >
                {t('btn.abort')}
              </button>
            ) : null}
            <span
              id="terminal-sticky-status"
              class={stickyStatusClass}
              title={stickyStatusText}
            >
              {stickyStatusText}
            </span>
            <button
              id="btn-sticky-hide"
              type="button"
              class="ghost"
              onClick={() => setStickyTerminalHidden(true)}
            >
              {t('btn.hide')}
            </button>
          </div>
        </div>
        <div class="terminal-sticky-body">
          <TerminalSurface
            surface="sticky"
            output={logBuffer}
            hasStderr={terminalHasStderr}
            prompt={terminalPrompt}
            hideInput={parallelMode}
            inputRef={inputRef}
            outputRef={outputRef}
            onSurfaceClick={handleSurfaceClick}
            onInputSubmit={(value, input) => submitMainTerminalLine(value, input, 'sticky')}
            onInputInterrupt={() => interruptTerminal(undefined, inputRef.current ?? undefined)}
            onInputClearScreen={() => clearTerminal()}
          />
        </div>
      </div>
    </section>
  );
}
