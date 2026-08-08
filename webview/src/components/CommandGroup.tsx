import { t } from '../i18n';
import { usePanel } from '../context/PanelContext';
import type { CommandGroupDefinition } from '../types';
import { CommandCard } from './CommandCard';
import { CustomCommandForm } from './CustomCommandForm';

interface CommandGroupProps {
  group: CommandGroupDefinition;
}

export function CommandGroup({ group }: CommandGroupProps) {
  const { localGroupFold, toggleGroupFold, matchesCommandFilter, filterText } = usePanel();

  const isOpen = localGroupFold[group.id] ?? group.id === 'release';
  const filtered = (group.commands || []).filter(matchesCommandFilter);
  const countLabel = filterText.trim()
    ? `${filtered.length}/${group.commands.length}`
    : String(group.commands.length);

  const handleToggle = (event: Event) => {
    const details = event.currentTarget as HTMLDetailsElement;
    toggleGroupFold(group.id, details.open);
  };

  return (
    <details class="command-group" data-group-id={group.id} open={isOpen} onToggle={handleToggle}>
      <summary class="command-group-toggle">
        <span>{group.title}</span>
        <span class="command-group-count">({countLabel})</span>
      </summary>
      <div class="command-list">
        {group.id === 'custom' && <CustomCommandForm />}
        {group.id === 'custom' ? (
          filtered.length ? (
            filtered.map((command) => <CommandCard key={command.key} command={command} />)
          ) : (
            <div class="empty">{t('empty.noCustomCommands')}</div>
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
