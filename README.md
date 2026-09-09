# Viber Workbench

VS Code / Cursor extension for running workspace build and script commands from a dedicated workbench panel.

## Features

- Read commands from `command-runner.commands` or workbench-managed preset commands
- Open the **workbench** in a full editor tab (not a narrow sidebar)
- Command: `Viber Workbench: Open Command Panel`
- Local run history: time, branch, platform, operator, version
- Pluggable remote sync for run history (pull on panel open, push after each run)
- Custom commands, instant commands, embedded terminal, and interactive prompts
- Parallel mode with per-command terminals
- VS Code Marketplace browser with one-click VSIX install for Cursor

## Development

```bash
npm install
cd webview && npm install && cd ..
npm run compile
```

Press `F5` in VS Code / Cursor to launch the **Extension Development Host**, open a workspace, and click the **Workbench** activity bar icon.

```bash
npm run watch          # extension TypeScript
npm run watch:webview  # webview UI
```

## Package VSIX

```bash
npm run package
```

This generates `viber-workbench-<version>.vsix` in the project root (version comes from `package.json`).

### Local install

```bash
code --install-extension viber-workbench-0.3.0.vsix
# or
cursor --install-extension viber-workbench-0.3.0.vsix
```

## Publish to VS Code Marketplace

Publishing uses [`@vscode/vsce`](https://github.com/microsoft/vscode-vsce). The `code` / `cursor` CLI can only install VSIX locally; upload to the Marketplace must go through `vsce`.

### 1. Create a Personal Access Token

1. Open Azure DevOps Personal Access Tokens:  
   https://dev.azure.com/{your-org}/_usersSettings/tokens  
   (Or go to https://dev.azure.com/ → profile menu → **Personal access tokens** → **+ New Token**)
2. Set **Organization** to **All accessible organizations**
3. Under **Scopes**, choose **Custom defined** → **Show all scopes** → **Marketplace → Manage**
4. Create the token and copy it

Docs:

- https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token
- https://marketplace.visualstudio.com/manage/publishers/

### 2. Authenticate

Either log in once (stores the token for the publisher):

```bash
npx @vscode/vsce login nojsja
```

Or pass the token per command:

```bash
export VSCE_PAT=your_personal_access_token
```

### 3. Publish an existing VSIX

After `npm run package`:

```bash
npx @vscode/vsce publish --packagePath viber-workbench-0.3.0.vsix
```

Replace the filename with the version you just built.

### 4. Publish directly from source (optional)

Packages and publishes in one step (can bump version with `vsce publish patch|minor|major`):

```bash
npx @vscode/vsce publish
```

### After publish

- Extension page: https://marketplace.visualstudio.com/items?itemName=nojsja.viber-workbench
- Publisher hub: https://marketplace.visualstudio.com/manage/publishers/nojsja/extensions/viber-workbench/hub

## Configuration

```json
{
  "viberWorkbench.uiLanguage": "en"
}
```

Operator (optional):

```json
{
  "viberWorkbench.operator": "Johnson"
}
```

Legacy settings under `viberCommandRunner.*` are still read as fallbacks.

## Remote sync API

Other extensions can register a remote storage provider for run history sync:

```typescript
const workbench = vscode.extensions.getExtension('nojsja.viber-workbench');
const api = await workbench?.activate();

api?.registerRemoteSyncProvider({
  id: 'my-storage',
  isEnabled: () => true,
  async pull(context) {
    // return ReleaseHistoryBundle from remote storage
  },
  async push(context, bundle) {
    // upload bundle to remote storage, return ISO timestamp
    return new Date().toISOString();
  },
});
```

When no provider is registered (or `isEnabled()` returns false), sync is a no-op and records stay local only.

## Local data

Run records are stored under the user home directory (per workspace), not in the repo:

```
~/.viber/workbench/workspaces/<workspace-name-hash>/
  history.json
  custom-commands.json
  ui-state.json
```

Legacy data under `~/.viber/command-runner`, `.goocean/release-panel`, or `.viber/command-runner` in the workspace is migrated on first launch.
