import * as vscode from 'vscode';
import { showUserNotification } from '../config';
import { t } from '../i18n';
import { ReleaseHistoryBundle } from '../types';
import { ReleaseHistoryStore } from './releaseHistoryStore';

const ACCESS_KEY_ID = 'viberCommandRunner.oss.accessKeyId';
const ACCESS_KEY_SECRET = 'viberCommandRunner.oss.accessKeySecret';

export interface OssCredentials {
  accessKeyId?: string;
  accessKeySecret?: string;
}

export async function readOssCredentials(secrets: vscode.SecretStorage): Promise<OssCredentials> {
  const accessKeyId = await secrets.get(ACCESS_KEY_ID);
  const accessKeySecret = await secrets.get(ACCESS_KEY_SECRET);
  return {
    accessKeyId: accessKeyId || undefined,
    accessKeySecret: accessKeySecret || undefined,
  };
}

export async function writeOssCredentials(secrets: vscode.SecretStorage, credentials: OssCredentials): Promise<void> {
  if (credentials.accessKeyId !== undefined) {
    if (credentials.accessKeyId) {
      await secrets.store(ACCESS_KEY_ID, credentials.accessKeyId);
    } else {
      await secrets.delete(ACCESS_KEY_ID);
    }
  }
  if (credentials.accessKeySecret !== undefined) {
    if (credentials.accessKeySecret) {
      await secrets.store(ACCESS_KEY_SECRET, credentials.accessKeySecret);
    } else {
      await secrets.delete(ACCESS_KEY_SECRET);
    }
  }
}

type OssClient = {
  get(objectKey: string): Promise<{ content: Buffer }>;
  put(objectKey: string, body: Buffer, options?: { headers?: Record<string, string> }): Promise<unknown>;
};

export interface OssSyncOptions {
  interactive?: boolean;
}

export class OssSyncService {
  constructor(
    private readonly folder: vscode.WorkspaceFolder,
    private readonly secrets: vscode.SecretStorage,
  ) {}

  isEnabled(): boolean {
    return vscode.workspace.getConfiguration('viberCommandRunner', this.folder.uri).get<boolean>('oss.enabled') ?? false;
  }

  async syncFromRemote(
    store: ReleaseHistoryStore,
    options: OssSyncOptions = {},
  ): Promise<{ bundle: ReleaseHistoryBundle; syncedAt: string } | undefined> {
    if (!this.isEnabled()) {
      return undefined;
    }

    const client = await this.createClient(options);
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

  async syncToRemote(store: ReleaseHistoryStore, options: OssSyncOptions = {}): Promise<string | undefined> {
    if (!this.isEnabled()) {
      return undefined;
    }

    const client = await this.createClient(options);
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

  private async createClient(options: OssSyncOptions = {}): Promise<OssClient | undefined> {
    const interactive = options.interactive ?? false;
    const config = vscode.workspace.getConfiguration('viberCommandRunner', this.folder.uri);
    const bucket = config.get<string>('oss.bucket')?.trim();
    const region = config.get<string>('oss.region')?.trim() ?? 'oss-cn-beijing';
    const endpoint = config.get<string>('oss.endpoint')?.trim();

    if (!bucket) {
      if (interactive) {
        showUserNotification('warn', t('oss.configureBucket'));
      }
      return undefined;
    }

    if (interactive) {
      const ok = await this.ensureCredentialsPrompt();
      if (!ok) {
        return undefined;
      }
    }

    const accessKeyId = await this.secrets.get(ACCESS_KEY_ID);
    const accessKeySecret = await this.secrets.get(ACCESS_KEY_SECRET);
    if (!accessKeyId || !accessKeySecret) {
      return undefined;
    }

    const OSS = await this.loadOssClient(interactive);
    if (!OSS) {
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

  private async loadOssClient(interactive: boolean): Promise<(new (options: Record<string, unknown>) => OssClient) | undefined> {
    try {
      const module = await import('ali-oss');
      return module.default as unknown as new (options: Record<string, unknown>) => OssClient;
    } catch (error) {
      if (interactive) {
        const message = error instanceof Error ? error.message : String(error);
        showUserNotification('error', `Viber Command Runner: failed to load ali-oss (${message})`);
      }
      return undefined;
    }
  }
}
