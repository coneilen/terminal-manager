import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';

export interface SessionConfig {
  type: 'claude' | 'copilot';
  folder: string;
  name?: string;
}

export interface SessionsFile {
  sessions: SessionConfig[];
}

function expandPath(path: string): string {
  if (path.startsWith('~')) {
    return path.replace(/^~/, homedir());
  }
  return path;
}

export function loadSessionsFromFile(filePath: string): SessionConfig[] {
  const expandedPath = expandPath(filePath);

  if (!existsSync(expandedPath)) {
    throw new Error(`File not found: ${expandedPath}`);
  }

  try {
    const content = readFileSync(expandedPath, 'utf-8');
    const data: SessionsFile = JSON.parse(content);

    if (!data.sessions || !Array.isArray(data.sessions)) {
      throw new Error('Invalid format: expected { "sessions": [...] }');
    }

    // Validate and expand paths
    return data.sessions.map((session, index) => {
      if (!session.type || !['claude', 'copilot'].includes(session.type)) {
        throw new Error(`Session ${index}: invalid type (must be "claude" or "copilot")`);
      }
      if (!session.folder) {
        throw new Error(`Session ${index}: missing folder`);
      }

      return {
        type: session.type,
        folder: expandPath(session.folder),
        name: session.name
      };
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON: ${error.message}`);
    }
    throw error;
  }
}
