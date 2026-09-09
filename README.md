# Viber Workbench

VS Code / Cursor extension for running workspace build and script commands from a dedicated workbench panel.

## Install on Cursor

Cursor is based on VS Code and can install extensions published on the **Visual Studio Marketplace**.

### Option 1: Extensions view (recommended)

1. Open Cursor and your project workspace.
2. Open **Extensions** (`Cmd+Shift+X` on macOS, `Ctrl+Shift+X` on Windows/Linux).
3. Search for **`Viber Workbench`** (publisher: **nojsja**).
4. Click **Install**.
5. Reload the window if prompted, then open the **Workbench** icon in the activity bar.

### Option 2: Marketplace page

1. Open the extension page:  
   https://marketplace.visualstudio.com/items?itemName=nojsja.viber-workbench
2. Click **Install** and choose **Open in Cursor** when the browser asks which app to use.  
   If that button is unavailable, copy the extension ID `nojsja.viber-workbench` and search for it inside Cursor Extensions.

### Option 3: Command line (VSIX)

Download a `.vsix` from [Releases](https://github.com/nojsja/viber-workbench/releases) or build locally (`npm run package`), then:

```bash
cursor --install-extension viber-workbench-0.3.0.vsix
```

Replace the filename with your version.

### After install

- Command palette: `Viber Workbench: 打开命令面板`
- First-time setup: run `Viber Workbench: 初始化命令配置` or use **Initialize Command Config** in the sidebar Launcher (see [Quick start](#quick-start)).

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

## Quick start

1. Install the extension and open your project workspace.
2. Click the **Workbench** icon in the activity bar, then **Open Command Panel** (or run `Viber Workbench: 打开命令面板`).
3. Initialize command configuration (recommended for new projects):
   - In the sidebar **Launcher**, click **Initialize Command Config** below **Open Command Panel**, or
   - Run command palette: `Viber Workbench: 初始化命令配置`
4. Edit `.vscode/settings.json` and replace the example commands with your real build / script commands.
5. Refresh the panel if commands do not appear immediately.

## Initialize command configuration

Use this when setting up a workspace for the first time, or when you want a known-good starter template.

### How to run

| Method | Action |
|--------|--------|
| Sidebar Launcher | **Initialize Command Config** button below **Open Command Panel** |
| Command palette | `Viber Workbench: 初始化命令配置` |

### What it creates

Initialization writes (or merges into) **`.vscode/settings.json`** in the workspace. Existing unrelated keys in that file are preserved.

Default template:

```json
{
  "viberWorkbench.commandsSource": "command-runner",
  "viberWorkbench.terminalName": "Viber Workbench",
  "viberWorkbench.uiLanguage": "en",
  "viberWorkbench.shellPath": "",
  "viberWorkbench.operator": "",
  "viberWorkbench.silentNotifications": false,
  "command-runner.commands": {
    "1. Example: List files": "ls",
    "2. Example: Git status": "git status"
  }
}
```

Replace the example entries under `command-runner.commands` with your project scripts. Keys are display labels; values are shell commands.

### Already configured?

If the workspace already has command configuration, initialization shows a confirmation dialog with counts for:

- `command-runner.commands` entries in settings
- Workbench-managed preset commands
- Custom commands

Choose **Reinitialize** to overwrite workspace command settings and clear workbench-managed preset / custom commands. Choose **Cancel** to keep the current setup.

> **Note:** Reinitialize does **not** delete run history (`history.json`).

## Command configuration

Commands shown in the panel come from two possible sources, controlled by `viberWorkbench.commandsSource`.

### Source: `command-runner` (default, team-friendly)

- Commands live in workspace **`.vscode/settings.json`**
- Key: `command-runner.commands`
- Format: `"Label": "shell command"`
- Good for sharing via Git with the rest of the team

```json
{
  "viberWorkbench.commandsSource": "command-runner",
  "command-runner.commands": {
    "1. Build Android Dev": "bash scripts/build-android.sh --dev",
    "2. Build iOS Profile": "bash scripts/build-ios.sh --profile"
  }
}
```

### Source: `viberWorkbench`

- External `command-runner.commands` is ignored
- Preset commands are managed in the panel UI (**Preset Commands** group, `+` button)
- Stored locally per machine/workspace under `~/.viber/workbench/.../preset-commands.json` (not in the repo)

```json
{
  "viberWorkbench.commandsSource": "viberWorkbench"
}
```

### Custom commands

- Added from the panel (**Custom Commands** group)
- Stored in `~/.viber/workbench/workspaces/<hash>/custom-commands.json`
- Per developer / per machine; not meant for team sync via Git

### Command label tips

- Labels can include order prefixes (`1.`, `2.`) for sorting
- Platform keywords in labels/commands (`android`, `ios`, `shorebird`, etc.) help filtering in the panel

## Settings reference

Open VS Code Settings and search **`viber`** or **`viberWorkbench`** to edit extension options.

> Avoid using the old `viberCommandRunner.commands` object in settings — large command maps there can freeze the Settings UI. Use `command-runner.commands` or panel-managed presets instead.

| Setting | Default | Description |
|---------|---------|-------------|
| `viberWorkbench.commandsSource` | `command-runner` | `command-runner` = read `command-runner.commands` from settings; `viberWorkbench` = panel-managed presets only |
| `viberWorkbench.terminalName` | `Viber Workbench` | Name of the external VS Code terminal opened via **External Terminal** |
| `viberWorkbench.shellPath` | `""` | Shell for embedded runner (e.g. `/bin/zsh`). Empty = auto-detect from `$SHELL` |
| `viberWorkbench.operator` | `""` | Operator name in run history. Empty = `git config user.name` or system username |
| `viberWorkbench.uiLanguage` | `en` | Panel UI language: `en` or `zh` |
| `viberWorkbench.silentNotifications` | `false` | Suppress VS Code native toasts/sounds; panel inline toasts still show |

Legacy keys under `viberCommandRunner.*` are still read as fallbacks (except avoid putting large `commands` objects there).

### Example workspace settings

```json
{
  "viberWorkbench.uiLanguage": "zh",
  "viberWorkbench.operator": "Johnson",
  "viberWorkbench.commandsSource": "command-runner",
  "command-runner.commands": {
    "Build": "npm run build",
    "Test": "npm test"
  }
}
```

## Import / export configuration

From the panel header icon group:

| Icon | Action |
|------|--------|
| Refresh | Reload panel state and commands |
| Import | Load a `viber-workbench` JSON bundle (custom commands, presets, UI state, settings) |
| Export | Save current panel configuration to JSON |

Import replaces custom commands, panel UI state, and compatible settings in the current workspace. A confirmation dialog is shown before applying.

## Command palette commands

| Command | Description |
|---------|-------------|
| `Viber Workbench: 打开命令面板` | Open workbench in an editor tab |
| `Viber Workbench: 刷新命令面板` | Refresh the open panel |
| `Viber Workbench: 初始化命令配置` | Initialize / reinitialize command configuration |
| `Viber Workbench: 同步执行记录` | Pull/push run history via registered remote sync provider |

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

Per-workspace files under the user home directory (not committed to the repo):

```
~/.viber/workbench/workspaces/<workspace-name-hash>/
  history.json           # run history records
  custom-commands.json   # panel custom commands
  preset-commands.json   # panel preset commands (when commandsSource = viberWorkbench)
  ui-state.json          # fold state, parallel mode, etc.
```

| Data | Location | Shared via Git? |
|------|----------|-----------------|
| Preset commands (`command-runner` mode) | `.vscode/settings.json` | Yes |
| Preset commands (`viberWorkbench` mode) | `preset-commands.json` | No (local) |
| Custom commands | `custom-commands.json` | No (local) |
| Run history | `history.json` | No (local) |
| Workbench settings | `.vscode/settings.json` | Yes |

Legacy data under `~/.viber/command-runner`, `.goocean/release-panel`, or `.viber/command-runner` in the workspace is migrated on first launch.
