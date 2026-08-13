import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import { usePanel } from '../context/PanelContext';
import { FilterIcon } from './icons';

export function CommandFilterButton() {
  const { filterText, setFilterText } = usePanel();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && rootRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleFilterInput = (event: Event) => {
    const target = event.target as HTMLInputElement;
    setFilterText(target.value);
  };

  return (
    <div class="command-filter" ref={rootRef}>
      <button
        type="button"
        id="command-filter-toggle"
        class={`ghost icon-btn command-filter-btn${filterText ? ' is-active' : ''}${open ? ' is-open' : ''}`}
        title={t('commands.filterTitle')}
        aria-label={t('commands.filterTitle')}
        aria-expanded={open ? 'true' : 'false'}
        onClick={() => setOpen((current) => !current)}
      >
        <FilterIcon />
      </button>
      {open ? (
        <div class="command-filter-popover" role="dialog" aria-label={t('commands.filterTitle')}>
          <input
            ref={inputRef}
            id="command-filter"
            type="search"
            placeholder={t('commands.filterPlaceholder')}
            value={filterText}
            onInput={handleFilterInput}
          />
          {filterText ? (
            <button
              type="button"
              class="ghost command-filter-clear"
              onClick={() => {
                setFilterText('');
                inputRef.current?.focus();
              }}
            >
              {t('btn.clearTerminal')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
