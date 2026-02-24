-- Create storage bucket for pit scouting photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('pit-scouting-photos', 'pit-scouting-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS for the bucket
DROP POLICY IF EXISTS "Authenticated users can upload pit photos" ON storage.objects;
CREATE POLICY "Authenticated users can upload pit photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'pit-scouting-photos' AND
    auth.uid() IS NOT NULL
  );

-- All authenticated users can view pit photos
DROP POLICY IF EXISTS "Authenticated users can view pit photos" ON storage.objects;
CREATE POLICY "Authenticated users can view pit photos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'pit-scouting-photos' AND
    auth.uid() IS NOT NULL
  );

-- All authenticated users can update pit photos
DROP POLICY IF EXISTS "Authenticated users can update pit photos" ON storage.objects;
CREATE POLICY "Authenticated users can update pit photos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'pit-scouting-photos' AND
    auth.uid() IS NOT NULL
  );

-- All authenticated users can delete pit photos
DROP POLICY IF EXISTS "Authenticated users can delete pit photos" ON storage.objects;
CREATE POLICY "Authenticated users can delete pit photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'pit-scouting-photos' AND
    auth.uid() IS NOT NULL
  );
