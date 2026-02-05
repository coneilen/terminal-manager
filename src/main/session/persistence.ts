import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';

export interface SavedSession {
  id: string;
  name: string;
  type: 'claude' | 'copilot';
  workingDir: string;
}

function getConfigPath(): string {
  const userDataPath = app.getPath('userData');
  return join(userDataPath, 'sessions.json');
}

export function loadSavedSessions(): SavedSession[] {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return [];
  }

  try {
    const data = readFileSync(configPath, 'utf-8');
    const sessions: SavedSession[] = JSON.parse(data);

    // Deduplicate: keep only the latest session per workingDir/type combination
    // (later entries in the array are considered newer)
    const seen = new Map<string, SavedSession>();
    for (const session of sessions) {
      const key = `${session.type}:${session.workingDir}`;
      seen.set(key, session); // Overwrites earlier entries, keeping the latest
    }

    const deduped = Array.from(seen.values());

    // If we removed duplicates, save the cleaned list
    if (deduped.length < sessions.length) {
      saveSessions(deduped);
    }

    return deduped;
  } catch (error) {
    console.error('Failed to load saved sessions:', error);
    return [];
  }
}

export function saveSessions(sessions: SavedSession[]): void {
  const configPath = getConfigPath();
  const userDataPath = app.getPath('userData');

  // Ensure directory exists
  if (!existsSync(userDataPath)) {
    mkdirSync(userDataPath, { recursive: true });
  }

  try {
    writeFileSync(configPath, JSON.stringify(sessions, null, 2));
  } catch (error) {
    console.error('Failed to save sessions:', error);
  }
}

export function addSavedSession(session: SavedSession): void {
  let sessions = loadSavedSessions();

  // Remove any existing session with the same workingDir and type
  // This keeps only the latest session per folder/type combination
  sessions = sessions.filter(s =>
    !(s.workingDir === session.workingDir && s.type === session.type)
  );

  // Add the new session
  sessions.push(session);
  saveSessions(sessions);
}

export function removeSavedSession(id: string): void {
  const sessions = loadSavedSessions();
  const filtered = sessions.filter(s => s.id !== id);
  saveSessions(filtered);
}

export function updateSavedSession(id: string, updates: Partial<SavedSession>): void {
  const sessions = loadSavedSessions();
  const index = sessions.findIndex(s => s.id === id);
  if (index !== -1) {
    sessions[index] = { ...sessions[index], ...updates };
    saveSessions(sessions);
  }
}
