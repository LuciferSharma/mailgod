/**
 * Offline smoke test: spawn the built server, run the MCP handshake over stdio,
 * and assert that tools + the guide resource register. Calls NO platform
 * endpoints, so it needs nothing running and sends zero email.
 *
 * Usage: node scripts/smoke.mjs
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, '..', 'dist', 'index.js');

const child = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env: { ...process.env, MAILGOD_BASE_URL: 'http://127.0.0.1:9', MAILGOD_ALLOW_SEND: 'false' },
});

const send = (msg) => child.stdin.write(JSON.stringify(msg) + '\n');
const pending = new Map();
const rl = createInterface({ input: child.stdout });

rl.on('line', (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return; // ignore non-JSON noise
  }
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});

const request = (id, method, params = {}) =>
  new Promise((resolve, reject) => {
    pending.set(id, resolve);
    send({ jsonrpc: '2.0', id, method, params });
    setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), 8000);
  });

const fail = (m) => {
  console.error('SMOKE FAIL:', m);
  child.kill();
  process.exit(1);
};

try {
  const init = await request(1, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'smoke', version: '0' },
  });
  if (!init.result) fail('no initialize result');
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });

  const tools = (await request(2, 'tools/list')).result?.tools ?? [];
  const resources = (await request(3, 'resources/list')).result?.resources ?? [];

  const names = tools.map((t) => t.name).sort();
  const expected = [
    'add_prospect', 'add_prospects', 'find_prospects', 'get_prospect', 'update_prospect', 'tag_prospects',
    'list_templates', 'create_template', 'list_segments', 'create_segment', 'preview_segment_count',
    'draft_one_off', 'draft_campaign', 'test_send', 'confirm_send', 'get_send_status',
    'list_flows', 'enroll_in_flow', 'get_analytics', 'check_connection', 'read_guide',
  ];
  const missing = expected.filter((e) => !names.includes(e));

  console.log(`Server: ${init.result.serverInfo?.name} v${init.result.serverInfo?.version}`);
  console.log(`Tools registered: ${names.length}`);
  console.log(names.map((n) => '  - ' + n).join('\n'));
  console.log(`Resources: ${resources.map((r) => r.uri).join(', ') || '(none)'}`);

  if (missing.length) fail('missing tools: ' + missing.join(', '));
  if (!resources.some((r) => r.uri === 'guide://mailgod')) fail('guide resource not registered');

  console.log(`\n✅ SMOKE PASS — ${names.length} tools + guide resource OK`);
  child.kill();
  process.exit(0);
} catch (err) {
  fail(err.message);
}
