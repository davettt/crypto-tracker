/**
 * Alert decision rules — pure functions, no I/O, so they can be unit-tested.
 *
 * Alerts are deliberately rare: only conditions where a buy or sell is worth
 * considering, confirmed over days, with cooldowns so a level that flaps does
 * not re-send. Week-to-week bumps never email.
 */

const DAY = 24 * 60 * 60 * 1000;

/** A signal zone must hold this long, across checks, before it emails. */
export const SIGNAL_CONFIRM_MS = 3 * DAY;
/** After a zone emails, re-entering the same zone stays quiet for this long. */
export const SIGNAL_COOLDOWN_MS = 30 * DAY;
/** Price move is measured over this window. */
export const PRICE_MOVE_WINDOW_MS = 30 * DAY;
/** After a move alert, the same direction stays quiet for this long. */
export const PRICE_MOVE_COOLDOWN_MS = 30 * DAY;
/** Target sell multiples of FIFO average cost. */
export const TARGET_MULTIPLES = [2, 2.5];
/** A fired target re-arms only after price falls this far back below it. */
export const TARGET_REARM_RATIO = 0.8;

/** Only the extreme assessments are actionable. */
export function zoneOf(action) {
  if (action === 'STRONG BUY') return 'buy';
  if (action === 'CONSIDER SELLING') return 'sell';
  return null;
}

/**
 * @param {object} prev — previous signal state: { pending?: { zone, since, alerted }, lastAlerted?: { buy?, sell? } }
 * @returns {{ state: object, fire: 'buy' | 'sell' | null }}
 */
export function evaluateSignal(prev = {}, action, now) {
  const zone = zoneOf(action);
  const lastAlerted = { ...(prev.lastAlerted ?? {}) };
  if (!zone) return { state: { lastAlerted }, fire: null };

  const pending =
    prev.pending?.zone === zone ? { ...prev.pending } : { zone, since: now, alerted: false };

  let fire = null;
  const confirmed = now - pending.since >= SIGNAL_CONFIRM_MS;
  const cooledDown = !lastAlerted[zone] || now - lastAlerted[zone] >= SIGNAL_COOLDOWN_MS;
  if (!pending.alerted && confirmed && cooledDown) {
    fire = zone;
    pending.alerted = true;
    lastAlerted[zone] = now;
  }
  return { state: { pending, lastAlerted }, fire };
}

/**
 * Percentage change between the price PRICE_MOVE_WINDOW_MS ago and now.
 * @param {Array<{ timestamp: number, price: number }>} dailyPrices — ascending
 * @returns {number | null}
 */
export function priceMovePercent(dailyPrices, currentPrice, now) {
  const cutoff = now - PRICE_MOVE_WINDOW_MS;
  let past = null;
  for (const p of dailyPrices) {
    if (p.timestamp > cutoff) break;
    past = p;
  }
  if (!past || !(past.price > 0)) return null;
  return ((currentPrice - past.price) / past.price) * 100;
}

/**
 * @param {object} prev — { up?: timestamp, down?: timestamp } of the last alert per direction
 * @returns {{ state: object, fire: 'up' | 'down' | null }}
 */
export function evaluatePriceMove(prev = {}, pct, threshold, now) {
  const state = { ...prev };
  if (!(threshold > 0) || pct == null || Math.abs(pct) < threshold) return { state, fire: null };
  const dir = pct > 0 ? 'up' : 'down';
  if (state[dir] && now - state[dir] < PRICE_MOVE_COOLDOWN_MS) return { state, fire: null };
  state[dir] = now;
  return { state, fire: dir };
}

/** FIFO average cost of the open lots, or 0 when nothing is held. */
export function fifoAvgCost(openLots) {
  const remaining = openLots.reduce((s, l) => s + l.remaining, 0);
  if (!(remaining > 0)) return 0;
  const cost = openLots.reduce(
    (s, l) => s + (l.amountCrypto > 0 ? l.costBasis * (l.remaining / l.amountCrypto) : 0),
    0,
  );
  return cost / remaining;
}

/**
 * @param {object} prev — { [multiple]: true } for targets already fired
 * @returns {{ state: object, fired: number[] }}
 */
export function evaluateTargets(prev = {}, avgCost, price) {
  if (!(avgCost > 0)) return { state: {}, fired: [] };
  const state = { ...prev };
  const fired = [];
  for (const mult of TARGET_MULTIPLES) {
    const target = avgCost * mult;
    if (price >= target) {
      if (!state[mult]) {
        state[mult] = true;
        fired.push(mult);
      }
    } else if (state[mult] && price < target * TARGET_REARM_RATIO) {
      delete state[mult];
    }
  }
  return { state, fired };
}
