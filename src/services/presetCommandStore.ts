import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { migrateLegacyPresetCommands } from './presetCommandMigration';
import { ensureWorkspaceDataDir, getWorkspaceDataDir } from './userDataPaths';

interface PresetCommandFile {
  version: 1;
  commands: Record<string, string>;
}

const PRESET_FILE = 'preset-commands.json';

export class PresetCommandStore {
  private bundle: PresetCommandFile | undefined;

  constructor(private readonly folder: vscode.WorkspaceFolder) {}

  private get filePath(): string {
    return path.join(getWorkspaceDataDir(this.folder), PRESET_FILE);
  }

  async load(): Promise<Record<string, string>> {
    await migrateLegacyPresetCommands(this.folder);
    this.bundle = undefined;
    const bundle = await this.loadBundle();
    return { ...bundle.commands };
  }

  async replaceAll(commands: Record<string, string>): Promise<void> {
    await migrateLegacyPresetCommands(this.folder);
    await this.save({ version: 1, commands: { ...commands } });
  }

  async add(label: string, command: string): Promise<void> {
    await migrateLegacyPresetCommands(this.folder);
    const bundle = await this.loadBundle();
    bundle.commands[label] = command;
    await this.save(bundle);
  }

  async update(presetKey: string, label: string, command: string): Promise<boolean> {
    await migrateLegacyPresetCommands(this.folder);
    const bundle = await this.loadBundle();
    if (!(presetKey in bundle.commands)) {
      return false;
    }
    if (presetKey !== label) {
      delete bundle.commands[presetKey];
    }
    bundle.commands[label] = command;
    await this.save(bundle);
    return true;
  }

  async remove(presetKey: string): Promise<boolean> {
    await migrateLegacyPresetCommands(this.folder);
    const bundle = await this.loadBundle();
    if (!(presetKey in bundle.commands)) {
      return false;
    }
    delete bundle.commands[presetKey];
    await this.save(bundle);
    return true;
  }

  invalidateCache(): void {
    this.bundle = undefined;
  }

  private async loadBundle(): Promise<PresetCommandFile> {
    if (this.bundle) {
      return this.bundle;
    }
    await ensureWorkspaceDataDir(this.folder);
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PresetCommandFile>;
      this.bundle = {
        version: 1,
        commands:
          parsed.commands && typeof parsed.commands === 'object' && !Array.isArray(parsed.commands)
            ? { ...parsed.commands }
            : {},
      };
    } catch {
      this.bundle = { version: 1, commands: {} };
    }
    return this.bundle;
  }

  private async save(bundle: PresetCommandFile): Promise<void> {
    this.bundle = bundle;
    await fs.writeFile(this.filePath, JSON.stringify(bundle, null, 2), 'utf8');
  }
}
