import crypto from 'crypto';
import { config } from '../config';

export function generateUnsubscribeToken(subscriberId: string): string {
  return crypto
    .createHmac('sha256', config.unsubscribeSecret)
    .update(subscriberId)
    .digest('hex');
}

export function verifyUnsubscribeToken(subscriberId: string, token: string): boolean {
  const expected = generateUnsubscribeToken(subscriberId);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

export function getUnsubscribeUrl(subscriberId: string): string {
  const token = generateUnsubscribeToken(subscriberId);
  return `${config.platformUrl}/api/unsubscribe/${subscriberId}/${token}`;
}
