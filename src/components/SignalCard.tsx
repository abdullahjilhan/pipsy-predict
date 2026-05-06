import type { Signal } from "@/lib/indicators";
import { ArrowDown, ArrowUp, Minus, TrendingUp } from "lucide-react";

export const SignalCard = ({ signal, price, symbol }: { signal: Signal | null; price: number; symbol: string }) => {
  if (!signal) {
    return (
      <div className="rounded-2xl bg-card card-elevated p-6 border border-border">
        <p className="text-muted-foreground text-sm">Loading signal…</p>
      </div>
    );
  }
  const isBuy = signal.action === "BUY";
  const isSell = signal.action === "SELL";
  const gradient = isBuy ? "gradient-bull" : isSell ? "gradient-bear" : "gradient-neutral";
  const glow = isBuy ? "glow-bull" : isSell ? "glow-bear" : "";
  const Icon = isBuy ? ArrowUp : isSell ? ArrowDown : Minus;

  return (
    <div className="rounded-2xl bg-card card-elevated border border-border overflow-hidden">
      <div className={`${gradient} ${glow} p-6 text-primary-foreground`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest opacity-80">{symbol} · Next candle</p>
            <h2 className="text-5xl font-black tracking-tight mt-1 flex items-center gap-3">
              <Icon className="w-10 h-10" strokeWidth={3} />
              {signal.action}
            </h2>
            <p className="mt-2 text-sm font-medium opacity-90">Predicted: {signal.prediction}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-widest opacity-80">Confidence</p>
            <p className="text-4xl font-black">{signal.confidence}%</p>
            <p className="text-xs mt-2 opacity-80">Price</p>
            <p className="text-lg font-bold tabular-nums">${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Metric label="RSI(14)" value={signal.rsi.toFixed(1)} accent={signal.rsi > 70 ? "bear" : signal.rsi < 30 ? "bull" : undefined} />
          <Metric label="EMA20" value={signal.ema20.toFixed(2)} />
          <Metric label="MACD H" value={signal.macdHist.toFixed(4)} accent={signal.macdHist > 0 ? "bull" : "bear"} />
        </div>

        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2">
            <TrendingUp className="w-3 h-3" /> Reasoning
          </p>
          <ul className="space-y-1.5">
            {signal.reasons.map((r, i) => (
              <li key={i} className="text-sm text-foreground/80 flex items-start gap-2">
                <span className="text-primary mt-1">▸</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

const Metric = ({ label, value, accent }: { label: string; value: string; accent?: "bull" | "bear" }) => (
  <div className="rounded-xl bg-secondary/60 border border-border p-3">
    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
    <p className={`text-lg font-bold tabular-nums ${accent === "bull" ? "text-bull" : accent === "bear" ? "text-bear" : ""}`}>{value}</p>
  </div>
);
