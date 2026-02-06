import { BrowserWindow } from 'electron';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { PtySession } from './pty';
import { createInitialMetadata, extractMetadataFromOutput } from './metadata';
import { addSavedSession, removeSavedSession, loadSavedSessions } from './persistence';
import type { Session, SessionCreateOptions, SessionStatus } from './types';

interface ManagedSession {
  session: Session;
  pty: PtySession;
}

export class SessionManager extends EventEmitter {
  private sessions: Map<string, ManagedSession> = new Map();
  private sessionCounter: Map<string, number> = new Map();
  private isShuttingDown = false;

  constructor(private mainWindow: BrowserWindow) {
    super();
  }

  private generateSessionName(type: string): string {
    const count = (this.sessionCounter.get(type) || 0) + 1;
    this.sessionCounter.set(type, count);
    return `${type}-${count}`;
  }

  create(options: SessionCreateOptions): Session {
    const id = options.id || randomUUID();
    const name = options.name || this.generateSessionName(options.type);

    const session: Session = {
      id,
      name,
      type: options.type,
      status: 'active',
      metadata: createInitialMetadata(options.workingDir),
      createdAt: new Date()
    };

    const ptySession = new PtySession(id, {
      type: options.type,
      workingDir: options.workingDir,
      resume: options.resume
    });

    // Save to persistent storage (only for new sessions, not restores)
    if (!options.id) {
      addSavedSession({
        id,
        name,
        type: options.type,
        workingDir: options.workingDir
      });
    }

    this.sessions.set(id, { session, pty: ptySession });
    this.setupPtyHandlers(id, ptySession);

    // Start the PTY process
    ptySession.start();

    return session;
  }

  close(id: string): boolean {
    const managed = this.sessions.get(id);
    if (!managed) {
      return false;
    }

    managed.pty.kill();
    managed.session.status = 'closed';
    this.sendSessionUpdate(managed.session);
    // Don't delete from sessions map - keep it as inactive
    // Don't remove from saved sessions - user must explicitly remove
    return true;
  }

  // Permanently remove session from saved state
  remove(id: string): boolean {
    const managed = this.sessions.get(id);
    if (managed) {
      managed.pty.kill();
      this.sessions.delete(id);
    }
    removeSavedSession(id);
    return true;
  }

  // Restart an inactive session
  restart(id: string): Session | null {
    const managed = this.sessions.get(id);
    if (!managed) {
      return null;
    }

    // Kill old PTY if still somehow running
    if (managed.pty.isRunning) {
      managed.pty.kill();
    }

    // Create new PTY with resume flag
    const ptySession = new PtySession(id, {
      type: managed.session.type,
      workingDir: managed.session.metadata.workingDir,
      resume: true // Always resume when restarting
    });

    this.setupPtyHandlers(id, ptySession);
    ptySession.start();

    managed.pty = ptySession;
    managed.session.status = 'active';
    this.sendSessionUpdate(managed.session);

    return managed.session;
  }

  // Load saved sessions and restore them
  restoreSessions(): void {
    const saved = loadSavedSessions();
    for (const savedSession of saved) {
      this.create({
        id: savedSession.id,
        type: savedSession.type,
        workingDir: savedSession.workingDir,
        name: savedSession.name,
        resume: true
      });
    }
  }

  closeAll(): void {
    this.isShuttingDown = true;
    for (const [, managed] of this.sessions) {
      managed.pty.kill();
    }
    this.sessions.clear();
  }

  write(id: string, data: string): boolean {
    const managed = this.sessions.get(id);
    if (!managed || !managed.pty.isRunning) {
      return false;
    }

    managed.pty.write(data);
    return true;
  }

  resize(id: string, cols: number, rows: number): boolean {
    const managed = this.sessions.get(id);
    if (!managed || !managed.pty.isRunning) {
      return false;
    }

    managed.pty.resize(cols, rows);
    return true;
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id)?.session;
  }

  list(): Session[] {
    return Array.from(this.sessions.values()).map((m) => m.session);
  }

  updateStatus(id: string, status: SessionStatus): void {
    const managed = this.sessions.get(id);
    if (managed) {
      managed.session.status = status;
      this.sendSessionUpdate(managed.session);
    }
  }

  private sendSessionUpdate(session: Session): void {
    if (this.isShuttingDown || this.mainWindow.isDestroyed()) {
      return;
    }
    // Serialize for IPC (Date -> string)
    const serialized = {
      ...session,
      createdAt: session.createdAt instanceof Date
        ? session.createdAt.toISOString()
        : session.createdAt
    };
    try {
      this.mainWindow.webContents.send('session:update', serialized);
    } catch {
      // Window may be destroyed, ignore
    }

    // Emit for tunnel server bridge
    this.emit('session:update', serialized);
  }

  private setupPtyHandlers(id: string, ptySession: PtySession): void {
    // Handle PTY output
    ptySession.on('data', (data: string) => {
      if (this.isShuttingDown || this.mainWindow.isDestroyed()) {
        return;
      }

      // Send output to renderer
      try {
        this.mainWindow.webContents.send('session:output', id, data);
      } catch {
        return; // Window destroyed
      }

      // Emit for tunnel server bridge
      this.emit('session:output', id, data);

      // Extract metadata from output
      const managed = this.sessions.get(id);
      if (managed) {
        const updates = extractMetadataFromOutput(data, managed.session.metadata);

        // Check if any metadata actually changed
        const hasUpdates = Object.keys(updates).some(
          key => updates[key as keyof typeof updates] !== managed.session.metadata[key as keyof typeof updates]
        );

        if (hasUpdates) {
          Object.assign(managed.session.metadata, updates);
          this.sendSessionUpdate(managed.session);
        }

        // Update status based on activity
        if (managed.session.status !== 'active') {
          managed.session.status = 'active';
          this.sendSessionUpdate(managed.session);
        }
      }
    });

    // Handle PTY exit
    ptySession.on('exit', (exitCode: number) => {
      if (this.isShuttingDown || this.mainWindow.isDestroyed()) {
        return;
      }

      const managed = this.sessions.get(id);
      if (managed) {
        managed.session.status = 'closed';
        try {
          this.mainWindow.webContents.send('session:exit', id, exitCode);
        } catch {
          // Window destroyed
        }

        // Emit for tunnel server bridge
        this.emit('session:exit', id, exitCode);

        this.sendSessionUpdate(managed.session);
      }
    });
  }
}
