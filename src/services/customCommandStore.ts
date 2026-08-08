import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { ensureWorkspaceDataDir, getWorkspaceDataDir } from './userDataPaths';

export interface StoredCustomCommand {
  id: string;
  label: string;
  command: string;
  createdAt: string;
}

interface CustomCommandFile {
  version: 1;
  commands: StoredCustomCommand[];
}

export class CustomCommandStore {
  private bundle: CustomCommandFile | undefined;

  constructor(private readonly folder: vscode.WorkspaceFolder) {}

  private get filePath(): string {
    return path.join(getWorkspaceDataDir(this.folder), 'custom-commands.json');
  }

  async load(): Promise<StoredCustomCommand[]> {
    const bundle = await this.loadBundle();
    return bundle.commands;
  }

  async add(label: string, command: string): Promise<StoredCustomCommand> {
    const bundle = await this.loadBundle();
    const item: StoredCustomCommand = {
      id: crypto.randomUUID(),
      label: label.trim(),
      command: command.trim().replace(/;$/, ''),
      createdAt: new Date().toISOString(),
    };
    bundle.commands.unshift(item);
    await this.save(bundle);
    return item;
  }

  async remove(id: string): Promise<boolean> {
    const bundle = await this.loadBundle();
    const before = bundle.commands.length;
    bundle.commands = bundle.commands.filter((item) => item.id !== id);
    if (bundle.commands.length === before) {
      return false;
    }
    await this.save(bundle);
    return true;
  }

  async update(id: string, label: string, command: string): Promise<StoredCustomCommand | undefined> {
    const bundle = await this.loadBundle();
    const item = bundle.commands.find((entry) => entry.id === id);
    if (!item) {
      return undefined;
    }
    item.label = label.trim();
    item.command = command.trim().replace(/;$/, '');
    await this.save(bundle);
    return item;
  }

  async replaceAll(commands: StoredCustomCommand[]): Promise<void> {
    await this.save({ version: 1, commands });
  }

  private async loadBundle(): Promise<CustomCommandFile> {
    if (this.bundle) {
      return this.bundle;
    }
    await ensureWorkspaceDataDir(this.folder);
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<CustomCommandFile>;
      this.bundle = {
        version: 1,
        commands: Array.isArray(parsed.commands) ? parsed.commands : [],
      };
    } catch {
      this.bundle = { version: 1, commands: [] };
    }
    return this.bundle;
  }

  private async save(bundle: CustomCommandFile): Promise<void> {
    this.bundle = bundle;
    await fs.writeFile(this.filePath, JSON.stringify(bundle, null, 2), 'utf8');
  }
}
