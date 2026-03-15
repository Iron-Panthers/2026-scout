// Edge Function: Fetch profiles and qual_scouting_submissions and return CSV
//
// Uses team1/team2/team3 fields from scouting_data for deterministic team ordering
// instead of Object.keys(teamOptions) which gives arbitrary dictionary key order.

Deno.serve(async (req: Request) => {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'https://qwzsrlbhwigozonzthvx.supabase.co';
  const SUPABASE_KEY = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!SUPABASE_KEY) return new Response(JSON.stringify({ error: 'Missing SUPABASE key' }), { status: 500 });

  async function fetchTable(table: string) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=*`;
    const r = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' } });
    if (!r.ok) throw new Error(`Fetch ${table} failed: ${r.status}`);
    return await r.json();
  }

  const roleConversions: Record<string, [string, string]> = {
    blue1: ['Blue 1', 'Blue'], blue2: ['Blue 2', 'Blue'], blue3: ['Blue 3', 'Blue'], qualBlue: ['Blue Qual', 'Blue'],
    red1: ['Red 1', 'Red'], red2: ['Red 2', 'Red'], red3: ['Red 3', 'Red'], qualRed: ['Red Qual', 'Red'],
  };

  try {
    const [profiles, submissions] = await Promise.all([fetchTable('profiles'), fetchTable('qual_scouting_submissions')]);
    const userDict: Record<string, string> = {};
    const event_code = req.headers.get('event_code');
    profiles.forEach((u: any) => { userDict[u.id] = u.name; });

    const rows: any[][] = [];
    submissions.forEach((d: any) => {
      const sd = d.scouting_data || {};

      if (sd.event_code !== event_code) {
        return;
      }

      try {
        // Use team1/team2/team3 for deterministic ordering (backfilled from TBA)
        // Fall back to Object.keys(teamOptions) for any old submissions not yet backfilled
        const t1 = String(sd.team1 ?? Object.keys(sd.teamOptions || {})[0] ?? '');
        const t2 = String(sd.team2 ?? Object.keys(sd.teamOptions || {})[1] ?? '');
        const t3 = String(sd.team3 ?? Object.keys(sd.teamOptions || {})[2] ?? '');

        const version = d.schema_version || 1;

        const row = [
          '',
          JSON.stringify(d),
          d.time || '',
          version,
          userDict[d.scouter_id] || '',
          d.scouter_id || '',
          (roleConversions[sd.role]?.[1]) || '',
          sd.match_number || '',
          d.match_type || '',
          t1,
          sd.rankings ? sd.rankings.indexOf(parseInt(t1)) + 1 : '',
          sd.teamOptions?.[t1]?.outpostFed ?? '',
          sd.teamOptions?.[t1]?.passed ?? '',
          t2,
          sd.rankings ? sd.rankings.indexOf(parseInt(t2)) + 1 : '',
          sd.teamOptions?.[t2]?.outpostFed ?? '',
          sd.teamOptions?.[t2]?.passed ?? '',
          t3,
          sd.rankings ? sd.rankings.indexOf(parseInt(t3)) + 1 : '',
          sd.teamOptions?.[t3]?.outpostFed ?? '',
          sd.teamOptions?.[t3]?.passed ?? '',
        ];
        rows.push(row);
      } catch (err: any) {
        const row = ['Error processing: ', JSON.stringify(d), err.message];
        rows.push(row);
      }
    });

    rows.sort((a, b) => Date.parse(b[2]) - Date.parse(a[2]));

    return new Response(JSON.stringify(rows), { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="scouting.csv"' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message, help: err.cause }), { status: 500 });
  }
});
