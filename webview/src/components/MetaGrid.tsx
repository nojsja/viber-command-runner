import { t } from '../i18n';
import { usePanel } from '../context/PanelContext';
import { formatTime } from '../utils/format';

export function MetaGrid() {
  const { panelState, metaGridRef } = usePanel();

  if (!panelState) {
    return <section class="meta-grid" ref={metaGridRef} />;
  }

  const remoteSyncValue = panelState.remoteSyncEnabled
    ? panelState.remoteSyncedAt
      ? t('meta.remoteSynced', { time: formatTime(panelState.remoteSyncedAt) })
      : t('meta.remoteSyncEnabled')
    : t('meta.remoteSyncDisabled');

  const items = [
    { label: t('meta.branch'), value: panelState.branch },
    { label: t('meta.remoteSync'), value: remoteSyncValue },
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
