import * as vscode from 'vscode';
import { getUiLanguage, t } from '../i18n';

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
    });
  }

  private renderHtml(): string {
    const locale = getUiLanguage();
    const htmlLang = locale === 'zh' ? 'zh-CN' : 'en';
    const description = t('launcher.description');
    const openLabel = t('launcher.open');

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
    button {
      width: 100%;
      border: none;
      border-radius: 8px;
      padding: 10px 12px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      font: inherit;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <h2>Viber Command Runner</h2>
  <p>${escapeHtml(description)}</p>
  <button id="open">${escapeHtml(openLabel)}</button>
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('open').addEventListener('click', () => {
      vscode.postMessage({ type: 'openPanel' });
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
