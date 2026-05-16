import { useEffect, useMemo, useRef, useState } from "react";
import { createChart, CandlestickSeries, LineSeries, type IChartApi, type ISeriesApi } from "lightweight-charts";
import { Activity, ArrowDown, ArrowUp, Bell, BellOff, Minus, RefreshCw, TrendingUp, Volume2, VolumeX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AccuracyDashboard } from "@/components/AccuracyDashboard";
import pipsyLogo from "@/assets/pipsy-logo.png";

type Market = "crypto" | "forex" | "stocks" | "commodities";

// ============================================================
// TYPES
// ============================================================
type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
type Interval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
type Action = "BUY" | "SELL" | "HOLD";

type SignalSettings = {
  rsiPeriod: number;
  rsiOverbought: number;
  rsiOversold: number;
  emaFast: number;
  emaSlow: number;
  emaMacro: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  bbPeriod: number;
  bbStdDev: number;
  stochK: number;
  stochD: number;
  stochOverbought: number;
  stochOversold: number;
  adxPeriod: number;
  adxThreshold: number;
};

type SignalAlignment = {
  emaMacro: boolean;
  adx: boolean;
  macd: boolean;
  emaCross: boolean;
  rsi: boolean;
  stochastic: boolean;
};

type Signal = {
  action: Action;
  confidence: number;
  prediction: "BULLISH" | "BEARISH" | "NEUTRAL";
  reasons: string[];
  rsi: number;
  emaFast: number;
  emaSlow: number;
  emaMacro: number;
  macdHist: number;
  stochK: number;
  stochD: number;
  adx: number;
  bbUpper: number;
  bbLower: number;
  strength: number;
  alignment: SignalAlignment;
  score: number;
};

const MARKET_LABELS: Record<Market, string> = {
  crypto: "Crypto",
  forex: "Forex",
  stocks: "Stocks",
  commodities: "Commodities",
};

const MARKET_PRESETS: Record<Market, SignalSettings> = {
  crypto: {
    rsiPeriod: 21,
    rsiOverbought: 75,
    rsiOversold: 25,
    emaFast: 13,
    emaSlow: 34,
    emaMacro: 200,
    macdFast: 8,
    macdSlow: 17,
    macdSignal: 9,
    bbPeriod: 20,
    bbStdDev: 2.5,
    stochK: 14,
    stochD: 5,
    stochOverbought: 80,
    stochOversold: 20,
    adxPeriod: 14,
    adxThreshold: 30,
  },
  forex: {
    rsiPeriod: 21,
    rsiOverbought: 75,
    rsiOversold: 25,
    emaFast: 8,
    emaSlow: 21,
    emaMacro: 200,
    macdFast: 8,
    macdSlow: 17,
    macdSignal: 9,
    bbPeriod: 20,
    bbStdDev: 2.5,
    stochK: 14,
    stochD: 5,
    stochOverbought: 80,
    stochOversold: 20,
    adxPeriod: 14,
    adxThreshold: 30,
  },
  stocks: {
    rsiPeriod: 21,
    rsiOverbought: 75,
    rsiOversold: 25,
    emaFast: 8,
    emaSlow: 21,
    emaMacro: 200,
    macdFast: 8,
    macdSlow: 17,
    macdSignal: 9,
    bbPeriod: 20,
    bbStdDev: 2.5,
    stochK: 14,
    stochD: 5,
    stochOverbought: 80,
    stochOversold: 20,
    adxPeriod: 14,
    adxThreshold: 30,
  },
  commodities: {
    rsiPeriod: 21,
    rsiOverbought: 75,
    rsiOversold: 25,
    emaFast: 8,
    emaSlow: 21,
    emaMacro: 200,
    macdFast: 8,
    macdSlow: 17,
    macdSignal: 9,
    bbPeriod: 20,
    bbStdDev: 2.5,
    stochK: 14,
    stochD: 5,
    stochOverbought: 80,
    stochOversold: 20,
    adxPeriod: 14,
    adxThreshold: 30,
  },
};

const MARKET_SYMBOLS: Record<Market, string[]> = {
  crypto: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT"],
  forex: ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CAD", "XAU/USD"],
  stocks: ["AAPL", "MSFT", "TSLA", "AMZN", "NVDA"],
  commodities: ["XAU/USD", "XAG/USD", "WTI/USD", "BRENT/USD"],
};

const INDICATOR_INFO = {
  RSI: {
    reason: "Period 21 smooths false signals. Tighter OB/OS levels (75/25) filter only real extremes.",
    role: "Momentum confirmation + reversal timing",
  },
  EMA: {
    reason: "8/21 combo is institutional-grade. 200 EMA is your macro trend filter — only longs above it, only shorts below.",
    role: "Trend direction + momentum crossover",
  },
  MACD: {
    reason: "8/17/9 is more responsive than the 1970s-era default. Catches momentum shifts before the crowd sees them.",
    role: "Momentum entry confirmation",
  },
  BollingerBands: {
    reason: "2.5 std dev handles fat tails in crypto/forex. At 2.0 you get too many false breakout signals in volatile markets.",
    role: "Volatility measurement + breakout detection",
  },
  Stochastic: {
    reason: "D period 5 smooths the signal line, reducing whipsaws. OB/OS levels are well-calibrated.",
    role: "Entry timing precision",
  },
  ADX: {
    reason: "Threshold 30 filters weak/choppy trends. Below 30 = range market, avoid trend-following entries.",
    role: "Trend strength gate",
  },
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
// SIGNAL ENGINE (multi-indicator, 4-layer/6-indicator alignment)
// ============================================================
function computeSignal(candles: Candle[], settings: SignalSettings): Signal | null {
  if (candles.length < Math.max(settings.rsiPeriod, settings.emaMacro, settings.macdSlow, settings.bbPeriod, settings.adxPeriod) + 5) return null;
  const closes = candles.map((c) => c.close);
  const r = rsi(closes, settings.rsiPeriod);
  const eFast = ema(closes, settings.emaFast);
  const eSlow = ema(closes, settings.emaSlow);
  const eMacro = ema(closes, settings.emaMacro);
  const m = macd(closes, settings.macdFast, settings.macdSlow, settings.macdSignal);
  const st = stochastic(candles, settings.stochK, settings.stochD);
  const bb = bollinger(closes, settings.bbPeriod, settings.bbStdDev);
  const adxV = adx(candles, settings.adxPeriod);
  const i = closes.length - 1;
  const last = candles[i];

  const emaMacroLong = Number.isFinite(eMacro[i]) && last.close > eMacro[i];
  const emaMacroShort = Number.isFinite(eMacro[i]) && last.close < eMacro[i];
  const adxStrong = adxV[i] >= settings.adxThreshold;
  const macdLong = Number.isFinite(m.line[i]) && Number.isFinite(m.sig[i]) && m.line[i] > m.sig[i] && m.line[i - 1] <= m.sig[i - 1];
  const macdShort = Number.isFinite(m.line[i]) && Number.isFinite(m.sig[i]) && m.line[i] < m.sig[i] && m.line[i - 1] >= m.sig[i - 1];
  const emaCrossLong = Number.isFinite(eFast[i]) && Number.isFinite(eSlow[i]) && eFast[i] > eSlow[i] && eFast[i - 1] <= eSlow[i - 1];
  const emaCrossShort = Number.isFinite(eFast[i]) && Number.isFinite(eSlow[i]) && eFast[i] < eSlow[i] && eFast[i - 1] >= eSlow[i - 1];
  const rsiLong = Number.isFinite(r[i]) && r[i] < settings.rsiOverbought;
  const rsiShort = Number.isFinite(r[i]) && r[i] > settings.rsiOversold;
  const stochLong = Number.isFinite(st.k[i]) && Number.isFinite(st.d[i]) && st.k[i] > st.d[i] && st.k[i - 1] <= st.d[i - 1] && st.k[i] < settings.stochOverbought;
  const stochShort = Number.isFinite(st.k[i]) && Number.isFinite(st.d[i]) && st.k[i] < st.d[i] && st.k[i - 1] >= st.d[i - 1] && st.k[i] > settings.stochOversold;
  const bbLong = Number.isFinite(bb.lower[i]) && last.close <= bb.lower[i];
  const bbShort = Number.isFinite(bb.upper[i]) && last.close >= bb.upper[i];

  const alignment: SignalAlignment = {
    emaMacro: emaMacroLong || emaMacroShort,
    adx: adxStrong && (emaMacroLong || emaMacroShort),
    macd: macdLong || macdShort,
    emaCross: emaCrossLong || emaCrossShort,
    rsi: rsiLong || rsiShort,
    stochastic: stochLong || stochShort,
  };

  let longCount = 0;
  let shortCount = 0;
  if (emaMacroLong) longCount += 1;
  if (emaMacroShort) shortCount += 1;
  if (adxStrong) {
    if (emaMacroLong) longCount += 1;
    else if (emaMacroShort) shortCount += 1;
  }
  if (macdLong) longCount += 1;
  if (macdShort) shortCount += 1;
  if (emaCrossLong) longCount += 1;
  if (emaCrossShort) shortCount += 1;
  if (rsiLong) longCount += 1;
  if (rsiShort) shortCount += 1;
  if (stochLong) longCount += 1;
  if (stochShort) shortCount += 1;

  const strength = Math.max(longCount, shortCount);
  const reasons: string[] = [];

  if (emaMacroLong) reasons.push("EMA200 says macro uptrend");
  else if (emaMacroShort) reasons.push("EMA200 says macro downtrend");
  else reasons.push("EMA200 is flat or unavailable");

  if (adxStrong) {
    reasons.push(`ADX ${adxV[i].toFixed(0)} above ${settings.adxThreshold} — trend valid`);
  } else {
    reasons.push(`ADX ${adxV[i].toFixed(0)} below ${settings.adxThreshold} — weak trend`);
  }

  if (macdLong) reasons.push("MACD crossed bullishly above signal line");
  else if (macdShort) reasons.push("MACD crossed bearishly below signal line");
  else reasons.push("MACD is neutral or not crossed yet");

  if (emaCrossLong) reasons.push(`EMA${settings.emaFast}/${settings.emaSlow} bullish crossover`);
  else if (emaCrossShort) reasons.push(`EMA${settings.emaFast}/${settings.emaSlow} bearish crossover`);
  else reasons.push(`EMA${settings.emaFast}/${settings.emaSlow} still sorting out`);

  if (rsiLong) reasons.push(`RSI ${r[i].toFixed(1)} below ${settings.rsiOverbought} — longs not overbought`);
  else if (rsiShort) reasons.push(`RSI ${r[i].toFixed(1)} above ${settings.rsiOversold} — shorts not oversold`);
  else reasons.push(`RSI ${r[i].toFixed(1)} in neutral momentum zone`);

  if (stochLong) reasons.push(`Stochastic %K crossed above %D in a bullish zone`);
  else if (stochShort) reasons.push(`Stochastic %K crossed below %D in a bearish zone`);
  else reasons.push("Stochastic not showing a clean directional cross");

  if (bbLong) reasons.push("Price touching lower Bollinger Band — volatility breakout/reversal zone");
  else if (bbShort) reasons.push("Price touching upper Bollinger Band — volatility breakout/reversal zone");
  else reasons.push("Price in BB middle zone — high chop probability");

  const confidence = Math.min(100, Math.round((strength / 6) * 100 + Math.abs(longCount - shortCount) * 5));
  let action: Action = "HOLD";
  let prediction: Signal["prediction"] = "NEUTRAL";
  if (strength >= 4 && longCount > shortCount) {
    action = "BUY";
    prediction = "BULLISH";
  } else if (strength >= 4 && shortCount > longCount) {
    action = "SELL";
    prediction = "BEARISH";
  }

  return {
    action,
    confidence,
    prediction,
    reasons,
    score: strength,
    strength,
    alignment,
    rsi: r[i],
    emaFast: eFast[i],
    emaSlow: eSlow[i],
    emaMacro: eMacro[i],
    macdHist: m.hist[i],
    stochK: st.k[i],
    stochD: st.d[i],
    adx: adxV[i],
    bbUpper: bb.upper[i],
    bbLower: bb.lower[i],
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
const PriceChart = ({ candles, signal, settings }: { candles: Candle[]; signal: Signal | null; settings: SignalSettings }) => {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const csRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const emaFastRef = useRef<ISeriesApi<"Line"> | null>(null);
  const emaSlowRef = useRef<ISeriesApi<"Line"> | null>(null);
  const emaMacroRef = useRef<ISeriesApi<"Line"> | null>(null);

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
    emaFastRef.current = chart.addSeries(LineSeries, { color: "hsl(199, 89%, 60%)", lineWidth: 1 });
    emaSlowRef.current = chart.addSeries(LineSeries, { color: "hsl(45, 93%, 60%)", lineWidth: 1 });
    emaMacroRef.current = chart.addSeries(LineSeries, { color: "hsl(305, 76%, 60%)", lineWidth: 1, lineStyle: 2 });
    chartRef.current = chart;
    const ro = new ResizeObserver(() => ref.current && chart.applyOptions({ width: ref.current.clientWidth }));
    ro.observe(ref.current);
    return () => { ro.disconnect(); chart.remove(); };
  }, []);

  useEffect(() => {
    if (!csRef.current || !candles.length) return;
    csRef.current.setData(candles.map((c) => ({ time: c.time as any, open: c.open, high: c.high, low: c.low, close: c.close })));
    const closes = candles.map((c) => c.close);
    const eFast = ema(closes, settings.emaFast);
    const eSlow = ema(closes, settings.emaSlow);
    const eMacro = ema(closes, settings.emaMacro);
    emaFastRef.current?.setData(candles.map((c, i) => ({ time: c.time as any, value: eFast[i] })));
    emaSlowRef.current?.setData(candles.map((c, i) => ({ time: c.time as any, value: eSlow[i] })));
    emaMacroRef.current?.setData(candles.map((c, i) => ({ time: c.time as any, value: eMacro[i] })));
    chartRef.current?.timeScale().fitContent();
  }, [candles, settings]);

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

  const symbols = MARKET_SYMBOLS[market];

  const switchMarket = (m: Market) => {
    setMarket(m);
    setSettings(MARKET_PRESETS[m]);
    setSymbol(MARKET_SYMBOLS[m][0] ?? "");
    setCandles([]);
    setError(null);
  };

  const load = async () => {
    setLoading(true); setError(null);
    try {
      let data: Candle[] = [];
      if (market === "crypto") {
        data = await fetchCryptoCandles(symbol, interval, 500);
      } else if (market === "forex" || market === "commodities") {
        data = await fetchForexCandles(symbol, interval);
      } else {
        throw new Error("Live stock data is not available. Use the presets for Stocks but switch to Crypto or Forex for live quotes.");
      }
      if (!data.length) throw new Error("Market data is temporarily unavailable. Please try again shortly.");
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

  const [settings, setSettings] = useState<SignalSettings>(MARKET_PRESETS[market]);
  const [showSettings, setShowSettings] = useState(false);
  const signal = useMemo(() => computeSignal(candles, settings), [candles, settings]);
  const price = candles[candles.length - 1]?.close ?? 0;

  // Alerts + persistent logging on action flips to BUY/SELL
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
      // Predicted target: BB upper for BUY, BB lower for SELL (mean-reversion / continuation target)
      const predicted = a === "BUY" ? signal.bbUpper : signal.bbLower;
      if (Number.isFinite(predicted) && price > 0) {
        supabase
          .from("signals")
          .insert({
            asset: symbol,
            signal_type: a,
            price_at_signal: price,
            predicted_price: predicted,
          })
          .then(({ error }) => {
            if (error) console.warn("Signal log failed:", error.message);
          });
      }
    }
    lastActionRef.current = a;
  }, [signal, symbol, price, soundEnabled, notifPermission, market]);

  // Evaluate pending signals older than 24h — fetch current price as the realised price
  useEffect(() => {
    const evaluate = async () => {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("signals")
        .select("id, asset")
        .is("actual_price", null)
        .lte("created_at", cutoff)
        .limit(25);
      if (!data?.length) return;
      const priceCache = new Map<string, number>();
      for (const row of data) {
        try {
          let actual: number | null = priceCache.get(row.asset) ?? null;
          if (actual == null) {
            if (row.asset.includes("/")) {
              const res = await supabase.functions.invoke("forex-klines", {
                body: { symbol: row.asset, interval: "15m" },
              });
              const candles = (res.data?.candles ?? []) as Candle[];
              actual = candles[candles.length - 1]?.close ?? null;
            } else {
              const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${row.asset}`);
              if (r.ok) {
                const j = await r.json();
                actual = +j.price;
              }
            }
            if (actual != null) priceCache.set(row.asset, actual);
          }
          if (actual != null) {
            await supabase
              .from("signals")
              .update({ actual_price: actual, evaluated_at: new Date().toISOString() })
              .eq("id", row.id);
          }
        } catch (e) {
          console.warn("Signal eval failed", row.id, e);
        }
      }
    };
    evaluate();
    const id = window.setInterval(evaluate, 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);


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
            <img src={pipsyLogo} alt="Pipsy Signals logo" width={40} height={40} className="w-10 h-10 rounded-xl glow-bull" />
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
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Market</label>
            <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-card border border-border card-elevated">
              {(Object.keys(MARKET_LABELS) as Market[]).map((m) => (
                <button key={m} onClick={() => switchMarket(m)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition ${
                    market === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}>
                  {MARKET_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="pair-select" className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Pair</label>
            <select
              id="pair-select"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="px-3 py-2 rounded-xl bg-card border border-border card-elevated text-sm font-bold tracking-wide focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer min-w-[120px]"
            >
              {symbols.map((s) => (
                <option key={s} value={s}>{labelOf(s)}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="tf-select" className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Timeframe</label>
            <select
              id="tf-select"
              value={interval}
              onChange={(e) => setInterval(e.target.value as Interval)}
              className="px-3 py-2 rounded-xl bg-card border border-border card-elevated text-sm font-bold uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer min-w-[90px]"
            >
              {INTERVALS.map((i) => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
          </div>

          {updated && (
            <span className="text-xs text-muted-foreground ml-auto flex items-center gap-2 pb-2">
              <span className="w-2 h-2 rounded-full bg-bull animate-pulse-glow" />
              Live · {symbol} · {interval} · {updated.toLocaleTimeString()}
            </span>
          )}
        </div>

        <div className="rounded-2xl bg-card card-elevated border border-border p-4 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-bold">Settings Panel</p>
              <p className="text-xs text-muted-foreground">Adjust indicator parameters and choose market presets. Defaults follow the optimized multi-indicator trading settings.</p>
            </div>
            <button onClick={() => setShowSettings((v) => !v)}
              className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 border border-border text-xs uppercase tracking-widest">
              {showSettings ? "Hide" : "Show"} settings
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl bg-background/80 border border-border p-4">
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Market preset</label>
              <select
                value={market}
                onChange={(e) => switchMarket(e.target.value as Market)}
                className="mt-2 w-full px-3 py-2 rounded-xl bg-card border border-border text-sm font-bold tracking-wide focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {(Object.keys(MARKET_LABELS) as Market[]).map((m) => (
                  <option key={m} value={m}>{MARKET_LABELS[m]}</option>
                ))}
              </select>
            </div>
            <div className="rounded-2xl bg-background/80 border border-border p-4">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Risk management</p>
              <ul className="mt-3 space-y-2 text-sm text-foreground/80">
                <li>• Keep risk per trade at <strong>2%</strong> of account.</li>
                <li>• Only enter when <strong>4/6 indicators</strong> align.</li>
                <li>• Avoid trades if RSI is 40–60 or price is inside BB middle zone.</li>
                <li>• ADX below {settings.adxThreshold} signals weak trend.</li>
              </ul>
            </div>
            <div className="rounded-2xl bg-background/80 border border-border p-4">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Current preset</p>
              <div className="mt-3 space-y-2 text-sm text-foreground/80">
                <div>RSI {settings.rsiPeriod} · OB/OS {settings.rsiOverbought}/{settings.rsiOversold}</div>
                <div>EMA {settings.emaFast}/{settings.emaSlow}/{settings.emaMacro}</div>
                <div>MACD {settings.macdFast}/{settings.macdSlow}/{settings.macdSignal}</div>
                <div>BB {settings.bbPeriod}/{settings.bbStdDev.toFixed(1)}</div>
                <div>Stoch {settings.stochK}/{settings.stochD} · OB/OS {settings.stochOverbought}/{settings.stochOversold}</div>
                <div>ADX period {settings.adxPeriod} · threshold {settings.adxThreshold}</div>
              </div>
            </div>
          </div>

          {showSettings && (
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-2xl bg-background/80 border border-border p-4 space-y-4">
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground font-bold">RSI</p>
                  <RangeControl label="RSI period" value={settings.rsiPeriod} min={10} max={40} step={1}
                    onChange={(value) => setSettings((prev) => ({ ...prev, rsiPeriod: value }))}
                    description={INDICATOR_INFO.RSI.reason} />
                  <RangeControl label="RSI overbought" value={settings.rsiOverbought} min={70} max={90} step={1}
                    onChange={(value) => setSettings((prev) => ({ ...prev, rsiOverbought: value }))}
                    description="Tighter OB helps avoid tops on longs." />
                  <RangeControl label="RSI oversold" value={settings.rsiOversold} min={10} max={35} step={1}
                    onChange={(value) => setSettings((prev) => ({ ...prev, rsiOversold: value }))}
                    description="Lower OS helps avoid failed short entries." />
                </div>
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground font-bold">EMA</p>
                  <RangeControl label="Fast EMA" value={settings.emaFast} min={5} max={20} step={1}
                    onChange={(value) => setSettings((prev) => ({ ...prev, emaFast: value }))}
                    description={INDICATOR_INFO.EMA.reason} />
                  <RangeControl label="Slow EMA" value={settings.emaSlow} min={15} max={40} step={1}
                    onChange={(value) => setSettings((prev) => ({ ...prev, emaSlow: value }))}
                    description="Fast/slow cross for momentum entry." />
                  <RangeControl label="Macro EMA" value={settings.emaMacro} min={100} max={300} step={10}
                    onChange={(value) => setSettings((prev) => ({ ...prev, emaMacro: value }))}
                    description="200 EMA filters the dominant market direction." />
                </div>
              </div>
              <div className="rounded-2xl bg-background/80 border border-border p-4 space-y-4">
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground font-bold">MACD</p>
                  <RangeControl label="MACD fast" value={settings.macdFast} min={5} max={12} step={1}
                    onChange={(value) => setSettings((prev) => ({ ...prev, macdFast: value }))}
                    description={INDICATOR_INFO.MACD.reason} />
                  <RangeControl label="MACD slow" value={settings.macdSlow} min={15} max={30} step={1}
                    onChange={(value) => setSettings((prev) => ({ ...prev, macdSlow: value }))}
                    description="Slower MACD line for smoother trend confirmation." />
                  <RangeControl label="MACD signal" value={settings.macdSignal} min={5} max={12} step={1}
                    onChange={(value) => setSettings((prev) => ({ ...prev, macdSignal: value }))}
                    description="Signal line smoothing for crossover timing." />
                </div>
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Bollinger Bands</p>
                  <RangeControl label="BB period" value={settings.bbPeriod} min={10} max={40} step={1}
                    onChange={(value) => setSettings((prev) => ({ ...prev, bbPeriod: value }))}
                    description={INDICATOR_INFO.BollingerBands.reason} />
                  <RangeControl label="BB std dev" value={settings.bbStdDev} min={1.5} max={3.5} step={0.1}
                    onChange={(value) => setSettings((prev) => ({ ...prev, bbStdDev: value }))}
                    description="Higher deviation captures volatility and reduces false breakouts." />
                </div>
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Stochastic</p>
                  <RangeControl label="Stoch %K" value={settings.stochK} min={5} max={20} step={1}
                    onChange={(value) => setSettings((prev) => ({ ...prev, stochK: value }))}
                    description="K period for entry timing precision." />
                  <RangeControl label="Stoch %D" value={settings.stochD} min={3} max={10} step={1}
                    onChange={(value) => setSettings((prev) => ({ ...prev, stochD: value }))}
                    description={INDICATOR_INFO.Stochastic.reason} />
                  <RangeControl label="Stoch OB" value={settings.stochOverbought} min={70} max={90} step={1}
                    onChange={(value) => setSettings((prev) => ({ ...prev, stochOverbought: value }))}
                    description="Overbought threshold for sell timing." />
                  <RangeControl label="Stoch OS" value={settings.stochOversold} min={10} max={30} step={1}
                    onChange={(value) => setSettings((prev) => ({ ...prev, stochOversold: value }))}
                    description="Oversold threshold for buy timing." />
                </div>
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground font-bold">ADX</p>
                  <RangeControl label="ADX period" value={settings.adxPeriod} min={10} max={30} step={1}
                    onChange={(value) => setSettings((prev) => ({ ...prev, adxPeriod: value }))}
                    description="Trend strength smoothing period." />
                  <RangeControl label="ADX threshold" value={settings.adxThreshold} min={20} max={40} step={1}
                    onChange={(value) => setSettings((prev) => ({ ...prev, adxThreshold: value }))}
                    description={INDICATOR_INFO.ADX.reason} />
                </div>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-destructive text-sm">{error}</div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-2xl bg-card card-elevated border border-border p-4">
            <PriceChart candles={candles} signal={signal} settings={settings} />
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
                      <Metric label={`RSI(${settings.rsiPeriod})`} value={signal.rsi.toFixed(1)}
                        accent={signal.rsi > settings.rsiOverbought ? "bear" : signal.rsi < settings.rsiOversold ? "bull" : undefined} />
                      <Metric label="Stoch %K" value={signal.stochK.toFixed(1)}
                        accent={signal.stochK > settings.stochOverbought ? "bear" : signal.stochK < settings.stochOversold ? "bull" : undefined} />
                      <Metric label="ADX" value={signal.adx.toFixed(1)}
                        accent={signal.adx >= settings.adxThreshold ? "bull" : undefined} />
                      <Metric label={`EMA${settings.emaFast}`} value={signal.emaFast.toFixed(2)} />
                      <Metric label={`EMA${settings.emaSlow}`} value={signal.emaSlow.toFixed(2)} />
                      <Metric label="MACD H" value={signal.macdHist.toFixed(4)}
                        accent={signal.macdHist > 0 ? "bull" : "bear"} />
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs uppercase tracking-widest text-muted-foreground">
                        <span>Signal strength</span>
                        <span>{signal.strength}/6 aligned</span>
                      </div>
                      <div className="h-2 rounded-full bg-border overflow-hidden">
                        <div className={`h-full rounded-full ${signal.strength >= 4 ? "bg-bull" : signal.strength === 3 ? "bg-amber-400" : "bg-bear"}`} style={{ width: `${(signal.strength / 6) * 100}%` }} />
                      </div>
                      {signal.strength < 4 && (
                        <p className="text-xs text-yellow-300">Warning: less than 4 of 6 indicators aligned. Avoid entering trades until signal strength improves.</p>
                      )}
                    </div>

                    <div>
                      <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2">
                        <TrendingUp className="w-3 h-3" /> Reasoning · aligned indicators {signal.strength}/6
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

        <AccuracyDashboard />

        <p className="text-xs text-muted-foreground text-center max-w-2xl mx-auto pt-4">
          ⚠️ Educational only. Signals derived from RSI, Stochastic, EMA, MACD, Bollinger Bands, ADX, volume & candle patterns. Use the 2% risk rule and wait for at least 4/6 aligned indicators.
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

const RangeControl = ({
  label,
  value,
  min,
  max,
  step,
  onChange,
  description,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  description: string;
}) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm font-semibold">{label}</p>
      <span className="text-xs text-muted-foreground tabular-nums">{value}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-primary"
    />
    <p className="text-xs text-muted-foreground">{description}</p>
  </div>
);

export default Index;
