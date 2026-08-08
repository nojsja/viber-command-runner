(function () {
  const vscode = acquireVsCodeApi();
  const i18n = window.ViberI18n;
  const t = (key, params) => i18n.t(key, params);

  /** @type {any} */
  let state = null;
  /** @type {string} */
  let filterText = '';
  /** @type {Record<string, boolean>} */
  let localGroupFold = {};
  /** @type {Record<string, { buffer: string; hasStderr: boolean }>} */
  let taskOutputs = {};
  /** @type {Record<string, boolean>} */
  let taskTerminalFold = {};
  /** @type {string | undefined} */
  let interactiveRecordId = undefined;
  /** @type {string | undefined} */
  let editingCustomId = undefined;
  /** @type {{ label: string; command: string } | undefined} */
  let editingCustomDraft = undefined;

  const metaGrid = document.getElementById('meta-grid');
  const commandGroupsRoot = document.getElementById('command-groups');
  const commandFilter = /** @type {HTMLInputElement} */ (document.getElementById('command-filter'));
  const parallelModeToggle = /** @type {HTMLInputElement | null} */ (document.getElementById('parallel-mode-toggle'));
  const adhocTaskTerminals = document.getElementById('adhoc-task-terminals');
  const adhocCommand = /** @type {HTMLInputElement | null} */ (document.getElementById('adhoc-command'));
  const adhocPaste = document.getElementById('adhoc-paste');
  const adhocRun = document.getElementById('adhoc-run');
  const historyArchive = /** @type {HTMLDetailsElement | null} */ (document.getElementById('history-archive'));
  const historyArchiveCount = document.getElementById('history-archive-count');
  const historyArchiveScroll = document.getElementById('history-archive-scroll');
  const historyArchiveList = document.getElementById('history-archive-list');
  const historyArchiveFooter = document.getElementById('history-archive-footer');
  const historyLatest = document.getElementById('history-latest');
  const terminalOutput = document.getElementById('terminal-output');
  const terminalStatus = document.getElementById('terminal-status');
  const terminalSticky = document.getElementById('terminal-sticky');
  const terminalStickyOutput = document.getElementById('terminal-sticky-output');
  const terminalStickyStatus = document.getElementById('terminal-sticky-status');
  const terminalStickyPreview = document.getElementById('terminal-sticky-preview');
  const terminalPanel = document.getElementById('terminal-panel');
  const terminalPanelPreview = document.getElementById('terminal-panel-preview');
  const btnStickyFold = document.getElementById('btn-sticky-fold');
  const btnTerminalPanelFold = document.getElementById('btn-terminal-panel-fold');
  const btnStickyHide = document.getElementById('btn-sticky-hide');
  const btnStickyShow = document.getElementById('btn-sticky-show');
  const inputOverlay = document.getElementById('input-overlay');
  const inputContextText = document.getElementById('input-context-text');
  const inputPromptText = document.getElementById('input-prompt-text');
  const inputField = /** @type {HTMLInputElement | null} */ (document.getElementById('input-field'));
  const inputShortcuts = document.getElementById('input-shortcuts');
  const inputSubmit = document.getElementById('input-submit');
  const inputCancel = document.getElementById('input-cancel');
  const inputClose = document.getElementById('input-close');
  const confirmOverlay = document.getElementById('confirm-overlay');
  const confirmMessage = document.getElementById('confirm-message');
  const confirmOk = document.getElementById('confirm-ok');
  const confirmCancel = document.getElementById('confirm-cancel');
  const globalLoading = document.getElementById('global-loading');
  const globalLoadingText = document.getElementById('global-loading-text');
  const appToast = document.getElementById('app-toast');
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let toastTimer = undefined;
  /** @type {((confirmed: boolean) => void) | undefined} */
  let confirmResolver = undefined;

  /** @type {string} */
  let terminalBuffer = '';
  const MAX_TERMINAL_CHARS = 500_000;
  const HISTORY_PAGE_SIZE = 10;
  const PROMPT_CONTEXT_LINES = 20;
  let historyPage = 1;
  /** @type {string | undefined} */
  let lastLatestRecordId = undefined;
  /** @type {string} */
  let currentPromptText = '';
  let stickyTerminalHidden = false;
  /** @type {string} */
  let runningStatusLabel = '';

  function showToast(level, message) {
    if (!appToast || !message) {
      return;
    }
    appToast.textContent = message;
    appToast.className = `app-toast toast-${level || 'info'}`;
    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    toastTimer = setTimeout(() => {
      appToast.classList.add('hidden');
    }, 3200);
  }

  function finishConfirm(confirmed) {
    confirmOverlay?.classList.add('hidden');
    confirmOverlay?.setAttribute('aria-hidden', 'true');
    confirmResolver?.(confirmed);
    confirmResolver = undefined;
  }

  function showConfirm(message, confirmLabel, cancelLabel) {
    return new Promise((resolve) => {
      confirmResolver = resolve;
      if (confirmMessage) {
        confirmMessage.textContent = message;
      }
      if (confirmOk) {
        confirmOk.textContent = confirmLabel || t('btn.confirm');
      }
      if (confirmCancel) {
        confirmCancel.textContent = cancelLabel || t('btn.cancel');
      }
      confirmOverlay?.classList.remove('hidden');
      confirmOverlay?.setAttribute('aria-hidden', 'false');
    });
  }

  confirmOk?.addEventListener('click', () => {
    finishConfirm(true);
  });
  confirmCancel?.addEventListener('click', () => {
    finishConfirm(false);
  });
  confirmOverlay?.addEventListener('click', (event) => {
    if (event.target === confirmOverlay) {
      finishConfirm(false);
    }
  });

  btnStickyHide?.addEventListener('click', () => {
    stickyTerminalHidden = true;
    updateTerminalChrome();
  });
  btnStickyShow?.addEventListener('click', () => {
    stickyTerminalHidden = false;
    updateTerminalChrome();
    if (terminalStickyOutput) {
      terminalStickyOutput.scrollTop = terminalStickyOutput.scrollHeight;
    }
  });

  btnStickyFold?.addEventListener('click', () => {
    toggleTerminalFold('sticky');
  });
  btnTerminalPanelFold?.addEventListener('click', () => {
    toggleTerminalFold('panel');
  });

  historyArchiveFooter?.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target.id !== 'btn-history-next') {
      return;
    }
    historyPage += 1;
    renderHistorySection(false);
    if (historyArchiveScroll) {
      historyArchiveScroll.scrollTop = historyArchiveScroll.scrollHeight;
    }
  });

  historyArchive?.addEventListener('toggle', () => {
    syncHistoryPanelLayout();
  });

  function syncHistoryPanelLayout() {
    const panel = document.querySelector('.history-panel');
    if (!panel || !historyArchive) {
      return;
    }
    const expanded = historyArchive.open && !historyArchive.classList.contains('hidden');
    panel.classList.toggle('history-expanded', expanded);
  }

  document.getElementById('btn-refresh')?.addEventListener('click', () => {
    vscode.postMessage({ type: 'refresh' });
  });
  document.getElementById('btn-sync')?.addEventListener('click', () => {
    vscode.postMessage({ type: 'syncOss' });
  });
  document.getElementById('btn-settings')?.addEventListener('click', () => {
    vscode.postMessage({ type: 'openSettings' });
  });
  document.getElementById('btn-export-config')?.addEventListener('click', () => {
    vscode.postMessage({ type: 'exportConfig' });
  });
  document.getElementById('btn-import-config')?.addEventListener('click', () => {
    vscode.postMessage({ type: 'importConfig' });
  });
  document.getElementById('btn-terminal')?.addEventListener('click', () => {
    vscode.postMessage({ type: 'openTerminal' });
  });
  document.getElementById('btn-clear-terminal')?.addEventListener('click', () => {
    vscode.postMessage({ type: 'clearTerminal' });
  });
  document.querySelectorAll('.terminal-stop-btn').forEach((button) => {
    button.addEventListener('click', () => {
      vscode.postMessage({ type: 'cancelRun' });
    });
  });
  adhocPaste?.addEventListener('click', () => {
    vscode.postMessage({ type: 'pasteAdhocCommand' });
  });
  adhocRun?.addEventListener('click', () => {
    runAdhocCommand();
  });
  adhocCommand?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runAdhocCommand();
    }
  });
  commandFilter?.addEventListener('input', () => {
    filterText = commandFilter.value.trim().toLowerCase();
    render();
  });
  parallelModeToggle?.addEventListener('change', () => {
    vscode.postMessage({ type: 'setParallelMode', enabled: !!parallelModeToggle.checked });
  });

  inputSubmit?.addEventListener('click', () => {
    submitInteractiveInput();
  });
  inputCancel?.addEventListener('click', () => {
    if (/输入 q|type q|enter q/i.test(currentPromptText)) {
      sendInteractiveInput('q');
      return;
    }
    hideInteractivePrompt();
    vscode.postMessage({ type: 'cancelRun' });
  });
  inputClose?.addEventListener('click', () => {
    hideInteractivePrompt();
  });
  inputField?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitInteractiveInput();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      hideInteractivePrompt();
    }
  });
  inputOverlay?.addEventListener('click', (event) => {
    if (event.target === inputOverlay) {
      hideInteractivePrompt();
    }
  });

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'loading') {
      setGlobalLoading(message.active, message.messageKey);
      return;
    }
    if (message.type === 'state') {
      state = message.payload;
      if (state?.uiLanguage && state.uiLanguage !== i18n.getLocale()) {
        i18n.setLocale(state.uiLanguage);
      }
      if (parallelModeToggle) {
        parallelModeToggle.checked = !!state?.parallelMode;
      }
      render();
      return;
    }
    if (message.type === 'toast') {
      showToast(message.level, message.message);
      return;
    }
    if (message.type === 'terminalClear') {
      terminalBuffer = '';
      renderTerminal();
      return;
    }
    if (message.type === 'terminalOutput') {
      if (message.recordId) {
        appendTaskTerminal(message.recordId, message.chunk, message.stream);
        return;
      }
      appendTerminal(message.chunk, message.stream);
      return;
    }
    if (message.type === 'runStarted') {
      if (message.recordId && state?.parallelMode) {
        ensureTaskOutput(message.recordId);
        render();
        return;
      }
      stickyTerminalHidden = false;
      runningStatusLabel = message.label || '';
      const statusText = runningStatusLabel
        ? t('terminal.runningLabel', { label: runningStatusLabel })
        : t('terminal.running');
      if (terminalStatus) {
        terminalStatus.textContent = statusText;
        terminalStatus.className = 'terminal-status running';
      }
      if (terminalStickyStatus) {
        terminalStickyStatus.textContent = statusText;
        terminalStickyStatus.className = 'terminal-status running';
      }
      updateTerminalChrome();
      return;
    }
    if (message.type === 'interactivePrompt') {
      interactiveRecordId = message.recordId;
      showInteractivePrompt(message.prompt, message.shortcuts || [], message.context || '', message.recordId);
      return;
    }
    if (message.type === 'interactivePromptDismiss') {
      hideInteractivePrompt();
      return;
    }
    if (message.type === 'confirmRequest') {
      void showConfirm(message.message, message.confirmLabel, message.cancelLabel).then((confirmed) => {
        vscode.postMessage({ type: 'confirmResponse', confirmed });
      });
      return;
    }
    if (message.type === 'adhocClipboardText') {
      if (adhocCommand) {
        adhocCommand.value = String(message.text || '').trim();
        adhocCommand.focus();
      }
      return;
    }
  });

  vscode.postMessage({ type: 'ready' });

  setTerminalExpanded('sticky', true, false);
  setTerminalExpanded('panel', true, false);

  function setGlobalLoading(active, messageKey) {
    const show = !!active;
    globalLoading?.classList.toggle('hidden', !show);
    globalLoading?.setAttribute('aria-busy', show ? 'true' : 'false');
    document.body.classList.toggle('global-loading-active', show);

    if (messageKey && globalLoadingText) {
      globalLoadingText.textContent = t(messageKey);
    }
  }

  window.addEventListener('resize', () => {
    positionStickyTerminal();
  });

  function positionStickyTerminal() {
    if (!terminalSticky || terminalSticky.classList.contains('hidden')) {
      return;
    }
    const anchor = metaGrid || document.querySelector('.hero');
    if (!anchor) {
      terminalSticky.style.top = '10px';
      return;
    }
    const bottom = anchor.getBoundingClientRect().bottom;
    terminalSticky.style.top = `${Math.max(8, Math.round(bottom + 8))}px`;
  }

  function render() {
    if (!state || !metaGrid || !commandGroupsRoot || !historyLatest || !historyArchiveList) {
      return;
    }

    captureCustomFormDraft();

    if (state.groupFold) {
      localGroupFold = { ...state.groupFold };
    }

    const versionLabel = state.appVersion
      ? `${state.appVersion}${state.appBuild ? ` (${state.appBuild})` : ''}`
      : t('meta.unknown');

    const ossValue = state.ossEnabled
      ? state.ossSyncedAt
        ? t('meta.ossSynced', { time: formatTime(state.ossSyncedAt) })
        : t('meta.ossEnabled')
      : t('meta.ossDisabled');

    const statusValue = (state.parallelMode && (state.runningRecordIds || []).length) || state.runningRecordId
      ? t('meta.statusRunning')
      : state.syncing
        ? t('meta.statusSyncing')
        : t('meta.statusReady');

    metaGrid.innerHTML = [
      metaCard(t('meta.workspace'), state.workspaceName),
      metaCard(t('meta.branch'), state.branch),
      metaCard(t('meta.operator'), state.operator),
      metaCard(t('meta.version'), versionLabel),
      metaCard(t('meta.oss'), ossValue),
      metaCard(t('meta.status'), statusValue),
    ].join('');

    renderCommandGroups();
    renderAdhocTaskTerminals();

    renderHistorySection(true);
    syncTerminalFold();
    updateTerminalChrome();
  }

  function runAdhocCommand() {
    const command = adhocCommand?.value?.trim();
    if (!command) {
      return;
    }
    vscode.postMessage({ type: 'runRawCommand', command });
  }

  function renderCommandGroups() {
    if (!commandGroupsRoot) {
      return;
    }

    const groups = state.commandGroups || [];
    if (!groups.length) {
      commandGroupsRoot.innerHTML = `<div class="empty">${escapeHtml(t('empty.noCommands'))}</div>`;
      return;
    }

    commandGroupsRoot.innerHTML = groups.map(renderCommandGroup).join('');
    bindCommandGroupEvents();
    commandGroupsRoot.querySelectorAll('.command-task-terminals').forEach((container) => {
      bindTaskTerminalEvents(container);
    });
  }

  function renderCommandGroup(group) {
    const isOpen = localGroupFold[group.id] ?? group.id === 'release';
    const filtered = (group.commands || []).filter(matchesCommandFilter);
    const countLabel = filterText ? `${filtered.length}/${group.commands.length}` : String(group.commands.length);
    const body = group.id === 'custom'
      ? `${renderCustomAddForm()}${filtered.length ? filtered.map(renderCommand).join('') : `<div class="empty">${escapeHtml(t('empty.noCustomCommands'))}</div>`}`
      : filtered.length
        ? filtered.map(renderCommand).join('')
        : `<div class="empty">${escapeHtml(t('empty.noMatch'))}</div>`;

    return `
      <details class="command-group" data-group-id="${escapeHtmlAttr(group.id)}" ${isOpen ? 'open' : ''}>
        <summary class="command-group-toggle">
          <span>${escapeHtml(group.title)}</span>
          <span class="command-group-count">(${countLabel})</span>
        </summary>
        <div class="command-list">${body}</div>
      </details>
    `;
  }

  function renderCustomAddForm() {
    const isEditing = !!editingCustomId;
    const labelValue = editingCustomDraft?.label ?? '';
    const commandValue = editingCustomDraft?.command ?? '';
    return `
      <form class="custom-add-form${isEditing ? ' custom-edit-form' : ''}" id="custom-add-form">
        ${isEditing ? `<div class="custom-edit-hint">${escapeHtml(t('custom.editHint'))}</div>` : ''}
        <input id="custom-label" type="text" value="${escapeHtmlAttr(labelValue)}" placeholder="${escapeHtmlAttr(t('custom.labelPlaceholder'))}" />
        <input id="custom-command" type="text" value="${escapeHtmlAttr(commandValue)}" placeholder="${escapeHtmlAttr(t('custom.commandPlaceholder'))}" spellcheck="false" />
        <div class="custom-form-actions">
          ${isEditing ? `<button type="button" id="custom-cancel-edit" class="ghost">${escapeHtml(t('btn.cancel'))}</button>` : ''}
          <button type="submit">${escapeHtml(isEditing ? t('btn.save') : t('btn.add'))}</button>
        </div>
      </form>
    `;
  }

  function captureCustomFormDraft() {
    if (!editingCustomId) {
      return;
    }
    const form = document.getElementById('custom-add-form');
    if (!form?.classList.contains('custom-edit-form')) {
      return;
    }
    const labelInput = /** @type {HTMLInputElement | null} */ (document.getElementById('custom-label'));
    const commandInput = /** @type {HTMLInputElement | null} */ (document.getElementById('custom-command'));
    if (!labelInput && !commandInput) {
      return;
    }
    editingCustomDraft = {
      label: labelInput?.value ?? editingCustomDraft?.label ?? '',
      command: commandInput?.value ?? editingCustomDraft?.command ?? '',
    };
  }

  function findCustomCommandById(customId) {
    for (const group of state?.commandGroups ?? []) {
      for (const command of group.commands ?? []) {
        if (command.customId === customId) {
          return command;
        }
      }
    }
    return undefined;
  }

  function startEditCustomCommand(customId) {
    const command = findCustomCommandById(customId);
    if (!command) {
      return;
    }
    editingCustomId = customId;
    editingCustomDraft = { label: command.label, command: command.command };
    localGroupFold.custom = true;
    render();
    const form = document.getElementById('custom-add-form');
    const labelInput = /** @type {HTMLInputElement | null} */ (document.getElementById('custom-label'));
    const commandInput = /** @type {HTMLInputElement | null} */ (document.getElementById('custom-command'));
    if (labelInput) {
      labelInput.value = command.label;
    }
    if (commandInput) {
      commandInput.value = command.command;
    }
    form?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    labelInput?.focus();
    labelInput?.select();
  }

  function cancelEditCustomCommand() {
    editingCustomId = undefined;
    editingCustomDraft = undefined;
    render();
  }

  function clearCustomFormDraft() {
    editingCustomId = undefined;
    editingCustomDraft = undefined;
  }

  function matchesCommandFilter(command) {
    if (!filterText) {
      return true;
    }
    const haystack = [
      command.label,
      command.platform,
      command.releaseType,
      ...(command.destinations || []),
    ].join(' ').toLowerCase();
    return haystack.includes(filterText);
  }

  function bindCommandGroupEvents() {
    commandGroupsRoot?.querySelectorAll('.command-group').forEach((groupEl) => {
      const groupId = groupEl.getAttribute('data-group-id');
      if (!groupId) {
        return;
      }
      groupEl.addEventListener('toggle', () => {
        const open = /** @type {HTMLDetailsElement} */ (groupEl).open;
        localGroupFold[groupId] = open;
        vscode.postMessage({ type: 'setGroupFold', groupId, open });
      });
    });

    commandGroupsRoot?.querySelectorAll('[data-copy-command]').forEach((button) => {
      button.addEventListener('click', () => {
        const command = button.getAttribute('data-copy-command');
        if (command) {
          vscode.postMessage({ type: 'copyCommand', command });
        }
      });
    });

    commandGroupsRoot?.querySelectorAll('[data-run-key]').forEach((button) => {
      button.addEventListener('click', () => {
        const key = button.getAttribute('data-run-key');
        if (key) {
          vscode.postMessage({ type: 'runCommand', commandKey: key });
        }
      });
    });

    commandGroupsRoot?.querySelectorAll('[data-edit-custom]').forEach((button) => {
      button.addEventListener('click', () => {
        const customId = button.getAttribute('data-edit-custom');
        if (customId) {
          startEditCustomCommand(customId);
        }
      });
    });

    commandGroupsRoot?.querySelectorAll('[data-remove-custom]').forEach((button) => {
      button.addEventListener('click', () => {
        const customId = button.getAttribute('data-remove-custom');
        const label = button.getAttribute('data-remove-label') || '';
        if (!customId) {
          return;
        }
        void showConfirm(
          t('custom.deleteConfirm', { label }),
          t('btn.remove'),
          t('btn.cancel'),
        ).then((confirmed) => {
          if (confirmed) {
            vscode.postMessage({ type: 'removeCustomCommand', customId });
          }
        });
      });
    });

    commandGroupsRoot?.querySelectorAll('[data-cancel-record]').forEach((button) => {
      button.addEventListener('click', () => {
        const recordId = button.getAttribute('data-cancel-record');
        if (recordId) {
          vscode.postMessage({ type: 'cancelRun', recordId });
        }
      });
    });

    const customForm = document.getElementById('custom-add-form');
    customForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      const labelInput = /** @type {HTMLInputElement | null} */ (document.getElementById('custom-label'));
      const commandInput = /** @type {HTMLInputElement | null} */ (document.getElementById('custom-command'));
      const label = labelInput?.value?.trim() ?? '';
      const command = commandInput?.value?.trim() ?? '';
      if (!label || !command) {
        return;
      }
      if (editingCustomId) {
        vscode.postMessage({ type: 'updateCustomCommand', customId: editingCustomId, label, command });
      } else {
        vscode.postMessage({ type: 'addCustomCommand', label, command });
      }
      clearCustomFormDraft();
    });
    document.getElementById('custom-cancel-edit')?.addEventListener('click', () => {
      cancelEditCustomCommand();
    });
  }

  function bindHistoryActions(root) {
    root?.querySelectorAll('[data-retry-key]').forEach((button) => {
      button.addEventListener('click', () => {
        const key = button.getAttribute('data-retry-key');
        if (key && (!state.runningRecordId || state.parallelMode)) {
          vscode.postMessage({ type: 'runCommand', commandKey: key });
        }
      });
    });
  }

  function toggleTerminalFold(target) {
    const expanded = target === 'sticky'
      ? terminalSticky?.classList.contains('terminal-collapsed')
      : terminalPanel?.classList.contains('terminal-collapsed');
    setTerminalExpanded(target, !!expanded, true);
  }

  function syncTerminalFold() {
    const fold = state?.terminalFold;
    if (!fold) {
      return;
    }
    setTerminalExpanded('sticky', fold.sticky !== false, false);
    setTerminalExpanded('panel', fold.panel !== false, false);
  }

  function setTerminalExpanded(target, expanded, persist) {
    const root = target === 'sticky' ? terminalSticky : terminalPanel;
    const toggle = target === 'sticky' ? btnStickyFold : btnTerminalPanelFold;
    root?.classList.toggle('terminal-collapsed', !expanded);
    toggle?.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    toggle?.setAttribute('aria-label', t(expanded ? 'terminal.foldCollapse' : 'terminal.foldExpand'));
    updateTerminalPreview();
    if (target === 'sticky') {
      requestAnimationFrame(() => positionStickyTerminal());
    }
    if (persist) {
      vscode.postMessage({ type: 'setTerminalFold', target, expanded });
    }
  }

  function updateTerminalPreview() {
    const preview = terminalPreviewLine();
    if (terminalStickyPreview) {
      terminalStickyPreview.textContent = preview;
    }
    if (terminalPanelPreview) {
      terminalPanelPreview.textContent = preview;
    }
  }

  function terminalPreviewLine() {
    const clean = terminalBuffer.trimEnd();
    if (!clean) {
      return '';
    }
    const lines = clean.split('\n').filter((line) => line.trim());
    if (!lines.length) {
      return '';
    }
    const last = lines[lines.length - 1].trim();
    return last.length > 96 ? `${last.slice(0, 93)}...` : last;
  }

  function updateTerminalChrome() {
    if (state?.parallelMode) {
      terminalSticky?.classList.add('hidden');
      terminalSticky?.setAttribute('aria-hidden', 'true');
      btnStickyShow?.classList.add('hidden');
      const parallelRunning = (state.runningRecordIds || []).length > 0;
      document.querySelectorAll('.hero-actions .terminal-stop-btn').forEach((button) => {
        button.classList.toggle('hidden', !parallelRunning);
      });
      if (terminalStatus) {
        terminalStatus.textContent = parallelRunning ? t('terminal.running') : t('terminal.ready');
        terminalStatus.className = parallelRunning ? 'terminal-status running' : 'terminal-status';
      }
      return;
    }

    const isRunning = !!state?.runningRecordId;
    const latestRecord = state?.records?.[0];
    const keepStickyOnFailure = !isRunning && latestRecord?.status === 'failed';
    const stickyActive = isRunning || keepStickyOnFailure;
    const showSticky = stickyActive && !stickyTerminalHidden;

    terminalSticky?.classList.toggle('hidden', !showSticky);
    terminalSticky?.setAttribute('aria-hidden', showSticky ? 'false' : 'true');
    btnStickyShow?.classList.toggle('hidden', !stickyActive || !stickyTerminalHidden);
    requestAnimationFrame(() => positionStickyTerminal());

    document.querySelectorAll('.terminal-stop-btn').forEach((button) => {
      button.classList.toggle('hidden', !isRunning);
    });

    if (isRunning) {
      terminalStatus?.classList.add('running');
      const statusText = runningStatusLabel
        ? t('terminal.runningLabel', { label: runningStatusLabel })
        : t('terminal.running');
      if (terminalStatus) {
        terminalStatus.textContent = statusText;
      }
      if (terminalStickyStatus) {
        terminalStickyStatus.textContent = statusText;
        terminalStickyStatus.className = 'terminal-status running';
      }
      return;
    }

    runningStatusLabel = '';
    terminalStatus?.classList.remove('running');
    if (terminalStatus) {
      terminalStatus.textContent = t('terminal.ready');
    }

    if (keepStickyOnFailure && terminalStickyStatus) {
      const exitHint = latestRecord?.exitCode !== undefined ? ` (exit ${latestRecord.exitCode})` : '';
      terminalStickyStatus.textContent = t('terminal.failed', { exit: exitHint });
      terminalStickyStatus.className = 'terminal-status failed';
    }

    updateTerminalPreview();
  }

  function renderHistorySection(resetPageOnLatestChange) {
    if (!historyLatest || !historyArchiveList || !historyArchive) {
      return;
    }

    const records = state.records || [];
    const latest = records[0];
    const latestId = latest?.id;
    const archiveOpen = historyArchive.open;

    if (resetPageOnLatestChange && latestId !== lastLatestRecordId) {
      historyPage = 1;
      lastLatestRecordId = latestId;
    }

    historyLatest.innerHTML = latest
      ? renderHistory(latest, true)
      : `<div class="empty">${escapeHtml(t('empty.noHistory'))}</div>`;
    bindHistoryActions(historyLatest);

    const archiveRecords = records.slice(1);
    if (historyArchiveCount) {
      historyArchiveCount.textContent = archiveRecords.length ? `(${archiveRecords.length})` : '';
    }

    if (archiveRecords.length === 0) {
      historyArchive.classList.add('hidden');
      historyArchiveList.innerHTML = '';
      if (historyArchiveFooter) {
        historyArchiveFooter.innerHTML = '';
      }
      syncHistoryPanelLayout();
      return;
    }

    historyArchive.classList.remove('hidden');
    historyArchive.open = archiveOpen;

    const totalShown = historyPage * HISTORY_PAGE_SIZE;
    const shownRecords = archiveRecords.slice(0, totalShown);
    historyArchiveList.innerHTML = shownRecords.map((record) => renderHistory(record, false)).join('');
    bindHistoryActions(historyArchiveList);

    if (historyArchiveFooter) {
      const hasMore = totalShown < archiveRecords.length;
      if (hasMore) {
        historyArchiveFooter.innerHTML =
          `<button id="btn-history-next" class="ghost load-more">${escapeHtml(t('history.loadMore', { shown: shownRecords.length, total: archiveRecords.length }))}</button>`;
      } else if (archiveRecords.length > HISTORY_PAGE_SIZE) {
        historyArchiveFooter.innerHTML =
          `<div class="history-end">${escapeHtml(t('history.allLoaded', { count: archiveRecords.length }))}</div>`;
      } else {
        historyArchiveFooter.innerHTML = '';
      }
    }

    syncHistoryPanelLayout();
  }

  function appendTerminal(chunk, stream) {
    terminalBuffer += stripAnsi(chunk);
    if (terminalBuffer.length > MAX_TERMINAL_CHARS) {
      terminalBuffer = terminalBuffer.slice(-MAX_TERMINAL_CHARS);
    }
    renderTerminal(stream === 'stderr');
  }

  function ensureTaskOutput(recordId) {
    if (!taskOutputs[recordId]) {
      taskOutputs[recordId] = { buffer: '', hasStderr: false };
    }
    return taskOutputs[recordId];
  }

  function appendTaskTerminal(recordId, chunk, stream) {
    const output = ensureTaskOutput(recordId);
    output.buffer += stripAnsi(chunk);
    if (output.buffer.length > MAX_TERMINAL_CHARS) {
      output.buffer = output.buffer.slice(-MAX_TERMINAL_CHARS);
    }
    if (stream === 'stderr') {
      output.hasStderr = true;
    }
    const node = document.getElementById(`task-terminal-output-${recordId}`);
    if (node) {
      node.textContent = output.buffer;
      node.classList.toggle('has-stderr', output.hasStderr);
      node.scrollTop = node.scrollHeight;
      updateTaskTerminalPreview(recordId);
      return;
    }
    render();
  }

  function getTaskSessionsForCommand(commandKey) {
    return (state?.taskSessions || []).filter((session) => session.commandKey === commandKey);
  }

  function isTaskTerminalExpanded(recordId) {
    return taskTerminalFold[recordId] !== false;
  }

  function setTaskTerminalExpanded(recordId, expanded) {
    taskTerminalFold[recordId] = expanded;
    const root = document.querySelector(`.command-task-terminal[data-record-id="${recordId}"]`);
    const toggle = root?.querySelector('[data-task-fold]');
    root?.classList.toggle('terminal-collapsed', !expanded);
    toggle?.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    toggle?.setAttribute('aria-label', t(expanded ? 'terminal.foldCollapse' : 'terminal.foldExpand'));
    updateTaskTerminalPreview(recordId);
  }

  function taskTerminalPreviewLine(recordId) {
    const clean = (taskOutputs[recordId]?.buffer || '').trimEnd();
    if (!clean) {
      return '';
    }
    const lines = clean.split('\n').filter((line) => line.trim());
    if (!lines.length) {
      return '';
    }
    const last = lines[lines.length - 1].trim();
    return last.length > 96 ? `${last.slice(0, 93)}...` : last;
  }

  function updateTaskTerminalPreview(recordId) {
    const preview = document.getElementById(`task-terminal-preview-${recordId}`);
    if (preview) {
      preview.textContent = taskTerminalPreviewLine(recordId);
    }
  }

  function renderTaskTerminal(session) {
    const output = ensureTaskOutput(session.recordId);
    const expanded = isTaskTerminalExpanded(session.recordId);
    const isRunning = session.status === 'running';
    const statusClass = isRunning ? 'running' : session.status === 'failed' ? 'failed' : '';
    const statusText = isRunning
      ? t('terminal.running')
      : session.status === 'success'
        ? t('status.success')
        : session.status === 'cancelled'
          ? t('status.cancelled')
          : t('terminal.failed', { exit: session.exitCode !== undefined ? ` (exit ${session.exitCode})` : '' });
    const preview = taskTerminalPreviewLine(session.recordId);
    return `
      <div class="command-task-terminal panel${expanded ? '' : ' terminal-collapsed'}" data-record-id="${escapeHtmlAttr(session.recordId)}">
        <div class="command-task-terminal-head terminal-head">
          <button type="button" class="terminal-fold-toggle" data-task-fold="${escapeHtmlAttr(session.recordId)}" aria-expanded="${expanded ? 'true' : 'false'}" aria-label="${escapeHtmlAttr(t(expanded ? 'terminal.foldCollapse' : 'terminal.foldExpand'))}">
            <span class="terminal-fold-chevron" aria-hidden="true"></span>
            <span class="terminal-fold-title">${escapeHtml(session.label || statusText)}</span>
            <span id="task-terminal-preview-${escapeHtmlAttr(session.recordId)}" class="terminal-fold-preview">${escapeHtml(preview)}</span>
          </button>
          <div class="command-task-terminal-actions">
            <span class="terminal-status ${statusClass}">${escapeHtml(statusText)}</span>
            ${isRunning ? `<button type="button" class="danger ghost task-stop-btn" data-cancel-record="${escapeHtmlAttr(session.recordId)}">${escapeHtml(t('btn.abort'))}</button>` : ''}
          </div>
        </div>
        <div class="command-task-terminal-body">
          <pre id="task-terminal-output-${escapeHtmlAttr(session.recordId)}" class="terminal-output command-task-output${output.hasStderr ? ' has-stderr' : ''}">${escapeHtml(output.buffer)}</pre>
        </div>
      </div>
    `;
  }

  function renderAdhocTaskTerminals() {
    if (!adhocTaskTerminals) {
      return;
    }
    const sessions = (state?.taskSessions || []).filter((session) => session.commandKey.startsWith('adhoc:'));
    adhocTaskTerminals.innerHTML = sessions.map(renderTaskTerminal).join('');
    bindTaskTerminalEvents(adhocTaskTerminals);
  }

  function bindTaskTerminalEvents(root) {
    root?.querySelectorAll('[data-task-fold]').forEach((button) => {
      button.addEventListener('click', () => {
        const recordId = button.getAttribute('data-task-fold');
        if (!recordId) {
          return;
        }
        setTaskTerminalExpanded(recordId, !isTaskTerminalExpanded(recordId));
      });
    });
    root?.querySelectorAll('[data-cancel-record]').forEach((button) => {
      button.addEventListener('click', () => {
        const recordId = button.getAttribute('data-cancel-record');
        if (recordId) {
          vscode.postMessage({ type: 'cancelRun', recordId });
        }
      });
    });
  }

  function showInteractivePrompt(prompt, shortcuts, serverContext, recordId) {
    const renderPopup = () => {
      if (!inputOverlay || !inputPromptText || !inputShortcuts) {
        return;
      }

      const sourceBuffer = recordId && taskOutputs[recordId] ? taskOutputs[recordId].buffer : terminalBuffer;
      const split = splitPromptContext(sourceBuffer, prompt);
      const context = serverContext?.trim() || split.context;
      if (inputContextText) {
        inputContextText.textContent = context || t('input.noContext');
        inputContextText.scrollTop = inputContextText.scrollHeight;
      }
      inputPromptText.textContent = split.promptLines || stripAnsi(prompt).trim();
      currentPromptText = inputPromptText.textContent;
      inputShortcuts.innerHTML = shortcuts
        .map(
          (item) =>
            `<button type="button" class="ghost shortcut-btn" data-value="${escapeHtmlAttr(item.value)}">${escapeHtml(item.label)}</button>`,
        )
        .join('');
      inputShortcuts.querySelectorAll('.shortcut-btn').forEach((button) => {
        button.addEventListener('click', () => {
          const value = button.getAttribute('data-value') ?? '';
          sendInteractiveInput(value);
        });
      });
      inputOverlay.classList.remove('hidden');
      inputOverlay.setAttribute('aria-hidden', 'false');
      if (inputField) {
        inputField.value = '';
        inputField.focus();
      }
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(renderPopup);
    });
  }

  function hideInteractivePrompt() {
    if (!inputOverlay) {
      return;
    }
    inputOverlay.classList.add('hidden');
    inputOverlay.setAttribute('aria-hidden', 'true');
    currentPromptText = '';
  }

  function submitInteractiveInput() {
    sendInteractiveInput(inputField?.value ?? '');
  }

  function sendInteractiveInput(value) {
    hideInteractivePrompt();
    vscode.postMessage({ type: 'terminalInput', value, recordId: interactiveRecordId });
    interactiveRecordId = undefined;
  }

  function stripAnsi(text) {
    return String(text).replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
  }

  function splitPromptContext(buffer, prompt) {
    const cleanBuffer = stripAnsi(buffer).trimEnd();
    const cleanPrompt = stripAnsi(prompt).trim();
    const lines = cleanBuffer ? cleanBuffer.split('\n') : [];
    const promptLines = cleanPrompt ? cleanPrompt.split('\n').filter((line) => line.trim()) : [];
    let cutIndex = lines.length;

    if (promptLines.length > 0) {
      const anchor = promptLines[promptLines.length - 1].trim();
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        const line = lines[index].trim();
        if (!line) {
          continue;
        }
        if (line.includes(anchor) || (line.length > 10 && anchor.includes(line))) {
          cutIndex = index;
          break;
        }
      }
    }

    let contextStart = Math.max(0, cutIndex - PROMPT_CONTEXT_LINES);
    for (let index = cutIndex - 1; index >= contextStart; index -= 1) {
      const line = lines[index]?.trim() ?? '';
      if (!line) {
        continue;
      }
      if (/^\[\d+\/\d+\]/.test(line)) {
        contextStart = index;
        break;
      }
      if (/可用的|设备|device|APK|apk/i.test(line)) {
        contextStart = Math.min(contextStart, index);
      }
      if (/^\s*\d+\)/.test(line)) {
        contextStart = Math.min(contextStart, index);
      }
    }

    const context = lines.slice(contextStart, cutIndex).join('\n').trim();
    const promptDisplay = lines.slice(cutIndex).join('\n').trim() || cleanPrompt;

    return {
      context,
      promptLines: promptDisplay,
    };
  }

  function renderTerminal(stderrHighlight) {
    if (terminalOutput) {
      terminalOutput.textContent = terminalBuffer;
      terminalOutput.classList.toggle('has-stderr', !!stderrHighlight);
      terminalOutput.scrollTop = terminalOutput.scrollHeight;
    }
    if (terminalStickyOutput) {
      terminalStickyOutput.textContent = terminalBuffer;
      terminalStickyOutput.classList.toggle('has-stderr', !!stderrHighlight);
      terminalStickyOutput.scrollTop = terminalStickyOutput.scrollHeight;
    }
    updateTerminalChrome();
  }

  function metaCard(label, value) {
    return `<div class="meta-card"><div class="meta-label">${escapeHtml(label)}</div><div class="meta-value">${escapeHtml(value)}</div></div>`;
  }

  function commandHoverTip(label, command) {
    return escapeHtmlAttr([label, command].filter(Boolean).join('\n'));
  }

  function renderCommand(command) {
    const disabled = !!state.runningRecordId && !state.parallelMode;
    const tip = commandHoverTip(command.label, command.command);
    const sessions = state.parallelMode ? getTaskSessionsForCommand(command.key) : [];
    const taskTerminals = sessions.map(renderTaskTerminal).join('');
    const removeButton = command.customId
      ? `<button type="button" class="ghost edit-btn" title="${escapeHtmlAttr(t('btn.editTitle'))}" ${disabled ? 'disabled' : ''} data-edit-custom="${escapeHtmlAttr(command.customId)}">${escapeHtml(t('btn.edit'))}</button>
         <button type="button" class="ghost remove-btn" title="${escapeHtmlAttr(t('btn.removeTitle'))}" ${disabled ? 'disabled' : ''} data-remove-custom="${escapeHtmlAttr(command.customId)}" data-remove-label="${escapeHtmlAttr(command.label)}">${escapeHtml(t('btn.remove'))}</button>`
      : '';
    return `
      <article class="command-card" title="${tip}">
        <div class="command-top">
          <div class="command-title" title="${escapeHtmlAttr(command.label)}">${escapeHtml(command.label)}</div>
        </div>
        <div class="command-preview" title="${escapeHtmlAttr(command.command)}">${escapeHtml(command.command)}</div>
        <div class="badges">
          ${badge(command.platform, 'platform')}
          ${badge(command.releaseType, 'type')}
          ${command.interactive ? badge(t('badge.interactive'), 'interactive') : ''}
          ${(command.destinations || []).map((item) => badge(item, 'dest')).join('')}
        </div>
        <div class="command-actions">
          ${removeButton}
          <button type="button" class="ghost copy-btn" title="${escapeHtmlAttr(t('btn.copyTitle'))}" data-copy-command="${escapeHtmlAttr(command.command)}">${escapeHtml(t('btn.copy'))}</button>
          <button type="button" title="${escapeHtmlAttr(t('btn.runTitle'))}" ${disabled ? 'disabled' : ''} data-run-key="${escapeHtmlAttr(command.key)}">${escapeHtml(t('btn.run'))}</button>
        </div>
        ${taskTerminals ? `<div class="command-task-terminals">${taskTerminals}</div>` : ''}
      </article>
    `;
  }

  function renderHistory(record, isLatest) {
    const statusClass = `status-${record.status}`;
    const latestClass = isLatest ? ' history-card-latest' : '';
    const disabled = !!state.runningRecordId && !state.parallelMode;
    const tip = commandHoverTip(record.commandLabel, record.command);
    const versionText = t('history.version', {
      version: record.appVersion || t('meta.unknown'),
      build: record.appBuild ? ` (${record.appBuild})` : '',
    });
    return `
      <article class="history-card${latestClass}" title="${tip}">
        <div class="history-top">
          <div class="history-title" title="${escapeHtmlAttr(record.commandLabel)}">${escapeHtml(record.commandLabel)}</div>
          <div class="${statusClass}">${escapeHtml(record.status)}</div>
        </div>
        <div class="command-preview" title="${escapeHtmlAttr(record.command)}">${escapeHtml(record.command)}</div>
        <div class="badges">
          ${badge(record.platform, 'platform')}
          ${badge(record.releaseType, 'type')}
          ${(record.destinations || []).map((item) => badge(item, 'dest')).join('')}
        </div>
        <div class="history-meta">
          ${escapeHtml(formatTime(record.startedAt))} · ${escapeHtml(record.operator)} · ${escapeHtml(record.branch)}<br />
          ${escapeHtml(versionText)}
          ${record.exitCode !== undefined ? ` · exit ${record.exitCode}` : ''}
        </div>
        <div class="history-actions">
          <button class="ghost retry-btn" type="button" title="${escapeHtmlAttr(t('btn.retryTitle'))}" ${disabled ? 'disabled' : ''} data-retry-key="${escapeHtmlAttr(record.commandKey)}">${escapeHtml(t('btn.retry'))}</button>
        </div>
      </article>
    `;
  }

  function badge(text, kind) {
    return `<span class="badge ${badgeClass(text, kind)}">${escapeHtml(text)}</span>`;
  }

  function badgeClass(text, kind) {
    const normalized = String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!normalized) {
      return '';
    }
    if (kind === 'platform') {
      return `platform-${normalized}`;
    }
    if (kind === 'type') {
      return `type-${normalized}`;
    }
    if (kind === 'dest') {
      return `dest-${normalized}`;
    }
    if (kind === 'interactive') {
      return 'interactive';
    }
    if (normalized === 'custom' || normalized === 'adhoc') {
      return `type-${normalized}`;
    }
    return `tag-${normalized}`;
  }

  function formatTime(value) {
    const locale = i18n.getLocale() === 'zh' ? 'zh-CN' : 'en-US';
    try {
      return new Date(value).toLocaleString(locale, { hour12: false });
    } catch {
      return value;
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  function escapeHtmlAttr(value) {
    return escapeHtml(value).replaceAll("'", '&#39;');
  }
})();
