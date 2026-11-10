import crypto from 'crypto';
import { config } from '../config';

// AES-256-GCM with a key derived from MAILBOX_SECRET (falls back to JWT_SECRET).
// Passwords are only ever decrypted server-side to open SMTP/IMAP sessions.
const KEY = crypto.createHash('sha256').update(process.env.MAILBOX_SECRET || config.jwtSecret).digest();

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptSecret(blob: string): string {
  if (!blob) return '';
  const [v, ivB, tagB, encB] = blob.split(':');
  if (v !== 'v1') throw new Error('Unknown secret format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encB, 'base64')), decipher.final()]).toString('utf8');
}
