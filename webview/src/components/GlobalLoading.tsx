import { t } from '../i18n';
import { usePanel } from '../context/PanelContext';

export function GlobalLoading() {
  const { loading, loadingMessageKey } = usePanel();

  return (
    <div
      id="global-loading"
      class={`global-loading${loading ? '' : ' hidden'}`}
      aria-live="polite"
      aria-busy={loading ? 'true' : 'false'}
    >
      <div class="global-loading-card">
        <span class="global-loading-spinner" aria-hidden="true" />
        <span id="global-loading-text">
          {loadingMessageKey ? t(loadingMessageKey) : t('loading.initial')}
        </span>
      </div>
    </div>
  );
}
