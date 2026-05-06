import type { Candle } from "./indicators";

export type Interval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export async function fetchKlines(symbol: string, interval: Interval, limit = 200): Promise<Candle[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch market data");
  const raw: any[] = await res.json();
  return raw.map((k) => ({
    time: Math.floor(k[0] / 1000),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}
