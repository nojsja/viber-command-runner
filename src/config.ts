import * as vscode from 'vscode';

export function isSilentNotificationsEnabled(): boolean {
  return vscode.workspace.getConfiguration('viberCommandRunner').get<boolean>('silentNotifications', false);
}

export function showUserNotification(level: 'info' | 'warn' | 'error', message: string): void {
  if (isSilentNotificationsEnabled()) {
    return;
  }

  if (level === 'error') {
    void vscode.window.showErrorMessage(message);
  } else if (level === 'warn') {
    void vscode.window.showWarningMessage(message);
  } else {
    void vscode.window.showInformationMessage(message);
  }
}
