import { EventEmitter } from 'events';
import { stat, open, readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { decodeProjectDirName } from './importer';
import type { SessionType } from './types';

interface HistoryEntry {
  display: string;
  timestamp: number;
  project: string;
  sessionId: string;
}

export interface DiscoveredSession {
  sessionId: string;
  project: string;
  name: string;
  lastMessage: string;
  timestamp: number;
  type: SessionType;
}

const POLL_INTERVAL_MS = 10_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Parse a simple flat YAML file (key: value per line, no nesting).
 * Used for Copilot's workspace.yaml which is always this format.
 */
function parseSimpleYaml(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) result[key] = value;
  }
  return result;
}

export class SessionWatcher extends EventEmitter {
  private knownIds: Set<string>;
  private knownWorkingDirs: Set<string>;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSize = 0;
  private lastMtimeMs = 0;

  // Claude paths
  private historyPath: string;
  private claudeProjectsDir: string;

  // Copilot paths
  private copilotSessionStateDir: string;

  constructor(knownIds: Iterable<string>, knownWorkingDirs: Iterable<string>) {
    super();
    this.knownIds = new Set(knownIds);
    this.knownWorkingDirs = new Set(knownWorkingDirs);
    const home = homedir();
    const claudeDir = join(home, '.claude');
    this.historyPath = join(claudeDir, 'history.jsonl');
    this.claudeProjectsDir = join(claudeDir, 'projects');
    this.copilotSessionStateDir = join(home, '.copilot', 'session-state');
  }

  addKnownSession(id: string): void {
    this.knownIds.add(id);
  }

  removeKnownSession(id: string): void {
    this.knownIds.delete(id);
  }

  addKnownWorkingDir(dir: string): void {
    this.knownWorkingDirs.add(dir);
  }

  async start(): Promise<void> {
    // Set offset to current file size so we only detect new history entries
    try {
      const st = await stat(this.historyPath);
      this.lastSize = st.size;
      this.lastMtimeMs = st.mtimeMs;
    } catch {
      this.lastSize = 0;
      this.lastMtimeMs = 0;
    }

    // Run the first poll immediately to discover pre-existing sessions
    // for directories not yet managed
    await this.poll();

    this.timer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async poll(): Promise<void> {
    await this.pollClaudeHistory();
    await this.pollClaudeProjects();
    await this.pollCopilotSessions();
  }

  /**
   * Check whether a discovered session should be emitted.
   * Silently absorbs the UUID if the working directory is already managed
   * (prevents per-UUID flooding while still allowing new directories).
   */
  private shouldEmit(sessionId: string, workingDir: string): boolean {
    if (this.knownIds.has(sessionId)) return false;

    this.knownIds.add(sessionId);

    if (this.knownWorkingDirs.has(workingDir)) {
      // Directory already managed — absorb the UUID silently
      return false;
    }

    // New directory — emit and mark as known
    this.knownWorkingDirs.add(workingDir);
    return true;
  }

  private async pollClaudeHistory(): Promise<void> {
    try {
      const st = await stat(this.historyPath);

      if (st.size === this.lastSize && st.mtimeMs === this.lastMtimeMs) {
        return;
      }

      if (st.size < this.lastSize) {
        this.lastSize = st.size;
        this.lastMtimeMs = st.mtimeMs;
        return;
      }

      const newBytes = st.size - this.lastSize;
      if (newBytes <= 0) {
        this.lastMtimeMs = st.mtimeMs;
        return;
      }

      const buf = Buffer.alloc(newBytes);
      const fh = await open(this.historyPath, 'r');
      try {
        await fh.read(buf, 0, newBytes, this.lastSize);
      } finally {
        await fh.close();
      }

      this.lastSize = st.size;
      this.lastMtimeMs = st.mtimeMs;

      const chunk = buf.toString('utf-8');
      for (const line of chunk.split('\n')) {
        if (!line.trim()) continue;

        try {
          const entry: HistoryEntry = JSON.parse(line);
          if (!entry.sessionId || !entry.project) continue;
          if (!this.shouldEmit(entry.sessionId, entry.project)) continue;

          const parts = entry.project.split('/');
          const name = parts[parts.length - 1] || 'claude';

          this.emit('session-discovered', {
            sessionId: entry.sessionId,
            project: entry.project,
            name,
            lastMessage: entry.display || '',
            timestamp: entry.timestamp,
            type: 'claude'
          } satisfies DiscoveredSession);
        } catch {
          // Skip unparseable lines
        }
      }
    } catch {
      // File missing or unreadable
    }
  }

  /**
   * Scan ~/.claude/projects/ for session files not yet known.
   * Catches sessions that never wrote to history.jsonl (e.g. worktrees).
   */
  private async pollClaudeProjects(): Promise<void> {
    try {
      const projDirs = await readdir(this.claudeProjectsDir, { withFileTypes: true });

      for (const dirent of projDirs) {
        if (!dirent.isDirectory()) continue;

        const projPath = join(this.claudeProjectsDir, dirent.name);
        let files: string[];
        try {
          files = await readdir(projPath).then((f) => f.filter((n) => n.endsWith('.jsonl')));
        } catch {
          continue;
        }

        for (const fname of files) {
          const sessionId = fname.slice(0, -6);
          if (!UUID_RE.test(sessionId)) continue;

          const project = decodeProjectDirName(dirent.name);
          if (!this.shouldEmit(sessionId, project)) continue;

          const parts = project.split('/');
          const name = parts[parts.length - 1] || 'claude';

          let timestamp = Date.now();
          try {
            const st = await stat(join(projPath, fname));
            timestamp = st.mtimeMs;
          } catch {
            // Use current time as fallback
          }

          this.emit('session-discovered', {
            sessionId,
            project,
            name,
            lastMessage: '',
            timestamp,
            type: 'claude'
          } satisfies DiscoveredSession);
        }
      }
    } catch {
      // Projects directory missing or unreadable
    }
  }

  /**
   * Scan ~/.copilot/session-state/ for new UUID-named directories.
   * Reads workspace.yaml for metadata (cwd, summary, etc.).
   */
  private async pollCopilotSessions(): Promise<void> {
    try {
      const dirs = await readdir(this.copilotSessionStateDir, { withFileTypes: true });

      for (const dirent of dirs) {
        if (!dirent.isDirectory()) continue;
        if (!UUID_RE.test(dirent.name)) continue;
        if (this.knownIds.has(dirent.name)) continue;

        const sessionDir = join(this.copilotSessionStateDir, dirent.name);
        const workspacePath = join(sessionDir, 'workspace.yaml');

        try {
          const content = await readFile(workspacePath, 'utf-8');
          const meta = parseSimpleYaml(content);

          if (!meta.cwd) continue;
          if (!this.shouldEmit(dirent.name, meta.cwd)) continue;

          const folderName = meta.cwd.split(/[/\\]/).filter(Boolean).pop() || 'copilot';
          const name = meta.summary || folderName;

          const timestamp = meta.updated_at
            ? new Date(meta.updated_at).getTime()
            : Date.now();

          this.emit('session-discovered', {
            sessionId: dirent.name,
            project: meta.cwd,
            name,
            lastMessage: meta.summary || '',
            timestamp,
            type: 'copilot'
          } satisfies DiscoveredSession);
        } catch {
          // workspace.yaml missing or unreadable — skip
        }
      }
    } catch {
      // Copilot session-state directory missing or unreadable
    }
  }
}
