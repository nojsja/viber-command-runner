import { t } from '../i18n';
import { usePanel } from '../context/PanelContext';
import type { ReleaseCommandDefinition } from '../types';
import { badgeClass } from '../utils/format';
import { TaskTerminal } from './TaskTerminal';
import { CopyIcon, EditIcon, PlayIcon, TrashIcon } from './icons';

interface CommandCardProps {
  command: ReleaseCommandDefinition;
}

function Badge({ text, kind }: { text: string; kind: string }) {
  const cls = badgeClass(text, kind);
  return <span class={`badge ${cls}`}>{text}</span>;
}

export function CommandCard({ command }: CommandCardProps) {
  const {
    panelState,
    runCommand,
    copyCommand,
    startEditCustomCommand,
    startEditPresetCommand,
    showConfirm,
    removeCustomCommand,
    removePresetCommand,
    getTaskSessionsForCommand,
  } = usePanel();

  if (!panelState) {
    return null;
  }

  const disabled = !!panelState.runningRecordId && !panelState.parallelMode;
  const tip = [command.label, command.command].filter(Boolean).join('\n');
  const sessions = panelState.parallelMode ? getTaskSessionsForCommand(command.key) : [];

  const handleRemove = async () => {
    if (command.customId) {
      const confirmed = await showConfirm(
        t('custom.deleteConfirm', { label: command.label }),
        t('btn.remove'),
        t('btn.cancel'),
      );
      if (confirmed) {
        removeCustomCommand(command.customId);
      }
      return;
    }
    if (command.presetKey) {
      const confirmed = await showConfirm(
        t('preset.deleteConfirm', { label: command.label }),
        t('btn.remove'),
        t('btn.cancel'),
      );
      if (confirmed) {
        removePresetCommand(command.presetKey);
      }
    }
  };

  return (
    <article class="command-card" title={tip}>
      <div class="command-top">
        <div class="command-title" title={command.label}>
          {command.label}
        </div>
      </div>
      <div class="command-preview" title={command.command}>
        {command.command}
      </div>
      <div class="badges">
        <Badge text={command.platform} kind="platform" />
        <Badge text={command.releaseType} kind="type" />
        {command.interactive ? <Badge text={t('badge.interactive')} kind="interactive" /> : null}
        {(command.destinations || []).map((item) => (
          <Badge key={item} text={item} kind="dest" />
        ))}
      </div>
      <div class="command-actions">
        {command.customId ? (
          <>
            <button
              type="button"
              class="ghost edit-btn icon-btn"
              title={t('btn.editTitle')}
              aria-label={t('btn.editTitle')}
              disabled={disabled}
              onClick={() => startEditCustomCommand(command.customId!)}
            >
              <EditIcon />
            </button>
            <button
              type="button"
              class="ghost remove-btn icon-btn"
              title={t('btn.removeTitle')}
              aria-label={t('btn.removeTitle')}
              disabled={disabled}
              onClick={() => void handleRemove()}
            >
              <TrashIcon />
            </button>
          </>
        ) : command.presetKey ? (
          <>
            <button
              type="button"
              class="ghost edit-btn icon-btn"
              title={t('btn.editPresetTitle')}
              aria-label={t('btn.editPresetTitle')}
              disabled={disabled}
              onClick={() => startEditPresetCommand(command.presetKey!)}
            >
              <EditIcon />
            </button>
            <button
              type="button"
              class="ghost remove-btn icon-btn"
              title={t('btn.removePresetTitle')}
              aria-label={t('btn.removePresetTitle')}
              disabled={disabled}
              onClick={() => void handleRemove()}
            >
              <TrashIcon />
            </button>
          </>
        ) : null}
        <button
          type="button"
          class="ghost copy-btn icon-btn"
          title={t('btn.copyTitle')}
          aria-label={t('btn.copyTitle')}
          onClick={() => copyCommand(command.command)}
        >
          <CopyIcon />
        </button>
        <button
          type="button"
          class="run-btn icon-btn"
          title={t('btn.runTitle')}
          aria-label={t('btn.runTitle')}
          disabled={disabled}
          onClick={() => runCommand(command.key)}
        >
          <PlayIcon />
        </button>
      </div>
      {sessions.length > 0 ? (
        <div class="command-task-terminals">
          {sessions.map((session) => (
            <TaskTerminal key={session.recordId} session={session} />
          ))}
        </div>
      ) : null}
    </article>
  );
}
