import { useRef } from 'preact/hooks';
import { t } from '../i18n';
import { usePanel } from '../context/PanelContext';
import { CommandGroup } from './CommandGroup';
import { TaskTerminal } from './TaskTerminal';
import { AdhocCommandField } from './AdhocCommandField';
import { CommandFilterButton } from './CommandFilterButton';

export function CommandsPanel() {
  const {
    panelState,
    setParallelMode,
    getAdhocTaskSessions,
  } = usePanel();
  const scrollRef = useRef<HTMLDivElement>(null);

  if (!panelState) {
    return null;
  }

  const groups = panelState.commandGroups || [];
  const parallelMode = !!panelState.parallelMode;
  const adhocSessions = getAdhocTaskSessions();

  return (
    <section class="panel commands-panel">
      <div class="panel-head commands-panel-head">
        <h2>{t('commands.title')}</h2>
        <div class="commands-panel-head-adhoc">
          <AdhocCommandField />
        </div>
        <label class="parallel-toggle" title={t('parallelMode.title')}>
          <span class="parallel-toggle-label">{t('parallelMode.label')}</span>
          <input
            class="parallel-switch-input"
            type="checkbox"
            role="switch"
            checked={parallelMode}
            onChange={(e) => setParallelMode((e.target as HTMLInputElement).checked)}
          />
          <span class="parallel-switch-slider" aria-hidden="true" />
        </label>
        <CommandFilterButton />
      </div>
      {adhocSessions.length > 0 ? (
        <div id="adhoc-task-terminals" class="command-task-terminals adhoc-task-terminals">
          {adhocSessions.map((session) => (
            <TaskTerminal key={session.recordId} session={session} />
          ))}
        </div>
      ) : null}
      <div id="command-groups-scroll" class="command-groups-scroll" ref={scrollRef}>
        <div id="command-groups" class="command-groups">
          {!groups.length ? (
            <div class="empty">{t('empty.noCommands')}</div>
          ) : (
            groups.map((group) => <CommandGroup key={group.id} group={group} />)
          )}
        </div>
      </div>
    </section>
  );
}
