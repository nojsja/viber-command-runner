import OSS from 'ali-oss';
import * as vscode from 'vscode';
import { t } from '../i18n';
import { ReleaseHistoryBundle } from '../types';
import { ReleaseHistoryStore } from './releaseHistoryStore';

const ACCESS_KEY_ID = 'viberCommandRunner.oss.accessKeyId';
const ACCESS_KEY_SECRET = 'viberCommandRunner.oss.accessKeySecret';

export class OssSyncService {
  constructor(
    private readonly folder: vscode.WorkspaceFolder,
    private readonly secrets: vscode.SecretStorage,
  ) {}

  isEnabled(): boolean {
    return vscode.workspace.getConfiguration('viberCommandRunner', this.folder.uri).get<boolean>('oss.enabled') ?? false;
  }

  async syncFromRemote(store: ReleaseHistoryStore): Promise<{ bundle: ReleaseHistoryBundle; syncedAt: string } | undefined> {
    if (!this.isEnabled()) {
      return undefined;
    }

    const client = await this.createClient();
    if (!client) {
      return undefined;
    }

    const objectKey = this.objectKey();
    try {
      const result = await client.get(objectKey);
      const body = result.content.toString('utf8');
      const remote = JSON.parse(body) as ReleaseHistoryBundle;
      const merged = store.mergeRemote(remote);
      await store.save(merged);
      const syncedAt = new Date().toISOString();
      return { bundle: merged, syncedAt };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('NoSuchKey') || message.includes('404')) {
        return { bundle: await store.load(), syncedAt: new Date().toISOString() };
      }
      throw error;
    }
  }

  async syncToRemote(store: ReleaseHistoryStore): Promise<string | undefined> {
    if (!this.isEnabled()) {
      return undefined;
    }

    const client = await this.createClient();
    if (!client) {
      return undefined;
    }

    const bundle = await store.load();
    bundle.updatedAt = new Date().toISOString();
    await store.save(bundle);

    const objectKey = this.objectKey();
    await client.put(objectKey, Buffer.from(JSON.stringify(bundle, null, 2), 'utf8'), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    });
    return new Date().toISOString();
  }

  async ensureCredentialsPrompt(): Promise<boolean> {
    const accessKeyId = await this.secrets.get(ACCESS_KEY_ID);
    const accessKeySecret = await this.secrets.get(ACCESS_KEY_SECRET);
    if (accessKeyId && accessKeySecret) {
      return true;
    }

    const id = await vscode.window.showInputBox({
      title: 'Viber Command Runner OSS AccessKey ID',
      ignoreFocusOut: true,
      prompt: t('oss.secretPrompt'),
    });
    if (!id) {
      return false;
    }

    const secret = await vscode.window.showInputBox({
      title: 'Viber Command Runner OSS AccessKey Secret',
      ignoreFocusOut: true,
      password: true,
    });
    if (!secret) {
      return false;
    }

    await this.secrets.store(ACCESS_KEY_ID, id);
    await this.secrets.store(ACCESS_KEY_SECRET, secret);
    return true;
  }

  private objectKey(): string {
    return (
      vscode.workspace.getConfiguration('viberCommandRunner', this.folder.uri).get<string>('oss.objectKey')
      ?? 'viber/devtools/command-runner/history/global.json'
    );
  }

  private async createClient(): Promise<OSS | undefined> {
    const config = vscode.workspace.getConfiguration('viberCommandRunner', this.folder.uri);
    const bucket = config.get<string>('oss.bucket')?.trim();
    const region = config.get<string>('oss.region')?.trim() ?? 'oss-cn-beijing';
    const endpoint = config.get<string>('oss.endpoint')?.trim();

    if (!bucket) {
      vscode.window.showWarningMessage(t('oss.configureBucket'));
      return undefined;
    }

    const ok = await this.ensureCredentialsPrompt();
    if (!ok) {
      return undefined;
    }

    const accessKeyId = await this.secrets.get(ACCESS_KEY_ID);
    const accessKeySecret = await this.secrets.get(ACCESS_KEY_SECRET);
    if (!accessKeyId || !accessKeySecret) {
      return undefined;
    }

    return new OSS({
      region,
      bucket,
      accessKeyId,
      accessKeySecret,
      endpoint: endpoint || undefined,
      secure: true,
    });
  }
}
