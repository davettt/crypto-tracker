import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { ASSET_IDS } from "./assets.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, "../local_data");

// CoinGecko free API — no key needed, 10-30 calls/min
const BASE = "https://api.coingecko.com/api/v3";
const FOUR_HOURS = 4 * 60 * 60 * 1000;

// In-memory cache for all API responses (survives across requests, clears on restart)
const memCache = {};
// In-flight request deduplication
const inflight = {};

// Sequential request queue — 4s gap between actual HTTP requests
// CoinGecko free tier allows 10-30 req/min; 4s keeps us well under
let lastRequestAt = 0;
const REQUEST_GAP = 4000;
const MAX_RETRIES = 2;
const RETRY_BACKOFF = 30000; // 30s wait on 429

// Global request queue to prevent parallel HTTP calls
let requestQueue = Promise.resolve();

async function rateLimitedFetch(url) {
  // Chain onto queue so requests are truly sequential
  const result = requestQueue.then(async () => {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const now = Date.now();
      const wait = Math.max(0, lastRequestAt + REQUEST_GAP - now);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastRequestAt = Date.now();

      const res = await fetch(url);
      if (res.status === 429) {
        if (attempt < MAX_RETRIES) {
          console.warn(
            `CoinGecko 429 — retry ${attempt + 1}/${MAX_RETRIES} in ${RETRY_BACKOFF / 1000}s`,
          );
          await new Promise((r) => setTimeout(r, RETRY_BACKOFF));
          continue;
        }
        throw new Error("CoinGecko rate limit exceeded — try again later");
      }
      if (!res.ok)
        throw new Error(`CoinGecko ${res.status}: ${res.statusText}`);
      return res.json();
    }
  });
  // Update queue reference so next caller chains after this one
  requestQueue = result.catch(() => {});
  return result;
}

async function fetchJsonCached(url) {
  const cached = memCache[url];
  if (cached && Date.now() - cached.at < FOUR_HOURS) {
    return cached.data;
  }
  if (inflight[url]) return inflight[url];
  const promise = rateLimitedFetch(url)
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

// Per-asset file paths
function cacheFile(coinId) {
  return path.join(CACHE_DIR, `price_cache_${coinId}.json`);
}
function historyFile(coinId) {
  return path.join(CACHE_DIR, `price_history_${coinId}.json`);
}

async function loadCache(coinId) {
  try {
    const raw = await fs.readFile(cacheFile(coinId), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveCache(coinId, data) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(cacheFile(coinId), JSON.stringify(data));
}

async function loadHistory(coinId) {
  try {
    const raw = await fs.readFile(historyFile(coinId), "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveHistory(coinId, history) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(historyFile(coinId), JSON.stringify(history));
}

/** Migrate old non-prefixed files to bitcoin-prefixed */
async function migrateOldFiles() {
  const oldCache = path.join(CACHE_DIR, "price_cache.json");
  const oldHistory = path.join(CACHE_DIR, "price_history.json");
  try {
    await fs.access(oldCache);
    const newCache = cacheFile("bitcoin");
    try {
      await fs.access(newCache);
    } catch {
      await fs.rename(oldCache, newCache);
      console.log("Migrated price_cache.json → price_cache_bitcoin.json");
    }
  } catch {
    /* no old file */
  }
  try {
    await fs.access(oldHistory);
    const newHistory = historyFile("bitcoin");
    try {
      await fs.access(newHistory);
    } catch {
      await fs.rename(oldHistory, newHistory);
      console.log("Migrated price_history.json → price_history_bitcoin.json");
    }
  } catch {
    /* no old file */
  }
}

// Run migration on import
migrateOldFiles().catch(() => {});

/**
 * Merge new prices into persistent history and return the full timeline.
 */
async function mergeIntoHistory(coinId, freshPrices) {
  const history = await loadHistory(coinId);
  let added = 0;

  for (const p of freshPrices) {
    if (!history[p.date]) {
      history[p.date] = { price: p.price, timestamp: p.timestamp };
      added++;
    }
  }

  if (added > 0) {
    await saveHistory(coinId, history);
    console.log(
      `${coinId} history: added ${added} days, total ${Object.keys(history).length} days`,
    );
  }

  return Object.entries(history)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { price, timestamp }]) => ({ date, price, timestamp }));
}

/**
 * Fetch price history (daily) for the last 365 days for any coin.
 */
const historyInflight = {};

export async function getPriceHistory(coinId = "bitcoin") {
  const cache = await loadCache(coinId);

  if (cache && Date.now() - cache.fetchedAt < FOUR_HOURS) {
    return mergeIntoHistory(coinId, cache.data);
  }

  // Deduplicate concurrent requests for the same coin
  if (historyInflight[coinId]) return historyInflight[coinId];

  const promise = (async () => {
    const data = await rateLimitedFetch(
      `${BASE}/coins/${coinId}/market_chart?vs_currency=usd&days=365`,
    );

    const prices = data.prices.map(([ts, price]) => ({
      date: new Date(ts).toISOString().split("T")[0],
      timestamp: ts,
      price,
    }));

    await saveCache(coinId, { data: prices, fetchedAt: Date.now() });

    return mergeIntoHistory(coinId, prices);
  })();

  historyInflight[coinId] = promise;
  promise.finally(() => {
    delete historyInflight[coinId];
  });

  return promise;
}

/**
 * Fetch current coin data (price, ATH, market cap).
 */
export async function getCoinCurrent(coinId = "bitcoin", homeCurrency = "usd") {
  const data = await fetchJsonCached(
    `${BASE}/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`,
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
 * Fetch Fear & Greed Index (alternative.me) — Bitcoin-specific
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
 * Fetches prices for all tracked coins in one call.
 */
export async function getExchangeRates(homeCurrency = "usd") {
  const currencies = "usd,aud,gbp,eur,jpy,nzd,sgd,cad";
  const coinIds = ASSET_IDS.join(",");
  const data = await fetchJsonCached(
    `${BASE}/simple/price?ids=${coinIds}&vs_currencies=${currencies}`,
  );
  const hc = homeCurrency.toLowerCase();
  // Derive USD-to-home rate from bitcoin prices (most liquid)
  const btcData = data.bitcoin ?? {};
  const homePrice = btcData[hc] ?? btcData.usd ?? 1;
  const usdPrice = btcData.usd ?? 1;
  return {
    usdToHome: homePrice / usdPrice,
    coinPrices: data,
  };
}
