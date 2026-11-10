import { Worker, NativeConnection } from '@temporalio/worker';
import { config } from '../config';
import { connectDB } from '../db';
import * as activities from './activities/email';

async function run() {
  await connectDB();

  const connection = await NativeConnection.connect({
    address: config.temporalAddress,
  });

  const worker = await Worker.create({
    connection,
    namespace: config.temporalNamespace,
    taskQueue: 'email-marketing',
    workflowsPath: require.resolve('./workflows/index'),
    activities,
  });

  const shutdown = async () => {
    console.log('Shutting down Temporal worker...');
    worker.shutdown();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log('Temporal worker started');
  await worker.run();
}

run().catch((err) => {
  console.error('Temporal worker failed:', err);
  process.exit(1);
});
