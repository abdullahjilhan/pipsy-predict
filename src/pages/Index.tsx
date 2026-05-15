import { useEffect, useMemo, useRef, useState } from "react";
import { createChart, CandlestickSeries, LineSeries, type IChartApi, type ISeriesApi } from "lightweight-charts";
import { Activity, ArrowDown, ArrowUp, Bell, BellOff, Minus, RefreshCw, TrendingUp, Volume2, VolumeX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Market = "crypto" | "forex";

// ============================================================
// TYPES
// ============================================================
type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
type Interval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
type Action = "BUY" | "SELL" | "HOLD";
type Signal = {
  action: Action;
  confidence: number;
  prediction: "BULLISH" | "BEARISH" | "NEUTRAL";
  reasons: string[];
  rsi: number;
  ema20: number;
  ema50: number;
  ema200: number;
  macdHist: number;
  stochK: number;
  adx: number;
  bbUpper: number;
  bbLower: number;
  score: number;
};

// ============================================================
// DATA FETCH
// ============================================================
async function fetchCryptoCandles(symbol: string, interval: Interval, limit = 500): Promise<Candle[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch crypto market data");
  const raw: any[] = await res.json();
  return raw.map((k) => ({
    time: Math.floor(k[0] / 1000),
    open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
  }));
}

async function fetchForexCandles(symbol: string, interval: Interval): Promise<Candle[]> {
  const { data, error } = await supabase.functions.invoke("forex-klines", {
    body: { symbol, interval },
  });
  if (error) throw new Error(error.message || "Failed to fetch forex data");
  if (data?.error) throw new Error(data.error);
  if (data?.warning) console.warn(data.warning);
  return data.candles as Candle[];
}

// ============================================================
// INDICATORS
// ============================================================
function sma(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}
function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0];
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}
function rsi(closes: number[], period = 14): number[] {
  const out: number[] = new Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) g += d; else l -= d;
  }
  let aG = g / period, aL = l / period;
  out[period] = 100 - 100 / (1 + (aL === 0 ? 100 : aG / aL));
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    aG = (aG * (period - 1) + (d > 0 ? d : 0)) / period;
    aL = (aL * (period - 1) + (d < 0 ? -d : 0)) / period;
    out[i] = 100 - 100 / (1 + (aL === 0 ? 100 : aG / aL));
  }
  return out;
}
function macd(closes: number[], fast = 12, slow = 26, signal = 9) {
  const ef = ema(closes, fast), es = ema(closes, slow);
  const line = closes.map((_, i) => ef[i] - es[i]);
  const sig = ema(line, signal);
  const hist = line.map((v, i) => v - sig[i]);
  return { line, sig, hist };
}
function stochastic(candles: Candle[], kPeriod = 14, dPeriod = 3) {
  const k: number[] = new Array(candles.length).fill(NaN);
  for (let i = kPeriod - 1; i < candles.length; i++) {
    let hi = -Infinity, lo = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (candles[j].high > hi) hi = candles[j].high;
      if (candles[j].low < lo) lo = candles[j].low;
    }
    k[i] = hi === lo ? 50 : ((candles[i].close - lo) / (hi - lo)) * 100;
  }
  const d = sma(k.map((v) => (isNaN(v) ? 0 : v)), dPeriod);
  return { k, d };
}
function bollinger(closes: number[], period = 20, mult = 2) {
  const m = sma(closes, period);
  const upper: number[] = new Array(closes.length).fill(NaN);
  const lower: number[] = new Array(closes.length).fill(NaN);
  for (let i = period - 1; i < closes.length; i++) {
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += (closes[j] - m[i]) ** 2;
    const sd = Math.sqrt(s / period);
    upper[i] = m[i] + mult * sd;
    lower[i] = m[i] - mult * sd;
  }
  return { mid: m, upper, lower };
}
function atr(candles: Candle[], period = 14): number[] {
  const tr: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) tr.push(candles[i].high - candles[i].low);
    else {
      const c = candles[i], p = candles[i - 1];
      tr.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
    }
  }
  return ema(tr, period);
}
function adx(candles: Candle[], period = 14): number[] {
  const len = candles.length;
  const plusDM: number[] = [0], minusDM: number[] = [0], tr: number[] = [0];
  for (let i = 1; i < len; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const dn = candles[i - 1].low - candles[i].low;
    plusDM.push(up > dn && up > 0 ? up : 0);
    minusDM.push(dn > up && dn > 0 ? dn : 0);
    const c = candles[i], p = candles[i - 1];
    tr.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  const atrV = ema(tr, period);
  const pDI = ema(plusDM, period).map((v, i) => (atrV[i] ? (100 * v) / atrV[i] : 0));
  const mDI = ema(minusDM, period).map((v, i) => (atrV[i] ? (100 * v) / atrV[i] : 0));
  const dx = pDI.map((p, i) => {
    const sum = p + mDI[i];
    return sum === 0 ? 0 : (100 * Math.abs(p - mDI[i])) / sum;
  });
  return ema(dx, period);
}

// ============================================================
// SIGNAL ENGINE (multi-indicator, weighted, trend-filtered)
// ============================================================
function computeSignal(candles: Candle[]): Signal | null {
  if (candles.length < 210) return null;
  const closes = candles.map((c) => c.close);
  const vols = candles.map((c) => c.volume);
  const r = rsi(closes, 14);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const e200 = ema(closes, 200);
  const m = macd(closes);
  const st = stochastic(candles);
  const bb = bollinger(closes, 20, 2);
  const adxV = adx(candles, 14);
  const volMA = sma(vols, 20);
  const i = closes.length - 1;
  const last = candles[i], prev = candles[i - 1];

  let score = 0;
  const reasons: string[] = [];

  // 1) Long-term trend filter (EMA200) — weight 2
  if (last.close > e200[i]) { score += 2; reasons.push("Price above EMA200 (macro uptrend)"); }
  else { score -= 2; reasons.push("Price below EMA200 (macro downtrend)"); }

  // 2) EMA20/50 cross — weight 1.5
  if (e20[i] > e50[i]) { score += 1.5; reasons.push("EMA20 > EMA50 (bullish trend)"); }
  else { score -= 1.5; reasons.push("EMA20 < EMA50 (bearish trend)"); }

  // 3) RSI — weight up to 2
  if (r[i] < 30) { score += 2; reasons.push(`RSI ${r[i].toFixed(1)} oversold (reversal up)`); }
  else if (r[i] > 70) { score -= 2; reasons.push(`RSI ${r[i].toFixed(1)} overbought (reversal down)`); }
  else if (r[i] > 55) { score += 0.7; reasons.push(`RSI ${r[i].toFixed(1)} bullish momentum`); }
  else if (r[i] < 45) { score -= 0.7; reasons.push(`RSI ${r[i].toFixed(1)} bearish momentum`); }

  // 4) MACD histogram + slope — weight up to 1.8
  const histRising = m.hist[i] > m.hist[i - 1];
  if (m.hist[i] > 0 && histRising) { score += 1.8; reasons.push("MACD positive & rising"); }
  else if (m.hist[i] < 0 && !histRising) { score -= 1.8; reasons.push("MACD negative & falling"); }
  else if (m.hist[i] > 0) { score += 0.6; reasons.push("MACD positive"); }
  else { score -= 0.6; reasons.push("MACD negative"); }

  // 5) Stochastic — weight up to 1.2
  const kCross = st.k[i] > st.d[i] && st.k[i - 1] <= st.d[i - 1];
  const dCross = st.k[i] < st.d[i] && st.k[i - 1] >= st.d[i - 1];
  if (st.k[i] < 20 && kCross) { score += 1.2; reasons.push("Stoch bullish cross from oversold"); }
  else if (st.k[i] > 80 && dCross) { score -= 1.2; reasons.push("Stoch bearish cross from overbought"); }
  else if (st.k[i] < 20) { score += 0.5; reasons.push("Stoch oversold"); }
  else if (st.k[i] > 80) { score -= 0.5; reasons.push("Stoch overbought"); }

  // 6) Bollinger bands — weight 1
  if (last.close <= bb.lower[i]) { score += 1; reasons.push("Price at lower BB (mean-reversion buy)"); }
  else if (last.close >= bb.upper[i]) { score -= 1; reasons.push("Price at upper BB (mean-reversion sell)"); }

  // 7) Volume confirmation — weight 0.8
  const volSpike = last.volume > volMA[i] * 1.5;
  const bullCandle = last.close > last.open;
  if (volSpike && bullCandle) { score += 0.8; reasons.push("High volume bullish candle"); }
  else if (volSpike && !bullCandle) { score -= 0.8; reasons.push("High volume bearish candle"); }

  // 8) Engulfing candle pattern — weight 1
  const bullEngulf = prev.close < prev.open && last.close > last.open && last.close > prev.open && last.open < prev.close;
  const bearEngulf = prev.close > prev.open && last.close < last.open && last.close < prev.open && last.open > prev.close;
  if (bullEngulf) { score += 1; reasons.push("Bullish engulfing pattern"); }
  if (bearEngulf) { score -= 1; reasons.push("Bearish engulfing pattern"); }

  // 9) ADX trend strength gate — amplify if strong, dampen if weak
  const trendStrength = adxV[i];
  if (trendStrength > 25) {
    score *= 1.15;
    reasons.push(`ADX ${trendStrength.toFixed(0)} strong trend`);
  } else if (trendStrength < 18) {
    score *= 0.7;
    reasons.push(`ADX ${trendStrength.toFixed(0)} weak/ranging — caution`);
  }

  const maxScore = 11;
  const confidence = Math.min(100, Math.round((Math.abs(score) / maxScore) * 100));
  let action: Action = "HOLD";
  let prediction: Signal["prediction"] = "NEUTRAL";
  // Higher threshold => fewer but more accurate signals
  if (score >= 3.5) { action = "BUY"; prediction = "BULLISH"; }
  else if (score <= -3.5) { action = "SELL"; prediction = "BEARISH"; }

  return {
    action, confidence, prediction, reasons, score,
    rsi: r[i], ema20: e20[i], ema50: e50[i], ema200: e200[i],
    macdHist: m.hist[i], stochK: st.k[i], adx: trendStrength,
    bbUpper: bb.upper[i], bbLower: bb.lower[i],
  };
}

// ============================================================
// ALERT SYSTEM (sound + browser notifications)
// ============================================================
function playTone(action: Action) {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = "sine";
    const seq = action === "BUY" ? [523, 659, 784] : [784, 659, 523];
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    seq.forEach((f, i) => o.frequency.setValueAtTime(f, ctx.currentTime + i * 0.12));
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    o.start(); o.stop(ctx.currentTime + 0.5);
  } catch {}
}

// ============================================================
// CHART
// ============================================================
const PriceChart = ({ candles, signal }: { candles: Candle[]; signal: Signal | null }) => {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const csRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const ema20Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50Ref = useRef<ISeriesApi<"Line"> | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      layout: { background: { color: "transparent" }, textColor: "hsl(215, 20%, 60%)" },
      grid: { vertLines: { color: "hsl(222, 22%, 14%)" }, horzLines: { color: "hsl(222, 22%, 14%)" } },
      timeScale: { timeVisible: true, borderColor: "hsl(222, 22%, 16%)" },
      rightPriceScale: { borderColor: "hsl(222, 22%, 16%)" },
      width: ref.current.clientWidth, height: 420, crosshair: { mode: 1 },
    });
    csRef.current = chart.addSeries(CandlestickSeries, {
      upColor: "hsl(152, 76%, 50%)", downColor: "hsl(0, 84%, 62%)",
      borderUpColor: "hsl(152, 76%, 50%)", borderDownColor: "hsl(0, 84%, 62%)",
      wickUpColor: "hsl(152, 76%, 50%)", wickDownColor: "hsl(0, 84%, 62%)",
    });
    ema20Ref.current = chart.addSeries(LineSeries, { color: "hsl(199, 89%, 60%)", lineWidth: 1 });
    ema50Ref.current = chart.addSeries(LineSeries, { color: "hsl(45, 93%, 60%)", lineWidth: 1 });
    chartRef.current = chart;
    const ro = new ResizeObserver(() => ref.current && chart.applyOptions({ width: ref.current.clientWidth }));
    ro.observe(ref.current);
    return () => { ro.disconnect(); chart.remove(); };
  }, []);

  useEffect(() => {
    if (!csRef.current || !candles.length) return;
    csRef.current.setData(candles.map((c) => ({ time: c.time as any, open: c.open, high: c.high, low: c.low, close: c.close })));
    const closes = candles.map((c) => c.close);
    const e20 = ema(closes, 20), e50 = ema(closes, 50);
    ema20Ref.current?.setData(candles.map((c, i) => ({ time: c.time as any, value: e20[i] })));
    ema50Ref.current?.setData(candles.map((c, i) => ({ time: c.time as any, value: e50[i] })));
    chartRef.current?.timeScale().fitContent();
  }, [candles, signal]);

  return <div ref={ref} className="w-full" />;
};

// ============================================================
// CONSTANTS
// ============================================================
const CRYPTO_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT"];
const FOREX_SYMBOLS = ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CAD", "XAU/USD"];
const INTERVALS: Interval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

const labelOf = (s: string) => s.replace("USDT", "");
const priceFmt = (market: Market, p: number) =>
  market === "forex"
    ? p.toLocaleString(undefined, { maximumFractionDigits: 5, minimumFractionDigits: 2 })
    : p.toLocaleString(undefined, { maximumFractionDigits: 2 });

// ============================================================
// MAIN
// ============================================================
const Index = () => {
  const [market, setMarket] = useState<Market>("crypto");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [interval, setInterval] = useState<Interval>("15m");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);

  const [soundEnabled, setSoundEnabled] = useState(false);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
  const [history, setHistory] = useState<{ action: Action; symbol: string; price: number; confidence: number; at: Date }[]>([]);
  const lastActionRef = useRef<Action | null>(null);

  const symbols = market === "crypto" ? CRYPTO_SYMBOLS : FOREX_SYMBOLS;

  const switchMarket = (m: Market) => {
    setMarket(m);
    setSymbol(m === "crypto" ? CRYPTO_SYMBOLS[0] : FOREX_SYMBOLS[0]);
    setCandles([]);
  };

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const data = market === "crypto"
        ? await fetchCryptoCandles(symbol, interval, 500)
        : await fetchForexCandles(symbol, interval);
      if (!data.length) throw new Error("Forex data is temporarily unavailable. Please try again shortly.");
      setCandles(data); setUpdated(new Date());
    } catch (e: any) {
      setError(e.message || "Failed to load");
      setCandles([]);
    }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const id = window.setInterval(load, 30_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, interval, market]);

  const signal = useMemo(() => computeSignal(candles), [candles]);
  const price = candles[candles.length - 1]?.close ?? 0;

  // Alerts on action flips to BUY/SELL
  useEffect(() => {
    if (!signal) return;
    const a = signal.action;
    const prev = lastActionRef.current;
    if (a !== prev && (a === "BUY" || a === "SELL")) {
      setHistory((h) => [{ action: a, symbol, price, confidence: signal.confidence, at: new Date() }, ...h].slice(0, 20));
      if (soundEnabled) playTone(a);
      if (notifPermission === "granted") {
        try {
          new Notification(`${a} signal · ${symbol}`, {
            body: `Confidence ${signal.confidence}% · ${priceFmt(market, price)}`,
          });
        } catch {}
      }
    }
    lastActionRef.current = a;
  }, [signal, symbol, price, soundEnabled, notifPermission]);

  const requestPermission = async () => {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    setNotifPermission(p);
  };

  const isBuy = signal?.action === "BUY";
  const isSell = signal?.action === "SELL";
  const gradient = isBuy ? "gradient-bull" : isSell ? "gradient-bear" : "gradient-neutral";
  const glow = isBuy ? "glow-bull" : isSell ? "glow-bear" : "";
  const ActionIcon = isBuy ? ArrowUp : isSell ? ArrowDown : Minus;

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/50 backdrop-blur-sm sticky top-0 z-10 bg-background/60">
        <div className="container flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-bull flex items-center justify-center glow-bull">
              <Activity className="w-5 h-5 text-primary-foreground" strokeWidth={3} />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight">PIPSY<span className="text-primary">.</span>SIGNALS</h1>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Crypto &amp; Forex signal platform</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setSoundEnabled((v) => !v)} title={soundEnabled ? "Mute" : "Enable sound"}
              className="p-2 rounded-lg bg-secondary hover:bg-secondary/70 transition border border-border">
              {soundEnabled ? <Volume2 className="w-4 h-4 text-primary" /> : <VolumeX className="w-4 h-4 text-muted-foreground" />}
            </button>
            <button onClick={requestPermission} title="Notifications"
              className="p-2 rounded-lg bg-secondary hover:bg-secondary/70 transition border border-border">
              {notifPermission === "granted"
                ? <Bell className="w-4 h-4 text-primary" />
                : <BellOff className="w-4 h-4 text-muted-foreground" />}
            </button>
            <button onClick={load} disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/70 transition text-sm font-medium border border-border">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="container py-8 space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-card border border-border card-elevated">
            {(["crypto", "forex"] as Market[]).map((m) => (
              <button key={m} onClick={() => switchMarket(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition ${
                  market === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}>
                {m}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-card border border-border card-elevated flex-wrap">
            {symbols.map((s) => (
              <button key={s} onClick={() => setSymbol(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide transition ${
                  symbol === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}>
                {labelOf(s)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-card border border-border card-elevated">
            {INTERVALS.map((i) => (
              <button key={i} onClick={() => setInterval(i)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition ${
                  interval === i ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                }`}>
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
            <PriceChart candles={candles} signal={signal} />
          </div>

          <div className="space-y-6">
            {/* SIGNAL CARD */}
            <div className="rounded-2xl bg-card card-elevated border border-border overflow-hidden">
              {!signal ? (
                <div className="p-6 text-muted-foreground text-sm">Loading signal…</div>
              ) : (
                <>
                  <div className={`${gradient} ${glow} p-6 text-primary-foreground`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-widest opacity-80">{symbol} · Next candle</p>
                        <h2 className="text-5xl font-black tracking-tight mt-1 flex items-center gap-3">
                          <ActionIcon className="w-10 h-10" strokeWidth={3} />
                          {signal.action}
                        </h2>
                        <p className="mt-2 text-sm font-medium opacity-90">Predicted: {signal.prediction}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs uppercase tracking-widest opacity-80">Confidence</p>
                        <p className="text-4xl font-black">{signal.confidence}%</p>
                        <p className="text-xs mt-2 opacity-80">Price</p>
                        <p className="text-lg font-bold tabular-nums">
                          {market === "crypto" ? "$" : ""}{priceFmt(market, price)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <Metric label="RSI(14)" value={signal.rsi.toFixed(1)}
                        accent={signal.rsi > 70 ? "bear" : signal.rsi < 30 ? "bull" : undefined} />
                      <Metric label="Stoch %K" value={signal.stochK.toFixed(1)}
                        accent={signal.stochK > 80 ? "bear" : signal.stochK < 20 ? "bull" : undefined} />
                      <Metric label="ADX" value={signal.adx.toFixed(1)}
                        accent={signal.adx > 25 ? "bull" : undefined} />
                      <Metric label="EMA20" value={signal.ema20.toFixed(2)} />
                      <Metric label="EMA200" value={signal.ema200.toFixed(2)} />
                      <Metric label="MACD H" value={signal.macdHist.toFixed(4)}
                        accent={signal.macdHist > 0 ? "bull" : "bear"} />
                    </div>

                    <div>
                      <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2">
                        <TrendingUp className="w-3 h-3" /> Reasoning · score {signal.score.toFixed(2)}
                      </p>
                      <ul className="space-y-1.5">
                        {signal.reasons.map((r, i) => (
                          <li key={i} className="text-sm text-foreground/80 flex items-start gap-2">
                            <span className="text-primary mt-1">▸</span>{r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* ALERT HISTORY */}
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
                    <li key={i} className="flex items-center justify-between text-xs border-b border-border/50 pb-2 last:border-0">
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
          ⚠️ Educational only. Signals derived from RSI, Stochastic, EMA(20/50/200), MACD, Bollinger Bands, ADX, volume & candle patterns.
          Not financial advice.
        </p>
      </main>
    </div>
  );
};

const Metric = ({ label, value, accent }: { label: string; value: string; accent?: "bull" | "bear" }) => (
  <div className="rounded-xl bg-secondary/60 border border-border p-3">
    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
    <p className={`text-base font-bold tabular-nums ${accent === "bull" ? "text-bull" : accent === "bear" ? "text-bear" : ""}`}>{value}</p>
  </div>
);

export default Index;
