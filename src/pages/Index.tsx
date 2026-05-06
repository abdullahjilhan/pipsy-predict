import { useEffect, useMemo, useState } from "react";
import { fetchKlines, type Interval } from "@/lib/binance";
import { fetchForexCandles, FOREX_PAIRS } from "@/lib/forex";
import { computeSignal, type Candle } from "@/lib/indicators";
import { computeHistoricalSignals } from "@/lib/historicalSignals";
import { PriceChart } from "@/components/PriceChart";
import { SignalCard } from "@/components/SignalCard";
import { Activity, Bell, BellOff, RefreshCw, Volume2, VolumeX } from "lucide-react";
import { useSignalAlerts } from "@/hooks/useSignalAlerts";

type Market = "crypto" | "forex";

const CRYPTO_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT"];
const INTERVALS: Interval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

const Index = () => {
  const [market, setMarket] = useState<Market>("crypto");
  const [symbol, setSymbol] = useState<string>("BTCUSDT");
  const [interval, setInterval] = useState<Interval>("15m");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);

  const symbols = market === "crypto" ? CRYPTO_SYMBOLS : FOREX_PAIRS;

  // Forex auto-refresh slower (free TwelveData = 8 req/min)
  const refreshMs = market === "forex" ? 60_000 : 30_000;

  useEffect(() => {
    // Switch default symbol when market changes
    setSymbol(market === "crypto" ? "BTCUSDT" : "EUR/USD");
    setCandles([]);
  }, [market]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = market === "crypto"
        ? await fetchKlines(symbol, interval, 200)
        : await fetchForexCandles(symbol, interval, 200);
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
    const id = window.setInterval(load, refreshMs);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, interval, market]);

  const signal = useMemo(() => computeSignal(candles), [candles]);
  const historicalMarkers = useMemo(() => computeHistoricalSignals(candles), [candles]);
  const price = candles[candles.length - 1]?.close ?? 0;
  const { soundEnabled, setSoundEnabled, notifPermission, requestPermission, history } = useSignalAlerts({
    action: signal?.action,
    symbol,
    price,
    confidence: signal?.confidence ?? 0,
  });

  const displaySymbol = (s: string) => market === "crypto" ? s.replace("USDT", "") : s;

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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSoundEnabled((v) => !v)}
              title={soundEnabled ? "Mute alerts" : "Enable sound alerts"}
              className="p-2 rounded-lg bg-secondary hover:bg-secondary/70 transition border border-border"
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-primary" /> : <VolumeX className="w-4 h-4 text-muted-foreground" />}
            </button>
            <button
              onClick={requestPermission}
              title={notifPermission === "granted" ? "Notifications on" : "Enable browser notifications"}
              className="p-2 rounded-lg bg-secondary hover:bg-secondary/70 transition border border-border"
            >
              {notifPermission === "granted"
                ? <Bell className="w-4 h-4 text-primary" />
                : <BellOff className="w-4 h-4 text-muted-foreground" />}
            </button>
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/70 transition text-sm font-medium border border-border"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="container py-8 space-y-6">
        {/* Market toggle */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-card border border-border card-elevated w-fit">
          {(["crypto", "forex"] as Market[]).map((m) => (
            <button
              key={m}
              onClick={() => setMarket(m)}
              className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition ${
                market === m ? "gradient-bull text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-card border border-border card-elevated flex-wrap">
            {symbols.map((s) => (
              <button
                key={s}
                onClick={() => setSymbol(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide transition ${
                  symbol === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {displaySymbol(s)}
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
            <PriceChart candles={candles} markers={historicalMarkers} />
          </div>
          <div className="space-y-6">
            <SignalCard signal={signal} price={price} symbol={symbol} />
            <div className="rounded-2xl bg-card card-elevated border border-border p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Alert history</h3>
                <span className="text-[10px] text-muted-foreground">{history.length} events</span>
              </div>
              {history.length === 0 ? (
                <p className="text-xs text-muted-foreground">No signal changes yet. Alerts trigger when the action flips to BUY or SELL.</p>
              ) : (
                <ul className="space-y-2 max-h-56 overflow-y-auto">
                  {history.map((h, i) => (
                    <li key={i} className="flex items-center justify-between text-xs border-b border-border/50 pb-2 last:border-0 gap-2">
                      <span className={`font-black tracking-wide ${h.action === "BUY" ? "text-bull" : "text-bear"}`}>{h.action}</span>
                      <span className="text-muted-foreground">{h.symbol}</span>
                      <span className="tabular-nums">{h.price.toLocaleString(undefined, { maximumFractionDigits: 5 })}</span>
                      <span className="text-muted-foreground">{h.confidence}%</span>
                      <span className="text-muted-foreground">{h.at.toLocaleTimeString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center max-w-2xl mx-auto pt-4">
          ⚠️ Educational use only. Signals are derived from technical indicators (RSI, EMA, MACD) on
          {" "}{market === "crypto" ? "Binance" : "TwelveData"} feeds and do not constitute financial advice.
        </p>
      </main>
    </div>
  );
};

export default Index;
