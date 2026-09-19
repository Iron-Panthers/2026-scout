-- Create storage bucket for uploaded event scouting-map images. The
-- `events.scouting_map_url` column already exists and just stores whatever
-- URL is set — this bucket lets managers upload an image instead of only
-- being able to paste an externally-hosted link.
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-maps', 'event-maps', true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS for the bucket
DROP POLICY IF EXISTS "Authenticated users can upload event maps" ON storage.objects;
CREATE POLICY "Authenticated users can upload event maps"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'event-maps' AND
    auth.uid() IS NOT NULL
  );

-- All authenticated users can view event maps
DROP POLICY IF EXISTS "Authenticated users can view event maps" ON storage.objects;
CREATE POLICY "Authenticated users can view event maps"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'event-maps' AND
    auth.uid() IS NOT NULL
  );

-- All authenticated users can update event maps
DROP POLICY IF EXISTS "Authenticated users can update event maps" ON storage.objects;
CREATE POLICY "Authenticated users can update event maps"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'event-maps' AND
    auth.uid() IS NOT NULL
  );

-- All authenticated users can delete event maps
DROP POLICY IF EXISTS "Authenticated users can delete event maps" ON storage.objects;
CREATE POLICY "Authenticated users can delete event maps"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'event-maps' AND
    auth.uid() IS NOT NULL
  );
