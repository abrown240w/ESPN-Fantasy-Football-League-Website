// Injury report: every QB/RB/WR/TE/K who isn't fully active (out, IR, questionable, doubtful,
// suspended), from ESPN's league-wide injury feed, plus each team's offensive depth chart so the
// site can show who's next up, and the fantasy week each player could be back (byes skipped).
// /api/injuries?team=22 instead returns one team's full offensive depth chart (player popup).
// Cached for an hour.

const INJURIES = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries";
const DEPTH = (team) => `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${team}/depthcharts`;
const ROSTER = (team) => `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${team}/roster`;
const ATHLETE = (id) => `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${id}`;
const TEAM_IDS = [...Array(30).keys()].map((i) => i + 1).concat([33, 34]);
const SCHEDULE = (season) => `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}?view=proTeamSchedules_wl`;
const POS = { QB: "QB", RB: "RB", FB: "RB", WR: "WR", TE: "TE", PK: "K", K: "K" };
const CACHE = {
  "cache-control": "public, max-age=900",
  "netlify-cdn-cache-control": "public, durable, max-age=3600, stale-while-revalidate=1800",
  "netlify-vary": "query=team",
};

function defaultSeason() {
  const now = new Date();
  return now.getUTCMonth() < 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
}
function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...extraHeaders } });
}
async function getJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (fantasy-dashboard)" } });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}
const idFrom = (a) => Number(a?.id) || Number(/\/id\/(\d+)/.exec((a?.links || []).map((l) => l.href).join(" "))?.[1]) || null;

// A team's offensive depth chart: { QB, RB, WR1, WR2, WR3, TE, K }, each [id, name, injury status or ""]
// in depth order. WR1–3 are the three receiver spots; each has its own backups.
async function teamDepth(tid) {
  const dc = await getJson(DEPTH(tid));
  const forms = dc.depthchart || [];
  const off = forms.find((f) => f.positions?.qb) || {}, st = forms.find((f) => f.positions?.pk) || {};
  const list = (slot) => (slot?.athletes || []).map((a) => [Number(a.id), a.displayName, a.injuries?.[0]?.status || ""]);
  const P = off.positions || {};
  return { QB: list(P.qb), RB: list(P.rb), WR1: list(P.wr1), WR2: list(P.wr2), WR3: list(P.wr3), TE: list(P.te), K: list(st.positions?.pk) };
}

export default async (req) => {
  const team = new URL(req.url).searchParams.get("team");
  if (team != null) {
    if (!/^\d{1,2}$/.test(team)) return json(400, { error: "bad_request", message: "Invalid team." });
    try { return json(200, { team: Number(team), depth: await teamDepth(team) }, CACHE); } catch {
      return json(502, { error: "upstream", message: "Couldn't load the depth chart from ESPN." }, { "cache-control": "no-store" });
    }
  }

  let feed, sched = null;
  try {
    [feed, sched] = await Promise.all([getJson(INJURIES), getJson(SCHEDULE(defaultSeason())).catch(() => null)]);
  } catch {
    return json(502, { error: "upstream", message: "Couldn't load the injury report from ESPN." }, { "cache-control": "no-store" });
  }

  // Each NFL team's games as [fantasy week, kickoff ms], and its bye week.
  const games = {}, byes = {};
  for (const t of sched?.settings?.proTeams || []) {
    if (!t.id) continue;
    byes[t.id] = t.byeWeek || null;
    games[t.id] = Object.entries(t.proGamesByScoringPeriod || {}).map(([sp, gs]) => [Number(sp), gs?.[0]?.date || 0]).sort((a, b) => a[0] - b[0]);
  }
  // First week the team plays on or after the return date (a bye week has no game, so it's skipped).
  const weekOf = (proId, date) => {
    if (!date || !games[proId]) return null;
    const from = Date.parse(`${date.slice(0, 10)}T00:00:00Z`) - 6 * 3600e3;
    return games[proId].find(([, at]) => at >= from)?.[0] ?? null;
  };
  // The team's next game (for questionable / doubtful players with no return date).
  const nextWeek = (proId) => games[proId]?.find(([, at]) => at >= Date.now() - 4 * 3600e3)?.[0] ?? null;

  const players = [];
  const add = (id, name, pos, proId, i) => {
    const d = i.details || {};
    players.push({
      id, name, pos, proId, status: i.status, date: i.date || null,
      type: d.type || "", detail: d.detail && d.detail !== "Not Specified" ? d.detail : "", side: d.side && d.side !== "Not Specified" ? d.side : "",
      returnDate: d.returnDate || null, returnWeek: weekOf(proId, d.returnDate), nextWeek: nextWeek(proId), note: i.shortComment || "",
    });
  };
  for (const t of feed.injuries || []) {
    for (const i of t.injuries || []) {
      const pos = POS[i.athlete?.position?.abbreviation];
      if (!pos || !i.status || i.status === "Active") continue;
      add(idFrom(i.athlete), i.athlete?.displayName || "", pos, Number(t.id), i);
    }
  }

  // The league-wide feed only carries recent news, so players hurt weeks ago (often on IR) drop off it.
  // Every team's roster still lists them; their injury details come from each player's own page.
  const have = new Set(players.map((p) => String(p.id)));
  const missing = [];
  await Promise.all(TEAM_IDS.map(async (tid) => {
    try {
      const r = await getJson(ROSTER(tid));
      for (const g of r.athletes || []) for (const a of g.items || []) {
        const pos = POS[a.position?.abbreviation], inj = a.injuries?.[0];
        if (!pos || !inj?.status || inj.status === "Active" || have.has(String(a.id))) continue;
        have.add(String(a.id));
        missing.push({ a, pos, tid, inj });
      }
    } catch { /* roster unavailable; that team's feed entries still count */ }
  }));
  await Promise.all(missing.map(async ({ a, pos, tid, inj }) => {
    let i = inj;
    try { i = (await getJson(ATHLETE(a.id))).athlete?.injuries?.[0] || inj; } catch { /* status and date only */ }
    add(Number(a.id), a.displayName || "", pos, tid, { ...i, status: i.status || inj.status });
  }));

  // Depth charts for teams with someone on the report.
  const teams = [...new Set(players.map((p) => p.proId))];
  const depth = {};
  await Promise.all(teams.map(async (tid) => {
    try { depth[tid] = await teamDepth(tid); } catch { /* no depth chart for this team */ }
  }));

  // Each team's remaining game weeks (byes left out), for counting games until a player can return.
  const upcoming = Object.fromEntries(teams.map((tid) => [tid, (games[tid] || []).filter(([, at]) => at >= Date.now() - 4 * 3600e3).map(([sp]) => sp)]));
  return json(200, { updated: Date.now(), players, depth, byes, upcoming }, CACHE);
};

export const config = { path: "/api/injuries" };
