// Lineup changes, pickups, claims, trades and chat, sent to ESPN as the manager making them.
//
// Two ways to be signed in:
//   • Connected manager: anyone in the leagues pastes their own ESPN sign-in (espn_s2 + SWID cookies) once
//     (POST /connect). It's checked with ESPN, encrypted (AES-256-GCM, key derived from ROSTER_PASSPHRASE,
//     so changing the passphrase disconnects everyone) and kept in Netlify Blobs ("managers"); the device
//     gets an HttpOnly cookie (ffb_mgr) pointing at it. Every request then acts with that manager's own
//     ESPN sign-in, so ESPN only lets them touch their own team. Other devices (phones) sign in with a
//     one-time 10-minute code (POST /handoff, /redeem).
//     When a manager connects, past seasons the site's own sign-in can't read (ESPN only shows a season
//     to people who were in the league that year) are read once with theirs and saved for the History tab.
//   • Site owner: the passphrase sign-in below, acting with the ESPN sign-in saved in Netlify.
//
// The owner sign-in is locked down so only the site owner can use it:
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
//         GET  /api/roster/watchlist?leagueId=&season=       your team's ESPN watch list (player ids)
//         POST /api/roster/watch {leagueId, season, teamId, playerId, on}   add to / remove from it
//         POST /api/roster/reorder {leagueId, season, teamId, order: [claim ids]}  your claim processing order
//         GET  /api/roster/waivers?leagueId=&season=&at=   one waiver run's claims in processing order
//                                    (failed claims only for the signed-in owner)
//         POST /api/roster/cancel {leagueId, season, teamId, txId, kind: claim | trade-out | trade-in}
//         POST /api/roster/pushowner {endpoint, leagueId}  (marks this device's alerts as the owner's, so
//                                    waiver reports can include missed claims)
//         POST /api/roster/connect {s2, swid, leagues: [{id, season}]}   connect your own ESPN sign-in
//         POST /api/roster/disconnect   delete your saved ESPN sign-in (signs out every device)
//         POST /api/roster/handoff      a one-time code to sign another device in · POST /api/roster/redeem {code}

import { createHmac, createHash, timingSafeEqual, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { store as pushStore, subKey, waiverOrder } from "../lib/push-common.mjs";

const READS = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl";
const WRITES = "https://lm-api-writes.fantasy.espn.com/apis/v3/games/ffl";
const COOKIE = "ffb_owner";
const MAX_AGE = 90 * 24 * 3600;
const fails = new Map();
let chatMedia = { at: 0, season: null, gifs: {}, stickers: {} };
async function loadChatMedia(season) {
  if (chatMedia.season === season && Date.now() - chatMedia.at < 6 * 3600e3) return chatMedia;
  try {
    const r = await fetch(`${READS}/seasons/${season}/?view=chat_settings&platform=chat`, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (fantasy-dashboard)", cookie: `espn_s2=${C.s2}; SWID=${C.swid}` } });
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
// The ESPN sign-in this request acts with: the connected manager's own, or the one saved in Netlify.
// (Each function instance handles one request at a time, so a module-level value is safe.)
const envCred = () => ({ s2: process.env.ESPN_S2 || "", swid: process.env.SWID || "" });
let C = envCred();
let WHO = null; // { kind: "owner" } or { kind: "manager", id, name }
const normSwid = (s) => String(s || "").replace(/[{}]/g, "").toUpperCase();
const swidRaw = () => normSwid(C.swid);
const secret = () => createHash("sha256").update(`ffb-owner:${process.env.ROSTER_PASSPHRASE}:${normSwid(process.env.SWID)}`).digest();
const sign = (exp) => createHmac("sha256", secret()).update(`owner|${exp}`).digest("base64url");
const same = (a, b) => {
  const x = createHash("sha256").update(String(a)).digest(), y = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(x, y);
};
const signedIn = () => !!WHO;
function ownerCookie(req) {
  if (!process.env.ROSTER_PASSPHRASE) return false;
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(req.headers.get("cookie") || "");
  if (!m) return false;
  const [exp, sig] = m[1].split(".");
  return Number(exp) > Date.now() / 1000 && !!sig && same(sig, sign(exp));
}
const cookie = (value, maxAge) => `${COOKIE}=${value}; Path=/api/roster; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

// ---------- Connected managers ----------
const MGR = "ffb_mgr";
const managers = () => getStore({ name: "managers", consistency: "strong" });
const mgrId = (swid) => createHash("sha256").update(`mgr:${normSwid(swid)}`).digest("hex").slice(0, 24);
const msign = (id, exp) => createHmac("sha256", secret()).update(`mgr|${id}|${exp}`).digest("base64url");
const mcookie = (value, maxAge) => `${MGR}=${value}; Path=/api/roster; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
const mgrCookieFor = (id) => { const exp = Math.floor(Date.now() / 1000) + MAX_AGE; return mcookie(`${id}.${exp}.${msign(id, exp)}`, MAX_AGE); };
const encKey = () => createHash("sha256").update(`ffb-mgr-key:${process.env.ROSTER_PASSPHRASE}`).digest();
function seal(text) {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", encKey(), iv);
  const enc = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}
function unseal(s) {
  const [iv, tag, enc] = String(s).split(".").map((x) => Buffer.from(x, "base64url"));
  const d = createDecipheriv("aes-256-gcm", encKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}
// Who's asking: a connected manager (their own ESPN sign-in) or the site owner (the saved one).
async function resolve(req) {
  C = envCred(); WHO = null;
  const m = new RegExp(`(?:^|;\\s*)${MGR}=([^;]+)`).exec(req.headers.get("cookie") || "");
  if (m) {
    const [id, exp, sig] = m[1].split(".");
    if (id && Number(exp) > Date.now() / 1000 && sig && same(sig, msign(id, exp))) {
      const rec = await managers().get(`m:${id}`, { type: "json" }).catch(() => null);
      if (rec) {
        try { C = { s2: unseal(rec.s2), swid: rec.swid }; WHO = { kind: "manager", id, name: rec.name || "" }; return; } catch { /* key changed: treat as signed out */ }
      }
    }
  }
  if (ownerCookie(req)) WHO = { kind: "owner" };
}
// Several Set-Cookie headers on one response.
function withCookies(res, cookies) {
  const h = new Headers(res.headers);
  for (const c of cookies) h.append("set-cookie", c);
  return new Response(res.body, { status: res.status, headers: h });
}
// Past seasons the site's own sign-in can't read, read once with a connected manager's and saved
// (store "history", key "<leagueId>:<season>") for /api/espn to serve on the History tab.
const HIST_VIEWS = ["mTeam", "mSettings", "mStandings", "mMatchupScore"];
async function backfillHistory(leagueId, season) {
  const hs = getStore({ name: "history", consistency: "strong" });
  let saved = 0, years = [];
  try { years = (await espnRead(leagueId, season, ["mStatus"])).status?.previousSeasons || []; } catch { return 0; }
  for (const y of years) {
    const key = `${leagueId}:${y}`;
    if (await hs.get(key).catch(() => null)) continue;
    const env = envCred();
    const siteCanRead = await fetch(`${READS}/seasons/${y}/segments/0/leagues/${leagueId}?view=mTeam`, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (fantasy-dashboard)", cookie: `espn_s2=${env.s2}; SWID=${env.swid}` } }).then((r) => r.ok).catch(() => true);
    if (siteCanRead) continue;
    try { await hs.setJSON(key, { at: Date.now(), data: await espnRead(leagueId, y, HIST_VIEWS) }); saved++; } catch { /* that manager wasn't in it either */ }
  }
  return saved;
}
// Requests that change something must come from a page on this site.
function sameOrigin(req) {
  const origin = req.headers.get("origin");
  return !!origin && new URL(origin).host === new URL(req.url).host;
}
async function espnRead(leagueId, season, views, sp) {
  const u = new URL(`${READS}/seasons/${season}/segments/0/leagues/${leagueId}`);
  for (const v of views) u.searchParams.append("view", v);
  if (sp) u.searchParams.set("scoringPeriodId", sp);
  const res = await fetch(u, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (fantasy-dashboard)", cookie: `espn_s2=${C.s2}; SWID=${C.swid}` } });
  if (!res.ok) throw Object.assign(new Error(`ESPN returned ${res.status}`), { status: res.status });
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
        cookie: `espn_s2=${C.s2}; SWID=${C.swid}`,
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
  await resolve(req);

  if (action === "login" && req.method === "POST") {
    if (!sameOrigin(req)) return json(403, { error: "origin", message: "Sign in from the site itself." });
    const f = fails.get(ip);
    if (f?.until > Date.now()) return json(429, { error: "locked", message: "Too many wrong tries. Wait 15 minutes." });
    const body = await req.json().catch(() => ({}));
    if (typeof body.passphrase === "string" && same(body.passphrase, process.env.ROSTER_PASSPHRASE)) {
      fails.delete(ip);
      const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
      console.log(JSON.stringify({ event: "owner_login", ip, at: new Date().toISOString() }));
      return withCookies(json(200, { signedIn: true }), [cookie(`${exp}.${sign(exp)}`, MAX_AGE), mcookie("", 0)]);
    }
    const n = (f?.n || 0) + 1;
    fails.set(ip, { n, until: n >= 5 ? Date.now() + 15 * 60e3 : 0 });
    console.log(JSON.stringify({ event: "owner_login_failed", ip, tries: n, at: new Date().toISOString() }));
    await sleep(1500);
    return json(401, { error: "wrong", message: "That passphrase isn't right." });
  }

  if (action === "logout" && req.method === "POST") {
    return withCookies(json(200, { signedIn: false }), [cookie("", 0), mcookie("", 0)]);
  }

  // Connect your own ESPN sign-in. Checked with ESPN, then kept encrypted; only works if that account
  // manages a team in one of the site's leagues.
  if (action === "connect" && req.method === "POST") {
    if (!sameOrigin(req)) return json(403, { error: "origin", message: "Connect from the site itself." });
    const f = fails.get(ip);
    if (f?.until > Date.now()) return json(429, { error: "locked", message: "Too many tries. Wait 15 minutes." });
    const bad = async (status, body) => { const n = (fails.get(ip)?.n || 0) + 1; fails.set(ip, { n, until: n >= 8 ? Date.now() + 15 * 60e3 : 0 }); await sleep(800); return json(status, body); };
    const b = await req.json().catch(() => ({}));
    const s2 = String(b.s2 || "").trim(), raw = normSwid(String(b.swid || "").trim());
    if (s2.length < 60 || s2.length > 2000 || /[\s;]/.test(s2)) return bad(400, { error: "bad_s2", message: "That espn_s2 doesn't look right. Copy the whole value." });
    if (!/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/.test(raw)) return bad(400, { error: "bad_swid", message: "That SWID doesn't look right. It looks like {1A2B3C4D-…}." });
    const leagues = (Array.isArray(b.leagues) ? b.leagues : []).slice(0, 10).map((l) => ({ id: String(l?.id || ""), season: String(l?.season || defaultSeason()) })).filter((l) => validLeague(l.id, l.season));
    if (!leagues.length) return json(400, { error: "bad_request", message: "Missing leagues." });
    C = { s2, swid: `{${raw}}` };
    // Is the sign-in still good? (Same check as /api/auth.)
    try {
      const r = await fetch(`https://fan.api.espn.com/apis/v2/fans/${encodeURIComponent(C.swid)}?displayEvents=false&displayNow=false&displayRecs=false&displayHiddenPrefs=false`, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (fantasy-dashboard)", cookie: `espn_s2=${C.s2}; SWID=${C.swid}` } });
      if (r.status === 401 || r.status === 403) return bad(401, { error: "espn_rejected", message: "ESPN didn't accept that sign-in. Make sure you're signed in on fantasy.espn.com, then copy both values again." });
      if (r.status === 404) return bad(400, { error: "bad_swid", message: "ESPN doesn't know that SWID. Copy it again, including the braces." });
    } catch { return json(502, { error: "upstream", message: "Couldn't reach ESPN. Try again in a minute." }); }
    // Which teams are theirs in each league.
    const teams = {};
    let name = "";
    for (const l of leagues) {
      try {
        const d = await espnRead(l.id, l.season, ["mTeam"]);
        const mine = ownedTeams(d);
        if (mine.length) teams[l.id] = mine;
        const me = (d.members || []).find((m) => normSwid(m.id) === raw);
        if (me && !name) name = [me.firstName, me.lastName].filter(Boolean).join(" ") || me.displayName || "";
      } catch { /* not in that league */ }
    }
    if (!Object.keys(teams).length) return bad(403, { error: "not_member", message: "That ESPN account doesn't manage a team in these leagues." });
    fails.delete(ip);
    const id = mgrId(raw), store = managers();
    const prev = await store.get(`m:${id}`, { type: "json" }).catch(() => null);
    await store.setJSON(`m:${id}`, { swid: `{${raw}}`, s2: seal(s2), name, teams, created: prev?.created || Date.now(), updated: Date.now() });
    console.log(JSON.stringify({ event: "manager_connect", id, name, teams, ip, at: new Date().toISOString() }));
    let history = 0;
    for (const l of leagues) if (teams[l.id]) history += await backfillHistory(l.id, l.season).catch(() => 0);
    return withCookies(json(200, { signedIn: true, kind: "manager", name, teams, history }), [mgrCookieFor(id), cookie("", 0)]);
  }

  // Forget your saved ESPN sign-in (every device you signed in is signed out).
  if (action === "disconnect" && req.method === "POST") {
    if (!sameOrigin(req)) return json(403, { error: "origin" });
    if (WHO?.kind === "manager") {
      await managers().delete(`m:${WHO.id}`).catch(() => {});
      console.log(JSON.stringify({ event: "manager_disconnect", id: WHO.id, at: new Date().toISOString() }));
    }
    return withCookies(json(200, { signedIn: false }), [cookie("", 0), mcookie("", 0)]);
  }

  // A one-time code (10 minutes) to sign another device in as the same manager.
  if (action === "handoff" && req.method === "POST") {
    if (WHO?.kind !== "manager") return json(401, { error: "signed_out", message: "Connect your ESPN account first." });
    if (!sameOrigin(req)) return json(403, { error: "origin" });
    const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789", bytes = randomBytes(8);
    const code = [...bytes].map((x) => abc[x % abc.length]).join("");
    const expires = Date.now() + 10 * 60e3;
    await managers().setJSON(`h:${code}`, { id: WHO.id, expires });
    return json(200, { code, expires });
  }
  if (action === "redeem" && req.method === "POST") {
    if (!sameOrigin(req)) return json(403, { error: "origin" });
    const f = fails.get(ip);
    if (f?.until > Date.now()) return json(429, { error: "locked", message: "Too many tries. Wait 15 minutes." });
    const b = await req.json().catch(() => ({}));
    const code = String(b.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const store = managers(), h = code.length === 8 ? await store.get(`h:${code}`, { type: "json" }).catch(() => null) : null;
    if (!h || h.expires < Date.now() || !(await store.get(`m:${h.id}`).catch(() => null))) {
      const n = (f?.n || 0) + 1; fails.set(ip, { n, until: n >= 8 ? Date.now() + 15 * 60e3 : 0 });
      await sleep(800);
      return json(400, { error: "bad_code", message: "That code didn't work. Codes last 10 minutes and work once." });
    }
    await store.delete(`h:${code}`).catch(() => {});
    fails.delete(ip);
    return withCookies(json(200, { signedIn: true, kind: "manager" }), [mgrCookieFor(h.id), cookie("", 0)]);
  }

  if (action === "session" && req.method === "GET") {
    if (!signedIn(req)) return json(200, { signedIn: false });
    const who = { signedIn: true, kind: WHO.kind, name: WHO.name || "" };
    const p = new URL(req.url).searchParams;
    const leagueId = p.get("leagueId"), season = p.get("season") || String(defaultSeason());
    if (!validLeague(leagueId, season)) return json(200, { ...who, teams: [] });
    try {
      return json(200, { ...who, teams: ownedTeams(await espnRead(leagueId, season, ["mTeam"])) });
    } catch (e) {
      // A connected manager's ESPN sign-in has run out: they need to connect again.
      return json(200, { ...who, teams: [], expired: WHO.kind === "manager" && (e.status === 401 || e.status === 403) });
    }
  }

  if (action === "lineup" && req.method === "POST") {
    if (!signedIn(req)) return json(401, { error: "signed_out", message: "Connect your ESPN account first." });
    if (!sameOrigin(req)) return json(403, { error: "origin", message: "Changes have to come from the site itself." });
    const b = await req.json().catch(() => ({}));
    const season = String(b.season || defaultSeason()), leagueId = String(b.leagueId || ""), teamId = Number(b.teamId);
    const items = Array.isArray(b.items) ? b.items : [];
    if (!validLeague(leagueId, season) || !Number.isInteger(teamId) || !items.length
      || items.length > 20 || !items.every((i) => [i.playerId, i.from, i.to].every(Number.isInteger))) {
      return json(400, { error: "bad_request", message: "That lineup change doesn't look right." });
    }
    // A later week's lineup can be set ahead of time (`sp`, that week's scoring period); this week's by default.
    const want = Number.isInteger(b.sp) ? b.sp : null;
    let data;
    try {
      data = await espnRead(leagueId, season, ["mTeam", "mRoster", "mSettings", "mStatus"]);
      const now = data.scoringPeriodId || data.status?.latestScoringPeriod;
      if (want && want !== now) {
        if (want < now || want > now + 20 || want > (data.status?.finalScoringPeriod || 99)) return json(400, { error: "bad_week", message: "That week's lineup can't be changed." });
        data = { ...data, ...(await espnRead(leagueId, season, ["mTeam", "mRoster"], want)), future: true };
      }
    } catch (e) {
      return json(502, { error: "upstream", message: "Couldn't load your roster from ESPN to check the change." });
    }
    if (!ownedTeams(data).includes(teamId)) return json(403, { error: "not_yours", message: "That isn't your team." });
    const sp = data.future ? want : data.scoringPeriodId || data.status?.latestScoringPeriod;
    const slots = data.settings?.rosterSettings?.lineupSlotCounts || {};
    const roster = data.teams.find((t) => t.id === teamId)?.roster?.entries || [];
    for (const i of items) {
      const e = roster.find((x) => x.playerId === i.playerId);
      if (!e) return json(400, { error: "not_on_team", message: "A player in that change isn't on your roster." });
      if (e.lineupSlotId !== i.from) return json(409, { error: "stale", message: "Your lineup changed on ESPN since this page loaded. Refresh and try again." });
      const elig = e.playerPoolEntry?.player?.eligibleSlots || [];
      if (i.to !== 20 && (!elig.includes(i.to) || !(slots[i.to] > 0))) return json(400, { error: "ineligible", message: `${e.playerPoolEntry?.player?.fullName || "A player"} can't play that slot.` });
      if (!data.future && e.playerPoolEntry?.lineupLocked) return json(409, { error: "locked", message: `${e.playerPoolEntry?.player?.fullName || "A player"} is locked (his game has started).` });
    }
    const payload = {
      isLeagueManager: false, teamId, type: "ROSTER", memberId: `{${swidRaw()}}`, scoringPeriodId: sp, executionType: "EXECUTE",
      items: items.map((i) => ({ playerId: i.playerId, type: "LINEUP", fromLineupSlotId: i.from, toLineupSlotId: i.to })),
    };
    return espnWrite(leagueId, season, payload, { event: "lineup", ip, leagueId, season, teamId, sp, items, at: new Date().toISOString() });
  }

  // Free-agent pickup (with or without a drop), waiver claim, or a plain drop.
  if (action === "transaction" && req.method === "POST") {
    if (!signedIn(req)) return json(401, { error: "signed_out", message: "Connect your ESPN account first." });
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
    if (!signedIn(req)) return json(401, { error: "signed_out", message: "Connect your ESPN account first." });
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
    if (!signedIn(req)) return json(401, { error: "signed_out", message: "Connect your ESPN account first." });
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
        headers: { "content-type": "application/json", accept: "application/json", "user-agent": "Mozilla/5.0 (fantasy-dashboard)", "x-fantasy-source": "kona", "x-fantasy-platform": "kona-PROD", origin: "https://fantasy.espn.com", referer: "https://fantasy.espn.com/", cookie: `espn_s2=${C.s2}; SWID=${C.swid}` },
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
    // Failed claims are private on ESPN: the site owner sees the whole run, a connected manager only their own.
    const owner = WHO?.kind === "owner";
    let claims, usesBudget, ranks, mine = [];
    try {
      const info = await espnRead(leagueId, season, ["mStatus", "mSettings", "mTeam"]);
      ranks = Object.fromEntries((info.teams || []).map((t) => [t.id, t.waiverRank]));
      if (WHO?.kind === "manager") mine = ownedTeams(info);
      usesBudget = !!info.settings?.acquisitionSettings?.isUsingAcquisitionBudget;
      const latest = info.status?.latestScoringPeriod || info.scoringPeriodId || 1;
      // The period the run happened in: around `at` if given, else the last couple of periods.
      const periods = [...new Set([latest, latest - 1, latest - 2].filter((x) => x >= 1))];
      const pages = await Promise.all(periods.map(async (sp) => {
        const r = await fetch(`${READS}/seasons/${season}/segments/0/leagues/${leagueId}?view=mTransactions2&scoringPeriodId=${sp}`, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (fantasy-dashboard)", cookie: `espn_s2=${C.s2}; SWID=${C.swid}` } });
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
    const found = (at && runs.find((r) => at >= r[0].processDate - 15 * 60e3 && at <= r.at(-1).processDate + 6 * 3600e3)) || runs.at(-1) || [];
    // Today's waiver order only says who won in what order for the most recent run.
    const run = waiverOrder(found, found === runs.at(-1) && !usesBudget ? ranks : null);
    const shown = owner ? run : run.filter((t) => t.status === "EXECUTED" || mine.includes(t.teamId));
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

  // Your ESPN watch list. ESPN keeps it on your team (team.watchList, only shown to you) and saves the whole
  // list with POST teams/{teamId} {watchList: [...]}, the same request its own site sends (team.watchPlayer).
  if (action === "watchlist" && req.method === "GET") {
    if (!signedIn(req)) return json(401, { error: "signed_out", message: "Connect your ESPN account first." });
    const p = new URL(req.url).searchParams;
    const leagueId = p.get("leagueId"), season = p.get("season") || String(defaultSeason());
    if (!validLeague(leagueId, season)) return json(400, { error: "bad_request" });
    try {
      const data = await espnRead(leagueId, season, ["mTeam"]);
      const teamId = ownedTeams(data)[0];
      const t = (data.teams || []).find((x) => x.id === teamId);
      return json(200, { teamId: teamId ?? null, watchList: t?.watchList || [] });
    } catch { return json(502, { error: "upstream", message: "Couldn't load your watch list from ESPN." }); }
  }
  if (action === "watch" && req.method === "POST") {
    if (!signedIn(req)) return json(401, { error: "signed_out", message: "Connect your ESPN account first." });
    if (!sameOrigin(req)) return json(403, { error: "origin", message: "Changes have to come from the site itself." });
    const b = await req.json().catch(() => ({}));
    const season = String(b.season || defaultSeason()), leagueId = String(b.leagueId || ""), teamId = Number(b.teamId), playerId = Number(b.playerId);
    if (!validLeague(leagueId, season) || !Number.isInteger(teamId) || !Number.isInteger(playerId)) return json(400, { error: "bad_request", message: "That watch list change doesn't look right." });
    let data;
    try { data = await espnRead(leagueId, season, ["mTeam"]); } catch { return json(502, { error: "upstream", message: "Couldn't load your watch list from ESPN." }); }
    if (!ownedTeams(data).includes(teamId)) return json(403, { error: "not_yours", message: "That isn't your team." });
    const cur = (data.teams || []).find((x) => x.id === teamId)?.watchList || [];
    const list = b.on ? [...new Set([...cur, playerId])] : cur.filter((x) => x !== playerId);
    if (list.length > 50) return json(400, { error: "full", message: "Your watch list is full (50 players). Take someone off first." });
    let res, out;
    try {
      res = await fetch(`${WRITES}/seasons/${season}/segments/0/leagues/${leagueId}/teams/${teamId}`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", "user-agent": "Mozilla/5.0 (fantasy-dashboard)", "x-fantasy-source": "kona", "x-fantasy-platform": "kona-PROD", origin: "https://fantasy.espn.com", referer: "https://fantasy.espn.com/", cookie: `espn_s2=${C.s2}; SWID=${C.swid}` },
        body: JSON.stringify({ watchList: list }),
      });
      out = await res.json().catch(() => null);
    } catch { return json(502, { error: "upstream", message: "Couldn't reach ESPN." }); }
    const espnMsg = out?.messages?.[0] || out?.details?.[0]?.message || "";
    console.log(JSON.stringify({ event: "watch", ip, leagueId, teamId, playerId, on: !!b.on, result: res.status, espnMsg, at: new Date().toISOString() }));
    if (!res.ok) return json(502, { error: "espn_refused", message: `ESPN didn't save it${espnMsg ? `: ${espnMsg}` : ` (${res.status})`}.` });
    return json(200, { ok: true, watchList: list });
  }

  // Propose a trade: players you send and players you'd get from one other team.
  if (action === "trade" && req.method === "POST") {
    if (!signedIn(req)) return json(401, { error: "signed_out", message: "Connect your ESPN account first." });
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
    if (!signedIn(req)) return json(401, { error: "signed_out", message: "Connect your ESPN account first." });
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
    const headers = { "content-type": "application/json", accept: "application/json", "user-agent": "Mozilla/5.0 (fantasy-dashboard)", "x-fantasy-source": "kona", "x-fantasy-platform": "kona-PROD", origin: "https://fantasy.espn.com", referer: "https://fantasy.espn.com/", cookie: `espn_s2=${C.s2}; SWID=${C.swid}` };
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
    if (!signedIn(req)) return json(401, { error: "signed_out", message: "Connect your ESPN account first." });
    const isPost = req.method === "POST";
    if (isPost && !sameOrigin(req)) return json(403, { error: "origin", message: "Use the site itself." });
    const b = isPost ? await req.json().catch(() => ({})) : Object.fromEntries(new URL(req.url).searchParams);
    const leagueId = String(b.leagueId || ""), season = String(b.season || defaultSeason());
    if (!validLeague(leagueId, season)) return json(400, { error: "bad_request", message: "Missing league." });
    const COMM = `https://lm-api-communication.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}/communication/`;
    const me = `{${swidRaw()}}`;
    const headers = { accept: "application/json", "content-type": "application/json", "user-agent": "Mozilla/5.0 (fantasy-dashboard)", origin: "https://chat.espn.com", referer: "https://chat.espn.com/", cookie: `espn_s2=${C.s2}; SWID=${C.swid}` };
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
