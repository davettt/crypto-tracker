import type { BtcCurrent, ExchangeRate, Currency } from "../types";

function fmt(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
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
  exchangeRate,
  currency,
}: {
  data: BtcCurrent;
  exchangeRate: ExchangeRate;
  currency: Currency;
}) {
  const rate = exchangeRate.usdToAud;
  const symbol = currency === "AUD" ? "A$" : "$";
  const price = currency === "AUD" ? data.priceAud : data.price;
  const ath = currency === "AUD" ? data.ath * rate : data.ath;
  const high = currency === "AUD" ? data.high24hAud : data.high24h;
  const low = currency === "AUD" ? data.low24hAud : data.low24h;
  const marketCap = currency === "AUD" ? data.marketCap * rate : data.marketCap;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-3xl font-bold text-gray-900">
          {symbol}
          {fmt(price)}
        </h2>
        {currency === "USD" && (
          <span className="text-lg text-gray-400">A${fmt(data.priceAud)}</span>
        )}
        {currency === "AUD" && (
          <span className="text-lg text-gray-400">${fmt(data.price)}</span>
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
        <span className="text-gray-400">1 USD = {rate.toFixed(4)} AUD</span>
      </div>
    </div>
  );
}
