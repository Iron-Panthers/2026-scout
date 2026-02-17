-- Create storage bucket for pit scouting photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('pit-scouting-photos', 'pit-scouting-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS for the bucket
CREATE POLICY "Authenticated users can upload pit photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'pit-scouting-photos' AND
    auth.uid() IS NOT NULL
  );

-- All authenticated users can view pit photos
CREATE POLICY "Authenticated users can view pit photos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'pit-scouting-photos' AND
    auth.uid() IS NOT NULL
  );

-- All authenticated users can update pit photos
CREATE POLICY "Authenticated users can update pit photos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'pit-scouting-photos' AND
    auth.uid() IS NOT NULL
  );

-- All authenticated users can delete pit photos
CREATE POLICY "Authenticated users can delete pit photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'pit-scouting-photos' AND
    auth.uid() IS NOT NULL
  );
