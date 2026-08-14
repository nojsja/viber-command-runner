import * as vscode from 'vscode';
import { getUiLanguage, t } from '../i18n';
import {
  downloadAndInstallExtension,
  searchMarketplace,
  type MarketplaceExtension,
} from '../services/marketplaceService';
import { ReleaseWindowPanel } from './ReleaseWindowPanel';

type LauncherMessage =
  | { type: 'openPanel' }
  | { type: 'reloadPanel' }
  | { type: 'searchStore'; query: string; page?: number }
  | { type: 'installExtension'; publisher: string; name: string; version: string; id: string; displayName: string };

export class ReleaseLauncherProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'viberWorkbench.launcher';

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.html = this.renderHtml();

    webviewView.webview.onDidReceiveMessage((message: LauncherMessage) => {
      if (message.type === 'openPanel') {
        void vscode.commands.executeCommand('viberWorkbench.openPanel');
        return;
      }
      if (message.type === 'reloadPanel') {
        if (!ReleaseWindowPanel.reloadCurrentWebview()) {
          void vscode.window.showInformationMessage(t('launcher.reloadNoPanel'));
        }
        return;
      }
      if (message.type === 'searchStore') {
        void this.handleSearch(webviewView.webview, message.query, message.page ?? 1);
        return;
      }
      if (message.type === 'installExtension') {
        void this.handleInstall(webviewView.webview, message);
      }
    });
  }

  private async handleSearch(webview: vscode.Webview, query: string, page: number): Promise<void> {
    try {
      const result = await searchMarketplace(query, page);
      webview.postMessage({ type: 'storeSearchResult', payload: result });
    } catch (error) {
      webview.postMessage({
        type: 'storeSearchError',
        message: t('store.searchFailed', { message: errorMessage(error) }),
      });
    }
  }

  private async handleInstall(
    webview: vscode.Webview,
    extension: Pick<MarketplaceExtension, 'publisher' | 'name' | 'version' | 'id' | 'displayName'>,
  ): Promise<void> {
    webview.postMessage({ type: 'storeInstallState', id: extension.id, status: 'installing' });
    try {
      await downloadAndInstallExtension(this.context, extension);
      webview.postMessage({ type: 'storeInstallState', id: extension.id, status: 'installed' });
      const reload = t('store.reload');
      const choice = await vscode.window.showInformationMessage(
        t('store.installSuccess', { name: extension.displayName }),
        reload,
      );
      if (choice === reload) {
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
      }
    } catch (error) {
      webview.postMessage({ type: 'storeInstallState', id: extension.id, status: 'error' });
      void vscode.window.showErrorMessage(
        t('store.installFailed', { name: extension.displayName, message: errorMessage(error) }),
      );
    }
  }

  private renderHtml(): string {
    const locale = getUiLanguage();
    const htmlLang = locale === 'zh' ? 'zh-CN' : 'en';
    const labels = {
      description: t('launcher.description'),
      open: t('launcher.open'),
      reloadTitle: t('launcher.reloadTitle'),
      storeTitle: t('store.title'),
      storeDescription: t('store.description'),
      searchPlaceholder: t('store.searchPlaceholder'),
      search: t('store.search'),
      popular: t('store.popular'),
      empty: t('store.empty'),
      loading: t('store.loading'),
      install: t('store.install'),
      update: t('store.update'),
      installed: t('store.installed'),
      installing: t('store.installing'),
      loadMore: t('store.loadMore'),
      installs: t('store.installs', { count: '{count}' }),
      toggle: t('store.toggle'),
      toggleHint: t('store.toggleHint'),
    };

    return `<!DOCTYPE html>
<html lang="${htmlLang}">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <style>
    html, body {
      height: 100%;
      overflow: hidden;
    }
    body {
      margin: 0;
      padding: 16px 14px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: transparent;
    }
    .top {
      flex: 0 0 auto;
    }
    h2 {
      margin: 0 0 8px;
      font-size: 13px;
    }
    p {
      margin: 0 0 14px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      line-height: 1.5;
    }
    .actions {
      display: flex;
      gap: 8px;
      align-items: stretch;
    }
    button {
      border: none;
      border-radius: 8px;
      font: inherit;
      cursor: pointer;
    }
    button:disabled {
      cursor: default;
      opacity: 0.65;
    }
    #open {
      flex: 1 1 auto;
      min-width: 0;
      padding: 10px 12px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    #reload {
      flex: 0 0 36px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      background: var(--vscode-button-secondaryBackground, rgba(127, 127, 127, 0.18));
      color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
      opacity: 0.82;
    }
    #reload:hover {
      opacity: 1;
    }
    #reload svg {
      width: 14px;
      height: 14px;
      display: block;
    }
    .store {
      margin-top: 18px;
      padding-top: 16px;
      border-top: 1px solid var(--vscode-widget-border, rgba(127, 127, 127, 0.35));
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .store h3 {
      margin: 0 0 6px;
      font-size: 12px;
      font-weight: 600;
      flex: 0 0 auto;
    }
    .store-desc {
      margin: 0 0 10px;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      line-height: 1.45;
      flex: 0 0 auto;
    }
    .search-row {
      display: flex;
      gap: 6px;
      align-items: stretch;
      margin-bottom: 10px;
      flex: 0 0 auto;
    }
    #query {
      flex: 1 1 auto;
      min-width: 0;
      padding: 6px 8px;
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 6px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font: inherit;
      font-size: 12px;
      outline: none;
    }
    #query:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }
    #search {
      flex: 0 0 auto;
      padding: 6px 10px;
      background: var(--vscode-button-secondaryBackground, rgba(127, 127, 127, 0.18));
      color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
      font-size: 12px;
    }
    .status {
      margin: 0 0 8px;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      flex: 0 0 auto;
    }
    .status.error {
      color: var(--vscode-errorForeground);
    }
    .results-scroll {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      padding-right: 2px;
    }
    .results {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .card {
      display: grid;
      grid-template-columns: 28px 1fr;
      gap: 8px;
      padding: 8px;
      border: 1px solid var(--vscode-widget-border, rgba(127, 127, 127, 0.28));
      border-radius: 8px;
      background: var(--vscode-editorWidget-background, transparent);
    }
    .icon {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      background: rgba(127, 127, 127, 0.18);
      object-fit: cover;
    }
    .icon.placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }
    .meta {
      min-width: 0;
    }
    .name {
      font-size: 12px;
      font-weight: 600;
      line-height: 1.3;
      word-break: break-word;
    }
    .sub {
      margin-top: 2px;
      color: var(--vscode-descriptionForeground);
      font-size: 10px;
      line-height: 1.35;
    }
    .desc {
      margin-top: 4px;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .card-actions {
      grid-column: 1 / -1;
      display: flex;
      justify-content: flex-end;
    }
    .install {
      padding: 4px 10px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      font-size: 11px;
      border-radius: 6px;
    }
    .install.secondary {
      background: var(--vscode-button-secondaryBackground, rgba(127, 127, 127, 0.18));
      color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    }
    #more {
      width: 100%;
      margin-top: 8px;
      padding: 7px 10px;
      display: none;
      flex: 0 0 auto;
      background: var(--vscode-button-secondaryBackground, rgba(127, 127, 127, 0.18));
      color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
      font-size: 12px;
    }
    #toggleBrowse {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 10px;
      margin-bottom: 8px;
      flex: 0 0 auto;
      background: var(--vscode-button-secondaryBackground, rgba(127, 127, 127, 0.18));
      color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
      font-size: 12px;
      text-align: left;
    }
    #toggleBrowse .chevron {
      width: 12px;
      height: 12px;
      flex: 0 0 12px;
      transition: transform 0.15s ease;
    }
    #toggleBrowse[aria-expanded="true"] .chevron {
      transform: rotate(90deg);
    }
    #browsePanel {
      display: none;
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
    }
    #browsePanel.open {
      display: flex;
      flex-direction: column;
    }
  </style>
</head>
<body>
  <div class="top">
    <h2>Viber Workbench</h2>
    <p>${escapeHtml(labels.description)}</p>
    <div class="actions">
      <button id="open">${escapeHtml(labels.open)}</button>
      <button id="reload" title="${escapeHtml(labels.reloadTitle)}" aria-label="${escapeHtml(labels.reloadTitle)}">
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="currentColor">
          <path d="M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.516l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.002 7.002 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834ZM8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-1.492.149A5.48 5.48 0 0 0 8 2.5Z"></path>
        </svg>
      </button>
    </div>
  </div>
  <section class="store">
    <h3>${escapeHtml(labels.storeTitle)}</h3>
    <p class="store-desc">${escapeHtml(labels.storeDescription)}</p>
    <div class="search-row">
      <input id="query" type="search" placeholder="${escapeHtml(labels.searchPlaceholder)}" />
      <button id="search">${escapeHtml(labels.search)}</button>
    </div>
    <button id="toggleBrowse" type="button" aria-expanded="false" aria-controls="browsePanel" title="${escapeHtml(labels.toggleHint)}">
      <span>${escapeHtml(labels.toggle)}</span>
      <svg class="chevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="currentColor">
        <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"></path>
      </svg>
    </button>
    <div id="browsePanel">
      <p id="status" class="status"></p>
      <div id="resultsScroll" class="results-scroll">
        <div id="results" class="results"></div>
      </div>
      <button id="more">${escapeHtml(labels.loadMore)}</button>
    </div>
  </section>
  <script>
    const vscode = acquireVsCodeApi();
    const labels = ${JSON.stringify(labels)};
    const resultsEl = document.getElementById('results');
    const resultsScrollEl = document.getElementById('resultsScroll');
    const statusEl = document.getElementById('status');
    const queryEl = document.getElementById('query');
    const moreEl = document.getElementById('more');
    const toggleEl = document.getElementById('toggleBrowse');
    const panelEl = document.getElementById('browsePanel');
    const state = { query: '', page: 1, total: 0, items: [], installing: {}, expanded: false, loadedDefault: false };

    document.getElementById('open').addEventListener('click', () => {
      vscode.postMessage({ type: 'openPanel' });
    });
    document.getElementById('reload').addEventListener('click', () => {
      vscode.postMessage({ type: 'reloadPanel' });
    });
    document.getElementById('search').addEventListener('click', () => runSearch());
    queryEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        runSearch();
      }
    });
    moreEl.addEventListener('click', () => search(state.page + 1, false));
    toggleEl.addEventListener('click', () => {
      if (state.expanded) {
        setExpanded(false);
        return;
      }
      setExpanded(true);
      if (!queryEl.value.trim() && !state.loadedDefault) {
        search(1, true);
      }
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'storeSearchResult') {
        const payload = message.payload;
        state.query = payload.query;
        state.page = payload.page;
        state.total = payload.total;
        state.items = payload.page > 1 ? state.items.concat(payload.items) : payload.items;
        renderResults();
        return;
      }
      if (message.type === 'storeSearchError') {
        statusEl.classList.add('error');
        statusEl.textContent = message.message;
        moreEl.style.display = 'none';
        return;
      }
      if (message.type === 'storeInstallState') {
        state.installing[message.id] = message.status;
        if (message.status === 'installed') {
          const item = state.items.find((entry) => entry.id === message.id);
          if (item) {
            item.installed = true;
            item.installedVersion = item.version;
          }
        }
        renderResults();
      }
    });

    function setExpanded(expanded) {
      state.expanded = expanded;
      panelEl.classList.toggle('open', expanded);
      toggleEl.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }

    function runSearch() {
      setExpanded(true);
      search(1, true);
    }

    function search(page, replace) {
      const query = queryEl.value.trim();
      if (!query) {
        state.loadedDefault = true;
      }
      statusEl.classList.remove('error');
      statusEl.textContent = labels.loading;
      if (replace) {
        resultsEl.replaceChildren();
        moreEl.style.display = 'none';
        resultsScrollEl.scrollTop = 0;
      }
      vscode.postMessage({ type: 'searchStore', query, page });
    }

    function renderResults() {
      resultsEl.replaceChildren();
      if (!state.items.length) {
        statusEl.classList.remove('error');
        statusEl.textContent = labels.empty;
        moreEl.style.display = 'none';
        return;
      }
      statusEl.classList.remove('error');
      statusEl.textContent = state.query ? '' : labels.popular;
      for (const item of state.items) {
        resultsEl.appendChild(renderCard(item));
      }
      moreEl.style.display = state.items.length < state.total ? 'block' : 'none';
    }

    function renderCard(item) {
      const card = document.createElement('article');
      card.className = 'card';

      if (item.iconUrl) {
        const img = document.createElement('img');
        img.className = 'icon';
        img.alt = '';
        img.src = item.iconUrl;
        img.addEventListener('error', () => img.replaceWith(placeholderIcon(item.displayName)));
        card.appendChild(img);
      } else {
        card.appendChild(placeholderIcon(item.displayName));
      }

      const meta = document.createElement('div');
      meta.className = 'meta';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = item.displayName;
      const sub = document.createElement('div');
      sub.className = 'sub';
      const count = typeof item.installCount === 'number' ? ' · ' + labels.installs.replace('{count}', formatCount(item.installCount)) : '';
      sub.textContent = item.publisher + ' · v' + item.version + count;
      meta.appendChild(name);
      meta.appendChild(sub);
      if (item.description) {
        const desc = document.createElement('div');
        desc.className = 'desc';
        desc.textContent = item.description;
        meta.appendChild(desc);
      }
      card.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'card-actions';
      const button = document.createElement('button');
      button.className = 'install';
      const installStatus = state.installing[item.id];
      const sameVersion = item.installed && item.installedVersion === item.version;
      if (installStatus === 'installing') {
        button.disabled = true;
        button.textContent = labels.installing;
      } else if (sameVersion || installStatus === 'installed') {
        button.disabled = true;
        button.classList.add('secondary');
        button.textContent = labels.installed;
      } else {
        button.textContent = item.installed ? labels.update : labels.install;
        button.addEventListener('click', () => {
          vscode.postMessage({
            type: 'installExtension',
            publisher: item.publisher,
            name: item.name,
            version: item.version,
            id: item.id,
            displayName: item.displayName,
          });
        });
      }
      actions.appendChild(button);
      card.appendChild(actions);
      return card;
    }

    function placeholderIcon(label) {
      const el = document.createElement('div');
      el.className = 'icon placeholder';
      el.textContent = (label || '?').slice(0, 1).toUpperCase();
      return el;
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
