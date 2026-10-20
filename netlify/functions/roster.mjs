// Owner-only lineup changes, sent to ESPN with the ESPN sign-in saved in Netlify (ESPN_S2 / SWID).
//
// Locked down so only the site owner can use it:
//   • You unlock a device with a passphrase stored only in Netlify (ROSTER_PASSPHRASE, 12+ characters).
//     That sets an HttpOnly, SameSite=Strict cookie, signed with a key derived from the passphrase and
//     SWID, good for 90 days. Changing the passphrase signs every device out.
//   • Wrong passphrases are slowed down and locked out after 5 tries for 15 minutes.
//   • Changes must come from this site (Origin check), only for teams the saved ESPN account owns,
//     only for the current week, and only for players on that team, into slots they're eligible for.
//   • Every change attempt is written to the function log (Netlify > Logs > Functions > roster).
//
// Routes: POST /api/roster/login {passphrase} · POST /api/roster/logout ·
//         GET /api/roster/session?leagueId=&season= · POST /api/roster/lineup {leagueId, season, teamId, items}

import { createHmac, createHash, timingSafeEqual } from "node:crypto";

const READS = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl";
const WRITES = "https://lm-api-writes.fantasy.espn.com/apis/v3/games/ffl";
const COOKIE = "ffb_owner";
const MAX_AGE = 90 * 24 * 3600;
const fails = new Map(); // ip -> { n, until } (per function instance; slows guessing, not a hard guarantee)

function defaultSeason() {
  const now = new Date();
  return now.getUTCMonth() < 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
}
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const swidRaw = () => (process.env.SWID || "").replace(/[{}]/g, "").toUpperCase();
const secret = () => createHash("sha256").update(`ffb-owner:${process.env.ROSTER_PASSPHRASE}:${swidRaw()}`).digest();
const sign = (exp) => createHmac("sha256", secret()).update(`owner|${exp}`).digest("base64url");
const same = (a, b) => {
  const x = createHash("sha256").update(String(a)).digest(), y = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(x, y);
};
function signedIn(req) {
  if (!process.env.ROSTER_PASSPHRASE) return false;
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(req.headers.get("cookie") || "");
  if (!m) return false;
  const [exp, sig] = m[1].split(".");
  return Number(exp) > Date.now() / 1000 && !!sig && same(sig, sign(exp));
}
const cookie = (value, maxAge) => `${COOKIE}=${value}; Path=/api/roster; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
// Requests that change something must come from a page on this site.
function sameOrigin(req) {
  const origin = req.headers.get("origin");
  return !!origin && new URL(origin).host === new URL(req.url).host;
}
async function espnRead(leagueId, season, views) {
  const u = new URL(`${READS}/seasons/${season}/segments/0/leagues/${leagueId}`);
  for (const v of views) u.searchParams.append("view", v);
  const res = await fetch(u, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (fantasy-dashboard)", cookie: `espn_s2=${process.env.ESPN_S2}; SWID=${process.env.SWID}` } });
  if (!res.ok) throw new Error(`ESPN returned ${res.status}`);
  return res.json();
}
const ownedTeams = (data) => (data.teams || []).filter((t) => (t.owners || []).some((o) => String(o).toUpperCase().replace(/[{}]/g, "") === swidRaw())).map((t) => t.id);
const validLeague = (leagueId, season) => /^\d{1,12}$/.test(String(leagueId)) && /^\d{4}$/.test(String(season));

export default async (req, context) => {
  const action = context.params?.action;
  if (!process.env.ROSTER_PASSPHRASE || process.env.ROSTER_PASSPHRASE.length < 12 || !process.env.ESPN_S2 || !process.env.SWID) {
    return json(503, { error: "not_configured", message: "Lineup editing isn't set up. Add ROSTER_PASSPHRASE (12+ characters) in Netlify, alongside ESPN_S2 and SWID." });
  }
  const ip = context.ip || req.headers.get("x-nf-client-connection-ip") || "?";

  if (action === "login" && req.method === "POST") {
    if (!sameOrigin(req)) return json(403, { error: "origin", message: "Sign in from the site itself." });
    const f = fails.get(ip);
    if (f?.until > Date.now()) return json(429, { error: "locked", message: "Too many wrong tries. Wait 15 minutes." });
    const body = await req.json().catch(() => ({}));
    if (typeof body.passphrase === "string" && same(body.passphrase, process.env.ROSTER_PASSPHRASE)) {
      fails.delete(ip);
      const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
      console.log(JSON.stringify({ event: "owner_login", ip, at: new Date().toISOString() }));
      return json(200, { signedIn: true }, { "set-cookie": cookie(`${exp}.${sign(exp)}`, MAX_AGE) });
    }
    const n = (f?.n || 0) + 1;
    fails.set(ip, { n, until: n >= 5 ? Date.now() + 15 * 60e3 : 0 });
    console.log(JSON.stringify({ event: "owner_login_failed", ip, tries: n, at: new Date().toISOString() }));
    await sleep(1500);
    return json(401, { error: "wrong", message: "That passphrase isn't right." });
  }

  if (action === "logout" && req.method === "POST") {
    return json(200, { signedIn: false }, { "set-cookie": cookie("", 0) });
  }

  if (action === "session" && req.method === "GET") {
    if (!signedIn(req)) return json(200, { signedIn: false });
    const p = new URL(req.url).searchParams;
    const leagueId = p.get("leagueId"), season = p.get("season") || String(defaultSeason());
    if (!validLeague(leagueId, season)) return json(200, { signedIn: true, teams: [] });
    try {
      return json(200, { signedIn: true, teams: ownedTeams(await espnRead(leagueId, season, ["mTeam"])) });
    } catch {
      return json(200, { signedIn: true, teams: [] });
    }
  }

  if (action === "lineup" && req.method === "POST") {
    if (!signedIn(req)) return json(401, { error: "signed_out", message: "Sign in as the owner first." });
    if (!sameOrigin(req)) return json(403, { error: "origin", message: "Changes have to come from the site itself." });
    const b = await req.json().catch(() => ({}));
    const season = String(b.season || defaultSeason()), leagueId = String(b.leagueId || ""), teamId = Number(b.teamId);
    const items = Array.isArray(b.items) ? b.items : [];
    if (!validLeague(leagueId, season) || !Number.isInteger(teamId) || !items.length || items.length > 6
      || !items.every((i) => [i.playerId, i.from, i.to].every(Number.isInteger))) {
      return json(400, { error: "bad_request", message: "That lineup change doesn't look right." });
    }
    let data;
    try { data = await espnRead(leagueId, season, ["mTeam", "mRoster", "mSettings", "mStatus"]); } catch (e) {
      return json(502, { error: "upstream", message: "Couldn't load your roster from ESPN to check the change." });
    }
    if (!ownedTeams(data).includes(teamId)) return json(403, { error: "not_yours", message: "That isn't your team." });
    const sp = data.scoringPeriodId || data.status?.latestScoringPeriod;
    const slots = data.settings?.rosterSettings?.lineupSlotCounts || {};
    const roster = data.teams.find((t) => t.id === teamId)?.roster?.entries || [];
    for (const i of items) {
      const e = roster.find((x) => x.playerId === i.playerId);
      if (!e) return json(400, { error: "not_on_team", message: "A player in that change isn't on your roster." });
      if (e.lineupSlotId !== i.from) return json(409, { error: "stale", message: "Your lineup changed on ESPN since this page loaded. Refresh and try again." });
      const elig = e.playerPoolEntry?.player?.eligibleSlots || [];
      if (i.to !== 20 && (!elig.includes(i.to) || !(slots[i.to] > 0))) return json(400, { error: "ineligible", message: `${e.playerPoolEntry?.player?.fullName || "A player"} can't play that slot.` });
      if (e.playerPoolEntry?.lineupLocked) return json(409, { error: "locked", message: `${e.playerPoolEntry?.player?.fullName || "A player"} is locked (his game has started).` });
    }
    const payload = {
      isLeagueManager: false, teamId, type: "ROSTER", memberId: `{${swidRaw()}}`, scoringPeriodId: sp, executionType: "EXECUTE",
      items: items.map((i) => ({ playerId: i.playerId, type: "LINEUP", fromLineupSlotId: i.from, toLineupSlotId: i.to })),
    };
    const log = { event: "lineup", ip, leagueId, season, teamId, sp, items, at: new Date().toISOString() };
    let res, out;
    try {
      res = await fetch(`${WRITES}/seasons/${season}/segments/0/leagues/${leagueId}/transactions/`, {
        method: "POST",
        headers: {
          "content-type": "application/json", accept: "application/json", "user-agent": "Mozilla/5.0 (fantasy-dashboard)",
          origin: "https://fantasy.espn.com", referer: "https://fantasy.espn.com/",
          cookie: `espn_s2=${process.env.ESPN_S2}; SWID=${process.env.SWID}`,
        },
        body: JSON.stringify(payload),
      });
      out = await res.json().catch(() => null);
    } catch {
      console.log(JSON.stringify({ ...log, result: "unreachable" }));
      return json(502, { error: "upstream", message: "Couldn't reach ESPN." });
    }
    const espnMsg = out?.messages?.[0] || out?.details?.[0]?.message || out?.message || "";
    console.log(JSON.stringify({ ...log, result: res.status, status: out?.status, espnMsg }));
    if (!res.ok) return json(502, { error: "espn_refused", message: `ESPN didn't accept the change${espnMsg ? `: ${espnMsg}` : ` (${res.status})`}.` });
    return json(200, { ok: true, status: out?.status || "EXECUTED" });
  }

  return json(404, { error: "not_found" });
};

export const config = { path: "/api/roster/:action" };
