// Free agents and players on waivers for a league, most-rostered first (across all ESPN
// leagues), with this week's projection/points, season totals and ESPN's PPR rank.

const FANTASY = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl";

function defaultSeason() {
  const now = new Date();
  return now.getUTCMonth() < 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
}

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...extraHeaders } });
}

const round2 = (n) => (n == null ? null : Math.round(n * 100) / 100);

export default async (req) => {
  const params = new URL(req.url).searchParams;
  const leagueId = params.get("leagueId") || process.env.LEAGUE_ID;
  const season = params.get("season") || process.env.SEASON || String(defaultSeason());
  const sp = Number(params.get("scoringPeriodId") || 1);
  if (!leagueId || !/^\d{1,12}$/.test(leagueId) || !/^\d{4}$/.test(season) || !(sp >= 1 && sp <= 18)) {
    return json(400, { error: "bad_request", message: "Invalid league, season or week." });
  }

  // QB, RB, WR, TE, D/ST and K only.
  const filter = {
    players: {
      filterStatus: { value: ["FREEAGENT", "WAIVERS"] },
      filterSlotIds: { value: [0, 2, 4, 6, 16, 17] },
      limit: 200,
      sortPercOwned: { sortPriority: 1, sortAsc: false },
      filterRanksForScoringPeriodIds: { value: [sp] },
      filterRanksForRankTypes: { value: ["PPR"] },
      filterStatsForSourceIds: { value: [0, 1] },
      filterStatsForSplitTypeIds: { value: [0, 1] },
      filterStatsForScoringPeriodIds: { value: [0, sp] },
    },
  };
  const headers = { accept: "application/json", "user-agent": "Mozilla/5.0 (fantasy-dashboard)", "x-fantasy-filter": JSON.stringify(filter) };
  if (process.env.ESPN_S2 && process.env.SWID) headers.cookie = `espn_s2=${process.env.ESPN_S2}; SWID=${process.env.SWID}`;

  let data;
  try {
    const res = await fetch(`${FANTASY}/seasons/${season}/segments/0/leagues/${leagueId}?view=kona_player_info&scoringPeriodId=${sp}`, { headers });
    if (!res.ok) throw new Error(`ESPN returned ${res.status}`);
    data = await res.json();
  } catch {
    return json(502, { error: "upstream", message: "Couldn't load free agents from ESPN." });
  }

  const players = (data.players || []).map((e) => {
    const pl = e.player || {};
    const stats = (pl.stats || []).filter((s) => String(s.seasonId) === season);
    const stat = (src, period, split) => stats.find((s) => s.statSourceId === src && s.scoringPeriodId === period && s.statSplitTypeId === split)?.appliedTotal;
    return {
      id: pl.id,
      name: pl.fullName,
      posId: pl.defaultPositionId,
      proId: pl.proTeamId,
      status: e.status === "WAIVERS" ? "W" : "FA",
      waiverDate: e.waiverProcessDate || null,
      injury: pl.injuryStatus && pl.injuryStatus !== "ACTIVE" ? pl.injuryStatus : "",
      own: round2(pl.ownership?.percentOwned),
      ownChg: round2(pl.ownership?.percentChange),
      proj: round2(stat(1, sp, 1)),
      pts: round2(stat(0, sp, 1)),
      seasonPts: round2(stat(0, 0, 0)),
      seasonProj: round2(stat(1, 0, 0)),
      pprRank: (pl.rankings?.[sp] || []).find((r) => r.rankType === "PPR" && r.rankSourceId === 0)?.averageRank ?? null,
      posRank: e.ratings?.["0"]?.positionalRanking || null,
    };
  });

  return json(200, { sp, updated: Date.now(), players }, {
    "cache-control": "public, max-age=120",
    "netlify-cdn-cache-control": "public, max-age=300, stale-while-revalidate=600",
  });
};

export const config = { path: "/api/freeagents" };
