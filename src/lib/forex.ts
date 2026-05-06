import type { Candle } from "./indicators";
import type { Interval } from "./binance";

export const FOREX_PAIRS = ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CAD", "EUR/JPY"];

export async function fetchForexCandles(symbol: string, interval: Interval, limit = 200): Promise<Candle[]> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/forex?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${limit}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to fetch forex data");
  }
  const json = await res.json();
  return json.candles as Candle[];
}

export function formatForexPrice(symbol: string, price: number) {
  const digits = symbol.includes("JPY") ? 3 : 5;
  return price.toFixed(digits);
}
