import * as vscode from 'vscode';
import {
  loadReleaseCommands,
  loadCustomCommands,
  buildCommandGroups,
  flattenCommands,
  findCommandDefinition,
  buildCommandDefinition,
} from '../services/commandCatalog';
import { CustomCommandStore } from '../services/customCommandStore';
import { UiStateStore, defaultTerminalFold } from '../services/uiStateStore';
import { buildOperatorProfile, ReleaseHistoryStore } from '../services/releaseHistoryStore';
import { OssSyncService } from '../services/ossSyncService';
import {
  readGitBranch,
  readPubspecVersion,
  ReleaseRunner,
  resolveOperator,
} from '../services/releaseRunner';
import { ExtensionMessage, InteractiveShortcut, PanelState, ReleaseCommandDefinition, ReleaseRecord, ReleaseStatus } from '../types';
import { InteractivePromptDetector } from '../services/interactivePromptDetector';
import { getUiLanguage, t } from '../i18n';

export function pickWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }
  if (folders.length === 1) {
    return folders[0];
  }
  return folders.find((folder) => folder.name.includes('goocean')) ?? folders[0];
}

export class ReleasePanelController {
  private folder: vscode.WorkspaceFolder | undefined;
  private store: ReleaseHistoryStore | undefined;
  private customCommands: CustomCommandStore | undefined;
  private uiState: UiStateStore | undefined;
  private runner: ReleaseRunner | undefined;
  private oss: OssSyncService | undefined;
  private syncing = false;
  private runningRecordId: string | undefined;
  private ossSyncedAt: string | undefined;
  private promptDetector = new InteractivePromptDetector();

  constructor(private readonly secrets: vscode.SecretStorage) {}

  dispose(): void {
    void this.finalizeActiveRun('cancelled', 130);
    this.runner?.dispose();
  }

  async refresh(): Promise<PanelState> {
    const state = await this.bootstrap(true);
    await this.onStateChanged?.(state);
    return state;
  }

  async syncOss(showToast = false): Promise<PanelState> {
    if (!this.ensureWorkspaceServices()) {
      this.notify('warn', t('toast.openWorkspace'));
      return this.buildEmptyState();
    }
    if (this.syncing) {
      return this.buildState();
    }
    this.syncing = true;
    try {
      const pulled = await this.oss!.syncFromRemote(this.store!);
      if (pulled) {
        this.ossSyncedAt = pulled.syncedAt;
      }
      const pushedAt = await this.oss!.syncToRemote(this.store!);
      if (pushedAt) {
        this.ossSyncedAt = pushedAt;
      }
      if (showToast) {
        this.notify('info', this.oss!.isEnabled() ? t('toast.ossSynced') : t('toast.ossDisabled'));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.notify('error', t('toast.ossSyncFailed', { message }));
    } finally {
      this.syncing = false;
    }
    const state = await this.buildState();
    await this.onStateChanged?.(state);
    return state;
  }

  async bootstrap(syncOss: boolean): Promise<PanelState> {
    if (!this.ensureWorkspaceServices()) {
      return this.buildEmptyState();
    }
    if (syncOss && this.oss!.isEnabled()) {
      await this.syncOss(false);
    } else {
      await this.store!.load();
    }
    await this.reconcileRunningRecords();
    return this.buildState();
  }

  async cancelRun(): Promise<PanelState> {
    if (!this.store || !this.runningRecordId) {
      this.notify('warn', t('toast.noRunningTask'));
      return this.buildState();
    }

    const recordId = this.runningRecordId;
    const bundle = await this.store.load();
    const record = bundle.records.find((item) => item.id === recordId);
    if (!record || record.status !== 'running') {
      this.runningRecordId = undefined;
      return this.buildState();
    }

    this.onTerminalOutput?.(t('terminal.userCancelled'), 'stderr');
    this.runner?.cancel();
    this.onInteractivePromptDismiss?.();

    await this.store.upsertRecord({
      ...record,
      finishedAt: new Date().toISOString(),
      status: 'cancelled',
      exitCode: 130,
    });
    this.runningRecordId = undefined;

    this.notify('warn', t('toast.runCancelled'));
    const state = await this.buildState();
    await this.onStateChanged?.(state);
    return state;
  }

  submitTerminalInput(value: string): void {
    if (!this.runner?.isRunning()) {
      return;
    }
    const display = value === '' ? '(Enter)' : value;
    this.onTerminalOutput?.(`> ${display}\n`, 'stdout');
    this.runner.writeStdin(value);
    this.promptDetector.markResponded();
    this.onInteractivePromptDismiss?.();
  }

  async runCommand(commandKey: string): Promise<PanelState> {
    const groups = await this.loadCommandGroups();
    const definition = findCommandDefinition(groups, commandKey);
    if (!definition) {
      this.notify('error', t('toast.commandNotFound', { key: commandKey }));
      return this.buildState();
    }
    return this.executeDefinition(definition);
  }

  async runRawCommand(command: string): Promise<PanelState> {
    const trimmed = command.trim();
    if (!trimmed) {
      this.notify('warn', t('toast.enterCommand'));
      return this.buildState();
    }
    const definition = buildCommandDefinition(`adhoc:${Date.now()}`, t('adhoc.commandLabel'), trimmed, {
      groupId: 'adhoc',
      releaseType: 'adhoc',
      order: 0,
    });
    return this.executeDefinition(definition);
  }

  async addCustomCommand(label: string, command: string): Promise<PanelState> {
    if (!this.customCommands) {
      this.notify('warn', t('toast.openWorkspace'));
      return this.buildEmptyState();
    }
    if (!label.trim() || !command.trim()) {
      this.notify('warn', t('toast.fillCustomCommand'));
      return this.buildState();
    }
    await this.customCommands.add(label, command);
    this.notify('info', t('toast.customSaved'));
    const state = await this.buildState();
    await this.onStateChanged?.(state);
    return state;
  }

  async removeCustomCommand(customId: string): Promise<PanelState> {
    if (!this.customCommands) {
      return this.buildEmptyState();
    }
    const removed = await this.customCommands.remove(customId);
    if (!removed) {
      this.notify('warn', t('toast.customNotFound'));
      return this.buildState();
    }
    this.notify('info', t('toast.customDeleted'));
    const state = await this.buildState();
    await this.onStateChanged?.(state);
    return state;
  }

  async setGroupFold(groupId: string, open: boolean): Promise<PanelState> {
    if (!this.uiState) {
      return this.buildState();
    }
    await this.uiState.setGroupFold(groupId, open);
    return this.buildState();
  }

  async setTerminalFold(target: 'sticky' | 'panel', expanded: boolean): Promise<PanelState> {
    if (!this.uiState) {
      return this.buildState();
    }
    await this.uiState.setTerminalFold(target, expanded);
    return this.buildState();
  }

  private async executeDefinition(definition: ReleaseCommandDefinition): Promise<PanelState> {
    const folder = this.ensureWorkspaceServices();
    if (!folder || !this.store || !this.runner || !this.oss) {
      this.notify('warn', t('toast.openWorkspace'));
      return this.buildEmptyState();
    }
    if (this.runningRecordId || this.runner?.isRunning()) {
      this.notify('warn', t('toast.runInProgress'));
      return this.buildState();
    }

    const operator = await resolveOperator(folder, this.secrets);
    const branch = await readGitBranch(folder);
    const version = await readPubspecVersion(folder);
    const recordId = this.store.createRecordId();

    const record: ReleaseRecord = {
      id: recordId,
      commandKey: definition.key,
      commandLabel: definition.label,
      command: definition.command,
      platform: definition.platform,
      releaseType: definition.releaseType,
      destinations: definition.destinations,
      branch,
      operator: operator.name,
      operatorEmail: operator.email,
      appVersion: version.version,
      appBuild: version.build,
      workspaceName: folder.name,
      workspacePath: folder.uri.fsPath,
      startedAt: new Date().toISOString(),
      status: 'running',
      logHint: t('logHint.panelTerminal'),
    };

    await this.store.upsertRecord(record);
    await this.store.touchOperator(buildOperatorProfile(operator.name, operator.email));
    this.runningRecordId = recordId;
    this.promptDetector.reset();
    this.onInteractivePromptDismiss?.();
    this.onTerminalClear?.();
    this.onTerminalStarted?.(definition.label);
    await this.onStateChanged?.(await this.buildState());

    try {
      await this.runner.run(
        definition,
        recordId,
        (chunk, stream) => {
          this.onTerminalOutput?.(chunk, stream);
          const detected = this.promptDetector.append(chunk);
          if (detected) {
            this.onInteractivePrompt?.(detected.prompt, detected.context, buildInteractiveShortcuts(detected.prompt));
          }
        },
        async (result) => {
          await this.finishRun(record, resolveRunStatus(result));
        },
      );
    } catch (error) {
      this.runningRecordId = undefined;
      const message = error instanceof Error ? error.message : String(error);
      await this.store.upsertRecord({
        ...record,
        finishedAt: new Date().toISOString(),
        status: 'failed',
        exitCode: 1,
      });
      this.notify('error', message);
    }

    return this.buildState();
  }

  openTerminal(): void {
    this.runner?.openExternalTerminal();
  }

  onStateChanged: ((state: PanelState) => void) | undefined;
  onToast: ((level: 'info' | 'warn' | 'error', message: string) => void) | undefined;
  onTerminalClear: (() => void) | undefined;
  onTerminalOutput: ((chunk: string, stream: 'stdout' | 'stderr') => void) | undefined;
  onTerminalStarted: ((label: string) => void) | undefined;
  onInteractivePrompt: ((prompt: string, context: string, shortcuts: InteractiveShortcut[]) => void) | undefined;
  onInteractivePromptDismiss: (() => void) | undefined;

  private async reconcileRunningRecords(): Promise<void> {
    if (!this.store) {
      return;
    }
    const activeRecordId = this.runner?.isRunning() ? this.runningRecordId : undefined;
    await this.store.reconcileStaleRunningRecords(activeRecordId);
    if (!this.runner?.isRunning()) {
      this.runningRecordId = undefined;
    }
  }

  private async finishRun(
    record: ReleaseRecord,
    status: { status: ReleaseStatus; exitCode: number },
  ): Promise<void> {
    if (!this.store || !this.oss) {
      return;
    }

    const bundle = await this.store.load();
    const existing = bundle.records.find((item) => item.id === record.id);
    if (existing && existing.status !== 'running') {
      this.runningRecordId = undefined;
      await this.onStateChanged?.(await this.buildState());
      return;
    }

    const finished: ReleaseRecord = {
      ...record,
      finishedAt: new Date().toISOString(),
      status: status.status,
      exitCode: status.exitCode,
    };
    await this.store.upsertRecord(finished);
    this.runningRecordId = undefined;
    if (this.oss.isEnabled()) {
      try {
        this.ossSyncedAt = await this.oss.syncToRemote(this.store);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.notify('warn', t('toast.ossUploadFailed', { message }));
      }
    }
    if (status.status === 'success') {
      this.notify('info', t('toast.runSuccess'));
    } else if (status.status === 'cancelled') {
      this.notify('warn', t('toast.runCancelled'));
    } else {
      this.notify('error', t('toast.runFailed', { code: status.exitCode }));
    }
    await this.onStateChanged?.(await this.buildState());
    this.onInteractivePromptDismiss?.();
  }

  private async finalizeActiveRun(status: ReleaseStatus, exitCode: number): Promise<void> {
    if (!this.runningRecordId || !this.store) {
      return;
    }
    const bundle = await this.store.load();
    const record = bundle.records.find((item) => item.id === this.runningRecordId);
    if (!record || record.status !== 'running') {
      this.runningRecordId = undefined;
      return;
    }
    await this.store.upsertRecord({
      ...record,
      finishedAt: new Date().toISOString(),
      status,
      exitCode,
    });
    this.runningRecordId = undefined;
  }

  private ensureWorkspaceServices(): vscode.WorkspaceFolder | undefined {
    const folder = pickWorkspaceFolder();
    if (!folder) {
      return undefined;
    }
    if (this.folder?.uri.fsPath !== folder.uri.fsPath) {
      this.runner?.dispose();
      this.folder = folder;
      this.store = new ReleaseHistoryStore(folder);
      this.customCommands = new CustomCommandStore(folder);
      this.uiState = new UiStateStore(folder);
      this.runner = new ReleaseRunner(folder);
      this.oss = new OssSyncService(folder, this.secrets);
    }
    return folder;
  }

  private async loadCommandGroups() {
    const folder = this.ensureWorkspaceServices();
    if (!folder || !this.customCommands) {
      return buildCommandGroups([], []);
    }
    const releaseCommands = loadReleaseCommands(folder);
    const customCommands = await loadCustomCommands(this.customCommands);
    return buildCommandGroups(releaseCommands, customCommands);
  }

  private async buildState(): Promise<PanelState> {
    const folder = this.ensureWorkspaceServices();
    if (!folder || !this.store || !this.oss) {
      return this.buildEmptyState();
    }

    const bundle = await this.store.load();
    const commandGroups = await this.loadCommandGroups();
    const commands = flattenCommands(commandGroups);
    const groupFold = await this.uiState!.getGroupFold(commandGroups.map((group) => group.id));
    const terminalFold = await this.uiState!.getTerminalFold();
    const operator = await resolveOperator(folder, this.secrets);
    const branch = await readGitBranch(folder);
    const version = await readPubspecVersion(folder);

    return {
      commands,
      commandGroups,
      groupFold,
      records: bundle.records,
      operators: bundle.operators,
      operator: operator.name,
      branch,
      appVersion: version.version,
      appBuild: version.build,
      ossEnabled: this.oss.isEnabled(),
      ossSyncedAt: this.ossSyncedAt,
      syncing: this.syncing,
      runningRecordId: this.runningRecordId,
      workspaceName: folder.name,
      uiLanguage: getUiLanguage(),
      terminalFold,
    };
  }

  private buildEmptyState(): PanelState {
    return {
      commands: [],
      commandGroups: [],
      groupFold: { release: true, custom: false },
      records: [],
      operators: [],
      operator: t('empty.unknownOperator'),
      branch: t('empty.unknownBranch'),
      ossEnabled: false,
      syncing: this.syncing,
      runningRecordId: this.runningRecordId,
      workspaceName: t('empty.noWorkspace'),
      uiLanguage: getUiLanguage(),
      terminalFold: defaultTerminalFold(),
    };
  }

  private notify(level: 'info' | 'warn' | 'error', message: string): void {
    this.onToast?.(level, message);
    if (level === 'error') {
      void vscode.window.showErrorMessage(message);
    } else if (level === 'warn') {
      void vscode.window.showWarningMessage(message);
    } else {
      void vscode.window.showInformationMessage(message);
    }
  }
}

export function postExtensionMessage(
  webview: vscode.Webview,
  message: ExtensionMessage,
): void {
  void webview.postMessage(message);
}

function resolveRunStatus(result: { exitCode: number; cancelled: boolean }): {
  status: ReleaseStatus;
  exitCode: number;
} {
  if (result.exitCode === 0) {
    return { status: 'success', exitCode: 0 };
  }
  if (result.cancelled) {
    return { status: 'cancelled', exitCode: result.exitCode };
  }
  return { status: 'failed', exitCode: result.exitCode };
}

function buildInteractiveShortcuts(prompt: string): InteractiveShortcut[] {
  const shortcuts: InteractiveShortcut[] = [
    { label: 'Enter ↵', value: '' },
    { label: '1', value: '1' },
    { label: 'Y', value: 'y' },
    { label: 'Yes', value: 'yes' },
    { label: 'N', value: 'n' },
    { label: 'No', value: 'no' },
  ];

  if (/输入 q 退出|输入 q|type q to quit|enter q/i.test(prompt)) {
    shortcuts.push({ label: t('shortcut.quitQ'), value: 'q' });
  }

  return shortcuts;
}
