import { writable, derived } from 'svelte/store';

export type SessionType = 'claude' | 'copilot';
export type SessionStatus = 'active' | 'idle' | 'closed';

export interface SessionMetadata {
  workingDir: string;
  gitRoot: string;
  gitBranch: string;
  model: string;
  contextUsed: string;
  lastMessage: string;
  waitingForInput: boolean;
}

export interface Session {
  id: string;
  name: string;
  type: SessionType;
  status: SessionStatus;
  metadata: SessionMetadata;
  createdAt: string;
}

// Store for all sessions (sidebar tree)
export const sessions = writable<Session[]>([]);

// Store for the currently active session ID
export const activeSessionId = writable<string | null>(null);

// IDs of sessions that have been opened as tabs (user clicked or newly created)
export const openedSessionIds = writable<Set<string>>(new Set());

// Derived: sessions that have tabs open
export const openedSessions = derived(
  [sessions, openedSessionIds],
  ([$sessions, $openedIds]) => $sessions.filter((s) => $openedIds.has(s.id))
);

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
  openSession(session.id);
}

export function addSessionQuiet(session: Session): void {
  sessions.update((s) => {
    if (s.some((existing) => existing.id === session.id)) return s;
    return [...s, session];
  });
}

export function openSession(id: string): void {
  openedSessionIds.update((ids) => {
    const next = new Set(ids);
    next.add(id);
    return next;
  });
  activeSessionId.set(id);
}

export function closeTab(id: string): void {
  openedSessionIds.update((ids) => {
    const next = new Set(ids);
    next.delete(id);
    return next;
  });
  // Switch to another open tab or null
  activeSessionId.update((currentId) => {
    if (currentId !== id) return currentId;
    let opened: Session[] = [];
    openedSessions.subscribe((s) => (opened = s))();
    return opened.length > 0 ? opened[opened.length - 1].id : null;
  });
}

export function removeSession(id: string): void {
  closeTab(id);
  sessions.update((s) => s.filter((session) => session.id !== id));
}

export function updateSession(updatedSession: Session): void {
  sessions.update((s) =>
    s.map((session) => (session.id === updatedSession.id ? updatedSession : session))
  );
}

export function setActiveSession(id: string): void {
  openSession(id);
}

export function switchToNextSession(): void {
  openedSessions.subscribe((s) => {
    activeSessionId.update((currentId) => {
      if (!currentId || s.length === 0) return currentId;
      const currentIndex = s.findIndex((session) => session.id === currentId);
      const nextIndex = (currentIndex + 1) % s.length;
      return s[nextIndex].id;
    });
  })();
}

export function switchToPreviousSession(): void {
  openedSessions.subscribe((s) => {
    activeSessionId.update((currentId) => {
      if (!currentId || s.length === 0) return currentId;
      const currentIndex = s.findIndex((session) => session.id === currentId);
      const prevIndex = (currentIndex - 1 + s.length) % s.length;
      return s[prevIndex].id;
    });
  })();
}

export function switchToSessionByIndex(index: number): void {
  openedSessions.subscribe((s) => {
    if (index >= 0 && index < s.length) {
      activeSessionId.set(s[index].id);
    }
  })();
}
