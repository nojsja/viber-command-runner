import { t } from '../i18n';
import { usePanel } from '../context/PanelContext';
import { ExportIcon, ImportIcon, RefreshIcon } from './icons';

export function Hero() {
  const {
    showStopButtons,
    clearTerminal,
    openTerminal,
    syncRemote,
    refresh,
    importConfig,
    exportConfig,
    cancelRun,
  } = usePanel();

  return (
    <header class="hero">
      <h1>{t('panel.title')}</h1>
      <div class="hero-actions">
        <button
          type="button"
          class={`danger terminal-stop-btn${showStopButtons ? '' : ' hidden'}`}
          onClick={() => cancelRun()}
        >
          {t('btn.stopTask')}
        </button>
        <button type="button" class="ghost" onClick={() => clearTerminal()}>
          {t('btn.clearLog')}
        </button>
        <button type="button" class="ghost" onClick={openTerminal}>
          {t('btn.externalTerminal')}
        </button>
        <button type="button" class="ghost" onClick={syncRemote}>
          {t('btn.syncRemote')}
        </button>
        <div class="hero-icon-group">
          <button
            type="button"
            class="ghost icon-btn hero-icon-btn"
            title={t('btn.refresh')}
            aria-label={t('btn.refresh')}
            onClick={refresh}
          >
            <RefreshIcon />
          </button>
          <button
            type="button"
            class="ghost icon-btn hero-icon-btn"
            title={t('btn.importConfigTitle')}
            aria-label={t('btn.importConfigTitle')}
            onClick={importConfig}
          >
            <ImportIcon />
          </button>
          <button
            type="button"
            class="ghost icon-btn hero-icon-btn"
            title={t('btn.exportConfigTitle')}
            aria-label={t('btn.exportConfigTitle')}
            onClick={exportConfig}
          >
            <ExportIcon />
          </button>
        </div>
      </div>
    </header>
  );
}
