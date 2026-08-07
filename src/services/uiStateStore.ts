import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { ensureWorkspaceDataDir, getWorkspaceDataDir } from './userDataPaths';

interface UiStateFile {
  version: 1;
  groupFold: Record<string, boolean>;
}

const DEFAULT_GROUP_ORDER = ['release', 'custom'] as const;

export class UiStateStore {
  private state: UiStateFile | undefined;

  constructor(private readonly folder: vscode.WorkspaceFolder) {}

  private get filePath(): string {
    return path.join(getWorkspaceDataDir(this.folder), 'ui-state.json');
  }

  private async prepareDataDir(): Promise<void> {
    await ensureWorkspaceDataDir(this.folder);
  }

  async load(): Promise<UiStateFile> {
    if (this.state) {
      return this.state;
    }
    await this.prepareDataDir();
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<UiStateFile>;
      this.state = {
        version: 1,
        groupFold: parsed.groupFold ?? defaultGroupFold(),
      };
    } catch {
      this.state = { version: 1, groupFold: defaultGroupFold() };
    }
    return this.state;
  }

  async getGroupFold(groupIds: string[]): Promise<Record<string, boolean>> {
    const current = await this.load();
    return mergeGroupFold(current.groupFold, groupIds);
  }

  async setGroupFold(groupId: string, open: boolean): Promise<Record<string, boolean>> {
    const current = await this.load();
    current.groupFold[groupId] = open;
    await fs.writeFile(this.filePath, JSON.stringify(current, null, 2), 'utf8');
    return current.groupFold;
  }

  async saveGroupFold(groupFold: Record<string, boolean>): Promise<void> {
    const current = await this.load();
    current.groupFold = groupFold;
    await fs.writeFile(this.filePath, JSON.stringify(current, null, 2), 'utf8');
  }
}

export function defaultGroupFold(groupIds: string[] = [...DEFAULT_GROUP_ORDER]): Record<string, boolean> {
  const fold: Record<string, boolean> = {};
  groupIds.forEach((id, index) => {
    fold[id] = index === 0;
  });
  return fold;
}

function mergeGroupFold(saved: Record<string, boolean>, groupIds: string[]): Record<string, boolean> {
  const merged = defaultGroupFold(groupIds);
  for (const id of groupIds) {
    if (typeof saved[id] === 'boolean') {
      merged[id] = saved[id];
    }
  }
  return merged;
}
