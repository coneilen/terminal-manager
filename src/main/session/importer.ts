import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { SavedSession } from './persistence';

interface ClaudeHistoryEntry {
  display: string;
  timestamp: number;
  project: string;
  sessionId: string;
}

interface ClaudeLockFile {
  pid: number;
  workspaceFolders: string[];
  ideName: string;
}

export interface ImportableSession {
  sessionId: string;
  project: string;
  lastMessage: string;
  timestamp: number;
  isActive: boolean; // Has active IDE connection
}

function getClaudeDir(): string {
  return join(homedir(), '.claude');
}

/**
 * Read active IDE sessions from lock files
 */
function getActiveIdeSessions(): Set<string> {
  const activeProjects = new Set<string>();
  const ideDir = join(getClaudeDir(), 'ide');

  if (!existsSync(ideDir)) {
    return activeProjects;
  }

  try {
    const lockFiles = readdirSync(ideDir).filter(f => f.endsWith('.lock'));

    for (const lockFile of lockFiles) {
      try {
        const content = readFileSync(join(ideDir, lockFile), 'utf-8');
        const data: ClaudeLockFile = JSON.parse(content);

        // Check if process is still running
        if (data.pid && data.workspaceFolders) {
          try {
            process.kill(data.pid, 0); // Check if process exists
            data.workspaceFolders.forEach(folder => activeProjects.add(folder));
          } catch {
            // Process not running, skip
          }
        }
      } catch {
        // Skip invalid lock files
      }
    }
  } catch {
    // IDE directory read error
  }

  return activeProjects;
}

/**
 * Read session history and group by sessionId
 */
function getSessionsFromHistory(): Map<string, ImportableSession> {
  const sessions = new Map<string, ImportableSession>();
  const historyPath = join(getClaudeDir(), 'history.jsonl');

  if (!existsSync(historyPath)) {
    return sessions;
  }

  try {
    const content = readFileSync(historyPath, 'utf-8');
    const lines = content.trim().split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const entry: ClaudeHistoryEntry = JSON.parse(line);

        if (!entry.sessionId || !entry.project) continue;

        const existing = sessions.get(entry.sessionId);

        // Keep the most recent entry for each session
        if (!existing || entry.timestamp > existing.timestamp) {
          sessions.set(entry.sessionId, {
            sessionId: entry.sessionId,
            project: entry.project,
            lastMessage: entry.display || '',
            timestamp: entry.timestamp,
            isActive: false
          });
        }
      } catch {
        // Skip invalid lines
      }
    }
  } catch {
    // History file read error
  }

  return sessions;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Decode a Claude projects directory name back to a filesystem path.
 * The CLI encodes paths by replacing / and . with -, e.g.
 * "/Users/foo/bar.worktree/baz" → "-Users-foo-bar-worktree-baz"
 *
 * We greedily reconstruct by trying /, -, and . as separators at each
 * segment boundary, preferring whichever produces a path that exists on disk.
 */
export function decodeProjectDirName(dirName: string): string {
  const candidate = dirName.replace(/-/g, '/');
  if (existsSync(candidate)) return candidate;

  const parts = dirName.split('-').filter(Boolean);
  let resolved = '';
  for (const part of parts) {
    if (!resolved) {
      // First segment — must start with /
      resolved = '/' + part;
      continue;
    }
    // Try separators in priority order: /, ., -, _
    const trySlash = resolved + '/' + part;
    const tryDot = resolved + '.' + part;
    const tryHyphen = resolved + '-' + part;
    const tryUnderscore = resolved + '_' + part;

    if (existsSync(trySlash)) {
      resolved = trySlash;
    } else if (existsSync(tryDot)) {
      resolved = tryDot;
    } else if (existsSync(tryHyphen)) {
      resolved = tryHyphen;
    } else if (existsSync(tryUnderscore)) {
      resolved = tryUnderscore;
    } else {
      // Nothing exists yet — default to / (building toward a deeper path)
      resolved = trySlash;
    }
  }
  return resolved || candidate;
}

/**
 * Scan ~/.claude/projects/ for sessions not in history.jsonl
 */
function getSessionsFromProjects(knownSessions: Map<string, ImportableSession>): void {
  const projectsDir = join(getClaudeDir(), 'projects');
  if (!existsSync(projectsDir)) return;

  try {
    const projectDirs = readdirSync(projectsDir);

    for (const projDirName of projectDirs) {
      const projPath = join(projectsDir, projDirName);
      try {
        if (!statSync(projPath).isDirectory()) continue;
      } catch {
        continue;
      }

      const project = decodeProjectDirName(projDirName);

      try {
        const files = readdirSync(projPath);
        for (const fname of files) {
          if (!fname.endsWith('.jsonl')) continue;
          const sessionId = fname.slice(0, -6);
          if (!UUID_RE.test(sessionId)) continue;
          if (knownSessions.has(sessionId)) continue;

          // Get file mtime as timestamp
          try {
            const st = statSync(join(projPath, fname));
            knownSessions.set(sessionId, {
              sessionId,
              project,
              lastMessage: '',
              timestamp: st.mtimeMs,
              isActive: false
            });
          } catch {
            // Skip unreadable files
          }
        }
      } catch {
        // Skip unreadable project directories
      }
    }
  } catch {
    // Projects directory read error
  }
}

/**
 * Get importable Claude sessions, deduplicated against existing sessions
 */
export function getImportableSessions(existingSessions: SavedSession[]): ImportableSession[] {
  const activeProjects = getActiveIdeSessions();
  const historySessions = getSessionsFromHistory();

  // Also discover sessions from the projects directory
  getSessionsFromProjects(historySessions);

  // Mark active sessions
  for (const session of historySessions.values()) {
    session.isActive = activeProjects.has(session.project);
  }

  // Get existing session IDs to avoid re-importing
  const existingIds = new Set(existingSessions.map(s => s.id));

  // Show all unique sessions by sessionId. Don't dedup by project path —
  // multiple sessions can legitimately exist for the same directory
  // (e.g. worktrees that share a git root, or different conversations).
  const importable = Array.from(historySessions.values())
    .filter(session => !existingIds.has(session.sessionId))
    .sort((a, b) => b.timestamp - a.timestamp); // Most recent first

  return importable.slice(0, 100); // Limit to 100 most recent
}

/**
 * Get session name from project path
 */
export function getSessionNameFromProject(project: string): string {
  const parts = project.split('/');
  return parts[parts.length - 1] || 'claude';
}
