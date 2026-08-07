import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  OperatorProfile,
  ReleaseHistoryBundle,
  ReleaseRecord,
} from '../types';
import { ensureWorkspaceDataDir, getWorkspaceDataDir } from './userDataPaths';

const BUNDLE_VERSION = 1 as const;
const MAX_RECORDS = 100;

export class ReleaseHistoryStore {
  private bundle: ReleaseHistoryBundle | undefined;

  constructor(private readonly folder: vscode.WorkspaceFolder) {}

  get dataDir(): string {
    return getWorkspaceDataDir(this.folder);
  }

  get localFilePath(): string {
    return path.join(this.dataDir, 'history.json');
  }

  private async prepareDataDir(): Promise<string> {
    return ensureWorkspaceDataDir(this.folder);
  }

  async load(): Promise<ReleaseHistoryBundle> {
    if (this.bundle) {
      return this.bundle;
    }
    await this.prepareDataDir();
    try {
      const raw = await fs.readFile(this.localFilePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<ReleaseHistoryBundle>;
      const beforeCount = Array.isArray(parsed.records) ? parsed.records.length : 0;
      this.bundle = normalizeBundle(parsed);
      if (beforeCount > MAX_RECORDS) {
        await fs.writeFile(this.localFilePath, JSON.stringify(this.bundle, null, 2), 'utf8');
      }
    } catch {
      this.bundle = emptyBundle();
    }
    return this.bundle;
  }

  async save(bundle: ReleaseHistoryBundle): Promise<void> {
    this.bundle = normalizeBundle(bundle);
    await this.prepareDataDir();
    await fs.writeFile(this.localFilePath, JSON.stringify(this.bundle, null, 2), 'utf8');
  }

  async upsertRecord(record: ReleaseRecord): Promise<ReleaseHistoryBundle> {
    const bundle = await this.load();
    const index = bundle.records.findIndex((item) => item.id === record.id);
    if (index >= 0) {
      bundle.records[index] = record;
    } else {
      bundle.records.unshift(record);
    }
    bundle.records = bundle.records
      .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
      .slice(0, MAX_RECORDS);
    bundle.updatedAt = new Date().toISOString();
    await this.save(bundle);
    return bundle;
  }

  async touchOperator(profile: OperatorProfile): Promise<ReleaseHistoryBundle> {
    const bundle = await this.load();
    const index = bundle.operators.findIndex((item) => item.id === profile.id);
    if (index >= 0) {
      bundle.operators[index] = { ...bundle.operators[index], ...profile };
    } else {
      bundle.operators.unshift(profile);
    }
    bundle.operators = bundle.operators
      .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt))
      .slice(0, 100);
    bundle.updatedAt = new Date().toISOString();
    await this.save(bundle);
    return bundle;
  }

  mergeRemote(remote: ReleaseHistoryBundle): ReleaseHistoryBundle {
    const local = this.bundle ?? emptyBundle();
    const mergedRecords = mergeRecords(local.records, remote.records);
    const mergedOperators = mergeOperators(local.operators, remote.operators);
    const merged: ReleaseHistoryBundle = {
      version: BUNDLE_VERSION,
      updatedAt: new Date().toISOString(),
      records: mergedRecords,
      operators: mergedOperators,
    };
    this.bundle = merged;
    return merged;
  }

  createRecordId(): string {
    return crypto.randomUUID();
  }

  async reconcileStaleRunningRecords(activeRecordId?: string): Promise<boolean> {
    const bundle = await this.load();
    let changed = false;
    const now = new Date().toISOString();
    for (const record of bundle.records) {
      if (record.status !== 'running') {
        continue;
      }
      if (activeRecordId && record.id === activeRecordId) {
        continue;
      }
      record.status = 'cancelled';
      record.finishedAt = record.finishedAt ?? now;
      record.exitCode = record.exitCode ?? 130;
      changed = true;
    }
    if (changed) {
      bundle.updatedAt = now;
      await this.save(bundle);
    }
    return changed;
  }
}

function emptyBundle(): ReleaseHistoryBundle {
  return {
    version: BUNDLE_VERSION,
    updatedAt: new Date().toISOString(),
    records: [],
    operators: [],
  };
}

function normalizeBundle(input: Partial<ReleaseHistoryBundle>): ReleaseHistoryBundle {
  const records = Array.isArray(input.records) ? input.records : [];
  return {
    version: BUNDLE_VERSION,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
    records: records
      .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
      .slice(0, MAX_RECORDS),
    operators: Array.isArray(input.operators) ? input.operators : [],
  };
}

function mergeRecords(local: ReleaseRecord[], remote: ReleaseRecord[]): ReleaseRecord[] {
  const map = new Map<string, ReleaseRecord>();
  for (const record of [...local, ...remote]) {
    const existing = map.get(record.id);
    if (!existing) {
      map.set(record.id, record);
      continue;
    }
    const existingTime = Date.parse(existing.finishedAt ?? existing.startedAt);
    const incomingTime = Date.parse(record.finishedAt ?? record.startedAt);
    map.set(record.id, incomingTime >= existingTime ? record : existing);
  }
  return [...map.values()]
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, MAX_RECORDS);
}

function mergeOperators(local: OperatorProfile[], remote: OperatorProfile[]): OperatorProfile[] {
  const map = new Map<string, OperatorProfile>();
  for (const profile of [...local, ...remote]) {
    const existing = map.get(profile.id);
    if (!existing) {
      map.set(profile.id, profile);
      continue;
    }
    map.set(profile.id, Date.parse(profile.lastSeenAt) >= Date.parse(existing.lastSeenAt) ? profile : existing);
  }
  return [...map.values()]
    .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt))
    .slice(0, 100);
}

export function buildOperatorProfile(name: string, email?: string): OperatorProfile {
  const id = crypto.createHash('sha1').update(`${name}|${email ?? ''}`).digest('hex').slice(0, 16);
  return {
    id,
    name,
    email,
    machine: os.hostname(),
    lastSeenAt: new Date().toISOString(),
  };
}
