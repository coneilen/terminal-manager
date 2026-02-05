import { writable, derived } from 'svelte/store';

export type SessionType = 'claude' | 'copilot';
export type SessionStatus = 'active' | 'idle' | 'closed';

export interface SessionMetadata {
  workingDir: string;
  gitBranch: string;
  model: string;
  contextUsed: string;
  lastMessage: string;
}

export interface Session {
  id: string;
  name: string;
  type: SessionType;
  status: SessionStatus;
  metadata: SessionMetadata;
  createdAt: string;
}

// Store for all sessions
export const sessions = writable<Session[]>([]);

// Store for the currently active session ID
export const activeSessionId = writable<string | null>(null);

// Derived store for the active session
export const activeSession = derived(
  [sessions, activeSessionId],
  ([$sessions, $activeSessionId]) => {
    if (!$activeSessionId) return null;
    return $sessions.find((s) => s.id === $activeSessionId) || null;
  }
);

// Helper functions
export function addSession(session: Session): void {
  sessions.update((s) => [...s, session]);
  activeSessionId.set(session.id);
}

export function removeSession(id: string): void {
  sessions.update((s) => s.filter((session) => session.id !== id));
  activeSessionId.update((currentId) => {
    if (currentId === id) {
      // Switch to the last remaining session or null
      let remaining: Session[] = [];
      sessions.subscribe((s) => (remaining = s))();
      return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
    }
    return currentId;
  });
}

export function updateSession(updatedSession: Session): void {
  sessions.update((s) =>
    s.map((session) => (session.id === updatedSession.id ? updatedSession : session))
  );
}

export function setActiveSession(id: string): void {
  activeSessionId.set(id);
}

export function switchToNextSession(): void {
  sessions.subscribe((s) => {
    activeSessionId.update((currentId) => {
      if (!currentId || s.length === 0) return currentId;
      const currentIndex = s.findIndex((session) => session.id === currentId);
      const nextIndex = (currentIndex + 1) % s.length;
      return s[nextIndex].id;
    });
  })();
}

export function switchToPreviousSession(): void {
  sessions.subscribe((s) => {
    activeSessionId.update((currentId) => {
      if (!currentId || s.length === 0) return currentId;
      const currentIndex = s.findIndex((session) => session.id === currentId);
      const prevIndex = (currentIndex - 1 + s.length) % s.length;
      return s[prevIndex].id;
    });
  })();
}

export function switchToSessionByIndex(index: number): void {
  sessions.subscribe((s) => {
    if (index >= 0 && index < s.length) {
      activeSessionId.set(s[index].id);
    }
  })();
}
