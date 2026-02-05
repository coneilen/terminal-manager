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
    return JSON.parse(data);
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
  const sessions = loadSavedSessions();
  // Don't duplicate
  if (!sessions.find(s => s.id === session.id)) {
    sessions.push(session);
    saveSessions(sessions);
  }
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
