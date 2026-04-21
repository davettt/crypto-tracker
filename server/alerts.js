import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { Resend } from "resend";
import { ASSETS, ASSET_IDS } from "./assets.js";
import { getPriceHistory, getCoinCurrent } from "./coingecko.js";
import { toWeekly, generateSignals } from "./indicators.js";
import { loadPortfolio } from "./routes/portfolio.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_FILE = path.join(__dirname, "../local_data/alert_settings.json");
const STATE_FILE = path.join(__dirname, "../local_data/alert_state.json");
const DATA_DIR = path.join(__dirname, "../local_data");

const CHECK_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours

let checkTimer = null;

export async function loadAlertSettings() {
  try {
    const raw = await fs.readFile(SETTINGS_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {
      enabled: false,
      email: "",
      resendApiKey: "",
      fromEmail: "alerts@resend.dev",
      priceChangeThreshold: 10,
      signalChangeEnabled: true,
      targetApproachEnabled: true,
      targetApproachPercent: 5,
    };
  }
}

export async function saveAlertSettings(settings) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

async function loadAlertState() {
  try {
    const raw = await fs.readFile(STATE_FILE, "utf8");
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
    USD: "$",
    AUD: "A$",
    GBP: "\u00a3",
    EUR: "\u20ac",
    JPY: "\u00a5",
    NZD: "NZ$",
    SGD: "S$",
    CAD: "C$",
  };
  const sym = symbols[currency] ?? "$";
  if (price >= 1000)
    return `${sym}${price.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  const homeCurrency = portfolio.settings?.homeCurrency ?? "USD";
  const alerts = [];

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
      );

      const prevState = state[assetId] ?? {};

      // Signal state change
      if (
        settings.signalChangeEnabled &&
        prevState.overall &&
        prevState.overall !== overall.action
      ) {
        const actionClass = overall.action.includes("BUY")
          ? "buy"
          : overall.action.includes("SELL")
            ? "sell"
            : "neutral";
        alerts.push({
          asset: asset.symbol,
          type: "signal",
          actionClass,
          title: `${asset.symbol}: Signal changed to ${overall.action}`,
          detail: `${overall.description} (was: ${prevState.overall})`,
          price: formatPrice(current.price, homeCurrency),
        });
      }

      // 24h price change
      if (
        settings.priceChangeThreshold > 0 &&
        Math.abs(current.priceChange24h) >= settings.priceChangeThreshold
      ) {
        const alreadySent =
          prevState.lastPriceAlertChange24h ===
          current.priceChange24h.toFixed(1);
        if (!alreadySent) {
          const direction = current.priceChange24h > 0 ? "up" : "down";
          alerts.push({
            asset: asset.symbol,
            type: "price",
            actionClass: direction === "up" ? "sell" : "buy",
            title: `${asset.symbol}: ${direction === "up" ? "+" : ""}${current.priceChange24h.toFixed(1)}% in 24h`,
            detail: `Current price: ${formatPrice(current.price, homeCurrency)}`,
            price: formatPrice(current.price, homeCurrency),
          });
          state[assetId] = {
            ...state[assetId],
            lastPriceAlertChange24h: current.priceChange24h.toFixed(1),
          };
        }
      }

      // Target sell price approach
      if (settings.targetApproachEnabled) {
        const assetTxs = (portfolio.transactions ?? []).filter(
          (t) => (t.asset ?? "bitcoin") === assetId && t.type === "buy",
        );
        if (assetTxs.length > 0) {
          const taxSettings = portfolio.settings?.taxSettings ?? {
            marginalTaxRate: 0.325,
            exchangeFeeRate: 0.006,
          };
          const avgCost =
            assetTxs.reduce((sum, t) => sum + (t.price ?? 0), 0) /
            assetTxs.length;
          if (avgCost > 0) {
            const targetMultiples = [1.5, 2, 3, 5];
            for (const mult of targetMultiples) {
              const rawTarget = avgCost * mult;
              const gain = rawTarget - avgCost;
              const fee = rawTarget * taxSettings.exchangeFeeRate;
              const taxableGain = gain * 0.5; // assume >12 month hold (CGT discount)
              const tax = taxableGain * taxSettings.marginalTaxRate;
              const netTarget = rawTarget - fee - tax;
              const pctFromTarget =
                ((current.price - rawTarget) / rawTarget) * 100;

              if (
                pctFromTarget >= -settings.targetApproachPercent &&
                pctFromTarget <= 5
              ) {
                const stateKey = `target_${mult}x`;
                if (!prevState[stateKey]) {
                  alerts.push({
                    asset: asset.symbol,
                    type: "target",
                    actionClass: "sell",
                    title: `${asset.symbol}: Approaching ${mult}x target`,
                    detail: `Price ${formatPrice(current.price, homeCurrency)} is within ${settings.targetApproachPercent}% of ${mult}x target (${formatPrice(rawTarget, homeCurrency)}). Net after fees+tax: ${formatPrice(netTarget, homeCurrency)}`,
                    price: formatPrice(current.price, homeCurrency),
                  });
                  state[assetId] = { ...state[assetId], [stateKey]: true };
                }
              } else if (prevState[stateKey]) {
                state[assetId] = { ...state[assetId], [stateKey]: false };
              }
            }
          }
        }
      }

      state[assetId] = {
        ...state[assetId],
        overall: overall.action,
        lastPrice: current.price,
      };
    } catch (err) {
      console.error(`Alert check failed for ${assetId}:`, err.message);
    }
  }

  await saveAlertState(state);

  if (alerts.length === 0) return;

  const subject =
    alerts.length === 1
      ? alerts[0].title
      : `Crypto Alert: ${alerts.length} triggers across ${[...new Set(alerts.map((a) => a.asset))].join(", ")}`;

  const html = buildEmailHtml(alerts, homeCurrency);

  try {
    await sendAlertEmail(settings, subject, html);
  } catch (err) {
    console.error("Failed to send alert email:", err.message);
  }
}

function buildEmailHtml(alerts, currency) {
  const colors = {
    buy: {
      bg: "#ecfdf5",
      border: "#6ee7b7",
      badge: "#059669",
      label: "BUY SIGNAL",
    },
    sell: {
      bg: "#fef2f2",
      border: "#fca5a5",
      badge: "#dc2626",
      label: "SELL SIGNAL",
    },
    neutral: {
      bg: "#f9fafb",
      border: "#d1d5db",
      badge: "#6b7280",
      label: "UPDATE",
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
    .join("");

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
        asset: "BTC",
        type: "signal",
        actionClass: "buy",
        title: "BTC: Test Alert - Signal changed to STRONG BUY",
        detail:
          "This is a test alert to verify your email configuration is working.",
        price: "$95,000.00",
      },
      {
        asset: "ETH",
        type: "price",
        actionClass: "sell",
        title: "ETH: +12.5% in 24h",
        detail: "Current price: $3,200.00",
        price: "$3,200.00",
      },
    ],
    "USD",
  );

  const resend = new Resend(settings.resendApiKey);
  await resend.emails.send({
    from: settings.fromEmail,
    to: settings.email,
    subject: "Crypto Tracker - Test Alert",
    html,
  });
}

export function startAlertScheduler() {
  if (checkTimer) return;
  console.log("Alert scheduler started (checking every 4 hours)");
  checkTimer = setInterval(() => {
    checkAlerts().catch((err) =>
      console.error("Alert check error:", err.message),
    );
  }, CHECK_INTERVAL);
  // Run first check 30s after startup to let caches warm
  setTimeout(() => {
    checkAlerts().catch((err) =>
      console.error("Initial alert check error:", err.message),
    );
  }, 30000);
}

export function stopAlertScheduler() {
  if (checkTimer) {
    clearInterval(checkTimer);
    checkTimer = null;
  }
}
