export type SessionType = 'claude' | 'copilot';
export type SessionStatus = 'active' | 'idle' | 'closed';

export interface SessionMetadata {
  workingDir: string;
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
  createdAt: Date;
}

export interface SessionCreateOptions {
  type: SessionType;
  workingDir: string;
  name?: string;
  resume?: boolean; // For Claude: use --continue flag
  id?: string; // Restore with specific ID
}
