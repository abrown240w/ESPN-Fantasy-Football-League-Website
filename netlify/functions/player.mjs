// One player's game log for the season: each week's NFL opponent, raw stats, and ESPN's
// per-stat fantasy points under this league's scoring (appliedStats), which the site uses
// to explain exactly how each score was earned.

const FANTASY = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl";

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

const round2 = (n) => Math.round(n * 100) / 100;

export default async (req) => {
  const params = new URL(req.url).searchParams;
  const leagueId = params.get("leagueId") || process.env.LEAGUE_ID;
  const season = params.get("season") || process.env.SEASON || String(defaultSeason());
  const id = params.get("id") || "";
  // D/ST player IDs are negative.
  if (!leagueId || !/^\d{1,12}$/.test(leagueId) || !/^\d{4}$/.test(season) || !/^-?\d{1,10}$/.test(id)) {
    return json(400, { error: "bad_request", message: "Invalid league, season or player." });
  }

  try {
    const filter = { players: { filterIds: { value: [Number(id)] }, filterStatsForTopScoringPeriodIds: { value: 17, additionalValue: [`00${season}`, `10${season}`] } } };
    const [card, sched] = await Promise.all([
      getJson(`${FANTASY}/seasons/${season}/segments/0/leagues/${leagueId}?view=kona_playercard`, { "x-fantasy-filter": JSON.stringify(filter) }),
      getJson(`${FANTASY}/seasons/${season}?view=proTeamSchedules_wl`),
    ]);
    const entry = card.players?.[0];
    if (!entry) return json(404, { error: "not_found", message: "Player not found." });
    const pl = entry.player || {};
    const stats = pl.stats || [];
    const seasonOf = (src) => stats.find((s) => String(s.seasonId) === season && s.scoringPeriodId === 0 && s.statSourceId === src);

    const proTeam = (sched.settings?.proTeams || []).find((t) => t.id === pl.proTeamId);
    const weeks = stats
      .filter((s) => String(s.seasonId) === season && s.statSourceId === 0 && s.statSplitTypeId === 1 && s.scoringPeriodId > 0)
      .sort((a, b) => a.scoringPeriodId - b.scoringPeriodId)
      .map((s) => {
        // Opponent from the team the player was on that week (handles mid-season trades).
        const team = (sched.settings?.proTeams || []).find((t) => t.id === s.proTeamId) || proTeam;
        const g = team?.proGamesByScoringPeriod?.[s.scoringPeriodId]?.[0];
        const home = g ? g.homeProTeamId === team.id : null;
        const applied = Object.fromEntries(Object.entries(s.appliedStats || {}).filter(([, v]) => v).map(([k, v]) => [k, round2(v)]));
        return {
          sp: s.scoringPeriodId,
          proId: s.proTeamId,
          opp: g ? (home ? g.awayProTeamId : g.homeProTeamId) : null,
          home,
          date: g?.date || null,
          pts: round2(s.appliedTotal || 0),
          stats: s.stats || {},
          applied,
        };
      });

    return json(200, {
      player: {
        id: pl.id, name: pl.fullName, posId: pl.defaultPositionId, proId: pl.proTeamId,
        injury: pl.injuryStatus && pl.injuryStatus !== "ACTIVE" ? pl.injuryStatus : "",
        teamId: entry.onTeamId || 0, bye: proTeam?.byeWeek || null,
      },
      byes: Object.fromEntries((sched.settings?.proTeams || []).map((t) => [t.id, t.byeWeek || null])),
      seasonPts: round2(seasonOf(0)?.appliedTotal || 0),
      seasonProj: round2(seasonOf(1)?.appliedTotal || 0),
      weeks,
    }, {
      // Short cache so live games stay reasonably fresh.
      "cache-control": "public, max-age=60",
      "netlify-cdn-cache-control": "public, max-age=60, stale-while-revalidate=120",
    });
  } catch {
    return json(502, { error: "upstream", message: "Couldn't load this player's game log from ESPN." });
  }
};

export const config = { path: "/api/player" };
