import { useRef } from 'preact/hooks';
import { t } from '../i18n';
import { HISTORY_PAGE_SIZE, usePanel } from '../context/PanelContext';
import type { ReleaseRecord } from '../types';
import { badgeClass, formatTime } from '../utils/format';

function Badge({ text, kind }: { text: string; kind: string }) {
  return <span class={`badge ${badgeClass(text, kind)}`}>{text}</span>;
}

interface HistoryCardProps {
  record: ReleaseRecord;
  isLatest?: boolean;
}

function HistoryCard({ record, isLatest }: HistoryCardProps) {
  const { panelState, runCommand } = usePanel();
  const disabled = !!panelState?.runningRecordId && !panelState.parallelMode;
  const tip = [record.commandLabel, record.command].filter(Boolean).join('\n');
  const versionText = t('history.version', {
    version: record.appVersion || t('meta.unknown'),
    build: record.appBuild ? ` (${record.appBuild})` : '',
  });

  return (
    <article class={`history-card${isLatest ? ' history-card-latest' : ''}`} title={tip}>
      <div class="history-top">
        <div class="history-title" title={record.commandLabel}>
          {record.commandLabel}
        </div>
        <div class={`status-${record.status}`}>{record.status}</div>
      </div>
      <div class="command-preview" title={record.command}>
        {record.command}
      </div>
      <div class="badges">
        <Badge text={record.platform} kind="platform" />
        <Badge text={record.releaseType} kind="type" />
        {(record.destinations || []).map((item) => (
          <Badge key={item} text={item} kind="dest" />
        ))}
      </div>
      <div class="history-meta">
        {formatTime(record.startedAt)} · {record.operator} · {record.branch}
        <br />
        {versionText}
        {record.exitCode !== undefined ? ` · exit ${record.exitCode}` : ''}
      </div>
      <div class="history-actions">
        <button
          class="ghost retry-btn"
          type="button"
          title={t('btn.retryTitle')}
          disabled={disabled}
          onClick={() => {
            if (!panelState?.runningRecordId || panelState.parallelMode) {
              runCommand(record.commandKey);
            }
          }}
        >
          {t('btn.retry')}
        </button>
      </div>
    </article>
  );
}

export function HistoryPanel() {
  const { panelState, historyPage, setHistoryPage, historyArchiveOpen, setHistoryArchiveOpen } =
    usePanel();
  const archiveScrollRef = useRef<HTMLDivElement>(null);

  if (!panelState) {
    return null;
  }

  const records = panelState.records || [];
  const latest = records[0];
  const archiveRecords = records.slice(1);
  const totalShown = historyPage * HISTORY_PAGE_SIZE;
  const shownRecords = archiveRecords.slice(0, totalShown);
  const hasMore = totalShown < archiveRecords.length;
  const archiveOpen = historyArchiveOpen;

  const handleLoadMore = () => {
    setHistoryPage((prev) => prev + 1);
    requestAnimationFrame(() => {
      if (archiveScrollRef.current) {
        archiveScrollRef.current.scrollTop = archiveScrollRef.current.scrollHeight;
      }
    });
  };

  return (
    <section class="panel history-panel">
      <div class="panel-head">
        <h2>{t('history.title')}</h2>
      </div>
      <div id="history-latest" class="history-latest">
        {latest ? (
          <HistoryCard record={latest} isLatest />
        ) : (
          <div class="empty">{t('empty.noHistory')}</div>
        )}
      </div>
      {archiveRecords.length > 0 ? (
        <div
          id="history-archive"
          class={`history-archive${archiveOpen ? ' history-archive-open' : ''}`}
        >
          <button
            type="button"
            class="history-archive-toggle"
            aria-expanded={archiveOpen ? 'true' : 'false'}
            onClick={() => setHistoryArchiveOpen(!archiveOpen)}
          >
            <span>{t('history.archive')}</span>
            <span id="history-archive-count" class="history-archive-count">
              ({archiveRecords.length})
            </span>
          </button>
          {archiveOpen ? (
            <div id="history-archive-scroll" class="history-archive-scroll" ref={archiveScrollRef}>
              <div id="history-archive-list" class="history-list">
                {shownRecords.map((record) => (
                  <HistoryCard key={record.id} record={record} />
                ))}
              </div>
              <div id="history-archive-footer" class="history-archive-footer">
                {hasMore ? (
                  <button id="btn-history-next" type="button" class="ghost load-more" onClick={handleLoadMore}>
                    {t('history.loadMore', { shown: shownRecords.length, total: archiveRecords.length })}
                  </button>
                ) : archiveRecords.length > HISTORY_PAGE_SIZE ? (
                  <div class="history-end">
                    {t('history.allLoaded', { count: archiveRecords.length })}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
