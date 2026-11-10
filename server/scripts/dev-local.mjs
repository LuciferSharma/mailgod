// Safe local boot: runs the REAL server against a throwaway in-memory MongoDB,
// with NO SendGrid key (zero real sends) and Temporal off. Never touches prod.
//   node scripts/dev-local.mjs
import { MongoMemoryServer } from 'mongodb-memory-server';
import { spawn } from 'node:child_process';

const mongod = await MongoMemoryServer.create();
const uri = mongod.getUri('qr_email_dev');
console.log('[dev-local] in-memory mongo at', uri);

const child = spawn('npx', ['tsx', 'src/index.ts'], {
  shell: true,
  stdio: 'inherit',
  env: {
    ...process.env,
    MONGODB_URI: uri,
    SENDGRID_API_KEY: '', // no real email
    USE_TEMPORAL: 'false',
    REDIS_URL: '',
    NODE_ENV: 'development',
    PORT: '3001',
    ADMIN_PASSWORD: 'admin',
  },
});

const stop = async () => { try { child.kill(); } catch {} try { await mongod.stop(); } catch {} process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code) => { mongod.stop().finally(() => process.exit(code ?? 0)); });
