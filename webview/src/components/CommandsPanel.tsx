import { useRef } from 'preact/hooks';
import { t } from '../i18n';
import { usePanel } from '../context/PanelContext';
import { CommandGroup } from './CommandGroup';
import { TaskTerminal } from './TaskTerminal';
import { PlayIcon } from './icons';

export function CommandsPanel() {
  const {
    panelState,
    filterText,
    setFilterText,
    setParallelMode,
    adhocCommand,
    setAdhocCommand,
    pasteAdhocCommand,
    runRawCommand,
    getAdhocTaskSessions,
  } = usePanel();
  const scrollRef = useRef<HTMLDivElement>(null);

  if (!panelState) {
    return null;
  }

  const groups = panelState.commandGroups || [];
  const parallelMode = !!panelState.parallelMode;
  const adhocSessions = getAdhocTaskSessions();

  const handleFilterInput = (event: Event) => {
    const target = event.target as HTMLInputElement;
    setFilterText(target.value);
  };

  const handleRunAdhoc = () => {
    const command = adhocCommand.trim();
    if (command) {
      runRawCommand(command);
    }
  };

  const handleAdhocKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleRunAdhoc();
    }
  };

  return (
    <section class="panel commands-panel">
      <div class="panel-head commands-panel-head">
        <h2>{t('commands.title')}</h2>
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
        <input
          id="command-filter"
          type="search"
          placeholder={t('commands.filterPlaceholder')}
          value={filterText}
          onInput={handleFilterInput}
        />
      </div>
      <div class="adhoc-runner panel">
        <div class="adhoc-head">{t('adhoc.title')}</div>
        <div class="adhoc-row">
          <input
            id="adhoc-command"
            type="text"
            placeholder={t('adhoc.placeholder')}
            spellcheck={false}
            title={t('adhoc.inputTitle')}
            value={adhocCommand}
            onInput={(e) => setAdhocCommand((e.target as HTMLInputElement).value)}
            onKeyDown={handleAdhocKeyDown}
          />
          <button type="button" class="ghost" onClick={pasteAdhocCommand} title={t('adhoc.pasteTitle')}>
            {t('btn.paste')}
          </button>
          <button
            type="button"
            id="adhoc-run"
            class="icon-btn run-btn"
            title={t('adhoc.runTitle')}
            aria-label={t('adhoc.runTitle')}
            onClick={handleRunAdhoc}
          >
            <PlayIcon />
          </button>
        </div>
        <div id="adhoc-task-terminals" class="command-task-terminals">
          {adhocSessions.map((session) => (
            <TaskTerminal key={session.recordId} session={session} />
          ))}
        </div>
      </div>
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
