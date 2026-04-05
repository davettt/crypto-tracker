import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  AreaSeries,
  LineSeries,
} from "lightweight-charts";
import type { ChartData, Currency, ExchangeRates, AssetId } from "../types";
import { ASSETS, CURRENCY_SYMBOLS } from "../types";

export default function PriceChart({
  data,
  displayCurrency,
  exchangeRates,
  activeAsset,
}: {
  data: ChartData;
  displayCurrency: Currency;
  exchangeRates: ExchangeRates;
  activeAsset: AssetId;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const assetConfig = ASSETS[activeAsset];

  useEffect(() => {
    const container = containerRef.current;
    if (!container || data.daily.length === 0) return;

    // Chart data is in USD; convert to display currency
    const dc = displayCurrency.toLowerCase();
    const assetPrices = exchangeRates.coinPrices[activeAsset] ?? {};
    const usdPrice = assetPrices["usd"] ?? 1;
    const dcPrice = assetPrices[dc] ?? usdPrice;
    const rate = dcPrice / usdPrice;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#9ca3af",
      },
      grid: {
        vertLines: { color: "#f3f4f6" },
        horzLines: { color: "#f3f4f6" },
      },
      width: container.clientWidth,
      height: 400,
      timeScale: {
        borderColor: "#e5e7eb",
      },
      rightPriceScale: {
        borderColor: "#e5e7eb",
      },
    });

    const priceSeries = chart.addSeries(AreaSeries, {
      topColor: "rgba(59, 130, 246, 0.15)",
      bottomColor: "rgba(59, 130, 246, 0.02)",
      lineColor: "#3b82f6",
      lineWidth: 2,
    });

    const ma200Series = chart.addSeries(LineSeries, {
      color: "#f59e0b",
      lineWidth: 2,
      lineStyle: 2,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    priceSeries.setData(
      data.daily.map((d) => ({ time: d.date, value: d.price * rate })),
    );

    ma200Series.setData(
      data.daily
        .filter((d) => d.ma200 != null)
        .map((d) => ({
          time: d.date,
          value: (d.ma200 as number) * rate,
        })),
    );

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (container) {
        chart.applyOptions({ width: container.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [data, displayCurrency, exchangeRates, activeAsset]);

  const symbol = CURRENCY_SYMBOLS[displayCurrency] ?? "$";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-4">
        <h3 className="text-sm font-semibold text-gray-700">
          {assetConfig.symbol}/{displayCurrency}
        </h3>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 bg-blue-500" /> Price (
            {symbol})
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-amber-500" />{" "}
            200-Day MA
          </span>
        </div>
      </div>
      <div ref={containerRef} />
    </div>
  );
}
