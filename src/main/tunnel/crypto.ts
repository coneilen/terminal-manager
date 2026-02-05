import { createDiffieHellmanGroup, createHash, randomBytes, createCipheriv, createDecipheriv } from 'crypto';

export interface KeyPair {
  publicKey: string;
  computeSecret(remotePublicKey: string): Buffer;
}

export function generateKeyPair(): KeyPair {
  const dh = createDiffieHellmanGroup('modp14');
  dh.generateKeys();

  const publicKey = dh.getPublicKey('base64');

  return {
    publicKey,
    computeSecret(remotePublicKey: string): Buffer {
      const rawSecret = dh.computeSecret(Buffer.from(remotePublicKey, 'base64'));
      // Derive uniform 32-byte AES key via SHA-256
      return createHash('sha256').update(rawSecret).digest();
    }
  };
}

export function encrypt(sharedSecret: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', sharedSecret, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Pack: iv (12) + authTag (16) + ciphertext
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString('base64');
}

export function decrypt(sharedSecret: Buffer, packed: string): string {
  const buf = Buffer.from(packed, 'base64');

  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);

  const decipher = createDecipheriv('aes-256-gcm', sharedSecret, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf-8');
}
