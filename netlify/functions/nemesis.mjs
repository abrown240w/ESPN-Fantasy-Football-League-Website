// Player nemeses (History tab): for every manager, the NFL players who started against them and how
// those games went, across every season ESPN shares for the league (playoffs included).
//
// Each finished week's lineups are read from ESPN once and saved in Netlify Blobs as a small summary
// (past weeks never change), so later visits only read the summaries. A first visit has a lot of weeks
// to read, so each call reads a batch and says `more: true`; the page asks again until it's done.

import { getStore } from "@netlify/blobs";

const FANTASY = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl";
const BATCH = 12, PARALLEL = 4;
const BENCH = new Set([20, 21]); // bench, IR

function defaultSeason() {
  const now = new Date();
  return now.getUTCMonth() < 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
}
function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...extraHeaders } });
}
async function getJson(url) {
  const headers = { accept: "application/json", "user-agent": "Mozilla/5.0 (fantasy-dashboard)" };
  if (process.env.ESPN_S2 && process.env.SWID) headers.cookie = `espn_s2=${process.env.ESPN_S2}; SWID=${process.env.SWID}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw Object.assign(new Error(`ESPN returned ${res.status}`), { status: res.status });
  return res.json();
}
const leagueUrl = (leagueId, season, views, sp) =>
  `${FANTASY}/seasons/${season}/segments/0/leagues/${leagueId}?${views.map((v) => `view=${v}`).join("&")}${sp ? `&scoringPeriodId=${sp}` : ""}`;

// A season's teams (who managed each) and its scoring periods.
async function seasonMeta(store, leagueId, season, current) {
  const key = `${leagueId}:${season}:meta`;
  if (!current) { const saved = await store.get(key, { type: "json" }).catch(() => null); if (saved) return saved; }
  const d = await getJson(leagueUrl(leagueId, season, ["mTeam", "mSettings", "mStatus"]));
  const names = Object.fromEntries((d.members || []).map((m) => [m.id, `${m.firstName || ""} ${m.lastName || ""}`.trim() || m.displayName || "Manager"]));
  const teams = Object.fromEntries((d.teams || []).map((t) => [t.id, { owner: t.primaryOwner || (t.owners || [])[0] || `team${t.id}`, name: t.name || `${t.location || ""} ${t.nickname || ""}`.trim() }]));
  const mp = d.settings?.scheduleSettings?.matchupPeriods || {};
  const spToMp = {};
  for (const [m, sps] of Object.entries(mp)) for (const sp of sps) spToMp[sp] = Number(m);
  const meta = { season, teams, names, spToMp, final: d.status?.finalScoringPeriod || 17, latest: d.status?.latestScoringPeriod || 0 };
  if (!current) await store.setJSON(key, meta);
  return meta;
}

// One week, boiled down: each finished game's starters with their points, and the result.
async function readWeek(leagueId, season, sp, meta) {
  const d = await getJson(leagueUrl(leagueId, season, ["mBoxscore", "mMatchupScore"], sp));
  const mp = meta.spToMp[sp] ?? sp;
  const players = {}, games = [];
  for (const m of d.schedule || []) {
    if (m.matchupPeriodId !== mp || !m.away || !m.home) continue;
    if (!m.winner || m.winner === "UNDECIDED") return null; // not finished: try again later
    const side = (s) => {
      const out = [];
      for (const e of s.rosterForCurrentScoringPeriod?.entries || []) {
        if (BENCH.has(e.lineupSlotId)) continue;
        const p = e.playerPoolEntry?.player;
        if (!p) continue;
        players[p.id] = [p.fullName, p.defaultPositionId, p.proTeamId];
        out.push([p.id, Math.round((e.playerPoolEntry.appliedStatTotal || 0) * 100) / 100]);
      }
      return { t: s.teamId, s: out };
    };
    games.push({ id: m.id, w: m.winner, h: side(m.home), a: side(m.away) });
  }
  return { games, players };
}

export default async (req) => {
  const params = new URL(req.url).searchParams;
  const leagueId = params.get("leagueId") || process.env.LEAGUE_ID;
  const season = Number(params.get("season") || process.env.SEASON || defaultSeason());
  if (!/^\d{1,12}$/.test(String(leagueId || "")) || !/^\d{4}$/.test(String(season))) return json(400, { error: "bad_request", message: "Invalid league or season." });
  const store = getStore({ name: "nemesis", consistency: "strong" });

  let cur;
  try { cur = await seasonMeta(store, leagueId, season, true); } catch (e) {
    return json(e.status === 401 || e.status === 403 ? 401 : 502, { error: "upstream", message: "Couldn't load the league from ESPN." });
  }
  let prev = [];
  try { prev = (await getJson(leagueUrl(leagueId, season, ["mStatus"]))).status?.previousSeasons || []; } catch { /* just this season */ }

  // Every week that should exist, and which are saved already.
  const metas = { [season]: cur }, failed = [];
  await Promise.all(prev.map(async (y) => { try { metas[y] = await seasonMeta(store, leagueId, y, false); } catch { failed.push(y); } }));
  const want = [];
  for (const [y, m] of Object.entries(metas)) {
    const last = Number(y) === season ? Math.min(m.latest - 1, m.final) : m.final;
    for (let sp = 1; sp <= last; sp++) want.push([Number(y), sp]);
  }
  const keyOf = ([y, sp]) => `${leagueId}:${y}:wk${sp}`;
  const weeks = {};
  await Promise.all(want.map(async (w) => { const v = await store.get(keyOf(w), { type: "json" }).catch(() => null); if (v) weeks[keyOf(w)] = v; }));
  const missing = want.filter((w) => !weeks[keyOf(w)]);
  const todo = missing.slice(0, BATCH);
  for (let i = 0; i < todo.length; i += PARALLEL) {
    await Promise.all(todo.slice(i, i + PARALLEL).map(async (w) => {
      try {
        const v = await readWeek(leagueId, w[0], w[1], metas[w[0]]);
        if (!v) return;
        weeks[keyOf(w)] = v;
        await store.setJSON(keyOf(w), v);
      } catch { /* left for the next call */ }
    }));
  }

  // Tally from each manager's side: the other team's starters, and whether the manager won that game.
  // A two-week playoff game counts once, with both weeks' points.
  const rec = {}, players = {}, owners = {}, seen = new Map();
  // Managers by their ESPN id (the same person across seasons), named as of their latest season.
  for (const y of Object.keys(metas).map(Number).sort((a, b) => a - b)) {
    for (const t of Object.values(metas[y].teams)) owners[t.owner] = { name: metas[y].names[t.owner] || t.name, team: t.name };
  }
  for (const [key, v] of Object.entries(weeks)) {
    const y = Number(key.split(":")[1]), meta = metas[y];
    Object.assign(players, v.players);
    for (const g of v.games) {
      for (const [me, them, won] of [[g.h, g.a, g.w === "HOME"], [g.a, g.h, g.w === "AWAY"]]) {
        const owner = meta.teams[me.t]?.owner;
        if (!owner) continue;
        const r = (rec[owner] ||= {});
        for (const [pid, pts] of them.s) {
          const k = `${owner}|${y}|${g.id}|${pid}`;
          if (seen.has(k)) { seen.get(k)[4] += pts; continue; }
          const row = (r[pid] ||= [0, 0, 0, 0, 0]); // games, manager's wins, losses, ties, points he scored
          row[0]++;
          if (g.w === "TIE") row[3]++; else if (won) row[1]++; else row[2]++;
          row[4] += pts;
          seen.set(k, row);
        }
      }
    }
  }
  for (const r of Object.values(rec)) for (const row of Object.values(r)) row[4] = Math.round(row[4] * 10) / 10;
  const years = Object.keys(metas).map(Number).sort((a, b) => a - b);
  return json(200, {
    years, failed: failed.sort((a, b) => b - a), weeks: Object.keys(weeks).length, total: want.length, more: missing.length > todo.length,
    owners, players, rec,
  }, missing.length > todo.length ? { "cache-control": "no-store" } : { "cache-control": "public, max-age=300", "netlify-cdn-cache-control": "public, max-age=3600, stale-while-revalidate=86400" });
};

export const config = { path: "/api/nemesis" };
