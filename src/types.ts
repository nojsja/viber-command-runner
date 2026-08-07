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
  | { type: 'removeCustomCommand'; customId: string }
  | { type: 'setGroupFold'; groupId: string; open: boolean }
  | { type: 'refresh' }
  | { type: 'syncOss' }
  | { type: 'openSettings' }
  | { type: 'openTerminal' }
  | { type: 'clearTerminal' }
  | { type: 'cancelRun' }
  | { type: 'terminalInput'; value: string }
  | { type: 'filter'; query: string };

export type InteractiveShortcut = {
  label: string;
  value: string;
};

export type ExtensionMessage =
  | { type: 'state'; payload: PanelState }
  | { type: 'toast'; level: 'info' | 'warn' | 'error'; message: string }
  | { type: 'runStarted'; recordId: string; label: string }
  | { type: 'terminalClear' }
  | { type: 'terminalOutput'; chunk: string; stream: 'stdout' | 'stderr' }
  | { type: 'interactivePrompt'; prompt: string; context: string; shortcuts: InteractiveShortcut[] }
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
  workspaceName: string;
  uiLanguage: 'en' | 'zh';
}
