import { useEffect, useMemo, useState } from "react";
import { fetchKlines, type Interval } from "@/lib/binance";
import { computeSignal, type Candle } from "@/lib/indicators";
import { PriceChart } from "@/components/PriceChart";
import { SignalCard } from "@/components/SignalCard";
import { Activity, RefreshCw } from "lucide-react";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT"];
const INTERVALS: Interval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

const Index = () => {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [interval, setInterval] = useState<Interval>("15m");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchKlines(symbol, interval, 200);
      setCandles(data);
      setUpdated(new Date());
    } catch (e: any) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = window.setInterval(load, 30_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, interval]);

  const signal = useMemo(() => computeSignal(candles), [candles]);
  const price = candles[candles.length - 1]?.close ?? 0;

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/50 backdrop-blur-sm sticky top-0 z-10 bg-background/60">
        <div className="container flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-bull flex items-center justify-center glow-bull">
              <Activity className="w-5 h-5 text-primary-foreground" strokeWidth={3} />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight">SIGNAL<span className="text-primary">.</span>BOT</h1>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Binary trading signals</p>
            </div>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/70 transition text-sm font-medium border border-border"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </header>

      <main className="container py-8 space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-card border border-border card-elevated">
            {SYMBOLS.map((s) => (
              <button
                key={s}
                onClick={() => setSymbol(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide transition ${
                  symbol === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s.replace("USDT", "")}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-card border border-border card-elevated">
            {INTERVALS.map((i) => (
              <button
                key={i}
                onClick={() => setInterval(i)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition ${
                  interval === i ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {i}
              </button>
            ))}
          </div>
          {updated && (
            <span className="text-xs text-muted-foreground ml-auto flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-bull animate-pulse-glow" />
              Live · updated {updated.toLocaleTimeString()}
            </span>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-destructive text-sm">{error}</div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-2xl bg-card card-elevated border border-border p-4">
            <PriceChart candles={candles} />
          </div>
          <div>
            <SignalCard signal={signal} price={price} symbol={symbol} />
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center max-w-2xl mx-auto pt-4">
          ⚠️ This tool is for educational purposes only. Signals are derived from technical indicators (RSI, EMA, MACD)
          and do not constitute financial advice. Trade at your own risk.
        </p>
      </main>
    </div>
  );
};

export default Index;
