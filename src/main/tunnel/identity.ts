import { execSync } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { hostname } from 'os';
import { app } from 'electron';

export interface LocalIdentity {
  email: string;
  identityHash: string;
  instanceId: string;
  hostname: string;
}

export function detectIdentity(): LocalIdentity | null {
  // Get git email
  let email: string;
  try {
    email = execSync('git config --global user.email', { encoding: 'utf-8' }).trim();
  } catch {
    return null; // No git email configured — tunneling disabled
  }

  if (!email) return null;

  // SHA-256 hash of email, truncated to 16 hex chars
  const identityHash = createHash('sha256').update(email).digest('hex').slice(0, 16);

  // Stable instance ID persisted to userData
  const userDataPath = app.getPath('userData');
  const instanceIdFile = join(userDataPath, 'tunnel-instance-id');
  let instanceId: string;

  try {
    instanceId = readFileSync(instanceIdFile, 'utf-8').trim();
  } catch {
    instanceId = randomUUID();
    try {
      mkdirSync(userDataPath, { recursive: true });
      writeFileSync(instanceIdFile, instanceId, 'utf-8');
    } catch {
      // If we can't persist, use ephemeral ID
    }
  }

  return {
    email,
    identityHash,
    instanceId,
    hostname: hostname()
  };
}
