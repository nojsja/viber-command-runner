import * as vscode from 'vscode';
import { ReleaseLauncherProvider } from './panel/ReleaseLauncherProvider';
import { ReleaseWindowPanel } from './panel/ReleaseWindowPanel';

export function activate(context: vscode.ExtensionContext): void {
  const openPanel = () => {
    ReleaseWindowPanel.createOrShow(context.extensionUri, context.secrets);
  };

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
    vscode.commands.registerCommand('viberCommandRunner.syncOss', async () => {
      const controller = ReleaseWindowPanel.getCurrentController();
      if (!controller) {
        openPanel();
        return;
      }
      await controller.syncOss(true);
    }),
    vscode.commands.registerCommand('viberCommandRunner.openSettings', async () => {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'viberCommandRunner');
    }),
  );
}

export function deactivate(): void {}
