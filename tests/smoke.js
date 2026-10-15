/**
 * Tier 1 Smoke Tests — hit every local API endpoint, verify no 500s.
 * Run: npm run test:smoke — driven by tests/harness.js (isolated port + temp data dir).
 * Market endpoints are left out: they call CoinGecko, and CI must not depend on a
 * third-party API's rate limit.
 */

const results = { passed: 0, failed: 0, errors: [] };

async function check(base, method, path, expected = 200) {
  const label = `${method} ${path}`;
  try {
    const res = await fetch(`${base}${path}`, { method });
    if (res.status === expected) {
      results.passed++;
    } else {
      results.failed++;
      results.errors.push(`FAIL [${label}] — expected ${expected}, got ${res.status}`);
    }
  } catch (err) {
    results.failed++;
    results.errors.push(`FAIL [${label}] — ${err.message}`);
  }
}

export async function run(base) {
  console.log(`Smoke tests against ${base}\n`);

  await check(base, 'GET', '/api/build-status');
  await check(base, 'GET', '/api/portfolio');
  await check(base, 'GET', '/api/portfolio/export');
  await check(base, 'GET', '/api/tax/fys');
  await check(base, 'GET', '/api/tax/costbasis');
  await check(base, 'GET', '/api/alerts/settings');
  await check(base, 'GET', '/api/alerts/price-alerts');
  await check(base, 'GET', '/api/notes');
  await check(base, 'POST', '/api/nonexistent', 404);

  console.log(`  Results: ${results.passed} passed, ${results.failed} failed\n`);
  results.errors.forEach((e) => console.log(`  ${e}`));
  return results.failed > 0 ? 1 : 0;
}
