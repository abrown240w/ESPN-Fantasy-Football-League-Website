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
//         GET  /api/roster/chat?leagueId=&season=            your league chats (owner only)
//         GET  /api/roster/chattopic?leagueId=&season=&topic=  one conversation's messages
//         POST /api/roster/chatsend {leagueId, season, topic, text}
//         POST /api/roster/chatnew  {leagueId, season, members: [memberIds], text}
//         POST /api/roster/chatread {leagueId, season, topic}   marks a conversation read
//         POST /api/roster/reorder {leagueId, season, teamId, order: [claim ids]}  your claim processing order
//         GET  /api/roster/waivers?leagueId=&season=&at=   one waiver run's claims in processing order
//                                    (failed claims only for the signed-in owner)
//         POST /api/roster/cancel {leagueId, season, teamId, txId, kind: claim | trade-out | trade-in}
//         POST /api/roster/pushowner {endpoint, leagueId}  (marks this device's alerts as the owner's, so
//                                    waiver reports can include missed claims)

import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { store as pushStore, subKey } from "../lib/push-common.mjs";

const READS = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl";
const WRITES = "https://lm-api-writes.fantasy.espn.com/apis/v3/games/ffl";
const COOKIE = "ffb_owner";
const MAX_AGE = 90 * 24 * 3600;
const fails = new Map();
let chatMedia = { at: 0, season: null, gifs: {}, stickers: {} };
async function loadChatMedia(season) {
  if (chatMedia.season === season && Date.now() - chatMedia.at < 6 * 3600e3) return chatMedia;
  try {
    const r = await fetch(`${READS}/seasons/${season}/?view=chat_settings&platform=chat`, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (fantasy-dashboard)", cookie: `espn_s2=${process.env.ESPN_S2}; SWID=${process.env.SWID}` } });
    const cs = (await r.json())?.settings?.communicationSettings || {};
    const map = (list) => Object.fromEntries((list || []).filter((x) => x.url).map((x) => [x.id, x.url]));
    chatMedia = { at: Date.now(), season, gifs: map(cs.gifSources), stickers: map(cs.stickerSources) };
  } catch { /* images just won't show */ }
  return chatMedia;
} // ip -> { n, until } (per function instance; slows guessing, not a hard guarantee)

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
function livePending(d) {
  const all = [...(d.pendingTransactions || []), ...(d.transactions || [])];
  const canceled = new Set(all.filter((t) => t.executionType === "CANCEL" || /^CANCEL/.test(t.status || "")).map((t) => String(t.relatedTransactionId)));
  const seen = new Set();
  return all.filter((t) => t && !seen.has(t.id) && seen.add(t.id))
    .filter((t) => !/^(EXECUTED|CANCEL|FAIL|VETO|DECLINE)/.test(t.status || "") && !canceled.has(String(t.id)) && t.executionType !== "CANCEL");
}
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
    const list = livePending(data)
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
        id: t.id, type: t.type, status: t.status, teamId: t.teamId, bid: t.bidAmount ?? null, subOrder: t.subOrder ?? null,
        proposed: t.proposedDate || null, process: t.processDate || null, expires: t.expirationDate || null,
        items: (t.items || []).map((i) => ({ playerId: i.playerId, type: i.type, from: i.fromTeamId ?? null, to: i.toTeamId ?? null, info: names[i.playerId] || null })),
      })),
    });
  }

  // Put your waiver claims in the order they should process (first = tried first). This is the request
  // ESPN's own site sends (reorderPendingTransactions in its code): POST teams/{teamId}/pendingTransactions
  // with [{ id, subOrder }], subOrder counting up from 1. In budget leagues higher bids still go first.
  if (action === "reorder" && req.method === "POST") {
    if (!signedIn(req)) return json(401, { error: "signed_out", message: "Sign in as the owner first." });
    if (!sameOrigin(req)) return json(403, { error: "origin", message: "Changes have to come from the site itself." });
    const b = await req.json().catch(() => ({}));
    const season = String(b.season || defaultSeason()), leagueId = String(b.leagueId || ""), teamId = Number(b.teamId);
    const order = Array.isArray(b.order) ? b.order.map(String) : [];
    if (!validLeague(leagueId, season) || !Number.isInteger(teamId) || order.length < 2 || order.length > 30
      || !order.every((id) => /^[\w-]{6,64}$/.test(id)) || new Set(order).size !== order.length) {
      return json(400, { error: "bad_request", message: "That claim order doesn't look right." });
    }
    let data;
    try { data = await espnRead(leagueId, season, ["mTeam", "mPendingTransactions", "mStatus"]); } catch {
      return json(502, { error: "upstream", message: "Couldn't load your claims from ESPN." });
    }
    if (!ownedTeams(data).includes(teamId)) return json(403, { error: "not_yours", message: "That isn't your team." });
    const claims = livePending(data).filter((t) => t.type === "WAIVER" && t.teamId === teamId);
    if (!order.every((id) => claims.some((c) => String(c.id) === id))) return json(409, { error: "stale", message: "Your claims changed on ESPN since this page loaded. Refresh and try again." });
    let res, out;
    try {
      res = await fetch(`${WRITES}/seasons/${season}/segments/0/leagues/${leagueId}/teams/${teamId}/pendingTransactions`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", "user-agent": "Mozilla/5.0 (fantasy-dashboard)", "x-fantasy-source": "kona", "x-fantasy-platform": "kona-PROD", origin: "https://fantasy.espn.com", referer: "https://fantasy.espn.com/", cookie: `espn_s2=${process.env.ESPN_S2}; SWID=${process.env.SWID}` },
        body: JSON.stringify(order.map((id, i) => ({ id, subOrder: i + 1 }))),
      });
      out = await res.json().catch(() => null);
    } catch { return json(502, { error: "upstream", message: "Couldn't reach ESPN." }); }
    const espnMsg = out?.messages?.[0] || out?.details?.[0]?.message || "";
    console.log(JSON.stringify({ event: "claim_order", ip, leagueId, teamId, n: order.length, result: res.status, espnMsg, at: new Date().toISOString() }));
    if (!res.ok) return json(502, { error: "espn_refused", message: `ESPN didn't accept the new order${espnMsg ? `: ${espnMsg}` : ` (${res.status})`}.` });
    return json(200, { ok: true });
  }

  // One waiver run, every claim in the order ESPN processed it (by its processing time, to the
  // millisecond). Claims that failed are only included for the signed-in owner.
  if (action === "waivers" && req.method === "GET") {
    const p = new URL(req.url).searchParams;
    const leagueId = p.get("leagueId"), season = p.get("season") || String(defaultSeason()), at = Number(p.get("at")) || 0;
    if (!validLeague(leagueId, season)) return json(400, { error: "bad_request" });
    const owner = signedIn(req);
    let claims, usesBudget;
    try {
      const info = await espnRead(leagueId, season, ["mStatus", "mSettings"]);
      usesBudget = !!info.settings?.acquisitionSettings?.isUsingAcquisitionBudget;
      const latest = info.status?.latestScoringPeriod || info.scoringPeriodId || 1;
      // The period the run happened in: around `at` if given, else the last couple of periods.
      const periods = [...new Set([latest, latest - 1, latest - 2].filter((x) => x >= 1))];
      const pages = await Promise.all(periods.map(async (sp) => {
        const r = await fetch(`${READS}/seasons/${season}/segments/0/leagues/${leagueId}?view=mTransactions2&scoringPeriodId=${sp}`, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (fantasy-dashboard)", cookie: `espn_s2=${process.env.ESPN_S2}; SWID=${process.env.SWID}` } });
        return r.ok ? r.json() : {};
      }));
      const byId = new Map();
      for (const pg of pages) for (const t of pg.transactions || []) byId.set(t.id, t);
      claims = [...byId.values()].filter((t) => t.type === "WAIVER" && t.processDate && t.executionType !== "CANCEL" && t.status && !/^(PENDING|CANCEL)/.test(t.status))
        .sort((a, b) => a.processDate - b.processDate);
    } catch { return json(502, { error: "upstream", message: "Couldn't load the waiver results from ESPN." }); }
    // Split into runs (a run's claims are processed within seconds of each other).
    const runs = [];
    for (const t of claims) { const r = runs.at(-1); if (r && t.processDate - r.at(-1).processDate < 30 * 60e3) r.push(t); else runs.push([t]); }
    const run = (at && runs.find((r) => at >= r[0].processDate - 15 * 60e3 && at <= r.at(-1).processDate + 6 * 3600e3)) || runs.at(-1) || [];
    const shown = owner ? run : run.filter((t) => t.status === "EXECUTED");
    const ids = [...new Set(shown.flatMap((t) => (t.items || []).map((i) => i.playerId)))];
    const names = {};
    if (ids.length) {
      try {
        const r = await fetch(`${READS}/seasons/${season}/players?scoringPeriodId=0&view=players_wl`, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (fantasy-dashboard)", "x-fantasy-filter": JSON.stringify({ filterIds: { value: ids } }) } });
        for (const pl of (await r.json()) || []) names[pl.id] = [pl.fullName, pl.defaultPositionId, pl.proTeamId];
      } catch { /* ids only */ }
    }
    return json(200, {
      owner, usesBudget, at: run[0]?.processDate || null, hidden: run.length - shown.length,
      claims: shown.map((t) => ({ id: t.id, teamId: t.teamId, status: t.status, bid: usesBudget ? t.bidAmount || 0 : null, at: t.processDate,
        items: (t.items || []).map((i) => ({ playerId: i.playerId, type: i.type, info: names[i.playerId] || null })) })),
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

  if (action === "pushowner" && req.method === "POST") {
    if (!signedIn(req)) return json(401, { error: "signed_out" });
    if (!sameOrigin(req)) return json(403, { error: "origin" });
    const b = await req.json().catch(() => ({}));
    const leagueId = String(b.leagueId || ""), season = String(b.season || defaultSeason());
    if (!validLeague(leagueId, season) || typeof b.endpoint !== "string") return json(400, { error: "bad_request" });
    const s = pushStore(), key = subKey(b.endpoint, leagueId);
    const sub = await s.get(key, { type: "json" });
    if (!sub) return json(404, { error: "not_subscribed" });
    let mine = [];
    try { mine = ownedTeams(await espnRead(leagueId, season, ["mTeam"])); } catch { return json(502, { error: "upstream" }); }
    sub.owner = mine.includes(Number(sub.teamId));
    await s.setJSON(key, sub);
    return json(200, { owner: sub.owner });
  }

  // Cancel a pending waiver claim, withdraw a trade offer you sent, or decline one you got. The claim
  // cancel is the shape ESPN's own site sends (captured by github.com/jwulff/fantasy-sports):
  // { type: "WAIVER", executionType: "CANCEL", relatedTransactionId }. Trade offers use the same idea;
  // if ESPN refuses, the next shape is tried. After each one the pending queue is re-read to confirm.
  if (action === "cancel" && req.method === "POST") {
    if (!signedIn(req)) return json(401, { error: "signed_out", message: "Sign in as the owner first." });
    if (!sameOrigin(req)) return json(403, { error: "origin", message: "Changes have to come from the site itself." });
    const b = await req.json().catch(() => ({}));
    const season = String(b.season || defaultSeason()), leagueId = String(b.leagueId || ""), teamId = Number(b.teamId);
    const txId = String(b.txId || ""), kind = String(b.kind || "");
    if (!validLeague(leagueId, season) || !Number.isInteger(teamId) || !/^[\w-]{6,64}$/.test(txId) || !["claim", "trade-out", "trade-in"].includes(kind)) {
      return json(400, { error: "bad_request", message: "That cancel request doesn't look right." });
    }
    let data;
    try { data = await espnRead(leagueId, season, ["mTeam", "mPendingTransactions", "mStatus"]); } catch {
      return json(502, { error: "upstream", message: "Couldn't load your pending moves from ESPN." });
    }
    if (!ownedTeams(data).includes(teamId)) return json(403, { error: "not_yours", message: "That isn't your team." });
    const pendingNow = (d) => livePending(d).find((t) => String(t.id) === txId);
    const tx = pendingNow(data);
    if (!tx) return json(409, { error: "gone", message: "That move isn't pending anymore." });
    const mineInvolved = tx.teamId === teamId || (tx.items || []).some((i) => i.fromTeamId === teamId || i.toTeamId === teamId);
    if (!mineInvolved) return json(403, { error: "not_yours", message: "That move isn't yours." });
    const sp = data.scoringPeriodId || data.status?.latestScoringPeriod;
    const TX = `${WRITES}/seasons/${season}/segments/0/leagues/${leagueId}/transactions/`;
    const base = { isLeagueManager: false, teamId, scoringPeriodId: sp, relatedTransactionId: txId };
    const tries = kind === "claim" ? [["POST", TX, { ...base, type: tx.type === "FREEAGENT" ? "FREEAGENT" : "WAIVER", executionType: "CANCEL" }]]
      : kind === "trade-out" ? [["POST", TX, { ...base, type: "TRADE_PROPOSAL", executionType: "CANCEL" }], ["POST", TX, { ...base, type: "TRADE_DECLINE", executionType: "EXECUTE" }]]
      : [["POST", TX, { ...base, type: "TRADE_DECLINE", executionType: "EXECUTE" }], ["POST", TX, { ...base, type: "TRADE_PROPOSAL", executionType: "CANCEL" }]];
    const headers = { "content-type": "application/json", accept: "application/json", "user-agent": "Mozilla/5.0 (fantasy-dashboard)", "x-fantasy-source": "kona", "x-fantasy-platform": "kona-PROD", origin: "https://fantasy.espn.com", referer: "https://fantasy.espn.com/", cookie: `espn_s2=${process.env.ESPN_S2}; SWID=${process.env.SWID}` };
    let lastMsg = "";
    for (const [method, url, body] of tries) {
      let res, out;
      try { res = await fetch(url, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) }); out = await res.json().catch(() => null); } catch { continue; }
      lastMsg = out?.messages?.[0] || out?.details?.[0]?.message || "";
      console.log(JSON.stringify({ event: "cancel_try", ip, leagueId, teamId, txId, kind, method, type: body?.type || null, result: res.status, espnMsg: lastMsg }));
      if (!res.ok) continue;
      try { if (!pendingNow(await espnRead(leagueId, season, ["mPendingTransactions"]))) return json(200, { ok: true }); } catch { return json(200, { ok: true, unverified: true }); }
    }
    return json(502, { error: "espn_refused", message: `ESPN didn't ${kind === "trade-in" ? "decline" : "cancel"} it${lastMsg ? `: ${lastMsg}` : ""}. You can do it in the ESPN app for now.` });
  }

  // ---------- League chat (ESPN's chat.espn.com service, same ESPN sign-in) ----------
  if (["chat", "chattopic", "chatsend", "chatnew", "chatread"].includes(action)) {
    if (!signedIn(req)) return json(401, { error: "signed_out", message: "Sign in as the owner first." });
    const isPost = req.method === "POST";
    if (isPost && !sameOrigin(req)) return json(403, { error: "origin", message: "Use the site itself." });
    const b = isPost ? await req.json().catch(() => ({})) : Object.fromEntries(new URL(req.url).searchParams);
    const leagueId = String(b.leagueId || ""), season = String(b.season || defaultSeason());
    if (!validLeague(leagueId, season)) return json(400, { error: "bad_request", message: "Missing league." });
    const COMM = `https://lm-api-communication.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}/communication/`;
    const me = `{${swidRaw()}}`;
    const headers = { accept: "application/json", "content-type": "application/json", "user-agent": "Mozilla/5.0 (fantasy-dashboard)", origin: "https://chat.espn.com", referer: "https://chat.espn.com/", cookie: `espn_s2=${process.env.ESPN_S2}; SWID=${process.env.SWID}` };
    const comm = async (path, init = {}, filter) => {
      const res = await fetch(COMM + path, { ...init, headers: filter ? { ...headers, "x-fantasy-filter": JSON.stringify(filter) } : headers });
      const out = await res.json().catch(() => null);
      if (!res.ok) throw Object.assign(new Error(out?.messages?.[0] || out?.details?.[0]?.message || `ESPN chat returned ${res.status}`), { status: res.status });
      return out;
    };
    const norm = (id) => String(id || "").toUpperCase().replace(/[{}]/g, "");
    // Who's who: managers and their teams.
    let league;
    try { league = await espnRead(leagueId, season, ["mTeam", "mSettings"]); } catch { return json(502, { error: "upstream", message: "Couldn't load the league from ESPN." }); }
    const teamOf = {};
    for (const t of league.teams || []) for (const o of t.owners || []) teamOf[norm(o)] = t;
    const members = (league.members || []).map((m) => {
      const t = teamOf[norm(m.id)];
      const name = [m.firstName, m.lastName].filter(Boolean).join(" ") || m.displayName || "Manager";
      return { id: m.id, name, first: m.firstName || name.split(" ")[0], teamId: t?.id ?? null, team: t ? (t.name || `${t.location || ""} ${t.nickname || ""}`.trim()) : "" };
    });
    const memberOf = (id) => members.find((m) => norm(m.id) === norm(id));
    try {
      if (action === "chat") {
        const list = await comm("?view=chat_conversations&platform=chat", {}, { topics: { filterType: { value: ["CHAT_ALL_MEMBERS", "CHAT_DIRECT_MESSAGE"] } } });
        const topics = (list.topics || []).filter((t) => t.type !== "ACTIVITY_TRANSACTIONS").map((t) => {
          const others = (t.viewableBy || []).filter((x) => norm(x) !== norm(me)).map(memberOf).filter(Boolean);
          return { id: t.id, type: t.type, unread: t.unreadMessageCount || 0, date: t.dateEdited || 0,
            title: t.type === "CHAT_ALL_MEMBERS" ? (league.settings?.name || "League chat") : others.map((o) => o.first).join(", ") || "Chat",
            members: others.map((o) => ({ name: o.name, team: o.team, teamId: o.teamId })) };
        });
        return json(200, { me: { id: me, teamId: memberOf(me)?.teamId ?? null }, topics, members: members.filter((m) => norm(m.id) !== norm(me)) });
      }
      if (action === "chattopic") {
        if (!/^[\w-]{6,64}$/.test(String(b.topic || ""))) return json(400, { error: "bad_request" });
        const c = await comm(`topics/${b.topic}?view=chat_conversation&platform=chat`, {}, { limit: 100, offset: 0, sortDate: { sortAsc: false, sortPriority: 1 } });
        // ESPN's automatic posts carry team and player ids; turn them into readable lines.
        const ids = new Set();
        for (const m of c.messages || []) for (const [k, v] of Object.entries(m.attributes || {})) if (/P\d+$/.test(k)) ids.add(Number(v));
        const names = {};
        if (ids.size) {
          try {
            const r = await fetch(`${READS}/seasons/${season}/players?scoringPeriodId=0&view=players_wl`, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (fantasy-dashboard)", "x-fantasy-filter": JSON.stringify({ filterIds: { value: [...ids] } }) } });
            for (const pl of (await r.json()) || []) names[pl.id] = pl.fullName;
          } catch { /* ids only */ }
        }
        const teamName = (id) => { const t = (league.teams || []).find((x) => String(x.id) === String(id)); return t ? (t.name || `Team ${id}`) : `Team ${id}`; };
        const activity = (a) => {
          const parts = [];
          for (let n = 1; n <= 12; n++) {
            if (a[`team${n}`] == null) continue;
            const adds = Object.keys(a).filter((k) => k.startsWith(`team${n}addP`) || (n === 1 && /^addP\d+$/.test(k))).map((k) => names[a[k]] || "a player");
            const drops = Object.keys(a).filter((k) => k.startsWith(`team${n}dropP`) || (n === 1 && /^dropP\d+$/.test(k))).map((k) => names[a[k]] || "a player");
            if (adds.length || drops.length) parts.push(`${teamName(a[`team${n}`])}: ${[adds.length ? `+ ${adds.join(", ")}` : "", drops.length ? `− ${drops.join(", ")}` : ""].filter(Boolean).join("  ")}`);
          }
          return parts;
        };
        // Message types, as ESPN's chat app shows them. 259/260 are a sticker/GIF someone posted.
        const kind = { 264: "Player Add", 265: "Player Drop", 266: "Player Add/Drop", 271: "Trade", 272: "Trade", 273: "Waiver results", 270: "League recap", 281: "Matchup recap" };
        const media = await loadChatMedia(season);
        const messages = (c.messages || []).filter((m) => !m.isDeleted).map((m) => {
          const who = memberOf(m.author), t = m.messageTypeId;
          const base = { id: m.id, date: m.date, mine: norm(m.author) === norm(me), author: who?.name || "League", team: who?.team || "" };
          if (t === 0) return { ...base, text: m.content || "" };
          if (t === 259 || t === 260) {
            const img = (t === 260 ? media.gifs[m.targetId] || media.stickers[m.targetId] : media.stickers[m.targetId] || media.gifs[m.targetId]) || null;
            return { ...base, img, sticker: t === 259, text: img ? "" : t === 260 ? "[GIF]" : "[Sticker]" };
          }
          const a = m.attributes || {};
          return { ...base, system: true, title: kind[t] || "League update", text: m.content || "", lines: activity(a),
            week: t === 281 && a.mId ? Number(a.mId) : null };
        }).sort((x, y) => x.date - y.date);
        return json(200, { id: c.id, type: c.type, messages, total: c.totalMessageCount || messages.length });
      }
      if (action === "chatsend" && isPost) {
        const text = String(b.text || "").trim();
        if (!/^[\w-]{6,64}$/.test(String(b.topic || "")) || !text || text.length > 1000) return json(400, { error: "bad_request", message: "Write a message (up to 1,000 characters)." });
        await comm(`topics/${b.topic}/messages/?source=${encodeURIComponent(me)}&platform=chat`, { method: "POST", body: JSON.stringify({ author: me, content: text, messageTypeId: 0 }) });
        console.log(JSON.stringify({ event: "chat_send", ip, leagueId, at: new Date().toISOString() }));
        return json(200, { ok: true });
      }
      // Mark a conversation read up to now (what ESPN's chat app sends when you open one).
      if (action === "chatread" && isPost) {
        if (!/^[\w-]{6,64}$/.test(String(b.topic || ""))) return json(400, { error: "bad_request" });
        await comm(`topics/${b.topic}/lastRead`, { method: "POST", body: "{}" });
        return json(200, { ok: true });
      }
      if (action === "chatnew" && isPost) {
        const text = String(b.text || "").trim();
        const ids = (Array.isArray(b.members) ? b.members : []).map(String).filter((x) => memberOf(x));
        if (!ids.length || !text || text.length > 1000) return json(400, { error: "bad_request", message: "Pick at least one manager and write a message." });
        const out = await comm(`topics/?source=${encodeURIComponent(me)}&platform=chat`, { method: "POST", body: JSON.stringify({
          messages: [{ author: me, content: text, messageTypeId: 0 }], subject: "DM", type: "CHAT_DIRECT_MESSAGE", viewableBy: [me, ...ids] }) });
        console.log(JSON.stringify({ event: "chat_new", ip, leagueId, people: ids.length, at: new Date().toISOString() }));
        return json(200, { ok: true, id: out?.id || null });
      }
    } catch (e) {
      return json(e.status === 401 || e.status === 403 ? 403 : 502, { error: "chat", message: `ESPN chat: ${e.message}` });
    }
    return json(404, { error: "not_found" });
  }

  return json(404, { error: "not_found" });
};

export const config = { path: "/api/roster/:action" };
