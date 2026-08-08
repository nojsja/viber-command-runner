import { useEffect, useRef } from 'preact/hooks';
import { t } from '../i18n';
import { usePanel } from '../context/PanelContext';

export function InteractivePromptOverlay() {
  const {
    interactivePrompt,
    currentPromptText,
    hideInteractivePrompt,
    sendInteractiveInput,
    submitInteractiveInput,
    cancelRun,
  } = usePanel();

  const inputRef = useRef<HTMLInputElement>(null);
  const contextRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (interactivePrompt) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (contextRef.current) {
            contextRef.current.scrollTop = contextRef.current.scrollHeight;
          }
          inputRef.current?.focus();
        });
      });
    }
  }, [interactivePrompt]);

  if (!interactivePrompt) {
    return null;
  }

  const handleCancel = () => {
    if (/输入 q|type q|enter q/i.test(currentPromptText)) {
      sendInteractiveInput('q');
      return;
    }
    hideInteractivePrompt();
    cancelRun();
  };

  const handleOverlayClick = (event: MouseEvent) => {
    if (event.target === event.currentTarget) {
      hideInteractivePrompt();
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitInteractiveInput((event.target as HTMLInputElement).value);
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      hideInteractivePrompt();
    }
  };

  return (
    <div
      id="input-overlay"
      class="input-overlay"
      aria-hidden="false"
      onClick={handleOverlayClick}
    >
      <div class="input-dialog" role="dialog" aria-modal="true" aria-labelledby="input-dialog-title">
        <div class="input-dialog-head">
          <h3 id="input-dialog-title">{t('input.title')}</h3>
          <button
            id="input-close"
            class="ghost input-close"
            type="button"
            aria-label={t('input.close')}
            onClick={hideInteractivePrompt}
          >
            ×
          </button>
        </div>
        <div class="input-context-block">
          <div class="input-section-label">{t('input.context')}</div>
          <pre ref={contextRef} id="input-context-text" class="input-context-text">
            {interactivePrompt.context || t('input.noContext')}
          </pre>
        </div>
        <div class="input-prompt-block">
          <div class="input-section-label">{t('input.prompt')}</div>
          <pre id="input-prompt-text" class="input-prompt-text">
            {interactivePrompt.prompt}
          </pre>
        </div>
        <input
          ref={inputRef}
          id="input-field"
          class="input-field"
          type="text"
          placeholder={t('input.placeholder')}
          onKeyDown={handleKeyDown}
        />
        <div id="input-shortcuts" class="input-shortcuts">
          {interactivePrompt.shortcuts.map((item) => (
            <button
              key={item.value}
              type="button"
              class="ghost shortcut-btn"
              onClick={() => sendInteractiveInput(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div class="input-actions">
          <button id="input-submit" type="button" onClick={() => submitInteractiveInput(inputRef.current?.value ?? '')}>
            {t('btn.confirm')}
          </button>
          <button id="input-cancel" class="ghost" type="button" onClick={handleCancel}>
            {t('btn.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
