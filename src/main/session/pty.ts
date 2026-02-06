import * as pty from 'node-pty';
import { EventEmitter } from 'events';
import { homedir } from 'os';
import { existsSync } from 'fs';
import type { SessionType } from './types';

function expandPath(path: string): string {
  if (path.startsWith('~')) {
    return path.replace(/^~/, homedir());
  }
  return path;
}

function resolveWorkingDir(path: string): string {
  const expanded = expandPath(path);
  if (existsSync(expanded)) {
    return expanded;
  }
  console.warn(`Working directory "${expanded}" does not exist, falling back to home directory`);
  return homedir();
}

export interface PtyOptions {
  type: SessionType;
  workingDir: string;
  cols?: number;
  rows?: number;
  resume?: boolean; // For Claude: use --continue flag
}

export class PtySession extends EventEmitter {
  private ptyProcess: pty.IPty | null = null;
  private _isRunning = false;
  private _isKilled = false;
  private startupTimeout: NodeJS.Timeout | null = null;
  private dataDisposable: { dispose: () => void } | null = null;
  private exitDisposable: { dispose: () => void } | null = null;

  constructor(
    public readonly id: string,
    private options: PtyOptions
  ) {
    super();
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  start(): void {
    const shell = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash';
    const cwd = resolveWorkingDir(this.options.workingDir);

    // Spawn a shell and then run the command
    this.ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: this.options.cols || 120,
      rows: this.options.rows || 30,
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor'
      }
    });

    this._isRunning = true;
    this._isKilled = false;

    // Wait for the shell to finish initializing before sending the command.
    // PowerShell on Windows can take several seconds to start (banner, profile
    // scripts, etc.). We debounce: wait for a 300ms gap in output, which
    // corresponds to the shell being idle at its prompt.
    let commandSent = false;
    const sendCommand = () => {
      if (commandSent || !this.ptyProcess || this._isKilled) return;
      commandSent = true;
      const command = this.options.type === 'claude' ? 'claude' : 'copilot';
      if (this.options.type === 'claude' && this.options.resume) {
        this.ptyProcess.write(`${command} --continue || ${command}\r`);
      } else {
        this.ptyProcess.write(`${command}\r`);
      }
    };

    let debounceTimer: NodeJS.Timeout | null = null;
    const promptDisposable = this.ptyProcess.onData(() => {
      if (commandSent) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        promptDisposable.dispose();
        sendCommand();
      }, 300);
    });

    // Fallback: send after 5s even if no output detected
    this.startupTimeout = setTimeout(() => {
      promptDisposable.dispose();
      if (debounceTimer) clearTimeout(debounceTimer);
      sendCommand();
    }, 5000);

    this.dataDisposable = this.ptyProcess.onData((data) => {
      if (!this._isKilled) {
        this.emit('data', data);
      }
    });

    this.exitDisposable = this.ptyProcess.onExit(({ exitCode, signal }) => {
      this._isRunning = false;
      if (!this._isKilled) {
        this.emit('exit', exitCode, signal);
      }
    });
  }

  write(data: string): void {
    if (this.ptyProcess && this._isRunning) {
      this.ptyProcess.write(data);
    }
  }

  resize(cols: number, rows: number): void {
    if (this.ptyProcess && this._isRunning) {
      this.ptyProcess.resize(cols, rows);
    }
  }

  kill(): void {
    this._isKilled = true;
    this._isRunning = false;

    // Clear pending startup timeout
    if (this.startupTimeout) {
      clearTimeout(this.startupTimeout);
      this.startupTimeout = null;
    }

    // Dispose event listeners to prevent callbacks during shutdown
    if (this.dataDisposable) {
      this.dataDisposable.dispose();
      this.dataDisposable = null;
    }
    if (this.exitDisposable) {
      this.exitDisposable.dispose();
      this.exitDisposable = null;
    }

    // Remove all EventEmitter listeners
    this.removeAllListeners();

    // Kill the PTY process with SIGKILL to ensure termination
    if (this.ptyProcess) {
      try {
        // First try graceful termination
        this.ptyProcess.kill();
        // Then force kill after a brief moment
        const pid = this.ptyProcess.pid;
        setTimeout(() => {
          try {
            process.kill(pid, 'SIGKILL');
          } catch {
            // Process already dead
          }
        }, 50);
      } catch {
        // Process may already be dead
      }
      this.ptyProcess = null;
    }
  }
}
