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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { symbol, interval } = await req.json();
    const apiKey = Deno.env.get("TWELVEDATA_API_KEY");
    if (!apiKey) throw new Error("TWELVEDATA_API_KEY not configured");
    const tdInterval = intervalMap[interval] || "15min";
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(
      symbol
    )}&interval=${tdInterval}&outputsize=500&apikey=${apiKey}&format=JSON`;

    const res = await fetch(url);
    const data = await res.json();
    if (data.status === "error") throw new Error(data.message || "TwelveData error");

    const values = (data.values || []).slice().reverse();
    const candles = values.map((v: any) => ({
      time: Math.floor(new Date(v.datetime.replace(" ", "T") + "Z").getTime() / 1000),
      open: +v.open,
      high: +v.high,
      low: +v.low,
      close: +v.close,
      volume: +(v.volume || 0),
    }));

    return new Response(JSON.stringify({ candles }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
