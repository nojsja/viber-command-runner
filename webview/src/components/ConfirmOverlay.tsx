import { t } from '../i18n';
import { usePanel } from '../context/PanelContext';

export function ConfirmOverlay() {
  const { confirm, finishConfirm } = usePanel();

  if (!confirm) {
    return null;
  }

  const handleOverlayClick = (event: MouseEvent) => {
    if (event.target === event.currentTarget) {
      finishConfirm(false);
    }
  };

  return (
    <div
      id="confirm-overlay"
      class="input-overlay"
      aria-hidden="false"
      onClick={handleOverlayClick}
    >
      <div class="input-dialog confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <div class="input-dialog-head">
          <h3 id="confirm-dialog-title">{t('confirm.title')}</h3>
        </div>
        <p id="confirm-message" class="confirm-message">
          {confirm.message}
        </p>
        <div class="input-actions">
          <button id="confirm-ok" type="button" onClick={() => finishConfirm(true)}>
            {confirm.confirmLabel || t('btn.confirm')}
          </button>
          <button id="confirm-cancel" class="ghost" type="button" onClick={() => finishConfirm(false)}>
            {confirm.cancelLabel || t('btn.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
