import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, "../local_data");
const CACHE_FILE = path.join(CACHE_DIR, "price_cache.json");
const HISTORY_FILE = path.join(CACHE_DIR, "price_history.json");

// CoinGecko free API — no key needed, 10-30 calls/min
const BASE = "https://api.coingecko.com/api/v3";
const FOUR_HOURS = 4 * 60 * 60 * 1000;

// In-memory cache for all API responses (survives across requests, clears on restart)
const memCache = {};
// In-flight request deduplication — prevents concurrent cache-miss requests to the same URL
const inflight = {};

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinGecko ${res.status}: ${res.statusText}`);
  return res.json();
}

async function fetchJsonCached(url) {
  const cached = memCache[url];
  if (cached && Date.now() - cached.at < FOUR_HOURS) {
    return cached.data;
  }
  if (inflight[url]) return inflight[url];
  const promise = fetchJson(url)
    .then((data) => {
      memCache[url] = { data, at: Date.now() };
      delete inflight[url];
      return data;
    })
    .catch((err) => {
      delete inflight[url];
      throw err;
    });
  inflight[url] = promise;
  return promise;
}

async function loadCache() {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveCache(data) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(data));
}

/**
 * Load the persistent price history (grows over time).
 * Keyed by date string for fast dedup/merge.
 */
async function loadHistory() {
  try {
    const raw = await fs.readFile(HISTORY_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveHistory(history) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(HISTORY_FILE, JSON.stringify(history));
}

/**
 * Merge new prices into persistent history and return the full timeline.
 * History is { "2024-01-15": { price: 42000, timestamp: ... }, ... }
 */
async function mergeIntoHistory(freshPrices) {
  const history = await loadHistory();
  let added = 0;

  for (const p of freshPrices) {
    if (!history[p.date]) {
      history[p.date] = { price: p.price, timestamp: p.timestamp };
      added++;
    }
  }

  if (added > 0) {
    await saveHistory(history);
    console.log(
      `Price history: added ${added} days, total ${Object.keys(history).length} days`,
    );
  }

  // Return sorted array
  return Object.entries(history)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { price, timestamp }]) => ({ date, price, timestamp }));
}

/**
 * Fetch BTC price history (daily) for the last 365 days.
 * Merges into persistent history file to accumulate multi-year data.
 * CoinGecko API response cached for 4 hours.
 */
export async function getBtcPriceHistory() {
  const cache = await loadCache();

  if (cache && Date.now() - cache.fetchedAt < FOUR_HOURS) {
    // Still merge cached API data with history (in case history was cleared)
    return mergeIntoHistory(cache.data);
  }

  const data = await fetchJson(
    `${BASE}/coins/bitcoin/market_chart?vs_currency=usd&days=365`,
  );

  const prices = data.prices.map(([ts, price]) => ({
    date: new Date(ts).toISOString().split("T")[0],
    timestamp: ts,
    price,
  }));

  await saveCache({ data: prices, fetchedAt: Date.now() });

  // Merge into growing history and return full timeline
  return mergeIntoHistory(prices);
}

/**
 * Fetch current BTC data (price, ATH, market cap).
 * Returns values in the specified home currency, plus USD for signal calculations.
 */
export async function getBtcCurrent(homeCurrency = "usd") {
  const data = await fetchJsonCached(
    `${BASE}/coins/bitcoin?localization=false&tickers=false&community_data=false&developer_data=false`,
  );
  const hc = homeCurrency.toLowerCase();
  const md = data.market_data;
  return {
    price: md.current_price[hc] ?? md.current_price.usd,
    priceUsd: md.current_price.usd,
    ath: md.ath[hc] ?? md.ath.usd,
    athDate: md.ath_date[hc] ?? md.ath_date.usd,
    athChange: md.ath_change_percentage[hc] ?? md.ath_change_percentage.usd,
    marketCap: md.market_cap[hc] ?? md.market_cap.usd,
    totalVolume: md.total_volume[hc] ?? md.total_volume.usd,
    high24h: md.high_24h[hc] ?? md.high_24h.usd,
    low24h: md.low_24h[hc] ?? md.low_24h.usd,
    priceChange24h: md.price_change_percentage_24h,
    priceChange7d: md.price_change_percentage_7d,
    priceChange30d: md.price_change_percentage_30d,
  };
}

/**
 * Fetch Fear & Greed Index (alternative.me)
 */
export async function getFearGreedIndex() {
  const url = "https://api.alternative.me/fng/?limit=30";
  const cached = memCache[url];
  if (cached && Date.now() - cached.at < FOUR_HOURS) {
    return cached.data;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fear&Greed API ${res.status}`);
  const data = await res.json();
  const result = data.data.map((d) => ({
    value: parseInt(d.value, 10),
    classification: d.value_classification,
    date: new Date(parseInt(d.timestamp, 10) * 1000)
      .toISOString()
      .split("T")[0],
  }));
  memCache[url] = { data: result, at: Date.now() };
  return result;
}

/**
 * Get exchange rates relative to the home currency.
 * Uses BTC prices in both currencies to derive the cross rate.
 */
export async function getExchangeRates(homeCurrency = "usd") {
  const currencies = "usd,aud,gbp,eur,jpy,nzd,sgd,cad";
  const data = await fetchJsonCached(
    `${BASE}/simple/price?ids=bitcoin&vs_currencies=${currencies}`,
  );
  const hc = homeCurrency.toLowerCase();
  const homePrice = data.bitcoin[hc] ?? data.bitcoin.usd;
  const usdPrice = data.bitcoin.usd;
  return {
    usdToHome: homePrice / usdPrice,
    btcPrices: data.bitcoin,
  };
}
