import * as cp from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ReleaseCommandDefinition } from '../types';
import { t } from '../i18n';

export interface RunFinishedResult {
  exitCode: number;
  cancelled: boolean;
}

let cachedShellEnv: NodeJS.ProcessEnv | undefined;

export class ReleaseRunner {
  private activeProc: cp.ChildProcess | undefined;
  private activeRun: { recordId: string } | undefined;
  private cancelRequested = false;
  private terminal: vscode.Terminal | undefined;

  constructor(private readonly folder: vscode.WorkspaceFolder) {}

  isRunning(): boolean {
    return !!this.activeRun;
  }

  getActiveRecordId(): string | undefined {
    return this.activeRun?.recordId;
  }

  writeStdin(text: string): boolean {
    if (!this.activeProc?.stdin?.writable) {
      return false;
    }
    const payload = text.endsWith('\n') ? text : `${text}\n`;
    this.activeProc.stdin.write(payload);
    return true;
  }

  dispose(): void {
    this.cancelRequested = true;
    if (this.activeProc?.pid) {
      killProcessTree(this.activeProc.pid, 'SIGTERM');
    }
    this.activeProc = undefined;
    this.activeRun = undefined;
    this.terminal?.dispose();
    this.terminal = undefined;
  }

  cancel(): boolean {
    if (!this.activeProc?.pid) {
      return false;
    }
    this.cancelRequested = true;
    killProcessTree(this.activeProc.pid, 'SIGTERM');
    setTimeout(() => {
      if (this.activeProc?.pid) {
        killProcessTree(this.activeProc.pid, 'SIGKILL');
      }
    }, 2000);
    return true;
  }

  async runFollowUp(
    command: string,
    recordId: string,
    onOutput: (chunk: string, stream: 'stdout' | 'stderr') => void,
    onFinished: (result: RunFinishedResult) => void,
  ): Promise<RunFinishedResult> {
    return this.spawnCommand(command, recordId, onOutput, onFinished, `$ ${command}\n`);
  }

  async run(
    definition: ReleaseCommandDefinition,
    recordId: string,
    onOutput: (chunk: string, stream: 'stdout' | 'stderr') => void,
    onFinished: (result: RunFinishedResult) => void,
  ): Promise<RunFinishedResult> {
    return this.spawnCommand(
      definition.command,
      recordId,
      onOutput,
      onFinished,
      `▶ ${definition.label}\n$ ${definition.command}\n`,
    );
  }

  private async spawnCommand(
    command: string,
    recordId: string,
    onOutput: (chunk: string, stream: 'stdout' | 'stderr') => void,
    onFinished: (result: RunFinishedResult) => void,
    preamble: string,
  ): Promise<RunFinishedResult> {
    if (this.activeRun) {
      throw new Error(t('runner.taskAlreadyRunning'));
    }

    this.cancelRequested = false;

    onOutput(preamble, 'stdout');

    const shell = resolveShellExecutable();
    const env = await resolveCommandEnvironment();
    const { executable, args } = buildShellInvocation(shell, command);

    return await new Promise((resolve, reject) => {
      const useProcessGroup = process.platform !== 'win32';
      const proc = cp.spawn(executable, args, {
        cwd: this.folder.uri.fsPath,
        env,
        detached: useProcessGroup,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (useProcessGroup && proc.pid) {
        proc.unref();
      }

      this.activeProc = proc;
      this.activeRun = { recordId };

      proc.stdout?.on('data', (buf: Buffer) => {
        onOutput(decodeShellOutput(buf), 'stdout');
      });
      proc.stderr?.on('data', (buf: Buffer) => {
        onOutput(decodeShellOutput(buf), 'stderr');
      });
      proc.on('close', (code, signal) => {
        const exitCode = resolveExitCode(code, signal);
        const cancelled = this.cancelRequested || isCancelledExit(exitCode);
        const result: RunFinishedResult = { exitCode, cancelled };
        onOutput(
          `\n[${cancelled ? 'cancelled' : 'exit'} ${exitCode}]\n`,
          cancelled || exitCode !== 0 ? 'stderr' : 'stdout',
        );
        this.activeProc = undefined;
        this.activeRun = undefined;
        this.cancelRequested = false;
        onFinished(result);
        resolve(result);
      });
      proc.on('error', (error) => {
        onOutput(`\n[error] ${error.message}\n`, 'stderr');
        this.activeProc = undefined;
        this.activeRun = undefined;
        this.cancelRequested = false;
        const result: RunFinishedResult = { exitCode: 1, cancelled: false };
        onFinished(result);
        reject(error);
      });
    });
  }

  openExternalTerminal(): void {
    openExternalTerminalForFolder(this.folder);
  }
}

export function openExternalTerminalForFolder(folder: vscode.WorkspaceFolder): void {
  const terminalName =
    vscode.workspace.getConfiguration('viberCommandRunner', folder.uri).get<string>('terminalName') ??
    'Viber Command Runner';
  const terminal = vscode.window.terminals.find((item) => item.name === terminalName)
    ?? vscode.window.createTerminal({
      name: terminalName,
      cwd: folder.uri.fsPath,
    });
  terminal.show(true);
}

interface ActiveShellRun {
  recordId: string;
  marker: string;
  buffer: string;
  cancelRequested: boolean;
  onFinished: (result: RunFinishedResult) => void;
  resolve: (result: RunFinishedResult) => void;
  reject: (error: Error) => void;
}

/** Persistent interactive shell for the panel terminal (serial mode). */
export class PanelShellSession {
  private proc: cp.ChildProcess | undefined;
  private activeRun: ActiveShellRun | undefined;
  private outputHandler: ((chunk: string, stream: 'stdout' | 'stderr') => void) | undefined;
  private starting: Promise<void> | undefined;

  constructor(private readonly folder: vscode.WorkspaceFolder) {}

  isRunning(): boolean {
    return !!this.activeRun;
  }

  getActiveRecordId(): string | undefined {
    return this.activeRun?.recordId;
  }

  isAlive(): boolean {
    return !!this.proc;
  }

  async ensureStarted(onOutput: (chunk: string, stream: 'stdout' | 'stderr') => void): Promise<void> {
    this.outputHandler = onOutput;
    if (this.proc) {
      return;
    }
    if (this.starting) {
      await this.starting;
      return;
    }
    this.starting = this.startShell();
    try {
      await this.starting;
    } finally {
      this.starting = undefined;
    }
  }

  writeStdin(text: string): boolean {
    if (!this.proc?.stdin?.writable) {
      return false;
    }
    const payload = text.endsWith('\n') ? text : `${text}\n`;
    this.proc.stdin.write(payload);
    return true;
  }

  async run(
    definition: ReleaseCommandDefinition,
    recordId: string,
    onOutput: (chunk: string, stream: 'stdout' | 'stderr') => void,
    onFinished: (result: RunFinishedResult) => void,
  ): Promise<RunFinishedResult> {
    await this.ensureStarted(onOutput);
    if (this.activeRun) {
      throw new Error(t('runner.taskAlreadyRunning'));
    }

    onOutput(`▶ ${definition.label}\n$ ${definition.command}\n`, 'stdout');

    const marker = `__VIBER_EXIT_${recordId}__`;
    const shell = resolveShellExecutable();
    const script = buildTrackedCommandScript(definition.command, marker, shell);

    return await new Promise((resolve, reject) => {
      this.activeRun = {
        recordId,
        marker,
        buffer: '',
        cancelRequested: false,
        onFinished,
        resolve,
        reject,
      };
      if (!this.writeStdin(script)) {
        this.activeRun = undefined;
        reject(new Error(t('runner.shellNotReady')));
        return;
      }
    });
  }

  cancel(): boolean {
    if (!this.proc) {
      return false;
    }
    const active = this.activeRun;
    if (active) {
      active.cancelRequested = true;
    }
    this.writeStdin('\x03');
    if (active) {
      // Ctrl+C may stop the command before the tracked exit marker is printed.
      this.finishActiveRun(130, true);
    }
    return true;
  }

  dispose(): void {
    if (this.proc?.pid) {
      killProcessTree(this.proc.pid, 'SIGTERM');
    }
    this.proc = undefined;
    this.activeRun = undefined;
    this.outputHandler = undefined;
  }

  private recoverBrokenShellPrompt(chunk: string): void {
    if (!this.activeRun) {
      return;
    }
    if (!/\bdquote>|\bquote>/.test(chunk)) {
      return;
    }
    this.writeStdin('\x03\n');
    this.finishActiveRun(1, false);
  }

  private async startShell(): Promise<void> {
    const shell = resolveShellExecutable();
    const env = await resolveCommandEnvironment();
    const invocation = buildInteractiveShellInvocation(shell);
    const useProcessGroup = process.platform !== 'win32';

    const proc = cp.spawn(invocation.executable, invocation.args, {
      cwd: this.folder.uri.fsPath,
      env,
      detached: useProcessGroup,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (useProcessGroup && proc.pid) {
      proc.unref();
    }

    this.proc = proc;
    proc.stdout?.on('data', (buf: Buffer) => {
      this.handleOutput(decodeShellOutput(buf), 'stdout');
    });
    proc.stderr?.on('data', (buf: Buffer) => {
      this.handleOutput(decodeShellOutput(buf), 'stderr');
    });
    proc.on('close', (code, signal) => {
      this.proc = undefined;
      this.finishActiveRun(resolveExitCode(code, signal), true);
    });
    proc.on('error', (error) => {
      this.outputHandler?.(`\n[error] ${error.message}\n`, 'stderr');
      this.proc = undefined;
      this.finishActiveRun(1, false);
    });
  }

  private handleOutput(chunk: string, stream: 'stdout' | 'stderr'): void {
    this.outputHandler?.(chunk, stream);
    this.recoverBrokenShellPrompt(chunk);
    if (!this.activeRun) {
      return;
    }

    this.activeRun.buffer += chunk;
    const escaped = this.activeRun.marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`${escaped}(\\d+)__`);
    const match = pattern.exec(this.activeRun.buffer);
    if (!match) {
      return;
    }

    const exitCode = Number.parseInt(match[1], 10);
    const cancelled = this.activeRun.cancelRequested;
    const result: RunFinishedResult = {
      exitCode: cancelled ? 130 : exitCode,
      cancelled,
    };
    const run = this.activeRun;
    this.activeRun = undefined;
    this.outputHandler?.(
      `\n[${cancelled ? 'cancelled' : 'exit'} ${result.exitCode}]\n`,
      cancelled || result.exitCode !== 0 ? 'stderr' : 'stdout',
    );
    run.onFinished(result);
    run.resolve(result);
  }

  private finishActiveRun(exitCode: number, cancelled: boolean): void {
    if (!this.activeRun) {
      return;
    }
    const run = this.activeRun;
    this.activeRun = undefined;
    const result: RunFinishedResult = {
      exitCode: run.cancelRequested ? 130 : exitCode,
      cancelled: run.cancelRequested || cancelled,
    };
    this.outputHandler?.(
      `\n[${result.cancelled ? 'cancelled' : 'exit'} ${result.exitCode}]\n`,
      result.cancelled || result.exitCode !== 0 ? 'stderr' : 'stdout',
    );
    run.onFinished(result);
    run.resolve(result);
  }
}

interface ShellInvocation {
  executable: string;
  args: string[];
}

function buildShellInvocation(shell: string, command: string): ShellInvocation {
  if (process.platform !== 'win32') {
    const wrapped = ['set +e', command, 'ec=$?', 'exit $ec'].join('\n');
    return { executable: shell, args: ['-ilc', wrapped] };
  }

  const shellBase = path.basename(shell).toLowerCase();
  if (shellBase === 'cmd.exe' || shellBase === 'cmd') {
    // cmd.exe uses /c (not bash -ilc). Without /c it stays interactive and never exits.
    return { executable: shell, args: ['/d', '/s', '/c', `chcp 65001>nul & ${command}`] };
  }

  if (shellBase.includes('powershell') || shellBase === 'pwsh.exe') {
    return { executable: shell, args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command] };
  }

  if (shellBase.includes('bash') || shellBase === 'sh.exe') {
    const wrapped = ['set +e', command, 'ec=$?', 'exit $ec'].join('\n');
    return { executable: shell, args: ['-lc', wrapped] };
  }

  return { executable: shell, args: ['/d', '/s', '/c', command] };
}

function buildInteractiveShellInvocation(shell: string): ShellInvocation {
  const shellBase = path.basename(shell).toLowerCase();
  if (process.platform !== 'win32') {
    return { executable: shell, args: ['-il'] };
  }

  if (shellBase === 'cmd.exe' || shellBase === 'cmd') {
    return { executable: shell, args: ['/V:ON', '/Q', '/K', 'chcp 65001>nul'] };
  }

  if (shellBase.includes('powershell') || shellBase === 'pwsh.exe') {
    return { executable: shell, args: ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass'] };
  }

  if (shellBase.includes('bash') || shellBase === 'sh.exe') {
    return { executable: shell, args: ['-il'] };
  }

  return { executable: shell, args: ['/V:ON', '/Q', '/K'] };
}

function buildTrackedCommandScript(command: string, marker: string, shell: string): string {
  const quotedMarker = marker.replace(/'/g, `'\"'\"'`);
  if (process.platform !== 'win32') {
    const shellBase = path.basename(shell).toLowerCase();
    // Single-line scripts avoid interactive zsh/bash entering continuation prompts (dquote>).
    if (shellBase.includes('zsh')) {
      return `${command}; builtin print -r -- '${quotedMarker}'$?'\''__'\''\n`;
    }
    return `${command}; command printf '%s\\n' '${quotedMarker}'$?'\''__'\''\n`;
  }

  const shellBase = path.basename(shell).toLowerCase();
  if (shellBase.includes('powershell') || shellBase === 'pwsh.exe') {
    return `${command}; Write-Host '${quotedMarker}'$LASTEXITCODE'__'\n`;
  }

  return `${command} & echo ${quotedMarker}!ERRORLEVEL!__\r\n`;
}

function decodeShellOutput(buf: Buffer): string {
  if (process.platform !== 'win32') {
    return buf.toString('utf8');
  }

  const utf8 = buf.toString('utf8');
  if (!utf8.includes('\uFFFD')) {
    return utf8;
  }

  try {
    const decoder = new TextDecoder('gbk');
    return decoder.decode(buf);
  } catch {
    return utf8;
  }
}

function resolveExitCode(code: number | null, signal: NodeJS.Signals | null): number {
  if (code !== null) {
    return code;
  }
  if (!signal) {
    return 1;
  }
  const signalCodes: Record<string, number> = {
    SIGINT: 130,
    SIGTERM: 143,
    SIGKILL: 137,
  };
  return signalCodes[signal] ?? 1;
}

function isCancelledExit(exitCode: number): boolean {
  return exitCode === 130 || exitCode === 143 || exitCode === 137;
}

function killProcessTree(pid: number, signal: NodeJS.Signals): void {
  if (process.platform === 'win32') {
    cp.exec(`taskkill /PID ${pid} /T /F`, () => undefined);
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // Process may already be gone.
    }
  }
}

export async function readGitBranch(folder: vscode.WorkspaceFolder): Promise<string> {
  return await new Promise((resolve) => {
    cp.exec('git rev-parse --abbrev-ref HEAD', { cwd: folder.uri.fsPath }, (error, stdout) => {
      resolve(error ? 'unknown' : stdout.trim() || 'unknown');
    });
  });
}

export async function readPubspecVersion(folder: vscode.WorkspaceFolder): Promise<{ version?: string; build?: string }> {
  try {
    const pubspecPath = path.join(folder.uri.fsPath, 'pubspec.yaml');
    const content = await fs.readFile(pubspecPath, 'utf8');
    const match = content.match(/^version:\s*(.+)$/m);
    if (!match) {
      return {};
    }
    const raw = match[1].trim();
    const [version, build] = raw.split('+');
    return { version, build };
  } catch {
    return {};
  }
}

export async function resolveOperator(
  folder: vscode.WorkspaceFolder,
  secrets: vscode.SecretStorage,
): Promise<{ name: string; email?: string }> {
  const configured = vscode.workspace.getConfiguration('viberCommandRunner', folder.uri).get<string>('operator')?.trim();
  if (configured) {
    return { name: configured };
  }

  const gitName = await execText('git config user.name', folder.uri.fsPath);
  const gitEmail = await execText('git config user.email', folder.uri.fsPath);
  if (gitName) {
    return { name: gitName, email: gitEmail || undefined };
  }

  const secretName = await secrets.get('viberCommandRunner.operatorName');
  if (secretName) {
    return { name: secretName };
  }

  return { name: os.userInfo().username || 'unknown' };
}

async function execText(command: string, cwd: string): Promise<string> {
  const shell = resolveShellExecutable();
  const env = await resolveCommandEnvironment();
  return await new Promise((resolve) => {
    cp.exec(command, { cwd, env, shell }, (error, stdout) => {
      resolve(error ? '' : stdout.trim());
    });
  });
}

function resolveShellExecutable(): string {
  const configured = vscode.workspace
    .getConfiguration('viberCommandRunner')
    .get<string>('shellPath')
    ?.trim();
  if (configured) {
    return configured;
  }

  const fromEnv = process.env.SHELL?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'cmd.exe';
  }

  return process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash';
}

async function resolveCommandEnvironment(): Promise<NodeJS.ProcessEnv> {
  if (cachedShellEnv) {
    return { ...cachedShellEnv };
  }

  const shell = resolveShellExecutable();
  if (process.platform === 'win32') {
    cachedShellEnv = augmentPath(process.env);
    return { ...cachedShellEnv };
  }

  try {
    const shellEnv = await loadShellEnvironment(shell);
    cachedShellEnv = {
      ...process.env,
      ...shellEnv,
      PATH: shellEnv.PATH || process.env.PATH,
    };
  } catch {
    cachedShellEnv = augmentPath(process.env);
  }

  return { ...cachedShellEnv };
}

function loadShellEnvironment(shell: string): Promise<NodeJS.ProcessEnv> {
  return new Promise((resolve, reject) => {
    cp.execFile(
      shell,
      ['-ilc', 'env -0'],
      {
        encoding: 'buffer',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 15_000,
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(parseEnv0(stdout));
      },
    );
  });
}

function parseEnv0(buffer: Buffer): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const part of buffer.toString('utf8').split('\0')) {
    if (!part) {
      continue;
    }
    const index = part.indexOf('=');
    if (index <= 0) {
      continue;
    }
    env[part.slice(0, index)] = part.slice(index + 1);
  }
  return env;
}

function augmentPath(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const home = os.homedir();
  const extras = [
    path.join(home, '.pub-cache', 'bin'),
    path.join(home, '.shorebird', 'bin'),
    path.join(home, '.local', 'bin'),
    path.join(home, 'flutter', 'bin'),
    path.join(home, 'fvm', 'default', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ];

  const current = env.PATH || '';
  const parts = current.split(path.delimiter).filter(Boolean);
  const merged = [...parts];
  for (const item of extras) {
    if (!merged.includes(item)) {
      merged.push(item);
    }
  }

  return {
    ...env,
    PATH: merged.join(path.delimiter),
  };
}
