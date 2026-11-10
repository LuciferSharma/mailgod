import express from 'express';
import cors from 'cors';
import path from 'path';
import { config, assertProductionSecrets } from './config';
import { connectDB } from './db';
import { requestId } from './middleware/requestId';
import { requestLogger } from './middleware/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { subscriberRoutes } from './routes/subscribers';
import { segmentRoutes } from './routes/segments';
import { templateRoutes } from './routes/templates';
import { flowRoutes } from './routes/flows';
import { campaignRoutes } from './routes/campaigns';
import { analyticsRoutes } from './routes/analytics';
import { webhookRoutes } from './routes/webhooks';
import { unsubscribeRoutes } from './routes/unsubscribe';
import { cronJobRoutes } from './routes/cronJobs';
import { settingsRoutes } from './routes/settings';
import { authRoutes } from './routes/auth';
import { inboxRoutes } from './routes/inbox';
import { inboxWebhookRoutes } from './routes/inboxWebhook';
import { calcomWebhookRoutes } from './routes/calcomWebhook';
import { oneOffSendRoutes } from './routes/oneOffSends';
import { adminRoutes } from './routes/admin';
import { reminderRoutes } from './routes/reminders';
import { pipelineRoutes } from './routes/pipeline';
import { mailboxRoutes } from './routes/mailboxes';
import { ensureSendgridMailbox } from './services/mailboxService';
import { authMiddleware } from './middleware/auth';
import { initCronScheduler } from './services/cronScheduler';

assertProductionSecrets();

const app = express();

// Global middleware
app.use(requestId);
app.use(requestLogger);
app.use(cors({
  origin: config.nodeEnv === 'production' ? true : config.clientUrl,
}));
app.use('/api/webhooks', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '50mb' }));

// Public routes (no auth)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.use('/api/webhooks', webhookRoutes);
app.use('/api/webhooks', inboxWebhookRoutes);
app.use('/api/webhooks', calcomWebhookRoutes);
app.use('/api/unsubscribe', unsubscribeRoutes);
app.use('/api/auth', authRoutes);

// Auth middleware (all routes below require JWT)
app.use('/api', authMiddleware);

// API routes
app.use('/api/subscribers', subscriberRoutes);
app.use('/api/segments', segmentRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/flows', flowRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/cron-jobs', cronJobRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/inbox', inboxRoutes);
app.use('/api/one-off-sends', oneOffSendRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/pipeline', pipelineRoutes);
app.use('/api/mailboxes', mailboxRoutes);

// 404 for unmatched /api/* routes
app.all('/api/*', notFoundHandler);

// In production, serve the built client
if (config.nodeEnv === 'production') {
  const clientDist = path.resolve(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Global error handler (must be last)
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
  console.log(`Mode: ${config.nodeEnv}`);

  connectDB()
    .then(() => {
      initCronScheduler();
    if (config.mailboxPoolEnabled) {
      ensureSendgridMailbox().catch(e => console.error('[mailbox] seed failed:', e));
    }
      console.log('MongoDB connected, cron scheduler started');
    })
    .catch((err) => {
      console.error('MongoDB connection failed:', err.message);
      process.exit(1);
    });
});
