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
//         POST /api/roster/transaction {leagueId, season, teamId, add?, drop?, waiver?, bid?}  (pickups, claims, drops)
//         GET  /api/roster/pending?leagueId=&season=   (your pending claims and trade offers; owner only)
//         POST /api/roster/trade {leagueId, season, teamId, otherTeamId, send: [ids], receive: [ids], comment?}

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
// Send one transaction to ESPN as the saved account and log it.
async function espnWrite(leagueId, season, payload, log) {
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
    if (!validLeague(leagueId, season) || !Number.isInteger(teamId) || !items.length
      || items.length > 20 || !items.every((i) => [i.playerId, i.from, i.to].every(Number.isInteger))) {
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
    return espnWrite(leagueId, season, payload, { event: "lineup", ip, leagueId, season, teamId, sp, items, at: new Date().toISOString() });
  }

  // Free-agent pickup (with or without a drop), waiver claim, or a plain drop.
  if (action === "transaction" && req.method === "POST") {
    if (!signedIn(req)) return json(401, { error: "signed_out", message: "Sign in as the owner first." });
    if (!sameOrigin(req)) return json(403, { error: "origin", message: "Changes have to come from the site itself." });
    const b = await req.json().catch(() => ({}));
    const season = String(b.season || defaultSeason()), leagueId = String(b.leagueId || ""), teamId = Number(b.teamId);
    const add = b.add == null ? null : Number(b.add), drop = b.drop == null ? null : Number(b.drop), waiver = !!b.waiver;
    const bid = Math.max(0, Math.floor(Number(b.bid) || 0));
    if (!validLeague(leagueId, season) || !Number.isInteger(teamId) || (add == null && drop == null)
      || (add != null && !Number.isInteger(add)) || (drop != null && !Number.isInteger(drop)) || (waiver && add == null)) {
      return json(400, { error: "bad_request", message: "That roster move doesn't look right." });
    }
    let data;
    try { data = await espnRead(leagueId, season, ["mTeam", "mRoster", "mStatus"]); } catch {
      return json(502, { error: "upstream", message: "Couldn't load your roster from ESPN to check the move." });
    }
    if (!ownedTeams(data).includes(teamId)) return json(403, { error: "not_yours", message: "That isn't your team." });
    const sp = data.scoringPeriodId || data.status?.latestScoringPeriod;
    const mine = data.teams.find((t) => t.id === teamId)?.roster?.entries || [];
    if (drop != null && !mine.some((e) => e.playerId === drop)) return json(400, { error: "not_on_team", message: "The player you're dropping isn't on your roster." });
    if (add != null && data.teams.some((t) => (t.roster?.entries || []).some((e) => e.playerId === add))) return json(409, { error: "taken", message: "That player is already on a roster in this league." });
    const items = [
      ...(add != null ? [{ playerId: add, type: "ADD", toTeamId: teamId }] : []),
      ...(drop != null ? [{ playerId: drop, type: "DROP", fromTeamId: teamId }] : []),
    ];
    const payload = {
      isLeagueManager: false, teamId, type: waiver ? "WAIVER" : "FREEAGENT", memberId: `{${swidRaw()}}`, scoringPeriodId: sp,
      executionType: "EXECUTE", items, ...(waiver ? { bidAmount: bid } : {}),
    };
    return espnWrite(leagueId, season, payload, { event: waiver ? "claim" : "transaction", ip, leagueId, season, teamId, sp, add, drop, bid: waiver ? bid : undefined, at: new Date().toISOString() });
  }

  // Your pending waiver claims and trade offers (sent or received). Owner only: claims are private.
  if (action === "pending" && req.method === "GET") {
    if (!signedIn(req)) return json(401, { error: "signed_out", message: "Sign in as the owner first." });
    const p = new URL(req.url).searchParams;
    const leagueId = p.get("leagueId"), season = p.get("season") || String(defaultSeason());
    if (!validLeague(leagueId, season)) return json(400, { error: "bad_request" });
    let data;
    try { data = await espnRead(leagueId, season, ["mTeam", "mPendingTransactions", "mStatus"]); } catch {
      return json(502, { error: "upstream", message: "Couldn't load pending moves from ESPN." });
    }
    const mine = ownedTeams(data);
    const all = [...(data.pendingTransactions || []), ...(data.transactions || [])];
    const seen = new Set();
    const list = all.filter((t) => t && !seen.has(t.id) && seen.add(t.id))
      .filter((t) => !["EXECUTED", "CANCELED", "FAILED_INVALIDPLAYERSOURCE", "FAILED_ROSTERLIMIT"].includes(t.status))
      .filter((t) => mine.includes(t.teamId) || (t.items || []).some((i) => mine.includes(i.fromTeamId) || mine.includes(i.toTeamId)));
    // Player names for the items.
    const ids = [...new Set(list.flatMap((t) => (t.items || []).map((i) => i.playerId)))];
    const names = {};
    if (ids.length) {
      try {
        const r = await fetch(`${READS}/seasons/${season}/players?scoringPeriodId=0&view=players_wl`, {
          headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (fantasy-dashboard)", "x-fantasy-filter": JSON.stringify({ filterIds: { value: ids } }) },
        });
        for (const pl of (await r.json()) || []) names[pl.id] = [pl.fullName, pl.defaultPositionId, pl.proTeamId];
      } catch { /* names fall back to the site's own lists */ }
    }
    return json(200, {
      teams: mine,
      pending: list.map((t) => ({
        id: t.id, type: t.type, status: t.status, teamId: t.teamId, bid: t.bidAmount ?? null,
        proposed: t.proposedDate || null, process: t.processDate || null, expires: t.expirationDate || null,
        items: (t.items || []).map((i) => ({ playerId: i.playerId, type: i.type, from: i.fromTeamId ?? null, to: i.toTeamId ?? null, info: names[i.playerId] || null })),
      })),
    });
  }

  // Propose a trade: players you send and players you'd get from one other team.
  if (action === "trade" && req.method === "POST") {
    if (!signedIn(req)) return json(401, { error: "signed_out", message: "Sign in as the owner first." });
    if (!sameOrigin(req)) return json(403, { error: "origin", message: "Changes have to come from the site itself." });
    const b = await req.json().catch(() => ({}));
    const season = String(b.season || defaultSeason()), leagueId = String(b.leagueId || "");
    const teamId = Number(b.teamId), other = Number(b.otherTeamId);
    const send = Array.isArray(b.send) ? b.send.map(Number) : [], receive = Array.isArray(b.receive) ? b.receive.map(Number) : [];
    const comment = typeof b.comment === "string" ? b.comment.slice(0, 500) : "";
    if (!validLeague(leagueId, season) || !Number.isInteger(teamId) || !Number.isInteger(other) || teamId === other
      || !send.length || !receive.length || send.length > 6 || receive.length > 6 || ![...send, ...receive].every(Number.isInteger)) {
      return json(400, { error: "bad_request", message: "That trade doesn't look right." });
    }
    let data;
    try { data = await espnRead(leagueId, season, ["mTeam", "mRoster", "mStatus"]); } catch {
      return json(502, { error: "upstream", message: "Couldn't load rosters from ESPN to check the trade." });
    }
    if (!ownedTeams(data).includes(teamId)) return json(403, { error: "not_yours", message: "That isn't your team." });
    const rosterOf = (id) => new Set((data.teams.find((t) => t.id === id)?.roster?.entries || []).map((e) => e.playerId));
    const mineSet = rosterOf(teamId), theirs = rosterOf(other);
    if (!send.every((id) => mineSet.has(id))) return json(409, { error: "stale", message: "A player you're sending isn't on your roster anymore. Refresh and try again." });
    if (!receive.every((id) => theirs.has(id))) return json(409, { error: "stale", message: "A player you asked for isn't on their roster anymore. Refresh and try again." });
    const sp = data.scoringPeriodId || data.status?.latestScoringPeriod;
    const payload = {
      isLeagueManager: false, teamId, type: "TRADE_PROPOSAL", comment, memberId: `{${swidRaw()}}`, scoringPeriodId: sp,
      executionType: "EXECUTE", expirationDate: Date.now() + 2 * 24 * 3600e3,
      items: [
        ...send.map((playerId) => ({ playerId, type: "TRADE", fromTeamId: teamId, toTeamId: other })),
        ...receive.map((playerId) => ({ playerId, type: "TRADE", fromTeamId: other, toTeamId: teamId })),
      ],
    };
    return espnWrite(leagueId, season, payload, { event: "trade_proposal", ip, leagueId, season, teamId, other, send, receive, at: new Date().toISOString() });
  }

  return json(404, { error: "not_found" });
};

export const config = { path: "/api/roster/:action" };
