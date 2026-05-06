import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";
import type { Candle } from "@/lib/indicators";
import { ema } from "@/lib/indicators";
import type { Marker } from "@/lib/historicalSignals";

export const PriceChart = ({ candles, markers }: { candles: Candle[]; markers: Marker[] }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const ema20Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const markersRef = useRef<ReturnType<typeof createSeriesMarkers> | null>(null);

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
    const e20 = chart.addSeries(LineSeries, { color: "hsl(45, 95%, 58%)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    const e50 = chart.addSeries(LineSeries, { color: "hsl(280, 90%, 60%)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });

    chartRef.current = chart;
    seriesRef.current = series;
    ema20Ref.current = e20;
    ema50Ref.current = e50;
    markersRef.current = createSeriesMarkers(series, []);

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
    const closes = candles.map((c) => c.close);
    const e20 = ema(closes, 20);
    const e50 = ema(closes, 50);
    ema20Ref.current?.setData(candles.map((c, i) => ({ time: c.time as any, value: e20[i] })));
    ema50Ref.current?.setData(candles.map((c, i) => ({ time: c.time as any, value: e50[i] })));
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  useEffect(() => {
    if (!markersRef.current) return;
    markersRef.current.setMarkers(
      markers.map((m) => ({
        time: m.time as any,
        position: m.action === "BUY" ? "belowBar" : "aboveBar",
        color: m.action === "BUY" ? "hsl(152, 76%, 50%)" : "hsl(0, 84%, 62%)",
        shape: m.action === "BUY" ? "arrowUp" : "arrowDown",
        text: `${m.action} ${m.confidence}%`,
      }))
    );
  }, [markers]);

  return (
    <div>
      <div ref={containerRef} className="w-full" />
      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-neutral" /> EMA20</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5" style={{ background: "hsl(280, 90%, 60%)" }} /> EMA50</span>
        <span className="flex items-center gap-1.5"><span className="text-bull font-bold">▲</span> BUY signal</span>
        <span className="flex items-center gap-1.5"><span className="text-bear font-bold">▼</span> SELL signal</span>
      </div>
    </div>
  );
};
