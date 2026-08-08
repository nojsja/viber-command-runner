import { t } from '../i18n';
import { usePanel } from '../context/PanelContext';

export function Hero() {
  const {
    showStopButtons,
    clearTerminal,
    openTerminal,
    syncOss,
    refresh,
    importConfig,
    exportConfig,
    openSettings,
    cancelRun,
  } = usePanel();

  return (
    <header class="hero">
      <div>
        <div class="eyebrow">Viber Command Runner</div>
        <h1>{t('panel.title')}</h1>
      </div>
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
        <button type="button" class="ghost" onClick={syncOss}>
          {t('btn.syncOss')}
        </button>
        <button type="button" class="ghost" onClick={refresh}>
          {t('btn.refresh')}
        </button>
        <button type="button" class="ghost" onClick={importConfig} title={t('btn.importConfigTitle')}>
          {t('btn.importConfig')}
        </button>
        <button type="button" class="ghost" onClick={exportConfig} title={t('btn.exportConfigTitle')}>
          {t('btn.exportConfig')}
        </button>
        <button type="button" class="ghost" onClick={openSettings}>
          {t('btn.settings')}
        </button>
      </div>
    </header>
  );
}
