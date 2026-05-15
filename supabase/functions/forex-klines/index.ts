// Forex OHLC proxy using TwelveData
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const intervalMap: Record<string, string> = {
  "1m": "1min",
  "5m": "5min",
  "15m": "15min",
  "1h": "1h",
  "4h": "4h",
  "1d": "1day",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { symbol, interval } = await req.json();
    const apiKey = (Deno.env.get("TWELVEDATA_API_KEY") || "").trim();
    console.log("TWELVEDATA_API_KEY length:", apiKey.length);
    if (!apiKey) {
      console.error("TWELVEDATA_API_KEY is not configured");
      return jsonResponse({ candles: [], warning: "Forex data is temporarily unavailable." });
    }
    if (typeof symbol !== "string" || !symbol.trim()) {
      return jsonResponse({ error: "A valid symbol is required." }, 400);
    }
    const tdInterval = intervalMap[interval] || "15min";
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(
      symbol.trim()
    )}&interval=${tdInterval}&outputsize=500&apikey=${apiKey}&format=JSON`;

    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok || data.status === "error") {
      console.error("TwelveData request failed:", data?.code || res.status, data?.message || res.statusText);
      return jsonResponse({ candles: [], warning: "Forex data provider rejected the request. Please check the API key." });
    }

    const values = (data.values || []).slice().reverse();
    const candles = values.map((v: any) => ({
      time: Math.floor(new Date(v.datetime.replace(" ", "T") + "Z").getTime() / 1000),
      open: +v.open,
      high: +v.high,
      low: +v.low,
      close: +v.close,
      volume: +(v.volume || 0),
    }));

    return jsonResponse({ candles });
  } catch (e) {
    console.error("forex-klines failed:", (e as Error).message);
    return jsonResponse({ candles: [], warning: "Forex data is temporarily unavailable." });
  }
});
