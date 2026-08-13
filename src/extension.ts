import * as vscode from 'vscode';
import { ReleaseLauncherProvider } from './panel/ReleaseLauncherProvider';
import { ReleaseWindowPanel } from './panel/ReleaseWindowPanel';
import { migrateLegacyPresetCommands } from './services/presetCommandMigration';
import { registerRemoteSyncProvider } from './services/remoteSyncProvider';
import type { RemoteSyncProvider } from './services/remoteSyncProvider';

const EXTENSION_SETTINGS_QUERY = '@ext:nojsja.viber-command-runner';

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

  const openExtensionSettings = () =>
    vscode.commands.executeCommand('workbench.action.openSettings', EXTENSION_SETTINGS_QUERY);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration('viberCommandRunner.uiLanguage')) {
        return;
      }
      const controller = ReleaseWindowPanel.getCurrentController();
      if (controller) {
        void controller.refresh();
      }
    }),
    vscode.window.registerWebviewViewProvider(ReleaseLauncherProvider.viewType, new ReleaseLauncherProvider(context.extensionUri)),
    vscode.commands.registerCommand('viberCommandRunner.openPanel', openPanel),
    vscode.commands.registerCommand('viberCommandRunner.refresh', async () => {
      const controller = ReleaseWindowPanel.getCurrentController();
      if (!controller) {
        openPanel();
        return;
      }
      await controller.refresh();
    }),
    vscode.commands.registerCommand('viberCommandRunner.syncRemote', async () => {
      const controller = ReleaseWindowPanel.getCurrentController();
      if (!controller) {
        openPanel();
        return;
      }
      await controller.syncRemote(true);
    }),
    vscode.commands.registerCommand('viberCommandRunner.openSettings', openExtensionSettings),
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
