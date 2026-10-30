// Every week's fantasy points, and ESPN's weekly projections where it has them, for the players the
// Players tab lists: everyone on a team in this league plus the most-rostered free agents (the same 200
// as /api/freeagents). Used by the Players tab's Schedule view.

const FANTASY = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl";

function defaultSeason() {
  const now = new Date();
  return now.getUTCMonth() < 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
}
function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...extraHeaders } });
}
const round1 = (n) => Math.round(n * 10) / 10;

export default async (req) => {
  const params = new URL(req.url).searchParams;
  const leagueId = params.get("leagueId") || process.env.LEAGUE_ID;
  const season = params.get("season") || process.env.SEASON || String(defaultSeason());
  const last = Number(params.get("last") || 18);
  if (!leagueId || !/^\d{1,12}$/.test(leagueId) || !/^\d{4}$/.test(season) || !(last >= 1 && last <= 18)) {
    return json(400, { error: "bad_request", message: "Invalid league, season or week." });
  }
  const periods = Array.from({ length: last }, (_, i) => i + 1);
  // QB, RB, WR, TE, D/ST and K; weekly splits only (statSplitTypeId 1), actual (0) and projected (1).
  const filter = (status, limit) => ({
    players: {
      filterStatus: { value: status },
      filterSlotIds: { value: [0, 2, 4, 6, 16, 17] },
      limit,
      sortPercOwned: { sortPriority: 1, sortAsc: false },
      filterStatsForSourceIds: { value: [0, 1] },
      filterStatsForSplitTypeIds: { value: [1] },
      filterStatsForScoringPeriodIds: { value: periods },
    },
  });
  const get = async (f) => {
    const headers = { accept: "application/json", "user-agent": "Mozilla/5.0 (fantasy-dashboard)", "x-fantasy-filter": JSON.stringify(f) };
    if (process.env.ESPN_S2 && process.env.SWID) headers.cookie = `espn_s2=${process.env.ESPN_S2}; SWID=${process.env.SWID}`;
    const res = await fetch(`${FANTASY}/seasons/${season}/segments/0/leagues/${leagueId}?view=kona_player_info`, { headers });
    if (!res.ok) throw new Error(`ESPN returned ${res.status}`);
    return (await res.json()).players || [];
  };
  let list;
  try {
    list = (await Promise.all([get(filter(["ONTEAM"], 400)), get(filter(["FREEAGENT", "WAIVERS"], 200))])).flat();
  } catch {
    return json(502, { error: "upstream", message: "Couldn't load weekly points from ESPN." });
  }
  // id -> { p: position id, a: { week: points scored }, j: { week: ESPN projection } }
  const players = {};
  for (const e of list) {
    const pl = e.player;
    if (!pl?.id) continue;
    const out = { p: pl.defaultPositionId, a: {}, j: {} };
    for (const s of pl.stats || []) {
      if (String(s.seasonId) !== season || s.statSplitTypeId !== 1 || !s.scoringPeriodId) continue;
      (s.statSourceId === 0 ? out.a : out.j)[s.scoringPeriodId] = round1(s.appliedTotal || 0);
    }
    players[pl.id] = out;
  }
  return json(200, { updated: Date.now(), players }, {
    "cache-control": "public, max-age=300",
    "netlify-cdn-cache-control": "public, max-age=600, stale-while-revalidate=1800",
  });
};

export const config = { path: "/api/weekly" };
