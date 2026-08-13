import * as vscode from 'vscode';
import { ReleaseHistoryBundle } from '../types';
import { ReleaseHistoryStore } from './releaseHistoryStore';
import {
  getRemoteSyncProvider,
  RemoteSyncContext,
  RemoteSyncOptions,
} from './remoteSyncProvider';

export class RemoteSyncService {
  constructor(
    private readonly folder: vscode.WorkspaceFolder,
    private readonly secrets: vscode.SecretStorage,
  ) {}

  private context(): RemoteSyncContext {
    return { folder: this.folder, secrets: this.secrets };
  }

  async isEnabled(): Promise<boolean> {
    return getRemoteSyncProvider().isEnabled(this.context());
  }

  async syncFromRemote(
    store: ReleaseHistoryStore,
    _options: RemoteSyncOptions = {},
  ): Promise<{ bundle: ReleaseHistoryBundle; syncedAt: string } | undefined> {
    const provider = getRemoteSyncProvider();
    if (!(await provider.isEnabled(this.context()))) {
      return undefined;
    }
    if (!provider.pull) {
      return undefined;
    }

    const remote = await provider.pull(this.context(), _options);
    if (!remote) {
      return undefined;
    }

    const merged = store.mergeRemote(remote);
    await store.save(merged);
    const syncedAt = new Date().toISOString();
    return { bundle: merged, syncedAt };
  }

  async syncToRemote(store: ReleaseHistoryStore, _options: RemoteSyncOptions = {}): Promise<string | undefined> {
    const provider = getRemoteSyncProvider();
    if (!(await provider.isEnabled(this.context()))) {
      return undefined;
    }
    if (!provider.push) {
      return undefined;
    }

    const bundle = await store.load();
    bundle.updatedAt = new Date().toISOString();
    await store.save(bundle);
    return provider.push(this.context(), bundle, _options);
  }
}
