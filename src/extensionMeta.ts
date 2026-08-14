import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const EXTENSION_ID = 'nojsja.viber-workbench';

let cachedVersion: string | undefined;

export function getExtensionVersion(): string {
  if (cachedVersion) {
    return cachedVersion;
  }

  const fromExtension = vscode.extensions.getExtension(EXTENSION_ID)?.packageJSON?.version;
  if (typeof fromExtension === 'string' && fromExtension) {
    cachedVersion = fromExtension;
    return cachedVersion;
  }

  const packagePath = path.join(__dirname, '..', 'package.json');
  try {
    const raw = fs.readFileSync(packagePath, 'utf8');
    const parsed = JSON.parse(raw) as { version?: string };
    cachedVersion = typeof parsed.version === 'string' ? parsed.version : '0.0.0';
  } catch {
    cachedVersion = '0.0.0';
  }
  return cachedVersion;
}
