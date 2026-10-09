// Server-side proxy to ESPN's fantasy football API.
// Browsers can't call ESPN directly (CORS), so the site calls /api/espn and this
// function forwards the request. Configure LEAGUE_ID (and optionally SEASON,
// ESPN_S2 + SWID for private leagues) in Netlify > Site configuration > Environment variables.

const ESPN_BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl";
const ALLOWED_VIEWS = new Set([
  "mTeam", "mSettings", "mStatus", "mMatchup", "mMatchupScore",
  "mBoxscore", "mRoster", "mStandings", "mScoreboard",
]);

function defaultSeason() {
  const now = new Date();
  // Jan/Feb still belong to the previous NFL season.
  return now.getUTCMonth() < 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
}

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  });
}

export default async (req) => {
  const params = new URL(req.url).searchParams;
  const leagueId = params.get("leagueId") || process.env.LEAGUE_ID;
  const season = params.get("season") || process.env.SEASON || String(defaultSeason());
  const scoringPeriodId = params.get("scoringPeriodId");
  const views = params.getAll("view").filter((v) => ALLOWED_VIEWS.has(v));

  if (!leagueId) {
    return json(400, { error: "no_league", message: "No league ID configured. Set LEAGUE_ID in Netlify or enter one on the site." });
  }
  if (!/^\d{1,12}$/.test(leagueId) || !/^\d{4}$/.test(season) ||
      (scoringPeriodId && !/^\d{1,2}$/.test(scoringPeriodId))) {
    return json(400, { error: "bad_request", message: "Invalid league ID, season, or week." });
  }

  const target = new URL(`${ESPN_BASE}/seasons/${season}/segments/0/leagues/${leagueId}`);
  for (const v of views.length ? views : ["mTeam", "mSettings"]) target.searchParams.append("view", v);
  if (scoringPeriodId) target.searchParams.set("scoringPeriodId", scoringPeriodId);

  const headers = { accept: "application/json", "user-agent": "Mozilla/5.0 (fantasy-dashboard)" };
  if (process.env.ESPN_S2 && process.env.SWID) {
    headers.cookie = `espn_s2=${process.env.ESPN_S2}; SWID=${process.env.SWID}`;
  }

  let res;
  try {
    res = await fetch(target, { headers });
  } catch (err) {
    return json(502, { error: "upstream", message: "Could not reach ESPN." });
  }

  if (res.status === 401 || res.status === 403) {
    return json(401, { error: "private", message: "ESPN says this league is private. Make it public in League Settings, or add ESPN_S2 and SWID env vars." });
  }
  if (res.status === 404) {
    return json(404, { error: "not_found", message: `League ${leagueId} wasn't found for the ${season} season.` });
  }
  if (!res.ok) {
    return json(res.status, { error: "upstream", message: `ESPN returned ${res.status}.` });
  }

  const body = await res.text();
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json",
      // Short cache so live scores stay fresh but repeat visits are fast.
      "cache-control": "public, max-age=60",
      "netlify-cdn-cache-control": "public, max-age=60, stale-while-revalidate=120",
    },
  });
};

export const config = { path: "/api/espn" };
