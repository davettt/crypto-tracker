import fs from 'fs/promises';
import path from 'path';
import { DATA_DIR } from './config.js';
import { Resend } from 'resend';
import { ASSETS, ASSET_IDS } from './assets.js';
import { getPriceHistory, getCoinCurrent } from './coingecko.js';
import { toWeekly, generateSignals } from './indicators.js';
import { loadPortfolio } from './routes/portfolio.js';
import { computeFIFO } from './fifo.js';
import {
  evaluateSignal,
  evaluatePriceMove,
  evaluateTargets,
  priceMovePercent,
  fifoAvgCost,
} from './alertRules.js';
const SETTINGS_FILE = path.join(DATA_DIR, 'alert_settings.json');
const STATE_FILE = path.join(DATA_DIR, 'alert_state.json');
const PRICE_ALERTS_FILE = path.join(DATA_DIR, 'price_alerts.json');

const CHECK_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours

let checkTimer = null;

const DEFAULT_SETTINGS = {
  enabled: false,
  email: '',
  resendApiKey: '',
  fromEmail: 'alerts@resend.dev',
  signalChangeEnabled: true,
  priceMoveThreshold: 40,
  targetCrossEnabled: true,
};

export async function loadAlertSettings() {
  let saved = {};
  try {
    saved = JSON.parse(await fs.readFile(SETTINGS_FILE, 'utf8'));
  } catch {
    // No settings yet
  }
  // Migrate pre-2.6 settings: the 24h threshold doesn't carry over to the 30-day window,
  // so priceMoveThreshold starts at its default.
  const { priceChangeThreshold, targetApproachEnabled, targetApproachPercent, ...rest } = saved;
  void priceChangeThreshold;
  void targetApproachPercent;
  const settings = { ...DEFAULT_SETTINGS, ...rest };
  if (rest.targetCrossEnabled == null && targetApproachEnabled != null) {
    settings.targetCrossEnabled = targetApproachEnabled;
  }
  return settings;
}

export async function saveAlertSettings(settings) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

export async function loadPriceAlerts() {
  try {
    return JSON.parse(await fs.readFile(PRICE_ALERTS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

export async function savePriceAlerts(alerts) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(PRICE_ALERTS_FILE, JSON.stringify(alerts, null, 2) + '\n');
}

async function loadAlertState() {
  try {
    const raw = await fs.readFile(STATE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveAlertState(state) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

function formatPrice(price, currency) {
  const symbols = {
    USD: '$',
    AUD: 'A$',
    GBP: '\u00a3',
    EUR: '\u20ac',
    JPY: '\u00a5',
    NZD: 'NZ$',
    SGD: 'S$',
    CAD: 'C$',
  };
  const sym = symbols[currency] ?? '$';
  if (price >= 1000)
    return `${sym}${price.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (price >= 1) return `${sym}${price.toFixed(2)}`;
  return `${sym}${price.toPrecision(4)}`;
}

async function sendAlertEmail(settings, subject, htmlBody) {
  const resend = new Resend(settings.resendApiKey);
  await resend.emails.send({
    from: settings.fromEmail,
    to: settings.email,
    subject,
    html: htmlBody,
  });
  console.log(`Alert email sent: ${subject}`);
}

export async function checkAlerts() {
  const settings = await loadAlertSettings();
  if (!settings.enabled || !settings.email || !settings.resendApiKey) return;

  const state = await loadAlertState();
  const portfolio = await loadPortfolio();
  const homeCurrency = portfolio.settings?.homeCurrency ?? 'USD';
  const alerts = [];
  const now = Date.now();

  for (const assetId of ASSET_IDS) {
    const asset = ASSETS[assetId];
    try {
      const [dailyPrices, current] = await Promise.all([
        getPriceHistory(assetId, homeCurrency),
        getCoinCurrent(assetId, homeCurrency),
      ]);

      const weeklyPrices = toWeekly(dailyPrices);
      const { overall } = generateSignals(
        dailyPrices,
        weeklyPrices,
        current.price,
        current.ath,
        assetId,
      );

      const prevState = state[assetId] ?? {};
      const price = formatPrice(current.price, homeCurrency);

      // Signal zone: only STRONG BUY / CONSIDER SELLING, held 3 days, 30-day cooldown
      const signal = evaluateSignal(prevState.signal, overall.action, now);
      if (settings.signalChangeEnabled && signal.fire) {
        alerts.push({
          asset: asset.symbol,
          type: 'signal',
          actionClass: signal.fire,
          title: `${asset.symbol}: ${overall.action}`,
          detail: `${overall.description} Held for 3+ days. Price: ${price}`,
          price,
        });
      }

      // Large move over 30 days, 30-day cooldown per direction
      const pct = priceMovePercent(dailyPrices, current.price, now);
      const move = evaluatePriceMove(prevState.priceMove, pct, settings.priceMoveThreshold, now);
      if (move.fire) {
        const sign = pct > 0 ? '+' : '';
        alerts.push({
          asset: asset.symbol,
          type: 'price',
          actionClass: move.fire === 'up' ? 'sell' : 'buy',
          title: `${asset.symbol}: ${sign}${pct.toFixed(0)}% in 30 days`,
          detail: `Current price: ${price}`,
          price,
        });
      }

      // Target sell prices (2x / 2.5x of FIFO avg cost), once per cross
      const assetTxs = (portfolio.transactions ?? []).filter(
        (t) => (t.asset ?? 'bitcoin') === assetId,
      );
      const avgCost = fifoAvgCost(computeFIFO(assetTxs).openLots);
      const targets = evaluateTargets(prevState.targets, avgCost, current.price);
      if (settings.targetCrossEnabled) {
        const taxSettings = portfolio.settings?.taxSettings ?? {
          marginalTaxRate: 0.325,
          exchangeFeeRate: 0.006,
        };
        for (const mult of targets.fired) {
          const rawTarget = avgCost * mult;
          const fee = rawTarget * taxSettings.exchangeFeeRate;
          const tax = (rawTarget - avgCost) * 0.5 * taxSettings.marginalTaxRate; // >12 month hold
          const netTarget = rawTarget - fee - tax;
          alerts.push({
            asset: asset.symbol,
            type: 'target',
            actionClass: 'sell',
            title: `${asset.symbol}: Reached ${mult}x target`,
            detail: `Price ${price} is at or above ${mult}x your average cost (${formatPrice(rawTarget, homeCurrency)}). Net per unit after fees and long-term CGT: ${formatPrice(netTarget, homeCurrency)}`,
            price,
          });
        }
      }

      state[assetId] = {
        overall: overall.action,
        lastPrice: current.price,
        signal: signal.state,
        priceMove: move.state,
        targets: targets.state,
      };
    } catch (err) {
      console.error(`Alert check failed for ${assetId}:`, err.message); // nosemgrep: unsafe-formatstring
    }
  }

  // Price level alerts
  const priceAlerts = await loadPriceAlerts();
  let priceAlertsChanged = false;
  for (const [assetId, assetAlerts] of Object.entries(priceAlerts)) {
    const asset = ASSETS[assetId];
    if (!asset) continue;
    const lastPrice = state[assetId]?.lastPrice;
    if (!lastPrice) continue;

    for (const pa of assetAlerts) {
      if (pa.triggered) continue;
      const hit = pa.direction === 'below' ? lastPrice <= pa.price : lastPrice >= pa.price;
      if (hit) {
        pa.triggered = true;
        priceAlertsChanged = true;
        const label = pa.direction === 'below' ? 'dropped to' : 'reached';
        alerts.push({
          asset: asset.symbol,
          type: 'price-level',
          actionClass: pa.direction === 'below' ? 'buy' : 'sell',
          title: `${asset.symbol}: Price ${label} ${formatPrice(pa.price, homeCurrency)} target`,
          detail: `Current price: ${formatPrice(lastPrice, homeCurrency)}${pa.note ? ` — ${pa.note}` : ''}`,
          price: formatPrice(lastPrice, homeCurrency),
        });
      }
    }
  }
  if (priceAlertsChanged) await savePriceAlerts(priceAlerts);

  await saveAlertState(state);

  if (alerts.length === 0) return;

  const subject =
    alerts.length === 1
      ? alerts[0].title
      : `Crypto Alert: ${alerts.length} triggers across ${[...new Set(alerts.map((a) => a.asset))].join(', ')}`;

  const html = buildEmailHtml(alerts, homeCurrency);

  try {
    await sendAlertEmail(settings, subject, html);
  } catch (err) {
    console.error('Failed to send alert email:', err.message);
  }
}

function buildEmailHtml(alerts) {
  const colors = {
    buy: {
      bg: '#ecfdf5',
      border: '#6ee7b7',
      badge: '#059669',
      label: 'BUY SIGNAL',
    },
    sell: {
      bg: '#fef2f2',
      border: '#fca5a5',
      badge: '#dc2626',
      label: 'SELL SIGNAL',
    },
    neutral: {
      bg: '#f9fafb',
      border: '#d1d5db',
      badge: '#6b7280',
      label: 'UPDATE',
    },
  };

  const alertRows = alerts
    .map((a) => {
      const c = colors[a.actionClass] ?? colors.neutral;
      return `
      <tr>
        <td style="padding: 12px 0;">
          <div style="border: 1px solid ${c.border}; border-radius: 8px; background: ${c.bg}; padding: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: 600; font-size: 15px; color: #111827;">${a.title}</span>
              <span style="background: ${c.badge}; color: white; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px;">${c.label}</span>
            </div>
            <div style="margin-top: 6px; font-size: 13px; color: #4b5563;">${a.detail}</div>
          </div>
        </td>
      </tr>`;
    })
    .join('');

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f3f4f6;">
      <div style="max-width: 600px; margin: 0 auto; padding: 24px;">
        <div style="background: white; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <h2 style="margin: 0 0 16px; font-size: 18px; color: #111827;">Crypto Tracker Alert</h2>
          <table width="100%" cellpadding="0" cellspacing="0">
            ${alertRows}
          </table>
          <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af;">
            Not financial advice. Check your Crypto Tracker app for full analysis.
          </div>
        </div>
      </div>
    </body>
    </html>`;
}

export async function sendTestEmail(settings) {
  const html = buildEmailHtml(
    [
      {
        asset: 'BTC',
        type: 'signal',
        actionClass: 'buy',
        title: 'BTC: Test Alert - Signal changed to STRONG BUY',
        detail: 'This is a test alert to verify your email configuration is working.',
        price: '$95,000.00',
      },
      {
        asset: 'ETH',
        type: 'price',
        actionClass: 'sell',
        title: 'ETH: +45% in 30 days',
        detail: 'Current price: $3,200.00',
        price: '$3,200.00',
      },
    ],
    'USD',
  );

  const resend = new Resend(settings.resendApiKey);
  await resend.emails.send({
    from: settings.fromEmail,
    to: settings.email,
    subject: 'Crypto Tracker - Test Alert',
    html,
  });
}

export function startAlertScheduler() {
  if (checkTimer) return;
  console.log('Alert scheduler started (checking every 4 hours)');
  checkTimer = setInterval(() => {
    checkAlerts().catch((err) => console.error('Alert check error:', err.message));
  }, CHECK_INTERVAL);
  // Run first check 30s after startup to let caches warm
  setTimeout(() => {
    checkAlerts().catch((err) => console.error('Initial alert check error:', err.message));
  }, 30000);
}

export function stopAlertScheduler() {
  if (checkTimer) {
    clearInterval(checkTimer);
    checkTimer = null;
  }
}
