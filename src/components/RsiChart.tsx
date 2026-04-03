import { useEffect, useRef } from "react";
import { createChart, ColorType, LineSeries } from "lightweight-charts";
import type { ChartData } from "../types";

export default function RsiChart({ data }: { data: ChartData }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || data.weekly.length === 0) return;

    const rsiData = data.weekly.filter((w) => w.rsi != null);
    if (rsiData.length === 0) return;

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
      height: 200,
      timeScale: {
        borderColor: "#e5e7eb",
      },
      rightPriceScale: {
        borderColor: "#e5e7eb",
      },
    });

    const rsiSeries = chart.addSeries(LineSeries, {
      color: "#8b5cf6",
      lineWidth: 2,
    });

    rsiSeries.setData(
      rsiData.map((d) => ({ time: d.date, value: d.rsi as number })),
    );

    const overbought = chart.addSeries(LineSeries, {
      color: "#ef444466",
      lineWidth: 1,
      lineStyle: 2,
    });
    const oversold = chart.addSeries(LineSeries, {
      color: "#22c55e66",
      lineWidth: 1,
      lineStyle: 2,
    });

    overbought.setData(rsiData.map((d) => ({ time: d.date, value: 70 })));
    oversold.setData(rsiData.map((d) => ({ time: d.date, value: 30 })));

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
  }, [data]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-4">
        <h3 className="text-sm font-semibold text-gray-700">Weekly RSI (14)</h3>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 bg-purple-500" /> RSI
          </span>
          <span>Below 30 = oversold (buy) · Above 70 = overbought (sell)</span>
        </div>
      </div>
      <div ref={containerRef} />
    </div>
  );
}
