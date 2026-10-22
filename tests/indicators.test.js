/**
 * Unit tests for server/indicators.js — pure functions, no server needed.
 * Run: npm run test:unit
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toWeekly } from '../server/indicators.js';

function days(start, count) {
  const out = [];
  const t0 = Date.parse(start);
  for (let i = 0; i < count; i++) {
    out.push({ date: new Date(t0 + i * 86400000).toISOString().split('T')[0], price: i });
  }
  return out;
}

test('toWeekly groups 1-7 Jan into week 1 and keeps the last day', () => {
  const weekly = toWeekly(days('2026-01-01', 14));
  assert.equal(weekly.length, 2);
  assert.equal(weekly[0].date, '2026-01-07');
  assert.equal(weekly[1].date, '2026-01-14');
});

test('toWeekly week boundaries do not shift across DST changes', () => {
  // Australian DST ends 5 Apr 2026 and starts 4 Oct 2026; every week stays 7 days
  const weekly = toWeekly(days('2026-01-01', 364));
  assert.equal(weekly.length, 52);
  for (let i = 1; i < weekly.length; i++) {
    const gap = (Date.parse(weekly[i].date) - Date.parse(weekly[i - 1].date)) / 86400000;
    assert.equal(gap, 7, `gap before ${weekly[i].date}`);
  }
});

test('toWeekly result is the same in any timezone', () => {
  // Day counts use UTC throughout. 31 Dec (day 365) is a one-day week 53; week 1 ends 7 Jan
  const weekly = toWeekly(days('2025-12-25', 21));
  assert.deepEqual(
    weekly.map((w) => w.date),
    ['2025-12-30', '2025-12-31', '2026-01-07', '2026-01-14'],
  );
});
