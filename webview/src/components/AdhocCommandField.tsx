import { useCallback, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import { usePanel } from '../context/PanelContext';
import { PlayIcon } from './icons';

export function AdhocCommandField() {
  const { adhocCommand, setAdhocCommand, pasteAdhocCommand, runRawCommand } = usePanel();
  const fieldRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  const hasValue = !!adhocCommand.trim();
  const expanded = focused || hasValue;

  const handleRun = useCallback(() => {
    const command = adhocCommand.trim();
    if (command) {
      runRawCommand(command);
    }
  }, [adhocCommand, runRawCommand]);

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleRun();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      inputRef.current?.blur();
    }
  };

  const handleBlur = (event: FocusEvent) => {
    const related = event.relatedTarget as HTMLElement | null;
    if (related?.closest('.adhoc-field')) {
      return;
    }
    window.setTimeout(() => {
      if (!fieldRef.current?.contains(document.activeElement)) {
        setFocused(false);
      }
    }, 120);
  };

  return (
    <div
      ref={fieldRef}
      class={`adhoc-field${expanded ? ' is-expanded' : ''}${hasValue ? ' has-value' : ''}`}
    >
      <div class="adhoc-field-inner">
        <span class="adhoc-field-prompt" aria-hidden="true">
          ›
        </span>
        <input
          ref={inputRef}
          id="adhoc-command"
          class="adhoc-field-input"
          type="text"
          placeholder={t('adhoc.placeholder')}
          spellcheck={false}
          title={t('adhoc.inputTitle')}
          aria-label={t('adhoc.title')}
          value={adhocCommand}
          onInput={(e) => setAdhocCommand((e.target as HTMLInputElement).value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
        />
        <div class="adhoc-field-actions">
          <button
            type="button"
            class="ghost adhoc-field-paste"
            onClick={pasteAdhocCommand}
            title={t('adhoc.pasteTitle')}
            tabIndex={expanded ? 0 : -1}
          >
            {t('btn.paste')}
          </button>
          <button
            type="button"
            id="adhoc-run"
            class="icon-btn run-btn adhoc-field-run"
            title={t('adhoc.runTitle')}
            aria-label={t('adhoc.runTitle')}
            onClick={handleRun}
            tabIndex={expanded ? 0 : -1}
          >
            <PlayIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
