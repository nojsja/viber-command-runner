import { createContext, type ComponentChildren } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { getLocale, setLocale, t } from '../i18n';
import type {
  ConfirmState,
  ExtensionMessage,
  InteractivePromptState,
  PanelState,
  TaskOutput,
  TaskSessionView,
} from '../types';
import {
  detectTerminalPrompt,
  isScrolledToBottom,
  splitPromptContext,
  stripAnsiForDisplay,
  terminalPreviewLine,
  TERMINAL_DEFAULT_PROMPT,
} from '../utils/terminal';
import { TerminalLog } from '../utils/terminalLog';
import type { VsCodeApi } from '../vite-env.d';

export const HISTORY_PAGE_SIZE = 10;
/** Sticky run log only appears after a command has been running this long. */
const STICKY_MIN_RUN_MS = 1000;

let vscodeApi: VsCodeApi | undefined;

export function useVsCodeApi(): VsCodeApi {
  if (!vscodeApi) {
    vscodeApi = acquireVsCodeApi();
  }
  return vscodeApi;
}

export interface PanelContextValue {
  panelState: PanelState | null;
  filterText: string;
  setFilterText: (value: string) => void;
  localGroupFold: Record<string, boolean>;
  setLocalGroupFold: (fold: Record<string, boolean>) => void;
  toggleGroupFold: (groupId: string, open: boolean) => void;
  taskTerminalFold: Record<string, boolean>;
  setTaskTerminalFold: (recordId: string, expanded: boolean) => void;
  mainTerminalLines: readonly string[];
  terminalRevision: number;
  terminalBuffer: string;
  terminalHasStderr: boolean;
  loading: boolean;
  loadingMessageKey?: string;
  toast: { level: string; message: string } | null;
  interactivePrompt: InteractivePromptState | null;
  currentPromptText: string;
  confirm: ConfirmState | null;
  stickyTerminalHidden: boolean;
  setStickyTerminalHidden: (hidden: boolean) => void;
  runningStatusLabel: string;
  editingCustomId: string | undefined;
  editingCustomDraft: { label: string; command: string } | undefined;
  setEditingCustomDraft: (draft: { label: string; command: string } | undefined) => void;
  editingPresetKey: string | undefined;
  editingPresetDraft: { label: string; command: string } | undefined;
  setEditingPresetDraft: (draft: { label: string; command: string } | undefined) => void;
  historyPage: number;
  setHistoryPage: (page: number | ((prev: number) => number)) => void;
  adhocCommand: string;
  setAdhocCommand: (value: string) => void;
  activeTaskTerminalFocus: string | undefined;
  setActiveTaskTerminalFocus: (recordId: string | undefined) => void;
  pendingTaskTerminalFocus: string | undefined;
  setPendingTaskTerminalFocus: (recordId: string | undefined) => void;
  metaGridRef: { current: HTMLElement | null };
  terminalPrompt: string;
  terminalPreview: string;
  postMessage: VsCodeApi['postMessage'];
  refresh: () => void;
  syncRemote: () => void;
  openSettings: () => void;
  openTerminal: () => void;
  exportConfig: () => void;
  importConfig: () => void;
  runCommand: (commandKey: string) => void;
  copyCommand: (command: string) => void;
  pasteAdhocCommand: () => void;
  runRawCommand: (command: string) => void;
  addCustomCommand: (label: string, command: string) => void;
  updateCustomCommand: (customId: string, label: string, command: string) => void;
  removeCustomCommand: (customId: string) => void;
  addPresetCommand: (label: string, command: string) => void;
  updatePresetCommand: (presetKey: string, label: string, command: string) => void;
  removePresetCommand: (presetKey: string) => void;
  setParallelMode: (enabled: boolean) => void;
  setTerminalFold: (target: 'sticky' | 'panel', expanded: boolean) => void;
  clearTerminal: (recordId?: string) => void;
  cancelRun: (recordId?: string) => void;
  interruptTerminal: (recordId?: string, sourceInput?: HTMLInputElement) => void;
  submitTerminalInput: (value: string, recordId?: string, sourceInput?: HTMLInputElement) => void;
  submitMainTerminalLine: (value: string, sourceInput?: HTMLInputElement, target?: 'panel' | 'sticky') => void;
  submitTaskTerminalLine: (recordId: string, value: string, sourceInput?: HTMLInputElement) => void;
  showConfirm: (message: string, confirmLabel?: string, cancelLabel?: string) => Promise<boolean>;
  finishConfirm: (confirmed: boolean) => void;
  showInteractivePrompt: (prompt: string, shortcuts: InteractivePromptState['shortcuts'], context: string, recordId?: string) => void;
  hideInteractivePrompt: () => void;
  sendInteractiveInput: (value: string) => void;
  submitInteractiveInput: (value: string) => void;
  startEditCustomCommand: (customId: string) => void;
  cancelEditCustomCommand: () => void;
  clearCustomFormDraft: () => void;
  findCustomCommandById: (customId: string) => { label: string; command: string } | undefined;
  startEditPresetCommand: (presetKey: string) => void;
  cancelEditPresetCommand: () => void;
  clearPresetFormDraft: () => void;
  findPresetCommandByKey: (presetKey: string) => { label: string; command: string } | undefined;
  getTaskSessionsForCommand: (commandKey: string) => TaskSessionView[];
  getAdhocTaskSessions: () => TaskSessionView[];
  getTaskOutput: (recordId: string) => TaskOutput;
  getTaskTerminalPreview: (recordId: string) => string;
  isTaskTerminalExpanded: (recordId: string) => boolean;
  matchesCommandFilter: (command: {
    label: string;
    command?: string;
    platform: string;
    releaseType: string;
    destinations?: string[];
  }) => boolean;
  restorePendingTaskTerminalFocus: () => void;
  scrollTaskTerminalToBottom: (recordId: string, node?: HTMLElement | null) => void;
  scrollAllTaskTerminalsToBottom: (preferredRecordId?: string) => void;
  positionStickyTerminal: (stickyEl?: HTMLElement | null) => void;
  toggleTerminalFold: (target: 'sticky' | 'panel') => void;
  isTerminalExpanded: (target: 'sticky' | 'panel') => boolean;
  showStickyTerminal: boolean;
  showStickyShowButton: boolean;
  parallelRunning: boolean;
  isRunning: boolean;
  keepStickyOnFailure: boolean;
  terminalStatusText: string;
  stickyStatusText: string;
  stickyStatusClass: string;
  terminalStatusClass: string;
  showStopButtons: boolean;
  historyArchiveOpen: boolean;
  setHistoryArchiveOpen: (open: boolean) => void;
  lastLatestRecordId: string | undefined;
}

const PanelContext = createContext<PanelContextValue | null>(null);

export function usePanel(): PanelContextValue {
  const ctx = useContext(PanelContext);
  if (!ctx) {
    throw new Error('usePanel must be used within PanelProvider');
  }
  return ctx;
}

export function PanelProvider({ children }: { children: ComponentChildren }) {
  const vscode = useVsCodeApi();
  const [panelState, setPanelState] = useState<PanelState | null>(null);
  const [filterText, setFilterTextState] = useState('');
  const [localGroupFold, setLocalGroupFold] = useState<Record<string, boolean>>({});
  const [taskTerminalFold, setTaskTerminalFoldState] = useState<Record<string, boolean>>({});
  const [terminalRevision, setTerminalRevision] = useState(0);
  const [taskRevisions, setTaskRevisions] = useState<Record<string, number>>({});
  const [taskStderr, setTaskStderr] = useState<Record<string, boolean>>({});
  const [terminalHasStderr, setTerminalHasStderr] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMessageKey, setLoadingMessageKey] = useState<string | undefined>();
  const [toast, setToast] = useState<{ level: string; message: string } | null>(null);
  const [interactivePrompt, setInteractivePrompt] = useState<InteractivePromptState | null>(null);
  const [currentPromptText, setCurrentPromptText] = useState('');
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [stickyTerminalHidden, setStickyTerminalHidden] = useState(false);
  const [stickyRunEligible, setStickyRunEligible] = useState(false);
  const [runningStatusLabel, setRunningStatusLabel] = useState('');
  const [editingCustomId, setEditingCustomId] = useState<string | undefined>();
  const [editingCustomDraft, setEditingCustomDraft] = useState<{ label: string; command: string } | undefined>();
  const [editingPresetKey, setEditingPresetKey] = useState<string | undefined>();
  const [editingPresetDraft, setEditingPresetDraft] = useState<{ label: string; command: string } | undefined>();
  const [historyPage, setHistoryPage] = useState(1);
  const [adhocCommand, setAdhocCommand] = useState('');
  const [activeTaskTerminalFocus, setActiveTaskTerminalFocus] = useState<string | undefined>();
  const [pendingTaskTerminalFocus, setPendingTaskTerminalFocus] = useState<string | undefined>();
  const [historyArchiveOpen, setHistoryArchiveOpen] = useState(false);
  const [interactiveRecordId, setInteractiveRecordId] = useState<string | undefined>();
  const lastLatestRecordIdRef = useRef<string | undefined>();
  const panelStateRef = useRef(panelState);
  panelStateRef.current = panelState;
  const mainTerminalLogRef = useRef<TerminalLog>();
  if (!mainTerminalLogRef.current) {
    mainTerminalLogRef.current = new TerminalLog();
  }
  const taskLogsRef = useRef(new Map<string, TerminalLog>());
  const metaGridRef = useRef<HTMLElement | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const stickyDelayTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const clearStickyDelayTimer = useCallback(() => {
    if (stickyDelayTimerRef.current) {
      clearTimeout(stickyDelayTimerRef.current);
      stickyDelayTimerRef.current = undefined;
    }
  }, []);

  useEffect(() => {
    const log = mainTerminalLogRef.current;
    if (!log) {
      return;
    }
    return log.subscribe(() => {
      setTerminalRevision(log.revision);
    });
  }, []);

  const getOrCreateTaskLog = useCallback((recordId: string): TerminalLog => {
    let log = taskLogsRef.current.get(recordId);
    if (!log) {
      log = new TerminalLog();
      log.subscribe(() => {
        setTaskRevisions((prev) => ({ ...prev, [recordId]: log!.revision }));
      });
      taskLogsRef.current.set(recordId, log);
    }
    return log;
  }, []);

  const postMessage = useCallback((message: Parameters<VsCodeApi['postMessage']>[0]) => {
    vscode.postMessage(message);
  }, [vscode]);

  const showToast = useCallback((level: string, message: string) => {
    if (!message) {
      return;
    }
    setToast({ level, message });
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, 3200);
  }, []);

  const finishConfirm = useCallback((confirmed: boolean) => {
    setConfirm((current) => {
      current?.resolve(confirmed);
      return null;
    });
  }, []);

  const showConfirm = useCallback(
    (message: string, confirmLabel?: string, cancelLabel?: string) =>
      new Promise<boolean>((resolve) => {
        setConfirm({ message, confirmLabel, cancelLabel, resolve });
      }),
    [],
  );

  const appendTerminal = useCallback((chunk: string, stream: 'stdout' | 'stderr') => {
    mainTerminalLogRef.current?.append(chunk);
    if (stream === 'stderr') {
      setTerminalHasStderr(true);
    }
  }, []);

  const appendTaskTerminal = useCallback((recordId: string, chunk: string, stream: 'stdout' | 'stderr') => {
    getOrCreateTaskLog(recordId).append(chunk);
    if (stream === 'stderr') {
      setTaskStderr((prev) => ({ ...prev, [recordId]: true }));
    }
  }, [getOrCreateTaskLog]);

  const clearMainTerminal = useCallback(() => {
    mainTerminalLogRef.current?.clear();
    setTerminalHasStderr(false);
  }, []);

  const clearTaskTerminal = useCallback((recordId: string) => {
    taskLogsRef.current.get(recordId)?.clear();
    setTaskStderr((prev) => {
      const next = { ...prev };
      delete next[recordId];
      return next;
    });
  }, []);

  const clearTerminal = useCallback(
    (recordId?: string) => {
      if (recordId) {
        clearTaskTerminal(recordId);
      } else {
        clearMainTerminal();
      }
    },
    [clearMainTerminal, clearTaskTerminal],
  );

  const submitMainTerminalLine = useCallback(
    (value: string, sourceInput?: HTMLInputElement, _target?: 'panel' | 'sticky') => {
      postMessage({ type: 'terminalInput', value: value ?? '' });
      if (sourceInput) {
        sourceInput.value = '';
        sourceInput.focus();
      }
    },
    [postMessage],
  );

  const submitTaskTerminalLine = useCallback(
    (recordId: string, value: string, sourceInput?: HTMLInputElement) => {
      setPendingTaskTerminalFocus(recordId);
      postMessage({ type: 'terminalInput', value: value ?? '', recordId });
      if (sourceInput) {
        sourceInput.value = '';
      }
    },
    [postMessage],
  );

  const interruptTerminal = useCallback(
    (recordId?: string, sourceInput?: HTMLInputElement) => {
      if (recordId) {
        getOrCreateTaskLog(recordId).append('^C\n');
      } else {
        mainTerminalLogRef.current?.append('^C\n');
      }
      if (sourceInput) {
        sourceInput.value = '';
      }
      postMessage({ type: 'terminalInterrupt', recordId });
    },
    [getOrCreateTaskLog, postMessage],
  );

  const submitTerminalInput = useCallback(
    (value: string, recordId?: string, sourceInput?: HTMLInputElement) => {
      if (recordId) {
        submitTaskTerminalLine(recordId, value, sourceInput);
      } else {
        submitMainTerminalLine(value, sourceInput);
      }
    },
    [submitMainTerminalLine, submitTaskTerminalLine],
  );

  const hideInteractivePrompt = useCallback(() => {
    setInteractivePrompt(null);
    setCurrentPromptText('');
    setInteractiveRecordId(undefined);
  }, []);

  const sendInteractiveInput = useCallback(
    (value: string) => {
      hideInteractivePrompt();
      postMessage({ type: 'terminalInput', value, recordId: interactiveRecordId });
      setInteractiveRecordId(undefined);
    },
    [hideInteractivePrompt, interactiveRecordId, postMessage],
  );

  const submitInteractiveInput = useCallback(
    (value: string) => {
      sendInteractiveInput(value);
    },
    [sendInteractiveInput],
  );

  const showInteractivePrompt = useCallback(
    (prompt: string, shortcuts: InteractivePromptState['shortcuts'], serverContext: string, recordId?: string) => {
      setInteractiveRecordId(recordId);
      const sourceBuffer =
        recordId && taskLogsRef.current.get(recordId)
          ? taskLogsRef.current.get(recordId)!.getBuffer()
          : mainTerminalLogRef.current!.getBuffer();
      const split = splitPromptContext(sourceBuffer, prompt);
      const context = serverContext?.trim() || split.context;
      const promptLines = split.promptLines || stripAnsiForDisplay(prompt).trim();
      setCurrentPromptText(promptLines);
      setInteractivePrompt({ prompt: promptLines, context, shortcuts, recordId });
    },
    [],
  );

  const getTaskSessionsForCommand = useCallback(
    (commandKey: string): TaskSessionView[] => {
      const sessions = (panelState?.taskSessions || []).filter((session) => session.commandKey === commandKey);
      if (sessions.length <= 1) {
        return sessions;
      }
      const latest = sessions.reduce((best, item) => (item.startedAt > best.startedAt ? item : best));
      return [latest];
    },
    [panelState?.taskSessions],
  );

  const getAdhocTaskSessions = useCallback((): TaskSessionView[] => {
    const sessions = (panelState?.taskSessions || []).filter((session) => session.commandKey.startsWith('adhoc:'));
    if (sessions.length <= 1) {
      return sessions;
    }
    const latest = sessions.reduce((best, item) => (item.startedAt > best.startedAt ? item : best));
    return [latest];
  }, [panelState?.taskSessions]);

  const findCustomCommandById = useCallback(
    (customId: string) => {
      for (const group of panelState?.commandGroups ?? []) {
        for (const command of group.commands ?? []) {
          if (command.customId === customId) {
            return { label: command.label, command: command.command };
          }
        }
      }
      return undefined;
    },
    [panelState?.commandGroups],
  );

  const findPresetCommandByKey = useCallback(
    (presetKey: string) => {
      for (const group of panelState?.commandGroups ?? []) {
        for (const command of group.commands ?? []) {
          if (command.presetKey === presetKey) {
            return { label: command.label, command: command.command };
          }
        }
      }
      return undefined;
    },
    [panelState?.commandGroups],
  );

  const startEditCustomCommand = useCallback(
    (customId: string) => {
      const command = findCustomCommandById(customId);
      if (!command) {
        return;
      }
      setEditingCustomId(customId);
      setEditingCustomDraft({ label: command.label, command: command.command });
      setLocalGroupFold((prev) => ({ ...prev, custom: true }));
    },
    [findCustomCommandById],
  );

  const cancelEditCustomCommand = useCallback(() => {
    setEditingCustomId(undefined);
    setEditingCustomDraft(undefined);
  }, []);

  const clearCustomFormDraft = useCallback(() => {
    setEditingCustomId(undefined);
    setEditingCustomDraft(undefined);
  }, []);

  const startEditPresetCommand = useCallback(
    (presetKey: string) => {
      const command = findPresetCommandByKey(presetKey);
      if (!command) {
        return;
      }
      setEditingPresetKey(presetKey);
      setEditingPresetDraft({ label: command.label, command: command.command });
      setLocalGroupFold((prev) => ({ ...prev, release: true }));
    },
    [findPresetCommandByKey],
  );

  const cancelEditPresetCommand = useCallback(() => {
    setEditingPresetKey(undefined);
    setEditingPresetDraft(undefined);
  }, []);

  const clearPresetFormDraft = useCallback(() => {
    setEditingPresetKey(undefined);
    setEditingPresetDraft(undefined);
  }, []);

  const setFilterText = useCallback((value: string) => {
    setFilterTextState(value);
  }, []);

  const toggleGroupFold = useCallback(
    (groupId: string, open: boolean) => {
      setLocalGroupFold((prev) => ({ ...prev, [groupId]: open }));
      postMessage({ type: 'setGroupFold', groupId, open });
    },
    [postMessage],
  );

  const setTaskTerminalFold = useCallback((recordId: string, expanded: boolean) => {
    setTaskTerminalFoldState((prev) => ({ ...prev, [recordId]: expanded }));
  }, []);

  const isTaskTerminalExpanded = useCallback(
    (recordId: string) => taskTerminalFold[recordId] !== false,
    [taskTerminalFold],
  );

  const getTaskOutput = useCallback(
    (recordId: string): TaskOutput => {
      const log = taskLogsRef.current.get(recordId);
      return {
        lines: log?.lines ?? [''],
        revision: taskRevisions[recordId] ?? log?.revision ?? 0,
        buffer: log?.getBuffer() ?? '',
        hasStderr: taskStderr[recordId] ?? false,
      };
    },
    [taskRevisions, taskStderr],
  );

  const getTaskTerminalPreview = useCallback(
    (recordId: string) => terminalPreviewLine(taskLogsRef.current.get(recordId)?.getBuffer() || ''),
    [taskRevisions],
  );

  const normalizedFilter = filterText.trim().toLowerCase();

  const matchesCommandFilter = useCallback(
    (command: {
      label: string;
      command?: string;
      platform: string;
      releaseType: string;
      destinations?: string[];
    }) => {
      if (!normalizedFilter) {
        return true;
      }
      const haystack = [
        command.label,
        command.command,
        command.platform,
        command.releaseType,
        ...(command.destinations || []),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedFilter);
    },
    [normalizedFilter],
  );

  const addCustomCommand = useCallback(
    (label: string, command: string) => {
      setFilterTextState('');
      setLocalGroupFold((prev) => ({ ...prev, custom: true }));
      postMessage({ type: 'addCustomCommand', label, command });
    },
    [postMessage],
  );

  const addPresetCommand = useCallback(
    (label: string, command: string) => {
      setFilterTextState('');
      setLocalGroupFold((prev) => ({ ...prev, release: true }));
      postMessage({ type: 'addPresetCommand', label, command });
    },
    [postMessage],
  );

  const isTerminalExpanded = useCallback(
    (target: 'sticky' | 'panel') => {
      const fold = panelState?.terminalFold;
      if (!fold) {
        return true;
      }
      return target === 'sticky' ? fold.sticky !== false : fold.panel !== false;
    },
    [panelState?.terminalFold],
  );

  const setTerminalFold = useCallback(
    (target: 'sticky' | 'panel', expanded: boolean) => {
      postMessage({ type: 'setTerminalFold', target, expanded });
    },
    [postMessage],
  );

  const toggleTerminalFold = useCallback(
    (target: 'sticky' | 'panel') => {
      setTerminalFold(target, !isTerminalExpanded(target));
    },
    [isTerminalExpanded, setTerminalFold],
  );

  const positionStickyTerminal = useCallback((stickyEl?: HTMLElement | null) => {
    const terminalSticky = stickyEl ?? document.getElementById('terminal-sticky');
    if (!terminalSticky || terminalSticky.classList.contains('hidden')) {
      return;
    }
    const anchor = metaGridRef.current || document.querySelector('.hero');
    if (!anchor) {
      terminalSticky.style.top = '10px';
      return;
    }
    const bottom = anchor.getBoundingClientRect().bottom;
    terminalSticky.style.top = `${Math.max(8, Math.round(bottom + 8))}px`;
  }, []);

  const scrollTaskTerminalToBottom = useCallback((recordId: string, node?: HTMLElement | null) => {
    const el = node ?? document.getElementById(`task-terminal-output-${recordId}`);
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  const scrollAllTaskTerminalsToBottom = useCallback(
    (preferredRecordId?: string) => {
      document.querySelectorAll('.command-task-output').forEach((node) => {
        const el = node as HTMLElement;
        const recordId = el.id.replace('task-terminal-output-', '');
        if (!recordId) {
          return;
        }
        if (!preferredRecordId || recordId === preferredRecordId || isScrolledToBottom(el)) {
          el.scrollTop = el.scrollHeight;
        }
      });
    },
    [],
  );

  const restorePendingTaskTerminalFocus = useCallback(() => {
    const recordId = pendingTaskTerminalFocus || activeTaskTerminalFocus;
    if (!recordId) {
      return;
    }
    requestAnimationFrame(() => {
      const input = document.querySelector(
        `.task-terminal-input[data-record-id="${CSS.escape(recordId)}"]`,
      );
      if (input instanceof HTMLInputElement) {
        input.focus();
        setPendingTaskTerminalFocus(undefined);
      }
    });
  }, [activeTaskTerminalFocus, pendingTaskTerminalFocus]);

  const mainTerminalLines = mainTerminalLogRef.current?.lines ?? [''];
  const terminalBuffer = mainTerminalLogRef.current?.getBuffer() ?? '';
  const terminalPrompt = useMemo(
    () => detectTerminalPrompt(terminalBuffer),
    [terminalBuffer, terminalRevision],
  );
  const terminalPreview = useMemo(
    () => terminalPreviewLine(terminalBuffer),
    [terminalBuffer, terminalRevision],
  );

  const isRunning = !!panelState?.runningRecordId;
  const parallelRunning = (panelState?.runningRecordIds || []).length > 0;
  const latestRecord = panelState?.records?.[0];
  const keepStickyOnFailure = !isRunning && latestRecord?.status === 'failed';
  const stickyActive =
    stickyRunEligible && (isRunning || keepStickyOnFailure);

  const showStickyTerminal = useMemo(() => {
    if (panelState?.parallelMode) {
      return false;
    }
    return stickyActive && !stickyTerminalHidden;
  }, [panelState?.parallelMode, stickyActive, stickyTerminalHidden]);

  const showStickyShowButton = useMemo(() => {
    if (panelState?.parallelMode) {
      return false;
    }
    return stickyActive && stickyTerminalHidden;
  }, [panelState?.parallelMode, stickyActive, stickyTerminalHidden]);

  const showStopButtons = panelState?.parallelMode ? parallelRunning : isRunning;

  const terminalStatusText = useMemo(() => {
    if (panelState?.parallelMode) {
      return parallelRunning ? t('terminal.running') : t('terminal.ready');
    }
    if (isRunning) {
      return runningStatusLabel
        ? t('terminal.runningLabel', { label: runningStatusLabel })
        : t('terminal.running');
    }
    return t('terminal.ready');
  }, [panelState?.parallelMode, parallelRunning, isRunning, runningStatusLabel]);

  const stickyStatusText = useMemo(() => {
    if (panelState?.parallelMode) {
      return terminalStatusText;
    }
    if (isRunning) {
      return runningStatusLabel
        ? t('terminal.runningLabel', { label: runningStatusLabel })
        : t('terminal.running');
    }
    if (keepStickyOnFailure) {
      const exitHint = latestRecord?.exitCode !== undefined ? ` (exit ${latestRecord.exitCode})` : '';
      return t('terminal.failed', { exit: exitHint });
    }
    return terminalStatusText;
  }, [panelState?.parallelMode, isRunning, keepStickyOnFailure, runningStatusLabel, terminalStatusText, latestRecord?.exitCode]);

  const terminalStatusClass = useMemo(() => {
    if (panelState?.parallelMode && parallelRunning) {
      return 'terminal-status running';
    }
    if (isRunning) {
      return 'terminal-status running';
    }
    return 'terminal-status';
  }, [panelState?.parallelMode, parallelRunning, isRunning]);

  const stickyStatusClass = useMemo(() => {
    if (isRunning || (panelState?.parallelMode && parallelRunning)) {
      return 'terminal-status running';
    }
    if (keepStickyOnFailure) {
      return 'terminal-status failed';
    }
    return 'terminal-status';
  }, [isRunning, panelState?.parallelMode, parallelRunning, keepStickyOnFailure]);

  useEffect(() => {
    if (!panelState) {
      return;
    }
    if (panelState.groupFold) {
      setLocalGroupFold({ ...panelState.groupFold });
    }
    const latestId = panelState.records?.[0]?.id;
    if (latestId !== lastLatestRecordIdRef.current) {
      setHistoryPage(1);
      lastLatestRecordIdRef.current = latestId;
    }
    restorePendingTaskTerminalFocus();
    const preferred = pendingTaskTerminalFocus || activeTaskTerminalFocus;
    requestAnimationFrame(() => {
      scrollAllTaskTerminalsToBottom(preferred);
      requestAnimationFrame(() => {
        scrollAllTaskTerminalsToBottom(preferred);
      });
    });
  }, [panelState, restorePendingTaskTerminalFocus, scrollAllTaskTerminalsToBottom, pendingTaskTerminalFocus, activeTaskTerminalFocus]);

  useEffect(() => {
    const onResize = () => positionStickyTerminal();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [positionStickyTerminal]);

  useEffect(() => {
    if (showStickyTerminal) {
      requestAnimationFrame(() => positionStickyTerminal());
    }
  }, [showStickyTerminal, positionStickyTerminal, panelState]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<ExtensionMessage>) => {
      const message = event.data;
      if (message.type === 'loading') {
        setLoading(!!message.active);
        setLoadingMessageKey(message.messageKey);
        document.body.classList.toggle('global-loading-active', !!message.active);
        return;
      }
      if (message.type === 'state') {
        setPanelState(message.payload);
        if (message.payload.uiLanguage && message.payload.uiLanguage !== getLocale()) {
          setLocale(message.payload.uiLanguage);
        }
        return;
      }
      if (message.type === 'toast') {
        showToast(message.level, message.message);
        return;
      }
      if (message.type === 'terminalClear') {
        if (message.recordId) {
          clearTaskTerminal(message.recordId);
        } else {
          clearMainTerminal();
        }
        return;
      }
      if (message.type === 'terminalOutput') {
        if (message.recordId) {
          appendTaskTerminal(message.recordId, message.chunk, message.stream);
        } else {
          appendTerminal(message.chunk, message.stream);
        }
        return;
      }
      if (message.type === 'runStarted') {
        if (message.recordId && panelStateRef.current?.parallelMode) {
          getOrCreateTaskLog(message.recordId);
          return;
        }
        clearStickyDelayTimer();
        setStickyRunEligible(false);
        setRunningStatusLabel(message.label || '');
        stickyDelayTimerRef.current = setTimeout(() => {
          if (panelStateRef.current?.runningRecordId) {
            setStickyRunEligible(true);
            setStickyTerminalHidden(false);
          }
        }, STICKY_MIN_RUN_MS);
        return;
      }
      if (message.type === 'interactivePrompt') {
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
        setAdhocCommand(String(message.text || '').trim());
        return;
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [
    appendTaskTerminal,
    appendTerminal,
    clearMainTerminal,
    clearTaskTerminal,
    hideInteractivePrompt,
    postMessage,
    showConfirm,
    showInteractivePrompt,
    showToast,
    vscode,
    clearStickyDelayTimer,
  ]);

  useEffect(() => {
    return () => clearStickyDelayTimer();
  }, [clearStickyDelayTimer]);

  useEffect(() => {
    if (isRunning || panelState?.parallelMode) {
      return;
    }
    clearStickyDelayTimer();
    if (latestRecord?.status !== 'failed') {
      setStickyRunEligible(false);
    }
  }, [isRunning, panelState?.parallelMode, latestRecord?.status, clearStickyDelayTimer]);

  useEffect(() => {
    postMessage({ type: 'ready' });
  }, [postMessage]);

  useEffect(() => {
    if (!isRunning && !panelState?.parallelMode) {
      setRunningStatusLabel('');
    }
  }, [isRunning, panelState?.parallelMode]);

  const value: PanelContextValue = {
    panelState,
    filterText,
    setFilterText,
    localGroupFold,
    setLocalGroupFold,
    toggleGroupFold,
    taskTerminalFold,
    setTaskTerminalFold,
    mainTerminalLines,
    terminalRevision,
    terminalBuffer,
    terminalHasStderr,
    loading,
    loadingMessageKey,
    toast,
    interactivePrompt,
    currentPromptText,
    confirm,
    stickyTerminalHidden,
    setStickyTerminalHidden,
    runningStatusLabel,
    editingCustomId,
    editingCustomDraft,
    setEditingCustomDraft,
    editingPresetKey,
    editingPresetDraft,
    setEditingPresetDraft,
    historyPage,
    setHistoryPage,
    adhocCommand,
    setAdhocCommand,
    activeTaskTerminalFocus,
    setActiveTaskTerminalFocus,
    pendingTaskTerminalFocus,
    setPendingTaskTerminalFocus,
    metaGridRef,
    terminalPrompt,
    terminalPreview,
    postMessage,
    refresh: () => postMessage({ type: 'refresh' }),
    syncRemote: () => postMessage({ type: 'syncRemote' }),
    openSettings: () => postMessage({ type: 'openSettings' }),
    openTerminal: () => postMessage({ type: 'openTerminal' }),
    exportConfig: () => postMessage({ type: 'exportConfig' }),
    importConfig: () => postMessage({ type: 'importConfig' }),
    runCommand: (commandKey) => postMessage({ type: 'runCommand', commandKey }),
    copyCommand: (command) => postMessage({ type: 'copyCommand', command }),
    pasteAdhocCommand: () => postMessage({ type: 'pasteAdhocCommand' }),
    runRawCommand: (command) => postMessage({ type: 'runRawCommand', command }),
    addCustomCommand,
    updateCustomCommand: (customId, label, command) =>
      postMessage({ type: 'updateCustomCommand', customId, label, command }),
    removeCustomCommand: (customId) => postMessage({ type: 'removeCustomCommand', customId }),
    addPresetCommand,
    updatePresetCommand: (presetKey, label, command) =>
      postMessage({ type: 'updatePresetCommand', presetKey, label, command }),
    removePresetCommand: (presetKey) => postMessage({ type: 'removePresetCommand', presetKey }),
    setParallelMode: (enabled) => postMessage({ type: 'setParallelMode', enabled }),
    setTerminalFold,
    clearTerminal,
    cancelRun: (recordId) => postMessage({ type: 'cancelRun', recordId }),
    interruptTerminal,
    submitTerminalInput,
    submitMainTerminalLine,
    submitTaskTerminalLine,
    showConfirm,
    finishConfirm,
    showInteractivePrompt,
    hideInteractivePrompt,
    sendInteractiveInput,
    submitInteractiveInput,
    startEditCustomCommand,
    cancelEditCustomCommand,
    clearCustomFormDraft,
    findCustomCommandById,
    startEditPresetCommand,
    cancelEditPresetCommand,
    clearPresetFormDraft,
    findPresetCommandByKey,
    getTaskSessionsForCommand,
    getAdhocTaskSessions,
    getTaskOutput,
    getTaskTerminalPreview,
    isTaskTerminalExpanded,
    matchesCommandFilter,
    restorePendingTaskTerminalFocus,
    scrollTaskTerminalToBottom,
    scrollAllTaskTerminalsToBottom,
    positionStickyTerminal,
    toggleTerminalFold,
    isTerminalExpanded,
    showStickyTerminal,
    showStickyShowButton,
    parallelRunning,
    isRunning,
    keepStickyOnFailure,
    terminalStatusText,
    stickyStatusText,
    stickyStatusClass,
    terminalStatusClass,
    showStopButtons,
    historyArchiveOpen,
    setHistoryArchiveOpen,
    lastLatestRecordId: lastLatestRecordIdRef.current,
  };

  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
}

export { TERMINAL_DEFAULT_PROMPT };
