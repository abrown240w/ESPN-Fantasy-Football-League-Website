// Box score for one NFL game: player stats by category (passing, rushing, receiving, defense,
// kicking, …) for each team, plus team stats. From ESPN's public game summary. Short cache while
// the game is live so the Live games tab can refresh it with the scores.

const SUMMARY = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary";

// Team stats shown (in this order). `bar` rows get a comparison bar like ESPN's.
const TEAM_STATS = [
  ["totalYards", "Total yards", true],
  ["netPassingYards", "Passing yards", true],
  ["rushingYards", "Rushing yards", true],
  ["yardsPerPlay", "Yards per play", true],
  ["firstDowns", "First downs"],
  ["thirdDownEff", "3rd downs (Conv-Att)"],
  ["fourthDownEff", "4th downs (Conv-Att)"],
  ["totalOffensivePlays", "Total plays"],
  ["completionAttempts", "Comp/Att"],
  ["sacksYardsLost", "Sacks-Yards lost"],
  ["totalPenaltiesYards", "Penalties-Yards"],
  ["turnovers", "Turnovers"],
  ["fumblesLost", "Fumbles lost"],
  ["interceptions", "Interceptions thrown"],
  ["redZoneAttempts", "Red zone (Made-Att)"],
  ["possessionTime", "Time of possession"],
];

const CATEGORY = { passing: "Passing", rushing: "Rushing", receiving: "Receiving", fumbles: "Fumbles", defensive: "Defense", interceptions: "Interceptions", kickReturns: "Kick returns", puntReturns: "Punt returns", kicking: "Kicking", punting: "Punting" };

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...extraHeaders } });
}

export default async (req) => {
  const event = new URL(req.url).searchParams.get("event") || "";
  if (!/^\d{6,12}$/.test(event)) return json(400, { error: "bad_request", message: "Invalid game." });
  try {
    const res = await fetch(`${SUMMARY}?event=${event}`, { headers: { accept: "application/json", "user-agent": "brownleague.netlify.app (private fantasy league site)" } });
    if (!res.ok) throw new Error(`ESPN returned ${res.status}`);
    const d = await res.json();
    const comp = d.header?.competitions?.[0] || {};
    const state = comp.status?.type?.state || "pre";
    const sideOf = (teamId) => comp.competitors?.find((c) => String(c.team?.id) === String(teamId))?.homeAway || "";

    const teams = {};
    for (const t of d.boxscore?.teams || []) {
      const side = t.homeAway || sideOf(t.team?.id);
      const byName = {};
      for (const s of t.statistics || []) if (!(s.name in byName)) byName[s.name] = (s.displayValue || "").trim();
      teams[side] = { proId: Number(t.team?.id), abbr: t.team?.abbreviation || "", name: t.team?.shortDisplayName || t.team?.displayName || "", stats: byName };
    }
    const teamStats = TEAM_STATS.filter(([k]) => teams.away?.stats[k] != null || teams.home?.stats[k] != null)
      .map(([k, label, bar]) => ({ label, away: teams.away?.stats[k] ?? "–", home: teams.home?.stats[k] ?? "–", bar: !!bar }));

    const players = { away: [], home: [] };
    for (const t of d.boxscore?.players || []) {
      const side = sideOf(t.team?.id);
      if (!players[side]) continue;
      for (const c of t.statistics || []) {
        const rows = (c.athletes || []).map((a) => ({
          id: Number(a.athlete?.id) || null, name: a.athlete?.displayName || "", short: a.athlete?.shortName || "",
          jersey: a.athlete?.jersey || "", headshot: a.athlete?.headshot?.href || "", stats: a.stats || [],
        }));
        if (rows.length) players[side].push({ key: c.name, title: CATEGORY[c.name] || c.name || "", labels: c.labels || [], rows });
      }
    }
    for (const side of ["away", "home"]) if (teams[side]) delete teams[side].stats;

    // Scoring plays, in game order: "D'Andre Swift 4 Yd Rush (Cairo Santos Kick)".
    const scoring = (d.scoringPlays || []).map((p) => ({
      id: String(p.id || ""), type: p.type?.abbreviation || p.scoringType?.abbreviation || "", kind: p.type?.text || "",
      text: (p.text || "").trim(), period: p.period?.number || 0, clock: p.clock?.displayValue || "",
      team: p.team?.abbreviation || "", proId: Number(p.team?.id) || null, away: p.awayScore ?? null, home: p.homeScore ?? null,
    }));

    return json(200, { event, state, updated: Date.now(), teams, teamStats, players, scoring }, {
      "cache-control": `public, max-age=${state === "in" ? 15 : 300}`,
      "netlify-cdn-cache-control": `public, max-age=${state === "in" ? 20 : state === "post" ? 3600 : 300}`,
    });
  } catch {
    return json(502, { error: "upstream", message: "Couldn't load the box score from ESPN." }, { "cache-control": "no-store" });
  }
};

export const config = { path: "/api/boxscore" };
