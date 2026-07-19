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

// Sequential request queue — 6s gap between actual HTTP requests
// CoinGecko free tier allows 10-30 req/min; 6s = max 10 req/min
let lastRequestAt = 0;
const REQUEST_GAP = 6000;
const MAX_RETRIES = 2;
const RETRY_BACKOFF = 60000; // 60s wait on 429

// Global request queue to prevent parallel HTTP calls
let requestQueue = Promise.resolve();

// Track 429 cooldown globally — if we got rate limited, pause everything
let rateLimitedUntil = 0;

async function rateLimitedFetch(url) {
  // Chain onto queue so requests are truly sequential
  const result = requestQueue.then(async () => {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // Respect global cooldown from prior 429
      const cooldownWait = Math.max(0, rateLimitedUntil - Date.now());
      if (cooldownWait > 0) {
        console.warn(
          `Rate limit cooldown: waiting ${Math.ceil(cooldownWait / 1000)}s`,
        );
        await new Promise((r) => setTimeout(r, cooldownWait));
      }

      const now = Date.now();
      const wait = Math.max(0, lastRequestAt + REQUEST_GAP - now);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastRequestAt = Date.now();

      const res = await fetch(url);
      if (res.status === 429) {
        // Set global cooldown so all queued requests also wait
        rateLimitedUntil = Date.now() + RETRY_BACKOFF;
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
  // Update queue reference — always resolve so queue doesn't break on errors
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

// Per-asset, per-currency file paths. Historical data for each (coin, currency)
// pair is fetched natively from CoinGecko (vs_currency=<currency>) and cached
// independently so chart/signal values are authentic historical prices in that
// currency — no today's-FX conversion of a USD-canonical series.
function cacheFile(coinId, currency) {
  return path.join(CACHE_DIR, `price_cache_${coinId}_${currency}.json`); // nosemgrep: path-join-resolve-traversal
}
function historyFile(coinId, currency) {
  return path.join(CACHE_DIR, `price_history_${coinId}_${currency}.json`); // nosemgrep: path-join-resolve-traversal
}

async function loadCache(coinId, currency) {
  try {
    const raw = await fs.readFile(cacheFile(coinId, currency), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveCache(coinId, currency, data) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(cacheFile(coinId, currency), JSON.stringify(data));
}

async function loadHistory(coinId, currency) {
  try {
    const raw = await fs.readFile(historyFile(coinId, currency), "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveHistory(coinId, currency, history) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(historyFile(coinId, currency), JSON.stringify(history));
}

/**
 * Migrate pre-multi-currency files:
 * - `price_cache.json` / `price_history.json` → bitcoin + usd variants
 * - `price_cache_{coin}.json` / `price_history_{coin}.json` → _usd variants
 *
 * Preserves any accumulated USD history the user already has.
 */
async function migrateOldFiles() {
  // Legacy pre-asset-prefix files
  const legacyCache = path.join(CACHE_DIR, "price_cache.json");
  const legacyHistory = path.join(CACHE_DIR, "price_history.json");
  try {
    await fs.access(legacyCache);
    const target = cacheFile("bitcoin", "usd");
    try {
      await fs.access(target);
    } catch {
      await fs.rename(legacyCache, target);
      console.log("Migrated price_cache.json → price_cache_bitcoin_usd.json");
    }
  } catch {
    /* no legacy file */
  }
  try {
    await fs.access(legacyHistory);
    const target = historyFile("bitcoin", "usd");
    try {
      await fs.access(target);
    } catch {
      await fs.rename(legacyHistory, target);
      console.log(
        "Migrated price_history.json → price_history_bitcoin_usd.json",
      );
    }
  } catch {
    /* no legacy file */
  }

  // Asset-prefixed but non-currency files → _usd variants
  for (const coinId of ASSET_IDS) {
    const oldCache = path.join(CACHE_DIR, `price_cache_${coinId}.json`);
    const oldHistory = path.join(CACHE_DIR, `price_history_${coinId}.json`);
    try {
      await fs.access(oldCache);
      const target = cacheFile(coinId, "usd");
      try {
        await fs.access(target);
      } catch {
        await fs.rename(oldCache, target);
        console.log(
          `Migrated price_cache_${coinId}.json → price_cache_${coinId}_usd.json`,
        );
      }
    } catch {
      /* no old file */
    }
    try {
      await fs.access(oldHistory);
      const target = historyFile(coinId, "usd");
      try {
        await fs.access(target);
      } catch {
        await fs.rename(oldHistory, target);
        console.log(
          `Migrated price_history_${coinId}.json → price_history_${coinId}_usd.json`,
        );
      }
    } catch {
      /* no old file */
    }
  }
}

// Run migration on import
migrateOldFiles().catch(() => {});

/**
 * Merge new prices into persistent history and return the full timeline.
 * History is scoped to (coin, currency) because each (coin, currency) pair is
 * fetched natively from CoinGecko and represents authentic historical prices
 * in that currency.
 */
async function mergeIntoHistory(coinId, currency, freshPrices) {
  const history = await loadHistory(coinId, currency);
  let added = 0;

  for (const p of freshPrices) {
    if (!history[p.date]) {
      history[p.date] = { price: p.price, timestamp: p.timestamp };
      added++;
    }
  }

  if (added > 0) {
    await saveHistory(coinId, currency, history);
    console.log(
      `${coinId}/${currency} history: added ${added} days, total ${Object.keys(history).length} days`,
    );
  }

  return Object.entries(history)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { price, timestamp }]) => ({ date, price, timestamp }));
}

/**
 * Clear in-memory and file caches for a coin so next fetch hits CoinGecko.
 * Removes every currency variant of the price cache; history files are kept
 * because they only accumulate.
 */
export async function invalidateCache(coinId) {
  // Clear all memCache entries for this coin
  for (const url of Object.keys(memCache)) {
    if (url.includes(coinId)) {
      delete memCache[url];
    }
  }
  // Remove every currency variant of the file-based price cache
  try {
    const entries = await fs.readdir(CACHE_DIR);
    const prefix = `price_cache_${coinId}_`;
    await Promise.all(
      entries
        .filter((e) => e.startsWith(prefix) && e.endsWith(".json"))
        .map((e) => fs.unlink(path.join(CACHE_DIR, e)).catch(() => {})), // nosemgrep: path-join-resolve-traversal
    );
  } catch {
    /* no cache dir */
  }
}

/**
 * Fetch price history (daily) for the last 365 days for any coin, in the
 * requested vs_currency. Native-currency fetches avoid the today's-FX
 * distortion that comes from storing USD and converting later.
 */
const historyInflight = {};

export async function getPriceHistory(coinId = "bitcoin", currency = "usd") {
  const vs = currency.toLowerCase();
  const key = `${coinId}_${vs}`;
  const cache = await loadCache(coinId, vs);

  if (cache && Date.now() - cache.fetchedAt < FOUR_HOURS) {
    return mergeIntoHistory(coinId, vs, cache.data);
  }

  // Deduplicate concurrent requests for the same (coin, currency)
  if (historyInflight[key]) return historyInflight[key];

  const promise = (async () => {
    const data = await rateLimitedFetch(
      `${BASE}/coins/${coinId}/market_chart?vs_currency=${vs}&days=365`,
    );

    const prices = data.prices.map(([ts, price]) => ({
      date: new Date(ts).toISOString().split("T")[0],
      timestamp: ts,
      price,
    }));

    await saveCache(coinId, vs, { data: prices, fetchedAt: Date.now() });

    return mergeIntoHistory(coinId, vs, prices);
  })();

  historyInflight[key] = promise;
  promise.finally(() => {
    delete historyInflight[key];
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
