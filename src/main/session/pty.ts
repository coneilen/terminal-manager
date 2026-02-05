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
    const command = this.options.type === 'claude' ? 'claude' : 'copilot';
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

    // Send the command after a brief delay to let the shell initialize
    setTimeout(() => {
      if (this.ptyProcess) {
        if (this.options.type === 'claude' && this.options.resume) {
          // Try --continue, fall back to plain claude if it fails
          this.ptyProcess.write(`${command} --continue || ${command}\r`);
        } else {
          this.ptyProcess.write(`${command}\r`);
        }
      }
    }, 100);

    this.ptyProcess.onData((data) => {
      this.emit('data', data);
    });

    this.ptyProcess.onExit(({ exitCode, signal }) => {
      this._isRunning = false;
      this.emit('exit', exitCode, signal);
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
    if (this.ptyProcess) {
      this.ptyProcess.kill();
      this._isRunning = false;
    }
  }
}
