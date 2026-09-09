import * as vscode from 'vscode';
import { getUiLanguage, t } from '../i18n';
import {
  downloadAndInstallExtension,
  getMarketplaceExtensionDetails,
  type MarketplaceExtension,
  type MarketplaceExtensionDetails,
} from '../services/marketplaceService';

type PreviewMessage =
  | { type: 'installExtension' }
  | { type: 'openExternal'; url: string };

export class ExtensionPreviewPanel {
  public static readonly viewType = 'viberWorkbench.extensionPreview';

  private static current: ExtensionPreviewPanel | undefined;

  private disposables: vscode.Disposable[] = [];
  private extension: MarketplaceExtension;
  private details: MarketplaceExtensionDetails | undefined;
  private installing = false;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    extension: MarketplaceExtension,
    private launcherWebview?: vscode.Webview,
  ) {
    this.extension = extension;
    this.panel.webview.options = { enableScripts: true };
    this.panel.webview.html = this.renderHtml();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (message: PreviewMessage) => void this.handleMessage(message),
      null,
      this.disposables,
    );
    void this.loadDetails();
  }

  public static createOrShow(
    context: vscode.ExtensionContext,
    extension: MarketplaceExtension,
    launcherWebview?: vscode.Webview,
  ): void {
    if (ExtensionPreviewPanel.current) {
      ExtensionPreviewPanel.current.launcherWebview = launcherWebview;
      ExtensionPreviewPanel.current.panel.reveal(vscode.ViewColumn.Beside, false);
      ExtensionPreviewPanel.current.setExtension(extension);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      ExtensionPreviewPanel.viewType,
      extension.displayName,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    ExtensionPreviewPanel.current = new ExtensionPreviewPanel(panel, context, extension, launcherWebview);
  }

  public static notifyInstallState(id: string, status: 'installing' | 'installed' | 'error'): void {
    const current = ExtensionPreviewPanel.current;
    if (!current || current.extension.id !== id) {
      return;
    }
    current.installing = status === 'installing';
    if (status === 'installed') {
      current.extension.installed = true;
      current.extension.installedVersion = current.extension.version;
      if (current.details) {
        current.details.installed = true;
        current.details.installedVersion = current.details.version;
      }
    }
    current.panel.webview.postMessage({ type: 'storeInstallState', id, status });
  }

  private setExtension(extension: MarketplaceExtension): void {
    this.extension = extension;
    this.details = undefined;
    this.installing = false;
    this.panel.title = extension.displayName;
    this.panel.webview.html = this.renderHtml();
    void this.loadDetails();
  }

  private async loadDetails(): Promise<void> {
    const requestedId = this.extension.id;
    try {
      const details = await getMarketplaceExtensionDetails(this.extension.publisher, this.extension.name);
      if (this.extension.id !== requestedId) {
        return;
      }
      this.details = details;
      this.extension = details;
      this.panel.title = details.displayName;
      this.panel.webview.postMessage({ type: 'storePreviewResult', payload: details });
    } catch (error) {
      if (this.extension.id !== requestedId) {
        return;
      }
      this.panel.webview.postMessage({
        type: 'storePreviewError',
        message: t('store.previewFailed', { message: errorMessage(error) }),
      });
    }
  }

  private async handleMessage(message: PreviewMessage): Promise<void> {
    if (message.type === 'openExternal') {
      void vscode.env.openExternal(vscode.Uri.parse(message.url));
      return;
    }
    if (message.type === 'installExtension') {
      await this.handleInstall();
    }
  }

  private async handleInstall(): Promise<void> {
    const extension = this.details ?? this.extension;
    this.notifyBoth(extension.id, 'installing');
    try {
      await downloadAndInstallExtension(this.context, extension);
      this.notifyBoth(extension.id, 'installed');
      const reload = t('store.reload');
      const choice = await vscode.window.showInformationMessage(
        t('store.installSuccess', { name: extension.displayName }),
        reload,
      );
      if (choice === reload) {
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
      }
    } catch (error) {
      this.notifyBoth(extension.id, 'error');
      void vscode.window.showErrorMessage(
        t('store.installFailed', { name: extension.displayName, message: errorMessage(error) }),
      );
    }
  }

  private notifyBoth(id: string, status: 'installing' | 'installed' | 'error'): void {
    this.installing = status === 'installing';
    if (status === 'installed') {
      this.extension.installed = true;
      this.extension.installedVersion = this.extension.version;
      if (this.details) {
        this.details.installed = true;
        this.details.installedVersion = this.details.version;
      }
    }
    this.panel.webview.postMessage({ type: 'storeInstallState', id, status });
    this.launcherWebview?.postMessage({ type: 'storeInstallState', id, status });
  }

  private renderHtml(): string {
    const locale = getUiLanguage();
    const htmlLang = locale === 'zh' ? 'zh-CN' : 'en';
    const labels = {
      preview: t('store.preview'),
      install: t('store.install'),
      update: t('store.update'),
      installed: t('store.installed'),
      installing: t('store.installing'),
      openMarketplace: t('store.openMarketplace'),
      previewLoading: t('store.previewLoading'),
      noReadme: t('store.noReadme'),
      extensionId: t('store.extensionId'),
      installs: t('store.installs', { count: '{count}' }),
    };
    const item = this.extension;
    const marketplaceUrl = `https://marketplace.visualstudio.com/items?itemName=${encodeURIComponent(item.id)}`;

    return `<!DOCTYPE html>
<html lang="${htmlLang}">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <style>
    html, body {
      height: 100%;
      margin: 0;
    }
    body {
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }
    .header {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      padding: 20px 24px 16px;
      border-bottom: 1px solid var(--vscode-widget-border, rgba(127, 127, 127, 0.28));
      flex: 0 0 auto;
    }
    .icon {
      width: 64px;
      height: 64px;
      border-radius: 12px;
      background: rgba(127, 127, 127, 0.18);
      object-fit: cover;
      flex: 0 0 64px;
    }
    .icon.placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      color: var(--vscode-descriptionForeground);
    }
    .meta {
      min-width: 0;
      flex: 1 1 auto;
    }
    h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      line-height: 1.3;
      word-break: break-word;
    }
    .sub {
      margin-top: 6px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      line-height: 1.45;
      word-break: break-word;
      white-space: pre-line;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }
    button {
      border: none;
      border-radius: 6px;
      font: inherit;
      cursor: pointer;
      padding: 6px 14px;
      font-size: 12px;
    }
    button:disabled {
      cursor: default;
      opacity: 0.65;
    }
    .primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .secondary {
      background: var(--vscode-button-secondaryBackground, rgba(127, 127, 127, 0.18));
      color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    }
    .body {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      padding: 20px 24px 32px;
      font-size: 13px;
      line-height: 1.65;
      word-break: break-word;
    }
    .body.plain {
      white-space: pre-wrap;
    }
    .body.loading,
    .body.muted {
      color: var(--vscode-descriptionForeground);
    }
    .body.error {
      color: var(--vscode-errorForeground);
    }
    .markdown h1,
    .markdown h2,
    .markdown h3,
    .markdown h4,
    .markdown h5,
    .markdown h6 {
      margin: 1.2em 0 0.5em;
      font-weight: 600;
      line-height: 1.3;
    }
    .markdown h1 { font-size: 1.6em; border-bottom: 1px solid var(--vscode-widget-border, rgba(127,127,127,0.28)); padding-bottom: 0.3em; }
    .markdown h2 { font-size: 1.35em; border-bottom: 1px solid var(--vscode-widget-border, rgba(127,127,127,0.28)); padding-bottom: 0.25em; }
    .markdown h3 { font-size: 1.15em; }
    .markdown p { margin: 0 0 0.9em; }
    .markdown ul, .markdown ol { margin: 0 0 0.9em; padding-left: 1.6em; }
    .markdown li { margin: 0.2em 0; }
    .markdown a { color: var(--vscode-textLink-foreground); }
    .markdown img { max-width: 100%; height: auto; border-radius: 6px; }
    .markdown pre {
      overflow-x: auto;
      padding: 12px;
      border-radius: 8px;
      background: var(--vscode-textCodeBlock-background, rgba(127,127,127,0.12));
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
      line-height: 1.5;
    }
    .markdown code {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.92em;
      background: var(--vscode-textCodeBlock-background, rgba(127,127,127,0.12));
      padding: 0.1em 0.35em;
      border-radius: 4px;
    }
    .markdown pre code {
      background: transparent;
      padding: 0;
    }
    .markdown blockquote {
      margin: 0 0 0.9em;
      padding: 0 0 0 12px;
      border-left: 3px solid var(--vscode-widget-border, rgba(127,127,127,0.45));
      color: var(--vscode-descriptionForeground);
    }
    .markdown table {
      border-collapse: collapse;
      margin: 0 0 1em;
      width: 100%;
    }
    .markdown th, .markdown td {
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,0.35));
      padding: 6px 10px;
      text-align: left;
    }
    .markdown hr {
      border: none;
      border-top: 1px solid var(--vscode-widget-border, rgba(127,127,127,0.28));
      margin: 1.4em 0;
    }
  </style>
</head>
<body>
  <header class="header">
    <div id="iconWrap"></div>
    <div class="meta">
      <h1 id="title">${escapeHtml(item.displayName)}</h1>
      <div id="sub" class="sub">${escapeHtml(item.publisher)} · v${escapeHtml(item.version)}</div>
      <div class="actions">
        <button id="install" class="primary" type="button">${escapeHtml(labels.install)}</button>
        <button id="marketplace" class="secondary" type="button">${escapeHtml(labels.openMarketplace)}</button>
      </div>
    </div>
  </header>
  <div id="body" class="body plain loading">${escapeHtml(labels.previewLoading)}</div>
  <script>
    const vscode = acquireVsCodeApi();
    const labels = ${JSON.stringify(labels)};
    const state = {
      item: ${JSON.stringify(item)},
      marketplaceUrl: ${JSON.stringify(marketplaceUrl)},
      installing: ${this.installing ? 'true' : 'false'},
    };

    const iconWrapEl = document.getElementById('iconWrap');
    const titleEl = document.getElementById('title');
    const subEl = document.getElementById('sub');
    const bodyEl = document.getElementById('body');
    const installEl = document.getElementById('install');
    const marketplaceEl = document.getElementById('marketplace');

    renderIcon(state.item);
    updateInstallButton(state.item);

    marketplaceEl.addEventListener('click', () => {
      if (state.marketplaceUrl) {
        vscode.postMessage({ type: 'openExternal', url: state.marketplaceUrl });
      }
    });
    installEl.addEventListener('click', () => {
      vscode.postMessage({ type: 'installExtension' });
    });
    bodyEl.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target.closest('a') : null;
      if (!target || !target.href) {
        return;
      }
      event.preventDefault();
      vscode.postMessage({ type: 'openExternal', url: target.href });
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'storePreviewResult') {
        state.item = message.payload;
        state.marketplaceUrl = message.payload.marketplaceUrl || state.marketplaceUrl;
        titleEl.textContent = message.payload.displayName;
        renderIcon(message.payload);
        const publisherLabel = message.payload.publisherDisplayName || message.payload.publisher;
        const count = typeof message.payload.installCount === 'number'
          ? ' · ' + labels.installs.replace('{count}', formatCount(message.payload.installCount))
          : '';
        subEl.textContent = publisherLabel + ' · v' + message.payload.version + count + '\\n' + labels.extensionId + ': ' + message.payload.id;
        if (message.payload.readmeHtml) {
          bodyEl.className = 'body markdown';
          bodyEl.innerHTML = message.payload.readmeHtml;
        } else {
          bodyEl.className = 'body plain';
          bodyEl.textContent = message.payload.readme || message.payload.description || labels.noReadme;
        }
        updateInstallButton(message.payload);
        return;
      }
      if (message.type === 'storePreviewError') {
        bodyEl.className = 'body plain error';
        bodyEl.textContent = message.message;
        return;
      }
      if (message.type === 'storeInstallState') {
        state.installing = message.status === 'installing';
        if (message.status === 'installed' && state.item.id === message.id) {
          state.item.installed = true;
          state.item.installedVersion = state.item.version;
        }
        updateInstallButton(state.item);
      }
    });

    function renderIcon(item) {
      iconWrapEl.replaceChildren();
      if (item.iconUrl) {
        const img = document.createElement('img');
        img.className = 'icon';
        img.alt = '';
        img.src = item.iconUrl;
        img.addEventListener('error', () => img.replaceWith(placeholderIcon(item.displayName)));
        iconWrapEl.appendChild(img);
        return;
      }
      iconWrapEl.appendChild(placeholderIcon(item.displayName));
    }

    function placeholderIcon(label) {
      const el = document.createElement('div');
      el.className = 'icon placeholder';
      el.textContent = (label || '?').slice(0, 1).toUpperCase();
      return el;
    }

    function updateInstallButton(item) {
      const sameVersion = item.installed && item.installedVersion === item.version;
      installEl.className = 'primary';
      installEl.disabled = false;
      if (state.installing) {
        installEl.disabled = true;
        installEl.textContent = labels.installing;
        return;
      }
      if (sameVersion) {
        installEl.disabled = true;
        installEl.className = 'secondary';
        installEl.textContent = labels.installed;
        return;
      }
      installEl.textContent = item.installed ? labels.update : labels.install;
    }

    function formatCount(value) {
      if (value >= 1000000) {
        return (value / 1000000).toFixed(1).replace(/\\.0$/, '') + 'M';
      }
      if (value >= 1000) {
        return (value / 1000).toFixed(1).replace(/\\.0$/, '') + 'K';
      }
      return String(value);
    }
  </script>
</body>
</html>`;
  }

  private dispose(): void {
    ExtensionPreviewPanel.current = undefined;
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
