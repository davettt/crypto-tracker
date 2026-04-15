import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  AreaSeries,
  LineSeries,
  createSeriesMarkers,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";
import type {
  ChartData,
  Currency,
  ExchangeRates,
  AssetId,
  Transaction,
} from "../types";
import { ASSETS, CURRENCY_SYMBOLS } from "../types";

export default function PriceChart({
  data,
  homeCurrency,
  displayCurrency,
  exchangeRates,
  activeAsset,
  currentPrice,
  transactions,
}: {
  data: ChartData;
  homeCurrency: Currency;
  displayCurrency: Currency;
  exchangeRates: ExchangeRates;
  activeAsset: AssetId;
  currentPrice?: number;
  transactions: Transaction[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const assetConfig = ASSETS[activeAsset];

  useEffect(() => {
    const container = containerRef.current;
    if (!container || data.daily.length === 0) return;

    // Chart data is in the home currency it was fetched against (authentic
    // historical prices, not USD converted through today's FX). Fall back to
    // the home currency prop if the response didn't include one.
    const sourceCurrency = (data.currency ?? homeCurrency).toLowerCase();
    const dc = displayCurrency.toLowerCase();
    const assetPrices = exchangeRates.coinPrices[activeAsset] ?? {};
    const srcPrice = assetPrices[sourceCurrency] ?? 1;
    const dcPrice = assetPrices[dc] ?? srcPrice;
    // When display === source (the common case) rate is 1 and no conversion
    // happens — the line and MA are authentic historical values.
    const rate = dc === sourceCurrency ? 1 : dcPrice / srcPrice;

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

    const dailyData = data.daily.map((d, i) => ({
      time: d.date,
      value:
        currentPrice && i === data.daily.length - 1
          ? currentPrice * rate
          : d.price * rate,
    }));
    priceSeries.setData(dailyData);

    ma200Series.setData(
      data.daily
        .filter((d) => d.ma200 != null)
        .map((d) => ({
          time: d.date,
          value: (d.ma200 as number) * rate,
        })),
    );

    // Transaction markers — green dot = buy, red dot = sell, positioned at
    // the historical price in display currency. See README for FX caveat.
    const firstDay = data.daily[0];
    const lastDay = data.daily[data.daily.length - 1];
    if (transactions.length > 0 && firstDay && lastDay) {
      const minDate = firstDay.date;
      const maxDate = lastDay.date;

      const markers: SeriesMarker<Time>[] = transactions
        .filter((tx) => {
          if (tx.date < minDate || tx.date > maxDate) return false;
          const txPrice = tx.price ?? tx.priceUsd;
          return txPrice != null && txPrice > 0;
        })
        .map((tx): SeriesMarker<Time> => {
          const txPrice = (tx.price ?? tx.priceUsd) as number;
          const txCurrency = (
            tx.price != null ? tx.currency : "USD"
          ).toLowerCase();

          let markerPrice: number;
          if (txCurrency === dc) {
            markerPrice = txPrice;
          } else {
            const txAssetPrice = assetPrices[txCurrency];
            if (!txAssetPrice || !dcPrice) {
              markerPrice = txPrice;
            } else {
              markerPrice = txPrice * (dcPrice / txAssetPrice);
            }
          }

          const isBuy = tx.type === "buy";
          return {
            time: tx.date as unknown as Time,
            position: "atPriceMiddle",
            shape: "circle",
            color: isBuy ? "#16a34a" : "#dc2626",
            price: markerPrice,
            size: 1,
          };
        })
        .sort((a, b) => {
          const at = a.time as unknown as string;
          const bt = b.time as unknown as string;
          return at < bt ? -1 : at > bt ? 1 : 0;
        });

      if (markers.length > 0) {
        createSeriesMarkers(priceSeries, markers);
      }
    }

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
  }, [
    data,
    homeCurrency,
    displayCurrency,
    exchangeRates,
    activeAsset,
    currentPrice,
    transactions,
  ]);

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
          {transactions.length > 0 && (
            <>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-green-600" />{" "}
                Buy
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-red-600" />{" "}
                Sell
              </span>
            </>
          )}
        </div>
      </div>
      <div ref={containerRef} />
    </div>
  );
}
