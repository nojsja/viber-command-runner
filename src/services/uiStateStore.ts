import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { ensureWorkspaceDataDir, getWorkspaceDataDir } from './userDataPaths';

export interface TerminalFoldState {
  sticky: boolean;
  panel: boolean;
}

interface UiStateFile {
  version: 1;
  groupFold: Record<string, boolean>;
  terminalFold: TerminalFoldState;
  parallelMode: boolean;
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
        terminalFold: normalizeTerminalFold(parsed.terminalFold),
        parallelMode: typeof parsed.parallelMode === 'boolean' ? parsed.parallelMode : false,
      };
    } catch {
      this.state = {
        version: 1,
        groupFold: defaultGroupFold(),
        terminalFold: defaultTerminalFold(),
        parallelMode: false,
      };
    }
    return this.state;
  }

  async getGroupFold(groupIds: string[]): Promise<Record<string, boolean>> {
    const current = await this.load();
    return mergeGroupFold(current.groupFold, groupIds);
  }

  async getTerminalFold(): Promise<TerminalFoldState> {
    const current = await this.load();
    return { ...current.terminalFold };
  }

  async getParallelMode(): Promise<boolean> {
    const current = await this.load();
    return current.parallelMode;
  }

  async setParallelMode(enabled: boolean): Promise<boolean> {
    const current = await this.load();
    current.parallelMode = enabled;
    await fs.writeFile(this.filePath, JSON.stringify(current, null, 2), 'utf8');
    return current.parallelMode;
  }

  async setGroupFold(groupId: string, open: boolean): Promise<Record<string, boolean>> {
    const current = await this.load();
    current.groupFold[groupId] = open;
    await fs.writeFile(this.filePath, JSON.stringify(current, null, 2), 'utf8');
    return current.groupFold;
  }

  async setTerminalFold(target: keyof TerminalFoldState, expanded: boolean): Promise<TerminalFoldState> {
    const current = await this.load();
    current.terminalFold[target] = expanded;
    await fs.writeFile(this.filePath, JSON.stringify(current, null, 2), 'utf8');
    return { ...current.terminalFold };
  }

  async saveGroupFold(groupFold: Record<string, boolean>): Promise<void> {
    const current = await this.load();
    current.groupFold = groupFold;
    await fs.writeFile(this.filePath, JSON.stringify(current, null, 2), 'utf8');
  }

  async applySnapshot(snapshot: {
    groupFold?: Record<string, boolean>;
    terminalFold?: Partial<TerminalFoldState>;
    parallelMode?: boolean;
  }): Promise<void> {
    const current = await this.load();
    if (snapshot.groupFold) {
      current.groupFold = { ...snapshot.groupFold };
    }
    if (snapshot.terminalFold) {
      current.terminalFold = normalizeTerminalFold(snapshot.terminalFold);
    }
    if (typeof snapshot.parallelMode === 'boolean') {
      current.parallelMode = snapshot.parallelMode;
    }
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

export function defaultTerminalFold(): TerminalFoldState {
  return { sticky: true, panel: true };
}

function normalizeTerminalFold(value: Partial<TerminalFoldState> | undefined): TerminalFoldState {
  const defaults = defaultTerminalFold();
  return {
    sticky: typeof value?.sticky === 'boolean' ? value.sticky : defaults.sticky,
    panel: typeof value?.panel === 'boolean' ? value.panel : defaults.panel,
  };
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
