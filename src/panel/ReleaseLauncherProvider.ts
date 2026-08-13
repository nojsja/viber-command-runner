import * as vscode from 'vscode';
import { getUiLanguage, t } from '../i18n';
import { ReleaseWindowPanel } from './ReleaseWindowPanel';

export class ReleaseLauncherProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'viberCommandRunner.launcher';

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.html = this.renderHtml();

    webviewView.webview.onDidReceiveMessage((message: { type: string }) => {
      if (message.type === 'openPanel') {
        void vscode.commands.executeCommand('viberCommandRunner.openPanel');
      }
      if (message.type === 'reloadPanel') {
        if (!ReleaseWindowPanel.reloadCurrentWebview()) {
          void vscode.window.showInformationMessage(t('launcher.reloadNoPanel'));
        }
      }
    });
  }

  private renderHtml(): string {
    const locale = getUiLanguage();
    const htmlLang = locale === 'zh' ? 'zh-CN' : 'en';
    const description = t('launcher.description');
    const openLabel = t('launcher.open');
    const reloadTitle = t('launcher.reloadTitle');

    return `<!DOCTYPE html>
<html lang="${htmlLang}">
<head>
  <meta charset="UTF-8" />
  <style>
    body {
      margin: 0;
      padding: 16px 14px;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: transparent;
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
  </style>
</head>
<body>
  <h2>Viber Command Runner</h2>
  <p>${escapeHtml(description)}</p>
  <div class="actions">
    <button id="open">${escapeHtml(openLabel)}</button>
    <button id="reload" title="${escapeHtml(reloadTitle)}" aria-label="${escapeHtml(reloadTitle)}">
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="currentColor">
        <path d="M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.516l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.002 7.002 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834ZM8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-1.492.149A5.48 5.48 0 0 0 8 2.5Z"></path>
      </svg>
    </button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('open').addEventListener('click', () => {
      vscode.postMessage({ type: 'openPanel' });
    });
    document.getElementById('reload').addEventListener('click', () => {
      vscode.postMessage({ type: 'reloadPanel' });
    });
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
