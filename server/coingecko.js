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
 * Also fetches AUD price for currency conversion.
 */
export async function getBtcCurrent() {
  const data = await fetchJsonCached(
    `${BASE}/coins/bitcoin?localization=false&tickers=false&community_data=false&developer_data=false`,
  );
  return {
    price: data.market_data.current_price.usd,
    priceAud: data.market_data.current_price.aud,
    ath: data.market_data.ath.usd,
    athDate: data.market_data.ath_date.usd,
    athChange: data.market_data.ath_change_percentage.usd,
    marketCap: data.market_data.market_cap.usd,
    totalVolume: data.market_data.total_volume.usd,
    high24h: data.market_data.high_24h.usd,
    low24h: data.market_data.low_24h.usd,
    high24hAud: data.market_data.high_24h.aud,
    low24hAud: data.market_data.low_24h.aud,
    priceChange24h: data.market_data.price_change_percentage_24h,
    priceChange7d: data.market_data.price_change_percentage_7d,
    priceChange30d: data.market_data.price_change_percentage_30d,
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
 * Get USD/AUD exchange rate from CoinGecko (piggybacks on existing data).
 */
export async function getExchangeRate() {
  const data = await fetchJsonCached(
    `${BASE}/simple/price?ids=bitcoin&vs_currencies=usd,aud`,
  );
  const usd = data.bitcoin.usd;
  const aud = data.bitcoin.aud;
  return { usdToAud: aud / usd };
}
