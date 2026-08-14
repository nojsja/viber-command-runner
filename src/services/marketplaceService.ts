import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as http from 'node:http';
import * as https from 'node:https';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as vscode from 'vscode';

const execFileAsync = promisify(execFile);

const MARKETPLACE_QUERY_URL = 'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery';
const PAGE_SIZE = 8;

const FLAG_INCLUDE_FILES = 0x2;
const FLAG_INCLUDE_VERSION_PROPERTIES = 0x10;
const FLAG_INCLUDE_ASSET_URI = 0x80;
const FLAG_INCLUDE_STATISTICS = 0x100;
const FLAG_INCLUDE_LATEST_VERSION_ONLY = 0x200;
const QUERY_FLAGS =
  FLAG_INCLUDE_FILES |
  FLAG_INCLUDE_VERSION_PROPERTIES |
  FLAG_INCLUDE_ASSET_URI |
  FLAG_INCLUDE_STATISTICS |
  FLAG_INCLUDE_LATEST_VERSION_ONLY;

const FILTER_TAG = 1;
const FILTER_TARGET = 8;
const FILTER_SEARCH_TEXT = 10;
const FILTER_EXCLUDE_FLAGS = 12;
const EXCLUDE_UNPUBLISHED = '4096';
const SORT_BY_INSTALL_COUNT = 4;
const SORT_BY_RELEVANCE_OR_NONE = 0;
const DEFAULT_BROWSE_TAG = 'ai';

export type MarketplaceExtension = {
  id: string;
  publisher: string;
  name: string;
  displayName: string;
  description: string;
  version: string;
  iconUrl?: string;
  installCount?: number;
  installed: boolean;
  installedVersion?: string;
};

export type MarketplaceSearchResult = {
  query: string;
  page: number;
  pageSize: number;
  total: number;
  items: MarketplaceExtension[];
};

type GalleryFile = {
  assetType?: string;
  source?: string;
};

type GalleryVersion = {
  version?: string;
  files?: GalleryFile[];
  assetUri?: string;
  fallbackAssetUri?: string;
};

type GalleryExtension = {
  extensionName?: string;
  displayName?: string;
  shortDescription?: string;
  publisher?: { publisherName?: string; displayName?: string };
  versions?: GalleryVersion[];
  statistics?: Array<{ statisticName?: string; value?: number }>;
  assetUri?: string;
};

type GalleryQueryResponse = {
  results?: Array<{
    extensions?: GalleryExtension[];
    resultMetadata?: Array<{
      metadataType?: string;
      metadataItems?: Array<{ name?: string; count?: number }>;
    }>;
  }>;
};

export async function searchMarketplace(query: string, page = 1): Promise<MarketplaceSearchResult> {
  const trimmed = query.trim();
  const body = {
    filters: [
      {
        criteria: [
          { filterType: FILTER_TARGET, value: 'Microsoft.VisualStudio.Code' },
          { filterType: FILTER_EXCLUDE_FLAGS, value: EXCLUDE_UNPUBLISHED },
          ...(trimmed
            ? [{ filterType: FILTER_SEARCH_TEXT, value: trimmed }]
            : [{ filterType: FILTER_TAG, value: DEFAULT_BROWSE_TAG }]),
        ],
        pageNumber: page,
        pageSize: PAGE_SIZE,
        sortBy: trimmed ? SORT_BY_RELEVANCE_OR_NONE : SORT_BY_INSTALL_COUNT,
        sortOrder: 0,
      },
    ],
    assetTypes: ['Microsoft.VisualStudio.Services.Icons.Default'],
    flags: QUERY_FLAGS,
  };

  const payload = await postJson<GalleryQueryResponse>(MARKETPLACE_QUERY_URL, body);
  const result = payload.results?.[0];
  const total =
    result?.resultMetadata
      ?.find((item) => item.metadataType === 'ResultCount')
      ?.metadataItems?.find((item) => item.name === 'TotalCount')?.count ?? 0;

  const items = (result?.extensions ?? []).map(toMarketplaceExtension).filter((item): item is MarketplaceExtension => Boolean(item));

  return {
    query: trimmed,
    page,
    pageSize: PAGE_SIZE,
    total,
    items,
  };
}

export async function downloadAndInstallExtension(
  context: vscode.ExtensionContext,
  extension: Pick<MarketplaceExtension, 'publisher' | 'name' | 'version' | 'id'>,
): Promise<void> {
  const vsixDir = path.join(context.globalStorageUri.fsPath, 'vsix');
  await fs.mkdir(vsixDir, { recursive: true });
  const vsixPath = path.join(vsixDir, `${extension.publisher}.${extension.name}-${extension.version}.vsix`);

  const urls = [
    `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${encodeURIComponent(extension.publisher)}/vsextensions/${encodeURIComponent(extension.name)}/${encodeURIComponent(extension.version)}/vspackage`,
    `https://${extension.publisher}.gallery.vsassets.io/_apis/public/gallery/publisher/${encodeURIComponent(extension.publisher)}/extension/${encodeURIComponent(extension.name)}/${encodeURIComponent(extension.version)}/assetbyname/Microsoft.VisualStudio.Services.VSIXPackage`,
  ];

  let lastError: unknown;
  for (const url of urls) {
    try {
      const data = maybeGunzip(await requestBuffer(url));
      if (!isZip(data)) {
        throw new Error('Downloaded file is not a VSIX package');
      }
      await fs.writeFile(vsixPath, data);
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  try {
    await installVsix(vsixPath);
  } finally {
    await fs.unlink(vsixPath).catch(() => undefined);
  }
}

export function getInstalledExtension(id: string): vscode.Extension<unknown> | undefined {
  return vscode.extensions.getExtension(id);
}

function toMarketplaceExtension(raw: GalleryExtension): MarketplaceExtension | undefined {
  const publisher = raw.publisher?.publisherName?.trim();
  const name = raw.extensionName?.trim();
  if (!publisher || !name) {
    return undefined;
  }

  const id = `${publisher}.${name}`;
  const versionInfo = raw.versions?.[0];
  const version = versionInfo?.version?.trim() || '0.0.0';
  const iconFile = versionInfo?.files?.find((file) => file.assetType === 'Microsoft.VisualStudio.Services.Icons.Default');
  const assetBase = versionInfo?.assetUri || versionInfo?.fallbackAssetUri || raw.assetUri;
  const iconUrl = iconFile?.source || (assetBase ? `${assetBase}/Microsoft.VisualStudio.Services.Icons.Default` : undefined);
  const installCount = raw.statistics?.find((item) => item.statisticName === 'install')?.value;
  const installed = getInstalledExtension(id);

  return {
    id,
    publisher,
    name,
    displayName: raw.displayName?.trim() || name,
    description: raw.shortDescription?.trim() || '',
    version,
    iconUrl,
    installCount,
    installed: Boolean(installed),
    installedVersion: typeof installed?.packageJSON?.version === 'string' ? installed.packageJSON.version : undefined,
  };
}

async function installVsix(vsixPath: string): Promise<void> {
  const uri = vscode.Uri.file(vsixPath);
  const attempts: Array<() => Thenable<unknown>> = [
    () => vscode.commands.executeCommand('workbench.extensions.command.installFromVSIX', uri),
    () => vscode.commands.executeCommand('workbench.extensions.command.installFromVSIX', [uri]),
    () => vscode.commands.executeCommand('workbench.extensions.installExtension', uri),
  ];

  for (const attempt of attempts) {
    try {
      await attempt();
      return;
    } catch {
      // Try the next install path (Cursor may not expose every VS Code command).
    }
  }

  const cli = resolveEditorCli();
  if (!cli) {
    throw new Error('Could not install VSIX: no editor CLI found');
  }
  await execFileAsync(cli, ['--install-extension', vsixPath, '--force']);
}

function resolveEditorCli(): string | undefined {
  const appRoot = vscode.env.appRoot;
  const candidates = [
    path.join(appRoot, 'bin', 'cursor'),
    path.join(appRoot, 'bin', 'code'),
    path.join(path.dirname(appRoot), 'bin', 'cursor'),
    path.join(path.dirname(appRoot), 'bin', 'code'),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

function postJson<T>(url: string, body: unknown): Promise<T> {
  return requestBuffer(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json;api-version=7.2-preview.1;excludeUrls=true',
    },
    body: JSON.stringify(body),
  }).then((buffer) => JSON.parse(buffer.toString('utf8')) as T);
}

function requestBuffer(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {},
  redirectCount = 0,
): Promise<Buffer> {
  if (redirectCount > 5) {
    return Promise.reject(new Error('Too many redirects'));
  }

  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'http:' ? http : https;
    const req = client.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port,
        path: `${parsed.pathname}${parsed.search}`,
        method: options.method ?? 'GET',
        headers: {
          'User-Agent': `VSCode/${vscode.version}`,
          'Accept-Encoding': 'gzip',
          ...options.headers,
          ...(options.body ? { 'Content-Length': String(Buffer.byteLength(options.body)) } : {}),
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        if (status >= 300 && status < 400 && location) {
          res.resume();
          const nextUrl = new URL(location, url).toString();
          requestBuffer(nextUrl, { method: 'GET' }, redirectCount + 1).then(resolve, reject);
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk as Buffer));
        res.on('end', () => {
          const raw = Buffer.concat(chunks);
          const encoding = String(res.headers['content-encoding'] ?? '');
          const decoded = encoding.includes('gzip') ? maybeGunzip(raw) : raw;
          if (status < 200 || status >= 300) {
            reject(new Error(`Marketplace request failed (${status}): ${decoded.subarray(0, 200).toString('utf8')}`));
            return;
          }
          resolve(decoded);
        });
      },
    );
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

function maybeGunzip(data: Buffer): Buffer {
  if (data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b) {
    return zlib.gunzipSync(data);
  }
  return data;
}

function isZip(data: Buffer): boolean {
  return data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b;
}
