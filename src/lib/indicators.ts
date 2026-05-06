export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };

export function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0];
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function rsi(closes: number[], period = 14): number[] {
  const out: number[] = new Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let avgG = gain / period, avgL = loss / period;
  out[period] = 100 - 100 / (1 + (avgL === 0 ? 100 : avgG / avgL));
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgG = (avgG * (period - 1) + g) / period;
    avgL = (avgL * (period - 1) + l) / period;
    out[i] = 100 - 100 / (1 + (avgL === 0 ? 100 : avgG / avgL));
  }
  return out;
}

export function macd(closes: number[], fast = 12, slow = 26, signal = 9) {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine = closes.map((_, i) => emaFast[i] - emaSlow[i]);
  const signalLine = ema(macdLine, signal);
  const hist = macdLine.map((v, i) => v - signalLine[i]);
  return { macdLine, signalLine, hist };
}

export type Signal = {
  action: "BUY" | "SELL" | "HOLD";
  confidence: number; // 0-100
  prediction: "BULLISH" | "BEARISH" | "NEUTRAL";
  reasons: string[];
  rsi: number;
  ema20: number;
  ema50: number;
  macdHist: number;
};

export function computeSignal(candles: Candle[]): Signal | null {
  if (candles.length < 60) return null;
  const closes = candles.map((c) => c.close);
  const r = rsi(closes, 14);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const m = macd(closes);
  const i = closes.length - 1;
  const last = { rsi: r[i], ema20: e20[i], ema50: e50[i], hist: m.hist[i], prevHist: m.hist[i - 1], price: closes[i] };

  let score = 0;
  const reasons: string[] = [];

  // EMA trend
  if (last.ema20 > last.ema50) {
    score += 1;
    reasons.push("EMA20 above EMA50 (uptrend)");
  } else {
    score -= 1;
    reasons.push("EMA20 below EMA50 (downtrend)");
  }
  // Price vs EMA20
  if (last.price > last.ema20) { score += 0.5; reasons.push("Price above EMA20"); }
  else { score -= 0.5; reasons.push("Price below EMA20"); }

  // RSI
  if (last.rsi < 30) { score += 1.5; reasons.push(`RSI ${last.rsi.toFixed(1)} oversold`); }
  else if (last.rsi > 70) { score -= 1.5; reasons.push(`RSI ${last.rsi.toFixed(1)} overbought`); }
  else if (last.rsi > 50) { score += 0.5; reasons.push(`RSI ${last.rsi.toFixed(1)} bullish`); }
  else { score -= 0.5; reasons.push(`RSI ${last.rsi.toFixed(1)} bearish`); }

  // MACD
  if (last.hist > 0 && last.hist > last.prevHist) { score += 1; reasons.push("MACD histogram rising"); }
  else if (last.hist < 0 && last.hist < last.prevHist) { score -= 1; reasons.push("MACD histogram falling"); }
  else if (last.hist > 0) { score += 0.3; reasons.push("MACD positive"); }
  else { score -= 0.3; reasons.push("MACD negative"); }

  const maxScore = 4;
  const confidence = Math.min(100, Math.round((Math.abs(score) / maxScore) * 100));
  let action: Signal["action"] = "HOLD";
  let prediction: Signal["prediction"] = "NEUTRAL";
  if (score >= 1.5) { action = "BUY"; prediction = "BULLISH"; }
  else if (score <= -1.5) { action = "SELL"; prediction = "BEARISH"; }

  return { action, confidence, prediction, reasons, rsi: last.rsi, ema20: last.ema20, ema50: last.ema50, macdHist: last.hist };
}
