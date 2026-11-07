-- Before B-bots were scouted under their off-season demo numbers, the app read TBA's "581B"
-- as 581, so 2026 Madtown Throwdown's old B-bot submissions were saved under the main team.
-- This moves each one to the demo number the event's bbot_teams lists for it (581B -> 9991),
-- using the station TBA put the B-bot in for each qualification match.
--
-- Only rows still showing the main team at that station change, so running it again does nothing.
-- In a few matches a team's main robot and B-bot were on the same alliance; the qualitative
-- rankings list both under the same number then, so the B-bot gets the copy that matches its
-- station order (`later` = the B-bot's station comes after the main robot's).

CREATE TEMP TABLE bbot_slots AS
WITH slots(match_number, alliance, station, team, bot, later, shared) AS (
  VALUES
    (1, 'blue', 1, 2073, 'B', false, false),
    (2, 'blue', 3, 581, 'B', false, false),
    (3, 'red', 2, 4698, 'B', false, false),
    (4, 'blue', 1, 8033, 'B', false, false),
    (4, 'blue', 2, 1678, 'C', false, false),
    (6, 'red', 2, 841, 'B', false, false),
    (6, 'blue', 1, 1868, 'B', false, false),
    (6, 'blue', 2, 9470, 'B', false, false),
    (6, 'blue', 3, 973, 'B', false, false),
    (7, 'red', 2, 971, 'B', false, false),
    (7, 'red', 3, 581, 'C', false, false),
    (7, 'blue', 2, 5940, 'B', false, false),
    (8, 'red', 3, 1678, 'B', false, false),
    (8, 'blue', 2, 1323, 'B', false, false),
    (9, 'red', 2, 1678, 'C', false, false),
    (9, 'blue', 2, 2073, 'B', false, false),
    (11, 'red', 1, 9470, 'B', false, false),
    (11, 'blue', 1, 581, 'B', false, false),
    (11, 'blue', 3, 973, 'B', false, false),
    (12, 'red', 2, 1868, 'B', false, false),
    (12, 'blue', 2, 1678, 'B', false, false),
    (13, 'red', 1, 4698, 'B', false, false),
    (14, 'red', 1, 971, 'B', false, false),
    (14, 'red', 2, 5940, 'B', false, false),
    (14, 'red', 3, 8033, 'B', false, false),
    (14, 'blue', 3, 841, 'B', false, false),
    (16, 'blue', 2, 581, 'C', false, false),
    (16, 'blue', 3, 1323, 'B', false, false),
    (17, 'red', 1, 1868, 'B', false, false),
    (17, 'red', 3, 1678, 'C', false, false),
    (18, 'blue', 2, 973, 'B', false, false),
    (19, 'red', 1, 9470, 'B', false, false),
    (19, 'red', 3, 4698, 'B', false, false),
    (20, 'red', 3, 1678, 'B', false, false),
    (21, 'red', 2, 2073, 'B', false, false),
    (21, 'blue', 1, 841, 'B', false, false),
    (21, 'blue', 2, 1323, 'B', false, false),
    (21, 'blue', 3, 971, 'B', false, false),
    (22, 'blue', 3, 5940, 'B', false, false),
    (23, 'blue', 3, 581, 'C', false, false),
    (24, 'red', 2, 581, 'B', false, false),
    (24, 'blue', 2, 8033, 'B', false, false),
    (25, 'red', 3, 841, 'B', false, false),
    (26, 'red', 2, 9470, 'B', false, false),
    (27, 'red', 1, 1323, 'B', false, false),
    (27, 'blue', 2, 4698, 'B', false, false),
    (27, 'blue', 3, 1868, 'B', false, false),
    (28, 'red', 1, 581, 'B', false, false),
    (28, 'blue', 1, 581, 'C', false, false),
    (29, 'red', 3, 8033, 'B', true, true),
    (29, 'blue', 1, 2073, 'B', false, false),
    (30, 'blue', 1, 973, 'B', false, false),
    (30, 'blue', 2, 1678, 'B', false, false),
    (30, 'blue', 3, 5940, 'B', false, false),
    (31, 'red', 1, 971, 'B', false, false),
    (32, 'red', 3, 1678, 'C', false, false),
    (33, 'red', 1, 841, 'B', false, false),
    (33, 'blue', 1, 581, 'B', false, false),
    (34, 'red', 1, 1678, 'B', false, false),
    (34, 'blue', 3, 973, 'B', false, false),
    (35, 'red', 1, 1323, 'B', false, false),
    (35, 'blue', 1, 971, 'B', false, false),
    (36, 'red', 2, 5940, 'B', false, false),
    (37, 'blue', 2, 4698, 'B', false, false),
    (38, 'red', 1, 1868, 'B', false, false),
    (38, 'red', 2, 8033, 'B', false, false),
    (38, 'blue', 3, 1678, 'C', false, false),
    (39, 'red', 2, 2073, 'B', false, false),
    (39, 'blue', 2, 9470, 'B', true, true),
    (40, 'blue', 2, 581, 'C', false, false),
    (41, 'red', 3, 581, 'B', true, true),
    (42, 'red', 1, 8033, 'B', false, false),
    (42, 'red', 2, 1678, 'B', false, false),
    (42, 'blue', 3, 4698, 'B', false, false),
    (43, 'red', 1, 1678, 'C', false, false),
    (43, 'blue', 1, 973, 'B', false, false),
    (43, 'blue', 3, 971, 'B', false, false),
    (44, 'red', 1, 1323, 'B', false, false),
    (45, 'red', 3, 5940, 'B', false, false),
    (45, 'blue', 1, 1868, 'B', false, false),
    (46, 'blue', 3, 841, 'B', false, false),
    (47, 'red', 1, 9470, 'B', false, false),
    (48, 'red', 3, 2073, 'B', false, false),
    (48, 'blue', 1, 581, 'C', false, false),
    (49, 'red', 1, 971, 'B', false, false),
    (49, 'blue', 2, 1678, 'B', false, false),
    (50, 'red', 2, 8033, 'B', false, false),
    (51, 'blue', 1, 581, 'B', false, false),
    (52, 'red', 1, 5940, 'B', false, false),
    (52, 'red', 3, 581, 'C', false, false),
    (52, 'blue', 2, 4698, 'B', false, false),
    (53, 'red', 1, 2073, 'B', false, false),
    (53, 'red', 3, 973, 'B', false, false),
    (53, 'blue', 2, 1868, 'B', false, false),
    (54, 'blue', 2, 841, 'B', false, false),
    (55, 'red', 1, 9470, 'B', false, false),
    (55, 'blue', 3, 1678, 'C', false, false),
    (56, 'red', 3, 1323, 'B', false, false),
    (57, 'red', 3, 973, 'B', false, false),
    (59, 'red', 1, 841, 'B', false, false),
    (60, 'red', 2, 4698, 'B', false, false),
    (60, 'blue', 2, 971, 'B', false, false),
    (61, 'red', 1, 581, 'B', false, false),
    (61, 'red', 2, 1678, 'C', false, false),
    (61, 'red', 3, 2073, 'B', false, false),
    (61, 'blue', 3, 1678, 'B', true, true),
    (62, 'red', 3, 5940, 'B', false, false),
    (62, 'blue', 1, 8033, 'B', false, false),
    (62, 'blue', 2, 1323, 'B', false, false),
    (62, 'blue', 3, 9470, 'B', false, false),
    (64, 'red', 1, 1868, 'B', false, false),
    (64, 'red', 2, 581, 'C', false, false),
    (65, 'red', 1, 841, 'B', false, true),
    (65, 'blue', 3, 1678, 'C', false, false),
    (66, 'red', 1, 8033, 'B', false, false),
    (66, 'red', 3, 581, 'B', false, false),
    (66, 'blue', 2, 1323, 'B', false, false),
    (67, 'blue', 1, 5940, 'B', false, false),
    (68, 'blue', 2, 971, 'B', false, false),
    (69, 'blue', 1, 1678, 'B', false, false),
    (69, 'blue', 2, 9470, 'B', false, false),
    (70, 'red', 3, 973, 'B', false, false),
    (70, 'blue', 1, 4698, 'B', false, false),
    (70, 'blue', 3, 2073, 'B', false, false),
    (71, 'red', 3, 581, 'C', false, false),
    (71, 'blue', 3, 1868, 'B', false, false)
)
SELECT slots.*, e.id AS event_id, demo.key::int AS demo_number
FROM slots
JOIN events e ON e.event_code = '2026mttd'
JOIN LATERAL jsonb_each_text(e.bbot_teams) demo ON upper(demo.value) = slots.team || slots.bot;

-- Quantitative: one row per station
UPDATE scouting_submissions ss
SET team_num = s.demo_number,
    scouting_data = CASE WHEN ss.scouting_data ? 'team_number'
      THEN jsonb_set(ss.scouting_data, '{team_number}', to_jsonb(s.demo_number))
      ELSE ss.scouting_data END
FROM bbot_slots s, matches m
WHERE ss.match_id = m.id
  AND m.event_id = s.event_id
  AND m.match_number = s.match_number
  AND ss.role = s.alliance || s.station
  AND COALESCE(ss.match_type, 'Qualification') = 'Qualification'
  AND ss.team_num = s.team;

-- Qualitative: the station's teamN, then its entry in the rankings. One slot at a time, since
-- an alliance can hold two B-bots and an UPDATE ... FROM only applies one match per row.
DO $$
DECLARE
  s RECORD;
BEGIN
  FOR s IN SELECT * FROM bbot_slots LOOP
    UPDATE qual_scouting_submissions q
    SET scouting_data = jsonb_set(
      jsonb_set(q.scouting_data, ARRAY['team' || s.station], to_jsonb(s.demo_number)),
      '{rankings}',
      COALESCE((
        SELECT jsonb_agg(
          CASE WHEN r.idx = (
            -- Which copy of the main team's number is the B-bot's
            SELECT CASE WHEN s.shared AND s.later THEN max(i.idx) ELSE min(i.idx) END
            FROM jsonb_array_elements(q.scouting_data->'rankings') WITH ORDINALITY i(val, idx)
            WHERE i.val #>> '{}' = s.team::text
          ) THEN to_jsonb(s.demo_number) ELSE r.val END
          ORDER BY r.idx)
        FROM jsonb_array_elements(q.scouting_data->'rankings') WITH ORDINALITY r(val, idx)
      ), '[]'::jsonb)
    )
    FROM matches m
    WHERE q.match_id = m.id
      AND m.event_id = s.event_id
      AND m.match_number = s.match_number
      AND q.role = CASE s.alliance WHEN 'red' THEN 'qualRed' ELSE 'qualBlue' END
      AND jsonb_typeof(q.scouting_data->'rankings') = 'array'
      AND q.scouting_data->>('team' || s.station) = s.team::text;
  END LOOP;
END;
$$;

DROP TABLE bbot_slots;
