import * as vscode from 'vscode';
import { ReleaseLauncherProvider } from './panel/ReleaseLauncherProvider';
import { ReleaseWindowPanel } from './panel/ReleaseWindowPanel';
import { runCommandConfigInit } from './services/commandConfigInitService';
import { migrateLegacyPresetCommands } from './services/presetCommandMigration';
import { pickWorkspaceFolder } from './panel/ReleasePanelController';
import { t } from './i18n';
import { showUserNotification } from './config';
import { registerRemoteSyncProvider } from './services/remoteSyncProvider';
import type { RemoteSyncProvider } from './services/remoteSyncProvider';

async function migrateAllWorkspacePresetCommands(): Promise<void> {
  await Promise.all(
    (vscode.workspace.workspaceFolders ?? []).map((folder) => migrateLegacyPresetCommands(folder)),
  );
}

export async function activate(context: vscode.ExtensionContext): Promise<{
  registerRemoteSyncProvider: (provider: RemoteSyncProvider) => vscode.Disposable;
}> {
  await migrateAllWorkspacePresetCommands();

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders((event) => {
      void Promise.all(event.added.map((folder) => migrateLegacyPresetCommands(folder)));
    }),
  );

  const openPanel = () => {
    ReleaseWindowPanel.createOrShow(context.extensionUri, context.secrets);
  };

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration('viberWorkbench.uiLanguage') && !event.affectsConfiguration('viberCommandRunner.uiLanguage')) {
        return;
      }
      const controller = ReleaseWindowPanel.getCurrentController();
      if (controller) {
        void controller.refresh();
      }
    }),
    vscode.window.registerWebviewViewProvider(
      ReleaseLauncherProvider.viewType,
      new ReleaseLauncherProvider(context),
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
    vscode.commands.registerCommand('viberWorkbench.openPanel', openPanel),
    vscode.commands.registerCommand('viberWorkbench.refresh', async () => {
      const controller = ReleaseWindowPanel.getCurrentController();
      if (!controller) {
        openPanel();
        return;
      }
      await controller.refresh();
    }),
    vscode.commands.registerCommand('viberWorkbench.syncRemote', async () => {
      const controller = ReleaseWindowPanel.getCurrentController();
      if (!controller) {
        openPanel();
        return;
      }
      await controller.syncRemote(true);
    }),
    vscode.commands.registerCommand('viberWorkbench.initCommandConfig', async () => {
      const folder = pickWorkspaceFolder();
      if (!folder) {
        showUserNotification('warn', t('toast.openWorkspace'));
        return;
      }
      const controller = ReleaseWindowPanel.getCurrentController();
      if (controller) {
        await controller.initCommandConfig();
        return;
      }
      await runCommandConfigInit(folder, { interactive: true });
    }),
  );

  return {
    registerRemoteSyncProvider: (provider: RemoteSyncProvider) => {
      const disposable = registerRemoteSyncProvider(provider);
      context.subscriptions.push(disposable);
      return disposable;
    },
  };
}

export function deactivate(): void {}
