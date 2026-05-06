import { ema, rsi, macd, bollinger, atr, stochastic, type Candle } from "./indicators";

export type Marker = {
  time: number;
  action: "BUY" | "SELL";
  price: number;
  confidence: number;
};

export function computeHistoricalSignals(candles: Candle[], timeframe: string = "15m"): Marker[] {
  if (candles.length < 60) return [];
  const closes = candles.map((c) => c.close);
  const r = rsi(closes, 14);
  const e9 = ema(closes, 9);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const m = macd(closes);
  const bb = bollinger(closes, 20, 2);
  const a = atr(candles, 14);
  const st = stochastic(candles, 14, 3);

  const isShortTF = timeframe === "1m" || timeframe === "5m";
  const threshold = isShortTF ? 3.5 : timeframe === "15m" ? 2.8 : 2.0;
  const minATRPct = isShortTF ? 0.05 : 0.02;

  const markers: Marker[] = [];
  let prevAction: "BUY" | "SELL" | "HOLD" = "HOLD";

  for (let i = 50; i < candles.length; i++) {
    const price = closes[i];
    const atrPct = (a[i] / price) * 100;
    if (isNaN(atrPct) || atrPct < minATRPct) { prevAction = "HOLD"; continue; }

    let score = 0;
    const trendUp = e9[i] > e20[i] && e20[i] > e50[i];
    const trendDown = e9[i] < e20[i] && e20[i] < e50[i];
    if (trendUp) score += 1.5;
    else if (trendDown) score -= 1.5;
    else if (e20[i] > e50[i]) score += 0.4; else score -= 0.4;

    if (e9[i] > e9[i - 1]) score += 0.4; else score -= 0.4;

    if (r[i] < 30 && r[i] > r[i - 1]) score += 1.8;
    else if (r[i] > 70 && r[i] < r[i - 1]) score -= 1.8;
    else if (r[i] > 55 && r[i] > r[i - 1]) score += 0.6;
    else if (r[i] < 45 && r[i] < r[i - 1]) score -= 0.6;

    const h = m.hist[i], h1 = m.hist[i - 1], h2 = m.hist[i - 2];
    if (h > 0 && h > h1 && h1 > h2) score += 1.2;
    else if (h < 0 && h < h1 && h1 < h2) score -= 1.2;
    else if (h > 0 && h > h1) score += 0.5;
    else if (h < 0 && h < h1) score -= 0.5;

    const c = candles[i];
    if (price <= bb.lower[i] && c.close > c.open) score += 1.0;
    else if (price >= bb.upper[i] && c.close < c.open) score -= 1.0;
    else if (price > bb.mid[i]) score += 0.3; else score -= 0.3;

    if (st.k[i] > st.d[i] && st.k[i - 1] <= st.d[i - 1] && st.k[i] < 80) score += 0.8;
    else if (st.k[i] < st.d[i] && st.k[i - 1] >= st.d[i - 1] && st.k[i] > 20) score -= 0.8;

    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    const br = range > 0 ? body / range : 0;
    if (c.close > c.open && br > 0.6) score += 0.5;
    else if (c.close < c.open && br > 0.6) score -= 0.5;

    let action: "BUY" | "SELL" | "HOLD" = "HOLD";
    if (score >= threshold) action = "BUY";
    else if (score <= -threshold) action = "SELL";

    if ((action === "BUY" || action === "SELL") && action !== prevAction) {
      markers.push({
        time: c.time,
        action,
        price,
        confidence: Math.min(100, Math.round((Math.abs(score) / 7) * 100)),
      });
    }
    prevAction = action;
  }
  return markers;
}
