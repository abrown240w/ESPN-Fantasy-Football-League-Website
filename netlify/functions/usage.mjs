// Weekly snap counts and targets for offensive skill players, from nflverse
// (https://github.com/nflverse/nflverse-data, CC BY 4.0: pages that show this data credit nflverse).
// nflverse publishes season files on GitHub, usually refreshed the day after games. This joins
// the snap counts (Pro Football Reference IDs) and weekly stats (NFL GSIS IDs) to ESPN player IDs
// using nflverse's player list. Netlify's shared CDN cache keeps the result for a few hours, so
// GitHub is only called a few times a day however many people visit.

const RELEASES = "https://github.com/nflverse/nflverse-data/releases/download";
const SKILL = new Set(["QB", "RB", "FB", "WR", "TE"]);
const TEAM_FIX = { LA: "LAR", WAS: "WSH" }; // nflverse → ESPN abbreviations

function defaultSeason() {
  const now = new Date();
  return now.getUTCMonth() < 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
}

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...extraHeaders } });
}

// Minimal CSV reader (quoted fields may contain commas; no embedded newlines in these files).
function splitLine(line) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
function* rows(text, cols) {
  const lines = text.split(/\r?\n/);
  const head = splitLine(lines[0]);
  const idx = cols.map((c) => head.indexOf(c));
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const f = lines[i].indexOf('"') < 0 ? lines[i].split(",") : splitLine(lines[i]);
    yield idx.map((j) => (j < 0 ? "" : f[j] ?? ""));
  }
}

async function getText(url, allow404 = false) {
  const res = await fetch(url, { headers: { "user-agent": "brownleague.netlify.app (private fantasy league site)" } });
  if (allow404 && res.status === 404) return null;
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.text();
}

export default async (req) => {
  const season = new URL(req.url).searchParams.get("season") || String(defaultSeason());
  if (!/^\d{4}$/.test(season)) return json(400, { error: "bad_request", message: "Invalid season." });

  let snapsCsv, statsCsv, playersCsv;
  try {
    [snapsCsv, statsCsv, playersCsv] = await Promise.all([
      getText(`${RELEASES}/snap_counts/snap_counts_${season}.csv`, true),
      getText(`${RELEASES}/stats_player/stats_player_week_${season}.csv`, true),
      getText(`${RELEASES}/players/players.csv`),
    ]);
  } catch {
    return json(502, { error: "upstream", message: "Couldn't load snap counts from nflverse." }, { "cache-control": "no-store" });
  }

  const fixTeam = (t) => TEAM_FIX[t] || t;
  const teams = {};   // team -> week -> [offensiveSnaps, targets, rushingAttempts]
  const byKey = {};   // "pfr:ID" / "gsis:ID" -> player record
  const teamWeek = (t, wk) => ((teams[t] ||= {})[wk] ||= [0, 0, 0]);

  // Snap counts (regular season, offense).
  const snapRows = [];
  if (snapsCsv) {
    for (const [type, wk, name, pfr, pos, team, snaps, pct] of rows(snapsCsv, ["game_type", "week", "player", "pfr_player_id", "position", "team", "offense_snaps", "offense_pct"])) {
      if (type !== "REG") continue;
      const t = fixTeam(team), s = Number(snaps) || 0, p = Number(pct) || 0;
      // Team snaps = player snaps / player share; use the player with the biggest share for accuracy.
      const tw = teamWeek(t, wk);
      if (p >= 0.5 && s) tw[0] = Math.max(tw[0], Math.round(s / p));
      if (SKILL.has(pos) && s > 0) snapRows.push({ wk, name, pfr, pos, t, s, p });
    }
  }
  // Targets and carries (every player counts toward the team's totals; skill players are kept).
  const tgtRows = [];
  if (statsCsv) {
    for (const [type, wk, gsis, name, pos, team, targets, carries] of rows(statsCsv, ["season_type", "week", "player_id", "player_display_name", "position", "team", "targets", "carries"])) {
      if (type !== "REG") continue;
      const t = fixTeam(team), n = Number(targets) || 0, c = Number(carries) || 0;
      const tw = teamWeek(t, wk);
      tw[1] += n;
      tw[2] += c;
      if (SKILL.has(pos)) tgtRows.push({ wk, name, gsis, pos, t, n, c });
    }
  }

  // nflverse player list: link PFR and GSIS IDs to each other and to ESPN.
  const needPfr = new Set(snapRows.map((r) => r.pfr)), needGsis = new Set(tgtRows.map((r) => r.gsis));
  const pfrTo = new Map(), gsisTo = new Map();
  for (const [gsis, pfr, espn, name] of rows(playersCsv, ["gsis_id", "pfr_id", "espn_id", "display_name"])) {
    if (!needPfr.has(pfr) && !needGsis.has(gsis)) continue;
    const rec = { gsis, pfr, espn: espn && /^\d+$/.test(espn) ? Number(espn) : null, name };
    if (pfr) pfrTo.set(pfr, rec);
    if (gsis) gsisTo.set(gsis, rec);
  }
  const playerFor = (key, name, pos, link) => {
    const k = link?.espn ? `e${link.espn}` : key;
    return (byKey[k] ||= { id: link?.espn || k, name: link?.name || name, pos: pos === "FB" ? "RB" : pos, w: {} });
  };
  for (const r of snapRows) {
    const pl = playerFor(`p${r.pfr}`, r.name, r.pos, pfrTo.get(r.pfr));
    const w = (pl.w[r.wk] ||= [0, 0, 0, r.t, 0]);
    w[0] = r.s; w[1] = Math.round(r.p * 100); w[3] = r.t;
  }
  for (const r of tgtRows) {
    const link = gsisTo.get(r.gsis);
    const pl = playerFor(link?.pfr ? `p${link.pfr}` : `g${r.gsis}`, r.name, r.pos, link);
    const w = (pl.w[r.wk] ||= [0, 0, 0, r.t, 0]);
    w[2] = r.n; w[4] = r.c;
  }

  // players: [id (ESPN ID, or a text key when there's no ESPN match), name, position, { week: [snaps, snap%, targets, team, carries] }]
  const players = Object.values(byKey).map((p) => [p.id, p.name, p.pos, p.w]);
  const weeks = [...new Set(Object.values(teams).flatMap((t) => Object.keys(t)))].map(Number).sort((a, b) => a - b);
  return json(200, { season: Number(season), updated: Date.now(), weeks, teams, players }, {
    "cache-control": "public, max-age=1800",
    "netlify-cdn-cache-control": "public, durable, max-age=14400, stale-while-revalidate=86400",
  });
};

export const config = { path: "/api/usage" };
