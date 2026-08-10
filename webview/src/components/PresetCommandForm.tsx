import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import { usePanel } from '../context/PanelContext';

interface PresetCommandFormProps {
  showAddForm: boolean;
  onCloseAddForm: () => void;
}

export function PresetCommandForm({ showAddForm, onCloseAddForm }: PresetCommandFormProps) {
  const {
    editingPresetKey,
    editingPresetDraft,
    setEditingPresetDraft,
    addPresetCommand,
    updatePresetCommand,
    cancelEditPresetCommand,
    clearPresetFormDraft,
  } = usePanel();

  const labelRef = useRef<HTMLInputElement>(null);
  const [addLabel, setAddLabel] = useState('');
  const [addCommand, setAddCommand] = useState('');
  const isEditing = !!editingPresetKey;
  const showForm = isEditing || showAddForm;
  const labelValue = isEditing ? (editingPresetDraft?.label ?? '') : addLabel;
  const commandValue = isEditing ? (editingPresetDraft?.command ?? '') : addCommand;

  useEffect(() => {
    if (!showAddForm) {
      setAddLabel('');
      setAddCommand('');
    }
  }, [showAddForm]);

  useEffect(() => {
    if (!showForm || !labelRef.current) {
      return;
    }
    labelRef.current.focus();
    if (isEditing) {
      labelRef.current.select();
    }
  }, [showForm, isEditing, editingPresetKey]);

  const handleCloseAddForm = () => {
    setAddLabel('');
    setAddCommand('');
    onCloseAddForm();
  };

  const handleSubmit = (event: Event) => {
    event.preventDefault();
    const label = labelValue.trim();
    const command = commandValue.trim();
    if (!label || !command) {
      return;
    }
    if (editingPresetKey) {
      updatePresetCommand(editingPresetKey, label, command);
      clearPresetFormDraft();
      return;
    }
    addPresetCommand(label, command);
    handleCloseAddForm();
  };

  if (!showForm) {
    return null;
  }

  return (
    <form
      class={`custom-add-form custom-command-form${isEditing ? ' custom-edit-form' : ''}`}
      id="preset-add-form"
      onSubmit={handleSubmit}
    >
      <div class={`custom-form-hint${isEditing ? ' custom-edit-hint' : ''}`}>
        {isEditing ? t('preset.editHint') : t('preset.addHint')}
      </div>
      <input
        id="preset-label"
        ref={labelRef}
        type="text"
        value={labelValue}
        placeholder={t('custom.labelPlaceholder')}
        onInput={(e) => {
          const value = (e.target as HTMLInputElement).value;
          if (isEditing) {
            setEditingPresetDraft({ label: value, command: commandValue });
          } else {
            setAddLabel(value);
          }
        }}
      />
      <input
        id="preset-command"
        type="text"
        value={commandValue}
        placeholder={t('custom.commandPlaceholder')}
        spellcheck={false}
        onInput={(e) => {
          const value = (e.target as HTMLInputElement).value;
          if (isEditing) {
            setEditingPresetDraft({ label: labelValue, command: value });
          } else {
            setAddCommand(value);
          }
        }}
      />
      <div class="custom-form-actions">
        {isEditing ? (
          <button type="button" id="preset-cancel-edit" class="ghost" onClick={cancelEditPresetCommand}>
            {t('btn.cancel')}
          </button>
        ) : (
          <button type="button" id="preset-cancel-add" class="ghost" onClick={handleCloseAddForm}>
            {t('btn.cancel')}
          </button>
        )}
        <button type="submit">{isEditing ? t('btn.save') : t('btn.add')}</button>
      </div>
    </form>
  );
}
