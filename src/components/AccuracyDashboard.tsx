import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { Target, TrendingDown, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type SignalRow = {
  id: string;
  asset: string;
  signal_type: "BUY" | "SELL";
  price_at_signal: number;
  predicted_price: number;
  actual_price: number | null;
  evaluated_at: string | null;
  created_at: string;
};

type Point = { time: string; ts: number; mae: number; rmse: number; absErr: number };

export const AccuracyDashboard = () => {
  const [rows, setRows] = useState<SignalRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRows = async () => {
    const { data, error } = await supabase
      .from("signals")
      .select("*")
      .not("actual_price", "is", null)
      .order("created_at", { ascending: true })
      .limit(500);
    if (!error && data) setRows(data as SignalRow[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchRows();
    const channel = supabase
      .channel("signals-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "signals" }, () => fetchRows())
      .subscribe();
    const id = window.setInterval(fetchRows, 60_000);
    return () => {
      supabase.removeChannel(channel);
      window.clearInterval(id);
    };
  }, []);

  const { points, mae, rmse, accuracy } = useMemo(() => {
    const pts: Point[] = [];
    let sumAbs = 0;
    let sumSq = 0;
    let correct = 0;
    rows.forEach((r, i) => {
      const actual = Number(r.actual_price);
      const predicted = Number(r.predicted_price);
      const entry = Number(r.price_at_signal);
      const absErr = Math.abs(actual - predicted);
      const sqErr = (actual - predicted) ** 2;
      sumAbs += absErr;
      sumSq += sqErr;
      const n = i + 1;
      const mae = sumAbs / n;
      const rmse = Math.sqrt(sumSq / n);
      // direction accuracy: did the price actually move in the predicted direction?
      const predictedUp = predicted > entry;
      const actualUp = actual > entry;
      const directionalHit =
        (r.signal_type === "BUY" && actualUp) || (r.signal_type === "SELL" && !actualUp);
      if (directionalHit) correct++;
      pts.push({
        time: new Date(r.created_at).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        ts: new Date(r.created_at).getTime(),
        mae: +mae.toFixed(4),
        rmse: +rmse.toFixed(4),
        absErr: +absErr.toFixed(4),
      });
    });
    const total = rows.length;
    return {
      points: pts,
      mae: total ? sumAbs / total : 0,
      rmse: total ? Math.sqrt(sumSq / total) : 0,
      accuracy: total ? (correct / total) * 100 : 0,
    };
  }, [rows]);

  const total = rows.length;
  // color thresholds based on median error
  const median = points.length ? [...points].sort((a, b) => a.absErr - b.absErr)[Math.floor(points.length / 2)].absErr : 0;
  const errorColor = mae <= median * 0.8 ? "hsl(152, 76%, 50%)" : mae >= median * 1.2 ? "hsl(0, 84%, 62%)" : "hsl(45, 93%, 60%)";

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black tracking-tight">Signal Accuracy</h2>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1">
            Mean Absolute Error & RMSE over time
          </p>
        </div>
      </div>

      {/* SUMMARY CARD */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryStat
          icon={<Target className="w-4 h-4" />}
          label="MAE"
          value={mae.toFixed(4)}
          hint="Lower = better"
          color={errorColor}
        />
        <SummaryStat
          icon={<TrendingDown className="w-4 h-4" />}
          label="RMSE"
          value={rmse.toFixed(4)}
          hint="Penalises big misses"
          color={errorColor}
        />
        <SummaryStat
          icon={<Activity className="w-4 h-4" />}
          label="Evaluated"
          value={total.toString()}
          hint="Signals scored"
        />
        <SummaryStat
          icon={<Target className="w-4 h-4" />}
          label="Direction Acc."
          value={`${accuracy.toFixed(1)}%`}
          hint="Predicted direction hit"
          color={accuracy >= 60 ? "hsl(152, 76%, 50%)" : accuracy >= 45 ? "hsl(45, 93%, 60%)" : "hsl(0, 84%, 62%)"}
        />
      </div>

      {/* CHART */}
      <div className="rounded-2xl bg-card card-elevated border border-border p-5">
        {loading ? (
          <div className="h-72 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
        ) : points.length === 0 ? (
          <div className="h-72 flex flex-col items-center justify-center text-muted-foreground text-sm gap-1">
            <p>No evaluated signals yet.</p>
            <p className="text-xs">Signals are scored 24 hours after they fire.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={points} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="hsl(222, 22%, 14%)" strokeDasharray="3 3" />
              <XAxis
                dataKey="time"
                stroke="hsl(215, 20%, 60%)"
                tick={{ fontSize: 11 }}
                minTickGap={32}
              />
              <YAxis stroke="hsl(215, 20%, 60%)" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: "hsl(222, 22%, 8%)",
                  border: "1px solid hsl(222, 22%, 18%)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
                labelStyle={{ color: "hsl(215, 20%, 60%)" }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="mae"
                name="MAE"
                stroke={errorColor}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="rmse"
                name="RMSE"
                stroke="hsl(199, 89%, 60%)"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
};

const SummaryStat = ({
  icon,
  label,
  value,
  hint,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  color?: string;
}) => (
  <div className="rounded-2xl bg-card card-elevated border border-border p-4">
    <div className="flex items-center gap-2 text-muted-foreground">
      {icon}
      <span className="text-[10px] uppercase tracking-widest font-bold">{label}</span>
    </div>
    <p className="text-2xl font-black tabular-nums mt-2" style={color ? { color } : undefined}>
      {value}
    </p>
    <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wide">{hint}</p>
  </div>
);
