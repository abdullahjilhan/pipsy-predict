import { ema, rsi, macd, type Candle } from "./indicators";

export type Marker = {
  time: number;
  action: "BUY" | "SELL";
  price: number;
  confidence: number;
};

// Compute historical signals at every candle so we can plot them on the chart.
export function computeHistoricalSignals(candles: Candle[]): Marker[] {
  if (candles.length < 60) return [];
  const closes = candles.map((c) => c.close);
  const r = rsi(closes, 14);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const m = macd(closes);

  const markers: Marker[] = [];
  let prevAction: "BUY" | "SELL" | "HOLD" = "HOLD";

  for (let i = 50; i < candles.length; i++) {
    let score = 0;
    if (e20[i] > e50[i]) score += 1; else score -= 1;
    if (closes[i] > e20[i]) score += 0.5; else score -= 0.5;
    if (r[i] < 30) score += 1.5;
    else if (r[i] > 70) score -= 1.5;
    else if (r[i] > 50) score += 0.5;
    else score -= 0.5;
    const hist = m.hist[i], prevHist = m.hist[i - 1];
    if (hist > 0 && hist > prevHist) score += 1;
    else if (hist < 0 && hist < prevHist) score -= 1;
    else if (hist > 0) score += 0.3;
    else score -= 0.3;

    let action: "BUY" | "SELL" | "HOLD" = "HOLD";
    if (score >= 1.5) action = "BUY";
    else if (score <= -1.5) action = "SELL";

    if ((action === "BUY" || action === "SELL") && action !== prevAction) {
      markers.push({
        time: candles[i].time,
        action,
        price: closes[i],
        confidence: Math.min(100, Math.round((Math.abs(score) / 4) * 100)),
      });
    }
    prevAction = action;
  }
  return markers;
}
