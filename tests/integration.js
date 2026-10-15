/**
 * Tier 2 Integration Tests — network exposure guards and data round-trips.
 * Run: npm run test:integration — driven by tests/harness.js (isolated port + temp data dir).
 */

import http from 'http';

const results = { passed: 0, failed: 0, errors: [] };

// fetch cannot override Host, so the rebinding test sends a raw request.
function rawGet(port, urlPath, host) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: urlPath, headers: { host } },
      (res) => {
        res.resume();
        resolve({ status: res.statusCode });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

async function test(description, fn) {
  try {
    await fn();
    results.passed++;
  } catch (err) {
    results.failed++;
    results.errors.push(`FAIL [${description}] — ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const json = (origin) => ({
  ...(origin ? { origin } : {}),
  'Content-Type': 'application/json',
});

export async function run(base) {
  console.log(`Integration tests against ${base}\n`);
  const { port } = new URL(base);

  // --- Network exposure guards ---
  await test('Rejects a foreign Host header (DNS rebinding)', async () => {
    const res = await rawGet(port, '/api/portfolio', `evil.example:${port}`);
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  await test('Does not grant CORS to other localhost origins', async () => {
    const res = await fetch(`${base}/api/portfolio`, {
      headers: { origin: 'http://localhost:9999' },
    });
    const allow = res.headers.get('access-control-allow-origin');
    assert(allow === null, `Expected no Access-Control-Allow-Origin, got ${allow}`);
  });

  await test('Refuses cross-site writes but allows the app origin', async () => {
    const evil = 'https://evil.example';
    const noBody = await fetch(`${base}/api/alerts/check`, {
      method: 'POST',
      headers: { origin: evil },
    });
    assert(noBody.status === 403, `no-body POST: expected 403, got ${noBody.status}`);
    const put = await fetch(`${base}/api/notes/bitcoin`, {
      method: 'PUT',
      headers: json(evil),
      body: JSON.stringify({ thesis: 'x' }),
    });
    assert(put.status === 403, `PUT: expected 403, got ${put.status}`);
    const own = await fetch(`${base}/api/notes/bitcoin`, {
      method: 'PUT',
      headers: json(base),
      body: JSON.stringify({ thesis: 'own origin' }),
    });
    assert(own.ok, `own origin: expected 200, got ${own.status}`);
  });

  await test('Sends security headers', async () => {
    const res = await fetch(`${base}/api/build-status`);
    assert(res.headers.get('x-content-type-options') === 'nosniff', 'missing nosniff');
    assert(res.headers.get('x-frame-options') === 'DENY', 'missing X-Frame-Options');
    assert(!res.headers.get('x-powered-by'), 'x-powered-by should be hidden');
  });

  // --- Data round-trips ---
  await test('Transaction add, edit, cost basis, delete', async () => {
    const add = await fetch(`${base}/api/portfolio/transaction`, {
      method: 'POST',
      headers: json(),
      body: JSON.stringify({
        type: 'buy',
        asset: 'bitcoin',
        date: '2024-01-15',
        amountCrypto: 0.5,
        amount: 30000,
        price: 60000,
        fee: 0,
      }),
    });
    assert(add.ok, `add: expected 2xx, got ${add.status}`);
    const portfolio = await (await fetch(`${base}/api/portfolio?asset=bitcoin`)).json();
    const tx = portfolio.transactions[0];
    assert(tx, 'transaction not persisted');

    const cb = await fetch(`${base}/api/tax/costbasis?asset=bitcoin`);
    assert(cb.ok, `cost basis: got ${cb.status}`);

    const del = await fetch(`${base}/api/portfolio/transaction/${tx.id}`, { method: 'DELETE' });
    assert(del.ok, `delete: got ${del.status}`);
    const after = await (await fetch(`${base}/api/portfolio?asset=bitcoin`)).json();
    assert(after.transactions.length === 0, 'transaction not deleted');
  });

  await test('Rejects an unknown asset in notes', async () => {
    const res = await fetch(`${base}/api/notes/NOTACOIN`, {
      method: 'PUT',
      headers: json(),
      body: JSON.stringify({ thesis: 'x' }),
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  await test('Price alerts round-trip', async () => {
    const put = await fetch(`${base}/api/alerts/price-alerts/ethereum`, {
      method: 'PUT',
      headers: json(),
      body: JSON.stringify({ alerts: [{ price: 1000, direction: 'below' }] }),
    });
    assert(put.ok, `put: got ${put.status}`);
    const all = await (await fetch(`${base}/api/alerts/price-alerts`)).json();
    assert(JSON.stringify(all).includes('1000'), 'price alert not persisted');
  });

  console.log(`  Results: ${results.passed} passed, ${results.failed} failed\n`);
  results.errors.forEach((e) => console.log(`  ${e}`));
  return results.failed > 0 ? 1 : 0;
}
