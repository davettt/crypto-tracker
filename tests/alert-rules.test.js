/**
 * Unit tests for server/alertRules.js — pure functions, no server needed.
 * Run: npm run test:unit
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateSignal,
  evaluatePriceMove,
  evaluateTargets,
  priceMovePercent,
  fifoAvgCost,
} from '../server/alertRules.js';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 0, 1);

function runSignal(steps) {
  let state;
  const fires = [];
  for (const [day, action] of steps) {
    const r = evaluateSignal(state, action, T0 + day * DAY);
    state = r.state;
    if (r.fire) fires.push([day, r.fire]);
  }
  return fires;
}

test('mid-tier signal changes never alert', () => {
  const fires = runSignal([
    [0, 'HOLD'],
    [1, 'ACCUMULATE'],
    [5, 'BUY'],
    [9, 'CAUTION'],
    [14, 'HOLD'],
  ]);
  assert.deepEqual(fires, []);
});

test('STRONG BUY alerts only after holding 3 days, once', () => {
  const fires = runSignal([
    [0, 'STRONG BUY'],
    [2, 'STRONG BUY'],
    [3, 'STRONG BUY'],
    [10, 'STRONG BUY'],
  ]);
  assert.deepEqual(fires, [[3, 'buy']]);
});

test('flapping out of the zone resets the 3-day hold', () => {
  const fires = runSignal([
    [0, 'STRONG BUY'],
    [2, 'BUY'],
    [2.5, 'STRONG BUY'],
    [5, 'STRONG BUY'],
    [5.5, 'STRONG BUY'],
  ]);
  assert.deepEqual(fires, [[5.5, 'buy']]);
});

test('re-entering the same zone within 30 days stays quiet', () => {
  const fires = runSignal([
    [0, 'CONSIDER SELLING'],
    [3, 'CONSIDER SELLING'],
    [5, 'HOLD'],
    [10, 'CONSIDER SELLING'],
    [20, 'CONSIDER SELLING'],
    [34, 'HOLD'],
    [40, 'CONSIDER SELLING'],
    [43, 'CONSIDER SELLING'],
  ]);
  assert.deepEqual(fires, [
    [3, 'sell'],
    [43, 'sell'],
  ]);
});

test('price move uses the price 30 days back', () => {
  const now = T0 + 60 * DAY;
  const prices = Array.from({ length: 61 }, (_, i) => ({ timestamp: T0 + i * DAY, price: 100 }));
  assert.equal(priceMovePercent(prices, 150, now), 50);
  assert.equal(priceMovePercent([], 150, now), null);
});

test('price move alerts at threshold with a 30-day cooldown per direction', () => {
  let r = evaluatePriceMove(undefined, 25, 40, T0);
  assert.equal(r.fire, null);
  r = evaluatePriceMove(r.state, -45, 40, T0);
  assert.equal(r.fire, 'down');
  r = evaluatePriceMove(r.state, -50, 40, T0 + 10 * DAY);
  assert.equal(r.fire, null);
  r = evaluatePriceMove(r.state, 60, 40, T0 + 11 * DAY);
  assert.equal(r.fire, 'up');
  r = evaluatePriceMove(r.state, -50, 40, T0 + 31 * DAY);
  assert.equal(r.fire, 'down');
  assert.equal(evaluatePriceMove({}, -90, 0, T0).fire, null, 'threshold 0 disables');
});

test('FIFO avg cost weights remaining units of open lots', () => {
  const lots = [
    { amountCrypto: 1, remaining: 0.5, costBasis: 100 },
    { amountCrypto: 1, remaining: 1, costBasis: 200 },
  ];
  assert.equal(fifoAvgCost(lots), (50 + 200) / 1.5);
  assert.equal(fifoAvgCost([]), 0);
});

test('targets fire once on cross and re-arm 20% below', () => {
  let r = evaluateTargets(undefined, 100, 150);
  assert.deepEqual(r.fired, [], '1.5x is not a target');
  r = evaluateTargets(r.state, 100, 205);
  assert.deepEqual(r.fired, [2]);
  r = evaluateTargets(r.state, 100, 195);
  r = evaluateTargets(r.state, 100, 210);
  assert.deepEqual(r.fired, [], 'small dip does not re-arm');
  r = evaluateTargets(r.state, 100, 255);
  assert.deepEqual(r.fired, [2.5]);
  r = evaluateTargets(r.state, 100, 150);
  r = evaluateTargets(r.state, 100, 201);
  assert.deepEqual(r.fired, [2], 're-armed after falling below 160');
});
