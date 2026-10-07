CREATE TABLE IF NOT EXISTS public.frcdle_spins (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  spin_day DATE NOT NULL,
  spin_number TEXT NOT NULL CHECK (spin_number ~ '^[0-9]{6}$'),
  time_zone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, spin_day)
);

ALTER TABLE public.frcdle_spins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own frcdle spins"
  ON public.frcdle_spins FOR SELECT
  USING (auth.uid() = user_id);