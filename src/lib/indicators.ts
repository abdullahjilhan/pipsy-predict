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

export function sma(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function stddev(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  const m = sma(values, period);
  for (let i = period - 1; i < values.length; i++) {
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += (values[j] - m[i]) ** 2;
    out[i] = Math.sqrt(s / period);
  }
  return out;
}

export function bollinger(closes: number[], period = 20, mult = 2) {
  const mid = sma(closes, period);
  const sd = stddev(closes, period);
  const upper = mid.map((m, i) => m + mult * sd[i]);
  const lower = mid.map((m, i) => m - mult * sd[i]);
  return { mid, upper, lower };
}

export function atr(candles: Candle[], period = 14): number[] {
  const trs: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  // Wilder's smoothing
  const out: number[] = new Array(candles.length).fill(NaN);
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += trs[i];
  out[period] = sum / period;
  for (let i = period + 1; i < candles.length; i++) {
    out[i] = (out[i - 1] * (period - 1) + trs[i]) / period;
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

// Stochastic %K and %D
export function stochastic(candles: Candle[], kPeriod = 14, dPeriod = 3) {
  const k: number[] = new Array(candles.length).fill(NaN);
  for (let i = kPeriod - 1; i < candles.length; i++) {
    let hi = -Infinity, lo = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (candles[j].high > hi) hi = candles[j].high;
      if (candles[j].low < lo) lo = candles[j].low;
    }
    k[i] = hi === lo ? 50 : ((candles[i].close - lo) / (hi - lo)) * 100;
  }
  const d = sma(k.map((v) => (isNaN(v) ? 0 : v)), dPeriod).map((v, i) => (i < kPeriod + dPeriod - 2 ? NaN : v));
  return { k, d };
}

export type Signal = {
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  prediction: "BULLISH" | "BEARISH" | "NEUTRAL";
  reasons: string[];
  rsi: number;
  ema20: number;
  ema50: number;
  macdHist: number;
};

// Threshold scales with timeframe — short TFs need stronger consensus
export function computeSignal(candles: Candle[], timeframe: string = "15m"): Signal | null {
  if (candles.length < 60) return null;
  const closes = candles.map((c) => c.close);
  const r = rsi(closes, 14);
  const e9 = ema(closes, 9);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const m = macd(closes);
  const bb = bollinger(closes, 20, 2);
  const a = atr(candles, 14);
  const st = stochastic(candles, 14, 3);
  const i = closes.length - 1;

  const last = {
    rsi: r[i], prevRsi: r[i - 1],
    ema9: e9[i], prevEma9: e9[i - 1],
    ema20: e20[i], ema50: e50[i],
    hist: m.hist[i], prevHist: m.hist[i - 1], prevHist2: m.hist[i - 2],
    bbUp: bb.upper[i], bbLo: bb.lower[i], bbMid: bb.mid[i],
    atr: a[i],
    k: st.k[i], d: st.d[i], prevK: st.k[i - 1], prevD: st.d[i - 1],
    price: closes[i],
    prevPrice: closes[i - 1],
    candle: candles[i],
    prevCandle: candles[i - 1],
  };

  // Volatility filter — skip choppy noise where ATR is very small relative to price
  const atrPct = (last.atr / last.price) * 100;
  const isShortTF = timeframe === "1m" || timeframe === "5m";
  const minATRPct = isShortTF ? 0.05 : 0.02;
  if (atrPct < minATRPct) {
    return {
      action: "HOLD", confidence: 20, prediction: "NEUTRAL",
      reasons: [`Low volatility (ATR ${atrPct.toFixed(3)}%) — choppy market, standing aside`],
      rsi: last.rsi, ema20: last.ema20, ema50: last.ema50, macdHist: last.hist,
    };
  }

  let score = 0;
  const reasons: string[] = [];

  // 1. EMA trend (strong weight on alignment)
  const trendUp = last.ema9 > last.ema20 && last.ema20 > last.ema50;
  const trendDown = last.ema9 < last.ema20 && last.ema20 < last.ema50;
  if (trendUp) { score += 1.5; reasons.push("EMA9>EMA20>EMA50 (strong uptrend)"); }
  else if (trendDown) { score -= 1.5; reasons.push("EMA9<EMA20<EMA50 (strong downtrend)"); }
  else if (last.ema20 > last.ema50) { score += 0.4; reasons.push("EMA20 above EMA50"); }
  else { score -= 0.4; reasons.push("EMA20 below EMA50"); }

  // 2. EMA9 slope (momentum)
  const ema9Slope = last.ema9 - last.prevEma9;
  if (ema9Slope > 0) { score += 0.4; reasons.push("EMA9 rising"); }
  else { score -= 0.4; reasons.push("EMA9 falling"); }

  // 3. RSI w/ momentum
  if (last.rsi < 30 && last.rsi > last.prevRsi) { score += 1.8; reasons.push(`RSI ${last.rsi.toFixed(1)} oversold + turning up`); }
  else if (last.rsi > 70 && last.rsi < last.prevRsi) { score -= 1.8; reasons.push(`RSI ${last.rsi.toFixed(1)} overbought + turning down`); }
  else if (last.rsi > 55 && last.rsi > last.prevRsi) { score += 0.6; reasons.push(`RSI ${last.rsi.toFixed(1)} bullish momentum`); }
  else if (last.rsi < 45 && last.rsi < last.prevRsi) { score -= 0.6; reasons.push(`RSI ${last.rsi.toFixed(1)} bearish momentum`); }

  // 4. MACD histogram acceleration (2-bar)
  if (last.hist > 0 && last.hist > last.prevHist && last.prevHist > last.prevHist2) {
    score += 1.2; reasons.push("MACD accelerating up");
  } else if (last.hist < 0 && last.hist < last.prevHist && last.prevHist < last.prevHist2) {
    score -= 1.2; reasons.push("MACD accelerating down");
  } else if (last.hist > 0 && last.hist > last.prevHist) { score += 0.5; reasons.push("MACD rising"); }
  else if (last.hist < 0 && last.hist < last.prevHist) { score -= 0.5; reasons.push("MACD falling"); }

  // 5. Bollinger band context
  if (last.price <= last.bbLo && last.candle.close > last.candle.open) {
    score += 1.0; reasons.push("Bullish bounce off lower BB");
  } else if (last.price >= last.bbUp && last.candle.close < last.candle.open) {
    score -= 1.0; reasons.push("Bearish rejection at upper BB");
  } else if (last.price > last.bbMid) { score += 0.3; }
  else { score -= 0.3; }

  // 6. Stochastic crossover
  if (last.k > last.d && last.prevK <= last.prevD && last.k < 80) {
    score += 0.8; reasons.push(`Stochastic bullish cross (%K ${last.k.toFixed(0)})`);
  } else if (last.k < last.d && last.prevK >= last.prevD && last.k > 20) {
    score -= 0.8; reasons.push(`Stochastic bearish cross (%K ${last.k.toFixed(0)})`);
  }

  // 7. Candle confirmation (last candle direction & body strength)
  const body = Math.abs(last.candle.close - last.candle.open);
  const range = last.candle.high - last.candle.low;
  const bodyRatio = range > 0 ? body / range : 0;
  if (last.candle.close > last.candle.open && bodyRatio > 0.6) {
    score += 0.5; reasons.push("Strong bullish candle close");
  } else if (last.candle.close < last.candle.open && bodyRatio > 0.6) {
    score -= 0.5; reasons.push("Strong bearish candle close");
  }

  // Stricter threshold on short timeframes (more noise)
  const threshold = isShortTF ? 3.5 : timeframe === "15m" ? 2.8 : 2.0;
  const maxScore = 7;

  let action: Signal["action"] = "HOLD";
  let prediction: Signal["prediction"] = "NEUTRAL";
  if (score >= threshold) { action = "BUY"; prediction = "BULLISH"; }
  else if (score <= -threshold) { action = "SELL"; prediction = "BEARISH"; }

  const confidence = Math.min(100, Math.round((Math.abs(score) / maxScore) * 100));

  return { action, confidence, prediction, reasons, rsi: last.rsi, ema20: last.ema20, ema50: last.ema50, macdHist: last.hist };
}
