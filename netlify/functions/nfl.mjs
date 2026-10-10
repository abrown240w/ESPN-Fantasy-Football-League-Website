// NFL context for a week: each pro team's opponent, and ESPN's opponent rank (OPRK),
// i.e. how many fantasy points each NFL defense allows to each position.
// Rank 1 allows the fewest points (toughest matchup); rank 32 allows the most.

const ESPN = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl";

function defaultSeason() {
  const now = new Date();
  return now.getUTCMonth() < 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
}

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...extraHeaders } });
}

async function getJson(url, extra = {}) {
  const headers = { accept: "application/json", "user-agent": "Mozilla/5.0 (fantasy-dashboard)", ...extra };
  if (process.env.ESPN_S2 && process.env.SWID) headers.cookie = `espn_s2=${process.env.ESPN_S2}; SWID=${process.env.SWID}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`ESPN returned ${res.status}`);
  return res.json();
}

export default async (req) => {
  const params = new URL(req.url).searchParams;
  const leagueId = params.get("leagueId") || process.env.LEAGUE_ID;
  const season = params.get("season") || process.env.SEASON || String(defaultSeason());
  const sp = params.get("scoringPeriodId") || "1";
  if (!leagueId || !/^\d{1,12}$/.test(leagueId) || !/^\d{4}$/.test(season) || !/^\d{1,2}$/.test(sp)) {
    return json(400, { error: "bad_request", message: "Invalid league, season or week." });
  }

  try {
    const [sched, kona] = await Promise.all([
      getJson(`${ESPN}/seasons/${season}?view=proTeamSchedules_wl`),
      // OPRK comes along with any player query; ask for a single player to keep it small.
      getJson(`${ESPN}/seasons/${season}/segments/0/leagues/${leagueId}?view=kona_player_info&scoringPeriodId=${sp}`, {
        "x-fantasy-filter": JSON.stringify({ players: { limit: 1, sortPercOwned: { sortPriority: 1, sortAsc: false } } }),
      }),
    ]);

    // games[proTeamId] = [opponentProTeamId, isHome, kickoff]; teams on bye are left out.
    const games = {};
    const byes = {};
    for (const t of sched.settings?.proTeams || []) {
      if (!t.id) continue;
      byes[t.id] = t.byeWeek;
      const g = (t.proGamesByScoringPeriod?.[sp] || [])[0];
      if (g) {
        const home = g.homeProTeamId === t.id;
        games[t.id] = [home ? g.awayProTeamId : g.homeProTeamId, home, g.date];
      }
    }

    // oprk[positionId][proTeamId] = [rank, average points allowed]
    const oprk = {};
    for (const [posId, r] of Object.entries(kona.positionAgainstOpponent?.positionalRatings || {})) {
      oprk[posId] = {};
      for (const [teamId, v] of Object.entries(r.ratingsByOpponent || {})) {
        oprk[posId][teamId] = [v.rank, Math.round(v.average * 10) / 10];
      }
    }

    return json(200, { games, byes, oprk }, {
      "cache-control": "public, max-age=900",
      "netlify-cdn-cache-control": "public, max-age=3600, stale-while-revalidate=21600",
    });
  } catch {
    return json(502, { error: "upstream", message: "Couldn't load NFL matchup data from ESPN." });
  }
};

export const config = { path: "/api/nfl" };
