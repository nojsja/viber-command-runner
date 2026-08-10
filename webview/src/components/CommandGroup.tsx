import { useState } from 'preact/hooks';
import { t } from '../i18n';
import { usePanel } from '../context/PanelContext';
import type { CommandGroupDefinition } from '../types';
import { CommandCard } from './CommandCard';
import { CustomCommandForm } from './CustomCommandForm';
import { PresetCommandForm } from './PresetCommandForm';
import { PlusIcon } from './icons';

interface CommandGroupProps {
  group: CommandGroupDefinition;
}

export function CommandGroup({ group }: CommandGroupProps) {
  const {
    localGroupFold,
    toggleGroupFold,
    matchesCommandFilter,
    filterText,
    editingCustomId,
    editingPresetKey,
  } = usePanel();
  const [showAddForm, setShowAddForm] = useState(false);

  const isOpen = localGroupFold[group.id] ?? group.id === 'release';
  const allCommands = group.commands || [];
  const filtered = allCommands.filter(matchesCommandFilter);
  const countLabel = filterText.trim()
    ? `${filtered.length}/${allCommands.length}`
    : String(allCommands.length);
  const isCustomGroup = group.id === 'custom';
  const isReleaseGroup = group.id === 'release';
  const showManagedForm = isCustomGroup
    ? !!editingCustomId || showAddForm
    : isReleaseGroup
      ? !!editingPresetKey || showAddForm
      : false;
  const addTitle = isReleaseGroup ? t('preset.addTitle') : t('custom.addTitle');

  const handleToggle = (event: Event) => {
    const details = event.currentTarget as HTMLDetailsElement;
    toggleGroupFold(group.id, details.open);
  };

  const openAddForm = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    setShowAddForm(true);
    toggleGroupFold(group.id, true);
  };

  return (
    <details class="command-group" data-group-id={group.id} open={isOpen} onToggle={handleToggle}>
      <summary class="command-group-toggle">
        <span class="command-group-title">{group.title}</span>
        <span class="command-group-toggle-actions">
          {(isCustomGroup || isReleaseGroup) && !showManagedForm ? (
            <button
              type="button"
              class="ghost icon-btn custom-add-btn"
              title={addTitle}
              aria-label={addTitle}
              onClick={openAddForm}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
            >
              <PlusIcon />
            </button>
          ) : null}
          <span class="command-group-count">({countLabel})</span>
        </span>
      </summary>
      <div class="command-list">
        {isCustomGroup ? (
          <CustomCommandForm showAddForm={showAddForm} onCloseAddForm={() => setShowAddForm(false)} />
        ) : null}
        {isReleaseGroup ? (
          <PresetCommandForm showAddForm={showAddForm} onCloseAddForm={() => setShowAddForm(false)} />
        ) : null}
        {isCustomGroup ? (
          filtered.length ? (
            filtered.map((command) => <CommandCard key={command.key} command={command} />)
          ) : allCommands.length ? (
            <div class="empty">{t('empty.noMatch')}</div>
          ) : (
            <div class="empty">{t('empty.noCustomCommands')}</div>
          )
        ) : isReleaseGroup ? (
          filtered.length ? (
            filtered.map((command) => <CommandCard key={command.key} command={command} />)
          ) : allCommands.length ? (
            <div class="empty">{t('empty.noMatch')}</div>
          ) : (
            <div class="empty">{t('empty.noCommands')}</div>
          )
        ) : filtered.length ? (
          filtered.map((command) => <CommandCard key={command.key} command={command} />)
        ) : (
          <div class="empty">{t('empty.noMatch')}</div>
        )}
      </div>
    </details>
  );
}
