// Weekly snap counts, targets and red-zone usage for offensive skill players, from nflverse
// (https://github.com/nflverse/nflverse-data, CC BY 4.0: pages that show this data credit nflverse).
// nflverse publishes season files on GitHub, usually refreshed the day after games. This joins
// the snap counts (Pro Football Reference IDs) and weekly stats (NFL GSIS IDs) to ESPN player IDs
// using nflverse's player list. Red-zone usage (plays snapped inside the opponent's 20, two-point tries
// left out) is counted from nflverse's play-by-play. Netlify's shared CDN cache keeps the result for a
// few hours, so GitHub is only called a few times a day however many people visit.

import { gunzipSync } from "node:zlib";

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

async function getText(url, allow404 = false, gz = false) {
  const res = await fetch(url, { headers: { "user-agent": "brownleague.netlify.app (private fantasy league site)" } });
  if (allow404 && res.status === 404) return null;
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return gz ? gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8") : res.text();
}

export default async (req) => {
  const season = new URL(req.url).searchParams.get("season") || String(defaultSeason());
  if (!/^\d{4}$/.test(season)) return json(400, { error: "bad_request", message: "Invalid season." });

  let snapsCsv, statsCsv, playersCsv, pbpCsv;
  try {
    [snapsCsv, statsCsv, playersCsv, pbpCsv] = await Promise.all([
      getText(`${RELEASES}/snap_counts/snap_counts_${season}.csv`, true),
      getText(`${RELEASES}/stats_player/stats_player_week_${season}.csv`, true),
      getText(`${RELEASES}/players/players.csv`),
      // Red zone is extra: if the play-by-play can't be read, everything else still loads.
      getText(`${RELEASES}/pbp/play_by_play_${season}.csv.gz`, true, true).catch(() => null),
    ]);
  } catch {
    return json(502, { error: "upstream", message: "Couldn't load snap counts from nflverse." }, { "cache-control": "no-store" });
  }

  const fixTeam = (t) => TEAM_FIX[t] || t;
  const teams = {};   // team -> week -> [offensiveSnaps, targets, rushingAttempts, redZoneTargets, redZoneCarries]
  const byKey = {};   // "pfr:ID" / "gsis:ID" -> player record
  const teamWeek = (t, wk) => ((teams[t] ||= {})[wk] ||= [0, 0, 0, 0, 0]);

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

  // Red zone, from the play-by-play: each player's targets, carries, touches inside the 10, TDs and (QBs)
  // pass attempts on plays snapped at the opponent's 20 or closer. Team totals give each player's share.
  const rz = new Map(); // gsis -> week -> [targets, carries, inside10, tds, passAttempts, team]
  if (pbpCsv) {
    const cols = ["season_type", "week", "posteam", "yardline_100", "play_type", "two_point_attempt", "pass_attempt", "receiver_player_id", "rusher_player_id", "passer_player_id", "td_player_id"];
    const bump = (id, wk, t, i) => { if (!id) return; const w = ((rz.get(id) || rz.set(id, {}).get(id))[wk] ||= [0, 0, 0, 0, 0, t]); w[i]++; return w; };
    for (const [type, wk, team, yl, kind, two, passAtt, rec, rush, passer, td] of rows(pbpCsv, cols)) {
      if (type !== "REG" || two === "1" || (kind !== "pass" && kind !== "run")) continue;
      const y = Number(yl);
      if (!(y > 0 && y <= 20)) continue;
      const t = fixTeam(team), tw = teamWeek(t, wk), in10 = y <= 10;
      if (kind === "pass" && passAtt === "1") bump(passer, wk, t, 4);
      if (rec) { tw[3]++; const w = bump(rec, wk, t, 0); if (in10) w[2]++; }
      if (rush) { tw[4]++; const w = bump(rush, wk, t, 1); if (in10) w[2]++; }
      if (td && (td === rec || td === rush)) bump(td, wk, t, 3);
    }
  }

  // nflverse player list: link PFR and GSIS IDs to each other and to ESPN.
  const needPfr = new Set(snapRows.map((r) => r.pfr)), needGsis = new Set([...tgtRows.map((r) => r.gsis), ...rz.keys()]);
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
    const z = rz.get(r.gsis)?.[r.wk];
    if (z) w[5] = z.slice(0, 5); // [rz targets, rz carries, inside-10 touches, rz TDs, rz pass attempts]
  }

  // players: [id (ESPN ID, or a text key when there's no ESPN match), name, position,
  //           { week: [snaps, snap%, targets, team, carries, rz?: [targets, carries, inside10, tds, passAttempts]] }]
  const players = Object.values(byKey).map((p) => [p.id, p.name, p.pos, p.w]);
  const weeks = [...new Set(Object.values(teams).flatMap((t) => Object.keys(t)))].map(Number).sort((a, b) => a - b);
  return json(200, { season: Number(season), updated: Date.now(), weeks, teams, players }, {
    "cache-control": "public, max-age=1800",
    "netlify-cdn-cache-control": "public, durable, max-age=14400, stale-while-revalidate=86400",
  });
};

export const config = { path: "/api/usage" };
