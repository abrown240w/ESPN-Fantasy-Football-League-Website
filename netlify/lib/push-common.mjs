// Shared pieces for push notifications (netlify/functions/push.mjs, push-watch.mjs, roster.mjs).
//
// Storage (Netlify Blobs, store "push"):
//   vapid                    the site's web-push key pair (made on first use, never leaves the server)
//   sub:<hash>:<leagueId>    one device's subscription for one league: { subscription, leagueId, season,
//                            teamId, prefs, owner, created }
//   state:<leagueId>         what the watcher saw last time (scores, injuries, transactions)
//   sched                    this week's NFL games and their state

import { getStore } from "@netlify/blobs";
import webpush from "web-push";
import { createHash } from "node:crypto";

export const PREFS = ["injury", "td", "big", "bonus", "lineup", "trade", "waiver"];
export const READS = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl";
export const store = () => getStore({ name: "push", consistency: "strong" });
export const subKey = (endpoint, leagueId) => `sub:${createHash("sha256").update(endpoint).digest("hex").slice(0, 32)}:${leagueId}`;
export const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
export function defaultSeason() {
  const now = new Date();
  return now.getUTCMonth() < 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
}

// The site's web-push keys: created the first time they're needed and kept in Blobs.
let keys = null;
export async function vapid() {
  if (keys) return keys;
  const s = store();
  keys = await s.get("vapid", { type: "json" });
  if (!keys) { keys = webpush.generateVAPIDKeys(); await s.setJSON("vapid", keys); }
  return keys;
}

// Send one notification. Subscriptions the push service says are gone are deleted.
export async function sendPush(sub, payload) {
  const k = await vapid();
  webpush.setVapidDetails(process.env.URL || "https://brownleague.netlify.app", k.publicKey, k.privateKey);
  try {
    await webpush.sendNotification(sub.subscription, JSON.stringify(payload), { TTL: 3 * 3600, urgency: "high" });
    return true;
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) await store().delete(sub.key).catch(() => {});
    console.log(JSON.stringify({ event: "push_failed", status: e.statusCode || null, league: sub.leagueId }));
    return false;
  }
}

export async function allSubs() {
  const s = store();
  const { blobs } = await s.list({ prefix: "sub:" });
  const subs = await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" }).then((v) => (v ? { ...v, key: b.key } : null)).catch(() => null)));
  return subs.filter(Boolean);
}

// ESPN fantasy API with the saved sign-in.
export async function espn(leagueId, season, views, sp, filter) {
  const u = new URL(`${READS}/seasons/${season}/segments/0/leagues/${leagueId}`);
  for (const v of views) u.searchParams.append("view", v);
  if (sp) u.searchParams.set("scoringPeriodId", sp);
  const headers = { accept: "application/json", "user-agent": "Mozilla/5.0 (fantasy-dashboard)" };
  if (process.env.ESPN_S2 && process.env.SWID) headers.cookie = `espn_s2=${process.env.ESPN_S2}; SWID=${process.env.SWID}`;
  if (filter) headers["x-fantasy-filter"] = JSON.stringify(filter);
  const res = await fetch(u, { headers });
  if (!res.ok) throw new Error(`ESPN returned ${res.status}`);
  return res.json();
}
// Player names by id: { id: [name, positionId, proTeamId] }.
export async function playerNames(season, ids) {
  if (!ids.length) return {};
  const res = await fetch(`${READS}/seasons/${season}/players?scoringPeriodId=0&view=players_wl`, {
    headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (fantasy-dashboard)", "x-fantasy-filter": JSON.stringify({ filterIds: { value: ids } }) },
  });
  const out = {};
  for (const p of (await res.json().catch(() => [])) || []) out[p.id] = [p.fullName, p.defaultPositionId, p.proTeamId];
  return out;
}
