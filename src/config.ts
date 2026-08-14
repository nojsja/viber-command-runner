import * as vscode from 'vscode';

export const CONFIG_SECTION = 'viberWorkbench';
const LEGACY_CONFIG_SECTION = 'viberCommandRunner';

export function getExtensionConfiguration(scope?: vscode.ConfigurationScope): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(CONFIG_SECTION, scope);
}

export function getExtensionConfigValue<T>(
  key: string,
  defaultValue: T,
  scope?: vscode.ConfigurationScope,
): T {
  const current = getExtensionConfiguration(scope).get<T>(key);
  if (current !== undefined) {
    return current;
  }
  const legacy = vscode.workspace.getConfiguration(LEGACY_CONFIG_SECTION, scope).get<T>(key);
  return legacy ?? defaultValue;
}

export function isSilentNotificationsEnabled(): boolean {
  return getExtensionConfigValue('silentNotifications', false);
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
