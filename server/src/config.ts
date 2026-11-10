import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/mailgod',
  sendgridApiKey: process.env.SENDGRID_API_KEY || '',
  fromEmail: process.env.FROM_EMAIL || 'hello@example.com',
  fromName: process.env.FROM_NAME || 'Mailgod',
  replyDomain: process.env.REPLY_DOMAIN || 'reply.example.com',
  inboxOneOffLimit: parseInt(process.env.INBOX_ONE_OFF_LIMIT || '50', 10),
  temporalAddress: process.env.TEMPORAL_ADDRESS || '',
  temporalNamespace: process.env.TEMPORAL_NAMESPACE || 'default',
  redisUrl: process.env.REDIS_URL || '',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  platformUrl: process.env.PLATFORM_URL || 'http://localhost:3001',
  unsubscribeSecret: process.env.UNSUBSCRIBE_SECRET || 'change-me',
  calcomSecret: process.env.CALCOM_SECRET || '',
  globalRateLimit: parseInt(process.env.GLOBAL_RATE_LIMIT || '5000', 10),
  frequencyCapDaily: parseInt(process.env.FREQUENCY_CAP_DAILY || '1', 10),
  batchSize: parseInt(process.env.BATCH_SIZE || '500', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  useTemporal: process.env.USE_TEMPORAL === 'true',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin',

  // Sender pool: opt-in per instance so a prod deploy without SMTP/IMAP creds
  // (and without the local MAILBOX_SECRET/JWT_SECRET the passwords were encrypted with)
  // does NOT try to send from or poll the owned mailboxes. Set to 'true' on the
  // instance that should actually drive the mailboxes.
  mailboxPoolEnabled: process.env.MAILBOX_POOL_ENABLED === 'true',
};

/**
 * Refuse to boot in production while auth/signing secrets are still at their
 * well-known defaults: anyone could log in or forge unsubscribe links.
 */
export function assertProductionSecrets(): void {
  if (config.nodeEnv !== 'production') return;
  const problems: string[] = [];
  if (!process.env.ADMIN_PASSWORD || config.adminPassword === 'admin' || config.adminPassword.length < 12) {
    problems.push('ADMIN_PASSWORD must be set to a strong value (12+ chars, not "admin")');
  }
  if (!process.env.JWT_SECRET || config.jwtSecret.length < 32) {
    problems.push('JWT_SECRET must be set to a random string of 32+ chars');
  }
  if (!process.env.UNSUBSCRIBE_SECRET || config.unsubscribeSecret.startsWith('change')) {
    problems.push('UNSUBSCRIBE_SECRET must be set to a random string');
  }
  if (problems.length) {
    console.error('Refusing to start in production with insecure configuration:\n  - ' + problems.join('\n  - '));
    console.error('Generate secrets with: openssl rand -hex 32');
    process.exit(1);
  }
}
