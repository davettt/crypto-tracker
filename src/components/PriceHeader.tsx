import type { CoinCurrent, Currency, ExchangeRates, AssetId } from "../types";
import { ASSETS, CURRENCY_SYMBOLS } from "../types";

function fmt(n: number) {
  const decimals = Math.abs(n) < 10 ? 2 : Math.abs(n) < 1000 ? 1 : 0;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function pct(n: number) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function pctColor(n: number) {
  if (n > 0) return "text-green-500";
  if (n < 0) return "text-red-500";
  return "text-gray-400";
}

export default function PriceHeader({
  data,
  displayCurrency,
  homeCurrency,
  exchangeRates,
  activeAsset,
}: {
  data: CoinCurrent;
  displayCurrency: Currency;
  homeCurrency: Currency;
  exchangeRates: ExchangeRates;
  activeAsset: AssetId;
}) {
  const assetConfig = ASSETS[activeAsset];
  const dc = displayCurrency.toLowerCase();
  const hc = homeCurrency.toLowerCase();
  const assetPrices = exchangeRates.coinPrices[activeAsset] ?? {};
  const rate = dc === hc ? 1 : (assetPrices[dc] ?? 1) / (assetPrices[hc] ?? 1);

  const symbol = CURRENCY_SYMBOLS[displayCurrency] ?? "$";
  const price = data.price * rate;
  const ath = data.ath * rate;
  const high = data.high24h * rate;
  const low = data.low24h * rate;
  const marketCap = data.marketCap * rate;

  const homeSymbol = CURRENCY_SYMBOLS[homeCurrency] ?? "$";
  const showSecondary = displayCurrency !== homeCurrency;

  // Derive home-currency-to-USD rate (e.g. "1 AUD = 0.6350 USD")
  const hcUsdRate =
    hc !== "usd" && assetPrices["usd"] && assetPrices[hc]
      ? assetPrices["usd"] / assetPrices[hc]
      : null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-1 text-xs font-medium uppercase tracking-wider text-gray-400">
        {assetConfig.name} ({assetConfig.symbol})
      </div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-3xl font-bold text-gray-900">
          {symbol}
          {fmt(price)}
        </h2>
        {showSecondary && (
          <span className="text-lg text-gray-400">
            {homeSymbol}
            {fmt(data.price)}
          </span>
        )}
        {!showSecondary && displayCurrency !== "USD" && (
          <span className="text-lg text-gray-400">${fmt(data.priceUsd)}</span>
        )}
        <span
          className={`text-lg font-medium ${pctColor(data.priceChange24h)}`}
        >
          {pct(data.priceChange24h)} 24h
        </span>
        <span className={`text-sm ${pctColor(data.priceChange7d)}`}>
          {pct(data.priceChange7d)} 7d
        </span>
        <span className={`text-sm ${pctColor(data.priceChange30d)}`}>
          {pct(data.priceChange30d)} 30d
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-500">
        <span>
          ATH: {symbol}
          {fmt(ath)} ({pct(data.athChange)})
        </span>
        <span>
          24h: {symbol}
          {fmt(low)} – {symbol}
          {fmt(high)}
        </span>
        <span>
          MCap: {symbol}
          {fmt(marketCap)}
        </span>
        {hcUsdRate != null && (
          <span>
            {homeCurrency}/USD: {hcUsdRate.toFixed(4)}
          </span>
        )}
      </div>
    </div>
  );
}
