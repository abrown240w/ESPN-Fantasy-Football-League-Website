// Push notification watcher. Runs every minute; most minutes it only reads the saved NFL schedule and
// stops. Each person only hears about their own team, and only the kinds of alerts they left on:
//   td / big / bonus   while games are live (every minute): touchdowns (with the play's points), 15+ point
//                      plays, yardage bonuses. One play = one notification.
//   injury             every 30 minutes: a rostered player's status changes (Active → Questionable, …)
//   trade              every 10 minutes: a trade involving your team is accepted
//   waiver             every 10 minutes: once a waiver run finishes, one summary of what you got
//                      (missed claims only for the site owner: other teams' failed claims are private)
//   lineup             Sundays at 10:30 Central: bench players projected to outscore your starters
//   adds               every 10 minutes: another team in your league picks up or drops a player
//                      (free-agent moves one at a time; a waiver run as one summary)
// The first time it sees a league it just records the current state, so nothing old is announced.

import { store, allSubs, sendPush, espn, playerNames } from "../lib/push-common.mjs";

const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
const SITE = () => process.env.URL || "https://brownleague.netlify.app";
const POS = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "D/ST" };
const SLOT = { 0: "QB", 2: "RB", 3: "RB/WR", 4: "WR", 5: "WR/TE", 6: "TE", 7: "OP", 16: "D/ST", 17: "K", 20: "Bench", 21: "IR", 23: "FLEX" };
const FLEX = new Set([3, 5, 7, 23]);
const BENCH = 20, IR = 21;
const TD_KIND = { 4: [3, "passing TD"], 25: [24, "rushing TD"], 43: [42, "receiving TD"], 63: [null, "Fumble recovery TD"],
  93: [null, "Blocked kick return TD"], 101: [null, "Kickoff return TD"], 102: [null, "Punt return TD"], 103: [null, "Interception return TD"], 104: [null, "Fumble return TD"] };
const TD_STATS = Object.keys(TD_KIND).map(Number);
const BONUSES = [[17, 3, 300, "300-yd passing bonus"], [18, 3, 400, "400-yd passing bonus"], [37, 24, 100, "100-yd rushing bonus"],
  [38, 24, 200, "200-yd rushing bonus"], [56, 42, 100, "100-yd receiving bonus"], [57, 42, 200, "200-yd receiving bonus"]];
const INJ = { ACTIVE: "Active", NORMAL: "Active", QUESTIONABLE: "Questionable", DOUBTFUL: "Doubtful", OUT: "Out", INJURY_RESERVE: "Injured reserve", SUSPENSION: "Suspended", DAY_TO_DAY: "Day-to-day" };
const WONT_PLAY = /OUT|INJURY_RESERVE|SUSPENSION/;
const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
const short = (name = "") => { const p = name.split(" "); return /D\/ST$/.test(name) || p.length < 2 ? name : `${p[0][0]}. ${p.slice(1).join(" ")}`; };
const keepLast = (arr, n = 400) => arr.slice(-n);

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (fantasy-dashboard)", ...headers } });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}
// This week's NFL games: [{ id, date, state }].
async function loadSchedule() {
  const sb = await getJson(SCOREBOARD);
  return { at: Date.now(), games: (sb.events || []).map((e) => ({ id: e.id, date: Date.parse(e.date), state: e.competitions?.[0]?.status?.type?.state || "pre" })) };
}
function chicagoNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { day: p.weekday, hour: Number(p.hour), minute: Number(p.minute) };
}

// ---- Live scoring: touchdowns, big plays, bonuses ----
async function liveAlerts(lid, season, st, teams, out) {
  const L = await getJson(`${SITE()}/api/live?leagueId=${lid}&season=${season}&scoringPeriodId=${st.sp}&t=${Math.floor(Date.now() / 60e3)}`);
  const items = st.scoring || [];
  const paid = new Set(items.map((i) => i.statId));
  const ptsFor = (statId, delta, p) => {
    const it = items.find((i) => i.statId === statId);
    return it ? delta * (it.pointsOverrides?.[p.posId === 16 ? 16 : p.slotId] ?? it.points) : 0;
  };
  const n = (s, id) => Number(s?.[id] || 0);
  const prev = st.live?.sp === st.sp ? st.live.players : null;
  const snap = {};
  const events = [];
  for (const p of L.players || []) {
    if (!teams.has(String(p.teamId)) || p.slotId == null || p.slotId === BENCH || p.slotId === IR) continue;
    snap[p.id] = { pts: p.pts ?? 0, stats: p.stats || {} };
    const o = prev?.[p.id];
    if (!o) continue;
    const kinds = new Set(), why = [], tds = [];
    for (const id of TD_STATS) {
      const k = n(p.stats, id) - n(o.stats, id);
      if (k <= 0) continue;
      const [yd, label] = TD_KIND[id], yds = yd != null ? n(p.stats, yd) - n(o.stats, yd) : 0;
      kinds.add("td"); tds.push(id);
      why.push(`${k > 1 ? `${k} ` : ""}${yd != null && k === 1 && yds > 0 ? `${yds}-yd ${label}` : yd != null ? label[0].toUpperCase() + label.slice(1) + (k > 1 ? "s" : "") : label}`);
    }
    for (const [sid, stat, at, label] of BONUSES) if (paid.has(sid) && n(o.stats, stat) < at && n(p.stats, stat) >= at) { kinds.add("bonus"); why.push(label); }
    let gain = (p.pts ?? 0) - (o.pts ?? 0);
    if (items.length && p.posId !== 16) {
      gain = 0;
      for (const id of new Set([...Object.keys(p.stats || {}), ...Object.keys(o.stats || {})].map(Number))) if (![120, 127].includes(id)) gain += ptsFor(id, n(p.stats, id) - n(o.stats, id), p);
      for (const [sid, stat, at] of BONUSES) if (paid.has(sid) && n(o.stats, stat) < at && n(p.stats, stat) >= at) gain += ptsFor(sid, 1, p);
    }
    gain = Math.round(gain * 10) / 10;
    if (gain >= 15) { kinds.add("big"); if (!why.length) why.push("Big play"); }
    if (!kinds.size) continue;
    const game = (L.games || []).find((g) => g.home?.proId === p.proId || g.away?.proId === p.proId);
    events.push({ p, kinds, why, gain, pass: tds.includes(4), catch: tds.includes(43), game });
  }
  st.live = { sp: st.sp, players: snap };
  if (!prev) return; // first look at this week: nothing to compare yet
  // A TD pass and the catch that scored it (same fantasy team) become one notification.
  for (const qb of events.filter((e) => e.pass)) {
    const rec = events.find((e) => e.catch && !e.merged && e !== qb && e.p.proId === qb.p.proId && e.p.teamId === qb.p.teamId);
    if (rec) { rec.merged = true; qb.with = rec; }
  }
  for (const e of events.filter((x) => !x.merged)) {
    const group = e.with ? [e, e.with] : [e];
    const kinds = [...new Set(group.flatMap((x) => [...x.kinds]))];
    const icon = kinds.includes("td") ? "🏈" : kinds.includes("bonus") ? "💰" : "⚡";
    const reasons = [...new Set(group.flatMap((x, i) => x.why.filter((w) => !(i > 0 && /receiving TD/.test(w)))))];
    const who = group.map((x) => `${group.length > 1 ? short(x.p.name) : x.p.name} +${f1(x.gain)} (${f1(x.p.pts ?? 0)})`).join(" · ");
    out.push({
      teamId: String(e.p.teamId), kinds, tag: `play-${e.p.id}-${Date.now()}`,
      title: `${icon} ${reasons.join(" · ")}`,
      body: group.length > 1 ? who : `${e.p.name} ${POS[e.p.posId] || ""} · +${f1(e.gain)} pts, now ${f1(e.p.pts ?? 0)}`,
      url: `/?league=${lid}&tab=live${e.game ? `&game=${e.game.id}` : ""}`,
    });
  }
}

// ---- Injury status changes ----
async function injuryAlerts(lid, season, st, teams, out) {
  const data = await espn(lid, season, ["mRoster"]);
  const now = {};
  const changes = [];
  for (const t of data.teams || []) {
    if (!teams.has(String(t.id))) continue;
    for (const e of t.roster?.entries || []) {
      const pl = e.playerPoolEntry?.player || {};
      const status = pl.injuryStatus && INJ[pl.injuryStatus] ? pl.injuryStatus : "ACTIVE";
      now[e.playerId] = status;
      const was = st.inj?.[e.playerId];
      if (was && INJ[was] !== INJ[status]) changes.push({ teamId: String(t.id), name: pl.fullName, posId: pl.defaultPositionId, slot: e.lineupSlotId, was, status });
    }
  }
  const first = !st.inj;
  st.inj = now;
  if (first) return;
  for (const c of changes) {
    const better = c.status === "ACTIVE";
    out.push({
      teamId: c.teamId, kinds: ["injury"], tag: `inj-${c.name}`,
      title: `${better ? "✅" : "🩺"} ${c.name} · ${INJ[c.status]}`,
      body: `${POS[c.posId] || ""} · ${SLOT[c.slot] || "Roster"} · was ${INJ[c.was]}${!better && c.slot !== BENCH && c.slot !== IR ? ". He's in your starting lineup." : ""}`,
      url: `/?league=${lid}&tab=roster`,
    });
  }
}

// ---- Accepted trades and finished waiver runs ----
async function transactionAlerts(lid, season, st, teams, out) {
  const pages = await Promise.all([...new Set([st.sp, Math.max(1, st.sp - 1)])].map((sp) => espn(lid, season, ["mTransactions2"], sp).catch(() => ({}))));
  const byId = new Map();
  for (const pg of pages) for (const t of pg.transactions || []) byId.set(t.id, t);
  const all = [...byId.values()];
  const first = !st.seenTrades;
  const seenTrades = new Set(st.seenTrades || []), seenWaivers = new Set(st.seenWaivers || []), seenMoves = new Set(st.seenMoves || []);
  const faMoves = all.filter((t) => t.type === "FREEAGENT" && t.status === "EXECUTED" && !seenMoves.has(t.id));
  for (const t of faMoves) seenMoves.add(t.id);
  const proposalOf = (t) => { let id = t.relatedTransactionId || t.id; for (let i = 0; i < 5; i++) { const r = byId.get(id); if (!r || r.type !== "TRADE_ACCEPT") return id; id = r.relatedTransactionId; } return id; };

  // Trades: the first time we see one accepted (or processed), tell both teams.
  const trades = [];
  for (const t of all) {
    const accepted = t.type === "TRADE_ACCEPT" || (t.type === "TRADE_PROPOSAL" && t.status === "EXECUTED");
    if (!accepted) continue;
    const pid = proposalOf(t);
    if (seenTrades.has(pid)) continue;
    seenTrades.add(pid);
    const src = (t.items || []).length ? t : byId.get(pid) || t;
    trades.push({ items: (src.items || []).filter((i) => i.type === "TRADE"), processed: t.status === "EXECUTED" });
  }
  // Waivers: report a run once it has finished (nothing new for 5 minutes).
  // Only claims ESPN actually ran: won (EXECUTED) or missed (FAILED_*). Canceled claims aren't reported.
  const fresh = all.filter((t) => t.type === "WAIVER" && t.executionType !== "CANCEL" && (t.status === "EXECUTED" || /^FAIL/.test(t.status || "")) && !seenWaivers.has(t.id));
  const lastProcessed = Math.max(0, ...fresh.map((t) => t.processDate || t.proposedDate || 0));
  const waiverReady = fresh.length && Date.now() - lastProcessed > 5 * 60e3;
  if (waiverReady || first) for (const t of fresh) seenWaivers.add(t.id);
  st.seenTrades = keepLast([...seenTrades]);
  st.seenWaivers = keepLast([...seenWaivers]);
  st.seenMoves = keepLast([...seenMoves]);
  if (first) return;

  const ids = [...new Set([...trades.flatMap((x) => x.items.map((i) => i.playerId)), ...(waiverReady ? fresh.flatMap((t) => (t.items || []).map((i) => i.playerId)) : []),
    ...faMoves.flatMap((t) => (t.items || []).map((i) => i.playerId))])];
  const names = await playerNames(season, ids);
  const nm = (id) => names[id]?.[0] || "a player";
  const teamName = (id) => st.teamNames?.[id] || `Team ${id}`;
  // Adds & drops by other teams: league-wide, sent to everyone except the team that made the move.
  for (const t of faMoves) {
    const adds = (t.items || []).filter((i) => i.type === "ADD").map((i) => nm(i.playerId)), drops = (t.items || []).filter((i) => i.type === "DROP").map((i) => nm(i.playerId));
    if (!adds.length && !drops.length) continue;
    out.push({
      league: true, actor: String(t.teamId), kinds: ["adds"], tag: `move-${t.id}`,
      title: `📥 ${teamName(t.teamId)}`,
      body: [adds.length ? `Added ${adds.join(", ")}` : "", drops.length ? `dropped ${drops.join(", ")}` : ""].filter(Boolean).join(", "),
      url: `/?league=${lid}&tab=transactions`,
    });
  }
  for (const tr of trades) {
    const sides = [...new Set(tr.items.flatMap((i) => [i.fromTeamId, i.toTeamId]))].map(String);
    for (const team of sides) {
      if (!teams.has(team)) continue;
      const get = tr.items.filter((i) => String(i.toTeamId) === team).map((i) => nm(i.playerId));
      const send = tr.items.filter((i) => String(i.fromTeamId) === team).map((i) => nm(i.playerId));
      out.push({
        teamId: team, kinds: ["trade"], tag: `trade-${Date.now()}`,
        title: tr.processed ? "🤝 Trade processed" : "🤝 Trade accepted",
        body: `You get ${get.join(", ") || "–"} · you send ${send.join(", ") || "–"}${tr.processed ? "" : ". It goes through after the league's review period."}`,
        url: `/?league=${lid}&tab=transactions`,
      });
    }
  }
  if (!waiverReady) return;
  // The waiver run for the whole league, as one summary (successful claims are public).
  const wonAll = fresh.filter((t) => t.status === "EXECUTED");
  if (wonAll.length) {
    const lines = wonAll.map((t) => { const add = (t.items || []).find((i) => i.type === "ADD"); return `${teamName(t.teamId)}: ${add ? nm(add.playerId) : "a player"}`; });
    out.push({ league: true, actor: "", actors: wonAll.map((t) => String(t.teamId)), kinds: ["adds"], tag: `waiver-run-${lastProcessed}`,
      title: "📥 Waiver claims processed", body: lines.join(" · "), url: `/?league=${lid}&tab=transactions&waivers=${lastProcessed}` });
  }
  const byTeam = {};
  for (const t of fresh) (byTeam[t.teamId] ||= []).push(t);
  for (const [team, list] of Object.entries(byTeam)) {
    if (!teams.has(String(team))) continue;
    const won = list.filter((t) => t.status === "EXECUTED"), lost = list.filter((t) => t.status !== "EXECUTED");
    const line = (t) => { const add = (t.items || []).find((i) => i.type === "ADD"), drop = (t.items || []).find((i) => i.type === "DROP"); return `${add ? nm(add.playerId) : "a player"}${drop ? ` (dropped ${nm(drop.playerId)})` : ""}`; };
    const got = won.length ? `✓ Got ${won.map(line).join(", ")}` : "";
    const missed = lost.length ? `✗ Missed ${lost.map(line).join(", ")}` : "";
    out.push({
      teamId: String(team), kinds: ["waiver"], tag: `waivers-${lastProcessed}`, title: "📋 Waivers processed",
      body: [got, missed].filter(Boolean).join(" · "),
      publicBody: got || null, // league-mates' failed claims are private: only the owner sees misses
      url: `/?league=${lid}&tab=transactions&waivers=${lastProcessed}`,
    });
  }
}

// ---- Sunday start/bench check (10:30 Central) ----
async function lineupAlerts(lid, season, st, teams, out) {
  const data = await espn(lid, season, ["mRoster", "mSettings"], st.sp);
  const counts = data.settings?.rosterSettings?.lineupSlotCounts || {};
  for (const t of data.teams || []) {
    if (!teams.has(String(t.id))) continue;
    const players = (t.roster?.entries || []).map((e) => {
      const pl = e.playerPoolEntry?.player || {};
      const prj = (pl.stats || []).find((s) => s.scoringPeriodId === st.sp && s.statSourceId === 1 && (s.statSplitTypeId ?? 1) === 1);
      return { id: e.playerId, name: pl.fullName, slot: e.lineupSlotId, elig: pl.eligibleSlots || [], locked: !!e.playerPoolEntry?.lineupLocked,
        proj: WONT_PLAY.test(pl.injuryStatus || "") ? 0 : prj?.appliedTotal || 0 };
    });
    const left = { ...counts };
    for (const p of players) if (p.locked && p.slot !== BENCH && p.slot !== IR) left[p.slot] = Math.max(0, (left[p.slot] || 0) - 1);
    const pool = players.filter((p) => !p.locked && p.slot !== IR).sort((a, b) => b.proj - a.proj);
    const slots = Object.keys(left).map(Number).filter((id) => id !== BENCH && id !== IR && id < 24 && left[id] > 0).sort((a, b) => FLEX.has(a) - FLEX.has(b) || (a === 7) - (b === 7));
    const used = new Set();
    for (const slot of slots) for (let i = 0; i < left[slot]; i++) { const p = pool.find((x) => !used.has(x.id) && x.elig.includes(slot)); if (p) used.add(p.id); }
    const current = pool.filter((p) => p.slot !== BENCH);
    const gain = pool.filter((p) => used.has(p.id)).reduce((a, p) => a + p.proj, 0) - current.reduce((a, p) => a + p.proj, 0);
    if (gain < 1) continue;
    const ins = pool.filter((p) => used.has(p.id) && p.slot === BENCH).sort((a, b) => b.proj - a.proj);
    const outs = current.filter((p) => !used.has(p.id)).sort((a, b) => a.proj - b.proj);
    const swaps = ins.slice(0, 3).map((p, i) => (outs[i] ? `Start ${short(p.name)} (${f1(p.proj)}) over ${short(outs[i].name)} (${f1(outs[i].proj)})` : `Start ${short(p.name)} (${f1(p.proj)})`));
    out.push({
      teamId: String(t.id), kinds: ["lineup"], tag: `lineup-${st.sp}`,
      title: `📋 Lineup check: +${f1(gain)} pts on your bench`,
      body: swaps.join(" · "), url: `/?league=${lid}&tab=roster`,
    });
  }
}

export default async () => {
  const s = store();
  const now = Date.now(), minute = new Date(now).getUTCMinutes();
  // NFL schedule: refreshed every 15 minutes, or every minute while a game is on or about to start.
  let sched = await s.get("sched", { type: "json" }).catch(() => null);
  const near = (x) => x?.games?.some((g) => g.state === "in" || (g.state === "pre" && now >= g.date - 3 * 60e3 && now <= g.date + 6 * 3600e3));
  if (!sched || now - sched.at > 15 * 60e3 || near(sched)) {
    try { sched = await loadSchedule(); await s.setJSON("sched", sched); } catch { /* keep the old copy */ }
  }
  const live = !!sched?.games?.some((g) => g.state === "in");
  const ct = chicagoNow();
  const lineupTime = ct.day === "Sun" && ct.hour === 10 && ct.minute >= 30 && ct.minute < 45;
  const doInjuries = minute % 30 === 0, doTx = minute % 10 === 0;
  if (!live && !doInjuries && !doTx && !lineupTime) return;

  const subs = await allSubs();
  if (!subs.length) return;
  const leagues = {};
  for (const sub of subs) (leagues[`${sub.leagueId}:${sub.season}`] ||= []).push(sub);

  for (const [lk, list] of Object.entries(leagues)) {
    const [lid, season] = lk.split(":");
    const teams = new Set(list.map((x) => String(x.teamId)));
    const st = (await s.get(`state:${lid}`, { type: "json" }).catch(() => null)) || {};
    const out = [];
    try {
      if (!st.sp || st.season !== season || now - (st.spAt || 0) > 3600e3 || !st.teamNames || !st.leagueName) {
        const info = await espn(lid, season, ["mStatus", "mSettings", "mTeam"]);
        st.teamNames = Object.fromEntries((info.teams || []).map((t) => [t.id, t.name || [t.location, t.nickname].filter(Boolean).join(" ") || t.abbrev || `Team ${t.id}`]));
        st.leagueName = info.settings?.name || "";
        st.sp = info.scoringPeriodId || info.status?.latestScoringPeriod || 1;
        st.scoring = (info.settings?.scoringSettings?.scoringItems || []).map((i) => ({ statId: i.statId, points: i.points, ...(i.pointsOverrides ? { pointsOverrides: i.pointsOverrides } : {}) }));
        st.season = season; st.spAt = now;
      }
      if (live) await liveAlerts(lid, season, st, teams, out).catch((e) => console.log(JSON.stringify({ event: "watch_live_error", lid, message: e.message })));
      if (doInjuries || !st.inj) await injuryAlerts(lid, season, st, teams, out).catch((e) => console.log(JSON.stringify({ event: "watch_injury_error", lid, message: e.message })));
      if (doTx || !st.seenTrades) await transactionAlerts(lid, season, st, teams, out).catch((e) => console.log(JSON.stringify({ event: "watch_tx_error", lid, message: e.message })));
      if (lineupTime && st.lineupWeek !== st.sp) {
        await lineupAlerts(lid, season, st, teams, out).catch((e) => console.log(JSON.stringify({ event: "watch_lineup_error", lid, message: e.message })));
        st.lineupWeek = st.sp;
      }
    } finally {
      await s.setJSON(`state:${lid}`, st);
    }
    // Deliver: your team only, the kinds you left on, private details only for the owner.
    for (const n of out) {
      for (const sub of list) {
        if (!n.kinds.some((k) => sub.prefs?.[k] !== false)) continue;
        if (n.league ? String(sub.teamId) === n.actor : String(sub.teamId) !== n.teamId) continue;
        const body = n.publicBody !== undefined && !sub.owner ? n.publicBody : n.body;
        if (!body) continue;
        // The league name is the bold first line; the alert and its details go underneath.
        await sendPush(sub, st.leagueName ? { title: st.leagueName, body: `${n.title}\n${body}`, url: n.url, tag: n.tag } : { title: n.title, body, url: n.url, tag: n.tag });
      }
    }
    if (out.length) console.log(JSON.stringify({ event: "watch_sent", lid, alerts: out.length, kinds: [...new Set(out.flatMap((n) => n.kinds))] }));
  }
};

export const config = { schedule: "* * * * *" };
