import { useEffect, useRef } from 'preact/hooks';
import { t } from '../i18n';
import { usePanel } from '../context/PanelContext';
import { TerminalSurface } from './TerminalSurface';
import { ClearIcon } from './icons';

export function ReleaseTerminal() {
  const {
    panelState,
    showStickyShowButton,
    showStopButtons,
    terminalStatusText,
    terminalStatusClass,
    clearTerminal,
    cancelRun,
    interruptTerminal,
    toggleTerminalFold,
    isTerminalExpanded,
    terminalPreview,
    mainTerminalLines,
    terminalRevision,
    terminalHasStderr,
    submitMainTerminalLine,
    setStickyTerminalHidden,
  } = usePanel();

  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const parallelMode = !!panelState?.parallelMode;
  const expanded = isTerminalExpanded('panel');

  const handleShowSticky = () => {
    setStickyTerminalHidden(false);
    requestAnimationFrame(() => {
      const stickyOutput = document.getElementById('terminal-sticky-output');
      if (stickyOutput) {
        stickyOutput.scrollTop = stickyOutput.scrollHeight;
      }
    });
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
    <section id="terminal-panel" class={`panel terminal-panel${expanded ? '' : ' terminal-collapsed'}`}>
      <div class="panel-head terminal-head">
        <button
          id="btn-terminal-panel-fold"
          type="button"
          class="terminal-fold-toggle"
          aria-expanded={expanded ? 'true' : 'false'}
          aria-label={t(expanded ? 'terminal.foldCollapse' : 'terminal.foldExpand')}
          onClick={() => toggleTerminalFold('panel')}
        >
          <span class="terminal-fold-chevron" aria-hidden="true" />
          <span class="terminal-fold-title">{t('terminal.title')}</span>
          <span id="terminal-panel-preview" class="terminal-fold-preview">
            {terminalPreview}
          </span>
        </button>
        <div class="terminal-panel-actions">
          {showStickyShowButton ? (
            <button
              id="btn-sticky-show"
              type="button"
              class="ghost"
              onClick={handleShowSticky}
            >
              {t('btn.showFloatingTerminal')}
            </button>
          ) : null}
          <button
            id="btn-terminal-panel-clear"
            type="button"
            class="ghost terminal-clear-btn icon-btn"
            title={t('btn.clearTerminalTitle')}
            aria-label={t('btn.clearTerminalTitle')}
            onClick={() => clearTerminal()}
          >
            <ClearIcon />
          </button>
          {showStopButtons ? (
            <button
              id="btn-terminal-stop"
              type="button"
              class="danger terminal-stop-btn"
              onClick={() => cancelRun()}
            >
              {t('btn.abort')}
            </button>
          ) : null}
          <span id="terminal-status" class={terminalStatusClass} title={terminalStatusText}>
            {terminalStatusText}
          </span>
        </div>
      </div>
      <div class="terminal-panel-body">
        <TerminalSurface
          surface="panel"
          lines={mainTerminalLines}
          revision={terminalRevision}
          hasStderr={terminalHasStderr}
          prompt=""
          hideInput={parallelMode}
          inputRef={inputRef}
          outputRef={outputRef}
          onSurfaceClick={handleSurfaceClick}
          onInputSubmit={(value, input) => submitMainTerminalLine(value, input, 'panel')}
          onInputInterrupt={() => interruptTerminal(undefined, inputRef.current ?? undefined)}
          onInputClearScreen={() => clearTerminal()}
        />
      </div>
    </section>
  );
}
