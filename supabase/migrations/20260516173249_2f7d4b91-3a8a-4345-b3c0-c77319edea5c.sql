
CREATE TABLE public.signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asset TEXT NOT NULL,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('BUY','SELL')),
  price_at_signal NUMERIC NOT NULL,
  predicted_price NUMERIC NOT NULL,
  actual_price NUMERIC,
  evaluated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_signals_created_at ON public.signals(created_at DESC);
CREATE INDEX idx_signals_pending ON public.signals(created_at) WHERE actual_price IS NULL;

ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view signals" ON public.signals FOR SELECT USING (true);
CREATE POLICY "Anyone can insert signals" ON public.signals FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update signals" ON public.signals FOR UPDATE USING (true);
