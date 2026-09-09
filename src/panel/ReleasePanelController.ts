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
import { PresetCommandStore } from '../services/presetCommandStore';
import {
  addManagedPresetCommand,
  removeManagedPresetCommand,
  updateManagedPresetCommand,
} from '../services/presetCommandService';
import { UiStateStore, defaultTerminalFold } from '../services/uiStateStore';
import { buildOperatorProfile, ReleaseHistoryStore } from '../services/releaseHistoryStore';
import { RemoteSyncService } from '../services/remoteSyncService';
import {
  readGitBranch,
  readPubspecVersion,
  ReleaseRunner,
  PanelShellSession,
  openExternalTerminalForFolder,
  resolveOperator,
} from '../services/releaseRunner';
import { ExtensionMessage, InteractiveShortcut, PanelState, ReleaseCommandDefinition, ReleaseRecord, ReleaseStatus, TaskSessionView } from '../types';
import { InteractivePromptDetector } from '../services/interactivePromptDetector';
import { getUiLanguage, t } from '../i18n';
import {
  applyConfigBundle,
  buildConfigBundle,
  exportConfigToFile,
  importConfigFromFile,
} from '../services/configBundleService';
import { initializeCommandConfig } from '../services/commandConfigInitService';

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

interface ParallelTaskContext {
  record: ReleaseRecord;
  runner: ReleaseRunner;
  promptDetector: InteractivePromptDetector;
}

export class ReleasePanelController {
  private folder: vscode.WorkspaceFolder | undefined;
  private store: ReleaseHistoryStore | undefined;
  private customCommands: CustomCommandStore | undefined;
  private presetCommands: PresetCommandStore | undefined;
  private uiState: UiStateStore | undefined;
  private panelShell: PanelShellSession | undefined;
  private remoteSync: RemoteSyncService | undefined;
  private syncing = false;
  private runningRecordId: string | undefined;
  private parallelMode = false;
  private taskSessions: TaskSessionView[] = [];
  private parallelTasks = new Map<string, ParallelTaskContext>();
  private interactiveRecordId: string | undefined;
  private remoteSyncedAt: string | undefined;
  private promptDetector = new InteractivePromptDetector();

  constructor(private readonly secrets: vscode.SecretStorage) {}

  dispose(): void {
    void this.finalizeActiveRun('cancelled', 130);
    for (const task of this.parallelTasks.values()) {
      task.runner.dispose();
    }
    this.parallelTasks.clear();
    this.taskSessions = [];
    this.panelShell?.dispose();
  }

  private async ensurePanelShell(): Promise<void> {
    if (this.parallelMode) {
      return;
    }
    const folder = this.ensureWorkspaceServices();
    if (!folder || !this.panelShell) {
      return;
    }
    await this.panelShell.ensureStarted((chunk, stream) => {
      this.onTerminalOutput?.(chunk, stream);
      if (this.runningRecordId) {
        const detected = this.promptDetector.append(chunk);
        if (detected) {
          this.onInteractivePrompt?.(detected.prompt, detected.context, buildInteractiveShortcuts(detected.prompt));
        }
      }
    });
  }

  /** Pre-warm the panel shell after the UI is shown so the first command starts faster. */
  warmPanelShell(): void {
    void this.ensurePanelShell();
  }

  async refresh(): Promise<PanelState> {
    const state = await this.bootstrap(true);
    await this.onStateChanged?.(state);
    return state;
  }

  async syncRemote(
    options: boolean | { showToast?: boolean; quiet?: boolean; interactive?: boolean } = {},
  ): Promise<PanelState> {
    const opts = typeof options === 'boolean' ? { showToast: options } : options;
    const interactive = opts.interactive ?? !!opts.showToast;
    const quiet = opts.quiet ?? false;

    if (!this.ensureWorkspaceServices()) {
      this.notify('warn', t('toast.openWorkspace'));
      return this.buildEmptyState();
    }
    if (this.syncing) {
      return this.buildState();
    }
    this.syncing = true;
    const syncOptions = { interactive };
    try {
      const pulled = await this.remoteSync!.syncFromRemote(this.store!, syncOptions);
      if (pulled) {
        this.remoteSyncedAt = pulled.syncedAt;
      }
      const pushedAt = await this.remoteSync!.syncToRemote(this.store!, syncOptions);
      if (pushedAt) {
        this.remoteSyncedAt = pushedAt;
      }
      if (opts.showToast) {
        const enabled = await this.remoteSync!.isEnabled();
        this.notify('info', enabled ? t('toast.remoteSynced') : t('toast.remoteSyncDisabled'));
      }
    } catch (error) {
      if (!quiet) {
        const message = error instanceof Error ? error.message : String(error);
        this.notify('error', t('toast.remoteSyncFailed', { message }));
      }
    } finally {
      this.syncing = false;
    }
    const state = await this.buildState();
    await this.onStateChanged?.(state);
    return state;
  }

  async bootstrap(syncRemote: boolean): Promise<PanelState> {
    if (!this.ensureWorkspaceServices()) {
      return this.buildEmptyState();
    }
    if (syncRemote && (await this.remoteSync!.isEnabled())) {
      await this.syncRemote({ quiet: true, interactive: false });
    }
    await this.reconcileRunningRecords();
    return this.buildState();
  }

  async cancelRun(recordId?: string): Promise<PanelState> {
    if (this.parallelMode) {
      if (recordId) {
        await this.cancelParallelTask(recordId);
        return this.buildState();
      }
      const runningIds = [...this.parallelTasks.keys()];
      if (!runningIds.length) {
        this.notify('warn', t('toast.noRunningTask'));
        return this.buildState();
      }
      for (const id of runningIds) {
        await this.cancelParallelTask(id);
      }
      const state = await this.buildState();
      await this.onStateChanged?.(state);
      return state;
    }

    if (!this.store || !this.runningRecordId) {
      this.notify('warn', t('toast.noRunningTask'));
      return this.buildState();
    }

    const activeRecordId = this.runningRecordId;
    const bundle = await this.store.load();
    const record = bundle.records.find((item) => item.id === activeRecordId);
    if (!record || record.status !== 'running') {
      this.runningRecordId = undefined;
      return this.buildState();
    }

    this.onTerminalOutput?.(t('terminal.userCancelled'), 'stderr');
    this.panelShell?.cancel();
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

  async submitTerminalInput(value: string, recordId?: string): Promise<PanelState | undefined> {
    if (this.parallelMode) {
      const targetId = recordId ?? this.interactiveRecordId;
      const trimmed = value.trim();
      const task = targetId ? this.parallelTasks.get(targetId) : undefined;
      if (task?.runner.isRunning()) {
        const display = value === '' ? '(Enter)' : value;
        this.onTerminalOutput?.(`> ${display}\n`, 'stdout', targetId);
        task.runner.writeStdin(value);
        task.promptDetector.markResponded();
        if (this.interactiveRecordId === targetId) {
          this.interactiveRecordId = undefined;
          this.onInteractivePromptDismiss?.();
        }
        return undefined;
      }
      if (targetId && trimmed && this.taskSessions.some((item) => item.recordId === targetId)) {
        return this.runCommandInTaskTerminal(targetId, trimmed);
      }
      if (!trimmed) {
        return undefined;
      }
      return this.runRawCommand(trimmed);
    }

    await this.ensurePanelShell();
    if (!this.panelShell) {
      return undefined;
    }

    const trimmed = value.trim();
    if (trimmed === 'clear' || trimmed === 'cls') {
      this.onTerminalClear?.();
      return undefined;
    }

    this.panelShell.writeStdin(value);
    this.promptDetector.markResponded();
    this.onInteractivePromptDismiss?.();
    return undefined;
  }

  async interruptTerminal(recordId?: string): Promise<PanelState | undefined> {
    if (this.parallelMode) {
      const targetId = recordId ?? this.interactiveRecordId;
      if (targetId && this.parallelTasks.has(targetId)) {
        await this.cancelParallelTask(targetId);
        return this.buildState();
      }
      return undefined;
    }

    if (this.runningRecordId) {
      return this.cancelRun();
    }

    await this.ensurePanelShell();
    this.panelShell?.interrupt();
    return undefined;
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
    if (!this.ensureWorkspaceServices() || !this.customCommands) {
      this.notify('warn', t('toast.openWorkspace'));
      return this.buildEmptyState();
    }
    if (!label.trim() || !command.trim()) {
      this.notify('warn', t('toast.fillCustomCommand'));
      return this.buildState();
    }
    await this.customCommands.add(label, command);
    if (this.uiState) {
      await this.uiState.setGroupFold('custom', true);
    }
    this.notify('info', t('toast.customSaved'));
    const state = await this.buildState();
    await this.onStateChanged?.(state);
    return state;
  }

  async updateCustomCommand(customId: string, label: string, command: string): Promise<PanelState> {
    if (!this.ensureWorkspaceServices() || !this.customCommands) {
      this.notify('warn', t('toast.openWorkspace'));
      return this.buildEmptyState();
    }
    if (!label.trim() || !command.trim()) {
      this.notify('warn', t('toast.fillCustomCommand'));
      return this.buildState();
    }
    const updated = await this.customCommands.update(customId, label, command);
    if (!updated) {
      this.notify('warn', t('toast.customNotFound'));
      return this.buildState();
    }
    this.notify('info', t('toast.customUpdated'));
    const state = await this.buildState();
    await this.onStateChanged?.(state);
    return state;
  }

  async removeCustomCommand(customId: string): Promise<PanelState> {
    if (!this.ensureWorkspaceServices() || !this.customCommands) {
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

  async addPresetCommand(label: string, command: string): Promise<PanelState> {
    const folder = this.ensureWorkspaceServices();
    if (!folder) {
      this.notify('warn', t('toast.openWorkspace'));
      return this.buildEmptyState();
    }
    if (!label.trim() || !command.trim()) {
      this.notify('warn', t('toast.fillPresetCommand'));
      return this.buildState();
    }
    await addManagedPresetCommand(folder, this.presetCommands!, label, command);
    if (this.uiState) {
      await this.uiState.setGroupFold('release', true);
    }
    this.notify('info', t('toast.presetSaved'));
    const state = await this.buildState();
    await this.onStateChanged?.(state);
    return state;
  }

  async updatePresetCommand(presetKey: string, label: string, command: string): Promise<PanelState> {
    const folder = this.ensureWorkspaceServices();
    if (!folder) {
      this.notify('warn', t('toast.openWorkspace'));
      return this.buildEmptyState();
    }
    if (!label.trim() || !command.trim()) {
      this.notify('warn', t('toast.fillPresetCommand'));
      return this.buildState();
    }
    const updated = await updateManagedPresetCommand(folder, this.presetCommands!, presetKey, label, command);
    if (!updated) {
      this.notify('warn', t('toast.presetNotFound'));
      return this.buildState();
    }
    this.notify('info', t('toast.presetUpdated'));
    const state = await this.buildState();
    await this.onStateChanged?.(state);
    return state;
  }

  async removePresetCommand(presetKey: string): Promise<PanelState> {
    const folder = this.ensureWorkspaceServices();
    if (!folder) {
      return this.buildEmptyState();
    }
    const removed = await removeManagedPresetCommand(folder, this.presetCommands!, presetKey);
    if (!removed) {
      this.notify('warn', t('toast.presetNotFound'));
      return this.buildState();
    }
    this.notify('info', t('toast.presetDeleted'));
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

  async setParallelMode(enabled: boolean): Promise<PanelState> {
    if (enabled === this.parallelMode) {
      return this.buildState();
    }
    if (enabled && (this.runningRecordId || this.panelShell?.isRunning())) {
      this.notify('warn', t('toast.runInProgress'));
      return this.buildState();
    }
    if (!enabled && this.parallelTasks.size > 0) {
      this.notify('warn', t('toast.runInProgress'));
      return this.buildState();
    }
    if (this.uiState) {
      await this.uiState.setParallelMode(enabled);
    }
    this.parallelMode = enabled;
    const state = await this.buildState();
    await this.onStateChanged?.(state);
    return state;
  }

  async exportConfig(): Promise<PanelState> {
    const folder = this.ensureWorkspaceServices();
    if (!folder || !this.customCommands || !this.presetCommands || !this.uiState) {
      this.notify('warn', t('toast.openWorkspace'));
      return this.buildEmptyState();
    }

    try {
      const bundle = await buildConfigBundle(folder, this.customCommands, this.presetCommands, this.uiState, this.secrets);
      const savedPath = await exportConfigToFile(folder, bundle);
      if (!savedPath) {
        this.notify('info', t('config.exportCancelled'));
        return this.buildState();
      }
      this.notify('info', t('config.exportSuccess', { path: savedPath }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.notify('error', t('config.exportFailed', { message }));
    }

    return this.buildState();
  }

  async initCommandConfig(): Promise<PanelState> {
    const folder = this.ensureWorkspaceServices();
    if (!folder || !this.customCommands || !this.presetCommands) {
      this.notify('warn', t('toast.openWorkspace'));
      return this.buildEmptyState();
    }

    if (this.runningRecordId || this.panelShell?.isRunning() || this.parallelTasks.size > 0) {
      this.notify('warn', t('toast.runInProgress'));
      return this.buildState();
    }

    try {
      const result = await initializeCommandConfig(folder, { interactive: true });
      if (!result) {
        this.notify('info', t('config.initCancelled'));
        return this.buildState();
      }

      this.presetCommands.invalidateCache();
      const message = result.reinitialized
        ? t('config.initReinitialized', { path: result.settingsPath })
        : t('config.initSuccess', { path: result.settingsPath });
      this.notify('info', message);
      const state = await this.buildState();
      await this.onStateChanged?.(state);
      return state;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.notify('error', t('config.initFailed', { message }));
      return this.buildState();
    }
  }

  async importConfig(): Promise<PanelState> {
    const folder = this.ensureWorkspaceServices();
    if (!folder || !this.customCommands || !this.presetCommands || !this.uiState) {
      this.notify('warn', t('toast.openWorkspace'));
      return this.buildEmptyState();
    }

    if (this.runningRecordId || this.panelShell?.isRunning() || this.parallelTasks.size > 0) {
      this.notify('warn', t('toast.runInProgress'));
      return this.buildState();
    }

    try {
      const result = await importConfigFromFile(folder);
      if (!result) {
        this.notify('info', t('config.importCancelled'));
        return this.buildState();
      }

      const { bundle, warnings } = result;

      const importLabel = t('btn.importConfig');
      const cancelLabel = t('btn.cancel');
      const confirmed = await vscode.window.showWarningMessage(
        t('config.importConfirm'),
        { modal: true },
        importLabel,
        cancelLabel,
      );
      if (confirmed !== importLabel) {
        this.notify('info', t('config.importCancelled'));
        return this.buildState();
      }

      await applyConfigBundle(folder, this.customCommands, this.presetCommands, this.uiState, this.secrets, bundle);
      this.parallelMode = await this.uiState.getParallelMode();
      if (warnings.length > 0) {
        this.notify('warn', warnings.join(' '));
      }
      this.notify('info', t('config.importSuccess'));
      const state = await this.buildState();
      await this.onStateChanged?.(state);
      return state;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.notify('error', t('config.importFailed', { message }));
      return this.buildState();
    }
  }

  private async executeDefinition(definition: ReleaseCommandDefinition): Promise<PanelState> {
    const folder = this.ensureWorkspaceServices();
    if (!folder || !this.store || !this.panelShell || !this.remoteSync) {
      this.notify('warn', t('toast.openWorkspace'));
      return this.buildEmptyState();
    }
    if (this.parallelMode) {
      void this.startParallelTask(definition);
      return this.buildState();
    }
    if (this.runningRecordId) {
      this.notify('warn', t('toast.runInProgress'));
      return this.buildState();
    }
    if (this.panelShell.isRunning()) {
      this.panelShell.cancel();
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
    this.onTerminalStarted?.(definition.label, recordId, definition.key);
    await this.onStateChanged?.(await this.buildState());

    try {
      await this.panelShell.run(
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

    const state = await this.buildState();
    await this.onStateChanged?.(state);
    return state;
  }

  openTerminal(): void {
    const folder = this.ensureWorkspaceServices();
    if (folder) {
      openExternalTerminalForFolder(folder);
    }
  }

  onStateChanged: ((state: PanelState) => void) | undefined;
  onToast: ((level: 'info' | 'warn' | 'error', message: string) => void) | undefined;
  onTerminalClear: ((recordId?: string) => void) | undefined;
  onTerminalOutput: ((chunk: string, stream: 'stdout' | 'stderr', recordId?: string) => void) | undefined;
  onTerminalStarted: ((label: string, recordId: string, commandKey: string) => void) | undefined;
  onInteractivePrompt:
    | ((prompt: string, context: string, shortcuts: InteractiveShortcut[], recordId?: string) => void)
    | undefined;
  onInteractivePromptDismiss: (() => void) | undefined;

  private async runCommandInTaskTerminal(recordId: string, command: string): Promise<PanelState> {
    const folder = this.ensureWorkspaceServices();
    if (!folder || !this.store) {
      this.notify('warn', t('toast.openWorkspace'));
      return this.buildEmptyState();
    }

    const session = this.taskSessions.find((item) => item.recordId === recordId);
    if (!session || this.parallelTasks.has(recordId)) {
      return this.buildState();
    }

    const bundle = await this.store.load();
    const existingRecord = bundle.records.find((item) => item.id === recordId);
    if (!existingRecord) {
      return this.runRawCommand(command);
    }

    session.status = 'running';
    session.finishedAt = undefined;
    session.exitCode = undefined;

    const runner = new ReleaseRunner(folder);
    const promptDetector = new InteractivePromptDetector();
    this.parallelTasks.set(recordId, { record: existingRecord, runner, promptDetector });
    await this.onStateChanged?.(await this.buildState());

    void runner
      .runFollowUp(command, recordId, (chunk, stream) => {
        this.onTerminalOutput?.(chunk, stream, recordId);
        const detected = promptDetector.append(chunk);
        if (detected) {
          this.interactiveRecordId = recordId;
          this.onInteractivePrompt?.(
            detected.prompt,
            detected.context,
            buildInteractiveShortcuts(detected.prompt),
            recordId,
          );
        }
      }, async (result) => {
        await this.finishTaskTerminalFollowUp(recordId, resolveRunStatus(result));
      })
      .catch(async (error) => {
        this.parallelTasks.delete(recordId);
        const message = error instanceof Error ? error.message : String(error);
        this.updateTaskSession(recordId, 'failed', 1);
        this.notify('error', message);
        await this.onStateChanged?.(await this.buildState());
      });

    return this.buildState();
  }

  private async finishTaskTerminalFollowUp(
    recordId: string,
    status: { status: ReleaseStatus; exitCode: number },
  ): Promise<void> {
    this.parallelTasks.delete(recordId);
    if (this.interactiveRecordId === recordId) {
      this.interactiveRecordId = undefined;
      this.onInteractivePromptDismiss?.();
    }
    this.updateTaskSession(recordId, status.status, status.exitCode);
    await this.onStateChanged?.(await this.buildState());
  }

  private getTaskSessionSlotKey(commandKey: string): string {
    return commandKey.startsWith('adhoc:') ? 'adhoc' : commandKey;
  }

  private findTaskSessionBySlot(commandKey: string): TaskSessionView | undefined {
    const slotKey = this.getTaskSessionSlotKey(commandKey);
    return this.taskSessions.find((item) => this.getTaskSessionSlotKey(item.commandKey) === slotKey);
  }

  private pruneTaskSessionsForSlot(commandKey: string, keepRecordId: string): void {
    const slotKey = this.getTaskSessionSlotKey(commandKey);
    this.taskSessions = this.taskSessions.filter((item) => {
      if (this.getTaskSessionSlotKey(item.commandKey) !== slotKey) {
        return true;
      }
      return item.recordId === keepRecordId;
    });
  }

  private async startParallelTask(definition: ReleaseCommandDefinition): Promise<void> {
    const folder = this.ensureWorkspaceServices();
    if (!folder || !this.store || !this.remoteSync) {
      this.notify('warn', t('toast.openWorkspace'));
      return;
    }

    const existing = this.findTaskSessionBySlot(definition.key);
    if (existing && this.parallelTasks.has(existing.recordId)) {
      this.notify('warn', t('toast.runInProgress'));
      return;
    }

    const operator = await resolveOperator(folder, this.secrets);
    const branch = await readGitBranch(folder);
    const version = await readPubspecVersion(folder);
    const startedAt = new Date().toISOString();
    const recordId = existing?.recordId ?? this.store.createRecordId();
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
      startedAt,
      status: 'running',
      logHint: t('logHint.panelTerminal'),
    };

    await this.store.upsertRecord(record);
    await this.store.touchOperator(buildOperatorProfile(operator.name, operator.email));

    if (existing) {
      existing.commandKey = definition.key;
      existing.label = definition.label;
      existing.status = 'running';
      existing.startedAt = startedAt;
      existing.finishedAt = undefined;
      existing.exitCode = undefined;
      this.pruneTaskSessionsForSlot(definition.key, recordId);
      this.onTerminalClear?.(recordId);
    } else {
      const session: TaskSessionView = {
        recordId,
        commandKey: definition.key,
        label: definition.label,
        status: 'running',
        startedAt,
      };
      this.taskSessions.push(session);
    }

    const runner = new ReleaseRunner(folder);
    const promptDetector = new InteractivePromptDetector();
    this.parallelTasks.set(recordId, { record, runner, promptDetector });

    this.onTerminalStarted?.(definition.label, recordId, definition.key);
    await this.onStateChanged?.(await this.buildState());

    try {
      await runner.run(
        definition,
        recordId,
        (chunk, stream) => {
          this.onTerminalOutput?.(chunk, stream, recordId);
          const detected = promptDetector.append(chunk);
          if (detected) {
            this.interactiveRecordId = recordId;
            this.onInteractivePrompt?.(
              detected.prompt,
              detected.context,
              buildInteractiveShortcuts(detected.prompt),
              recordId,
            );
          }
        },
        async (result) => {
          await this.finishParallelTask(record, resolveRunStatus(result));
        },
      );
    } catch (error) {
      this.parallelTasks.delete(recordId);
      const message = error instanceof Error ? error.message : String(error);
      await this.store.upsertRecord({
        ...record,
        finishedAt: new Date().toISOString(),
        status: 'failed',
        exitCode: 1,
      });
      this.updateTaskSession(recordId, 'failed', 1);
      this.notify('error', message);
      await this.onStateChanged?.(await this.buildState());
    }
  }

  private async cancelParallelTask(recordId: string): Promise<void> {
    const task = this.parallelTasks.get(recordId);
    if (!task || !this.store) {
      return;
    }

    this.onTerminalOutput?.(t('terminal.userCancelled'), 'stderr', recordId);
    task.runner.cancel();
    if (this.interactiveRecordId === recordId) {
      this.interactiveRecordId = undefined;
      this.onInteractivePromptDismiss?.();
    }

    const bundle = await this.store.load();
    const record = bundle.records.find((item) => item.id === recordId);
    if (record && record.status === 'running') {
      await this.store.upsertRecord({
        ...record,
        finishedAt: new Date().toISOString(),
        status: 'cancelled',
        exitCode: 130,
      });
    }

    this.parallelTasks.delete(recordId);
    this.updateTaskSession(recordId, 'cancelled', 130);
    this.notify('warn', t('toast.runCancelled'));
    await this.onStateChanged?.(await this.buildState());
  }

  private async finishParallelTask(
    record: ReleaseRecord,
    status: { status: ReleaseStatus; exitCode: number },
  ): Promise<void> {
    if (!this.store || !this.remoteSync) {
      return;
    }

    this.parallelTasks.delete(record.id);
    if (this.interactiveRecordId === record.id) {
      this.interactiveRecordId = undefined;
      this.onInteractivePromptDismiss?.();
    }

    const bundle = await this.store.load();
    const existing = bundle.records.find((item) => item.id === record.id);
    if (existing && existing.status !== 'running') {
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
    this.updateTaskSession(record.id, status.status, status.exitCode);

    if (await this.remoteSync.isEnabled()) {
      try {
        this.remoteSyncedAt = await this.remoteSync.syncToRemote(this.store);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.notify('warn', t('toast.remoteUploadFailed', { message }));
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
  }

  private updateTaskSession(recordId: string, status: ReleaseStatus, exitCode?: number): void {
    const session = this.taskSessions.find((item) => item.recordId === recordId);
    if (!session) {
      return;
    }
    session.status = status;
    session.finishedAt = new Date().toISOString();
    session.exitCode = exitCode;
  }

  private async reconcileRunningRecords(): Promise<void> {
    if (!this.store) {
      return;
    }
    const activeRecordIds = this.parallelMode
      ? [...this.parallelTasks.keys()]
      : this.panelShell?.isRunning() && this.runningRecordId
        ? [this.runningRecordId]
        : [];
    await this.store.reconcileStaleRunningRecords(activeRecordIds);
    if (!this.parallelMode && !this.panelShell?.isRunning()) {
      this.runningRecordId = undefined;
    }
  }

  private async finishRun(
    record: ReleaseRecord,
    status: { status: ReleaseStatus; exitCode: number },
  ): Promise<void> {
    if (!this.store || !this.remoteSync) {
      return;
    }

    const bundle = await this.store.load();
    const existing = bundle.records.find((item) => item.id === record.id);
    if (existing && existing.status !== 'running') {
      if (this.runningRecordId === record.id) {
        this.runningRecordId = undefined;
      }
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
    if (await this.remoteSync.isEnabled()) {
      try {
        this.remoteSyncedAt = await this.remoteSync.syncToRemote(this.store);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.notify('warn', t('toast.remoteUploadFailed', { message }));
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
      for (const task of this.parallelTasks.values()) {
        task.runner.dispose();
      }
      this.parallelTasks.clear();
      this.taskSessions = [];
      this.panelShell?.dispose();
      this.folder = folder;
      this.store = new ReleaseHistoryStore(folder);
      this.customCommands = new CustomCommandStore(folder);
      this.presetCommands = new PresetCommandStore(folder);
      this.uiState = new UiStateStore(folder);
      this.panelShell = new PanelShellSession(folder);
      this.remoteSync = new RemoteSyncService(folder, this.secrets);
    }
    return folder;
  }

  private async loadCommandGroups() {
    const folder = this.ensureWorkspaceServices();
    if (!folder || !this.customCommands || !this.presetCommands) {
      return buildCommandGroups([], []);
    }
    const releaseCommands = await loadReleaseCommands(folder, this.presetCommands);
    const customCommands = await loadCustomCommands(this.customCommands);
    return buildCommandGroups(releaseCommands, customCommands);
  }

  private async buildState(): Promise<PanelState> {
    const folder = this.ensureWorkspaceServices();
    if (!folder || !this.store || !this.remoteSync) {
      return this.buildEmptyState();
    }

    const [bundle, commandGroups] = await Promise.all([
      this.store.load(),
      this.loadCommandGroups(),
    ]);
    const commands = flattenCommands(commandGroups);
    const groupIds = commandGroups.map((group) => group.id);

    const [groupFold, terminalFold, parallelMode, operator, branch, version, remoteSyncEnabled] = await Promise.all([
      this.uiState!.getGroupFold(groupIds),
      this.uiState!.getTerminalFold(),
      this.uiState!.getParallelMode(),
      resolveOperator(folder, this.secrets),
      readGitBranch(folder),
      readPubspecVersion(folder),
      this.remoteSync.isEnabled(),
    ]);
    this.parallelMode = parallelMode;

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
      remoteSyncEnabled,
      remoteSyncedAt: this.remoteSyncedAt,
      syncing: this.syncing,
      runningRecordId: this.runningRecordId,
      runningRecordIds: [...this.parallelTasks.keys()],
      parallelMode: this.parallelMode,
      taskSessions: [...this.taskSessions],
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
      remoteSyncEnabled: false,
      syncing: this.syncing,
      runningRecordId: this.runningRecordId,
      runningRecordIds: [...this.parallelTasks.keys()],
      parallelMode: this.parallelMode,
      taskSessions: [...this.taskSessions],
      workspaceName: t('empty.noWorkspace'),
      uiLanguage: getUiLanguage(),
      terminalFold: defaultTerminalFold(),
    };
  }

  private notify(level: 'info' | 'warn' | 'error', message: string): void {
    this.onToast?.(level, message);
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
