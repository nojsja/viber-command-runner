import * as vscode from 'vscode';
import { ReleaseHistoryBundle } from '../types';

export interface RemoteSyncContext {
  folder: vscode.WorkspaceFolder;
  secrets: vscode.SecretStorage;
}

export interface RemoteSyncOptions {
  interactive?: boolean;
}

export interface RemoteSyncProvider {
  readonly id: string;
  isEnabled(context: RemoteSyncContext): boolean | Promise<boolean>;
  pull?(
    context: RemoteSyncContext,
    options?: RemoteSyncOptions,
  ): Promise<ReleaseHistoryBundle | undefined>;
  push?(
    context: RemoteSyncContext,
    bundle: ReleaseHistoryBundle,
    options?: RemoteSyncOptions,
  ): Promise<string | undefined>;
}

const nullProvider: RemoteSyncProvider = {
  id: 'none',
  isEnabled: () => false,
};

let activeProvider: RemoteSyncProvider = nullProvider;

export function getRemoteSyncProvider(): RemoteSyncProvider {
  return activeProvider;
}

export function registerRemoteSyncProvider(provider: RemoteSyncProvider): vscode.Disposable {
  const previous = activeProvider;
  activeProvider = provider;
  return new vscode.Disposable(() => {
    if (activeProvider === provider) {
      activeProvider = previous;
    }
  });
}
