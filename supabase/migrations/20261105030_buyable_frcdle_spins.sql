-- FRCdle: still one free spin per spin day (which starts at 9:00 in the player's time zone),
-- plus as many bought spins as they like at 100 points each. Spins get their own id, and only
-- free ones are limited to one a day.
ALTER TABLE public.frcdle_spins ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.frcdle_spins ADD COLUMN IF NOT EXISTS purchased BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.frcdle_spins DROP CONSTRAINT IF EXISTS frcdle_spins_pkey;
ALTER TABLE public.frcdle_spins ADD CONSTRAINT frcdle_spins_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX IF NOT EXISTS frcdle_spins_one_free_per_day
  ON public.frcdle_spins (user_id, spin_day) WHERE NOT purchased;
CREATE INDEX IF NOT EXISTS idx_frcdle_spins_user_created ON public.frcdle_spins (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_frcdle_spins_day ON public.frcdle_spins (spin_day);

-- A bought spin: takes the points and saves the roll together, or neither when they can't
-- afford it (raises 'not_enough_points'). Only the frcdle-spin edge function calls it, which
-- picks the number and the cost.
CREATE OR REPLACE FUNCTION public.buy_frcdle_spin(
  p_user_id UUID,
  p_spin_day DATE,
  p_spin_number TEXT,
  p_time_zone TEXT,
  p_cost INTEGER
) RETURNS JSONB AS $$
DECLARE
  remaining INTEGER;
  bought public.frcdle_spins%ROWTYPE;
BEGIN
  UPDATE public.game_profiles
    SET points = points - p_cost, updated_at = now()
    WHERE user_id = p_user_id AND points >= p_cost
    RETURNING points INTO remaining;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_enough_points';
  END IF;

  INSERT INTO public.frcdle_spins (user_id, spin_day, spin_number, time_zone, purchased)
    VALUES (p_user_id, p_spin_day, p_spin_number, p_time_zone, true)
    RETURNING * INTO bought;

  RETURN jsonb_build_object(
    'spin', jsonb_build_object(
      'spin_day', bought.spin_day,
      'spin_number', bought.spin_number,
      'created_at', bought.created_at,
      'purchased', true
    ),
    'points', remaining
  );
END;
$$ LANGUAGE plpgsql SET search_path = public;

REVOKE ALL ON FUNCTION public.buy_frcdle_spin(UUID, DATE, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buy_frcdle_spin(UUID, DATE, TEXT, TEXT, INTEGER) TO service_role;
