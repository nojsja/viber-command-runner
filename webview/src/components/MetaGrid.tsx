import { t } from '../i18n';
import { usePanel } from '../context/PanelContext';
import { formatTime } from '../utils/format';

export function MetaGrid() {
  const { panelState, metaGridRef } = usePanel();

  if (!panelState) {
    return <section class="meta-grid" ref={metaGridRef} />;
  }

  const versionLabel = panelState.appVersion
    ? `${panelState.appVersion}${panelState.appBuild ? ` (${panelState.appBuild})` : ''}`
    : t('meta.unknown');

  const ossValue = panelState.ossEnabled
    ? panelState.ossSyncedAt
      ? t('meta.ossSynced', { time: formatTime(panelState.ossSyncedAt) })
      : t('meta.ossEnabled')
    : t('meta.ossDisabled');

  const statusValue =
    (panelState.parallelMode && (panelState.runningRecordIds || []).length) || panelState.runningRecordId
      ? t('meta.statusRunning')
      : panelState.syncing
        ? t('meta.statusSyncing')
        : t('meta.statusReady');

  const items = [
    { label: t('meta.workspace'), value: panelState.workspaceName },
    { label: t('meta.branch'), value: panelState.branch },
    { label: t('meta.operator'), value: panelState.operator },
    { label: t('meta.version'), value: versionLabel },
    { label: t('meta.oss'), value: ossValue },
    { label: t('meta.status'), value: statusValue },
  ];

  return (
    <section class="meta-grid" ref={metaGridRef}>
      {items.map((item) => (
        <div class="meta-card" key={item.label}>
          <div class="meta-label">{item.label}</div>
          <div class="meta-value">{item.value}</div>
        </div>
      ))}
    </section>
  );
}
