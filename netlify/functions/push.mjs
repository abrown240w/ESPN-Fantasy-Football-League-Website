// Push notification sign-up. Anyone in the leagues can turn on alerts for their own team on their own
// device; the watcher (push-watch.mjs) sends them.
//
// Routes: GET  /api/push/key                       the public key the browser subscribes with
//         POST /api/push/subscribe {subscription, leagueId, season, teamId, prefs}   (also saves changes)
//         POST /api/push/status    {endpoint, leagueId}
//         POST /api/push/test      {endpoint, leagueId}
//         POST /api/push/unsubscribe {endpoint, leagueId}
//         POST /api/push/solo      {endpoint, leagueId}   remove every other sign-up for this device's team
//         GET  /api/push/health                    what the watcher did last (no subscription details)

import { PREFS, store, subKey, json, vapid, sendPush, allSubs, espn, defaultSeason } from "../lib/push-common.mjs";

const MAX_SUBS = 300;
// Only real browser push services.
const PUSH_HOSTS = /(^|\.)(push\.apple\.com|fcm\.googleapis\.com|googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/;
const validEndpoint = (e) => { try { const u = new URL(e); return u.protocol === "https:" && PUSH_HOSTS.test(u.hostname); } catch { return false; } };
const sameOrigin = (req) => { const o = req.headers.get("origin"); return !!o && new URL(o).host === new URL(req.url).host; };

// "iPhone app", "Chrome on Windows"…: shown on the health page so double sign-ups can be told apart.
const deviceLabel = (ua) => {
  const os = /iPhone|iPad/.test(ua) ? (/iPad/.test(ua) ? "iPad" : "iPhone") : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Other";
  const br = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  return br ? `${br} on ${os}` : os;
};

export default async (req, context) => {
  const action = context.params?.action;
  if (action === "key" && req.method === "GET") return json(200, { publicKey: (await vapid()).publicKey });
  if (action === "health" && req.method === "GET") {
    const s = store();
    const [beat, health] = await Promise.all([s.get("beat", { type: "json" }), s.get("health", { type: "json" })].map((x) => x.catch(() => null)));
    const devices = (await allSubs()).map((o) => ({ league: o.leagueId, team: o.teamId, device: o.label || "unknown (signed up before device names)", since: new Date(o.created || 0).toISOString().slice(0, 10), tracked: !!o.device }));
    return json(200, { now: Date.now(), beat, health, devices });
  }
  if (req.method !== "POST") return json(404, { error: "not_found" });
  if (!sameOrigin(req)) return json(403, { error: "origin", message: "Use the site itself." });
  const b = await req.json().catch(() => ({}));
  const leagueId = String(b.leagueId || ""), season = String(b.season || defaultSeason());
  if (!/^\d{1,12}$/.test(leagueId) || !/^\d{4}$/.test(season)) return json(400, { error: "bad_request", message: "Missing league." });
  const endpoint = b.subscription?.endpoint || b.endpoint;
  if (!validEndpoint(endpoint)) return json(400, { error: "bad_request", message: "That isn't a browser push subscription." });
  const s = store(), key = subKey(endpoint, leagueId);
  const existing = await s.get(key, { type: "json" });

  if (action === "subscribe") {
    const teamId = Number(b.teamId);
    if (!Number.isInteger(teamId) || !b.subscription?.keys?.p256dh || !b.subscription?.keys?.auth) return json(400, { error: "bad_request", message: "Pick your team." });
    let teams;
    try { teams = (await espn(leagueId, season, ["mTeam"])).teams || []; } catch { return json(502, { error: "upstream", message: "Couldn't reach ESPN to check the league." }); }
    if (!teams.some((t) => t.id === teamId)) return json(400, { error: "bad_request", message: "That team isn't in this league." });
    if (!existing && (await allSubs()).length >= MAX_SUBS) return json(429, { error: "full", message: "Too many devices are signed up." });
    const prefs = Object.fromEntries(PREFS.map((k) => [k, b.prefs?.[k] !== false]));
    const device = /^[\w-]{8,64}$/.test(String(b.device || "")) ? String(b.device) : existing?.device || null;
    const sub = {
      subscription: { endpoint, keys: { p256dh: String(b.subscription.keys.p256dh), auth: String(b.subscription.keys.auth) } },
      leagueId, season, teamId, prefs, device, label: deviceLabel(req.headers.get("user-agent") || ""),
      owner: existing?.owner && existing.teamId === teamId ? true : false, // set by the owner sign-in (roster.mjs)
      created: existing?.created || Date.now(), updated: Date.now(),
    };
    await s.setJSON(key, sub);
    // This browser signed up before under another push address (it changes after a reinstall or a
    // cleared app): drop the old copy so alerts don't arrive twice.
    if (device) for (const o of await allSubs()) if (o.key !== key && o.leagueId === leagueId && o.device === device) await s.delete(o.key).catch(() => {});
    return json(200, { subscribed: true, teamId, prefs, owner: sub.owner });
  }
  // Other sign-ups getting the same team's alerts in this league (other devices, or old copies of this one).
  const others = async (teamId) => (await allSubs()).filter((o) => o.key !== key && o.leagueId === leagueId && String(o.teamId) === String(teamId));
  if (action === "status") {
    return json(200, existing ? { subscribed: true, teamId: existing.teamId, prefs: existing.prefs, owner: !!existing.owner, others: (await others(existing.teamId)).length } : { subscribed: false });
  }
  if (action === "solo") {
    if (!existing) return json(404, { error: "not_subscribed", message: "Turn notifications on first." });
    const list = await others(existing.teamId);
    for (const o of list) await s.delete(o.key).catch(() => {});
    return json(200, { removed: list.length });
  }
  if (action === "test") {
    if (!existing) return json(404, { error: "not_subscribed", message: "Turn notifications on first." });
    let leagueName = "";
    try { leagueName = (await espn(leagueId, season, ["mSettings"])).settings?.name || ""; } catch { /* plain title */ }
    // Same layout as real alerts: league name on top, the message underneath.
    const ok = await sendPush({ ...existing, key }, { title: leagueName || "🏈 Notifications are on", body: `${leagueName ? "🏈 Notifications are on\n" : ""}You'll get alerts for your team here.`, url: `/?league=${leagueId}&tab=roster`, tag: "test" });
    return ok ? json(200, { sent: true }) : json(502, { error: "push_failed", message: "The push service didn't accept the test. Try turning notifications off and on." });
  }
  if (action === "unsubscribe") {
    await s.delete(key);
    return json(200, { subscribed: false });
  }
  return json(404, { error: "not_found" });
};

export const config = { path: "/api/push/:action" };
