/**
 * Test harness — starts an isolated server instance for smoke/integration tests.
 * Creates a temporary data directory, starts the server on a test port, runs the
 * tests, then tears everything down. Production data (local_data/) is never touched.
 */

import { spawn } from 'child_process';
import { mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SERVER_PATH = join(__dirname, '..', 'server', 'index.js');
const TEST_PORT = 3097;
const TEST_DATA_DIR = join(tmpdir(), `crypto-tracker-test-${Date.now()}`);

async function waitForServer(url, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/build-status`);
      if (res.ok) return;
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server did not start within ${timeoutMs}ms`);
}

async function run() {
  const testScript = process.argv[2] || 'integration';
  if (!['smoke', 'integration'].includes(testScript)) {
    throw new Error(`Unknown test suite: ${testScript}`);
  }

  console.log(`\n  Data dir: ${TEST_DATA_DIR}`);
  console.log(`  Port: ${TEST_PORT}\n`);
  mkdirSync(TEST_DATA_DIR, { recursive: true });

  const server = spawn('node', [SERVER_PATH], {
    env: {
      ...process.env,
      DATA_DIR: TEST_DATA_DIR,
      PORT: String(TEST_PORT),
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverOutput = '';
  server.stdout.on('data', (d) => (serverOutput += d));
  server.stderr.on('data', (d) => (serverOutput += d));

  try {
    const base = `http://127.0.0.1:${TEST_PORT}`;
    await waitForServer(base);
    const testModule = await import(`./${testScript}.js`);
    process.exitCode = await testModule.run(base);
  } catch (err) {
    console.error(`\n  HARNESS ERROR: ${err.message}`);
    if (serverOutput) console.error(`\n  Server output:\n${serverOutput}`);
    process.exitCode = 1;
  } finally {
    server.kill();
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
}

run();
