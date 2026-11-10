/**
 * Loads GUIDE.md from disk so it can be served via the read_guide tool and the
 * guide://mailgod resource. Read once at startup.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
// here = mcp/dist (built) or mcp/src (tsx) — GUIDE.md sits one level up in both.
const guidePath = join(here, '..', 'GUIDE.md');

export const guideText: string = (() => {
  try {
    return readFileSync(guidePath, 'utf8');
  } catch {
    return '# Mailgod MCP\n\nGUIDE.md not found next to the server. See the repo for the full guide.';
  }
})();
