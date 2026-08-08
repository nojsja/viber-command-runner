export type ReleasePlatform = 'android' | 'ios' | 'shorebird' | 'install' | 'other';
export type ReleaseStatus = 'running' | 'success' | 'failed' | 'cancelled';

export interface ReleaseCommandDefinition {
  key: string;
  label: string;
  command: string;
  platform: ReleasePlatform;
  releaseType: string;
  destinations: string[];
  order: number;
  interactive: boolean;
  groupId?: string;
  customId?: string;
}

export interface CommandGroupDefinition {
  id: string;
  title: string;
  commands: ReleaseCommandDefinition[];
}

export interface ReleaseRecord {
  id: string;
  commandKey: string;
  commandLabel: string;
  command: string;
  platform: ReleasePlatform;
  releaseType: string;
  destinations: string[];
  branch: string;
  operator: string;
  operatorEmail?: string;
  appVersion?: string;
  appBuild?: string;
  workspaceName: string;
  workspacePath: string;
  startedAt: string;
  finishedAt?: string;
  status: ReleaseStatus;
  exitCode?: number;
  syncedAt?: string;
  logHint?: string;
}

export interface OperatorProfile {
  id: string;
  name: string;
  email?: string;
  machine?: string;
  lastSeenAt: string;
}

export interface TaskSessionView {
  recordId: string;
  commandKey: string;
  label: string;
  status: ReleaseStatus;
  startedAt: string;
  finishedAt?: string;
  exitCode?: number;
}

export interface ReleaseHistoryBundle {
  version: 1;
  updatedAt: string;
  records: ReleaseRecord[];
  operators: OperatorProfile[];
}

export type PanelMessage =
  | { type: 'ready' }
  | { type: 'runCommand'; commandKey: string }
  | { type: 'copyCommand'; command: string }
  | { type: 'pasteAdhocCommand' }
  | { type: 'runRawCommand'; command: string }
  | { type: 'addCustomCommand'; label: string; command: string }
  | { type: 'updateCustomCommand'; customId: string; label: string; command: string }
  | { type: 'removeCustomCommand'; customId: string }
  | { type: 'setGroupFold'; groupId: string; open: boolean }
  | { type: 'setParallelMode'; enabled: boolean }
  | { type: 'setTerminalFold'; target: 'sticky' | 'panel'; expanded: boolean }
  | { type: 'refresh' }
  | { type: 'syncOss' }
  | { type: 'openSettings' }
  | { type: 'openTerminal' }
  | { type: 'clearTerminal'; recordId?: string }
  | { type: 'cancelRun'; recordId?: string }
  | { type: 'terminalInput'; value: string; recordId?: string }
  | { type: 'exportConfig' }
  | { type: 'importConfig' }
  | { type: 'filter'; query: string };

export type InteractiveShortcut = {
  label: string;
  value: string;
};

export type ExtensionMessage =
  | { type: 'state'; payload: PanelState }
  | { type: 'loading'; active: boolean; messageKey?: 'loading.initial' | 'loading.refresh' | 'loading.sync' }
  | { type: 'toast'; level: 'info' | 'warn' | 'error'; message: string }
  | { type: 'runStarted'; recordId: string; label: string; commandKey?: string }
  | { type: 'terminalClear'; recordId?: string }
  | { type: 'terminalOutput'; chunk: string; stream: 'stdout' | 'stderr'; recordId?: string }
  | { type: 'interactivePrompt'; prompt: string; context: string; shortcuts: InteractiveShortcut[]; recordId?: string }
  | { type: 'interactivePromptDismiss' }
  | { type: 'adhocClipboardText'; text: string };

export interface PanelState {
  commands: ReleaseCommandDefinition[];
  commandGroups: CommandGroupDefinition[];
  groupFold: Record<string, boolean>;
  records: ReleaseRecord[];
  operators: OperatorProfile[];
  operator: string;
  branch: string;
  appVersion?: string;
  appBuild?: string;
  ossEnabled: boolean;
  ossSyncedAt?: string;
  syncing: boolean;
  runningRecordId?: string;
  runningRecordIds: string[];
  parallelMode: boolean;
  taskSessions: TaskSessionView[];
  workspaceName: string;
  uiLanguage: 'en' | 'zh';
  terminalFold: {
    sticky: boolean;
    panel: boolean;
  };
}
