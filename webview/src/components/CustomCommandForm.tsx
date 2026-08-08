import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import { usePanel } from '../context/PanelContext';

export function CustomCommandForm() {
  const {
    editingCustomId,
    editingCustomDraft,
    setEditingCustomDraft,
    addCustomCommand,
    updateCustomCommand,
    cancelEditCustomCommand,
    clearCustomFormDraft,
  } = usePanel();

  const labelRef = useRef<HTMLInputElement>(null);
  const [addLabel, setAddLabel] = useState('');
  const [addCommand, setAddCommand] = useState('');
  const isEditing = !!editingCustomId;
  const labelValue = isEditing ? (editingCustomDraft?.label ?? '') : addLabel;
  const commandValue = isEditing ? (editingCustomDraft?.command ?? '') : addCommand;

  useEffect(() => {
    if (isEditing && labelRef.current) {
      labelRef.current.focus();
      labelRef.current.select();
    }
  }, [isEditing, editingCustomId]);

  const handleSubmit = (event: Event) => {
    event.preventDefault();
    const label = labelValue.trim();
    const command = commandValue.trim();
    if (!label || !command) {
      return;
    }
    if (editingCustomId) {
      updateCustomCommand(editingCustomId, label, command);
      clearCustomFormDraft();
    } else {
      addCustomCommand(label, command);
      setAddLabel('');
      setAddCommand('');
    }
  };

  return (
    <form
      class={`custom-add-form${isEditing ? ' custom-edit-form' : ''}`}
      id="custom-add-form"
      onSubmit={handleSubmit}
    >
      {isEditing ? <div class="custom-edit-hint">{t('custom.editHint')}</div> : null}
      <input
        id="custom-label"
        ref={labelRef}
        type="text"
        value={labelValue}
        placeholder={t('custom.labelPlaceholder')}
        onInput={(e) => {
          const value = (e.target as HTMLInputElement).value;
          if (isEditing) {
            setEditingCustomDraft({ label: value, command: commandValue });
          } else {
            setAddLabel(value);
          }
        }}
      />
      <input
        id="custom-command"
        type="text"
        value={commandValue}
        placeholder={t('custom.commandPlaceholder')}
        spellcheck={false}
        onInput={(e) => {
          const value = (e.target as HTMLInputElement).value;
          if (isEditing) {
            setEditingCustomDraft({ label: labelValue, command: value });
          } else {
            setAddCommand(value);
          }
        }}
      />
      <div class="custom-form-actions">
        {isEditing ? (
          <button type="button" id="custom-cancel-edit" class="ghost" onClick={cancelEditCustomCommand}>
            {t('btn.cancel')}
          </button>
        ) : null}
        <button type="submit">{isEditing ? t('btn.save') : t('btn.add')}</button>
      </div>
    </form>
  );
}
