import { readFileSync, readdirSync, existsSync } from 'fs';
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

/**
 * Get importable Claude sessions, deduplicated against existing sessions
 */
export function getImportableSessions(existingSessions: SavedSession[]): ImportableSession[] {
  const activeProjects = getActiveIdeSessions();
  const historySessions = getSessionsFromHistory();

  // Mark active sessions
  for (const session of historySessions.values()) {
    session.isActive = activeProjects.has(session.project);
  }

  // Get existing working directories for deduplication
  const existingWorkingDirs = new Set(existingSessions.map(s => s.workingDir));

  // Filter out sessions we already have (by working directory)
  const importable = Array.from(historySessions.values())
    .filter(session => !existingWorkingDirs.has(session.project))
    .sort((a, b) => b.timestamp - a.timestamp); // Most recent first

  // Deduplicate by project path (keep most recent per project)
  const byProject = new Map<string, ImportableSession>();
  for (const session of importable) {
    if (!byProject.has(session.project)) {
      byProject.set(session.project, session);
    }
  }

  return Array.from(byProject.values()).slice(0, 50); // Limit to 50 most recent
}

/**
 * Get session name from project path
 */
export function getSessionNameFromProject(project: string): string {
  const parts = project.split('/');
  return parts[parts.length - 1] || 'claude';
}
