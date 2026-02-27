-- Migrate photo_urls (TEXT[]) to photo_url (TEXT), preserving first element
ALTER TABLE pit_scouting_submissions
  ADD COLUMN photo_url TEXT;

UPDATE pit_scouting_submissions
  SET photo_url = photo_urls[1]
  WHERE photo_urls IS NOT NULL AND array_length(photo_urls, 1) > 0;

ALTER TABLE pit_scouting_submissions
  DROP COLUMN photo_urls;
