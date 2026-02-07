import { EventEmitter } from 'events';
import { stat, open, readdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { decodeProjectDirName } from './importer';

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
}

const POLL_INTERVAL_MS = 10_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class SessionWatcher extends EventEmitter {
  private knownIds: Set<string>;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSize = 0;
  private lastMtimeMs = 0;
  private historyPath: string;
  private projectsDir: string;

  constructor(knownIds: Iterable<string>) {
    super();
    this.knownIds = new Set(knownIds);
    const claudeDir = join(homedir(), '.claude');
    this.historyPath = join(claudeDir, 'history.jsonl');
    this.projectsDir = join(claudeDir, 'projects');
  }

  addKnownSession(id: string): void {
    this.knownIds.add(id);
  }

  removeKnownSession(id: string): void {
    this.knownIds.delete(id);
  }

  async start(): Promise<void> {
    // Set offset to current file size so we only detect new sessions
    try {
      const st = await stat(this.historyPath);
      this.lastSize = st.size;
      this.lastMtimeMs = st.mtimeMs;
    } catch {
      // File doesn't exist yet — will start from 0 when it appears
      this.lastSize = 0;
      this.lastMtimeMs = 0;
    }

    // Baseline all existing session files so only truly new ones
    // are discovered going forward
    await this.snapshotProjects();

    this.timer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
  }

  /**
   * Add all existing session IDs from projects dir to knownIds
   * without emitting events.
   */
  private async snapshotProjects(): Promise<void> {
    try {
      const projDirs = await readdir(this.projectsDir, { withFileTypes: true });
      for (const dirent of projDirs) {
        if (!dirent.isDirectory()) continue;
        try {
          const files = await readdir(join(this.projectsDir, dirent.name));
          for (const fname of files) {
            if (!fname.endsWith('.jsonl')) continue;
            const sessionId = fname.slice(0, -6);
            if (UUID_RE.test(sessionId)) {
              this.knownIds.add(sessionId);
            }
          }
        } catch {
          // Skip unreadable directories
        }
      }
    } catch {
      // Projects directory missing
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async poll(): Promise<void> {
    await this.pollHistory();
    await this.pollProjects();
  }

  private async pollHistory(): Promise<void> {
    try {
      const st = await stat(this.historyPath);

      // Quick check — nothing changed
      if (st.size === this.lastSize && st.mtimeMs === this.lastMtimeMs) {
        return;
      }

      // File was truncated or replaced — reset
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

      // Read only the new bytes
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
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const entry: HistoryEntry = JSON.parse(line);
          if (!entry.sessionId || !entry.project) continue;
          if (this.knownIds.has(entry.sessionId)) continue;

          // Derive a short name from the project path
          const parts = entry.project.split('/');
          const name = parts[parts.length - 1] || 'claude';

          this.knownIds.add(entry.sessionId);
          this.emit('session-discovered', {
            sessionId: entry.sessionId,
            project: entry.project,
            name,
            lastMessage: entry.display || '',
            timestamp: entry.timestamp
          } satisfies DiscoveredSession);
        } catch {
          // Skip unparseable lines
        }
      }
    } catch {
      // File missing or unreadable — nothing to do
    }
  }

  /**
   * Scan ~/.claude/projects/ for session files not yet known.
   * Catches sessions that never wrote to history.jsonl (e.g. worktrees).
   */
  private async pollProjects(): Promise<void> {
    try {
      const projDirs = await readdir(this.projectsDir, { withFileTypes: true });

      for (const dirent of projDirs) {
        if (!dirent.isDirectory()) continue;

        const projPath = join(this.projectsDir, dirent.name);
        let files: string[];
        try {
          files = await readdir(projPath).then((f) => f.filter((n) => n.endsWith('.jsonl')));
        } catch {
          continue;
        }

        for (const fname of files) {
          const sessionId = fname.slice(0, -6); // strip .jsonl
          if (!UUID_RE.test(sessionId)) continue;
          if (this.knownIds.has(sessionId)) continue;

          const project = decodeProjectDirName(dirent.name);
          const parts = project.split('/');
          const name = parts[parts.length - 1] || 'claude';

          // Get file mtime as timestamp
          let timestamp = Date.now();
          try {
            const st = await stat(join(projPath, fname));
            timestamp = st.mtimeMs;
          } catch {
            // Use current time as fallback
          }

          this.knownIds.add(sessionId);
          this.emit('session-discovered', {
            sessionId,
            project,
            name,
            lastMessage: '',
            timestamp
          } satisfies DiscoveredSession);
        }
      }
    } catch {
      // Projects directory missing or unreadable
    }
  }
}
