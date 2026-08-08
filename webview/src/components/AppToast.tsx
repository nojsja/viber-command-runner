import { usePanel } from '../context/PanelContext';

export function AppToast() {
  const { toast } = usePanel();

  if (!toast) {
    return <div id="app-toast" class="app-toast hidden" role="status" aria-live="off" />;
  }

  return (
    <div id="app-toast" class={`app-toast toast-${toast.level || 'info'}`} role="status" aria-live="off">
      {toast.message}
    </div>
  );
}
