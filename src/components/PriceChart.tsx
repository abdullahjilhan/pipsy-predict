import { useEffect, useRef } from "react";
import { createChart, CandlestickSeries, type IChartApi, type ISeriesApi } from "lightweight-charts";
import type { Candle } from "@/lib/indicators";

export const PriceChart = ({ candles }: { candles: Candle[] }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { color: "transparent" }, textColor: "hsl(215, 20%, 60%)" },
      grid: {
        vertLines: { color: "hsl(222, 22%, 14%)" },
        horzLines: { color: "hsl(222, 22%, 14%)" },
      },
      timeScale: { timeVisible: true, borderColor: "hsl(222, 22%, 16%)" },
      rightPriceScale: { borderColor: "hsl(222, 22%, 16%)" },
      width: containerRef.current.clientWidth,
      height: 420,
      crosshair: { mode: 1 },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "hsl(152, 76%, 50%)",
      downColor: "hsl(0, 84%, 62%)",
      borderUpColor: "hsl(152, 76%, 50%)",
      borderDownColor: "hsl(0, 84%, 62%)",
      wickUpColor: "hsl(152, 76%, 50%)",
      wickDownColor: "hsl(0, 84%, 62%)",
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return;
    seriesRef.current.setData(candles.map((c) => ({ time: c.time as any, open: c.open, high: c.high, low: c.low, close: c.close })));
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  return <div ref={containerRef} className="w-full" />;
};
