const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Map our intervals to TwelveData intervals
const INTERVAL_MAP: Record<string, string> = {
  "1m": "1min",
  "5m": "5min",
  "15m": "15min",
  "1h": "1h",
  "4h": "4h",
  "1d": "1day",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const symbol = url.searchParams.get("symbol"); // e.g. EUR/USD
    const interval = url.searchParams.get("interval") || "15m";
    const outputsize = url.searchParams.get("outputsize") || "200";

    if (!symbol) {
      return new Response(JSON.stringify({ error: "symbol required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("TWELVEDATA_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "TWELVEDATA_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tdInterval = INTERVAL_MAP[interval] || "15min";
    const tdUrl = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(
      symbol
    )}&interval=${tdInterval}&outputsize=${outputsize}&apikey=${apiKey}&format=JSON&order=ASC`;

    const res = await fetch(tdUrl);
    const data = await res.json();

    if (data.status === "error") {
      return new Response(JSON.stringify({ error: data.message || "TwelveData error" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const values: any[] = data.values || [];
    const candles = values.map((v) => ({
      time: Math.floor(new Date(v.datetime + "Z").getTime() / 1000),
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
      volume: parseFloat(v.volume || "0"),
    }));

    return new Response(JSON.stringify({ candles }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("forex error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
