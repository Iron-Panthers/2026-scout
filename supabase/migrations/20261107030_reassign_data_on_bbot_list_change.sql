-- Saving an event's B-bot list (events.bbot_teams, {"9991": "581B"}) used to only change how
-- numbers display: data already scouted under a robot's old number stayed there. Managers now
-- save the list through set_event_bbot_teams, which moves each robot's existing data to its
-- new number in the same transaction:
--
--   * A robot whose demo number changed, or that left the list (back to its main team's
--     number), moves by number: everything at the event under the old demo number.
--   * A robot newly listed was scouted under its main team's number, mixed in with the main
--     robot, so only its match stations tell them apart. The app passes TBA's lettered slots
--     (p_slots: [{match_number, alliance, station, team, bot}]) and the match and qual scouting
--     at those stations moves. Pit scouting, picklists and notes can't be split, so stay.

-- n under the number moves ({"9991": 9992}), else n.
CREATE OR REPLACE FUNCTION bbot_remap_team(n INTEGER, moves JSONB)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE((moves->>(n::text))::int, n)
$$;

-- An array of team numbers under the moves, keeping each team's first place (two robots of a
-- team leaving the list both become the main team).
CREATE OR REPLACE FUNCTION bbot_remap_teams(teams INTEGER[], moves JSONB)
RETURNS INTEGER[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(array_agg(team ORDER BY first_idx), '{}')
  FROM (
    SELECT bbot_remap_team(t, moves) AS team, min(idx) AS first_idx
    FROM unnest(teams) WITH ORDINALITY u(t, idx)
    GROUP BY 1
  ) remapped
$$;

CREATE OR REPLACE FUNCTION set_event_bbot_teams(p_event_id UUID, p_bbot_teams JSONB, p_slots JSONB DEFAULT '[]'::jsonb)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_teams JSONB;
  -- Number moves, old number -> new: {"9991": 9992}
  moves JSONB := '{}'::jsonb;
  -- Robots newly listed, "581B" -> their demo number
  added JSONB := '{}'::jsonb;
  robot TEXT;
  main_team INTEGER;
  from_team INTEGER;
  to_team INTEGER;
  slot RECORD;
  changed INTEGER := 0;
  n INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_manager = true) THEN
    RAISE EXCEPTION 'Only managers can change the B-bot list';
  END IF;
  IF jsonb_typeof(p_bbot_teams) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'The B-bot list must be an object of demo numbers';
  END IF;

  SELECT bbot_teams INTO old_teams FROM events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found';
  END IF;
  UPDATE events SET bbot_teams = p_bbot_teams WHERE id = p_event_id;

  -- Each robot's number before and after: its demo number if listed, else its main team's
  FOR robot IN
    SELECT DISTINCT upper(value) FROM (
      SELECT value FROM jsonb_each_text(old_teams) UNION ALL SELECT value FROM jsonb_each_text(p_bbot_teams)
    ) listed
    WHERE upper(value) ~ '^\d{1,5}[B-E]$'
  LOOP
    main_team := substring(robot FROM '^\d+')::int;
    from_team := COALESCE((SELECT key::int FROM jsonb_each_text(old_teams) WHERE upper(value) = robot AND key ~ '^\d+$' LIMIT 1), main_team);
    to_team := COALESCE((SELECT key::int FROM jsonb_each_text(p_bbot_teams) WHERE upper(value) = robot AND key ~ '^\d+$' LIMIT 1), main_team);
    IF from_team = to_team THEN
      CONTINUE;
    ELSIF from_team <> main_team THEN
      moves := moves || jsonb_build_object(from_team::text, to_team);
    ELSE
      added := added || jsonb_build_object(robot, to_team);
    END IF;
  END LOOP;

  IF moves <> '{}'::jsonb THEN
    -- Match scouting
    UPDATE scouting_submissions ss
    SET team_num = bbot_remap_team(ss.team_num, moves),
        scouting_data = CASE WHEN ss.scouting_data ? 'team_number'
          THEN jsonb_set(ss.scouting_data, '{team_number}', to_jsonb(bbot_remap_team(ss.team_num, moves)))
          ELSE ss.scouting_data END
    FROM matches m
    WHERE ss.match_id = m.id AND m.event_id = p_event_id AND moves ? ss.team_num::text;
    GET DIAGNOSTICS n = ROW_COUNT;
    changed := changed + n;

    -- Qual scouting: its team1-3 and the rankings
    UPDATE qual_scouting_submissions q
    SET scouting_data = q.scouting_data
      || (
        SELECT COALESCE(jsonb_object_agg(k, to_jsonb((moves->>(q.scouting_data->>k))::int)), '{}'::jsonb)
        FROM unnest(ARRAY['team1', 'team2', 'team3']) k
        WHERE moves ? (q.scouting_data->>k)
      )
      || CASE WHEN jsonb_typeof(q.scouting_data->'rankings') = 'array' THEN jsonb_build_object('rankings', (
        SELECT COALESCE(jsonb_agg(CASE WHEN moves ? (r.val #>> '{}') THEN moves->(r.val #>> '{}') ELSE r.val END ORDER BY r.idx), '[]'::jsonb)
        FROM jsonb_array_elements(q.scouting_data->'rankings') WITH ORDINALITY r(val, idx)
      )) ELSE '{}'::jsonb END
    FROM matches m
    WHERE q.match_id = m.id AND m.event_id = p_event_id
      AND (moves ? (q.scouting_data->>'team1') OR moves ? (q.scouting_data->>'team2') OR moves ? (q.scouting_data->>'team3'));
    GET DIAGNOSTICS n = ROW_COUNT;
    changed := changed + n;

    -- Tables with one row per team (per scouter or user): a row whose new number is already
    -- taken stays where it is. Moved rows park at the negative of their new number first, so
    -- robots swapping numbers don't collide.
    UPDATE pit_scouting_submissions p
    SET team_num = -bbot_remap_team(p.team_num, moves)
    WHERE p.event_id = p_event_id AND moves ? p.team_num::text
      AND NOT EXISTS (
        SELECT 1 FROM pit_scouting_submissions o
        WHERE o.event_id = p.event_id AND o.scouter_id = p.scouter_id AND o.id <> p.id
          AND (o.team_num = bbot_remap_team(p.team_num, moves) AND NOT moves ? o.team_num::text
            OR bbot_remap_team(o.team_num, moves) = bbot_remap_team(p.team_num, moves) AND moves ? o.team_num::text AND o.id < p.id)
      );
    UPDATE pit_scouting_submissions SET team_num = -team_num WHERE event_id = p_event_id AND team_num < 0;
    GET DIAGNOSTICS n = ROW_COUNT;
    changed := changed + n;

    UPDATE pit_scouting_assignments p
    SET team_number = -bbot_remap_team(p.team_number, moves)
    WHERE p.event_id = p_event_id AND moves ? p.team_number::text
      AND NOT EXISTS (
        SELECT 1 FROM pit_scouting_assignments o
        WHERE o.event_id = p.event_id AND o.id <> p.id
          AND (o.team_number = bbot_remap_team(p.team_number, moves) AND NOT moves ? o.team_number::text
            OR bbot_remap_team(o.team_number, moves) = bbot_remap_team(p.team_number, moves) AND moves ? o.team_number::text AND o.id < p.id)
      );
    -- Ones that couldn't move duplicate an assignment the new number already has
    DELETE FROM pit_scouting_assignments WHERE event_id = p_event_id AND team_number > 0 AND moves ? team_number::text;
    UPDATE pit_scouting_assignments SET team_number = -team_number WHERE event_id = p_event_id AND team_number < 0;

    UPDATE picklist_team_notes p
    SET team_number = -bbot_remap_team(p.team_number, moves)
    WHERE p.event_id = p_event_id AND moves ? p.team_number::text
      AND NOT EXISTS (
        SELECT 1 FROM picklist_team_notes o
        WHERE o.event_id = p.event_id AND o.user_id = p.user_id AND o.id <> p.id
          AND (o.team_number = bbot_remap_team(p.team_number, moves) AND NOT moves ? o.team_number::text
            OR bbot_remap_team(o.team_number, moves) = bbot_remap_team(p.team_number, moves) AND moves ? o.team_number::text AND o.id < p.id)
      );
    UPDATE picklist_team_notes SET team_number = -team_number WHERE event_id = p_event_id AND team_number < 0;

    -- Picklists
    UPDATE picklists
    SET picked_team_numbers = bbot_remap_teams(picked_team_numbers, moves),
        do_not_pick_team_numbers = bbot_remap_teams(do_not_pick_team_numbers, moves)
    WHERE event_id = p_event_id
      AND EXISTS (SELECT 1 FROM unnest(picked_team_numbers || do_not_pick_team_numbers) t WHERE moves ? t::text);

    UPDATE live_picklists
    SET entries = (
      SELECT COALESCE(jsonb_agg(CASE WHEN moves ? (e.val->>'teamNumber')
        THEN jsonb_set(e.val, '{teamNumber}', moves->(e.val->>'teamNumber')) ELSE e.val END ORDER BY e.idx), '[]'::jsonb)
      FROM jsonb_array_elements(entries) WITH ORDINALITY e(val, idx)
    )
    WHERE event_id = p_event_id AND jsonb_typeof(entries) = 'array';

    UPDATE live_picklist_suggestions
    SET team_number = bbot_remap_team(team_number, moves),
        tie_team_number = CASE WHEN tie_team_number IS NULL THEN NULL ELSE bbot_remap_team(tie_team_number, moves) END
    WHERE event_id = p_event_id AND (moves ? team_number::text OR moves ? tie_team_number::text);
  END IF;

  -- Newly listed robots: match and qual scouting at their TBA stations, in station order so a
  -- team's robots on one alliance take its ranking copies in the order they stand
  IF added <> '{}'::jsonb THEN
    FOR slot IN
      SELECT (s->>'match_number')::int AS match_number, s->>'alliance' AS alliance, (s->>'station')::int AS station,
        (s->>'team')::int AS team, (added->>((s->>'team') || upper(s->>'bot')))::int AS demo_number
      FROM jsonb_array_elements(COALESCE(p_slots, '[]'::jsonb)) s
      WHERE added ? ((s->>'team') || upper(s->>'bot')) AND s->>'alliance' IN ('red', 'blue') AND (s->>'station')::int BETWEEN 1 AND 3
      ORDER BY 1, 2, 3
    LOOP
      UPDATE scouting_submissions ss
      SET team_num = slot.demo_number,
          scouting_data = CASE WHEN ss.scouting_data ? 'team_number'
            THEN jsonb_set(ss.scouting_data, '{team_number}', to_jsonb(slot.demo_number))
            ELSE ss.scouting_data END
      FROM matches m
      WHERE ss.match_id = m.id AND m.event_id = p_event_id AND m.match_number = slot.match_number
        AND ss.role = slot.alliance || slot.station
        AND COALESCE(ss.match_type, 'Qualification') = 'Qualification'
        AND ss.team_num = slot.team;
      GET DIAGNOSTICS n = ROW_COUNT;
      changed := changed + n;

      UPDATE qual_scouting_submissions q
      SET scouting_data = jsonb_set(
        jsonb_set(q.scouting_data, ARRAY['team' || slot.station], to_jsonb(slot.demo_number)),
        '{rankings}',
        (
          SELECT COALESCE(jsonb_agg(CASE WHEN r.idx = (
            -- The copy of the team's number that's this robot's: as many in as there are
            -- robots under that number at stations before it
            SELECT c.idx FROM jsonb_array_elements(q.scouting_data->'rankings') WITH ORDINALITY c(val, idx)
            WHERE c.val #>> '{}' = slot.team::text
            ORDER BY c.idx
            OFFSET (SELECT count(*) FROM generate_series(1, slot.station - 1) j WHERE q.scouting_data->>('team' || j) = slot.team::text)
            LIMIT 1
          ) THEN to_jsonb(slot.demo_number) ELSE r.val END ORDER BY r.idx), '[]'::jsonb)
          FROM jsonb_array_elements(q.scouting_data->'rankings') WITH ORDINALITY r(val, idx)
        )
      )
      FROM matches m
      WHERE q.match_id = m.id AND m.event_id = p_event_id AND m.match_number = slot.match_number
        AND q.role = CASE slot.alliance WHEN 'red' THEN 'qualRed' ELSE 'qualBlue' END
        AND jsonb_typeof(q.scouting_data->'rankings') = 'array'
        AND q.scouting_data->>('team' || slot.station) = slot.team::text;
      GET DIAGNOSTICS n = ROW_COUNT;
      changed := changed + n;
    END LOOP;
  END IF;

  RETURN changed;
END;
$$;

REVOKE ALL ON FUNCTION set_event_bbot_teams(UUID, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_event_bbot_teams(UUID, JSONB, JSONB) TO authenticated;
