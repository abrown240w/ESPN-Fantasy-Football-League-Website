// ESPN Fantasy Football weekly breakdown.
// Talks to /api/espn (a Netlify function) which proxies ESPN's fantasy API.

// ---------- ESPN ID maps ----------
const SLOT = { 0: "QB", 1: "TQB", 2: "RB", 3: "RB/WR", 4: "WR", 5: "WR/TE", 6: "TE", 7: "OP", 8: "DT", 9: "DE", 10: "LB", 11: "DL", 12: "CB", 13: "S", 14: "DB", 15: "DP", 16: "D/ST", 17: "K", 18: "P", 19: "HC", 20: "BE", 21: "IR", 23: "FLEX", 24: "ER" };
const POS = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 7: "P", 9: "DT", 10: "DE", 11: "LB", 12: "CB", 13: "S", 14: "HC", 16: "D/ST" };
const PRO = { 0: "FA", 1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET", 9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA", 16: "MIN", 17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC", 25: "SF", 26: "SEA", 27: "TB", 28: "WSH", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU" };
// Order starters are displayed in; flex-type slots come after fixed positions.
const SLOT_DISPLAY = [0, 1, 2, 4, 6, 3, 5, 23, 7, 8, 9, 10, 11, 12, 13, 14, 15, 24, 16, 17, 18, 19];
const FLEX_SLOTS = new Set([3, 5, 23, 7, 11, 14, 15]);
const BENCH = 20, IR = 21;
const POS_ORDER = ["QB", "RB", "WR", "TE", "K", "D/ST"];

// Leagues in the header dropdown. The first one is the default.
const LEAGUES = [
  { id: "489824289", label: "Brown League" },
  { id: "253026401", label: "Church League" },
  { id: "1001176763", label: "Work League" },
];

// ---------- State ----------
const params = new URLSearchParams(location.search);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};
const state = {
  demo: params.has("demo"),
  // Only the leagues in LEAGUES can be opened; anything else falls back to the default.
  leagueId: [params.get("league"), store.get("ffb.league")].find((id) => LEAGUES.some((l) => l.id === id)) || "",
  season: params.get("season") || store.get("ffb.season") || "",
  tab: store.get("ffb.tab") || "roster",
  base: null,
  week: null,
  weekCache: {},
  openMatchup: null,
  players: {
    view: "fa", q: "", pos: "ALL", team: "ALL", role: "starters", rSort: { key: "pts", dir: -1 },
    faQ: "", faPos: "ALL", faStatus: "all", faSort: { key: "own", dir: -1 },
    allQ: "", allPos: "ALL", allSort: { key: "proj", dir: -1 }, utTeam: "", utMode: "snap",
  },
  managers: { sort: { key: "score", dir: -1 } },
  standings: { sort: { key: "rank", dir: 1 } },
  activity: null,
  txFilter: { team: "ALL", kind: "all" },
  live: null,
  liveFilter: { show: "rostered", team: "ALL" },
  livePrev: {},
  liveBumps: {},
  liveTimer: null,
  history: null,
  historySel: "all",
  historySort: { key: "titles", dir: -1 },
  seasonSort: { key: "finish", dir: 1 },
};
const $ = (id) => document.getElementById(id);

// ---------- Helpers ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const f1 = (n) => (n == null || isNaN(n) ? "–" : Number(n).toFixed(1));
const f2 = (n) => (n == null || isNaN(n) ? "–" : Number(n).toFixed(2));
const signed = (n, d = 1) => (n == null || isNaN(n) ? "–" : (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(d));
const sum = (arr, fn = (x) => x) => arr.reduce((s, x) => s + (fn(x) || 0), 0);
const pct = (n) => `${Math.round(n * 100)}%`;
const clsSign = (n) => (n > 0.05 ? "pos" : n < -0.05 ? "neg" : "");

function normCdf(z) {
  // Abramowitz–Stegun approximation of the standard normal CDF.
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

class ApiError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

async function api(views, scoringPeriodId, season = state.season) {
  if (state.demo) return window.DemoLeague.response(views, scoringPeriodId, season);
  const q = new URLSearchParams();
  views.forEach((v) => q.append("view", v));
  if (scoringPeriodId) q.set("scoringPeriodId", scoringPeriodId);
  if (state.leagueId) q.set("leagueId", state.leagueId);
  if (season) q.set("season", season);
  let res, body;
  try {
    res = await fetch(`/api/espn?${q}`);
    body = await res.json();
  } catch {
    throw new ApiError("no_function", "Couldn't reach the data function. If you're opening the files directly, deploy to Netlify (or run `netlify dev`) so /api/espn exists.");
  }
  if (!res.ok) throw new ApiError(body.error, body.message || `Request failed (${res.status})`);
  return body;
}

// NFL opponents and opponent ranks for a scoring period. Optional: the site works without it.
async function loadNfl(sp) {
  if (state.demo) return window.DemoLeague.nfl(sp);
  const q = new URLSearchParams({ scoringPeriodId: sp });
  if (state.leagueId) q.set("leagueId", state.leagueId);
  if (state.season) q.set("season", state.season);
  try {
    const res = await fetch(`/api/nfl?${q}`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// ---------- Data model ----------
function logoUrl(url) {
  if (!/^https:\/\//.test(url || "")) return "";
  // Custom uploads need an ESPN sign-in, so they go through our /api/logo proxy.
  const custom = url.match(/^https:\/\/mystique-api\.fantasy\.espn\.com\/apis\/v1\/domains\/lm\/images\/([0-9a-f-]{36})$/i);
  return custom && !state.demo ? `/api/logo?id=${custom[1]}` : url;
}

function buildBase(raw) {
  const members = Object.fromEntries((raw.members || []).map((m) => [m.id, m]));
  const teams = {};
  for (const t of raw.teams || []) {
    const m = members[t.primaryOwner || (t.owners || [])[0]];
    const owner = m ? ([m.firstName, m.lastName].filter(Boolean).join(" ") || m.displayName) : "";
    const rec = t.record?.overall || {};
    teams[t.id] = {
      id: t.id,
      name: (t.name || [t.location, t.nickname].filter(Boolean).join(" ")).trim() || `Team ${t.id}`,
      abbrev: t.abbrev || "",
      logo: logoUrl(t.logo),
      owner,
      seed: t.playoffSeed || 99,
      wins: rec.wins || 0, losses: rec.losses || 0, ties: rec.ties || 0,
      pf: rec.pointsFor || 0, pa: rec.pointsAgainst || 0,
    };
  }
  const settings = raw.settings || {};
  const schedule = raw.schedule || [];
  const regWeeks = settings.scheduleSettings?.matchupPeriodCount || 0;
  const weeks = Math.max(regWeeks, ...schedule.map((m) => m.matchupPeriodId || 0));
  const current = Math.min(Math.max(raw.status?.currentMatchupPeriod || 1, 1), weeks || 1);
  const periods = settings.scheduleSettings?.matchupPeriods || {};
  // League format for FantasyCalc values: nearest supported size and PPR, superflex if 2 QBs can start.
  const nearest = (n, opts) => opts.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));
  const slots = settings.rosterSettings?.lineupSlotCounts || {};
  const recPts = (settings.scoringSettings?.scoringItems || []).find((i) => i.statId === 53)?.points ?? 1;
  const format = {
    numTeams: String(nearest(settings.size || Object.keys(teams).length || 12, [8, 10, 12, 14])),
    ppr: String(nearest(recPts, [0, 0.5, 1])),
    numQbs: (slots[7] || 0) > 0 || (slots[0] || 0) >= 2 ? "2" : "1",
  };
  return {
    format,
    raw, teams, schedule, weeks, current, regWeeks: regWeeks || weeks,
    name: settings.name || "ESPN League",
    season: raw.seasonId,
    previousSeasons: [...(raw.status?.previousSeasons || [])].sort((a, b) => b - a),
    slotCounts: settings.rosterSettings?.lineupSlotCounts || {},
    scoringPeriodFor: (wk) => { const p = periods[wk]; return p && p.length ? p[p.length - 1] : wk; },
  };
}

function statLine(posId, s) {
  if (!s) return "";
  const parts = [];
  const add = (id, label) => { if (s[id] != null && s[id] !== 0) parts.push(`${Math.round(s[id])} ${label}`); };
  if (posId === 1) { add(3, "pass yds"); add(4, "pass TD"); add(20, "INT"); add(24, "rush yds"); add(25, "rush TD"); }
  else if (posId === 2) { add(24, "rush yds"); add(25, "rush TD"); add(53, "rec"); add(42, "rec yds"); add(43, "rec TD"); }
  else if (posId === 3 || posId === 4) { add(53, "rec"); add(58, "tgt"); add(42, "yds"); add(43, "TD"); add(24, "rush yds"); }
  return parts.join(", ");
}

// This week's NFL opponent and how tough that defense is against the player's position.
function computeOpp(nfl, posId, proId, sp) {
  if (!nfl?.games || !proId) return null;
  const g = nfl.games[proId];
  if (g) {
    const [rank, avg] = nfl.oprk?.[posId]?.[g[0]] || [];
    return { team: PRO[g[0]] || "", home: g[1], rank, avg };
  }
  return nfl.byes?.[proId] === sp ? { bye: true } : null;
}

// ESPN-app style stat line for tight spaces: "307 YDS, 2 TD", "3 REC, 27 YDS", "1/1 FG, 2/2 XP", "FR, 10 PA".
function compactLine(posId, s) {
  if (!s) return "";
  const n = (id) => Math.round(s[id] || 0);
  const count = (k, label) => (k > 1 ? `${k} ${label}` : k === 1 ? label : "");
  if (posId === 5) return `${n(83)}/${n(84)} FG, ${n(86)}/${n(87)} XP`;
  if (posId === 16) return [s[120] != null ? `${n(120)} PA` : "", s[127] != null ? `${n(127)} YA` : "", count(n(99), "SK"), count(n(95), "INT"), count(n(96), "FR"), count(n(106), "FF")].filter(Boolean).join(", ");
  if (posId === 1) return [`${n(3)} YDS`, count(n(4) + n(25), "TD"), count(n(20), "INT")].filter(Boolean).join(", ");
  if (posId === 2) return [`${n(24)} YDS`, count(n(25) + n(43), "TD"), n(53) ? `${n(53)} REC` : ""].filter(Boolean).join(", ");
  if (posId === 3 || posId === 4) return [`${n(53)} REC`, `${n(42) + n(24)} YDS`, count(n(43) + n(25), "TD")].filter(Boolean).join(", ");
  return "";
}

function parsePlayer(entry, sp, teamId, rosterInfo = {}, nfl = null) {
  const pl = entry.playerPoolEntry?.player || entry.player || {};
  const stats = pl.stats || [];
  const forPeriod = (src) => stats.find((s) => s.scoringPeriodId === sp && s.statSourceId === src && (s.statSplitTypeId ?? 1) === 1);
  const act = forPeriod(0), prj = forPeriod(1);
  const actual = act ? act.appliedTotal : null;
  const proj = prj ? prj.appliedTotal : 0;
  const slotId = entry.lineupSlotId;
  // Box scores omit injury status and rankings, so fall back to the roster's copy.
  const info = rosterInfo[pl.id ?? entry.playerId] || {};
  const status = pl.injuryStatus ?? info.injury;
  const inj = status && status !== "ACTIVE" && status !== "NORMAL" ? status : "";
  const opp = computeOpp(nfl, pl.defaultPositionId, pl.proTeamId, sp);
  return {
    id: pl.id ?? entry.playerId,
    name: pl.fullName || "Unknown",
    posId: pl.defaultPositionId,
    pos: POS[pl.defaultPositionId] || "?",
    nfl: PRO[pl.proTeamId] || "",
    slotId, slot: SLOT[slotId] || String(slotId),
    proId: pl.proTeamId,
    starter: slotId !== BENCH && slotId !== IR,
    played: actual != null,
    actual: actual ?? 0,
    proj,
    diff: actual != null ? actual - proj : null,
    injury: inj,
    eligible: pl.eligibleSlots || [],
    line: statLine(pl.defaultPositionId, act?.stats),
    short: compactLine(pl.defaultPositionId, act?.stats),
    opp,
    pprRank: info.pprRank ?? null,
    posRank: info.posRank ?? null,
    teamId,
  };
}

// Best lineup from a roster by `score` (this week's points by default; trade value in the Trade Analyzer).
function optimalLineup(players, slotCounts, score = (p) => p.actual) {
  const slots = [];
  const ids = Object.keys(slotCounts).map(Number).filter((id) => id !== BENCH && id !== IR && slotCounts[id] > 0);
  ids.sort((a, b) => (FLEX_SLOTS.has(a) - FLEX_SLOTS.has(b)) || (a === 7) - (b === 7));
  for (const id of ids) for (let i = 0; i < slotCounts[id]; i++) slots.push(id);
  const pool = players.filter((p) => p.slotId !== IR).sort((a, b) => score(b) - score(a));
  const used = new Set(), lineup = [];
  for (const slot of slots) {
    const p = pool.find((x) => !used.has(x.id) && x.eligible.includes(slot));
    if (p) { used.add(p.id); lineup.push({ slot, p }); }
  }
  return { points: sum(lineup, (x) => score(x.p)), lineup };
}

function buildSide(side, sp, rosterByTeam, slotCounts, rosterInfo, nfl) {
  if (!side) return null;
  const entries = side.rosterForCurrentScoringPeriod?.entries || rosterByTeam[side.teamId] || [];
  const players = entries.map((e) => parsePlayer(e, sp, side.teamId, rosterInfo, nfl));
  const starters = players.filter((p) => p.starter)
    .sort((a, b) => SLOT_DISPLAY.indexOf(a.slotId) - SLOT_DISPLAY.indexOf(b.slotId));
  const bench = players.filter((p) => !p.starter).sort((a, b) => b.actual - a.actual || b.proj - a.proj);
  const score = side.totalPointsLive ?? side.totalPoints ?? sum(starters, (p) => p.actual);
  const proj = sum(starters, (p) => p.proj);
  const liveProj = side.totalProjectedPointsLive ?? sum(starters, (p) => (p.played ? p.actual : p.proj));
  const hasRoster = players.length > 0;
  const opt = hasRoster ? optimalLineup(players, slotCounts) : { points: score, lineup: [] };
  const wp = side.winProbability;
  return {
    teamId: side.teamId, players, starters, bench, score, proj, liveProj,
    espnWp: typeof wp === "number" ? (wp > 1 ? wp / 100 : wp) : null,
    optimal: Math.max(opt.points, score),
    benchLeft: Math.max(0, opt.points - score),
    efficiency: opt.points > 0 ? Math.min(1, score / opt.points) : null,
    mvp: [...starters].sort((a, b) => b.actual - a.actual)[0],
    bust: [...starters].filter((p) => p.played).sort((a, b) => a.diff - b.diff)[0],
    bestBench: bench.filter((p) => p.slotId === BENCH)[0],
    playedCount: starters.filter((p) => p.played).length,
  };
}

function buildWeek(raw, week, nfl = null) {
  const base = state.base;
  const sp = base.scoringPeriodFor(week);
  const rosterByTeam = Object.fromEntries((raw.teams || []).map((t) => [t.id, t.roster?.entries || []]));
  const rosterInfo = {};
  for (const e of Object.values(rosterByTeam).flat()) {
    const p = e.playerPoolEntry?.player;
    if (!p) continue;
    rosterInfo[p.id] = {
      // Roster injury status is today's status, so only apply it to the current and upcoming weeks.
      injury: week >= base.current ? p.injuryStatus : undefined,
      // ESPN experts' average PPR rank for this week, within the player's position.
      pprRank: (p.rankings?.[sp] || []).find((r) => r.rankType === "PPR" && r.rankSourceId === 0)?.averageRank ?? null,
      // Season rank by fantasy points, within the player's position.
      posRank: e.playerPoolEntry.ratings?.["0"]?.positionalRanking || null,
    };
  }
  const matchups = (raw.schedule || []).filter((m) => m.matchupPeriodId === week).map((m) => ({
    id: m.id,
    winner: m.winner || "UNDECIDED",
    playoff: m.playoffTierType && m.playoffTierType !== "NONE",
    tier: m.playoffTierType,
    home: buildSide(m.home, sp, rosterByTeam, base.slotCounts, rosterInfo, nfl),
    away: buildSide(m.away, sp, rosterByTeam, base.slotCounts, rosterInfo, nfl),
  }));
  const sides = matchups.flatMap((m) => [m.home, m.away]).filter(Boolean);
  const anyPlayed = sides.some((s) => s.playedCount > 0 || s.score > 0);
  const final = matchups.length > 0 && matchups.every((m) => m.winner !== "UNDECIDED");
  const status = final ? "final" : anyPlayed ? "live" : "upcoming";

  for (const m of matchups) {
    const { home, away } = m;
    if (!away) { m.wp = null; continue; }
    if (status === "final") m.wp = m.winner === "HOME" ? 1 : m.winner === "AWAY" ? 0 : 0.5;
    else if (home.espnWp != null && away.espnWp != null && home.espnWp + away.espnWp > 0) {
      // ESPN's own win probability, so the site matches the ESPN app.
      m.wp = home.espnWp / (home.espnWp + away.espnWp);
    } else if (status === "live") {
      // Fallback estimate; uncertainty shrinks as more starters finish their games.
      const total = home.starters.length + away.starters.length || 1;
      const remaining = 1 - (home.playedCount + away.playedCount) / total;
      m.wp = normCdf((home.liveProj - away.liveProj) / (45 * Math.sqrt(remaining) + 3));
    }
    else m.wp = normCdf((home.proj - away.proj) / 45);
    for (const [me, opp] of [[home, away], [away, home]]) {
      me.opp = opp;
      me.won = status === "final" ? me.score > opp.score : null;
    }
  }
  // Weekly all-play: how many teams each side outscored this week.
  for (const s of sides) {
    s.allPlayW = sides.filter((o) => o !== s && s.score > o.score).length;
    s.allPlayL = sides.filter((o) => o !== s && s.score < o.score).length;
  }
  return { week, sp, status, matchups, sides };
}

function buildSeason() {
  const base = state.base;
  const done = base.schedule.filter((m) => m.winner && m.winner !== "UNDECIDED");
  const byWeek = {};
  for (const m of done) {
    for (const [me, opp] of [[m.home, m.away], [m.away, m.home]]) {
      if (!me) continue;
      (byWeek[m.matchupPeriodId] ||= []).push({
        teamId: me.teamId, score: me.totalPoints, oppId: opp?.teamId, oppScore: opp?.totalPoints,
        result: !opp ? "BYE" : me.totalPoints > opp.totalPoints ? "W" : me.totalPoints < opp.totalPoints ? "L" : "T",
        regular: m.matchupPeriodId <= base.regWeeks,
      });
    }
  }
  const rows = Object.values(base.teams).map((t) => ({ ...t, apW: 0, apL: 0, xW: 0, weeks: {} }));
  const row = Object.fromEntries(rows.map((r) => [r.id, r]));
  for (const [wk, list] of Object.entries(byWeek)) {
    for (const s of list) row[s.teamId] && (row[s.teamId].weeks[wk] = s);
    const reg = list.filter((s) => s.regular && s.result !== "BYE");
    for (const s of reg) {
      const r = row[s.teamId]; if (!r) continue;
      const w = reg.filter((o) => o !== s && s.score > o.score).length;
      const l = reg.filter((o) => o !== s && s.score < o.score).length;
      r.apW += w; r.apL += l;
      r.xW += reg.length > 1 ? (w + 0.5 * (reg.length - 1 - w - l)) / (reg.length - 1) : 0;
    }
  }
  const maxRecent = [];
  for (const r of rows) {
    const games = Object.entries(r.weeks).sort((a, b) => a[0] - b[0]).map(([, s]) => s).filter((s) => s.result !== "BYE");
    r.games = games.length;
    r.avg = games.length ? sum(games, (g) => g.score) / games.length : 0;
    const last3 = games.slice(-3);
    r.recent = last3.length ? sum(last3, (g) => g.score) / last3.length : 0;
    let streak = 0, kind = "";
    for (let i = games.length - 1; i >= 0; i--) {
      if (!kind) kind = games[i].result;
      if (games[i].result !== kind) break;
      streak++;
    }
    r.streak = kind ? `${kind}${streak}` : "–";
    const gp = r.wins + r.losses + r.ties;
    r.winPct = gp ? (r.wins + 0.5 * r.ties) / gp : 0;
    r.apPct = r.apW + r.apL ? r.apW / (r.apW + r.apL) : 0;
    r.luck = r.wins + 0.5 * r.ties - r.xW;
    maxRecent.push(r.recent);
  }
  // Power score: all-play strength, actual record, and recent form.
  const maxR = Math.max(...maxRecent, 1), maxAvg = Math.max(...rows.map((r) => r.avg), 1);
  for (const r of rows) r.power = 100 * (0.4 * r.apPct + 0.25 * r.winPct + 0.2 * (r.recent / maxR) + 0.15 * (r.avg / maxAvg));
  [...rows].sort((a, b) => b.power - a.power).forEach((r, i) => (r.powerRank = i + 1));
  rows.sort((a, b) => a.seed - b.seed || b.wins - a.wins || b.pf - a.pf).forEach((r, i) => (r.rank = i + 1));
  const weeks = Object.keys(byWeek).map(Number).sort((a, b) => a - b);
  return { rows, weeks };
}

// ---------- Generic sortable table ----------
// opts.rowClass(row) adds classes to each <tr>; opts.tableClass adds classes to the <table>.
function sortableTable(cols, rows, sortState, onSort, opts = {}) {
  const col = cols.find((c) => c.key === sortState.key) || cols[0];
  const val = col.sort || ((r) => r[col.key]);
  const sorted = [...rows].sort((a, b) => {
    const x = val(a), y = val(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return (typeof x === "string" ? x.localeCompare(y) : x - y) * sortState.dir;
  });
  const head = cols.map((c) => `<th class="${c.num ? "num " : ""}${c.cls || ""} ${c.key ? "sortable" : ""} ${c.key === sortState.key ? "sorted" + (sortState.dir > 0 ? " asc" : "") : ""}" data-key="${c.key || ""}" ${c.title ? `title="${esc(c.title)}"` : ""}>${c.label}</th>`).join("");
  const body = sorted.map((r) => `<tr class="${opts.rowClass ? opts.rowClass(r) : ""}">${cols.map((c) => `<td class="${c.num ? "num " : ""}${c.cls || ""}">${c.render ? c.render(r) : esc(r[c.key])}</td>`).join("")}</tr>`).join("");
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  wrap.innerHTML = `<table class="data ${opts.tableClass || ""}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  wrap.querySelectorAll("th.sortable").forEach((th) => th.addEventListener("click", () => {
    const key = th.dataset.key;
    const c = cols.find((x) => x.key === key);
    if (sortState.key === key) sortState.dir *= -1;
    else { sortState.key = key; sortState.dir = c.dir || (c.num ? -1 : 1); }
    onSort();
  }));
  return wrap;
}

// ---------- Rendering helpers ----------
const team = (id) => state.base.teams[id] || { name: `Team ${id}`, owner: "", wins: 0, losses: 0, ties: 0 };
const recordStr = (t) => `${t.wins}-${t.losses}${t.ties ? "-" + t.ties : ""}`;
// ESPN injury designations: [short label, full name, severe?]
const INJURY = {
  QUESTIONABLE: ["Q", "Questionable", false],
  DOUBTFUL: ["D", "Doubtful", true],
  OUT: ["O", "Out", true],
  INJURY_RESERVE: ["IR", "Injured reserve", true],
  DAY_TO_DAY: ["DTD", "Day-to-day", false],
  PROBABLE: ["P", "Probable", false],
  SUSPENSION: ["SSPD", "Suspended", true],
};
const injuryInfo = (s) => INJURY[s] || [s.slice(0, 3), s.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()), false];
const ordinal = (n) => `${n}${["th", "st", "nd", "rd"][(n % 100 >= 11 && n % 100 <= 13) ? 0 : Math.min(n % 10, 4) % 4] || "th"}`;
// "@ DEN 29th": opponent plus ESPN's opponent rank (1 = toughest defense vs. this position, 32 = easiest).
// Just the colored rank chip ("22nd"), or "" when there's no rank.
function oprkChip(p) {
  const o = p.opp;
  if (!o?.rank) return "";
  const cls = o.rank <= 10 ? "tough" : o.rank >= 23 ? "easy" : "";
  const tip = `<b>${esc(o.team)} vs ${esc(p.pos)}s: ${ordinal(o.rank)}</b>Allows ${f1(o.avg)} fantasy pts per game to ${esc(p.pos)}s. 1st = toughest matchup, 32nd = easiest.`;
  return `<span class="oprk ${cls}" data-tip="${esc(tip)}">${ordinal(o.rank)}</span>`;
}
function oppHtml(p) {
  const o = p.opp;
  if (!o) return `<span class="muted">–</span>`;
  if (o.bye) return `<span class="muted">BYE</span>`;
  const label = `${o.home ? "vs" : "@"} ${esc(o.team)}`;
  return o.rank ? `<span class="opp">${label} ${oprkChip(p)}</span>` : label;
}
const posRankHtml = (p, rank) => (rank ? `${esc(p.pos)}${Math.round(rank)}` : `<span class="muted">–</span>`);

const injBadge = (p) => {
  if (!p.injury) return "";
  const [short, full, severe] = injuryInfo(p.injury);
  return ` <span class="badge ${severe ? "out" : "inj"}" title="${esc(full)}" data-tip="${esc(full)}">${esc(short)}</span>`;
};
const statusBadge = (s) => (s === "final" ? `<span class="badge final">FINAL</span>` : s === "live" ? `<span class="badge live">LIVE</span>` : `<span class="badge">UPCOMING</span>`);
// "J. Love" for tight spaces on phones; defenses keep their full name.
const shortName = (name) => {
  const parts = String(name).split(" ");
  return /D\/ST$/.test(name) || parts.length < 2 ? name : `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
};
// Player link that shows the full name normally and the short name on phones (where CSS allows).
const plinkNm = (p) => `<button type="button" class="pl-link" data-pid="${esc(p.id)}"><span class="nm-full">${esc(p.name)}</span><span class="nm-short">${esc(shortName(p.name))}</span></button>`;

// ---- NFL game status for the current week (final / in progress / offense on the field) ----
async function fetchScoreboard(sp) {
  if (state.demo) return window.DemoLeague.live(sp);
  const q = new URLSearchParams({ scoringPeriodId: sp, scoreboard: "1" });
  if (state.leagueId) q.set("leagueId", state.leagueId);
  if (state.season) q.set("season", state.season);
  const res = await fetch(`/api/live?${q}`);
  if (!res.ok) throw new Error(`Scoreboard request failed (${res.status})`);
  return res.json();
}

// NFL game status and scores for the selected week. Loads once per week, and keeps
// refreshing in the background only while games are in progress.
function ensureGameStatus() {
  const b = state.base, w = state.week;
  if (!w) return null;
  const s = state.gameStatus?.sp === w.sp ? state.gameStatus : null;
  if ((!s || (s.anyLive && Date.now() - s.at > 25000)) && !state.gameStatusLoading) {
    state.gameStatusLoading = true;
    fetchScoreboard(w.sp)
      .then((d) => {
        if (state.base !== b) return;
        const byPro = {};
        for (const g of d.games) {
          for (const [me, them] of [[g.home, g.away], [g.away, g.home]]) {
            const poss = g.state === "in" && g.possession === me.proId;
            const oppPoss = g.state === "in" && !!g.possession && g.possession === them.proId;
            byPro[me.proId] = {
              id: g.id, state: g.state, detail: g.detail, date: g.date, poss, redZone: poss && !!g.redZone,
              oppPoss, oppRedZone: oppPoss && !!g.redZone,
              home: me === g.home, oppAbbr: them.abbr, score: me.score, oppScore: them.score,
            };
          }
        }
        const prev = state.gameStatus;
        state.gameStatus = { sp: w.sp, at: Date.now(), byPro, anyLive: d.games.some((g) => g.state === "in") };
        // Nothing new (same scores, clock and possession): skip the redraw.
        state.gameStatusSame = prev?.sp === w.sp && JSON.stringify(prev.byPro) === JSON.stringify(byPro);
      })
      .catch(() => { if (state.base === b) state.gameStatus = { sp: w.sp, at: Date.now(), byPro: {}, anyLive: false }; })
      .finally(() => {
        state.gameStatusLoading = false;
        if (state.gameStatusSame) { state.gameStatusSame = false; return; }
        if (state.base === b && (state.tab === "matchups" || state.tab === "roster")) render();
      });
  }
  return s;
}

// ESPN-style game line: "@IND 17-24 9:08 - 4th", "KC 27-30 Final", "@IND Sun 12:00 PM", "BYE".
function gameLineHtml(p) {
  const g = gameStatusOf(p);
  if (g && g.oppAbbr) {
    const opp = `${g.home ? "" : "@"}${esc(g.oppAbbr)}`;
    if (g.state === "pre") return `${opp} ${new Date(g.date).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}`;
    const score = g.score != null && g.oppScore != null ? ` ${g.score}-${g.oppScore}` : "";
    return `${opp}${score} ${g.state === "in" ? `<span class="mx-clock">${esc((g.detail || "").replace(" - ", " "))}</span>` : "Final"}`;
  }
  if (p.opp?.bye) return "BYE";
  return p.opp?.team ? `${p.opp.home ? "" : "@"}${esc(p.opp.team)}` : "";
}
// Row state for the matchup breakdown: red zone > offense on the field > in progress > final.
function gsState(p) {
  const g = gameStatusOf(p);
  if (!g) return "";
  if (g.state === "in") {
    // A D/ST is "on the field" when the other team has the ball (red: backed up in its own red zone).
    const def = p.posId === 16, on = def ? g.oppPoss : g.poss, rz = def ? g.oppRedZone : g.redZone;
    return on ? (rz ? "is-live is-rz" : "is-live is-poss") : "is-live";
  }
  return g.state === "post" ? "is-final" : "";
}

function gameStatusOf(p) {
  const s = state.gameStatus;
  if (!s || state.week?.sp !== s.sp || !p.proId) return null;
  return s.byPro[p.proId] || (p.opp?.bye ? { state: "bye" } : null);
}
// Compact icon next to a player's name.
function gsIcon(p) {
  const g = gameStatusOf(p);
  if (!g) return "";
  if (g.state === "in") return g.poss
    ? ` <span class="gs gs-poss" title="Offense on the field · ${esc(g.detail)}" aria-label="Offense on the field">🏈</span>`
    : ` <span class="gs gs-live" title="Game in progress · ${esc(g.detail)}" aria-label="Game in progress"></span>`;
  if (g.state === "post") return ` <span class="gs gs-final" title="Game final" aria-label="Game final">✓</span>`;
  return "";
}
// Short text for the line under a name: "2nd 5:32", "Final", "Sun 1:00 PM".
function gsText(p) {
  const g = gameStatusOf(p);
  if (!g) return "";
  if (g.state === "in") return `<span class="gs-text live">${g.poss ? "On field · " : ""}${esc(g.detail)}</span>`;
  if (g.state === "post") return `<span class="gs-text">Final</span>`;
  if (g.state === "pre" && g.date) return `<span class="gs-text">${new Date(g.date).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}</span>`;
  return "";
}
function gsClass(p) {
  const g = gameStatusOf(p);
  return !g ? "" : g.state === "in" ? (g.poss ? "gs-cell-poss" : "gs-cell-live") : g.state === "post" ? "gs-cell-final" : "";
}

const ptsCell = (p, status) => (p.played ? ptsLink(p.id, state.week.sp, f1(p.actual)) : status === "final" ? f1(p.actual) : `<span class="muted">–</span>`);

function showView(name) {
  for (const v of ["roster", "matchups", "live", "players", "usage", "injuries", "trade", "transactions", "managers", "season", "history"]) $(`view-${v}`).hidden = v !== name;
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
}

// ---------- Matchups ----------
function renderMatchups() {
  const w = state.week, el = $("view-matchups");
  if (!w.matchups.length) { el.innerHTML = `<p class="muted">No matchups scheduled for week ${w.week}.</p>`; return; }
  const label = w.status === "final" ? "Final scores" : w.status === "live" ? "Live scores · win chance from ESPN" : "Projected · win chance from ESPN";
  // Every matchup as a small tile up top (phones: a grid; desktop: a column on the left); the selected
  // one fills the rest of the screen. Starts on your own matchup.
  const mine = w.matchups.find((m) => [m.home?.teamId, m.away?.teamId].map(String).includes(String(myTeamId())));
  if (!w.matchups.some((m) => m.id === state.openMatchup && m.away)) state.openMatchup = (mine?.away ? mine : w.matchups.find((m) => m.away))?.id ?? null;
  const sel = w.matchups.find((m) => m.id === state.openMatchup);
  const split = MU_SPLIT.matches;
  el.innerHTML = `<div class="section-head"><h2>Week ${w.week} matchups ${statusBadge(w.status)}</h2><span class="muted small hide-phone">${label}</span></div>
    <div class="${split ? "mu-split" : "mu-stack"}">
      <div class="${split ? "mu-list" : "mt-grid"}">${w.matchups.map(matchupTile).join("")}</div>
      <div class="${split ? "mu-pane" : "mu-detail"}" id="mu-pane">${sel ? matchupDetail(sel, true) : `<p class="muted">Pick a matchup.</p>`}</div>
    </div>
    <p class="muted small show-phone mu-note">${label}</p>`;
  el.querySelectorAll(".mini-tile[data-mu]").forEach((c) => c.addEventListener("click", () => {
    const m = w.matchups.find((x) => x.id === +c.dataset.mu);
    if (!m?.away || state.openMatchup === m.id) return;
    state.openMatchup = m.id;
    el.querySelectorAll(".mini-tile[data-mu]").forEach((b) => b.classList.toggle("selected", b === c));
    const pane = $("mu-pane");
    pane.innerHTML = matchupDetail(m, true);
    pane.scrollTop = 0;
    pane.classList.remove("swap");
    void pane.offsetWidth; // restart the fade
    pane.classList.add("swap");
    updateStickies();
  }));
  updateStickies();
}
// Small matchup tile: both fantasy teams with their scores (projections before kickoff) and the win chance.
function matchupTile(m) {
  const st = state.week.status;
  if (!m.away) return `<button type="button" class="mini-tile bye" disabled><div class="mt-row"><span class="mt-team">${logoImg(team(m.home.teamId), 18)}${esc(team(m.home.teamId).abbrev)}</span><span class="mt-score">Bye</span></div></button>`;
  const val = (sd) => (st === "upcoming" ? f1(sd.proj) : f2(sd.score));
  const lead = st === "upcoming" ? null : m.home.score > m.away.score ? "home" : m.away.score > m.home.score ? "away" : null;
  const row = (sd, key) => `<div class="mt-row ${lead === key ? "lead" : lead ? "trail" : ""}"><span class="mt-team">${logoImg(team(sd.teamId), 18)}<span>${esc(team(sd.teamId).abbrev)}</span></span><span class="mt-score">${val(sd)}</span></div>`;
  const foot = st === "final" ? "Final" : `<span class="mt-wp"><i style="width:${m.wp * 100}%"></i></span>${pct(m.wp)}–${pct(1 - m.wp)}`;
  return `<button type="button" class="mini-tile ${state.openMatchup === m.id ? "selected" : ""}" data-mu="${m.id}">${row(m.home, "home")}${row(m.away, "away")}<div class="mt-foot">${foot}</div></button>`;
}
// ---------- Sticky condensed score bar (phones) ----------
// While you scroll down an open matchup or live game, a slim score bar sticks under the top bar until
// that matchup/game has scrolled past. The bar sits in a zero-height sticky holder right after the
// full header; it shows once that header is out of view.
const stickBar = (html) => `<div class="stick-anchor"><div class="stick-bar">${html}</div></div>`;
let stickyRaf = 0;
function updateStickies() {
  cancelAnimationFrame(stickyRaf);
  stickyRaf = requestAnimationFrame(() => {
    const topH = document.querySelector(".topbar")?.getBoundingClientRect().height || 0;
    document.documentElement.style.setProperty("--top-h", `${Math.round(topH)}px`);
    if (MU_SPLIT.matches) return;
    document.querySelectorAll(".view:not([hidden]) .stick-anchor").forEach((a) => {
      const src = a.previousElementSibling, box = a.parentElement;
      if (!src || !box) return;
      const open = !box.classList.contains("game") || box.classList.contains("open");
      const show = open && src.getBoundingClientRect().bottom < topH && box.getBoundingClientRect().bottom > topH + 48;
      a.classList.toggle("show", show);
    });
  });
}
addEventListener("scroll", updateStickies, { passive: true });
addEventListener("resize", updateStickies);

// Wide screens get the side-by-side Matchups layout; redraw when crossing the breakpoint.
const MU_SPLIT = matchMedia("(min-width: 900px)");
MU_SPLIT.addEventListener?.("change", () => { if ((state.tab === "matchups" || state.tab === "live") && state.week) render(); });

// Slide a .collapse panel open or closed; closed panels can't be tabbed into.
function setOpen(panel, open) {
  panel.classList.toggle("open", open);
  panel.toggleAttribute("inert", !open);
}

// One team's half of a matchup card. The home team sits on the left (over the left end of
// the win-chance bar) and the away team on the right, mirrored.
function cardSide(s, color, status, isWinner, right) {
  const t = team(s.teamId);
  const sub = status === "final" ? `proj ${f1(s.proj)}` : status === "live" ? `proj ${f1(s.liveProj)}` : "projected";
  const big = status === "upcoming" ? f1(s.proj) : f2(s.score);
  return `<div class="mc-side ${right ? "right" : ""} ${isWinner === true ? "winner" : isWinner === false ? "loser" : ""}">
    <div class="mc-id">${logoImg(t, 34)}<span class="mc-swatch" style="background:${color}"></span></div>
    <strong class="mc-name">${esc(t.name)}</strong>
    <span class="mc-owner">${esc(t.owner)} · ${recordStr(t)}</span>
    <span class="mc-score">${big}</span><small class="mc-proj">${sub}</small>
  </div>`;
}

// Live matchup breakdown: under each team, how many starters are playing now and how many have yet to play.
// (Players on bye or ruled out don't count as "yet to play".)
function onFieldLine(m) {
  const counts = (s) => {
    let now = 0, left = 0;
    for (const p of s.starters) {
      const g = gameStatusOf(p);
      if (g?.state === "in") now++;
      else if (g?.state === "pre" && !WONT_PLAY.test(p.injury || "")) left++;
    }
    return `<span><strong>${now}</strong> playing</span><span><strong>${left}</strong> yet to play</span>`;
  };
  return `<div class="mc-onfield"><div>${counts(m.home)}</div><div class="right">${counts(m.away)}</div></div>`;
}


// withHead = false when the breakdown opens under its matchup card, which already shows the teams,
// scores and win chance.
function matchupDetail(m, withHead = true) {
  const { home, away } = m, st = state.week.status;
  if (!away) return "";
  const H = team(home.teamId), A = team(away.teamId);
  // Pair starters by lineup slot.
  const slots = [...new Set([...home.starters, ...away.starters].map((p) => p.slotId))].sort((a, b) => SLOT_DISPLAY.indexOf(a) - SLOT_DISPLAY.indexOf(b));
  const rows = [];
  for (const slot of slots) {
    const h = home.starters.filter((p) => p.slotId === slot), a = away.starters.filter((p) => p.slotId === slot);
    for (let i = 0; i < Math.max(h.length, a.length); i++) rows.push([h[i], SLOT[slot], a[i]]);
  }
  ensureGameStatus(); // NFL scores, clocks, possession and red zone for this week
  // One player's half of a row, ESPN-style: name / game line / stat line, with points and projection
  // on the inside edge. The right-hand team is mirrored.
  const side = (p, right) => {
    if (!p) return `<div class="mx-side ${right ? "right" : ""} empty"><span class="muted small">Empty</span></div>`;
    const pts = p.played ? ptsLink(p.id, state.week.sp, f1(p.actual)) : st === "final" ? f1(p.actual) : "–";
    const oprk = p.opp?.rank ? ` <span class="mx-oprk">${oprkChip(p)}</span>` : "";
    return `<div class="mx-side ${right ? "right" : ""} ${gsState(p)}">
      <div class="mx-info">
        <div class="mx-name">${plinkNm(p)}${injBadge(p)}</div>
        <div class="mx-game">${gameLineHtml(p)}${oprk}</div>
        ${p.short ? `<div class="mx-stats" title="${esc(p.line)}">${esc(p.short)}</div>` : ""}
      </div>
      <div class="mx-pts"><div class="mx-score">${pts}</div><div class="mx-proj">${f1(p.proj)}</div></div>
    </div>`;
  };
  const row = ([h, slot, a], bench) => `<div class="mx-row ${bench ? "bench" : ""}">${side(h, false)}<div class="mx-slot">${slot || ""}</div>${side(a, true)}</div>`;
  const bn = Math.max(home.bench.length, away.bench.length);
  const benchRows = Array.from({ length: bn }, (_, i) => [home.bench[i], home.bench[i]?.slot || away.bench[i]?.slot, away.bench[i]]);

  // Header: each team on its own side, scores, then each side's win probability.
  const wpH = m.wp, wpA = 1 - m.wp;
  const headSide = (s, t, right) => `<div class="mx-team ${right ? "right" : ""}">
      ${logoImg(t, 44)}
      <div class="mx-team-id"><strong>${esc(t.name)}</strong><span class="muted small">${esc(t.owner)} · ${recordStr(t)}</span></div>
      <div class="mx-total">${st === "upcoming" ? f1(s.proj) : f2(s.score)}<small>${st === "upcoming" ? "projected" : `proj ${f1(st === "live" ? s.liveProj : s.proj)}`}</small></div>
    </div>`;
  const wpBar = (v, color, right) => `<div class="mx-wp ${right ? "right" : ""}"><span class="mx-wp-pct">${pct(v)}</span><div class="mx-wp-track"><div style="width:${v * 100}%;background:${color}"></div></div></div>`;

  return `<div class="card detail mx ${withHead ? "" : "attached"}">
    ${withHead ? `<div class="mx-top"><div class="mx-head">${headSide(home, H, false)}${headSide(away, A, true)}</div>
    <div class="mx-wps">${wpBar(wpH, "var(--home)", false)}<span class="mx-wp-label">${st === "final" ? "Final" : "Win probability"}</span>${wpBar(wpA, "var(--away)", true)}</div>
    ${st === "live" ? onFieldLine(m) : ""}</div>
    ${stickBar(`<span class="sb-team">${logoImg(H, 18)}${esc(H.abbrev)}</span><strong>${st === "upcoming" ? f1(home.proj) : f2(home.score)}</strong><span class="sb-mid">${st === "final" ? "Final" : `${pct(wpH)}–${pct(wpA)}`}</span><strong>${st === "upcoming" ? f1(away.proj) : f2(away.score)}</strong><span class="sb-team">${esc(A.abbrev)}${logoImg(A, 18)}</span>`)}` : ""}
    <div class="mx-rows">${rows.map((r) => row(r, false)).join("")}</div>
    ${bn ? `<div class="mx-bench-head">Bench</div><div class="mx-rows">${benchRows.map((r) => row(r, true)).join("")}</div>` : ""}
  </div>`;
}

// ---------- Players ----------
function renderPlayers() {
  ensureValues(); // trade values fill in when they arrive
  ensureUsage(); // snap counts and targets fill in when they arrive
  ensureGameStatus(); // game lines and live highlighting
  const el = $("view-players"), f = state.players;
  const views = [["fa", "Free agents"], ["rostered", "Rostered players"], ["all", "All"]];
  el.innerHTML = `<div class="seg view-seg" id="pf-view" role="tablist">
      ${views.map(([v, label]) => `<button data-v="${v}" role="tab" aria-selected="${f.view === v}" class="${f.view === v ? "active" : ""}">${label}</button>`).join("")}
    </div><div id="pf-body"></div>`;
  $("pf-view").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { f.view = b.dataset.v; renderPlayers(); }));
  if (!views.some(([v]) => v === f.view)) f.view = "fa";
  ({ fa: renderFreeAgents, rostered: renderRosteredPlayers, all: renderAllPlayers })[f.view]($("pf-body"));
}

// ---------- Playoff odds (Standings) ----------
// Simulates the rest of the regular season 5,000 times. Each team's weekly score is drawn around its
// season average (pulled a little toward the league average early on) with the league's typical
// week-to-week spread. Standings are ordered by wins, then points for. Seeded, so numbers stay steady.
function playoffOdds() {
  const b = state.base, spots = b.raw.settings?.scheduleSettings?.playoffTeamCount || 0;
  if (!spots) return null;
  const reg = b.schedule.filter((m) => m.matchupPeriodId <= b.regWeeks && m.away);
  const isDone = (m) => m.winner && m.winner !== "UNDECIDED";
  const key = `${b.season}:${reg.filter(isDone).length}`;
  if (state.odds?.key === key) return state.odds;
  const ids = Object.keys(b.teams);
  const scores = Object.fromEntries(ids.map((id) => [id, []]));
  for (const m of reg.filter(isDone)) for (const t of [m.home, m.away]) scores[t.teamId]?.push(t.totalPoints);
  const all = Object.values(scores).flat();
  const lgMean = all.length ? sum(all) / all.length : 100;
  const lgSd = all.length > 2 ? Math.sqrt(sum(all, (x) => (x - lgMean) ** 2) / (all.length - 1)) : 25;
  const mean = Object.fromEntries(ids.map((id) => { const l = scores[id]; return [id, (sum(l) + 3 * lgMean) / (l.length + 3)]; }));
  const left = reg.filter((m) => !isDone(m));
  const bracket = 2 ** Math.ceil(Math.log2(spots)), byes = Math.min(spots, bracket - spots);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const normal = () => { let u = 0; while (!u) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
  const N = left.length ? 5000 : 1;
  const tally = Object.fromEntries(ids.map((id) => [id, { playoffs: 0, bye: 0, seedSum: 0, winsSum: 0 }]));
  for (let n = 0; n < N; n++) {
    const w = {}, pf = {};
    for (const id of ids) { const t = b.teams[id]; w[id] = t.wins + 0.5 * t.ties; pf[id] = t.pf; }
    for (const m of left) {
      const h = mean[m.home.teamId] + lgSd * normal(), a = mean[m.away.teamId] + lgSd * normal();
      pf[m.home.teamId] += h; pf[m.away.teamId] += a;
      if (h > a) w[m.home.teamId]++; else w[m.away.teamId]++;
    }
    const order = [...ids].sort((x, y) => w[y] - w[x] || pf[y] - pf[x]);
    order.forEach((id, i) => {
      const t = tally[id];
      if (i < spots) t.playoffs++;
      if (i < byes) t.bye++;
      t.seedSum += i + 1;
      t.winsSum += w[id];
    });
  }
  const teams = Object.fromEntries(ids.map((id) => [id, { playoffs: tally[id].playoffs / N, bye: tally[id].bye / N, seed: tally[id].seedSum / N, wins: tally[id].winsSum / N }]));
  state.odds = { key, spots, byes, weeksLeft: new Set(left.map((m) => m.matchupPeriodId)).size, teams };
  return state.odds;
}
const oddsPct = (x) => (x >= 0.995 && x < 1 ? ">99%" : x > 0 && x < 0.005 ? "<1%" : `${Math.round(x * 100)}%`);
const oddsCell = (x) => `<span class="odds ${x >= 0.999 ? "in" : x <= 0.001 ? "out" : x >= 0.75 ? "hi" : x <= 0.25 ? "lo" : ""}">${x >= 0.999 ? "✓ In" : x <= 0.001 ? "Out" : oddsPct(x)}</span>`;

// ---------- Fantasy playoff schedule (Roster tab) ----------
// Each player's NFL opponents in the fantasy playoff weeks, with how many fantasy points those defenses
// allow to the position this season (rank 1 = toughest, 32 = easiest).
// The schedule only lists playoff games once the bracket is set, so the playoff weeks come from the
// league settings: one round per bracket level, each lasting playoffMatchupPeriodLength NFL weeks.
function playoffPeriods() {
  const b = state.base, ss = b.raw.settings?.scheduleSettings || {}, mp = ss.matchupPeriods || {};
  const listed = Object.keys(mp).map(Number).filter((k) => k > b.regWeeks).sort((x, y) => x - y);
  const out = [];
  if (listed.length) {
    for (const wk of listed) for (const sp of mp[wk]) out.push({ wk, sp });
  } else {
    const rounds = Math.ceil(Math.log2(Math.max(2, ss.playoffTeamCount || 4)));
    const len = Math.max(1, ss.playoffMatchupPeriodLength || 1);
    let sp = Math.max(b.regWeeks, ...(mp[b.regWeeks] || [])) + 1;
    for (let r = 1; r <= rounds; r++) for (let i = 0; i < len; i++) out.push({ wk: b.regWeeks + r, sp: sp++ });
  }
  return out.filter((p) => p.sp <= 18);
}
function ensurePlayoffNfl() {
  const periods = playoffPeriods();
  if (!periods.length) return null;
  const key = `${state.base.season}`;
  if (state.poNfl?.key === key && state.poNfl.data) return state.poNfl;
  if (state.poNfl?.key !== key) {
    state.poNfl = { key, data: null };
    const base = state.base;
    Promise.all(periods.map((p) => loadNfl(p.sp)))
      .then((list) => { if (state.base === base) state.poNfl.data = Object.fromEntries(periods.map((p, i) => [p.sp, list[i]])); })
      .finally(() => { if (state.base === base && state.tab === "roster") render(); });
  }
  return null;
}
function playoffSchedule(side) {
  const periods = playoffPeriods();
  if (!side || !periods.length) return "";
  const po = ensurePlayoffNfl();
  const head = `<div class="section-head"><h2>Fantasy playoff schedule</h2><span class="muted small">Weeks ${periods[0].wk}–${periods[periods.length - 1].wk} · opponent's rank vs the position (32 = easiest)</span></div>`;
  if (!po) return `${head}<div class="loading small"><span class="spinner"></span> Loading playoff matchups…</div>`;
  const players = side.players.filter((p) => p.slotId !== IR);
  const rows = players.map((p) => {
    const opps = periods.map(({ sp }) => computeOpp(po.data[sp], p.posId, p.proId, sp));
    const ranks = opps.filter((o) => o?.rank).map((o) => o.rank);
    const avg = ranks.length ? sum(ranks) / ranks.length : null;
    const byeWk = periods.find((x, i) => opps[i]?.bye)?.wk;
    return { p, opps, avg, byeWk };
  });
  const cell = (o) => !o ? `<span class="muted">–</span>` : o.bye ? `<span class="badge">BYE</span>`
    : `${o.home ? "" : "@"}${esc(o.team)}${o.rank ? ` <span class="oprk ${o.rank <= 10 ? "tough" : o.rank >= 23 ? "easy" : ""}">${ordinal(o.rank)}</span>` : ""}`;
  const grade = (a) => a == null ? `<span class="muted">–</span>` : a >= 21 ? `<span class="pos"><strong>Easy</strong></span>` : a <= 12 ? `<span class="neg"><strong>Tough</strong></span>` : "Neutral";
  return `${head}<div class="table-wrap"><table class="data pt-table po-table"><thead><tr><th class="pt-player">Player</th>${periods.map(({ wk, sp }) => `<th>Wk ${wk}${periods.filter((x) => x.wk === wk).length > 1 ? ` <span class="muted">(${sp})</span>` : ""}</th>`).join("")}<th class="num">Avg rank</th><th>Outlook</th></tr></thead>
    <tbody>${rows.map(({ p, opps, avg, byeWk }) => `<tr><td class="pt-player"><div class="pt-name">${plinkNm(p)} <span class="muted small">${esc(p.pos)}</span></div></td>${opps.map((o) => `<td>${cell(o)}</td>`).join("")}<td class="num">${avg == null ? "–" : f1(avg)}</td><td>${byeWk ? `<span class="neg"><strong>⚠️ Bye wk ${byeWk}</strong></span>` : grade(avg)}</td></tr>`).join("")}</tbody></table></div>`;
}

// ---------- Player news (Roster tab and player popup) ----------
// Short player updates from ESPN (RotoWire notes), via /api/news. Cached per set of players.
async function fetchNews(ids) {
  if (state.demo) return window.DemoLeague.news(ids);
  const res = await fetch(`/api/news?ids=${ids.join(",")}`);
  if (!res.ok) throw new Error("news");
  return res.json();
}
// News for these players, or null while loading (`onReady` runs when it arrives).
function ensureNews(ids, onReady) {
  const key = [...ids].map(String).sort().join(",");
  if (!key) return { players: {} };
  const cache = (state.news ||= {}), d = cache[key];
  if (d && d !== "loading" && Date.now() - d.at < 20 * 60e3) return d;
  if (d !== "loading") {
    cache[key] = d && d !== "loading" ? d : "loading";
    const base = state.base;
    fetchNews(key.split(","))
      .then((x) => { if (state.base === base) cache[key] = { ...x, at: Date.now() }; })
      .catch(() => { if (state.base === base) cache[key] = { players: {}, at: Date.now() }; })
      .finally(() => { if (state.base === base) onReady?.(); });
  }
  return d && d !== "loading" ? d : null;
}
const NEWS_ALERT = /\b(out|ruled out|questionable|doubtful|injur|IR\b|injured reserve|did not practice|limited|DNP|concussion|hamstring|ankle|knee|suspend|inactive|game-time)/i;
const ago = (iso) => {
  const m = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};
const newsItem = (n, who = "") => `<details class="news-item ${NEWS_ALERT.test(n.headline) ? "alert" : ""}"><summary>${who}<span class="news-head">${esc(n.headline)}</span> <span class="muted small">${ago(n.published)}</span></summary>${n.story ? `<p class="small">${esc(n.story)}</p>` : ""}</details>`;
const newsCredit = () => `<p class="fc-credit small muted">Player news from ESPN / RotoWire.</p>`;
// Roster tab: the most recent updates (last 4 days) for everyone on the roster.
function rosterNews(side) {
  if (!side) return "";
  const players = side.players;
  const d = ensureNews(players.map((p) => p.id), () => { if (state.tab === "roster") render(); });
  const head = `<div class="section-head"><h2>Latest news</h2><span class="muted small">Tap an update for details</span></div>`;
  if (!d) return `${head}<div class="loading small"><span class="spinner"></span> Loading news…</div>`;
  const items = players.flatMap((p) => (d.players[p.id] || []).map((n) => ({ p, n })))
    .filter(({ n }) => Date.now() - Date.parse(n.published) < 4 * 864e5)
    .sort((a, b) => Date.parse(b.n.published) - Date.parse(a.n.published)).slice(0, 8);
  if (!items.length) return `${head}<p class="muted small">No player updates in the last few days.</p>`;
  return `${head}<div class="card news">${items.map(({ p, n }) => newsItem(n, `<span class="news-who">${plinkNm(p)}${injBadge(p)}</span>`)).join("")}</div>${newsCredit()}`;
}

// ---------- Lineup check (Roster tab) ----------
// Compares the lineup with the best one by ESPN projection and flags starters who won't play.
// Players whose game has started or finished are locked in place, like on ESPN.
const WONT_PLAY = /^(OUT|INJURY_RESERVE|SUSPENSION)$/;
const LINEUP_OK = "ok";
function lineupCheck(side, w) {
  if (!side || w.status === "final") return "";
  const locked = (p) => { const g = gameStatusOf(p); return !!g && (g.state === "in" || g.state === "post"); };
  const out = (p) => WONT_PLAY.test(p.injury || "") || !!p.opp?.bye;
  const val = (p) => (out(p) ? 0 : p.proj || 0);
  // Locked starters keep their slots; the rest of the roster competes for what's left.
  const counts = { ...state.base.slotCounts };
  for (const p of side.starters) if (locked(p)) counts[p.slotId] = Math.max(0, (counts[p.slotId] || 0) - 1);
  const pool = side.players.filter((p) => !locked(p) && p.slotId !== IR);
  const best = optimalLineup(pool, counts, val);
  const current = pool.filter((p) => p.starter);
  const gain = best.points - sum(current, val);
  const bestIds = new Set(best.lineup.map((x) => x.p.id));
  const ins = best.lineup.map((x) => x.p).filter((p) => !p.starter).sort((a, b) => val(b) - val(a));
  const outs = current.filter((p) => !bestIds.has(p.id)).sort((a, b) => val(a) - val(b));
  const why = (p) => (p.opp?.bye ? "on bye" : WONT_PLAY.test(p.injury || "") ? injuryInfo(p.injury)[1].toLowerCase() : "");
  const nm = (p) => `${plinkNm(p)}${injBadge(p)}`;
  const items = [];
  if (gain >= 0.5) {
    ins.forEach((p, i) => {
      const o = outs[i];
      if (!o) return;
      items.push(`<div class="lc-item lc-swap"><span class="lc-ico">⇅</span><span>Start ${nm(p)} <span class="muted small">${f1(p.proj)}</span> over ${nm(o)} <span class="muted small">${why(o) || f1(o.proj)}</span></span><strong class="pos">+${f1(val(p) - val(o))}</strong></div>`);
    });
  }
  // Starters who won't play but have no better replacement on the roster still get a warning.
  for (const p of side.starters) {
    if (!locked(p) && out(p) && !outs.includes(p)) items.push(`<div class="lc-item lc-warn"><span class="lc-ico">⚠️</span><span>${nm(p)} is ${why(p)}. No bench player can fill in, so check free agents.</span></div>`);
  }
  for (const p of side.starters) {
    if (!locked(p) && !out(p) && !outs.includes(p) && /QUESTIONABLE|DOUBTFUL/.test(p.injury || "")) items.push(`<div class="lc-item lc-note"><span class="lc-ico">⏳</span><span>${nm(p)} is ${injuryInfo(p.injury)[1].toLowerCase()}. Check the status before kickoff.</span></div>`);
  }
  if (!items.length) return LINEUP_OK; // shown as a green check next to "Starters"
  return `<div class="card lc"><div class="lc-head"><strong>Lineup check</strong>${gain >= 0.5 ? ` <span class="muted small">Best lineup projects <strong class="pos">+${f1(gain)}</strong> pts</span>` : ""}</div>${items.join("")}</div>`;
}

// ---------- Top pickups (Players › Free agents) ----------
// The free agents most worth a claim for your team: projected upgrade over your weakest starter at the
// position, rising snap share or target share, % rostered climbing, plus a little for raw projection.
function topPickups(w, faList) {
  const mine = String(myTeamId() || state.rosterTeam || "");
  const side = w.sides.find((x) => String(x.teamId) === mine);
  const worst = {};
  for (const p of side?.starters || []) if (p.slotId !== IR && (worst[p.pos] == null || p.proj < worst[p.pos])) worst[p.pos] = p.proj;
  const picks = faList.filter((p) => !WONT_PLAY.test(p.injury || "") && !p.opp?.bye).map((p) => {
    const why = [];
    let score = (p.proj || 0) * 0.2;
    const base = worst[p.pos];
    if (base != null) {
      const gain = (p.proj || 0) - base;
      if (gain >= 1) { score += gain; why.push(`+${f1(gain)} pts vs your ${p.pos}`); }
    }
    const u = usageOf(p.id);
    if (u?.prior) {
      const d = u.last.pct - u.prior.pct;
      if (d >= 12) { score += 1.5 + d / 15; why.push(`Snaps ${pctTxt(u.prior.pct)} → ${pctTxt(u.last.pct)}`); }
    }
    if (u && u.pos !== "QB" && (u.last.share || 0) >= 18) { score += (u.last.share - 15) / 8; why.push(`${pctTxt(u.last.share)} of targets`); }
    if ((p.ownChg || 0) >= 2) { score += Math.min(3, p.ownChg / 2); why.push(`Rostered ▲${f1(p.ownChg)}%`); }
    if (p.posId === 5 || p.posId === 16) score *= 0.6;
    return { p, score, why };
  }).filter((x) => x.why.length).sort((a, b) => b.score - a.score).slice(0, 5);
  if (!picks.length) return "";
  const who = side ? `for ${esc(team(side.teamId).name)}` : `· pick <strong>My team</strong> in the Trade Analyzer to tailor these`;
  return `<div class="card picks"><div class="picks-head"><strong>Top pickups</strong> <span class="muted small">${who} · week ${w.week}</span></div>
    ${picks.map(({ p, why }) => `<div class="pick-row">
      <div class="pick-main"><div>${plinkNm(p)}${injBadge(p)} <span class="muted small">${esc(p.pos)}${p.nfl ? ` · ${esc(p.nfl)}` : ""}</span>${p.status === "W" ? ` <span class="badge wv" data-tip="${esc(waiverTip(p))}">W</span>` : ""}</div>
        <div class="pick-why">${why.map((t) => `<span>${t}</span>`).join("")}</div></div>
      <div class="pick-proj"><strong>${f1(p.proj)}</strong><span class="muted small">proj</span></div></div>`).join("")}</div>`;
}

// ---------- Player rows (shared by the Players and Roster tabs) ----------
// Free agents for the selected week, or null while they load (the Players or Roster tab re-renders when they arrive).
function faData() {
  const sp = state.week.sp, cache = (state.fa ||= {}), d = cache[sp];
  if (d && d !== "loading") return d;
  if (!d) {
    cache[sp] = "loading";
    const base = state.base;
    fetchFreeAgents(sp)
      .then((x) => { if (state.base === base) cache[sp] = x; })
      .catch((e) => { if (state.base === base) cache[sp] = { error: e.message }; })
      .finally(() => { if (state.base === base && ["players", "roster", "usage"].includes(state.tab)) render(); });
  }
  return null;
}
// Same, but shows loading/error messages in `el`.
function ensureFreeAgents(el) {
  const d = faData();
  if (!d) { el.innerHTML = `<div class="loading"><span class="spinner"></span> Loading free agents…</div>`; return null; }
  if (d.error) { el.innerHTML = `<div class="banner">${esc(d.error)}</div>`; return null; }
  return d;
}

async function fetchFreeAgents(sp) {
  if (state.demo) return window.DemoLeague.freeAgents(sp);
  const q = new URLSearchParams({ scoringPeriodId: sp });
  if (state.leagueId) q.set("leagueId", state.leagueId);
  if (state.season) q.set("season", state.season);
  let res, body;
  try {
    res = await fetch(`/api/freeagents?${q}`);
    body = await res.json();
  } catch {
    throw new ApiError("no_function", "Couldn't reach the free agents function. Make sure netlify/functions/fa.mjs is uploaded.");
  }
  if (!res.ok) throw new ApiError(body.error, body.message || `Request failed (${res.status})`);
  return body;
}

// Rostered players and free agents shaped the same way for playerRow().
const rosteredRow = (p) => ({ ...p, pts: p.played ? p.actual : null, owner: p.teamId });
const faRow = (p, w) => ({ ...p, pos: POS[p.posId] || "?", nfl: PRO[p.proId] || "", opp: computeOpp(w.nfl, p.posId, p.proId, w.sp), owner: 0 });
const waiverTip = (p) => (p.waiverDate ? `<b>On waivers</b>Clears ${new Date(p.waiverDate).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "<b>On waivers</b>");

// One player row in the matchup style: label | name / game line / stats / details | points & projection | optional action.
// Rows get the same highlighting as the matchup screen (bold = playing, gold = on the field, red = red zone).
function playerRow(p, { label, sp, action = "", owner = true } = {}) {
  const pts = p.pts == null ? "–" : ptsLink(p.id, sp, f1(p.pts));
  let who = "";
  if (owner && p.owner) {
    const t = team(p.owner);
    who = `${logoImg(t, 16)}<span class="nm-full">${esc(t.name)}</span><span class="nm-short">${esc(t.abbrev)}</span>`
      + (p.slot ? ` <span class="role ${p.starter ? "start" : "bench"}">${p.starter ? esc(p.slot) : p.slotId === IR ? "IR" : "BN"}</span>` : "");
  } else if (owner && p.status) {
    who = p.status === "W" ? `<span class="badge wv" data-tip="${esc(waiverTip(p))}">W</span> Waivers` : "Free agent";
  }
  const v = state.values?.byId?.get(p.id);
  // Most useful first; the two rank items come last and are hidden on phones (they're on the Players tab).
  const details = [
    who && `<span class="pr-owner">${who}</span>`,
    p.own != null && `${f1(p.own)}% rost${Math.abs(p.ownChg || 0) >= 0.5 ? ` <span class="trend ${p.ownChg > 0 ? "pos" : "neg"}">${p.ownChg > 0 ? "▲" : "▼"}${f1(Math.abs(p.ownChg))}</span>` : ""}`,
    p.seasonPts != null && `${f1(p.seasonPts)} season pts`,
    v && `Val ${valueCell(p.id)}`,
    usageBrief(p.id),
    p.pprRank && `<span class="pd-rank">PPR ${posRankHtml(p, p.pprRank)}</span>`,
    p.posRank && `<span class="pd-rank">Rk ${posRankHtml(p, p.posRank)}</span>`,
  ].filter(Boolean);
  return `<div class="pr-row ${gsState(p)}">
    <div class="pr-label">${esc(label ?? p.pos)}</div>
    <div class="pr-info pr-has-hs">${headshot(p, 38)}<div class="pr-text">
      <div class="mx-name">${plinkNm(p)}${injBadge(p)}</div>
      <div class="mx-game">${gameLineHtml(p)}${p.opp?.rank ? `<span class="pr-oprk"> ${oprkChip(p)}</span>` : ""}${wxChip(p.proId, gameStatusOf(p)?.state)}</div>
      <div class="mx-stats" ${p.short ? `title="${esc(p.line)}"` : ""}>${p.short ? esc(p.short) : "&nbsp;"}</div>
      <div class="pr-details">${details.length ? details.map((d) => `<span class="pd">${d}</span>`).join("") : "&nbsp;"}</div>
    </div></div>
    <div class="mx-pts"><div class="mx-score">${pts}</div><div class="mx-proj">${f1(p.proj)}</div></div>
    ${action}
  </div>`;
}

// ---------- Player tables (Players tab) ----------
// Sortable columns. The Player cell keeps the matchup-style name, game line and stats,
// and rows get the same highlighting (bold = playing, gold = on the field, red = red zone).
function playerCell(p) {
  return `<div class="pt-name">${plinkNm(p)}${injBadge(p)}</div>
    <div class="mx-game">${gameLineHtml(p)}</div>
    ${p.short ? `<div class="mx-stats" title="${esc(p.line)}">${esc(p.short)}</div>` : ""}`;
}
function ownerCell(p) {
  if (p.owner) {
    const t = team(p.owner);
    return `<span class="pt-owner">${logoImg(t, 18)}<span class="nm-full">${esc(t.name)}</span><span class="nm-short">${esc(t.abbrev)}</span></span>`
      + (p.slot ? ` <span class="role ${p.starter ? "start" : "bench"}">${p.starter ? esc(p.slot) : p.slotId === IR ? "IR" : "BN"}</span>` : "");
  }
  return p.status === "W" ? `<span class="badge wv" data-tip="${esc(waiverTip(p))}">W</span> Waivers` : `<span class="muted">Free agent</span>`;
}
const DASH = `<span class="muted">–</span>`;
const ownHtml = (p) => (p.own == null ? DASH
  : `${f1(p.own)}%${Math.abs(p.ownChg || 0) >= 0.5 ? ` <span class="trend ${p.ownChg > 0 ? "pos" : "neg"}">${p.ownChg > 0 ? "▲" : "▼"}${f1(Math.abs(p.ownChg))}</span>` : ""}`);

// Column definitions, picked per view. `dir` is the first-click sort direction (1 = low to high).
const PCOLS = {
  player: { key: "name", label: "Player", cls: "pt-player", dir: 1, render: playerCell },
  pos: { key: "pos", label: "Pos", dir: 1, sort: (p) => POS_ORDER.indexOf(p.pos) },
  owner: { key: "owner", label: "Team", cls: "pt-team", dir: 1, render: ownerCell, sort: (p) => (p.owner ? team(p.owner).name : p.status === "W" ? "~W" : "~~FA") },
  opp: { key: "opp", label: "Opp", title: "Opponent and its rank against the position (1 = toughest)", dir: -1, render: oppHtml, sort: (p) => p.opp?.rank ?? null },
  own: { key: "own", label: "% Rost", num: true, render: ownHtml },
  proj: { key: "proj", label: "Proj", num: true, render: (p) => (p.proj == null ? DASH : f1(p.proj)) },
  pts: { key: "pts", label: "Pts", num: true, cls: "pt-pts", render: (p, sp) => (p.pts == null ? DASH : ptsLink(p.id, sp, f1(p.pts))) },
  diff: { key: "diff", label: "+/−", title: "Points vs projection", num: true, render: (p) => (p.played && p.diff != null ? `<span class="${clsSign(p.diff)}">${signed(p.diff)}</span>` : DASH), sort: (p) => (p.played ? p.diff : null) },
  seasonPts: { key: "seasonPts", label: "Season", title: "Season fantasy points", num: true, render: (p) => (p.seasonPts == null ? DASH : f1(p.seasonPts)) },
  pprRank: { key: "pprRank", label: "PPR rk", title: "ESPN PPR rank at the position", num: true, dir: 1, render: (p) => posRankHtml(p, p.pprRank) },
  posRank: { key: "posRank", label: "Score rk", title: "Scoring rank at the position this season", num: true, dir: 1, render: (p) => posRankHtml(p, p.posRank) },
  snap: { key: "snap", label: "Snap %", title: "Share of the team's offensive snaps in its last game (avg = season average)", num: true, render: snapCell, sort: (p) => usageOf(p.id)?.last.pct ?? null },
  tgt: { key: "tgt", label: "Tgt %", title: "Share of the team's targets in its last game (avg = season average)", num: true, render: tgtCell, sort: (p) => { const u = usageOf(p.id); return u && u.pos !== "QB" ? u.last.share : null; } },
  value: { key: "value", label: "Value", title: "FantasyCalc trade value", num: true, render: (p) => valueCell(p.id), sort: (p) => valueOf(p.id) },
};
// Draws a player table into `el`; header clicks re-sort it in place.
function drawPlayerTable(el, keys, rows, sortState, sp, empty) {
  if (!rows.length) { el.innerHTML = `<p class="muted pr-empty">${empty}</p>`; return; }
  const cols = keys.map((k) => { const c = PCOLS[k]; return c.render ? { ...c, render: (r) => c.render(r, sp) } : c; });
  const redraw = () => drawPlayerTable(el, keys, rows, sortState, sp, empty);
  el.replaceChildren(sortableTable(cols, rows, sortState, redraw, { rowClass: gsState, tableClass: "pt-table" }));
}

// Position filter as a row of buttons (same feel as the injury report).
const posSeg = (id, current) => `<div class="seg pos-seg" id="${id}" role="group" aria-label="Position">${["ALL", ...POS_ORDER].map((p) => `<button type="button" data-p="${esc(p)}" class="${current === p ? "active" : ""}">${p === "ALL" ? "All" : esc(p)}</button>`).join("")}</div>`;
function bindPosSeg(id, set, draw) {
  $(id).querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    set(b.dataset.p);
    $(id).querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
    draw();
  }));
}
const tableHint = () => `<p class="muted small pt-hint">Tap a column header to sort. Swipe sideways for more columns.</p>`;

function renderFreeAgents(el) {
  const w = state.week, f = state.players;
  const d = ensureFreeAgents(el);
  if (!d) return;
  const all = d.players.map((p) => faRow(p, w));
  el.innerHTML = `<div class="section-head"><h2>Available free agents</h2><span class="muted small">Unrostered in your league now · week ${w.week} projections</span></div>
    ${topPickups(w, all)}
    <div class="filters">
      <input id="fa-q" type="search" placeholder="Search free agents…" value="${esc(f.faQ)}">
      ${posSeg("fa-pos", f.faPos)}
      <div class="seg" id="fa-status">${[["all", "All"], ["FA", "Free agents"], ["W", "On waivers"]].map(([k, l]) => `<button data-s="${k}" class="${f.faStatus === k ? "active" : ""}">${l}</button>`).join("")}</div>
    </div>${tableHint()}<div id="fa-list"></div>${fcCredit()}${nvCredit()}`;
  const draw = () => {
    const q = f.faQ.toLowerCase();
    const rows = all.filter((p) => (f.faPos === "ALL" || p.pos === f.faPos) && (f.faStatus === "all" || p.status === f.faStatus) && (!q || p.name.toLowerCase().includes(q)));
    drawPlayerTable($("fa-list"), ["player", "pos", "owner", "opp", "own", "proj", "pts", "snap", "tgt", "seasonPts", "pprRank", "posRank", "value"], rows, f.faSort, w.sp, "No free agents match those filters.");
  };
  $("fa-q").addEventListener("input", (e) => { f.faQ = e.target.value; draw(); });
  bindPosSeg("fa-pos", (v) => (f.faPos = v), draw);
  $("fa-status").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    f.faStatus = b.dataset.s;
    $("fa-status").querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
    draw();
  }));
  draw();
}

function renderRosteredPlayers(el) {
  const w = state.week, f = state.players;
  const all = w.sides.flatMap((s) => s.players).map(rosteredRow);
  const showPts = w.status !== "upcoming";
  // Week leaders per position (rostered players).
  const leaders = POS_ORDER.map((pos) => {
    const list = all.filter((p) => p.pos === pos && (showPts ? p.played : true)).sort((a, b) => (showPts ? b.actual - a.actual : b.proj - a.proj));
    return list[0] && { pos, p: list[0] };
  }).filter(Boolean);
  const teamOpts = Object.values(state.base.teams).sort((a, b) => a.name.localeCompare(b.name)).map((t) => `<option value="${t.id}" ${String(f.team) === String(t.id) ? "selected" : ""}>${esc(t.name)}</option>`).join("");
  el.innerHTML = `<div class="section-head"><h2>Week ${w.week} ${showPts ? "top scorers" : "top projections"} by position</h2></div>
    <div class="grid grid-awards">${leaders.map(({ pos, p }) => `<div class="card award"><div class="label">${pos}</div><div class="value">${f1(showPts ? p.actual : p.proj)}</div><div class="who">${plink(p.id, p.name)}${injBadge(p)}</div><div class="why">${esc(team(p.teamId).name)} · ${p.starter ? "started" : "on bench"}${p.diff != null ? ` · ${signed(p.diff)} vs proj` : ""}</div></div>`).join("")}</div>
    <div class="section-head"><h2>All rostered players</h2></div>
    <div class="filters">
      <input id="pf-q" type="search" placeholder="Search players…" value="${esc(f.q)}">
      ${posSeg("pf-pos", f.pos)}
      <select id="pf-team" aria-label="Manager"><option value="ALL">All managers</option>${teamOpts}</select>
      <div class="seg" id="pf-role">${["starters", "bench", "all"].map((r) => `<button data-r="${r}" class="${f.role === r ? "active" : ""}">${r[0].toUpperCase() + r.slice(1)}</button>`).join("")}</div>
    </div>${tableHint()}<div id="pf-list"></div>${fcCredit()}${nvCredit()}`;
  const draw = () => {
    const q = f.q.toLowerCase();
    const rows = all.filter((p) => (f.pos === "ALL" || p.pos === f.pos) && (f.team === "ALL" || String(p.teamId) === String(f.team)) &&
      (f.role === "all" || (f.role === "starters" ? p.starter : !p.starter)) && (!q || p.name.toLowerCase().includes(q)));
    drawPlayerTable($("pf-list"), ["player", "pos", "owner", "opp", "proj", "pts", "diff", "snap", "tgt", "pprRank", "posRank", "value"], rows, f.rSort, w.sp, "No players match those filters.");
  };
  $("pf-q").addEventListener("input", (e) => { f.q = e.target.value; draw(); });
  bindPosSeg("pf-pos", (v) => (f.pos = v), draw);
  $("pf-team").addEventListener("change", (e) => { f.team = e.target.value; draw(); });
  $("pf-role").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    f.role = b.dataset.r;
    $("pf-role").querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
    draw();
  }));
  draw();
}

// Rostered players and free agents together.
function renderAllPlayers(el) {
  const w = state.week, f = state.players;
  const d = ensureFreeAgents(el);
  if (!d) return;
  const rostered = w.sides.flatMap((s) => s.players).map(rosteredRow);
  const seen = new Set(rostered.map((p) => p.id));
  const all = [...rostered, ...d.players.filter((p) => !seen.has(p.id)).map((p) => faRow(p, w))];
  el.innerHTML = `<div class="section-head"><h2>All players</h2><span class="muted small">Rostered players plus the top available free agents · week ${w.week}</span></div>
    <div class="filters">
      <input id="all-q" type="search" placeholder="Search all players…" value="${esc(f.allQ)}">
      ${posSeg("all-pos", f.allPos)}
    </div>${tableHint()}<div id="all-list"></div>${fcCredit()}${nvCredit()}`;
  const draw = () => {
    const q = f.allQ.toLowerCase();
    const rows = all.filter((p) => (f.allPos === "ALL" || p.pos === f.allPos) && (!q || p.name.toLowerCase().includes(q)));
    drawPlayerTable($("all-list"), ["player", "pos", "owner", "opp", "own", "proj", "pts", "snap", "tgt", "seasonPts", "pprRank", "posRank", "value"], rows, f.allSort, w.sp, "No players match those filters.");
  };
  $("all-q").addEventListener("input", (e) => { f.allQ = e.target.value; draw(); });
  bindPosSeg("all-pos", (v) => (f.allPos = v), draw);
  draw();
}
// ---------- Logos & award icons ----------
function logoImg(t, size = 28) {
  const clean = (s) => (s || "").replace(/[^A-Za-z0-9]/g, "");
  const initials = (clean(t.abbrev).slice(0, 3) ||
    (t.name || "").split(/\s+/).map((w) => clean(w)[0] || "").join("").slice(0, 3) || "?").toUpperCase();
  if (!t.logo) return `<span class="logo logo-fb" style="--s:${size}px">${esc(initials)}</span>`;
  return `<img class="logo" style="--s:${size}px" src="${esc(t.logo)}" width="${size}" height="${size}" alt="" loading="lazy" referrerpolicy="no-referrer" data-fb="${esc(initials)}">`;
}
const teamName = (id, size = 22) => `<span class="tname">${logoImg(team(id), size)}<span>${esc(team(id).name)}</span></span>`;

// Swap a logo that fails to load for the team's initials.
// Player photo from ESPN's image service, resized (about 10 KB each); team logo for D/ST.
// Players without a photo (and everyone in the demo) get their initials instead.
function headshot(p, size = 36) {
  const initials = (p.name || "?").replace(/ D\/ST$/, "").split(/\s+/).map((w) => w[0] || "").join("").slice(0, 2).toUpperCase();
  const fb = `<span class="hs hs-fb" style="--s:${size}px" aria-hidden="true">${esc(initials)}</span>`;
  if (state.demo || !p.id) return fb;
  const team = p.posId === 16 || Number(p.id) < 0;
  const img = team ? `/i/teamlogos/nfl/500/${(PRO[p.proId] || "").toLowerCase()}.png` : `/i/headshots/nfl/players/full/${p.id}.png`;
  if (team && !PRO[p.proId]) return fb;
  const w = size * 3, h = team ? w : Math.round(w * 0.73);
  return `<img class="hs ${team ? "hs-team" : ""}" style="--s:${size}px" src="https://a.espncdn.com/combiner/i?img=${img}&w=${w}&h=${h}&cb=1" alt="" width="${size}" height="${size}" loading="lazy" data-fb="${esc(initials)}">`;
}

document.addEventListener("error", (e) => {
  const img = e.target;
  if (img instanceof HTMLImageElement && img.classList.contains("hs")) {
    const span = document.createElement("span");
    span.className = "hs hs-fb";
    span.style.cssText = img.style.cssText;
    span.textContent = img.dataset.fb || "?";
    img.replaceWith(span);
    return;
  }
  if (!(img instanceof HTMLImageElement) || !img.classList.contains("logo")) return;
  const span = document.createElement("span");
  span.className = "logo logo-fb";
  span.style.cssText = img.style.cssText;
  span.textContent = img.dataset.fb || "?";
  img.replaceWith(span);
}, true);

const AWARD_ICONS = {
  top: `<path d="M6 4h12v4.5a6 6 0 0 1-12 0z" fill="#f2b705"/><path d="M6 5.5H3.5V7a3.5 3.5 0 0 0 3.2 3.5M18 5.5h2.5V7a3.5 3.5 0 0 1-3.2 3.5" fill="none" stroke="#f2b705" stroke-width="1.6"/><path d="M10.8 14h2.4v3.6h-2.4z" fill="#d49a00"/><rect x="7.5" y="17.5" width="9" height="3.5" rx="1" fill="#a87600"/><path d="M9 6v2.5a3 3 0 0 0 1.5 2.6" stroke="#fff6c9" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".8"/>`,
  low: `<path d="M4 8.5c-1-1 1-2 0-3.5M20 8.5c1-1-1-2 0-3.5M12 4.2c-1-1 1-1.6 0-3" stroke="#8bb33a" stroke-width="1.3" fill="none" stroke-linecap="round"/><path class="edge" d="M9.2 9.5C5.5 11 4.5 14.5 4.8 17.2c.4 3.2 3.2 4.3 7.2 4.3s6.8-1.1 7.2-4.3c.3-2.7-.7-6.2-4.4-7.7l-1.2-2h-3.2z" fill="#2f3b2f"/><path d="M10.2 7.4c-1.2-.4-2.2-1.3-2.1-2.4M13.8 7.4c1.2-.4 2.2-1.3 2.1-2.4" stroke="#2f3b2f" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M8.6 13c-.8 1.5-1 3-.6 4.5" stroke="#6b7b6b" stroke-width="1.1" fill="none" stroke-linecap="round"/>`,
  bench: `<rect x="2" y="10.5" width="20" height="1.8" rx=".9" fill="#8a5a2b"/><circle cx="6" cy="6.3" r="2" fill="#e0a77a"/><rect x="3.5" y="8.8" width="5" height="6.6" rx="2.2" fill="#2a78d6"/><circle cx="12" cy="6.3" r="2" fill="#c68a5e"/><rect x="9.5" y="8.8" width="5" height="6.6" rx="2.2" fill="#eb6834"/><circle cx="18" cy="6.3" r="2" fill="#8d5a3b"/><rect x="15.5" y="8.8" width="5" height="6.6" rx="2.2" fill="#1baf7a"/><rect x="2" y="15" width="20" height="2.2" rx="1" fill="#8a5a2b"/><rect x="3.5" y="17" width="1.8" height="4" fill="#6b4420"/><rect x="18.7" y="17" width="1.8" height="4" fill="#6b4420"/>`,
  lineup: `<rect x="4" y="8.8" width="1.4" height="6.5" fill="#6b4420"/><rect x="18.6" y="8.8" width="1.4" height="6.5" fill="#6b4420"/><rect x="2" y="7" width="20" height="1.8" rx=".9" fill="#a06a35"/><rect x="2" y="10.3" width="20" height="1.8" rx=".9" fill="#a06a35"/><rect x="2" y="15" width="20" height="2.2" rx="1" fill="#8a5a2b"/><rect x="3.5" y="17" width="1.8" height="4" fill="#6b4420"/><rect x="18.7" y="17" width="1.8" height="4" fill="#6b4420"/>`,
  blowout: `<path d="M6 17.5a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 15.6 8.8a4.3 4.3 0 0 1-.6 8.7z" fill="#dfe6ee" stroke="#7d8da1" stroke-width="1"/><circle cx="8" cy="12.3" r=".8" fill="#44505e"/><circle cx="11" cy="12.3" r=".8" fill="#44505e"/><circle cx="14.4" cy="14" r="1" fill="none" stroke="#44505e" stroke-width=".9"/><path d="M17 13h5M17.5 15.8h3.5a1.5 1.5 0 1 1-1.5 1.5M17 10.3h2.5a1.5 1.5 0 1 0-1.5-1.5" stroke="#5f86b5" stroke-width="1.4" fill="none" stroke-linecap="round"/>`,
  lucky: `<path d="M12 13.5c0 3 1 5.5 3.2 7.5" stroke="#17802e" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M12 10C10 7.5 8.5 6.6 8.5 5a1.9 1.9 0 0 1 3.5-1 1.9 1.9 0 0 1 3.5 1c0 1.6-1.5 2.5-3.5 5z" fill="#1f9d3a"/><path d="M12 10c-2.5 2-3.4 3.5-5 3.5a1.9 1.9 0 0 1-1-3.5 1.9 1.9 0 0 1 1-3.5c1.6 0 2.5 1.5 5 3.5z" fill="#1f9d3a"/><path d="M12 10c2.5 2 3.4 3.5 5 3.5a1.9 1.9 0 0 0 1-3.5 1.9 1.9 0 0 0-1-3.5c-1.6 0-2.5 1.5-5 3.5z" fill="#1f9d3a"/><path d="M12 10c-2 2.5-3.5 3.4-3.5 5a1.9 1.9 0 0 0 3.5 1 1.9 1.9 0 0 0 3.5-1c0-1.6-1.5-2.5-3.5-5z" fill="#1f9d3a"/><circle cx="12" cy="10" r="1" fill="#17802e"/>`,
  unlucky: `<path d="M16.4 20.6c2.6 0 4.1-1.6 3.5-4.3" stroke="#151515" stroke-width="1.8" fill="none" stroke-linecap="round" class="edge-stroke"/><path class="edge" d="M7 21c-.6-3 .2-6.2 2.2-8.2-1-1.2-1.4-2.6-1.2-4l-.7-3.6 2.6 1.9a5 5 0 0 1 2.8 0l2.6-1.9-.7 3.6c.2 1.4-.2 2.8-1.2 4 2 2 2.8 5.2 2.2 8.2z" fill="#151515"/><circle cx="10" cy="9.8" r=".75" fill="#f2d33a"/><circle cx="12.6" cy="9.8" r=".75" fill="#f2d33a"/>`,
};
const AWARD_ORDER = ["top", "low", "bench", "lineup", "blowout", "lucky", "unlucky"];
const AWARD_NAMES = { top: "Top score", low: "Lowest score", bench: "Most bench points wasted", lineup: "Optimal lineup", blowout: "Biggest blowout", lucky: "Luckiest win", unlucky: "Unluckiest loss" };
const awardIcon = (key, size = 16) => `<svg class="aw-icon" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${AWARD_ICONS[key]}</svg>`;

// Weekly awards; shared by the Managers tab and the season tally.
function weekAwards(w) {
  const sides = w.sides, out = [];
  if (!sides.length || w.status === "upcoming") return out;
  const final = w.status === "final";
  const best = (fn) => [...sides].sort((a, b) => fn(b) - fn(a))[0];
  const games = w.matchups.filter((m) => m.away);
  const margin = (m) => Math.abs(m.home.score - m.away.score);
  const lead = (m) => (m.home.score >= m.away.score ? m.home : m.away);
  const add = (key, label, value, side, why) => side && out.push({ key, label, value, side, why });

  const top = best((s) => s.score), low = best((s) => -s.score);
  add("top", "Top score", f2(top.score), top, `${top.allPlayW}-${top.allPlayL} vs the whole league`);
  add("low", "Lowest score", f2(low.score), low, "Better luck next week");
  const lazy = best((s) => s.benchLeft);
  add("bench", "Most bench points wasted", f1(lazy.benchLeft), lazy, lazy.bestBench ? `${esc(lazy.bestBench.name)} scored ${f1(lazy.bestBench.actual)} on the bench` : "");
  // Lineup, margin and luck awards only mean something once the week is over.
  if (final) {
    const eff = best((s) => s.efficiency ?? 0);
    add("lineup", "Optimal lineup", pct(eff.efficiency ?? 0), eff, `Only ${f1(eff.benchLeft)} pts left on the bench`);
    if (games.length) {
      const blow = [...games].sort((a, b) => margin(b) - margin(a))[0];
      const close = [...games].sort((a, b) => margin(a) - margin(b))[0];
      add("blowout", "Biggest blowout", f1(margin(blow)), lead(blow), `over ${esc(team(lead(blow).opp.teamId).name)}`);
      add("close", "Closest game", f2(margin(close)), lead(close), `edging ${esc(team(lead(close).opp.teamId).name)}`);
    }
    const losers = sides.filter((s) => s.won === false), winners = sides.filter((s) => s.won === true);
    const u = [...losers].sort((a, b) => b.score - a.score)[0];
    if (u) add("unlucky", "Unluckiest loss", f2(u.score), u, `Would've beaten ${u.allPlayW} of ${sides.length - 1} teams`);
    const l = [...winners].sort((a, b) => a.score - b.score)[0];
    if (l) add("lucky", "Luckiest win", f2(l.score), l, `Would've lost to ${l.allPlayL} of ${sides.length - 1} teams`);
  }
  const mvp = sides.filter((s) => s.mvp).sort((a, b) => b.mvp.actual - a.mvp.actual)[0];
  if (mvp) add("potw", "Player of the week", f1(mvp.mvp.actual), mvp, `${esc(mvp.mvp.name)} (${mvp.mvp.pos})`);
  return out;
}

// Fetch every finished regular-season week and count awards per team.
async function loadAwardTally() {
  const b = state.base;
  const weeks = [...new Set(b.schedule.map((m) => m.matchupPeriodId))]
    .filter((wk) => wk <= b.regWeeks && b.schedule.filter((m) => m.matchupPeriodId === wk).every((m) => m.winner && m.winner !== "UNDECIDED"))
    .sort((a, c) => a - c);
  await Promise.all(weeks.filter((wk) => state.weekCache[wk]?.status !== "final").map(async (wk) => {
    const raw = await api(["mBoxscore", "mMatchupScore", "mRoster"], b.scoringPeriodFor(wk));
    state.weekCache[wk] = buildWeek(raw, wk);
  }));
  const tally = {};
  for (const wk of weeks) {
    for (const a of weekAwards(state.weekCache[wk])) {
      if (!AWARD_ICONS[a.key]) continue;
      ((tally[a.side.teamId] ||= {})[a.key] ||= []).push(wk);
    }
  }
  return tally;
}

function awardChips(teamId) {
  const t = state.awardTally?.[teamId];
  if (!t) return "";
  const chips = AWARD_ORDER.filter((k) => t[k]).map((k) => {
    const wks = t[k];
    const tip = `<b>${AWARD_NAMES[k]}</b>${wks.length} time${wks.length > 1 ? "s" : ""} · week${wks.length > 1 ? "s" : ""} ${wks.join(", ")}`;
    return `<span class="aw-chip" data-tip="${esc(tip)}" aria-label="${AWARD_NAMES[k]}: ${wks.length}">${awardIcon(k)}${wks.length}</span>`;
  });
  return chips.length ? `<div class="aw-chips">${chips.join("")}</div>` : "";
}

// ---------- Managers ----------
function renderManagers() {
  const w = state.week, el = $("view-managers");
  const sides = w.sides;
  if (w.status === "upcoming") {
    el.innerHTML = `<div class="section-head"><h2>Week ${w.week} snapshot</h2></div><p class="muted">The weekly snapshot appears once games kick off. Check the Matchups tab for projections.</p>`;
    return;
  }
  const so = w.status === "final" ? "" : " (so far)";
  const awards = weekAwards(w);

  el.innerHTML = `<div class="section-head"><h2>Week ${w.week} awards${so} ${statusBadge(w.status)}</h2></div>
    <div class="grid grid-awards">${awards.map((a) => `<div class="card award"><div class="label">${AWARD_ICONS[a.key] ? awardIcon(a.key) + " " : ""}${a.label}</div><div class="value">${a.value}</div><div class="who">${teamName(a.side.teamId, 20)}</div><div class="why">${esc(team(a.side.teamId).owner)}${a.why ? " · " + a.why : ""}</div></div>`).join("")}</div>
    <div class="section-head"><h2>Manager report card</h2><span class="muted small">Optimal = the highest-scoring lineup possible from that roster this week</span></div>
    <div id="mg-table"></div>`;
  const cols = [
    { key: "name", label: "Team", sort: (s) => team(s.teamId).name, render: (s) => `<div class="team-cell">${logoImg(team(s.teamId), 30)}<div><strong>${esc(team(s.teamId).name)}</strong><div class="small muted">${esc(team(s.teamId).owner)}</div></div></div>` },
    { key: "score", label: "Score", num: true, render: (s) => `${f2(s.score)}${s.won === true ? ` <span class="badge">W</span>` : s.won === false ? ` <span class="badge">L</span>` : ""}` },
    { key: "vsProj", label: "vs Proj", num: true, sort: (s) => s.score - s.proj, render: (s) => `<span class="${clsSign(s.score - s.proj)}">${signed(s.score - s.proj)}</span>` },
    { key: "optimal", label: "Optimal", num: true, render: (s) => f1(s.optimal) },
    { key: "benchLeft", label: "Bench pts left", num: true, render: (s) => f1(s.benchLeft) },
    { key: "efficiency", label: "Lineup efficiency", sort: (s) => s.efficiency, render: (s) => s.efficiency == null ? "–" : `<div class="bar-cell"><span class="track"><span class="fill" style="display:block;width:${s.efficiency * 100}%"></span></span>${pct(s.efficiency)}</div>` },
    { key: "allPlayW", label: "All-play", num: true, title: "Record if this team played every other team this week", render: (s) => `${s.allPlayW}-${s.allPlayL}` },
    { key: "mvp", label: "MVP", cls: "hide-sm", sort: (s) => s.mvp?.actual, render: (s) => (s.mvp ? `${plink(s.mvp.id, s.mvp.name)} <span class="muted">${f1(s.mvp.actual)}</span>` : "–") },
    { key: "bust", label: "Biggest bust", cls: "hide-sm", sort: (s) => s.bust?.diff, render: (s) => (s.bust ? `${plink(s.bust.id, s.bust.name)} <span class="neg">${signed(s.bust.diff)}</span>` : "–") },
  ];
  const draw = () => $("mg-table").replaceChildren(sortableTable(cols, sides, state.managers.sort, draw));
  draw();
}

// ---------- Season ----------
function renderSeason() {
  const el = $("view-season");
  const season = buildSeason();
  if (!season.weeks.length) {
    el.innerHTML = `<div class="section-head"><h2>Season overview</h2></div><p class="muted">Season stats appear after the first week is final.</p>`;
    return;
  }
  el.innerHTML = `<div class="section-head"><h2>Standings & power rankings</h2><span class="muted small">Through week ${season.weeks[season.weeks.length - 1]}</span></div>
    <div class="award-legend">${AWARD_ORDER.map((k) => `<span>${awardIcon(k, 18)}${AWARD_NAMES[k]}</span>`).join("")}
      <span class="muted small" id="tally-note">${state.awardTally === "loading" ? "Counting weekly awards…" : state.awardTally ? "Weekly award counts, regular season" : ""}</span></div>
    <div id="st-table"></div>
    <div class="section-head"><h2>Luck meter</h2><span class="muted small">Actual wins minus expected wins (based on weekly scores vs. the whole league)</span></div>
    <div class="card chart-card" id="luck-chart"></div>
    <div class="section-head"><h2>Weekly scores</h2><span class="muted small">Darker = higher score relative to the league</span></div>
    <div class="card chart-card" id="heatmap"></div>`;
  const odds = playoffOdds();
  const cols = [
    { key: "rank", label: "#", num: true },
    { key: "name", label: "Team", render: (r) => `<div class="team-cell">${logoImg(r, 34)}<div><strong>${esc(r.name)}</strong><div class="small muted">${esc(r.owner)}</div>${awardChips(r.id)}</div></div>` },
    { key: "wins", label: "Record", sort: (r) => r.winPct * 1000 + r.pf / 1e4, render: (r) => recordStr(r) },
    { key: "pf", label: "PF", num: true, render: (r) => f1(r.pf) },
    { key: "pa", label: "PA", num: true, cls: "hide-sm", render: (r) => f1(r.pa) },
    { key: "avg", label: "Avg", num: true, render: (r) => f1(r.avg) },
    { key: "recent", label: "Last 3", num: true, cls: "hide-sm", title: "Average score over the last 3 games", render: (r) => f1(r.recent) },
    { key: "apPct", label: "All-play", num: true, title: "Record if every team played every other team each week", render: (r) => `${r.apW}-${r.apL}` },
    { key: "luck", label: "Luck", num: true, title: "Wins above/below expectation", render: (r) => `<span class="${clsSign(r.luck)}">${signed(r.luck)}</span>` },
    { key: "streak", label: "Streak", cls: "hide-sm", sort: (r) => (r.streak[0] === "W" ? 1 : -1) * parseInt(r.streak.slice(1) || 0) },
    { key: "powerRank", label: "Power", num: true, title: "Power ranking: blends all-play record, actual record and recent scoring", sort: (r) => r.powerRank, render: (r) => `<strong>${r.powerRank}</strong>` },
    ...(odds ? [
      { key: "po", label: "Playoffs", num: true, title: `Chance to make the playoffs (top ${odds.spots}), from 5,000 simulations of the rest of the season`, sort: (r) => odds.teams[r.id]?.playoffs ?? 0, render: (r) => oddsCell(odds.teams[r.id]?.playoffs ?? 0) },
      ...(odds.byes ? [{ key: "bye", label: "Bye", num: true, cls: "hide-sm", title: `Chance to finish top ${odds.byes} and earn a first-round bye`, sort: (r) => odds.teams[r.id]?.bye ?? 0, render: (r) => oddsCell(odds.teams[r.id]?.bye ?? 0) }] : []),
      { key: "seed", label: "Proj. seed", num: true, cls: "hide-sm", dir: 1, title: "Average finishing position across the simulations", sort: (r) => odds.teams[r.id]?.seed ?? 99, render: (r) => f1(odds.teams[r.id]?.seed ?? 0) },
    ] : []),
    { key: "rosterValue", label: "Roster value", num: true, title: "Total FantasyCalc trade value of the team's current roster", render: (r) => (r.rosterValue == null ? `<span class="muted">–</span>` : fmtVal(r.rosterValue)) },
  ];
  // Roster value needs this week's rosters and FantasyCalc values; both load in the background.
  const values = ensureValues(), rosterWeek = ensureCurrentRosters();
  if (values?.byId?.size && rosterWeek) {
    const rosters = rostersWithValues();
    for (const r of season.rows) r.rosterValue = rosters[r.id] ? sum(rosters[r.id], (p) => p.value) : null;
  }
  const draw = () => $("st-table").replaceChildren(sortableTable(cols, season.rows, state.standings.sort, draw));
  draw();
  $("st-table").insertAdjacentHTML("afterend", (odds && odds.weeksLeft ? `<p class="small muted st-odds-note">Playoff odds simulate the remaining ${odds.weeksLeft} week${odds.weeksLeft > 1 ? "s" : ""} 5,000 times using each team's scoring so far. Ties are broken by points for, which may differ from your league's tiebreaker.</p>` : "") + fcCredit());
  if (!state.awardTally) {
    state.awardTally = "loading";
    $("tally-note").textContent = "Counting weekly awards…";
    loadAwardTally()
      .then((t) => { state.awardTally = t; })
      .catch(() => { state.awardTally = {}; })
      .finally(() => { if (state.tab === "season" && state.week) renderSeason(); });
  }
  $("luck-chart").innerHTML = luckChart(season.rows);
  $("heatmap").innerHTML = heatmap(season);
}

function luckChart(rows) {
  const data = [...rows].sort((a, b) => b.luck - a.luck);
  const labelW = 170, plotW = 380, rowH = 28, padT = 8, valW = 48;
  const W = labelW + plotW + valW, H = padT * 2 + data.length * rowH;
  const max = Math.max(1, ...data.map((r) => Math.abs(r.luck)));
  const x0 = labelW + plotW / 2, scale = (plotW / 2 - 44) / max;
  const bars = data.map((r, i) => {
    const y = padT + i * rowH, w = Math.abs(r.luck) * scale, pos = r.luck >= 0;
    const x = pos ? x0 : x0 - w;
    const tip = `<b>${esc(r.name)}</b>${r.wins} actual wins vs ${r.xW.toFixed(1)} expected<br>${pos ? "Lucky" : "Unlucky"} by ${Math.abs(r.luck).toFixed(1)} win${Math.abs(r.luck) >= 1.05 ? "s" : ""}`;
    return `<g data-tip="${esc(tip)}">
      <rect x="0" y="${y}" width="${W}" height="${rowH}" fill="transparent"/>
      <text x="${labelW - 10}" y="${y + rowH / 2 + 4}" text-anchor="end">${esc(r.name.length > 22 ? r.name.slice(0, 21) + "…" : r.name)}</text>
      <rect x="${x}" y="${y + 6}" width="${Math.max(w, 1)}" height="${rowH - 12}" rx="3" style="fill:var(${pos ? "--div-pos" : "--div-neg"})"/>
      <text x="${pos ? x0 + w + 6 : x0 - w - 6}" y="${y + rowH / 2 + 4}" text-anchor="${pos ? "start" : "end"}">${signed(r.luck)}</text></g>`;
  }).join("");
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Luck by team">
    <line x1="${x0}" x2="${x0}" y1="0" y2="${H}" style="stroke:var(--axis)" stroke-width="1"/>${bars}</svg>
    <div class="legend"><span><i style="background:var(--div-pos)"></i>Lucky (more wins than scores deserve)</span><span><i style="background:var(--div-neg)"></i>Unlucky</span></div>`;
}

function heatmap(season) {
  const { rows, weeks } = season;
  const labelW = 170, cw = 46, ch = 30, top = 24;
  const W = labelW + weeks.length * cw, H = top + rows.length * ch;
  const scores = rows.flatMap((r) => weeks.map((w) => r.weeks[w]?.score).filter((s) => s != null)).sort((a, b) => a - b);
  const bucket = (s) => Math.min(6, Math.floor((scores.findIndex((x) => x >= s) / scores.length) * 7));
  const cells = rows.map((r, i) => {
    const y = top + i * ch;
    const label = `<text x="${labelW - 10}" y="${y + ch / 2 + 4}" text-anchor="end">${esc(r.name.length > 22 ? r.name.slice(0, 21) + "…" : r.name)}</text>`;
    return label + weeks.map((w, j) => {
      const g = r.weeks[w], x = labelW + j * cw;
      if (!g || g.result === "BYE") return `<rect x="${x}" y="${y}" width="${cw}" height="${ch}" class="heat-cell" style="fill:var(--surface-2)"/>`;
      const b = bucket(g.score);
      const tip = `<b>${esc(r.name)} · Week ${w}</b>${f2(g.score)} pts — ${g.result === "W" ? "Won" : g.result === "L" ? "Lost" : "Tied"} vs ${esc(team(g.oppId).name)} (${f2(g.oppScore)})`;
      return `<g data-tip="${esc(tip)}"><rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="4" class="heat-cell" style="fill:var(--seq-${b})"/>
        <text x="${x + cw / 2}" y="${y + ch / 2 + 4}" text-anchor="middle" style="fill:${b >= 3 ? "#fff" : "#0b0b0b"};font-size:11px;pointer-events:none">${Math.round(g.score)}</text></g>`;
    }).join("");
  }).join("");
  const head = weeks.map((w, j) => `<text x="${labelW + j * cw + cw / 2}" y="16" text-anchor="middle" class="muted-text">W${w}</text>`).join("");
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly scores by team">${head}${cells}</svg>
    <div class="legend">Low<span class="ramp">${[0, 1, 2, 3, 4, 5, 6].map((i) => `<i style="background:var(--seq-${i})"></i>`).join("")}</span>High · numbers are each week's score</div>`;
}

// ---------- Last play: what kind it was ----------
// ESPN's play type alone isn't enough: a run or catch with an accepted penalty is still typed "Rush" or
// "Pass Reception" (with a misleading yardage), and timeouts replace the real last play. Classify by
// type and text, and keep showing the last real play through stoppages.
const STOPPAGE = /timeout|two-minute|end (of )?(period|half|quarter|game|regulation)|official|injury|coin toss/i;
const hasFlag = (x) => /PENALTY/.test(x || "") && !/declined/i.test((x || "").split("PENALTY").slice(-1)[0] || "");
const flagName = (x) => {
  const pen = /PENALTY on [^,]*?,\s*([^,]+?),\s*(\d+)\s*yards?/i.exec(x || "");
  return pen ? pen[1].replace(/^(Offensive|Defensive)\s+/i, (m) => m[0] + ". ") : "Penalty";
};
function playKind(type, text) {
  const t = type || "", x = text || "";
  if (STOPPAGE.test(t)) return "stoppage";
  // ESPN types lost fumbles "Fumble Recovery (Opponent)"; "(Own)" fumbles play out like a normal snap.
  if (/interception|fumble recovery \(opp|fumble return|muffed punt recovery \(opp/i.test(t) || /INTERCEPTED/.test(x)) return /fumble|muffed/i.test(t) ? "fumble" : "turnover";
  // A kick with a flag is still drawn as the kick (the penalty is added to its label).
  if (/kickoff|punt|field goal|extra point|on-?side/i.test(t)) return "kick";
  if (t === "Penalty" || hasFlag(x)) return "penalty";
  if (/safety/i.test(t)) return "safety";
  if (/sack/i.test(t)) return "sack";
  if (/incomplet/i.test(t) || /pass incomplete/i.test(x)) return "incomplete";
  if (/pass|reception/i.test(t)) return "pass";
  return "rush";
}
// The play to draw for a game: the latest one, or the last real one if play is stopped.
function shownPlay(g) {
  const mem = (state.lastRealPlay ||= {});
  const lp = g.field?.lastPlay;
  if (lp && lp.start != null && playKind(lp.type, g.lastPlay) !== "stoppage") {
    mem[g.id] = { lp, text: g.lastPlay };
    return { lp, text: g.lastPlay, earlier: false };
  }
  return mem[g.id] ? { ...mem[g.id], earlier: true } : null;
}

// A spot named in the play text ("... at HST 27") as a 0–100 yard line (0 = home goal line).
// Play-by-play uses a few different team codes than the scoreboard.
const PBP_TEAM = { HST: "HOU", ARZ: "ARI", BLT: "BAL", CLV: "CLE", LA: "LAR", WAS: "WSH", JAC: "JAX" };
function textSpot(text, re, home, away) {
  const m = re.exec(text || "");
  if (!m) return null;
  const code = PBP_TEAM[m[1]] || m[1], n = Math.max(0, Math.min(50, +m[2]));
  return code === home.abbr ? n : code === away.abbr ? 100 - n : null;
}

// ---------- On-field graphic for live games ----------
// ESPN yard lines run 0 (home team's goal line) to 100 (away team's goal line). The away end zone
// is drawn on the left and the home end zone on the right, matching the scoreboard above it.
function fieldGraphic(g) {
  const f = g.field;
  if (!f) return "";
  const { home, away } = g;
  // Ball spot from ESPN's text ("CIN 34"), which can't be mirrored; fall back to the raw yard line.
  let spot = null;
  const m = /^([A-Z]{2,4})\s+(\d{1,2})$/.exec(f.possText || "");
  if (m) spot = m[1] === home.abbr ? +m[2] : m[1] === away.abbr ? 100 - +m[2] : null;
  else if (/^50$/.test(f.possText || "")) spot = 50;
  if (spot == null && f.yardLine != null) spot = f.yardLine;
  if (spot == null) return "";
  // If the raw yard lines look mirrored relative to the spot, flip them (only for the newest play;
  // an earlier one shown during a stoppage won't line up with the current spot).
  const shown = shownPlay(g);
  let lp = shown?.lp, driveStart = f.driveStart;
  if (lp?.end != null && !shown.earlier && Math.abs(100 - lp.end - spot) + 1 < Math.abs(lp.end - spot)) {
    lp = { ...lp, start: lp.start == null ? null : 100 - lp.start, end: 100 - lp.end };
    driveStart = driveStart == null ? null : 100 - driveStart;
  }
  const homeBall = g.possession === home.proId, awayBall = g.possession === away.proId;
  const dir = homeBall ? 1 : awayBall ? -1 : 0; // +1 drives toward the away goal (left)
  const poss = homeBall ? home : awayBall ? away : null;
  // S = drawing units per yard. Phones get a shorter field so it isn't a thin strip.
  const narrow = window.innerWidth < 640;
  const S = narrow ? 5 : 10, EZ = 10 * S, W = 120 * S;
  const x = (a) => EZ + (100 - Math.min(100, Math.max(0, a))) * S;
  const goal = /goal/i.test(g.downDistance || "");
  const fd = dir && f.distance && !goal ? spot + dir * f.distance : null;
  const possColor = poss?.color || "#ffffff";

  const parts = [];
  // Grass with 10-yard stripes, end zones in team colors.
  parts.push(`<rect x="${EZ}" y="30" width="${100 * S}" height="120" fill="#2e7d32"/>`);
  for (let a = 0; a < 100; a += 20) parts.push(`<rect x="${x(a + 10)}" y="30" width="${10 * S}" height="120" fill="#348a39"/>`);
  parts.push(`<rect x="0" y="30" width="${EZ}" height="120" fill="${away.color || "#555"}"/><rect x="${W - EZ}" y="30" width="${EZ}" height="120" fill="${home.color || "#555"}"/>`);
  parts.push(`<text x="${EZ / 2}" y="90" class="ez" transform="rotate(-90 ${EZ / 2} 90)">${esc(away.abbr)}</text><text x="${W - EZ / 2}" y="90" class="ez" transform="rotate(90 ${W - EZ / 2} 90)">${esc(home.abbr)}</text>`);
  // Red zone and the current drive.
  if (g.redZone && dir) { const gl = dir > 0 ? 100 : 0; parts.push(`<rect x="${Math.min(x(gl), x(gl - dir * 20))}" y="30" width="${20 * S}" height="120" fill="#e53935" opacity=".22"/>`); }
  if (driveStart != null && poss) parts.push(`<rect x="${Math.min(x(driveStart), x(spot))}" y="30" width="${Math.abs(x(driveStart) - x(spot))}" height="120" fill="${possColor}" opacity=".3"/>`);
  // Yard lines and numbers.
  for (let a = 5; a < 100; a += 5) parts.push(`<line x1="${x(a)}" x2="${x(a)}" y1="30" y2="150" stroke="#fff" stroke-opacity="${a % 10 ? 0.25 : 0.6}" stroke-width="2"/>`);
  for (let a = 10; a < 100; a += 10) parts.push(`<text x="${x(a)}" y="146" class="yd">${a <= 50 ? a : 100 - a}</text>`);
  parts.push(`<line x1="${EZ}" x2="${EZ}" y1="30" y2="150" stroke="#fff" stroke-width="4"/><line x1="${W - EZ}" x2="${W - EZ}" y1="30" y2="150" stroke="#fff" stroke-width="4"/>`);
  // First-down line (yellow) and line of scrimmage (blue).
  if (fd != null && fd > 0 && fd < 100) parts.push(`<line x1="${x(fd)}" x2="${x(fd)}" y1="30" y2="150" stroke="#fdd835" stroke-width="5"/>`);
  parts.push(`<line x1="${x(spot)}" x2="${x(spot)}" y1="30" y2="150" stroke="#42a5f5" stroke-width="5"/>`);
  // Last play, drawn from where the ball actually started to where it ended:
  //   pass: arc + arrowhead · incomplete: dotted arc ending in an X · run: straight arrow
  //   sack: straight arrow back, red · kick/punt/FG: high arc · penalty: yellow flag + dashed line
  //   interception/fumble lost: red line + label. Yardage comes from the spots, not ESPN's stat line.
  if (lp && lp.start != null && lp.end != null) {
    const text = shown.text || "";
    const kind = playKind(lp.type, text);
    const offDir = lp.teamId === home.proId ? 1 : lp.teamId === away.proId ? -1 : dir || 1; // direction the snapping team moves
    let endA = lp.end;
    if (kind === "incomplete") endA = lp.start + offDir * (/deep/i.test(text) ? 20 : 8); // no target spot recorded
    const xs = x(lp.start), xe = x(endA), Y = 96, mid = (xs + xe) / 2;
    const gained = Math.round((lp.end - lp.start) * offDir);
    const ydsTxt = (n) => `${n > 0 ? "+" : ""}${n} yds`;
    const tag = (txt, y, cls = "lp-yds") => parts.push(`<text x="${Math.min(W - EZ - 30, Math.max(EZ + 30, mid))}" y="${y}" class="${cls}">${esc(txt)}</text>`);
    const far = Math.abs(xe - xs) >= 4;
    if (kind === "penalty") {
      // Yellow flag at the spot of the foul; dashed line to where the ball was placed.
      const pen = /PENALTY on [^,]*?,\s*([^,]+?),\s*(\d+)\s*yards?/i.exec(text);
      const what = flagName(text);
      const noPlay = /no play|nullified/i.test(text);
      if (far) parts.push(`<path d="M${xs} ${Y} L${xe} ${Y}" stroke="#fdd835" stroke-width="4" stroke-dasharray="10 7" marker-end="url(#arrowy-${esc(g.id)})"/>`);
      parts.push(`<path d="M${xs} ${Y + 14} L${xs} ${Y - 26}" stroke="#fff" stroke-width="3"/><path d="M${xs} ${Y - 26} L${xs + 22} ${Y - 20} L${xs} ${Y - 12} z" fill="#fdd835" stroke="#c9a400" stroke-width="1.5"/>`);
      tag(`🚩 ${what}${pen ? ` · ${gained === 0 ? "offsetting" : ydsTxt(gained)}` : ""}${noPlay ? " · no play" : ""}`, Y - 34, "lp-yds lp-pen");
    } else if (kind === "turnover" || kind === "fumble") {
      // Turnover: the play up to where the ball changed hands (from the play text), a red X there,
      // then a red arrow back the other way for the return.
      const isInt = /INTERCEPT/i.test(text) || /interception/i.test(lp.type);
      const flip = textSpot(text, isInt ? /INTERCEPTED by .*? at ([A-Z]{2,3}) (-?\d+)/ : /RECOVERED by .*? at ([A-Z]{2,3}) (-?\d+)/, home, away);
      const xt = flip != null ? x(flip) : xs;
      if (flip != null && Math.abs(xt - xs) >= 4) {
        parts.push(isInt ? `<path d="M${xs} ${Y} Q${(xs + xt) / 2} ${Y - 2 * Math.min(38, 14 + Math.abs(xt - xs) / 8)} ${xt} ${Y}" fill="none" stroke="#fff" stroke-width="4" stroke-dasharray="8 6"/>`
          : `<path d="M${xs} ${Y} L${xt} ${Y}" stroke="#fff" stroke-width="4"/>`);
      }
      if (Math.abs(xe - xt) >= 4) parts.push(`<path d="M${xt} ${Y + 6} L${xe} ${Y + 6}" stroke="#ef5350" stroke-width="4" marker-end="url(#arrowr-${esc(g.id)})"/>`);
      parts.push(`<path d="M${xt - 9} ${Y - 9} L${xt + 9} ${Y + 9} M${xt + 9} ${Y - 9} L${xt - 9} ${Y + 9}" stroke="#ef5350" stroke-width="5" stroke-linecap="round"/>`);
      const ret = Math.round(Math.abs(lp.end - (flip ?? lp.start)));
      tag(`${isInt ? "Interception" : "Fumble lost"}${ret >= 2 ? ` · ${ret} yd return` : ""}${/touchdown/i.test(lp.type + text) ? " · TD" : ""}`, Y - 16, "lp-yds lp-to");
    } else if (kind === "kick") {
      // Kicks: a high arc to where the ball came down, then (if returned) an arrow back the other way.
      const kd = /(?:kicks|punts) (\d+) yards?/i.exec(text)?.[1], fgd = /(\d+) yard field goal/i.exec(text)?.[1];
      let land = /to (?:the )?end zone|touchback/i.test(text) ? (lp.start > 50 ? 0 : 100)
        : textSpot(text, /(?:kicks|punts) \d+ yards? (?:from [A-Z]{2,3} -?\d+ )?to ([A-Z]{2,3}) (-?\d+)/, home, away);
      if (/field goal|extra point/i.test(lp.type)) land = lp.end;
      if (land == null) land = lp.end;
      const xl = x(land), lift = Math.min(52, 22 + Math.abs(xl - xs) / 6);
      if (Math.abs(xl - xs) >= 4) parts.push(`<path d="M${xs} ${Y} Q${(xs + xl) / 2} ${Y - lift * 2} ${xl} ${Y}" fill="none" stroke="#fff" stroke-width="4" stroke-dasharray="14 6" ${Math.abs(xe - xl) < 4 ? `marker-end="url(#arrow-${esc(g.id)})"` : ""}/>`);
      const ret = Math.round(Math.abs(lp.end - land));
      if (ret >= 1 && !/field goal|extra point/i.test(lp.type)) parts.push(`<path d="M${xl} ${Y + 6} L${xe} ${Y + 6}" stroke="#fff" stroke-width="4" marker-end="url(#arrow-${esc(g.id)})"/>`);
      const good = /good/i.test(lp.type) || /is GOOD/.test(text);
      const what = /punt/i.test(lp.type) ? `Punt${kd ? ` ${kd} yds` : ""}${/fair catch/i.test(text) ? " · fair catch" : /touchback/i.test(text) ? " · touchback" : ret >= 1 ? ` · ${ret} yd return` : ""}`
        : /field goal/i.test(lp.type) ? `FG${fgd ? ` ${fgd} yds` : ""} ${good ? "✓" : "✗"}`
        : /extra point/i.test(lp.type) ? `XP ${good ? "✓" : "✗"}`
        : `Kickoff${kd ? ` ${kd} yds` : ""}${/touchback/i.test(text) ? " · touchback" : ret >= 1 ? ` · ${ret} yd return` : ""}`;
      tag(`${what}${hasFlag(text) ? ` · 🚩 ${flagName(text)}` : ""}`, Math.max(54, Y - lift - 8));
    } else if (far) {
      const aerial = kind === "pass" || kind === "incomplete";
      const lift = aerial ? Math.min(38, 14 + Math.abs(xe - xs) / 8) : 0;
      const path = aerial ? `M${xs} ${Y} Q${mid} ${Y - lift * 2} ${xe} ${Y}` : `M${xs} ${Y} L${xe} ${Y}`;
      const color = kind === "sack" || kind === "safety" ? "#ef5350" : "#fff";
      const tagY = aerial ? Math.max(54, Y - lift - 8) : Y - 12;
      if (kind === "incomplete") {
        parts.push(`<path d="${path}" fill="none" stroke="#fff" stroke-width="4" stroke-dasharray="2 9" stroke-linecap="round"/>`);
        parts.push(`<path d="M${xe - 9} ${Y - 9} L${xe + 9} ${Y + 9} M${xe + 9} ${Y - 9} L${xe - 9} ${Y + 9}" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`);
        tag("Incomplete", tagY);
      } else {
        parts.push(`<path d="${path}" fill="none" stroke="${color}" stroke-width="4" marker-end="url(#${color === "#fff" ? "arrow" : "arrowr"}-${esc(g.id)})"/>`);
        tag(kind === "sack" ? `Sack · ${ydsTxt(gained)}` : kind === "safety" ? "Safety" : `${ydsTxt(gained)}${/touchdown/i.test(lp.type) ? " · TD" : ""}`, tagY, kind === "sack" || kind === "safety" ? "lp-yds lp-to" : "lp-yds");
      }
    }
  }
  const arrowWord = dir > 0 ? "←" : dir < 0 ? "→" : "";
  const label = `${poss ? `${poss.abbr} ball ` : ""}${g.downDistance || ""}`.trim();
  return `<div class="field-wrap">
    <svg class="field ${narrow ? "narrow" : ""}" viewBox="0 ${narrow ? 26 : 0} ${W} ${narrow ? 128 : 160}" role="img" aria-label="${esc(label || "Field position")}">
      <defs>${[["arrow", "#fff"], ["arrowy", "#fdd835"], ["arrowr", "#ef5350"]].map(([id, fill]) => `<marker id="${id}-${esc(g.id)}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${fill}"/></marker>`).join("")}</defs>
      ${parts.join("")}
    </svg>
    <div class="field-caption">${poss ? `<strong>${esc(poss.abbr)}</strong> ball ${arrowWord} · ` : ""}${esc(g.downDistance || f.possText || "")}${f.driveDesc ? ` <span class="muted">· Drive: ${esc(f.driveDesc)}</span>` : ""}</div>
  </div>`;
}

// ---------- Live games ----------
const LIVE_POLL_MS = 30000, IDLE_POLL_MS = 120000;

// The week the Live games tab shows: whichever week is selected (current week until one is picked).
const liveSp = () => state.week?.sp || state.base.scoringPeriodFor(state.base.current);
const isCurrentSp = (sp) => sp === state.base.scoringPeriodFor(state.base.current);

async function fetchLive() {
  const sp = liveSp();
  if (state.demo) return window.DemoLeague.live(sp);
  const q = new URLSearchParams({ scoringPeriodId: sp });
  if (state.leagueId) q.set("leagueId", state.leagueId);
  if (state.season) q.set("season", state.season);
  let res, body;
  try {
    res = await fetch(`/api/live?${q}`);
    body = await res.json();
  } catch {
    throw new ApiError("no_function", "Couldn't reach the live games function. Make sure netlify/functions/live.mjs is uploaded.");
  }
  if (!res.ok) throw new ApiError(body.error, body.message || `Request failed (${res.status})`);
  return body;
}

// Refresh live data, note which players just scored, and schedule the next refresh.
async function refreshLive() {
  clearTimeout(state.liveTimer);
  try {
    const base = state.base;
    const data = await fetchLive();
    if (state.base !== base) return; // league changed while loading
    if (data.sp != null && data.sp !== liveSp()) return; // week changed while loading
    // Same week as the last load: compare for score bumps and scoring alerts. New week: start fresh.
    const old = state.live && !state.live.error && state.live.sp === data.sp ? state.live : null;
    if (!old) state.livePrev = {};
    else if (isCurrentSp(data.sp)) liveAlerts(old, data);
    const prev = state.livePrev;
    const same = state.live && !state.live.error && JSON.stringify({ ...state.live, updated: 0 }) === JSON.stringify({ ...data, updated: 0 });
    state.liveBumps = {};
    for (const p of data.players) {
      if (p.pts != null && prev[p.id] != null && p.pts !== prev[p.id]) state.liveBumps[p.id] = p.pts - prev[p.id];
      prev[p.id] = p.pts;
    }
    state.live = data;
    state.liveSame = same;
  } catch (e) {
    if (!state.live || state.live.error) state.live = { error: e.message };
    state.liveSame = false;
  }
  if (state.tab === "live" && !state.liveSame) keepState($("view-live"), renderLive);
  // While games are on, keep polling from any tab so scoring alerts still pop up.
  const anyLive = state.live?.games?.some((g) => g.state === "in") && isCurrentSp(state.live.sp);
  state.liveTimer = setTimeout(() => {
    if (document.visibilityState === "visible" && (state.tab === "live" || anyLive)) refreshLive();
    else state.liveStale = true;
  }, anyLive ? LIVE_POLL_MS : IDLE_POLL_MS);
}

// ---------- Scoring alerts ----------
// A banner drops in at the top for 5 seconds when a fantasy starter (any team, D/ST included) scores a
// touchdown, crosses a yardage bonus the league pays for, or gains 15+ points between two refreshes.
const TD_STATS = [4, 25, 43, 63, 93, 101, 102, 103, 104];
const BONUSES = [[17, 3, 300, "300-yd passing bonus"], [18, 3, 400, "400-yd passing bonus"], [37, 24, 100, "100-yd rushing bonus"],
  [38, 24, 200, "200-yd rushing bonus"], [56, 42, 100, "100-yd receiving bonus"], [57, 42, 200, "200-yd receiving bonus"]];
// What a touchdown was: "11-yd receiving TD", "Interception return TD".
const TD_KIND = { 4: [3, "passing TD"], 25: [24, "rushing TD"], 43: [42, "receiving TD"], 63: [null, "Fumble recovery TD"],
  93: [null, "Blocked kick return TD"], 101: [null, "Kickoff return TD"], 102: [null, "Punt return TD"], 103: [null, "Interception return TD"], 104: [null, "Fumble return TD"] };
function liveAlerts(old, data) {
  const before = new Map(old.players.map((p) => [String(p.id), p]));
  const items = state.base.raw.settings?.scoringSettings?.scoringItems || [];
  const paid = new Set(items.map((i) => i.statId));
  const n = (p, id) => Number(p.stats?.[id] || 0);
  const events = [];
  // Fantasy points for a stat change under this league's scoring (D/ST overrides included).
  const ptsFor = (statId, delta, p) => {
    const it = items.find((i) => i.statId === statId);
    if (!it) return 0;
    const v = it.pointsOverrides?.[p.posId === 16 ? 16 : p.slotId] ?? it.points;
    return delta * v;
  };
  for (const p of data.players) {
    if (!p.teamId || p.slotId == null || p.slotId === BENCH || p.slotId === IR) continue;
    const o = before.get(String(p.id));
    if (!o) continue;
    const why = [], tds = [];
    for (const id of TD_STATS) {
      const k = n(p, id) - n(o, id);
      if (k <= 0) continue;
      const [ydStat, label] = TD_KIND[id], yds = ydStat != null ? n(p, ydStat) - n(o, ydStat) : 0;
      tds.push(id);
      why.push(["🏈", `${k > 1 ? `${k} ` : ""}${ydStat != null && k === 1 && yds > 0 ? `${yds}-yd ${label}` : ydStat != null ? label[0].toUpperCase() + label.slice(1) + (k > 1 ? "s" : "") : label}`]);
    }
    for (const [sid, stat, at, label] of BONUSES) if (paid.has(sid) && n(o, stat) < at && n(p, stat) >= at) why.push(["💰", label]);
    // Points from everything that changed since the last refresh (the catch, the yards, the TD, any
    // bonus), using the league's scoring. ESPN's own running total is the fallback.
    const statIds = new Set([...Object.keys(p.stats || {}), ...Object.keys(o.stats || {})].map(Number));
    let gain = items.length ? 0 : (p.pts ?? 0) - (o.pts ?? 0);
    if (items.length) {
      for (const id of statIds) if (![120, 127].includes(id)) gain += ptsFor(id, n(p, id) - n(o, id), p);
      for (const [sid, stat, at] of BONUSES) if (paid.has(sid) && n(o, stat) < at && n(p, stat) >= at) gain += ptsFor(sid, 1, p);
      if (Math.abs(gain - ((p.pts ?? 0) - (o.pts ?? 0))) > 0.05 && p.posId === 16) gain = (p.pts ?? 0) - (o.pts ?? 0); // D/ST tiers: trust ESPN
    }
    gain = Math.round(gain * 10) / 10;
    if (gain >= 15 && !why.length) why.push(["⚡", "Big play"]);
    if (why.length) events.push({ p, why, gain, pass: tds.includes(4), catch: tds.includes(43) });
  }
  // One play, one banner: a passing TD and the catch that scored it (same NFL team) share a banner.
  for (const qb of events.filter((e) => e.pass)) {
    const rec = events.find((e) => e.catch && !e.merged && e !== qb && e.p.proId === qb.p.proId);
    if (rec) { rec.merged = true; qb.with = rec; }
  }
  for (const e of events.filter((x) => !x.merged)) queueAlert(e.with ? [e, e.with] : [e]);
}
function queueAlert(group) {
  (state.alerts ||= []).push(group);
  if (!state.alertShowing) nextAlert();
}
function nextAlert() {
  const g = state.alerts?.shift();
  state.alertShowing = !!g;
  if (!g) return;
  const mine = g.some((e) => String(e.p.teamId) === String(myTeamId()));
  // Headline: every reason once ("25-yd passing TD · 100-yd receiving bonus"); then one line per player.
  // (A TD pass and its catch are the same play: the receiver's "receiving TD" is left out.)
  const reasons = [...new Map(g.flatMap((e, i) => e.why.filter(([, w]) => !(i > 0 && /receiving TD/.test(w)))).map(([icon, w]) => [w, icon]))];
  const line = (e) => {
    const t = team(e.p.teamId);
    return `<div class="fx-who"><strong>${esc(g.length > 1 ? shortName(e.p.name) : e.p.name)}</strong> <span>${esc(POS[e.p.posId] || "")} · ${logoImg(t, 14)} ${esc(t.abbrev)}</span>${g.length > 1 ? ` <b class="fx-mini">${e.gain > 0 ? `+${f1(e.gain)} → ` : ""}${f2(e.p.pts ?? 0)}</b>` : ""}</div>`;
  };
  // Combined points only when they all count for the same fantasy team.
  const total = new Set(g.map((e) => String(e.p.teamId))).size === 1 ? sum(g, (e) => e.gain) : 0;
  const el = document.createElement("div");
  el.className = `fx-alert ${mine ? "mine" : ""}`;
  el.setAttribute("role", "status");
  // Right side: points from the play, and the player's new total (two-player banners show both per line).
  const right = g.length === 1 ? `<div class="fx-pts">${total > 0 ? `+${f1(total)}` : ""}<small>${f2(g[0].p.pts ?? 0)} pts</small></div>`
    : total > 0 ? `<div class="fx-pts">+${f1(total)}</div>` : "";
  el.innerHTML = `${headshot(g[0].p, 40)}
    <div class="fx-body"><div class="fx-what">${reasons.map(([w]) => esc(w)).join(" · ")}</div>${g.map(line).join("")}</div>${right}`;
  let timer, gone = false;
  const finish = (ms) => { gone = true; clearTimeout(timer); setTimeout(() => { el.remove(); nextAlert(); }, ms); };
  const dismiss = () => {
    if (gone) return;
    el.style.transform = el.style.opacity = "";
    el.classList.remove("show");
    finish(300);
  };
  // Swipe it away (sideways or up); a tap opens the player. Holding it pauses the 5-second timer.
  let sx = 0, sy = 0, dragging = false, moved = false;
  const offset = (e) => [e.clientX - sx, Math.min(0, e.clientY - sy)];
  el.addEventListener("pointerdown", (e) => {
    if (gone) return;
    sx = e.clientX; sy = e.clientY; dragging = true; moved = false;
    clearTimeout(timer);
    el.setPointerCapture(e.pointerId);
    el.style.transition = "none";
  });
  el.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const [dx, dy] = offset(e);
    if (Math.abs(dx) > 6 || dy < -6) moved = true;
    el.style.transform = `translate(calc(-50% + ${dx}px), ${dy}px)`;
    el.style.opacity = String(1 - Math.min(0.8, Math.max(Math.abs(dx) / 300, -dy / 150)));
  });
  const release = (e) => {
    if (!dragging) return;
    dragging = false;
    const [dx, dy] = offset(e);
    el.style.transition = "transform .22s ease-out, opacity .22s ease-out";
    if (Math.abs(dx) > 70 || dy < -30) {
      el.style.transform = Math.abs(dx) > 70 ? `translate(calc(-50% + ${Math.sign(dx) * innerWidth}px), ${dy}px)` : "translate(-50%, -160%)";
      el.style.opacity = "0";
      finish(230);
      return;
    }
    el.style.transform = el.style.opacity = "";
    setTimeout(() => { el.style.transition = ""; }, 230);
    if (!moved && e.type === "pointerup") { dismiss(); openPlayer(g[0].p.id); return; }
    timer = setTimeout(dismiss, 2500); // let go without swiping: it stays a little longer
  };
  el.addEventListener("pointerup", release);
  el.addEventListener("pointercancel", release);
  document.body.append(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("show")));
  timer = setTimeout(dismiss, 5000);
}

function renderLive() {
  const el = $("view-live");
  if (state.live?.sp != null && state.live.sp !== liveSp()) state.live = null; // a different week was picked
  ensureWeather(state.live?.sp || state.week?.sp); // game-day forecasts fill in when they arrive
  const L = state.live;
  if (!L || state.liveStale) {
    state.liveStale = false;
    if (!L) el.innerHTML = `<div class="loading"><span class="spinner"></span> Loading NFL games…</div>`;
    refreshLive();
    if (!L) return;
  }
  if (L.error) { el.innerHTML = `<div class="banner">${esc(L.error)}</div>`; return; }

  const f = state.liveFilter;
  const order = { in: 0, pre: 1, post: 2 };
  const games = [...L.games].sort((a, b) => order[a.state] - order[b.state] || new Date(a.date) - new Date(b.date));
  const counts = { in: 0, pre: 0, post: 0 };
  for (const g of games) counts[g.state]++;
  const byPro = {};
  for (const p of L.players) (byPro[p.proId] ||= []).push(p);
  // Fantasy owners of players in the box scores.
  const rosteredBy = new Map(L.players.filter((p) => p.teamId).map((p) => [String(p.id), p.teamId]));
  state.boxUi ||= {};

  const kickoff = (g) => new Date(g.date).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
  // Fantasy owner and lineup slot: full on desktop ("Gridiron Gurus · Starting · QB"), short on phones ("GG · QB").
  const role = (p) => {
    if (!p.teamId) return `<span class="role fa"><span class="nm-full">Free agent</span><span class="nm-short">FA</span></span>`;
    const t = team(p.teamId);
    const slot = p.slotId === BENCH ? `<span class="role bench"><span class="nm-full">Bench</span><span class="nm-short">BN</span></span>`
      : p.slotId === IR ? `<span class="role bench">IR</span>`
      : p.slotId != null ? `<span class="role start"><span class="nm-full">Starting · </span>${esc(SLOT[p.slotId] || "")}</span>` : "";
    return `${logoImg(t, 16)}<span class="nm-full">${esc(t.name)}</span><span class="nm-short">${esc(t.abbrev)}</span> ${slot}`;
  };
  // One player's half of a row, styled like the matchup breakdown. The right-hand team is mirrored.
  const side = (p, g, right) => {
    if (!p) return `<div class="mx-side ${right ? "right" : ""} empty"></div>`;
    const bump = state.liveBumps[p.id];
    const pts = g.state === "pre" ? "–" : ptsLink(p.id, L.sp, f2(p.pts ?? 0));
    // Offense: their team has the ball. D/ST: the other team has the ball.
    const onField = g.state === "in" && !!g.possession && (p.posId === 16 ? g.possession !== p.proId : g.possession === p.proId);
    const cls = g.state === "in" ? `is-live ${onField ? (g.redZone ? "is-rz" : "is-poss") : ""}` : g.state === "post" ? "is-final" : "";
    const line = compactLine(p.posId, p.stats);
    return `<div class="mx-side ${right ? "right" : ""} ${cls} ${bump ? "bump" : ""}">
      <div class="mx-info">
        <div class="mx-name">${plinkNm(p)} <span class="muted small">${POS[p.posId] || ""}</span>${injBadge({ injury: p.injury })}</div>
        <div class="mx-game lv-owner">${role(p)}</div>
        ${line && g.state !== "pre" ? `<div class="mx-stats" title="${esc(statLine(p.posId, p.stats))}">${esc(line)}</div>` : ""}
      </div>
      <div class="mx-pts"><div class="mx-score">${pts}</div>${bump ? `<div class="lp-delta ${bump > 0 ? "pos" : "neg"}">${signed(bump)}</div>` : ""}<div class="mx-proj">${f1(p.proj)}</div></div>
    </div>`;
  };
  const teamList = (proId, g) => {
    let list = byPro[proId] || [];
    if (f.show === "rostered") list = list.filter((p) => p.teamId);
    if (f.team !== "ALL") list = list.filter((p) => String(p.teamId) === String(f.team));
    return [...list].sort((a, b) => (g.state === "pre" ? b.proj - a.proj : (b.pts ?? 0) - (a.pts ?? 0) || b.proj - a.proj));
  };
  // Both teams side by side: away on the left (matching the scoreboard and field), home on the right.
  const playerRows = (g) => {
    const left = teamList(g.away.proId, g), right = teamList(g.home.proId, g);
    if (!left.length && !right.length) return `<p class="muted small lv-none">No ${f.show === "rostered" ? "rostered " : ""}players${f.team !== "ALL" ? " for this team" : ""} in this game.</p>`;
    const rows = Array.from({ length: Math.max(left.length, right.length) }, (_, i) =>
      `<div class="mx-row lv-row">${side(left[i], g, false)}<div class="mx-slot"></div>${side(right[i], g, true)}</div>`);
    return `<div class="mx-row lv-head"><div>${esc(g.away.name || g.away.abbr)}</div><div class="mx-slot"></div><div class="right">@ ${esc(g.home.name || g.home.abbr)}</div></div>
      <div class="mx-rows">${rows.join("")}</div>`;
  };
  const scoreSide = (s, g, right) => {
    const won = g.state === "post" && s.score > (s === g.home ? g.away.score : g.home.score);
    return `<div class="g-team ${right ? "right" : ""} ${won ? "won" : ""}">
      <img class="g-logo" src="${esc(s.logo)}" alt="" width="36" height="36" loading="lazy">
      <div class="g-name"><strong>${right ? `<span class="g-at">@</span>` : ""}${esc(s.abbr)}</strong>${g.possession === s.proId ? ` <span class="poss" title="Has the ball">🏈</span>` : ""}<span class="muted small">${esc(s.record)}</span></div>
      <div class="g-score">${g.state === "pre" ? "" : s.score ?? ""}${g.state === "in" && s.timeouts != null ? `<div class="g-to" title="${s.timeouts} timeout${s.timeouts === 1 ? "" : "s"} left">${[0, 1, 2].map((i) => `<i class="${i < s.timeouts ? "on" : ""}"></i>`).join("")}</div>` : ""}</div>
    </div>`;
  };
  // Down & distance and where the ball is, under the clock: "3rd & 4 at TEN 15".
  const ddLine = (g) => {
    if (g.state !== "in") return "";
    const m = /^(.*?)\s+at\s+(.+)$/.exec(g.downDistance || "");
    const dd = m ? m[1] : g.downDistance || "", spot = m ? m[2] : g.field?.possText || "";
    return dd || spot ? `<div class="g-dd">${dd ? `<strong>${esc(dd)}</strong>` : ""}${spot ? ` <span>at ${esc(spot)}</span>` : ""}</div>` : "";
  };
  // pinned = shown in the desktop side pane (always open, nothing to toggle).
  const gameCard = (g, pinned = false) => {
    const status = g.state === "in" ? `<span class="badge live">LIVE</span> <strong>${esc(g.detail)}</strong>`
      : g.state === "post" ? `<span class="badge final">FINAL</span>` : `<strong>${esc(kickoff(g))}</strong>`;
    // The field graphic shows down & distance itself; fall back to text when ESPN sends no field position.
    const graphic = g.state === "in" ? fieldGraphic(g) : "";
    const sit = g.state === "in" && (g.downDistance || g.redZone)
      ? `<div class="g-sit">${graphic ? "" : g.downDistance ? esc(g.downDistance) : ""}${g.redZone ? ` <span class="badge out">RED ZONE</span>` : ""}</div>` : "";
    const open = pinned || !!state.liveOpen?.[g.id];
    const lastPlay = `${(() => {
        if (g.state !== "in") return "";
        const sp = shownPlay(g), stop = g.field?.lastPlay && playKind(g.field.lastPlay.type, g.lastPlay) === "stoppage";
        return `${stop ? `<div class="g-last small"><strong>${esc(g.lastPlay)}</strong></div>` : ""}${sp?.text ? `<div class="g-last small muted">${sp.earlier ? "Last snap" : "Last play"}: ${esc(sp.text)}</div>` : !stop && g.lastPlay ? `<div class="g-last small muted">Last play: ${esc(g.lastPlay)}</div>` : ""}`;
      })()}`;
    const sbScore = (sd) => (g.state === "pre" ? "" : sd.score ?? "");
    return `<div class="card game state-${g.state} ${open ? "open" : ""} ${pinned ? "pinned" : ""}" data-game="${esc(g.id)}">
      <div class="g-top" ${pinned ? "" : `data-gtoggle role="button" tabindex="0" aria-expanded="${open}" title="${open ? "Tap to close" : "Tap for players, stats & weather"}"`}>
      <div class="g-head">
        ${scoreSide(g.away, g, false)}
        <div class="g-status">${status}${ddLine(g)}${g.broadcast && g.state !== "in" ? `<div class="muted small">${esc(g.broadcast)}</div>` : ""}</div>
        ${scoreSide(g.home, g, true)}
      </div>
      ${pinned ? `${graphic}${sit}${lastPlay}` : ""}
      </div>
      ${pinned ? "" : stickBar(`<span class="sb-team"><img src="${esc(g.away.logo)}" alt="" width="18" height="18">${esc(g.away.abbr)}</span><strong>${sbScore(g.away)}</strong><span class="sb-mid">${g.state === "in" ? esc(g.detail) : g.state === "post" ? "Final" : esc(kickoff(g))}${g.state === "in" && g.downDistance ? ` · ${esc(g.downDistance.replace(/ at .*/, ""))}` : ""}</span><strong>${sbScore(g.home)}</strong><span class="sb-team">${esc(g.home.abbr)}<img src="${esc(g.home.logo)}" alt="" width="18" height="18"></span>`)}
      <div class="collapse ${open ? "open" : ""}" ${open ? "" : "inert"}><div class="collapse-inner">
      ${pinned ? "" : `${graphic}${sit}${lastPlay}`}
      ${g.state === "pre" ? "" : `<button type="button" class="bx-toggle ${state.boxUi[g.id]?.open ? "open" : ""}" data-bx="${esc(g.id)}" data-toggle="1" aria-expanded="${!!state.boxUi[g.id]?.open}">📊 Player stats <span class="caret">▾</span></button>`}
      ${state.boxUi[g.id]?.open ? boxPanel(g, rosteredBy) : ""}
      ${g.state === "post" ? "" : wxLine(wxGame(g.home.proId, L.sp))}
      <div class="lv-players mx">${playerRows(g)}</div>
      </div></div>
    </div>`;
  };

  const teamOpts = Object.values(state.base.teams).sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => `<option value="${t.id}" ${String(f.team) === String(t.id) ? "selected" : ""}>${esc(t.name)}</option>`).join("");
  // Desktop list: each game as the same condensed score header used on phones.
  const gameTile = (g) => {
    const status = g.state === "in" ? `<span class="badge live">LIVE</span> <strong>${esc(g.detail)}</strong>${g.redZone ? ` <span class="badge out">RZ</span>` : ""}`
      : g.state === "post" ? `<span class="badge final">FINAL</span>` : `<strong>${esc(kickoff(g))}</strong>`;
    return `<div class="card game game-tile state-${g.state} ${state.liveSel === g.id ? "selected" : ""}" data-gsel="${esc(g.id)}" role="button" tabindex="0">
      <div class="g-head">${scoreSide(g.away, g, false)}<div class="g-status">${status}${ddLine(g)}</div>${scoreSide(g.home, g, true)}</div></div>`;
  };
  const split = MU_SPLIT.matches;
  if (split && !games.some((g) => g.id === state.liveSel)) state.liveSel = (games.find((g) => g.state === "in") || games[0])?.id;
  const selGame = games.find((g) => g.id === state.liveSel);
  const summary = [counts.in && `${counts.in} live`, counts.pre && `${counts.pre} upcoming`, counts.post && `${counts.post} final`].filter(Boolean).join(" · ");
  const updated = new Date(L.updated).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });

  el.innerHTML = `<div class="section-head"><h2>NFL week ${L.sp} ${counts.in ? `<span class="badge live">LIVE</span>` : ""}</h2>
      <span class="muted small" title="${counts.in ? "Refreshes every 30 seconds" : ""}">Updated ${updated}</span></div>
    <div class="filters">
      <div class="seg" id="lv-show"><button data-s="rostered" class="${f.show === "rostered" ? "active" : ""}">Rostered players</button><button data-s="all" class="${f.show === "all" ? "active" : ""}">All players</button></div>
      <select id="lv-team" aria-label="Fantasy team"><option value="ALL">All fantasy teams</option>${teamOpts}</select>
    </div>
    ${L.byes?.length ? `<p class="muted small">On bye: ${L.byes.map(esc).join(", ")}</p>` : ""}
    ${!games.length ? `<p class="muted">No NFL games found for this week.</p>`
      : split ? `<div class="mu-split lv-split"><div class="mu-list">${games.map(gameTile).join("")}</div><div class="mu-pane" id="lv-pane">${selGame ? gameCard(selGame, true) : ""}</div></div>`
      : `<div class="games">${games.map((g) => gameCard(g)).join("")}</div>`}${games.some((g) => g.state !== "post") ? wxCredit() : ""}`;
  $("lv-show").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { f.show = b.dataset.s; renderLive(); }));
  $("lv-team").addEventListener("change", (e) => { f.team = e.target.value; renderLive(); });
  // Desktop: pick a game from the list.
  el.querySelectorAll("[data-gsel]").forEach((b) => b.addEventListener("click", () => {
    if (state.liveSel === b.dataset.gsel) return;
    state.liveSel = b.dataset.gsel;
    renderLive();
    const pane = $("lv-pane");
    if (pane) { pane.scrollTop = 0; pane.classList.add("swap"); }
  }));
  // Open/close a game (slides; no redraw). Games start collapsed: header and field only.
  state.liveOpen ||= {};
  el.querySelectorAll("[data-gtoggle]").forEach((b) => {
    const go = () => {
      const card = b.closest(".card.game"), id = card.dataset.game, open = !state.liveOpen[id];
      state.liveOpen[id] = open;
      card.classList.toggle("open", open);
      setOpen(card.querySelector(":scope > .collapse"), open);
      card.querySelectorAll("[data-gtoggle]").forEach((x) => { x.setAttribute("aria-expanded", open); x.title = open ? "Tap to close" : "Tap for players, stats & weather"; });
      setTimeout(updateStickies, 320);
    };
    b.addEventListener("click", go);
    b.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
  });
  // Box score: open/close, Player/Team stats, and which team's players.
  el.querySelectorAll("[data-bx]").forEach((b) => b.addEventListener("click", () => {
    const ui = (state.boxUi[b.dataset.bx] ||= { open: false, view: "players", side: "away" });
    if (b.dataset.toggle) ui.open = !ui.open;
    if (b.dataset.view) ui.view = b.dataset.view;
    if (b.dataset.side) ui.side = b.dataset.side;
    keepState(el, renderLive);
  }));
  // Only flash a score change once.
  state.liveBumps = {};
  updateStickies();
}

// ---------- Game box score (Live games tab) ----------
// "Player stats" on a game card opens ESPN's box score: player stats by category for either team,
// or team stats side by side. While the game is live it refreshes along with the scores.
async function fetchBox(id) {
  if (state.demo) return window.DemoLeague.box(id, state.live?.sp);
  let res, body;
  try {
    res = await fetch(`/api/boxscore?event=${encodeURIComponent(id)}`);
    body = await res.json();
  } catch {
    throw new ApiError("no_function", "Couldn't reach the box score function. Make sure netlify/functions/boxscore.mjs is uploaded.");
  }
  if (!res.ok) throw new ApiError(body.error, body.message || `Request failed (${res.status})`);
  return body;
}
// Load (or refresh, while the game is live) an open box score; the Live games tab redraws when it arrives.
function ensureBox(g, onReady) {
  const boxes = (state.boxes ||= {}), d = boxes[g.id];
  const stale = !d || d === "loading" ? !d : g.state === "in" && Date.now() - d.at > 25000;
  if (!stale || d === "loading" || state.boxLoading?.[g.id]) return;
  (state.boxLoading ||= {})[g.id] = true;
  if (!d) boxes[g.id] = "loading";
  const base = state.base;
  fetchBox(g.id)
    .then((x) => { if (state.base === base) boxes[g.id] = { ...x, at: Date.now() }; })
    .catch((e) => { if (state.base === base && (!d || d === "loading")) boxes[g.id] = { error: e.message, at: Date.now() }; })
    .finally(() => {
      state.boxLoading[g.id] = false;
      if (state.base !== base) return;
      if (state.tab === "live") keepState($("view-live"), renderLive);
      onReady?.();
    });
}

function boxPanel(g, rosteredBy) {
  const ui = state.boxUi[g.id];
  ensureBox(g);
  const d = state.boxes?.[g.id];
  const tab = (view, label) => `<button type="button" data-bx="${esc(g.id)}" data-view="${view}" class="${ui.view === view ? "active" : ""}">${label}</button>`;
  let body;
  if (!d || d === "loading") body = `<div class="loading small"><span class="spinner"></span> Loading box score…</div>`;
  else if (d.error) body = `<p class="small muted">${esc(d.error)}</p>`;
  else if (ui.view === "team") {
    const num = (v) => parseFloat(String(v).replace(/[^\d.-]/g, "")) || 0;
    body = `<div class="bx-team-head"><span><img src="${esc(g.away.logo)}" alt="" width="22" height="22"> ${esc(g.away.abbr)}</span><span class="muted small">Team stats</span><span>${esc(g.home.abbr)} <img src="${esc(g.home.logo)}" alt="" width="22" height="22"></span></div>
      ${d.teamStats.map((r) => {
        const a = num(r.away), h = num(r.home), tot = a + h;
        return `<div class="bx-stat ${r.bar ? "has-bar" : ""}"><span>${esc(r.away)}</span><span class="bx-stat-label">${esc(r.label)}</span><span>${esc(r.home)}</span>
          ${r.bar ? `<div class="bx-bar"><i style="width:${tot ? (a / tot) * 100 : 50}%;background:${esc(g.away.color || "#41506b")}"></i><i style="width:${tot ? (h / tot) * 100 : 50}%;background:${esc(g.home.color || "#2a78d6")}"></i></div>` : ""}</div>`;
      }).join("")}`;
  } else {
    const side = ui.side, cats = d.players[side] || [];
    const teamTab = (sd) => `<button type="button" data-bx="${esc(g.id)}" data-side="${sd}" class="${side === sd ? "active" : ""}">${esc(g[sd].name || g[sd].abbr)}</button>`;
    body = `<div class="bx-sides">${teamTab("away")}${teamTab("home")}</div>
      ${cats.length ? cats.map((c) => `<h4 class="bx-cat">${esc(c.title)}</h4>
        <div class="table-wrap bx-wrap"><table class="data bx-table"><thead><tr><th class="bx-player">Player</th>${c.labels.map((l) => `<th class="num">${esc(l)}</th>`).join("")}</tr></thead>
        <tbody>${c.rows.map((r) => {
          const owner = r.id && rosteredBy.get(String(r.id));
          const nm = `<span class="nm-full">${esc(r.name)}</span><span class="nm-short">${esc(r.short || shortName(r.name))}</span>`;
          return `<tr><td class="bx-player"><span class="bx-jersey">${esc(r.jersey)}</span>${r.headshot ? `<img class="bx-face" src="${esc(r.headshot)}" alt="" width="28" height="28" loading="lazy">` : ""}
            ${r.id ? `<button type="button" class="pl-link" data-pid="${r.id}">${nm}</button>` : nm}${owner ? ` <span class="bx-owner" title="${esc(team(owner).name)}">${esc(team(owner).abbrev)}</span>` : ""}</td>
            ${r.stats.map((v) => `<td class="num">${esc(v)}</td>`).join("")}</tr>`;
        }).join("")}</tbody></table></div>`).join("") : `<p class="small muted">No player stats yet.</p>`}`;
  }
  return `<div class="bx-panel"><div class="bx-tabs">${tab("players", "Player stats")}${tab("team", "Team stats")}</div>${body}</div>`;
}

// ---------- League history ----------
// One completed season: final standings, playoff results and weekly extremes.
function buildSeasonHistory(raw, year) {
  const members = Object.fromEntries((raw.members || []).map((m) => [m.id, m]));
  const s = raw.settings?.scheduleSettings || {};
  const regWeeks = s.matchupPeriodCount || 0, playoffTeams = s.playoffTeamCount || 0;
  const teams = {};
  for (const t of raw.teams || []) {
    const ownerId = t.primaryOwner || (t.owners || [])[0] || `team-${t.id}`;
    const m = members[ownerId];
    const rec = t.record?.overall || {};
    teams[t.id] = {
      id: t.id, year, ownerId,
      owner: m ? ([m.firstName, m.lastName].filter(Boolean).join(" ") || m.displayName) : "Unknown manager",
      name: (t.name || [t.location, t.nickname].filter(Boolean).join(" ")).trim() || `Team ${t.id}`,
      abbrev: t.abbrev || "", logo: logoUrl(t.logo),
      wins: rec.wins || 0, losses: rec.losses || 0, ties: rec.ties || 0,
      pf: rec.pointsFor || 0, pa: rec.pointsAgainst || 0,
      seed: t.playoffSeed || null,
      finish: t.rankCalculatedFinal || t.rankFinal || null,
      draftRank: t.draftDayProjectedRank || null,
      moves: t.transactionCounter?.acquisitions ?? null,
      trades: t.transactionCounter?.trades ?? null,
      poW: 0, poL: 0,
    };
    teams[t.id].madePlayoffs = !!(playoffTeams && teams[t.id].seed && teams[t.id].seed <= playoffTeams);
  }
  const done = (raw.schedule || []).filter((g) => g.winner && g.winner !== "UNDECIDED" && g.away);
  const games = [];
  const weekly = [];
  let final = null;
  for (const g of done) {
    const h = g.home, a = g.away;
    const bracket = g.playoffTierType === "WINNERS_BRACKET";
    if (bracket) {
      const [w, l] = h.totalPoints >= a.totalPoints ? [h, a] : [a, h];
      if (teams[w.teamId]) teams[w.teamId].poW++;
      if (teams[l.teamId]) teams[l.teamId].poL++;
      if (!final || g.matchupPeriodId > final.week) final = { week: g.matchupPeriodId, winner: w, loser: l };
    }
    // Every game, by manager, for rivalry records (team names change; managers don't).
    if (teams[h.teamId] && teams[a.teamId]) games.push({ year, week: g.matchupPeriodId, playoff: bracket, h: { owner: teams[h.teamId].ownerId, pts: h.totalPoints }, a: { owner: teams[a.teamId].ownerId, pts: a.totalPoints } });
    if (g.matchupPeriodId <= regWeeks) {
      for (const [me, opp] of [[h, a], [a, h]]) weekly.push({ teamId: me.teamId, score: me.totalPoints, opp: opp.teamId, oppScore: opp.totalPoints, week: g.matchupPeriodId, year });
    }
  }
  const list = Object.values(teams);
  const champ = list.find((t) => t.finish === 1) || (final && teams[final.winner.teamId]);
  return {
    year, name: raw.settings?.name || "", teams, list, weekly, games, regWeeks, playoffTeams, champ,
    final: final && { winner: teams[final.winner.teamId], loser: teams[final.loser.teamId], wScore: final.winner.totalPoints, lScore: final.loser.totalPoints },
  };
}

// Returns the seasons ESPN shared plus the years it refused, so the page can say so.
async function loadHistory() {
  const years = state.base.previousSeasons;
  const failed = [];
  const seasons = await Promise.all(years.map(async (y) => {
    try {
      return buildSeasonHistory(await api(["mTeam", "mSettings", "mStandings", "mMatchupScore"], null, String(y)), y);
    } catch {
      failed.push(y); // a season ESPN can't return shouldn't hide the others
      return null;
    }
  }));
  const list = seasons.filter(Boolean);
  list.failed = failed.sort((a, b) => b - a);
  return list;
}

// ---------- Rivalries (History tab) ----------
// Head-to-head between any two managers across every season ESPN shares, including this one.
function renderRivalry(seasons) {
  const box = $("rivalry");
  if (!box) return;
  const current = buildSeasonHistory(state.base.raw, state.base.season);
  const all = [current, ...seasons];
  const games = all.flatMap((s) => s.games || []);
  const names = {};
  for (const s of [...all].sort((a, b) => a.year - b.year)) for (const t of s.list) names[t.ownerId] = { owner: t.owner, team: t };
  const owners = Object.keys(names).sort((x, y) => names[x].owner.localeCompare(names[y].owner));
  if (owners.length < 2 || !games.length) { box.innerHTML = `<p class="muted">Rivalries appear once there are completed games.</p>`; return; }
  const r = (state.rivalry ||= {});
  const myOwner = String(state.base.raw.teams?.find((t) => String(t.id) === String(myTeamId()))?.primaryOwner || "");
  if (!names[r.a]) r.a = names[myOwner] ? myOwner : owners[0];
  const vs = (x) => games.filter((g) => (g.h.owner === r.a && g.a.owner === x) || (g.a.owner === r.a && g.h.owner === x));
  if (!names[r.b] || r.b === r.a) r.b = owners.filter((o) => o !== r.a).sort((x, y) => vs(y).length - vs(x).length)[0];
  const meet = vs(r.b).map((g) => {
    const [me, them] = g.h.owner === r.a ? [g.h, g.a] : [g.a, g.h];
    return { ...g, me: me.pts, them: them.pts, res: me.pts > them.pts ? "W" : me.pts < them.pts ? "L" : "T" };
  }).sort((x, y) => y.year - x.year || y.week - x.week);
  const W = meet.filter((m) => m.res === "W").length, Lo = meet.filter((m) => m.res === "L").length, T = meet.length - W - Lo;
  const po = meet.filter((m) => m.playoff), poW = po.filter((m) => m.res === "W").length;
  const big = (res) => meet.filter((m) => m.res === res).sort((x, y) => Math.abs(y.me - y.them) - Math.abs(x.me - x.them))[0];
  const bw = big("W"), bl = big("L");
  let streak = 0;
  for (const m of meet) { if (m.res !== meet[0].res) break; streak++; }
  const opt = (sel) => owners.map((o) => `<option value="${esc(o)}" ${o === sel ? "selected" : ""}>${esc(names[o].owner)}</option>`).join("");
  const A = names[r.a], B = names[r.b];
  const when = (m) => `${m.year} wk ${m.week}${m.playoff ? " (playoffs)" : ""}`;
  box.innerHTML = `<div class="filters riv-pick"><select id="riv-a" aria-label="Manager">${opt(r.a)}</select><span class="muted">vs</span><select id="riv-b" aria-label="Opponent">${opt(r.b)}</select></div>
    ${!meet.length ? `<p class="muted">${esc(A.owner)} and ${esc(B.owner)} haven't played each other yet.</p>` : `
    <div class="card riv">
      <div class="riv-score"><div>${logoImg(A.team, 36)}<strong>${esc(A.owner)}</strong></div><div class="riv-rec"><span class="${W > Lo ? "pos" : W < Lo ? "neg" : ""}">${W}</span>–<span class="${Lo > W ? "pos" : Lo < W ? "neg" : ""}">${Lo}</span>${T ? `–${T}` : ""}</div><div>${logoImg(B.team, 36)}<strong>${esc(B.owner)}</strong></div></div>
      <div class="rh-stats">
        <span><strong>${meet.length}</strong> games</span>
        <span><strong>${f1(sum(meet, (m) => m.me))}</strong>–<strong>${f1(sum(meet, (m) => m.them))}</strong> total points</span>
        <span><strong>${signed(sum(meet, (m) => m.me - m.them) / meet.length)}</strong> avg margin</span>
        ${po.length ? `<span><strong>${poW}–${po.length - poW}</strong> in the playoffs</span>` : ""}
        <span><strong>${meet[0].res}${streak}</strong> current streak</span>
      </div>
      ${bw ? `<p class="small"><span class="pos"><strong>Biggest win:</strong></span> ${f2(bw.me)}–${f2(bw.them)}, ${when(bw)}</p>` : ""}
      ${bl ? `<p class="small"><span class="neg"><strong>Worst loss:</strong></span> ${f2(bl.me)}–${f2(bl.them)}, ${when(bl)}</p>` : ""}
      <div class="riv-games">${meet.slice(0, 8).map((m) => `<div class="riv-game"><span class="badge ${m.res === "W" ? "live" : m.res === "L" ? "out" : ""}">${m.res}</span> ${f2(m.me)}–${f2(m.them)} <span class="muted small">${when(m)}</span></div>`).join("")}</div>
    </div>`}`;
  $("riv-a").addEventListener("change", (e) => { r.a = e.target.value; renderRivalry(seasons); });
  $("riv-b").addEventListener("change", (e) => { r.b = e.target.value; renderRivalry(seasons); });
}

// Totals per manager across every completed season.
function allTimeManagers(seasons) {
  const byOwner = {};
  for (const s of [...seasons].sort((a, b) => a.year - b.year)) {
    for (const t of s.list) {
      const m = (byOwner[t.ownerId] ||= { ownerId: t.ownerId, seasons: 0, titles: [], runnerUps: 0, playoffs: 0, wins: 0, losses: 0, ties: 0, pf: 0, poW: 0, poL: 0, finishes: [] });
      Object.assign(m, { owner: t.owner, latest: t }); // newest season wins for name and logo
      m.seasons++;
      if (t.finish === 1) m.titles.push(s.year);
      if (t.finish === 2) m.runnerUps++;
      if (t.madePlayoffs) m.playoffs++;
      m.wins += t.wins; m.losses += t.losses; m.ties += t.ties; m.pf += t.pf; m.poW += t.poW; m.poL += t.poL;
      if (t.finish) m.finishes.push(t.finish);
    }
  }
  return Object.values(byOwner).map((m) => {
    const gp = m.wins + m.losses + m.ties;
    return { ...m, winPct: gp ? (m.wins + m.ties / 2) / gp : 0, best: m.finishes.length ? Math.min(...m.finishes) : null, avgFinish: m.finishes.length ? sum(m.finishes) / m.finishes.length : null, avgPf: m.seasons ? m.pf / m.seasons : 0 };
  });
}

function renderHistory() {
  const el = $("view-history");
  const H = state.history;
  if (!H || H === "loading") {
    el.innerHTML = `<div class="loading"><span class="spinner"></span> Loading past seasons…</div>`;
    if (!H) {
      state.history = "loading";
      const base = state.base;
      loadHistory()
        .then((d) => { if (state.base === base) state.history = d; })
        .catch(() => { if (state.base === base) state.history = Object.assign([], { failed: base.previousSeasons }); })
        .finally(() => { if (state.tab === "history" && state.base === base) renderHistory(); });
    }
    return;
  }
  const refused = H.failed?.length
    ? `<p class="muted small">ESPN wouldn't share the ${H.failed.join(" and ")} season${H.failed.length > 1 ? "s" : ""} for this league. Past seasons can be private even when the current one isn't, and are only visible to people who were in the league that year.</p>`
    : "";
  if (!H.length) {
    el.innerHTML = `<div class="section-head"><h2>League history</h2></div>${refused || `<p class="muted">No completed seasons yet. History appears here once a season finishes.</p>`}`;
    return;
  }
  const seasons = [...H].sort((a, b) => b.year - a.year);
  if (state.historySel !== "all" && !seasons.some((s) => String(s.year) === String(state.historySel))) state.historySel = "all";
  const sel = state.historySel;
  const span = seasons.length > 1 ? `${seasons[seasons.length - 1].year}–${seasons[0].year}` : `${seasons[0].year}`;
  const trophy = awardIcon("top", 18);
  const medal = (n) => (n === 1 ? "🥇" : n === 2 ? "🥈" : n === 3 ? "🥉" : "");
  const who = (t, size = 22) => `<span class="tname">${logoImg(t, size)}<span>${esc(t.name)}</span></span>`;
  const rec = (t) => `${t.wins}-${t.losses}${t.ties ? "-" + t.ties : ""}`;
  const card = (label, value, t, why) => `<div class="card award"><div class="label">${label}</div><div class="value">${value}</div><div class="who">${who(t, 20)}</div><div class="why">${esc(t.owner)}${why ? " · " + why : ""}</div></div>`;

  const extremes = (ss) => {
    const weekly = ss.flatMap((s) => s.weekly.map((w) => ({ ...w, team: s.teams[w.teamId], oppTeam: s.teams[w.opp] })));
    const all = ss.flatMap((s) => s.list);
    if (!weekly.length) return [];
    const hi = weekly.reduce((a, b) => (b.score > a.score ? b : a));
    const lo = weekly.reduce((a, b) => (b.score < a.score ? b : a));
    const blow = weekly.reduce((a, b) => (b.score - b.oppScore > a.score - a.oppScore ? b : a));
    const mostPf = all.reduce((a, b) => (b.pf > a.pf ? b : a));
    const bestRec = all.reduce((a, b) => ((b.wins - b.losses) > (a.wins - a.losses) || ((b.wins - b.losses) === (a.wins - a.losses) && b.pf > a.pf) ? b : a));
    const multi = ss.length > 1;
    const when = (w) => `week ${w.week}${multi ? ", " + w.year : ""}`;
    return [
      card("Highest weekly score", f2(hi.score), hi.team, when(hi)),
      card("Lowest weekly score", f2(lo.score), lo.team, when(lo)),
      card("Biggest blowout", f2(blow.score - blow.oppScore), blow.team, `over ${esc(blow.oppTeam?.name || "")}, ${when(blow)}`),
      card("Most points in a season", f1(mostPf.pf), mostPf, multi ? String(mostPf.year) : ""),
      card("Best record", rec(bestRec), bestRec, multi ? String(bestRec.year) : ""),
    ];
  };

  let body;
  if (sel === "all") {
    const champs = seasons.map((s) => {
      const c = s.champ;
      if (!c) return `<div class="card champ"><div class="champ-year">${s.year}</div><p class="muted">Champion not recorded</p></div>`;
      const fin = s.final && s.final.winner === c ? `Beat ${esc(s.final.loser.name)} ${f2(s.final.wScore)}–${f2(s.final.lScore)} in the final` : "";
      return `<div class="card champ"><div class="champ-year">${trophy} ${s.year} champion</div><div class="champ-team">${who(c, 40)}</div><div class="why">${esc(c.owner)} · ${rec(c)} · ${f1(c.pf)} PF</div>${fin ? `<div class="why">${fin}</div>` : ""}</div>`;
    }).join("");
    body = `<div class="section-head"><h2>Champions</h2></div><div class="grid grid-2">${champs}</div>
      <div class="section-head"><h2>League records</h2><span class="muted small">Regular season, ${span}</span></div>
      <div class="grid grid-awards">${extremes(seasons).join("")}</div>
      <div class="section-head"><h2>All-time managers</h2><span class="muted small">Completed seasons only · click a column to sort</span></div>
      <div id="hist-table"></div>
      <div class="section-head"><h2>Rivalries</h2><span class="muted small">Head-to-head, every season including this one</span></div>
      <div id="rivalry"></div>`;
  } else {
    const s = seasons.find((x) => String(x.year) === String(sel));
    const c = s.champ;
    body = `${c ? `<div class="card champ champ-banner"><div class="champ-year">${trophy} ${s.year} champion</div><div class="champ-team">${who(c, 48)}</div>
        <div class="why">${esc(c.owner)} · ${rec(c)} · ${f1(c.pf)} PF${c.seed ? ` · ${ordinal(c.seed)} seed` : ""}</div>
        ${s.final && s.final.winner === c ? `<div class="why">Beat ${esc(s.final.loser.name)} ${f2(s.final.wScore)}–${f2(s.final.lScore)} in the final</div>` : ""}</div>` : ""}
      <div class="section-head"><h2>${s.year} highlights</h2><span class="muted small">Regular season</span></div>
      <div class="grid grid-awards">${extremes([s]).join("")}</div>
      <div class="section-head"><h2>${s.year} final standings</h2><span class="muted small">${s.playoffTeams ? `${s.playoffTeams} teams made the playoffs` : ""}</span></div>
      <div id="hist-table"></div>`;
  }

  el.innerHTML = `<div class="section-head"><h2>League history</h2><span class="muted small">${seasons.length} completed season${seasons.length > 1 ? "s" : ""}</span></div>
    ${refused}
    <div class="seg hist-seg" id="hist-seg"><button data-y="all" class="${sel === "all" ? "active" : ""}">All-time</button>${seasons.map((s) => `<button data-y="${s.year}" class="${String(sel) === String(s.year) ? "active" : ""}">${s.year}</button>`).join("")}</div>
    ${body}`;
  $("hist-seg").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { state.historySel = b.dataset.y; renderHistory(); }));
  if (sel === "all") renderRivalry(seasons);

  if (sel === "all") {
    const rows = allTimeManagers(seasons);
    const cols = [
      { key: "owner", label: "Manager", render: (m) => `<div class="team-cell">${logoImg(m.latest, 30)}<div><strong>${esc(m.owner)}</strong><div class="small muted">${esc(m.latest.name)}</div></div></div>` },
      { key: "titles", label: "Titles", num: true, sort: (m) => m.titles.length * 100 + m.runnerUps, render: (m) => (m.titles.length ? `<span class="titles" data-tip="${esc(`<b>Champion</b>${m.titles.join(", ")}`)}">${awardIcon("top", 16)} ${m.titles.length}</span>` : "0") },
      { key: "runnerUps", label: "Runner-up", num: true },
      { key: "playoffs", label: "Playoffs", num: true, title: "Playoff appearances", render: (m) => `${m.playoffs}/${m.seasons}` },
      { key: "winPct", label: "Record", num: true, render: (m) => `${m.wins}-${m.losses}${m.ties ? "-" + m.ties : ""} <span class="muted small">${pct(m.winPct)}</span>` },
      { key: "poW", label: "Playoff W-L", num: true, cls: "hide-sm", render: (m) => `${m.poW}-${m.poL}` },
      { key: "pf", label: "Total PF", num: true, render: (m) => f1(m.pf) },
      { key: "avgPf", label: "PF / season", num: true, cls: "hide-sm", render: (m) => f1(m.avgPf) },
      { key: "best", label: "Best finish", num: true, sort: (m) => (m.best == null ? null : -m.best), render: (m) => (m.best ? `${medal(m.best)} ${ordinal(m.best)}` : "–") },
      { key: "avgFinish", label: "Avg finish", num: true, cls: "hide-sm", sort: (m) => (m.avgFinish == null ? null : -m.avgFinish), render: (m) => (m.avgFinish ? f1(m.avgFinish) : "–") },
    ];
    const draw = () => $("hist-table").replaceChildren(sortableTable(cols, rows, state.historySort, draw));
    draw();
  } else {
    const s = seasons.find((x) => String(x.year) === String(sel));
    const cols = [
      { key: "finish", label: "Finish", num: true, sort: (t) => t.finish, render: (t) => (t.finish ? `${medal(t.finish)} ${ordinal(t.finish)}` : "–") },
      { key: "name", label: "Team", render: (t) => `<div class="team-cell">${logoImg(t, 30)}<div><strong>${esc(t.name)}</strong><div class="small muted">${esc(t.owner)}</div></div></div>` },
      { key: "wins", label: "Record", num: true, sort: (t) => t.wins - t.losses + t.pf / 1e5, render: rec },
      { key: "pf", label: "PF", num: true, render: (t) => f1(t.pf) },
      { key: "pa", label: "PA", num: true, cls: "hide-sm", render: (t) => f1(t.pa) },
      { key: "seed", label: "Seed", num: true, sort: (t) => t.seed, render: (t) => (t.seed ? `${t.seed}${t.madePlayoffs ? "" : ` <span class="muted small">(missed)</span>`}` : "–") },
      { key: "poW", label: "Playoff W-L", num: true, cls: "hide-sm", render: (t) => (t.madePlayoffs ? `${t.poW}-${t.poL}` : "–") },
      { key: "draftRank", label: "vs draft proj.", num: true, title: "ESPN's draft-day projected finish, and how the final finish compared", sort: (t) => (t.draftRank && t.finish ? t.draftRank - t.finish : null),
        render: (t) => (t.draftRank && t.finish ? `<span class="muted small">proj ${ordinal(t.draftRank)}</span> <span class="${clsSign(t.draftRank - t.finish)}">${signed(t.draftRank - t.finish, 0)}</span>` : "–") },
      { key: "moves", label: "Pickups", num: true, cls: "hide-sm", render: (t) => t.moves ?? "–" },
      { key: "trades", label: "Trades", num: true, cls: "hide-sm", render: (t) => t.trades ?? "–" },
    ];
    const draw = () => $("hist-table").replaceChildren(sortableTable(cols, s.list, state.seasonSort, draw));
    draw();
  }
}

// ---------- Roster ----------
// A "meaningful" upgrade is projected at least this many more points this week.
const UPGRADE_MIN_GAIN = 2;
// Available players (free agents or waivers) at the same position projected to clearly outscore `p` this week, best first.
function upgradesFor(p, fa) {
  return fa.players.filter((u) => u.posId === p.posId && (u.proj || 0) >= (p.proj || 0) + UPGRADE_MIN_GAIN).sort((a, b) => b.proj - a.proj);
}

function renderRoster() {
  ensureValues(); // trade values fill in when they arrive
  ensureWeather(); // game-day forecasts fill in when they arrive
  ensureUsage(); // snap counts and targets fill in when they arrive
  ensureGameStatus(); // game lines and live highlighting
  const w = state.week, el = $("view-roster");
  const ids = Object.keys(state.base.teams).sort((a, b) => team(a).name.localeCompare(team(b).name));
  const key = `ffb.rosterteam.${state.leagueId || "default"}`;
  let sel = state.rosterTeam || store.get(key) || myTeamId();
  if (!state.base.teams[sel]) sel = ids[0];
  state.rosterTeam = sel;

  const t = team(sel);
  const side = w.sides.find((s) => String(s.teamId) === String(sel));
  const standing = 1 + Object.values(state.base.teams).filter((o) => o.seed < t.seed).length;

  // Upgrade button: how many available players at the same position are projected higher this week.
  const fa = faData();
  const upgradeBtn = (p) => {
    if (!fa || fa.error) return `<span class="upg-none" title="${fa?.error ? "Couldn't load free agents" : "Checking free agents…"}">…</span>`;
    const n = upgradesFor(p, fa).length;
    return n
      ? `<button type="button" class="upg-btn" data-pid="${esc(p.id)}" title="${n} available ${esc(p.pos)}${n > 1 ? "s" : ""} projected at least ${UPGRADE_MIN_GAIN} points higher this week">▲ ${n >= 10 ? "10+" : n}</button>`
      : `<span class="upg-none" title="No available ${esc(p.pos)} is projected at least ${UPGRADE_MIN_GAIN} points higher this week">–</span>`;
  };
  const list = (title, players) => players.length
    ? `<h3 class="ta-sub">${title}</h3><div class="pr-list mx">${players.map((p) => playerRow(rosteredRow(p), { label: p.slot, sp: w.sp, action: upgradeBtn(p), owner: false })).join("")}</div>` : "";

  let body = `<p class="muted">${esc(t.name)} has no lineup for week ${w.week}.</p>`;
  if (side) {
    const bench = side.bench.filter((p) => p.slotId !== IR), ir = side.bench.filter((p) => p.slotId === IR);
    const lc = lineupCheck(side, w);
    const starters = `Starters${lc === LINEUP_OK ? ` <span class="lc-tick" title="Lineup is optimal by ESPN's week ${w.week} projections" aria-label="Lineup is optimal">✓</span>` : ""}`;
    body = (lc === LINEUP_OK ? "" : lc) + list(starters, side.starters) + list("Bench", bench) + list("Injured reserve", ir) + rosterNews(side) + playoffSchedule(side);
  }
  const rosterValue = side && state.values?.byId?.size ? sum(side.players, (p) => valueOf(p.id) || 0) : null;
  const starterValue = side && state.values?.byId?.size ? sum(side.starters, (p) => valueOf(p.id) || 0) : null;
  // Team header: who it is and this week's score (or projection) — the opponent lives on the Matchups tab.
  const st = w.status;
  const card = `<div class="rh-top">${logoImg(t, 44)}
      <div class="rh-id"><strong class="mc-name">${esc(t.name)} <button type="button" class="my-star ${String(myTeamId()) === String(sel) ? "on" : ""}" id="my-star" title="${String(myTeamId()) === String(sel) ? "This is your team" : "Make this my team"}" aria-pressed="${String(myTeamId()) === String(sel)}">${String(myTeamId()) === String(sel) ? "★" : "☆"}</button></strong><span class="mc-owner">${esc(t.owner)} · ${recordStr(t)}</span></div>
      ${side ? `<div class="rh-score"><span class="mc-score">${st === "upcoming" ? f1(side.proj) : f2(side.score)}</span><small class="mc-proj">${st === "upcoming" ? `week ${w.week} projection` : `proj ${f1(st === "live" ? side.liveProj : side.proj)}`}</small></div>` : ""}
    </div>`;
  const stats = [
    `<span><strong>${ordinal(standing)}</strong> place</span>`,
    `<span><strong>${f1(t.pf)}</strong> PF</span>`,
    rosterValue != null && `<span><strong>${fmtVal(rosterValue)}</strong> roster value</span>`,
    starterValue != null && `<span><strong>${fmtVal(starterValue)}</strong> starters value</span>`,
    side && st !== "upcoming" && `<span><strong>${f1(side.benchLeft)}</strong> pts left on bench</span>`,
  ].filter(Boolean).join("");
  const opts = ids.map((id) => `<option value="${id}" ${id === String(sel) ? "selected" : ""}>${esc(team(id).name)} (${esc(team(id).owner)})</option>`).join("");

  el.innerHTML = `<div class="section-head"><h2>Rosters</h2><label class="small muted ta-me">Team <select id="roster-team">${opts}</select></label></div>
    <div class="card roster-head">${card}<div class="rh-stats">${stats}</div></div>
    ${body}
    ${fcCredit()}${nvCredit()}${wxCredit()}`;
  $("roster-team").addEventListener("change", (e) => { state.rosterTeam = e.target.value; store.set(key, e.target.value); renderRoster(); });
  $("my-star").addEventListener("click", () => { setMyTeam(sel); state.winWin = null; updateEspnLink(); renderRoster(); });
  el.querySelectorAll(".upg-btn[data-pid]").forEach((b) => b.addEventListener("click", () => {
    const p = side.players.find((x) => String(x.id) === b.dataset.pid);
    if (p) { state.modalReturn = b; openUpgrades(p); }
  }));
}

// Popup listing the available players who'd be an upgrade for `p` this week.
function openUpgrades(p) {
  const w = state.week, fa = faData();
  if (!fa || fa.error) return;
  const ups = upgradesFor(p, fa).slice(0, 20);
  const rows = ups.map((u) => {
    const row = faRow(u, w);
    return playerRow(row, { sp: w.sp, action: `<div class="upg-diff" title="Projected points more than ${esc(p.name)}">+${f1(u.proj - (p.proj || 0))}</div>` });
  }).join("");
  showModal(`<div class="pm-head"><h2 id="pl-modal-title">Upgrades for ${esc(p.name)}</h2>
      <div class="muted">${esc(p.pos)} · projected ${f1(p.proj)} in week ${w.week}</div></div>
    <p class="small muted" style="margin:10px 0">${upgradesFor(p, fa).length} available ${esc(p.pos)}${upgradesFor(p, fa).length > 1 ? "s" : ""} projected at least ${UPGRADE_MIN_GAIN} points higher this week${ups.length < upgradesFor(p, fa).length ? ` (top ${ups.length} shown)` : ""}, best first. The green number is how many more points each is projected to score.</p>
    <div class="pr-list mx">${rows}</div>
    <p class="small muted" style="margin-top:10px">Free agents and players on waivers (<span class="badge wv">W</span>), using ESPN's week ${w.week} projections.</p>`);
}

// ---------- Open in ESPN ----------
// One button in the top bar that opens this league on ESPN (the ESPN Fantasy app on phones when it's
// installed): your team's page once you've picked "My team" in the Trade Analyzer, otherwise the league home.
const ESPN_FF = "https://fantasy.espn.com/football";
const espnLeague = () => String(state.base?.raw?.id || state.leagueId || LEAGUES[0].id);
// "My team": what you picked on this device, otherwise the team owned by the ESPN account the site
// signs in with (the league data function reports which team that is).
const myTeamId = () => store.get(`ffb.myteam.${state.leagueId || "default"}`) || state.base?.raw?.siteOwnerTeamIds?.[0] || null;
const setMyTeam = (id) => { store.set(`ffb.myteam.${state.leagueId || "default"}`, String(id)); if (state.ta) state.ta.my = String(id); };
function updateEspnLink() {
  const a = $("espn-open");
  if (!a || !state.base) return;
  const my = myTeamId(), season = state.base.season;
  a.href = my && state.base.teams[my]
    ? `${ESPN_FF}/team?leagueId=${espnLeague()}&teamId=${my}&seasonId=${season}`
    : `${ESPN_FF}/league?leagueId=${espnLeague()}&seasonId=${season}`;
  a.title = my && state.base.teams[my] ? `Open ${team(my).name} in ESPN` : "Open this league in ESPN";
}

// ---------- Trade values (FantasyCalc) ----------
// FantasyCalc's terms require a visible credit and link wherever their values appear.
const fcCredit = () => `<p class="fc-credit small muted">Trade values from <a href="https://fantasycalc.com" target="_blank" rel="noopener">FantasyCalc.com</a> · redraft values, updated daily${state.values?.updated ? ` (last ${new Date(state.values.updated).toLocaleDateString(undefined, { month: "short", day: "numeric" })})` : ""}.</p>`;
const fmtVal = (n) => (n == null ? "–" : Math.round(n).toLocaleString());
const valDelta = (d) => `<span class="${clsSign(d)}">(${d > 0 ? "+" : d < 0 ? "−" : ""}${fmtVal(Math.abs(d))})</span>`;

async function fetchValues() {
  if (state.demo) return window.DemoLeague.values();
  let res, body;
  try {
    res = await fetch(`/api/values?${new URLSearchParams(state.base.format)}`);
    body = await res.json();
  } catch {
    throw new ApiError("no_function", "Couldn't reach the trade values function. Make sure netlify/functions/values.mjs is uploaded.");
  }
  if (!res.ok) throw new ApiError(body.error, body.message || `Request failed (${res.status})`);
  return body;
}

// Returns loaded values, or null while loading (the current tab re-renders when they arrive).
function ensureValues() {
  if (state.values && state.values !== "loading") return state.values;
  if (!state.values) {
    state.values = "loading";
    const base = state.base;
    fetchValues()
      .then((d) => {
        if (state.base !== base) return;
        const byId = new Map(d.players.map(([espnId, name, pos, nfl, value, rank, posRank, trend]) => [espnId, { espnId, name, pos, nfl, value, rank, posRank, trend }]));
        state.values = { byId, updated: d.updated };
      })
      .catch((e) => { if (state.base === base) state.values = { error: e.message, byId: new Map() }; })
      .finally(() => { if (state.base === base && state.week) render(); });
  }
  return null;
}
const valueOf = (id) => (state.values?.byId ? state.values.byId.get(id)?.value ?? null : null);
function valueCell(id) {
  const v = state.values?.byId?.get(id);
  if (!v) return `<span class="muted">–</span>`;
  const t = v.trend;
  const trend = Math.abs(t) >= 50 ? ` <span class="trend ${t > 0 ? "pos" : "neg"}" data-tip="${esc(`<b>30-day trend</b>${t > 0 ? "Up" : "Down"} ${fmtVal(Math.abs(t))} in value`)}">${t > 0 ? "▲" : "▼"}${fmtVal(Math.abs(t))}</span>` : "";
  return `${fmtVal(v.value)}${trend}`;
}

// ---------- Snap counts & target share (nflverse) ----------
// nflverse's license (CC BY 4.0) asks for credit wherever the data appears.
const nvCredit = () => `<p class="fc-credit small muted">Snap counts and targets from <a href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noopener">nflverse</a> (CC BY 4.0) · updated the day after games.</p>`;
const NFL_NAMES = { ARI: "Arizona Cardinals", ATL: "Atlanta Falcons", BAL: "Baltimore Ravens", BUF: "Buffalo Bills", CAR: "Carolina Panthers", CHI: "Chicago Bears", CIN: "Cincinnati Bengals", CLE: "Cleveland Browns", DAL: "Dallas Cowboys", DEN: "Denver Broncos", DET: "Detroit Lions", GB: "Green Bay Packers", HOU: "Houston Texans", IND: "Indianapolis Colts", JAX: "Jacksonville Jaguars", KC: "Kansas City Chiefs", LV: "Las Vegas Raiders", LAC: "Los Angeles Chargers", LAR: "Los Angeles Rams", MIA: "Miami Dolphins", MIN: "Minnesota Vikings", NE: "New England Patriots", NO: "New Orleans Saints", NYG: "New York Giants", NYJ: "New York Jets", PHI: "Philadelphia Eagles", PIT: "Pittsburgh Steelers", SF: "San Francisco 49ers", SEA: "Seattle Seahawks", TB: "Tampa Bay Buccaneers", TEN: "Tennessee Titans", WSH: "Washington Commanders" };

async function fetchUsage() {
  if (state.demo) return window.DemoLeague.usage();
  let res, body;
  try {
    res = await fetch(`/api/usage?season=${encodeURIComponent(state.base.season)}`);
    body = await res.json();
  } catch {
    throw new ApiError("no_function", "Couldn't reach the snap counts function. Make sure netlify/functions/usage.mjs is uploaded.");
  }
  if (!res.ok) throw new ApiError(body.error, body.message || `Request failed (${res.status})`);
  return body;
}

// Returns loaded usage data, or null while loading (the current tab re-renders when it arrives).
function ensureUsage() {
  if (state.usage && state.usage !== "loading") return state.usage;
  if (!state.usage) {
    state.usage = "loading";
    const base = state.base;
    fetchUsage()
      .then((d) => {
        if (state.base !== base) return;
        const list = d.players.map(([id, name, pos, w]) => ({ id, name, pos, w }));
        state.usage = { list, byId: new Map(list.filter((p) => typeof p.id === "number").map((p) => [p.id, p])), teams: d.teams, weeks: d.weeks, updated: d.updated, memo: new Map() };
      })
      .catch((e) => { if (state.base === base) state.usage = { error: e.message, list: [], byId: new Map(), teams: {}, weeks: [], memo: new Map() }; })
      .finally(() => { if (state.base === base && state.week) render(); });
  }
  return null;
}

// A player's usage through week `sp`: their team's most recent game (0% if they didn't play in it),
// the season average over games they played, and the average before that game (for trend arrows).
function usageOf(id, sp = state.week?.sp) {
  const U = state.usage;
  if (!U?.byId || id == null) return null;
  const key = `${id}:${sp}`;
  if (!U.memo.has(key)) U.memo.set(key, usageCalc(U.byId.get(Number(id)), sp));
  return U.memo.get(key);
}
function usageCalc(pl, sp) {
  if (!pl) return null;
  const T = state.usage.teams;
  const wks = Object.keys(pl.w).map(Number).filter((w) => w <= sp).sort((a, b) => a - b);
  if (!wks.length) return null;
  const team = pl.w[wks.at(-1)][3];
  const lastWk = Math.max(wks.at(-1), ...Object.keys(T[team] || {}).map(Number).filter((w) => w <= sp));
  const teamOf = (wk, t) => T[t]?.[wk] || [0, 0];
  const e = pl.w[lastWk];
  const last = e ? { wk: lastWk, snaps: e[0], pct: e[1], tgt: e[2], teamSnaps: teamOf(lastWk, e[3])[0], share: teamOf(lastWk, e[3])[1] ? (e[2] / teamOf(lastWk, e[3])[1]) * 100 : null }
    : { wk: lastWk, snaps: 0, pct: 0, tgt: 0, teamSnaps: teamOf(lastWk, team)[0], share: 0, out: true };
  const avgOf = (list) => {
    if (!list.length) return null;
    const tgt = sum(list, (w) => pl.w[w][2]), teamTgt = sum(list, (w) => teamOf(w, pl.w[w][3])[1]);
    return { pct: sum(list, (w) => pl.w[w][1]) / list.length, share: teamTgt ? (tgt / teamTgt) * 100 : null, tgt: tgt / list.length, games: list.length };
  };
  const played = wks.filter((w) => pl.w[w][0] > 0 || pl.w[w][2] > 0);
  return { pos: pl.pos, team, last, avg: avgOf(played), prior: avgOf(played.filter((w) => w < lastWk)) };
}
const pctTxt = (n) => (n == null ? "–" : `${Math.round(n)}%`);
const usageTrend = (now, before) => {
  const d = now - before;
  return before == null || Math.abs(d) < 12 ? "" : ` <span class="trend ${d > 0 ? "pos" : "neg"}">${d > 0 ? "▲" : "▼"}</span>`;
};
const usageTip = (u) => esc(`<b>Week ${u.last.wk}${u.last.out ? " · didn't play" : ""}</b>${u.last.snaps} of ${u.last.teamSnaps || "?"} offensive snaps · ${u.last.tgt} target${u.last.tgt === 1 ? "" : "s"}${u.last.share != null && u.pos !== "QB" ? ` (${pctTxt(u.last.share)} of team)` : ""}<br>Season: ${pctTxt(u.avg?.pct)} of snaps${u.pos !== "QB" ? `, ${pctTxt(u.avg?.share)} of targets` : ""} over ${u.avg?.games || 0} game${u.avg?.games === 1 ? "" : "s"}`);
function snapCell(p) {
  const u = usageOf(p.id);
  if (!u) return DASH;
  return `<span data-tip="${usageTip(u)}">${pctTxt(u.last.pct)}${usageTrend(u.last.pct, u.prior?.pct)}</span><div class="pt-sub">avg ${pctTxt(u.avg?.pct)}</div>`;
}
function tgtCell(p) {
  const u = usageOf(p.id);
  if (!u || u.pos === "QB") return DASH;
  return `<span data-tip="${usageTip(u)}">${pctTxt(u.last.share)}${usageTrend(u.last.share ?? 0, u.prior?.share)}</span><div class="pt-sub">${u.last.tgt} tgt · avg ${pctTxt(u.avg?.share)}</div>`;
}
// One-line summary for player cards: "Snaps 84% · Tgt 22% (wk 5)".
function usageBrief(id) {
  const u = usageOf(id);
  if (!u) return "";
  return `<span data-tip="${usageTip(u)}">Snaps ${pctTxt(u.last.pct)}${usageTrend(u.last.pct, u.prior?.pct)}${u.pos !== "QB" && u.last.share != null ? ` · Tgt ${pctTxt(u.last.share)}` : ""}</span>`;
}

// ---------- Game-day weather (Open-Meteo) ----------
// Open-Meteo's license (CC BY 4.0) asks for credit wherever the forecast appears.
const wxCredit = () => `<p class="fc-credit small muted">Weather from <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo.com</a> (CC BY 4.0) · kickoff-window forecast, updated hourly. Retractable-roof calls are a guess; teams decide on game day.</p>`;

async function fetchWeather(sp) {
  if (state.demo) return window.DemoLeague.weather(sp);
  const q = new URLSearchParams({ scoringPeriodId: sp });
  if (state.season) q.set("season", state.season);
  let res, body;
  try {
    res = await fetch(`/api/weather?${q}`);
    body = await res.json();
  } catch {
    throw new ApiError("no_function", "Couldn't reach the weather function. Make sure netlify/functions/weather.mjs is uploaded.");
  }
  if (!res.ok) throw new ApiError(body.error, body.message || `Request failed (${res.status})`);
  return body;
}

// Weather for the selected week, or null while it loads (the Roster / Live games tab re-renders when it arrives).
// Refetched after an hour so forecasts stay current.
function ensureWeather(sp = state.week?.sp) {
  if (!sp) return null;
  const cache = (state.weather ||= {}), d = cache[sp];
  if (d && d !== "loading" && Date.now() - d.at < 3600e3) return d;
  if (d !== "loading") {
    cache[sp] = d && d !== "loading" ? d : "loading";
    const base = state.base;
    fetchWeather(sp)
      .then((x) => { if (state.base === base) cache[sp] = { ...x, at: Date.now(), byPro: Object.fromEntries(x.games.flatMap((g) => [[g.home, g], [g.away, g]])) }; })
      .catch((e) => { if (state.base === base) cache[sp] = { error: e.message, at: Date.now(), byPro: {}, games: [] }; })
      .finally(() => { if (state.base === base && ["roster", "live"].includes(state.tab)) render(); });
  }
  return d && d !== "loading" ? d : null;
}
const wxGame = (proId, sp = state.week?.sp) => { const d = state.weather?.[sp]; return d && d !== "loading" ? d.byPro?.[proId] || null : null; };

const wxIcon = (code) => (code >= 95 ? "⛈️" : (code >= 71 && code <= 77) || code >= 85 ? "🌨️" : code >= 51 ? "🌧️" : code >= 45 ? "🌫️" : code === 3 ? "☁️" : code >= 1 ? "⛅" : "☀️");
const deg = (n) => `${Math.round(n)}°`;
// Is the roof (fixed or a closed retractable one) keeping the weather out?
const wxIndoors = (g) => g.roof === "dome" || /closed/.test(g.roofCall?.call || "");
function wxTip(g) {
  const f = g.forecast;
  const where = `${esc(g.venue)}${g.city ? ` · ${esc(g.city)}` : ""}`;
  if (g.roof === "dome") return esc(`<b>Indoors</b>${where}<br>Fixed roof, so weather won't matter.`);
  const roof = g.roof === "retractable" ? `<br>Retractable roof: ${g.roofCall?.call ? `${g.roofCall.call} (${g.roofCall.why})` : "decided on game day"}` : "";
  if (!f) return esc(`<b>${g.roof === "retractable" ? "Retractable roof" : "Outdoors"}</b>${where}<br>Forecast shows up about two weeks before kickoff.${roof}`);
  return esc(`<b>${wxIcon(f.code)} ${f.desc} · ${deg(f.tempF)}</b>${where}<br>${f.precipProb}% chance of precipitation · wind ${Math.round(f.windMph)} mph (gusts ${Math.round(f.gustMph)})${roof}`);
}
// Small chip for player cards: rain chance with a condition icon, or a stadium icon when the roof is closed.
// liveState (from the scoreboard, which is fresher than the hourly forecast) hides it once the game ends.
function wxChip(proId, liveState) {
  const g = wxGame(proId);
  if (!g || g.state === "post" || liveState === "post") return "";
  if (wxIndoors(g)) return `<span class="wx wx-in" data-tip="${wxTip(g)}">🏟️</span>`;
  const f = g.forecast;
  if (!f) return "";
  return `<span class="wx ${f.precipProb >= 50 ? "wx-wet" : ""}" data-tip="${wxTip(g)}">${wxIcon(f.code)} ${f.precipProb}%${f.windMph >= 15 ? " 💨" : ""}</span>`;
}
// One-line summary for a game card on the Live games tab.
function wxLine(g) {
  if (!g || g.state === "post") return "";
  const f = g.forecast;
  if (g.roof === "dome") return `<div class="g-wx" data-tip="${wxTip(g)}">🏟️ <strong>Indoors</strong> <span class="muted">· ${esc(g.venue)}</span></div>`;
  const roof = g.roof === "retractable"
    ? `<span class="wx-roof ${wxIndoors(g) ? "closed" : ""}">Retractable roof${g.roofCall?.call ? `: ${esc(g.roofCall.call)}` : ""}</span>` : "";
  if (wxIndoors(g)) return `<div class="g-wx" data-tip="${wxTip(g)}">🏟️ ${roof} <span class="muted">· ${esc(g.roofCall?.why || "")}</span></div>`;
  if (!f) return `<div class="g-wx muted">${roof || "Outdoors"} · forecast closer to kickoff</div>`;
  return `<div class="g-wx" data-tip="${wxTip(g)}">${wxIcon(f.code)} <strong>${esc(f.desc)} ${deg(f.tempF)}</strong>
    <span class="${f.precipProb >= 50 ? "wx-wet" : ""}">· ${f.precipProb}% precip</span> · wind ${Math.round(f.windMph)} mph${f.gustMph >= 25 ? ` (gusts ${Math.round(f.gustMph)})` : ""}${roof ? ` · ${roof}` : ""}</div>`;
}
// ---------- Injury report tab ----------
// Every QB/RB/WR/TE/K who isn't fully active, rostered or not: injury, typical recovery time, weeks
// missed, expected return, the next man up on the depth chart and the likeliest fantasy fill-in.
async function fetchInjuries() {
  if (state.demo) return window.DemoLeague.injuries();
  const res = await fetch("/api/injuries");
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error, body.message || `Request failed (${res.status})`);
  return body;
}
function ensureInjuries() {
  const d = state.injuries;
  if (d && d !== "loading" && Date.now() - d.at < 30 * 60e3) return d;
  if (d !== "loading") {
    state.injuries = d && d !== "loading" ? d : "loading";
    const base = state.base;
    fetchInjuries()
      .then((x) => { if (state.base === base) state.injuries = { ...x, at: Date.now() }; })
      .catch((e) => { if (state.base === base) state.injuries = { error: e.message, at: Date.now(), players: [], depth: {} }; })
      .finally(() => { if (state.base === base && state.tab === "injuries") render(); });
  }
  return d && d !== "loading" ? d : null;
}
// Typical time missed by injury type (rough guides, not medical advice).
const RECOVERY = [
  [/acl|achilles/i, "Season (9–12 mo)"], [/high ankle/i, "4–6 wks"], [/lisfranc/i, "6–12 wks"], [/ankle/i, "1–3 wks"],
  [/hamstring/i, "2–4 wks"], [/groin|adductor/i, "1–3 wks"], [/quad/i, "1–3 wks"], [/calf/i, "1–3 wks"],
  [/concussion|head/i, "1–2 wks"], [/mcl/i, "2–6 wks"], [/meniscus/i, "3–6 wks"], [/knee/i, "1–4 wks"],
  [/collarbone|clavicle/i, "6–8 wks"], [/shoulder/i, "1–4 wks"], [/pectoral|chest/i, "1–3 wks (tear: season)"],
  [/rib/i, "1–3 wks"], [/oblique|abdomen|core/i, "2–4 wks"], [/back/i, "1–2 wks"], [/neck/i, "1–3 wks"],
  [/hip/i, "1–3 wks"], [/foot/i, "2–6 wks"], [/toe/i, "1–4 wks"], [/wrist|hand|finger|thumb/i, "1–4 wks"],
  [/elbow|forearm|arm/i, "1–4 wks"], [/fibula|tibia|leg/i, "Fracture: 6–10 wks"], [/illness/i, "Days"],
  [/suspension/i, "Set by the league"], [/personal|rest|not injury/i, "Varies"],
];
const INJ_CODE = { "Out": "OUT", "Injured Reserve": "INJURY_RESERVE", "Questionable": "QUESTIONABLE", "Doubtful": "DOUBTFUL", "Suspension": "SUSPENSION", "Day-To-Day": "DAY_TO_DAY" };
const INJ_ORDER = { "Injured Reserve": 0, "Suspension": 1, "Out": 2, "Doubtful": 3, "Questionable": 4, "Day-To-Day": 5 };

// Depth chart helpers: a position's spots (receivers have three), and whether a listed player is out.
const depthCols = (dep, pos) => (!dep ? [] : pos === "WR" ? [dep.WR1, dep.WR2, dep.WR3].filter(Boolean) : dep[pos] ? [dep[pos]] : []);
const depthOut = (x) => /out|reserve|suspen|doubtful|pup|physically/i.test(x?.[2] || "");

function renderInjuries() {
  const el = $("view-injuries");
  ensureUsage(); // weeks missed and snap shares fill in when they arrive
  const D = ensureInjuries(), week = ensureCurrentRosters();
  if (!D) { el.innerHTML = `<div class="loading"><span class="spinner"></span> Loading the injury report…</div>`; return; }
  if (D.error) { el.innerHTML = `<div class="banner">${esc(D.error)}</div>`; return; }
  const f = (state.injF ||= { pos: "ALL", roster: "all", sort: { key: "status", dir: 1 } });
  const owners = new Map((week?.sides || []).flatMap((sd) => sd.players.map((p) => [String(p.id), sd.teamId])));
  const ownerTag = (id) => { const t = owners.get(String(id)); return t ? `<span class="inj-owner" title="${esc(team(t).name)}">${esc(team(t).abbrev)}</span>` : `<span class="inj-owner fa">FA</span>`; };
  // Weeks in a row (most recent first) the player's team played without him, from the nflverse snaps.
  const weeksOut = (p) => {
    const U = state.usage, abbr = PRO[p.proId];
    if (!U?.byId || !abbr || !U.teams?.[abbr]) return null;
    const pl = U.byId.get(Number(p.id));
    const played = Object.keys(U.teams[abbr]).map(Number).filter((wk) => wk <= (state.week?.sp || 99)).sort((a, b) => b - a);
    let n = 0;
    for (const wk of played) { const e = pl?.w?.[wk]; if (e && e[3] === abbr && (e[0] > 0 || e[2] > 0)) break; n++; }
    return pl || n ? n : null;
  };
  const snap = (id) => usageOf(id)?.last.pct;
  // His backups: the healthy players listed under him at his spot on the depth chart. If he isn't
  // listed (or nobody healthy is under him), the healthy backups behind each spot's current starter.
  const backups = (p) => {
    const C = depthCols(D.depth?.[p.proId], p.pos), me = String(p.id);
    for (const c of C) {
      const i = c.findIndex(([id]) => String(id) === me);
      const below = i >= 0 ? c.slice(i + 1).filter((x) => !depthOut(x)) : [];
      if (below.length) return below;
    }
    const healthy = C.map((c) => c.filter((x) => !depthOut(x) && String(x[0]) !== me));
    const starters = new Set(healthy.map((c) => String(c[0]?.[0])));
    const out = [], seen = new Set();
    for (let d = 1; d < 8; d++) for (const c of healthy) {
      const x = c[d];
      if (x && !starters.has(String(x[0])) && !seen.has(String(x[0]))) { seen.add(String(x[0])); out.push(x); }
    }
    return out;
  };
  const nextUp = (p) => backups(p)[0];
  // Of those backups, whoever played the most snaps last game (depth order breaks ties).
  const fantasyNext = (p) => backups(p).map((x, i) => [x, snap(x[0]) ?? -1, i]).sort((a, b) => b[1] - a[1] || a[2] - b[2])[0]?.[0];
  // Fantasy week he could be back: ESPN's return date mapped to his team's next game on or after it
  // (byes skipped). IR players also have to sit four games. Questionable/doubtful: the next game.
  const retWeek = (p) => {
    if (/^Season/.test(recovery(p)) && p.status === "Injured Reserve") return "season";
    const up = D.upcoming?.[p.proId] || [];
    let wk = p.returnWeek ?? null;
    if (p.status === "Injured Reserve" && up.length) wk = Math.max(wk ?? 0, up[Math.min(Math.max(0, 4 - (p.out ?? 0)), up.length - 1)]);
    if (wk == null && /Questionable|Doubtful|Day-To-Day/.test(p.status)) wk = p.nextWeek ?? up[0] ?? null;
    return wk || null;
  };
  const retCell = (p) => {
    const wk = p.ret;
    if (wk === "season") return `<span class="muted">Season</span>`;
    if (wk == null) return `<span class="muted">${p.status === "Injured Reserve" ? "IR" : "–"}</span>`;
    const cur = state.base.current, bye = D.byes?.[p.proId];
    const games = (D.upcoming?.[p.proId] || []).filter((w) => w < wk).length;
    const sub = [wk <= cur ? "this week" : games ? `misses ${games} game${games > 1 ? "s" : ""}` : "next game", bye && bye > cur && bye < wk ? `bye wk ${bye}` : ""].filter(Boolean).join(" · ");
    return `<strong>Wk ${wk}</strong>${!games && /Questionable|Doubtful|Day-To-Day/.test(p.status) ? ` <span class="muted small">GTD</span>` : ""}<div class="pt-sub">${sub}</div>`;
  };
  const who = (x) => (x ? `${plink(x[0], shortName(x[1]))} ${ownerTag(x[0])}${snap(x[0]) != null ? `<div class="pt-sub">${pctTxt(snap(x[0]))} snaps last game</div>` : ""}` : `<span class="muted">–</span>`);
  const recovery = (p) => { const t = `${p.type} ${p.detail} ${p.status}`; return RECOVERY.find(([re]) => re.test(t))?.[1] || "Varies"; };

  const rows = D.players
    .filter((p) => f.pos === "ALL" || p.pos === f.pos)
    .filter((p) => f.roster === "all" || (f.roster === "rostered" ? owners.has(String(p.id)) : !owners.has(String(p.id))))
    .map((p) => ({ ...p, out: weeksOut(p), next: nextUp(p), fnext: fantasyNext(p) }))
    .map((p) => ({ ...p, ret: retWeek(p) }));
  const cols = [
    { key: "name", label: "Player", cls: "pt-player", dir: 1, render: (p) => `<div class="pt-name">${plinkNm(p)}${injBadge({ injury: INJ_CODE[p.status] || p.status.toUpperCase() })}</div><div class="pt-sub">${esc(p.pos)} · ${esc(PRO[p.proId] || "")} ${ownerTag(p.id)}</div>` },
    { key: "status", label: "Status", dir: 1, sort: (p) => INJ_ORDER[p.status] ?? 9, render: (p) => esc(p.status) },
    { key: "type", label: "Injury", dir: 1, render: (p) => `<span ${p.note ? `data-tip="${esc(`<b>${esc(p.name)}</b>${esc(p.note)}`)}"` : ""}>${esc([p.type, p.detail].filter(Boolean).join(" – ") || (p.status === "Suspension" ? "Suspension" : "Not disclosed"))}${p.side ? ` <span class="muted">(${esc(p.side)})</span>` : ""}</span>` },
    { key: "recovery", label: "Typical recovery", title: "Typical time missed for this kind of injury (a rough guide)", dir: 1, sort: (p) => recovery(p), render: (p) => esc(recovery(p)) },
    { key: "out", label: "Weeks out", title: "Games in a row his team has played without him (from nflverse snap counts)", num: true, render: (p) => (p.out == null ? `<span class="muted">–</span>` : String(p.out)) },
    { key: "ret", label: "Possible return", title: "Fantasy week he could be back: ESPN's return date matched to his team's schedule (byes skipped). IR players must sit at least four games.", dir: 1, sort: (p) => (p.ret === "season" ? 99 : p.ret ?? 98), render: retCell },
    { key: "next", label: "Next up", title: "Next healthy player behind him on the team's depth chart", dir: 1, sort: (p) => p.next?.[1] || "~", render: (p) => who(p.next) },
    { key: "fnext", label: "Fantasy fill-in", title: "Of his healthy backups, the one who played the most snaps last game", dir: 1, sort: (p) => p.fnext?.[1] || "~", render: (p) => who(p.fnext) },
  ];
  const btn = (key, val, label) => `<button type="button" data-${key}="${val}" class="${f[key] === val ? "active" : ""}">${label}</button>`;
  el.innerHTML = `<div class="section-head"><h2>Injury report</h2><span class="muted small">Every QB, RB, WR, TE and K who isn't fully active</span></div>
    <div class="filters inj-filters">
      <div class="seg">${["ALL", "QB", "RB", "WR", "TE", "K"].map((p) => btn("pos", p, p === "ALL" ? "All" : p)).join("")}</div>
      <div class="seg">${btn("roster", "all", "All")}${btn("roster", "available", "Available")}${btn("roster", "rostered", "On rosters")}</div>
    </div>
    <div id="inj-table"></div>
    <p class="fc-credit small muted">Injuries, return dates and depth charts from ESPN, updated hourly. Weeks out and snaps from <a href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noopener">nflverse</a> (CC BY 4.0). Typical recovery times are rough guides.</p>`;
  const draw = () => {
    const box = $("inj-table");
    if (!rows.length) { box.innerHTML = `<p class="muted">No players match those filters.</p>`; return; }
    box.replaceChildren(sortableTable(cols, rows, f.sort, draw, { tableClass: "pt-table inj-table" }));
  };
  draw();
  el.querySelectorAll("[data-pos],[data-roster]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.pos) f.pos = b.dataset.pos;
    if (b.dataset.roster) f.roster = b.dataset.roster;
    renderInjuries();
  }));
}

// ---------- Team usage tab ----------
// Every QB/RB/WR/TE on one NFL team, week by week, in one of three views:
// share of offensive snaps, share of the team's targets, or share of the team's rushing attempts.
// Week entries are [snaps, snap%, targets, team, carries]; team weeks are [snaps, targets, carries].
const UT_MODES = {
  snap: { label: "Snap share", count: 0, team: 0, unit: "snaps", what: "offensive snaps", full: 100, pos: ["QB", "RB", "WR", "TE"] },
  tgt: { label: "Target share", count: 2, team: 1, unit: "tgt", what: "targets", full: 35, pos: ["RB", "WR", "TE"] },
  rush: { label: "Rushing share", count: 4, team: 2, unit: "att", what: "rushing attempts", full: 70, pos: ["QB", "RB", "WR", "TE"] },
};
function renderUsage() {
  ensureValues(); // trade values (used by the player popup) fill in when they arrive
  const el = $("view-usage"), U = ensureUsage(), w = state.week, f = state.players;
  if (!U) { el.innerHTML = `<div class="loading"><span class="spinner"></span> Loading snap counts…</div>`; return; }
  if (U.error) { el.innerHTML = `<div class="banner">${esc(U.error)}</div>`; return; }
  const teams = Object.keys(NFL_NAMES).filter((t) => U.teams[t]).sort((a, b) => NFL_NAMES[a].localeCompare(NFL_NAMES[b]));
  if (!teams.length) { el.innerHTML = `<p class="muted">No snap counts yet for ${state.base.season}. nflverse posts them the day after games.</p>`; return; }
  if (!teams.includes(f.utTeam)) f.utTeam = teams[0];
  if (!UT_MODES[f.utMode]) f.utMode = "snap";
  const T = f.utTeam, tw = U.teams[T], M = UT_MODES[f.utMode], snapMode = f.utMode === "snap";
  const weeks = U.weeks.filter((wk) => wk <= w.sp);
  const played = weeks.filter((wk) => tw[wk]);
  // Fantasy owner of each player this week, or free agent / waivers.
  const owners = new Map(w.sides.flatMap((s) => s.players).map((p) => [String(p.id), rosteredRow(p)]));
  const fa = faData();
  if (fa && !fa.error) for (const p of fa.players) if (!owners.has(String(p.id))) owners.set(String(p.id), { status: p.status, waiverDate: p.waiverDate });
  const ownerOf = (id) => { const o = owners.get(String(id)); return o ? ownerCell(o) : `<span class="muted">${typeof id === "number" ? "Free agent" : "–"}</span>`; };

  const teamTot = (wk) => tw[wk]?.[M.team] || 0;
  const seasonTot = sum(played, teamTot);
  const entry = (p, wk) => (p.w[wk]?.[3] === T ? p.w[wk] : null);
  const count = (p, wk) => entry(p, wk)?.[M.count] || 0;
  // Share for one week: snap % comes straight from the data; the others are count / team total.
  const share = (p, wk) => {
    const e = entry(p, wk);
    if (!e) return 0;
    return snapMode ? e[1] : teamTot(wk) ? (e[M.count] / teamTot(wk)) * 100 : 0;
  };
  const players = U.list.map((p) => {
    const games = played.filter((wk) => entry(p, wk));
    if (!games.length) return null;
    const total = sum(games, (wk) => count(p, wk));
    return !snapMode && !total ? null : { ...p, games, total };
  }).filter(Boolean);
  const heat = (pct) => `style="background:rgba(22,163,74,${(Math.min(pct / M.full, 1) * 0.4).toFixed(2)})"`;
  const noGame = `<td class="num ut-none" title="No game (bye or not played yet)">–</td>`;
  // ▲▼: the team's most recent game vs. the player's average in earlier games.
  const lastWk = played.at(-1);
  const trend = (p) => {
    const before = p.games.filter((wk) => wk < lastWk);
    return lastWk && before.length ? usageTrend(share(p, lastWk), sum(before, (wk) => share(p, wk)) / before.length) : "";
  };
  const seasonShare = (p) => (snapMode ? sum(p.games, (wk) => share(p, wk)) / p.games.length : seasonTot ? (p.total / seasonTot) * 100 : null);

  const groups = [["QB", "Quarterbacks"], ["RB", "Running backs"], ["WR", "Wide receivers"], ["TE", "Tight ends"]].filter(([pos]) => M.pos.includes(pos)).map(([pos, label]) => {
    const list = players.filter((p) => p.pos === pos).sort((a, b) => seasonShare(b) - seasonShare(a) || b.total - a.total);
    if (!list.length) return "";
    const groupShare = (wk) => (teamTot(wk) ? (sum(list, (p) => count(p, wk)) / teamTot(wk)) * 100 : null);
    const head = `<tr class="ut-group"><td class="pt-player">${label}${snapMode ? "" : `<div class="pt-sub">Group share of team ${M.what}</div>`}</td>
      ${weeks.map((wk) => (!tw[wk] ? noGame : `<td class="num">${snapMode ? "" : pctTxt(groupShare(wk))}</td>`)).join("")}
      <td class="num">${!snapMode && seasonTot ? pctTxt((sum(list, (p) => p.total) / seasonTot) * 100) : ""}</td></tr>`;
    const rows = list.map((p) => {
      const cells = weeks.map((wk) => {
        if (!tw[wk]) return noGame;
        const e = entry(p, wk);
        if (!e) return `<td class="num ut-dnp" title="Didn't play">0%</td>`;
        const v = share(p, wk);
        return `<td class="num" ${heat(v)} title="${e[M.count]} of ${teamTot(wk)} team ${M.what}">${pctTxt(v)}<div class="pt-sub">${e[M.count]} ${M.unit}</div></td>`;
      }).join("");
      const name = typeof p.id === "number" ? plinkNm({ id: p.id, name: p.name }) : `<span class="nm-full">${esc(p.name)}</span><span class="nm-short">${esc(shortName(p.name))}</span>`;
      return `<tr><td class="pt-player"><div class="pt-name">${name}${trend(p)}</div><div class="ut-owner">${ownerOf(p.id)}</div></td>${cells}
        <td class="num"><strong>${pctTxt(seasonShare(p))}</strong><div class="pt-sub">${p.total} ${M.unit}</div></td></tr>`;
    }).join("");
    return head + rows;
  }).join("");

  const tip = { snap: "Share of the team's offensive snaps each week.", tgt: "Share of all the team's targets each week.", rush: "Share of all the team's rushing attempts each week." }[f.utMode];
  const whatCap = M.what[0].toUpperCase() + M.what.slice(1);
  el.innerHTML = `<div class="section-head"><h2>Team usage</h2><span class="muted small">Week by week, from nflverse</span></div>
    <div class="filters">
      <select id="ut-team" aria-label="NFL team">${teams.map((t) => `<option value="${t}" ${t === T ? "selected" : ""}>${esc(NFL_NAMES[t])}</option>`).join("")}</select>
      <div class="seg" id="ut-mode">${Object.entries(UT_MODES).map(([k, m]) => `<button data-m="${k}" class="${f.utMode === k ? "active" : ""}">${m.label}</button>`).join("")}</div>
    </div>
    <p class="muted small pt-hint">${tip}</p>
    ${players.length ? `<div class="table-wrap"><table class="data pt-table ut-table"><thead><tr><th class="pt-player">Player</th>${weeks.map((wk) => `<th class="num">Wk ${wk}</th>`).join("")}<th class="num">Season</th></tr></thead>
      <tbody><tr class="ut-total"><td class="pt-player">Team total<div class="pt-sub">${whatCap}</div></td>${weeks.map((wk) => (!tw[wk] ? noGame : `<td class="num">${teamTot(wk)}</td>`)).join("")}<td class="num">${seasonTot}</td></tr>
      ${groups}</tbody></table></div>` : `<p class="muted">No ${M.what} recorded for this team yet.</p>`}${nvCredit()}`;
  $("ut-team").addEventListener("change", (e) => { f.utTeam = e.target.value; renderUsage(); });
  $("ut-mode").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { f.utMode = b.dataset.m; renderUsage(); }));
}

// The current week's rosters, loaded in the background if needed (re-renders when ready).
function ensureCurrentRosters() {
  const w = state.weekCache[state.base.current];
  if (w?.nfl) return w;
  if (!state.rostersLoading) {
    state.rostersLoading = true;
    const base = state.base;
    getWeek(base.current).catch(() => {}).finally(() => {
      if (state.base !== base) return;
      state.rostersLoading = false;
      render();
    });
  }
  return null;
}

// teamId -> that team's players this week, each with a trade value.
function rostersWithValues() {
  const w = state.weekCache[state.base.current];
  const out = {};
  for (const s of w.sides) out[s.teamId] = s.players.map((p) => ({ ...p, value: valueOf(p.id) || 0 }));
  return out;
}

// ---------- Trade Analyzer ----------
const TA_POS = ["QB", "RB", "WR", "TE"];

// How many players at each position a team really needs: starting slots, plus one for flex-eligible spots.
function positionNeeds(slots) {
  const k = { QB: slots[0] || 0, RB: slots[2] || 0, WR: slots[4] || 0, TE: slots[6] || 0 };
  if (slots[23]) { k.RB += 1; k.WR += 1; }
  if (slots[3]) { k.RB += 1; k.WR += 1; }
  if (slots[5]) { k.WR += 1; k.TE += 1; }
  if (slots[7]) k.QB += 1;
  for (const p of TA_POS) k[p] = Math.max(1, k[p]);
  return k;
}

function teamProfile(players, needs, slots) {
  const byPos = {};
  for (const pos of TA_POS) {
    const list = players.filter((p) => p.pos === pos && p.slotId !== IR).sort((a, b) => b.value - a.value);
    const core = list.slice(0, needs[pos]);
    byPos[pos] = { list, core, coreValue: sum(core, (p) => p.value), extra: list.slice(needs[pos]) };
  }
  const lineup = optimalLineup(players, slots, (p) => p.value);
  return { players, byPos, total: sum(players, (p) => p.value), lineupValue: lineup.points, lineup };
}

function leagueProfiles(rosters) {
  const needs = positionNeeds(state.base.slotCounts);
  const profiles = {};
  for (const [id, players] of Object.entries(rosters)) profiles[id] = teamProfile(players, needs, state.base.slotCounts);
  const ids = Object.keys(profiles);
  const rankBy = (fn) => {
    const sorted = [...ids].sort((a, b) => fn(profiles[b]) - fn(profiles[a]));
    return Object.fromEntries(sorted.map((id, i) => [id, i + 1]));
  };
  const ranks = { total: rankBy((p) => p.total), lineup: rankBy((p) => p.lineupValue) };
  const avg = {}, slotAvg = {};
  for (const pos of TA_POS) {
    ranks[pos] = rankBy((p) => p.byPos[pos].coreValue);
    avg[pos] = sum(ids, (id) => profiles[id].byPos[pos].coreValue) / ids.length;
    // Average value of each team's 1st, 2nd, ... best player at the position.
    slotAvg[pos] = Array.from({ length: needs[pos] }, (_, i) => sum(ids, (id) => profiles[id].byPos[pos].core[i]?.value || 0) / ids.length);
  }
  return { needs, profiles, ranks, avg, slotAvg, n: ids.length };
}

// Find 1–2 of `pool` whose combined value is closest to `target` (within -10%..+25%).
function bestPackage(pool, target) {
  let best = null;
  const consider = (players) => {
    const v = sum(players, (p) => p.value);
    if (v < target * 0.9 || v > target * 1.25) return;
    const score = Math.abs(v - target) + (players.length - 1) * target * 0.03;
    if (!best || score < best.score) best = { players, value: v, score };
  };
  for (let i = 0; i < pool.length; i++) {
    consider([pool[i]]);
    for (let j = i + 1; j < pool.length; j++) consider([pool[i], pool[j]]);
  }
  return best;
}

function renderTradeAnalyzer() {
  const el = $("view-trade");
  const values = ensureValues();
  ensureUsage(); // snap shares fill in when they arrive
  const week = ensureCurrentRosters();
  if (!values || !week) { el.innerHTML = `<div class="loading"><span class="spinner"></span> Loading rosters and trade values…</div>`; return; }
  if (values.error) { el.innerHTML = `<div class="banner">${esc(values.error)}</div>`; return; }

  const rosters = rostersWithValues();
  const L = leagueProfiles(rosters);
  const teamIds = Object.keys(rosters).sort((a, b) => team(a).name.localeCompare(team(b).name));
  const myKey = `ffb.myteam.${state.leagueId || "default"}`;
  // my = team being analyzed; a/b = the two sides of the mock trade (default: my team vs. another).
  const ta = (state.ta ||= { my: myTeamId() || "", a: "", b: "", give: [], get: [] });
  if (!rosters[ta.my]) ta.my = teamIds[0];
  const me = L.profiles[ta.my];
  const n = L.n;
  const rk = (r) => `${ordinal(r)} of ${n}`;
  const rkCls = (r) => (r <= Math.ceil(n * 0.3) ? "pos" : r > Math.floor(n * 0.7) ? "neg" : "");
  const pname = (p) => `${plink(p.id, p.name)} <span class="muted small">${p.pos}${p.nfl ? " · " + p.nfl : ""}</span>${injBadge(p)}`;

  // --- Team analysis ---
  const posRows = TA_POS.map((pos) => {
    const b = me.byPos[pos], r = L.ranks[pos][ta.my], diff = L.avg[pos] ? (b.coreValue - L.avg[pos]) / L.avg[pos] : 0;
    return `<tr><td><strong>${pos}</strong></td>
      <td>${b.core.map((p) => `<div>${pname(p)} <span class="muted small">${fmtVal(p.value)}</span></div>`).join("") || `<span class="neg">Nobody</span>`}</td>
      <td class="num">${fmtVal(b.coreValue)}</td>
      <td class="num"><span class="${rkCls(r)}">${rk(r)}</span></td>
      <td class="num"><span class="${clsSign(diff)}">${signed(diff * 100, 0)}%</span></td></tr>`;
  }).join("");

  const sortedPos = [...TA_POS].sort((a, b) => L.ranks[a][ta.my] - L.ranks[b][ta.my]);
  const strongest = sortedPos[0], weakest = sortedPos[sortedPos.length - 1];
  const weakPositions = TA_POS.filter((pos) => L.ranks[pos][ta.my] > n / 2).sort((a, b) => L.ranks[b][ta.my] - L.ranks[a][ta.my]);
  const strongPositions = TA_POS.filter((pos) => L.ranks[pos][ta.my] <= n / 2);

  const lacking = [];
  for (const pos of weakPositions) {
    const b = me.byPos[pos];
    // The starting spot where this team falls furthest below a typical team.
    let gapIdx = 0, gap = -Infinity;
    L.slotAvg[pos].forEach((avgV, i) => { const g = avgV - (b.core[i]?.value || 0); if (g > gap) { gap = g; gapIdx = i; } });
    const p = b.core[gapIdx];
    lacking.push(`<strong>${pos}</strong> ranks ${rk(L.ranks[pos][ta.my])}, ${Math.abs(Math.round((b.coreValue - L.avg[pos]) / L.avg[pos] * 100))}% below the league average. ` +
      `Your ${pos}${gapIdx + 1}${p ? ` (${esc(p.name)}, ${fmtVal(p.value)})` : " spot is empty and"} trails a typical ${pos}${gapIdx + 1} (${fmtVal(L.slotAvg[pos][gapIdx])}).`);
  }
  const hurtStarters = me.lineup.lineup.map((x) => x.p).filter((p) => ["OUT", "INJURY_RESERVE", "DOUBTFUL", "SUSPENSION"].includes(p.injury));
  if (hurtStarters.length) lacking.push(`Starters with injury designations: ${hurtStarters.map((p) => `${esc(p.name)} (${esc(injuryInfo(p.injury)[1].toLowerCase())})`).join(", ")}.`);
  const benchValue = me.total - me.lineupValue;
  const benchRanks = Object.entries(L.profiles).map(([id, p]) => [id, p.total - p.lineupValue]).sort((a, b) => b[1] - a[1]);
  const benchRank = benchRanks.findIndex(([id]) => id === String(ta.my)) + 1;
  if (benchRank > n * 0.7) lacking.push(`Your bench is thin (${rk(benchRank)} in bench value, ${fmtVal(benchValue)}), so one injury could leave a hole.`);
  for (const pos of strongPositions) {
    const extra = me.byPos[pos].extra[0];
    if (extra && extra.value >= (L.slotAvg[pos][L.needs[pos] - 1] || 0)) lacking.push(`Surplus at <strong>${pos}</strong>: ${esc(extra.name)} (${fmtVal(extra.value)}) sits behind your starters but is worth as much as a typical starting ${pos}. A good trade chip.`);
  }
  if (!lacking.length) lacking.push("No obvious holes: every position is at or above the league average.");

  // --- Potential adds: free agents ---
  const rostered = new Set(Object.values(rosters).flat().map((p) => p.id));
  const freeAgents = [...values.byId.values()].filter((v) => !rostered.has(v.espnId)).sort((a, b) => b.value - a.value);
  const faFor = (pos) => freeAgents.filter((v) => v.pos === pos).slice(0, 3);
  const faRows = [...new Set([...weakPositions, ...TA_POS])].slice(0, 4).map((pos) => {
    const list = faFor(pos);
    const upgrade = (v) => v.value > (me.byPos[pos].core[me.byPos[pos].core.length - 1]?.value || 0);
    return `<div class="fa-pos"><div class="fa-pos-head"><strong>${pos}</strong>${weakPositions.includes(pos) ? ` <span class="badge inj">NEED</span>` : ""}</div>
      ${list.map((v) => `<div class="fa-row"><span>${plink(v.espnId, v.name)} <span class="muted small">${esc(v.nfl)}</span>${upgrade(v) ? ` <span class="badge live" title="Worth more than your weakest starter at ${pos}">UPGRADE</span>` : ""}</span><span class="num">${valueCell(v.espnId)}</span></div>`).join("") || `<p class="muted small">No ${pos}s with a FantasyCalc value are available.</p>`}</div>`;
  }).join("");

  // --- Potential adds: trade targets ---
  // What you can offer: anyone outside your best starting lineup, plus a starter at a position where you're top-3-ish.
  // Players you rely on at a weak position stay off the table.
  const starterIds = new Set(me.lineup.lineup.map((x) => x.p.id));
  const keep = new Set(weakPositions.flatMap((pos) => me.byPos[pos].core.map((p) => p.id)));
  const myPool = [...new Set([
    ...me.players.filter((p) => !starterIds.has(p.id) && p.slotId !== IR),
    ...TA_POS.filter((pos) => L.ranks[pos][ta.my] <= Math.ceil(n * 0.3)).flatMap((pos) => me.byPos[pos].core.slice(-1)),
  ])].filter((p) => p.value > 0 && !keep.has(p.id)).sort((a, b) => b.value - a.value).slice(0, 10);
  const targets = [];
  for (const pos of weakPositions) {
    const floor = me.byPos[pos].core[me.byPos[pos].core.length - 1]?.value || 0;
    for (const [id, prof] of Object.entries(L.profiles)) {
      if (id === String(ta.my)) continue;
      // Players a partner can spare: depth beyond their needs, or anyone at a position they're strong in.
      const spare = L.ranks[pos][id] <= n / 2 ? prof.byPos[pos].list.slice(1) : prof.byPos[pos].extra;
      for (const p of spare) {
        if (p.value <= floor * 1.15) continue;
        const pkg = bestPackage(myPool.filter((x) => L.ranks[x.pos][id] > n / 2 || x.pos !== pos), p.value);
        // Weight the upgrade by how weak you are at that position, so the biggest holes come first.
        if (pkg) targets.push({ teamId: id, p, pkg, score: (p.value - floor) * (L.ranks[pos][ta.my] / n) });
      }
    }
  }
  targets.sort((a, b) => b.score - a.score);
  const seen = new Set(), perPos = {};
  const topTargets = targets.filter((t) => {
    if (seen.has(t.p.id) || (perPos[t.p.pos] || 0) >= 2) return false;
    seen.add(t.p.id);
    perPos[t.p.pos] = (perPos[t.p.pos] || 0) + 1;
    return true;
  }).slice(0, 5);
  const targetRows = topTargets.map((t, i) => `<div class="card target">
      <div><span class="muted small">Ask</span> ${teamName(t.teamId, 20)} <span class="muted small">for</span> <strong>${plink(t.p.id, t.p.name)}</strong> <span class="muted small">${t.p.pos} · ${fmtVal(t.p.value)}</span></div>
      <div><span class="muted small">Offer</span> ${t.pkg.players.map((p) => `<strong>${plink(p.id, p.name)}</strong> <span class="muted small">${p.pos} · ${fmtVal(p.value)}</span>`).join(" + ")} <span class="muted small">(total ${fmtVal(t.pkg.value)})</span></div>
      <div class="small muted">They rank ${ordinal(L.ranks[t.p.pos][t.teamId])} at ${t.p.pos}${t.pkg.players.map((p) => p.pos).filter((v, j, a) => a.indexOf(v) === j).map((pp) => ` and ${ordinal(L.ranks[pp][t.teamId])} at ${pp}`).join("")}.</div>
      <button class="link-btn" data-target="${i}">Try in mock trade ↑</button></div>`).join("")
    || `<p class="muted">No clear trade targets right now${weakPositions.length ? "" : ", since you have no below-average positions"}.</p>`;

  // --- Win-win trades: fair swaps (within 15% in value) that improve BOTH teams' starting lineups. ---
  // 1-for-1 and 2-for-1 in either direction. Cached per team/values so mock-trade clicks stay quick.
  const wwKey = `${ta.my}:${state.values.updated}:${Object.values(rosters).flat().length}`;
  if (state.winWin?.key !== wwKey) {
    const slots = state.base.slotCounts;
    const lineupVal = (players) => optimalLineup(players, slots, (p) => p.value).points;
    const swapIn = (players, out, inn) => players.filter((p) => !out.includes(p)).concat(inn.map((p) => ({ ...p, slotId: BENCH })));
    const tradeable = (players) => players.filter((p) => p.slotId !== IR && p.value > 0).sort((a, b) => b.value - a.value);
    const mine = tradeable(me.players), myTop = mine.slice(0, 8);
    const pairs = (list) => list.flatMap((a, i) => list.slice(i + 1).map((b) => [a, b]));
    const deals = [];
    for (const [id, prof] of Object.entries(L.profiles)) {
      if (id === String(ta.my)) continue;
      const theirs = tradeable(prof.players), theirTop = theirs.slice(0, 8);
      const tryDeal = (give, get) => {
        const gv = sum(give, (p) => p.value), rv = sum(get, (p) => p.value);
        if (Math.abs(gv - rv) > Math.max(gv, rv) * 0.15) return;
        const myGain = lineupVal(swapIn(me.players, give, get)) - me.lineupValue;
        if (myGain <= 0) return;
        const theirGain = lineupVal(swapIn(prof.players, get, give)) - prof.lineupValue;
        if (theirGain > 0) deals.push({ teamId: id, give, get, myGain, theirGain, score: Math.min(myGain, theirGain) * 2 + myGain });
      };
      for (const g of mine) for (const r of theirs) tryDeal([g], [r]);
      for (const pr of pairs(myTop)) for (const r of theirs) tryDeal(pr, [r]);
      for (const g of mine) for (const pr of pairs(theirTop)) tryDeal([g], pr);
    }
    deals.sort((a, b) => b.score - a.score);
    // Keep the list varied: each player appears at most twice, at most two deals per partner.
    const used = {}, perTeam = {};
    const list = deals.filter((d) => {
      const ids = [...d.give, ...d.get].map((p) => p.id);
      if (ids.some((x) => (used[x] || 0) >= 2) || (perTeam[d.teamId] || 0) >= 2) return false;
      ids.forEach((x) => (used[x] = (used[x] || 0) + 1));
      perTeam[d.teamId] = (perTeam[d.teamId] || 0) + 1;
      return true;
    }).slice(0, 5);
    state.winWin = { key: wwKey, list };
  }
  const winWin = state.winWin.list;
  const side = (ps) => ps.map((p) => `<strong>${plink(p.id, p.name)}</strong> <span class="muted small">${p.pos} · ${fmtVal(p.value)}</span>`).join(" + ");
  const winWinRows = winWin.map((d, i) => `<div class="card target">
      <div><span class="muted small">With</span> ${teamName(d.teamId, 20)}</div>
      <div><span class="muted small">You get</span> ${side(d.get)}</div>
      <div><span class="muted small">You give</span> ${side(d.give)}</div>
      <div class="small"><span class="pos">Your lineup +${fmtVal(d.myGain)}</span> · <span class="pos">their lineup +${fmtVal(d.theirGain)}</span> <span class="muted">(starting lineup value)</span></div>
      <button class="link-btn" data-ww="${i}">Try in mock trade ↑</button></div>`).join("")
    || `<p class="muted">No fair trade improves both lineups right now. Check back after values or rosters change.</p>`;

  // --- Mock trade: any team (A) with any other team (B). "give" = A's players, "get" = B's players. ---
  if (!rosters[ta.a]) ta.a = ta.my;
  if (!rosters[ta.b] || ta.b === ta.a) ta.b = teamIds.find((id) => id !== ta.a);
  const A = ta.a, B = ta.b;
  const playersA = [...rosters[A]].sort((a, b) => b.value - a.value);
  const playersB = [...rosters[B]].sort((a, b) => b.value - a.value);
  // Chosen players show as chips (name, position · value, remove button); one "Add player" menu below them.
  const pick = (list, chosen, name) => {
    const ids = chosen.map(String);
    const chips = ids.map((id) => list.find((p) => String(p.id) === id)).filter(Boolean).map((p) => `<div class="mock-chip">
        <div class="mock-chip-info"><div class="mock-chip-nm">${esc(p.name)}</div><div class="mock-chip-sub">${esc(p.pos)} · ${fmtVal(p.value)}${usageOf(p.id) ? ` · ${pctTxt(usageOf(p.id).last.pct)} snaps` : ""}</div></div>
        <button type="button" class="mock-rm" data-rm="${name}" data-id="${p.id}" aria-label="Remove ${esc(p.name)}">×</button></div>`).join("");
    const add = ids.length >= 3 ? "" : `<select data-side="${name}" aria-label="Add player"><option value="">${ids.length ? "+ Add player" : "Choose a player"}</option>
      ${list.filter((p) => !ids.includes(String(p.id))).map((p) => `<option value="${p.id}">${esc(p.name)} (${p.pos}) · ${fmtVal(p.value)}</option>`).join("")}</select>`;
    return chips + add;
  };
  const sendA = ta.give.map((id) => playersA.find((p) => String(p.id) === String(id))).filter(Boolean);
  const sendB = ta.get.map((id) => playersB.find((p) => String(p.id) === String(id))).filter(Boolean);
  let result = `<p class="muted">Pick players on both sides to see how the trade grades out.</p>`;
  if (sendA.length && sendB.length) {
    const nameA = esc(team(A).name), nameB = esc(team(B).name);
    const va = sum(sendA, (p) => p.value), vb = sum(sendB, (p) => p.value); // value each team sends
    const d = vb - va, pctD = Math.abs(d) / Math.max(va, vb, 1);           // d > 0: team A receives more
    const verdict = pctD <= 0.05 ? `<span class="verdict even">Fair trade</span> <span class="muted">(within 5%)</span>`
      : `<span class="verdict pos">${d > 0 ? nameA : nameB} wins by ${fmtVal(Math.abs(d))}</span> <span class="muted">(${Math.round(pctD * 100)}%)</span>`;
    const after = (players, out, inn) => players.filter((p) => !out.includes(p)).concat(inn.map((p) => ({ ...p, slotId: BENCH })));
    const afterA = teamProfile(after(rosters[A], sendA, sendB), L.needs, state.base.slotCounts);
    const afterB = teamProfile(after(rosters[B], sendB, sendA), L.needs, state.base.slotCounts);
    const profileAfter = (id) => (id === String(A) ? afterA : id === String(B) ? afterB : L.profiles[id]);
    // Each team's position ranks with the trade applied to both rosters.
    const rankAfter = (id, pos) => 1 + Object.keys(L.profiles).filter((o) => o !== String(id) && profileAfter(o).byPos[pos].coreValue > profileAfter(String(id)).byPos[pos].coreValue).length;
    const posChanges = (id) => TA_POS.map((pos) => [pos, L.ranks[pos][id], rankAfter(id, pos)]).filter(([, x, y]) => x !== y)
      .map(([pos, x, y]) => `<span class="${y < x ? "pos" : "neg"}">${pos} ${ordinal(x)} → ${ordinal(y)}</span>`).join(" · ");
    const impact = (id, name, before, aft) => `<div class="tr-team"><strong>${name}</strong>
        <div><span class="muted small">Starting lineup value</span> ${fmtVal(before.lineupValue)} → <strong>${fmtVal(aft.lineupValue)}</strong> ${valDelta(aft.lineupValue - before.lineupValue)}</div>
        ${posChanges(id) ? `<div><span class="muted small">Position ranks</span> ${posChanges(id)}</div>` : ""}</div>`;
    const consolidation = sendA.length !== sendB.length
      ? `<p class="small muted">${nameA} sends ${sendA.length} player${sendA.length > 1 ? "s" : ""} and ${nameB} sends ${sendB.length}. In uneven trades the side receiving the single best player usually deserves a bit extra, since roster spots and star power matter; raw totals don't capture that.</p>` : "";
    result = `<div class="trade-result">
      <div class="tr-totals"><div><span class="muted small">${nameA} sends</span><strong>${fmtVal(va)}</strong></div><div class="tr-arrow">⇄</div><div class="right"><span class="muted small">${nameB} sends</span><strong>${fmtVal(vb)}</strong></div></div>
      <div class="tr-verdict">${verdict}</div>
      <div class="tr-impact">${impact(A, nameA, L.profiles[A], afterA)}${impact(B, nameB, L.profiles[B], afterB)}</div>${consolidation}</div>`;
  }

  const teamOpts = (sel, exclude) => teamIds.filter((id) => id !== exclude).map((id) => `<option value="${id}" ${id === String(sel) ? "selected" : ""}>${esc(team(id).name)}</option>`).join("");
  el.innerHTML = `<div class="section-head"><h2>Trade Analyzer</h2>
      <label class="small muted ta-me">My team <select id="ta-my">${teamOpts(ta.my)}</select></label></div>
    <div class="section-head" id="mock-trade"><h2>Mock trade</h2><span class="muted small">Any two teams · up to 3 players per side</span></div>
    <div class="mock">
      <div class="card"><div class="mock-head">${logoImg(team(A), 22)}<select id="ta-a" aria-label="First team">${teamOpts(A)}</select></div><div class="mock-sends">sends</div>${pick(playersA, ta.give, "give")}</div>
      <div class="card"><div class="mock-head">${logoImg(team(B), 22)}<select id="ta-b" aria-label="Second team">${teamOpts(B, A)}</select></div><div class="mock-sends">sends</div>${pick(playersB, ta.get, "get")}</div>
    </div>
    <div class="card">${result}</div>
    <div class="section-head"><h2>Your team</h2></div>
    <div class="grid grid-awards">
      <div class="card award"><div class="label">Roster value</div><div class="value">${fmtVal(me.total)}</div><div class="why"><span class="${rkCls(L.ranks.total[ta.my])}">${rk(L.ranks.total[ta.my])}</span> in the league</div></div>
      <div class="card award"><div class="label">Starting lineup value</div><div class="value">${fmtVal(me.lineupValue)}</div><div class="why"><span class="${rkCls(L.ranks.lineup[ta.my])}">${rk(L.ranks.lineup[ta.my])}</span> in the league</div></div>
      <div class="card award"><div class="label">Strongest position</div><div class="value">${strongest}</div><div class="why">${rk(L.ranks[strongest][ta.my])}</div></div>
      <div class="card award"><div class="label">Weakest position</div><div class="value">${weakest}</div><div class="why">${rk(L.ranks[weakest][ta.my])}</div></div>
    </div>
    <div class="section-head"><h2>Team analysis</h2><span class="muted small">Your top players at each position vs. every other team</span></div>
    <div class="table-wrap"><table class="data ta-pos"><thead><tr><th>Pos</th><th>Your core players</th><th class="num">Value</th><th class="num">League rank</th><th class="num">vs. avg</th></tr></thead><tbody>${posRows}</tbody></table></div>
    <h3 class="ta-sub">What your team is lacking</h3>
    <ul class="insights">${lacking.map((s) => `<li>${s}</li>`).join("")}</ul>
    <div class="section-head"><h2>Potential adds</h2></div>
    <h3 class="ta-sub">Best available free agents</h3>
    <div class="grid grid-2 fa-grid">${faRows}</div>
    <p class="small muted">Free agents or players on waivers. FantasyCalc only values QB, RB, WR and TE.</p>
    <h3 class="ta-sub">Win-win trades</h3>
    <p class="small muted">Fair trades (within 15% in value) where both teams' starting lineups get better.</p>
    <div class="grid targets">${winWinRows}</div>
    <h3 class="ta-sub">Trade targets</h3>
    <div class="grid targets">${targetRows}</div>
    ${fcCredit()}${nvCredit()}`;

  $("ta-my").addEventListener("change", (e) => { ta.my = e.target.value; store.set(myKey, ta.my); updateEspnLink(); renderTradeAnalyzer(); });
  $("ta-a").addEventListener("change", (e) => {
    // Picking the team that's already on the other side swaps the two sides.
    if (e.target.value === String(ta.b)) Object.assign(ta, { b: ta.a, give: ta.get, get: ta.give });
    else ta.give = [];
    ta.a = e.target.value;
    renderTradeAnalyzer();
  });
  $("ta-b").addEventListener("change", (e) => { ta.b = e.target.value; ta.get = []; renderTradeAnalyzer(); });
  el.querySelectorAll("select[data-side]").forEach((s) => s.addEventListener("change", () => {
    if (!s.value) return;
    ta[s.dataset.side] = [...ta[s.dataset.side], s.value].filter((v, i, a) => v && a.indexOf(v) === i).slice(0, 3);
    renderTradeAnalyzer();
  }));
  el.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => {
    ta[b.dataset.rm] = ta[b.dataset.rm].filter((id) => String(id) !== b.dataset.id);
    renderTradeAnalyzer();
  }));
  el.querySelectorAll("[data-ww]").forEach((b) => b.addEventListener("click", () => {
    const d = winWin[+b.dataset.ww];
    Object.assign(ta, { a: ta.my, b: d.teamId, give: d.give.map((p) => String(p.id)), get: d.get.map((p) => String(p.id)) });
    renderTradeAnalyzer();
    $("mock-trade").scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  el.querySelectorAll("[data-target]").forEach((b) => b.addEventListener("click", () => {
    const t = topTargets[+b.dataset.target];
    Object.assign(ta, { a: ta.my, b: t.teamId, get: [String(t.p.id)], give: t.pkg.players.map((p) => String(p.id)) });
    renderTradeAnalyzer();
    $("mock-trade").scrollIntoView({ behavior: "smooth", block: "start" });
  }));
}

// ---------- Transactions ----------
async function loadActivity() {
  if (state.demo) return window.DemoLeague.activity();
  const q = new URLSearchParams();
  if (state.leagueId) q.set("leagueId", state.leagueId);
  if (state.season) q.set("season", state.season);
  let res, body;
  try {
    res = await fetch(`/api/activity?${q}`);
    body = await res.json();
  } catch {
    throw new ApiError("no_function", "Couldn't reach the transactions function. Make sure netlify/functions/activity.mjs is uploaded.");
  }
  if (!res.ok) throw new ApiError(body.error, body.message || `Request failed (${res.status})`);
  return body;
}

function renderTransactions() {
  const el = $("view-transactions");
  const a = state.activity;
  if (!a || a === "loading") {
    el.innerHTML = `<div class="loading"><span class="spinner"></span> Loading transactions…</div>`;
    if (!a) {
      state.activity = "loading";
      loadActivity()
        .then((d) => { state.activity = d; })
        .catch((e) => { state.activity = { error: e.message }; })
        .finally(() => { if (state.tab === "transactions") renderTransactions(); });
    }
    return;
  }
  if (a.error) { el.innerHTML = `<div class="banner">${esc(a.error)}</div>`; return; }

  const player = (id) => {
    const p = a.players[id];
    if (!p) return `<span class="tx-player">Unknown player</span>`;
    const [name, posId, proId] = p;
    return `<span class="tx-player">${plink(id, name)} <span class="muted small">${POS[posId] || ""}${PRO[proId] && proId ? " · " + PRO[proId] : ""}</span></span>`;
  };
  const fmtDate = (ms) => new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const weekLabel = (w) => (w ? `Week ${w}` : "Preseason");
  ensureValues();
  const hasValues = !!state.values?.byId?.size;
  const sideValue = (s) => sum(s.gets, (id) => valueOf(id) || 0);
  // Who came out ahead by today's FantasyCalc values.
  const tradeVerdict = (sides) => {
    if (!hasValues || sides.length !== 2) return "";
    const [a, b] = sides.map(sideValue), d = a - b, big = Math.max(a, b, 1);
    if (Math.abs(d) / big <= 0.05) return `<div class="trade-verdict"><span class="verdict even">Even trade</span> <span class="muted small">by today's values</span></div>`;
    const winner = d > 0 ? sides[0] : sides[1];
    return `<div class="trade-verdict"><strong>${esc(team(winner.teamId).name)}</strong> gets <span class="pos">+${fmtVal(Math.abs(d))}</span> more value <span class="muted small">(${Math.round(Math.abs(d) / big * 100)}%, by today's values)</span></div>`;
  };
  const tradeSidesHtml = (sides) => `<div class="trade-sides">${sides.map((s) => `<div class="trade-side">
      <div class="trade-team">${teamName(s.teamId, 26)}</div>
      <div class="small muted">receives${hasValues ? ` · value <strong>${fmtVal(sideValue(s))}</strong>` : ""}</div>
      ${s.gets.map((id) => `<div class="tx-line add">+ ${player(id)}${hasValues && valueOf(id) ? ` <span class="muted small">${fmtVal(valueOf(id))}</span>` : ""}</div>`).join("") || `<div class="muted small">Nothing</div>`}
      ${s.drops.map((id) => `<div class="tx-line drop">− ${player(id)} <span class="muted small">(dropped)</span></div>`).join("")}
    </div>`).join(`<div class="trade-swap" aria-hidden="true">⇄</div>`)}</div>${tradeVerdict(sides)}`;

  // Pending trades
  const pending = a.pendingTrades.length
    ? `<div class="grid">${a.pendingTrades.map((t) => `<div class="card trade-card">
        <div class="trade-meta"><span class="badge inj">PENDING</span> <span class="muted small">Accepted ${fmtDate(t.acceptedDate)} · awaiting league review</span></div>
        ${tradeSidesHtml(t.sides)}</div>`).join("")}</div>`
    : `<p class="muted">No pending trades right now.${a.signedIn || state.demo ? "" : " (ESPN only shows trades to signed-in members: add the ESPN_S2 and SWID settings in Netlify.)"}</p>`;

  // Completed moves
  const f = state.txFilter;
  const involves = (m, teamId) => m.teamId === teamId || (m.sides || []).some((s) => s.teamId === teamId);
  const moves = a.moves.filter((m) => (f.kind === "all" || m.kind === f.kind) && (f.team === "ALL" || involves(m, +f.team)));
  const kindLabel = { waiver: "Waiver", freeagent: "Free agent", trade: "Trade" };
  const row = (m) => {
    const when = `<div class="tx-when">${fmtDate(m.date)}</div>`;
    if (m.kind === "trade") {
      return `<div class="card tx tx-trade">${when}<div class="tx-main"><span class="tx-kind trade">Trade</span>${tradeSidesHtml(m.sides)}</div></div>`;
    }
    const lines = [...m.adds.map((id) => `<div class="tx-line add">+ ${player(id)}</div>`), ...m.drops.map((id) => `<div class="tx-line drop">− ${player(id)}</div>`)].join("");
    const bid = m.bid != null && m.kind === "waiver" ? `<div class="tx-bid">$${m.bid}</div>` : "";
    return `<div class="card tx">${when}<div class="tx-main"><div class="tx-head">${teamName(m.teamId, 26)}<span class="tx-kind ${m.kind}">${kindLabel[m.kind]}</span></div>${lines}</div>${bid}</div>`;
  };
  const groups = [];
  for (const m of moves) {
    const g = groups[groups.length - 1];
    if (g && g.week === m.week) g.items.push(m); else groups.push({ week: m.week, items: [m] });
  }
  const teamOpts = Object.values(state.base.teams).sort((x, y) => x.name.localeCompare(y.name))
    .map((t) => `<option value="${t.id}" ${String(f.team) === String(t.id) ? "selected" : ""}>${esc(t.name)}</option>`).join("");

  el.innerHTML = `<div class="section-head"><h2>Pending trades</h2><span class="muted small">Trades both teams accepted that haven't gone through yet</span></div>
    ${pending}
    <div class="section-head"><h2>Transactions</h2><span class="muted small">Waiver claims, free-agent moves and completed trades, newest first</span></div>
    <div class="filters">
      <select id="tx-team" aria-label="Team"><option value="ALL">All teams</option>${teamOpts}</select>
      <div class="seg" id="tx-kind">${[["all", "All"], ["waiver", "Waivers"], ["freeagent", "Free agents"], ["trade", "Trades"]].map(([k, l]) => `<button data-k="${k}" class="${f.kind === k ? "active" : ""}">${l}</button>`).join("")}</div>
    </div>
    ${groups.length ? groups.map((g) => `<h3 class="tx-week">${weekLabel(g.week)}</h3><div class="tx-list">${g.items.map(row).join("")}</div>`).join("") : `<p class="muted">No transactions match.</p>`}
    ${hasValues ? fcCredit() : ""}`;
  $("tx-team").addEventListener("change", (e) => { f.team = e.target.value; renderTransactions(); });
  $("tx-kind").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { f.kind = b.dataset.k; renderTransactions(); }));
}

// ---------- Player popup: game log & scoring breakdown ----------
// ESPN stat IDs that leagues score, with readable names. Counted stats show "count × points each".
const STAT_NAMES = {
  3: "passing yards", 4: "passing TDs", 15: "40+ yd passing TD bonus", 16: "50+ yd passing TD bonus", 19: "passing 2-pt conversions", 20: "interceptions thrown",
  24: "rushing yards", 25: "rushing TDs", 26: "rushing 2-pt conversions", 35: "40+ yd rushing TD bonus", 36: "50+ yd rushing TD bonus",
  42: "receiving yards", 43: "receiving TDs", 44: "receiving 2-pt conversions", 45: "40+ yd receiving TD bonus", 46: "50+ yd receiving TD bonus", 53: "receptions",
  63: "fumble recovered for TD", 64: "times sacked", 68: "fumbles", 72: "fumbles lost",
  74: "field goals made (50+ yds)", 77: "field goals made (40–49 yds)", 80: "field goals made (0–39 yds)", 198: "field goals made (50–59 yds)", 201: "field goals made (60+ yds)",
  85: "missed field goals", 86: "extra points made", 88: "missed extra points",
  93: "blocked kick return TDs", 95: "interceptions", 96: "fumble recoveries", 97: "blocked kicks", 98: "safeties", 99: "sacks",
  101: "kickoff return TDs", 102: "punt return TDs", 103: "interception return TDs", 104: "fumble return TDs", 106: "forced fumbles",
  205: "2-pt conversion returns", 206: "2-pt conversion returns", 209: "1-point safeties",
};
// One-off bonuses and tiers: shown as a label, not a count.
const STAT_TIERS = {
  17: "300–399 yd passing game bonus", 18: "400+ yd passing game bonus", 37: "100–199 yd rushing game bonus", 38: "200+ yd rushing game bonus",
  56: "100–199 yd receiving game bonus", 57: "200+ yd receiving game bonus",
};
const PA_TIERS = { 89: "0", 90: "1–6", 91: "7–13", 92: "14–17", 121: "18–21", 122: "22–27", 123: "28–34", 124: "35–45", 125: "46+" };
const YA_TIERS = { 128: "under 100", 129: "100–199", 130: "200–299", 131: "300–349", 132: "350–399", 133: "400–449", 134: "450–499", 135: "500–549", 136: "550+" };

const plink = (id, name) => `<button type="button" class="pl-link" data-pid="${esc(id)}">${esc(name)}</button>`;
const ptsLink = (id, sp, html) => `<button type="button" class="pts-link" data-pid="${esc(id)}" data-sp="${esc(sp)}" title="How these points were scored">${html}</button>`;
const fmtNum = (n) => (Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toString());
const fmtEach = (n) => String(Math.round(n * 1000) / 1000); // e.g. 0.04 points per passing yard
// "1 passing TD", not "1 passing TDs".
const singular = (label) => label.replace(/\b(TDs|yards|receptions|interceptions|fumbles|goals|points|kicks|recoveries|safeties|sacks|returns|conversions|times)\b/,
  (w) => ({ recoveries: "recovery", safeties: "safety" }[w] || w.slice(0, -1)));

// Each line of how a week's points were earned, from ESPN's per-stat points (appliedStats).
function scoringLines(w, posId) {
  const lines = Object.entries(w.applied).map(([id, pts]) => {
    const n = Number(id), count = Number(w.stats[id] ?? 0);
    let label;
    if (PA_TIERS[n]) label = `Points allowed: ${fmtNum(Number(w.stats[120] ?? 0))} (${PA_TIERS[n]} tier)`;
    else if (YA_TIERS[n]) label = `Yards allowed: ${fmtNum(Number(w.stats[127] ?? 0))} (${YA_TIERS[n]} tier)`;
    else if (n === 117) label = `Kickoff return yards: ${fmtNum(Number(w.stats[114] ?? 0))} <span class="muted">(1 pt per 25)</span>`;
    else if (n === 119) label = `Punt return yards: ${fmtNum(Number(w.stats[115] ?? 0))} <span class="muted">(1 pt per 25)</span>`;
    else if (STAT_TIERS[n]) label = STAT_TIERS[n];
    else if (STAT_NAMES[n]) {
      const each = count ? Math.round((pts / count) * 100) / 100 : null;
      label = `${fmtNum(count)} ${count === 1 ? singular(STAT_NAMES[n]) : STAT_NAMES[n]}${each != null && count !== 1 ? ` <span class="muted">× ${fmtEach(each)}</span>` : ""}`;
    } else label = `Other ${posId === 16 ? "D/ST " : ""}scoring <span class="muted">(ESPN stat ${n}${count ? `, ${fmtNum(count)}` : ""})</span>`;
    return { label, pts };
  });
  return lines.sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts));
}

function breakdownHtml(w, posId) {
  const lines = scoringLines(w, posId);
  if (!lines.length) return `<p class="muted small">No scoring plays${w.pts ? "" : " yet"}.</p>`;
  return `<table class="breakdown"><tbody>${lines.map((l) => `<tr><td>${l.label}</td><td class="num ${l.pts < 0 ? "neg" : ""}">${l.pts > 0 ? "+" : l.pts < 0 ? "−" : ""}${f2(Math.abs(l.pts))}</td></tr>`).join("")}
    <tr class="total"><td>Total</td><td class="num">${f2(w.pts)}</td></tr></tbody></table>`;
}

function gameLine(posId, s) {
  if (posId === 5) return `FG ${s[83] || 0}/${s[84] || 0}, XP ${s[86] || 0}/${s[87] || 0}`;
  if (posId === 16) return [s[120] != null && `${s[120]} pts allowed`, s[127] != null && `${s[127]} yds allowed`, s[99] && `${fmtNum(s[99])} sacks`, s[95] && `${s[95]} INT`, s[96] && `${s[96]} fumble rec`, s[106] && `${s[106]} forced fumbles`].filter(Boolean).join(", ");
  return statLine(posId, s) || "No stats";
}

async function fetchPlayer(id) {
  if (state.demo) return window.DemoLeague.player(Number(id));
  const q = new URLSearchParams({ id });
  if (state.leagueId) q.set("leagueId", state.leagueId);
  if (state.season) q.set("season", state.season);
  let res, body;
  try {
    res = await fetch(`/api/player?${q}`);
    body = await res.json();
  } catch {
    throw new ApiError("no_function", "Couldn't reach the player function. Make sure netlify/functions/player.mjs is uploaded.");
  }
  if (!res.ok) throw new ApiError(body.error, body.message || `Request failed (${res.status})`);
  return body;
}

function initPlayerModal() {
  const m = document.createElement("div");
  m.id = "pl-modal";
  m.className = "modal";
  m.hidden = true;
  m.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="pl-modal-title">
    <button type="button" class="modal-close" aria-label="Close">×</button><div id="pl-modal-body"></div></div>`;
  document.body.appendChild(m);
  const close = () => {
    m.hidden = true;
    document.body.classList.remove("modal-open");
    state.modalReturn?.focus?.();
  };
  m.addEventListener("click", (e) => { if (e.target === m || e.target.closest(".modal-close")) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !m.hidden) close(); });
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".pl-link, .pts-link");
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    state.modalReturn = b;
    openPlayer(b.dataset.pid, b.dataset.sp ? Number(b.dataset.sp) : null);
  }, true);
}

// Open the shared popup with arbitrary content (e.g. the Roster tab's upgrade list).
function showModal(html) {
  const m = $("pl-modal");
  $("pl-modal-body").innerHTML = html;
  m.hidden = false;
  document.body.classList.add("modal-open");
  m.querySelector(".modal-close").focus();
  m.querySelector(".modal-card").scrollTop = 0;
}

async function openPlayer(id, focusSp) {
  const m = $("pl-modal"), body = $("pl-modal-body");
  m.hidden = false;
  document.body.classList.add("modal-open");
  m.querySelector(".modal-close").focus();
  const cache = (state.playerCache ||= {});
  const hit = cache[id];
  if (!hit || Date.now() - hit.at > 60000) {
    body.innerHTML = `<div class="loading"><span class="spinner"></span> Loading game log…</div>`;
    try {
      cache[id] = { at: Date.now(), data: await fetchPlayer(id) };
    } catch (e) {
      body.innerHTML = `<div class="banner">${esc(e.message)}</div>`;
      return;
    }
    if (m.hidden) return;
  }
  state.pmTab = focusSp ? "log" : "overview";
  renderPlayerModal(cache[id].data, focusSp);
}

// Jump from a player popup to their game on Live games: open the game with the box score on their team.
function goLiveGame(id, side) {
  document.querySelector("#pl-modal .modal-close")?.click();
  (state.liveOpen ||= {})[id] = true;
  state.liveSel = id;
  (state.boxUi ||= {})[id] = { open: true, view: "players", side: side || "away" };
  switchTab("live");
  const scrollTo = () => document.querySelector(`.card.game[data-game="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  setTimeout(scrollTo, 350);
  setTimeout(scrollTo, 1600); // again once the live data has loaded
}

function renderPlayerModal(d, focusSp) {
  const body = $("pl-modal-body");
  const p = d.player, pos = POS[p.posId] || "";
  // Fantasy owner and lineup status from this week's rosters, when loaded.
  const cur = state.weekCache?.[state.base.current]?.sides?.flatMap((s) => s.players).find((x) => String(x.id) === String(p.id));
  const owner = p.teamId ? `${teamName(p.teamId, 20)}${cur ? ` <span class="role ${cur.starter ? "start" : "bench"}">${cur.starter ? `Starting · ${esc(cur.slot)}` : cur.slotId === IR ? "IR" : "Bench"}</span>` : ""}` : `<span class="muted">Free agent</span>`;
  const weeks = d.weeks;
  const lastWeek = Math.max(state.base.current, ...weeks.map((w) => w.sp), focusSp || 0);
  const bySp = Object.fromEntries(weeks.map((w) => [w.sp, w]));
  const games = weeks.length, total = d.seasonPts || sum(weeks, (w) => w.pts);
  const best = weeks.reduce((a, w) => (!a || w.pts > a.pts ? w : a), null);
  const val = state.values?.byId?.get(Number(p.id));
  // Snap share and targets from nflverse, when loaded and matched to this player.
  const U = state.usage?.byId ? state.usage : (ensureUsage(), null);
  const ul = U?.byId.get(Number(p.id)), uAvg = ul ? usageOf(p.id, lastWeek) : null;
  // One week's usage: share of the team's snaps, targets and rushing attempts.
  const usage = (sp) => {
    const e = ul?.w[sp], tm = e ? U.teams[e[3]]?.[sp] : null;
    return e ? { snap: e[1], snaps: e[0], tgt: tm?.[1] ? (e[2] / tm[1]) * 100 : null, tgts: e[2], rush: tm?.[2] ? ((e[4] || 0) / tm[2]) * 100 : null, car: e[4] || 0 } : null;
  };
  const uCell = (v, n, unit) => (v == null ? `<td class="num muted">–</td>` : `<td class="num">${Math.round(v)}%<div class="pt-sub">${n} ${unit}</div></td>`);
  const ncols = 3 + (ul ? 3 : 0);
  const logRows = (sps) => sps.map((sp) => {
    const w = bySp[sp];
    if (!w) {
      const why = p.bye === sp ? "BYE" : sp === state.base.current ? "Hasn't played yet" : "Did not play";
      return `<tr class="muted gl-empty"><td class="gl-wk">${sp}</td><td colspan="${ncols - 1}">${why}</td></tr>`;
    }
    const opp = w.opp ? `${w.home ? "vs" : "@"} ${esc(PRO[w.opp] || "")}` : "–";
    const u = ul ? usage(sp) : null, open = focusSp === sp;
    const shares = !ul ? "" : !u ? `<td class="num muted">–</td>`.repeat(3)
      : `${uCell(u.snap, u.snaps, "snp")}${ul.pos === "QB" ? `<td class="num muted">–</td>` : uCell(u.tgt, u.tgts, "tgt")}${uCell(u.rush, u.car, "att")}`;
    return `<tr class="gl-row ${open ? "open" : ""}" data-sp="${sp}"><td class="gl-wk">${sp}</td>
      <td class="gl-game"><strong>${opp}</strong><div class="gl-line">${esc(compactLine(p.posId, w.stats) || gameLine(p.posId, w.stats))}</div></td>
      ${shares}<td class="num gl-ptd"><button type="button" class="gl-pts" aria-expanded="${open}" aria-controls="gl-bd-${sp}">${f1(w.pts)}<span class="caret">▾</span></button></td></tr>
      <tr class="gl-bd" id="gl-bd-${sp}" ${open ? "" : "hidden"}><td colspan="${ncols}">${breakdownHtml(w, p.posId)}</td></tr>`;
  }).join("");
  const logTable = (sps) => `<table class="data gamelog gl-compact ${ul ? "with-u" : ""}"><thead><tr><th class="gl-wk">Wk</th><th>Game</th>${ul ? `<th class="num" title="Share of the team's offensive snaps">Snap</th><th class="num" title="Share of the team's targets">Tgt</th><th class="num" title="Share of the team's rushing attempts">Rush</th>` : ""}<th class="num">Pts</th></tr></thead><tbody>${logRows(sps)}</tbody></table>`;

  state.pmFor = String(p.id);
  const rerender = () => { if (!$("pl-modal").hidden && state.pmFor === String(p.id)) renderPlayerModal(d, focusSp); };

  // This week's NFL game (from the live scoreboard, any state) and this player's box-score lines in it.
  if (!state.live && !state.liveForPopup) { state.liveForPopup = true; Promise.resolve().then(refreshLive).catch(() => {}).finally(() => { state.liveForPopup = false; rerender(); }); }
  const lg = p.proId ? state.live?.games?.find((x) => x.home.proId === p.proId || x.away.proId === p.proId) : null;
  const started = !!lg && (lg.state === "in" || lg.state === "post");
  let box = null, myCats = [], side = lg ? (lg.home.proId === p.proId ? "home" : "away") : "away";
  if (started) {
    ensureBox({ id: lg.id, state: lg.state }, rerender);
    box = state.boxes?.[lg.id];
    if (box && box !== "loading" && !box.error) {
      myCats = ["away", "home"].flatMap((sd) => (box.players[sd] || []).map((c) => ({ ...c, sd, row: c.rows.find((r) => String(r.id) === String(p.id)) }))).filter((c) => c.row);
      if (myCats[0]) side = myCats[0].sd;
    }
  }
  const boxReady = box && box !== "loading" && !box.error;
  const catTable = (c, rowsHtml) => `<div class="pg-cat"><div class="pg-title">${esc(c.title)}</div><table class="pg-table"><thead><tr><th></th>${c.labels.map((l) => `<th>${esc(l)}</th>`).join("")}</tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
  const myLines = !started ? "" : !boxReady ? (box?.error ? `<p class="muted small">${esc(box.error)}</p>` : `<div class="loading small"><span class="spinner"></span> Loading game stats…</div>`)
    : myCats.length ? `<div class="pg-cats">${myCats.map((c) => catTable(c, `<tr class="me"><td></td>${c.row.stats.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`)).join("")}</div>`
    : `<p class="muted small">No stats in this game yet.</p>`;
  const kick = (x) => new Date(x.date).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  const tabs = [["overview", "Overview"], ["game", lg?.state === "in" ? `<span class="pm-live-dot"></span>Live` : "Game"], ["log", "Game log"], ["depth", "Depth chart"], ["news", "News"]];
  if (!tabs.some(([k]) => k === state.pmTab)) state.pmTab = "overview";
  const tab = state.pmTab;

  let pane = "";
  if (tab === "overview") {
    // Stat sheet: label over value, four to a row; season totals; this week; the last three games.
    const totals = {};
    for (const w of weeks) for (const [k, v] of Object.entries(w.stats || {})) if (typeof v === "number") totals[k] = (totals[k] || 0) + v;
    const seasonLine = weeks.length ? gameLine(p.posId, totals) : "";
    const cells = [
      ["Pts", f1(total)], ["GP", games], ["Avg", games ? f1(total / games) : "–"], ["Best", best ? `${f1(best.pts)}<small>wk ${best.sp}</small>` : "–"],
      d.seasonProj ? ["Proj", f1(d.seasonProj)] : null,
      uAvg?.avg ? ["Snap %", pctTxt(uAvg.avg.pct)] : null,
      uAvg?.avg && uAvg.pos !== "QB" ? ["Tgt %", pctTxt(uAvg.avg.share)] : null,
      val ? ["Value", fmtVal(val.value)] : null,
    ].filter(Boolean);
    const recent = weeks.map((w) => w.sp).sort((x, y) => y - x).slice(0, 3);
    const score = (sd) => (lg.state === "pre" ? "" : ` ${sd.score ?? ""}`);
    pane = `<div class="pm-sheet">${cells.map(([l, v]) => `<div><span>${l}</span><strong>${v}</strong></div>`).join("")}</div>
      ${seasonLine ? `<p class="pm-season small"><span class="muted">Season:</span> ${esc(seasonLine)}</p>` : ""}
      ${lg ? `<h3 class="pm-sub">This week <span class="pg-line">${esc(lg.away.abbr)}${score(lg.away)} @ ${esc(lg.home.abbr)}${score(lg.home)} · ${lg.state === "pre" ? esc(kick(lg)) : lg.state === "in" ? esc(lg.detail) : "Final"}</span></h3>${myLines}
        <button type="button" class="pg-go" data-pmtab="game">${lg.state === "in" ? "Watch the live game" : "See the game"} ›</button>` : ""}
      ${recent.length ? `<h3 class="pm-sub">Recent games</h3>${logTable(recent)}` : ""}`;
  } else if (tab === "game") {
    // The game itself: score, field, last play, this player's lines, then his team's full box score.
    if (!lg) pane = !state.live ? `<div class="loading small"><span class="spinner"></span> Loading this week's game…</div>`
      : `<p class="muted">${p.bye && p.bye === state.base.current ? `On bye in week ${p.bye}.` : "No game for his team this week."}</p>`;
    else {
      const head = `<div class="pm-game-head">
          <span class="pgh-team"><img src="${esc(lg.away.logo)}" alt="" width="26" height="26">${esc(lg.away.abbr)}</span><strong>${lg.state === "pre" ? "" : lg.away.score ?? ""}</strong>
          <span class="pgh-mid">${lg.state === "in" ? `<span class="badge live">LIVE</span> ${esc(lg.detail)}` : lg.state === "post" ? "Final" : esc(kick(lg))}</span>
          <strong>${lg.state === "pre" ? "" : lg.home.score ?? ""}</strong><span class="pgh-team">@${esc(lg.home.abbr)}<img src="${esc(lg.home.logo)}" alt="" width="26" height="26"></span></div>`;
      const sp2 = lg.state === "in" ? shownPlay(lg) : null;
      const ddm = /^(.*?)\s+at\s+(.+)$/.exec(lg.downDistance || "");
      const dd = lg.state === "in" && lg.downDistance ? `<p class="small pm-dd"><strong>${esc(ddm ? ddm[1] : lg.downDistance)}</strong>${ddm ? ` at ${esc(ddm[2])}` : ""}</p>` : "";
      const team = boxReady ? (box.players[side] || []) : [];
      const pre = lg.state === "pre" ? `<p class="muted small">${lg.broadcast ? `${esc(lg.broadcast)} · ` : ""}Stats and the field show up here at kickoff.</p>` : "";
      pane = `${head}${lg.state === "in" ? fieldGraphic(lg) : ""}${dd}${sp2?.text ? `<p class="small muted pm-last">${sp2.earlier ? "Last snap" : "Last play"}: ${esc(sp2.text)}</p>` : ""}${pre}
        ${started ? `<h3 class="pm-sub">${esc(p.name)}</h3>${myLines}` : ""}
        ${team.length ? `<h3 class="pm-sub">${esc(box.teams?.[side]?.name || "Team")} box score</h3><div class="pg-cats">${team.map((c) => catTable(c, c.rows.map((r) => `<tr class="${String(r.id) === String(p.id) ? "me" : ""}"><td class="pg-name">${esc(r.short || shortName(r.name))}</td>${r.stats.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join(""))).join("")}</div>` : ""}
        <button type="button" class="pg-go" data-golive="${esc(lg.id)}" data-side="${side}">Open on the Live games tab ›</button>`;
    }
  } else if (tab === "log") {
    const all = Array.from({ length: lastWeek }, (_, i) => lastWeek - i);
    pane = `${focusSp && !bySp[focusSp] ? `<p class="muted small">No stats yet for week ${focusSp}.</p>` : ""}
      <p class="small muted pm-hint">Tap points to see how they were scored.${ul ? " Shares are of the team's snaps, targets and carries." : ""}</p>
      ${logTable(all)}${ul ? nvCredit() : ""}`;
  } else if (tab === "depth") {
    const dc = p.proId ? ensureDepth(p.proId, rerender) : null;
    pane = !p.proId ? `<p class="muted">Not on an NFL team.</p>`
      : !dc ? `<div class="loading small"><span class="spinner"></span> Loading the depth chart…</div>`
      : dc.error ? `<p class="muted small">${esc(dc.error)}</p>` : depthTable(dc.depth, p);
  } else {
    const nd = ensureNews([p.id], rerender);
    const items = nd?.players?.[p.id] || [];
    pane = !nd ? `<div class="loading small"><span class="spinner"></span> Loading news…</div>`
      : items.length ? `<div class="news">${items.map((n) => newsItem(n)).join("")}</div>${newsCredit()}`
      : `<p class="muted small">No player updates in the last two weeks.</p>`;
  }

  body.innerHTML = `<div class="pm-head">
      ${headshot({ id: p.id, name: p.name, posId: p.posId, proId: p.proId }, 64)}
      <div><h2 id="pl-modal-title">${esc(p.name)}${injBadge({ injury: p.injury })}</h2>
        <div class="muted small">${pos}${p.proId ? ` · ${esc(PRO[p.proId] || "")}` : ""}${p.bye ? ` · Bye wk ${p.bye}` : ""}</div>
        <div class="pm-owner">${owner}</div></div>
    </div>
    <div class="pm-tabs" role="tablist">${tabs.map(([k, label]) => `<button type="button" role="tab" data-pmtab="${k}" aria-selected="${k === tab}" class="${k === tab ? "active" : ""}">${label}</button>`).join("")}</div>
    <div class="pm-pane">${pane}</div>`;
  body.querySelectorAll("[data-pmtab]").forEach((b) => b.addEventListener("click", () => { state.pmTab = b.dataset.pmtab; renderPlayerModal(d, focusSp); body.closest(".modal-card").scrollTop = 0; }));
  body.querySelector("[data-golive]")?.addEventListener("click", (e) => goLiveGame(e.currentTarget.dataset.golive, e.currentTarget.dataset.side));
  body.querySelectorAll(".gl-pts").forEach((b) => b.addEventListener("click", () => {
    const row = b.closest("tr"), bd = row.nextElementSibling;
    bd.hidden = !bd.hidden;
    row.classList.toggle("open", !bd.hidden);
    b.setAttribute("aria-expanded", String(!bd.hidden));
  }));
  if (tab === "log" && focusSp && bySp[focusSp]) body.querySelector(`.pm-pane #gl-bd-${focusSp}`)?.scrollIntoView({ block: "center" });
}

// ---------- Depth charts (player popup) ----------
function ensureDepth(proId, onReady) {
  const c = (state.depthCache ||= {}), hit = c[proId];
  if (hit && hit !== "loading" && Date.now() - hit.at < 30 * 60e3) return hit;
  if (hit !== "loading") {
    c[proId] = "loading";
    const load = state.demo ? Promise.resolve(window.DemoLeague.depthChart(proId))
      : fetch(`/api/injuries?team=${proId}`).then(async (r) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b.message || "Couldn't load the depth chart."); return b; });
    load.then((x) => { c[proId] = { ...x, at: Date.now() }; }).catch((e) => { c[proId] = { error: e.message, at: Date.now() }; }).finally(() => onReady?.());
  }
  return null;
}
// The team's offense, one row per spot: starter, then backups. The open player is highlighted.
function depthTable(dep, p) {
  const spots = [["QB", "QB"], ["RB", "RB"], ["WR1", "WR"], ["WR2", "WR"], ["WR3", "WR"], ["TE", "TE"], ["K", "K"]];
  const cell = (x) => {
    if (!x) return `<td></td>`;
    const code = INJ_CODE[x[2]] || (x[2] ? x[2].toUpperCase() : "");
    return `<td class="${String(x[0]) === String(p.id) ? "me" : ""} ${depthOut(x) ? "dc-out" : ""}">${plink(x[0], shortName(x[1]))}${code ? injBadge({ injury: code }) : ""}</td>`;
  };
  const rows = spots.filter(([k]) => dep?.[k]?.length).map(([k, label]) => `<tr><th>${label}</th>${[0, 1, 2].map((i) => cell(dep[k][i])).join("")}</tr>`).join("");
  return rows ? `<table class="dc-table"><thead><tr><th></th><th>Starter</th><th>2nd</th><th>3rd</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="fc-credit small muted">Depth chart from ESPN.</p>` : `<p class="muted small">No depth chart from ESPN for this team.</p>`;
}

// ---------- Tooltip ----------
// Mouse: the tip follows the pointer. Touch: tapping an item shows its tip just below it (or above
// when there's no room), always kept fully on screen; tapping elsewhere or scrolling closes it.
function initTooltip() {
  const tip = $("tooltip"), M = 8;
  let lastTouch = 0, anchor = null;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
  const show = (t) => { tip.innerHTML = t.getAttribute("data-tip"); tip.hidden = false; return tip.getBoundingClientRect(); };
  const hide = () => { tip.hidden = true; anchor = null; };
  document.addEventListener("mousemove", (e) => {
    if (Date.now() - lastTouch < 1000) return; // phones fire a fake mousemove after each tap
    const t = e.target.closest?.("[data-tip]");
    if (!t) { hide(); return; }
    const r = show(t);
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + r.width > innerWidth - M) x = e.clientX - r.width - 14;
    if (y + r.height > innerHeight - M) y = e.clientY - r.height - 14;
    tip.style.left = `${clamp(x, M, innerWidth - r.width - M)}px`;
    tip.style.top = `${clamp(y, M, innerHeight - r.height - M)}px`;
  });
  document.addEventListener("touchstart", () => { lastTouch = Date.now(); }, { passive: true, capture: true });
  document.addEventListener("click", (e) => {
    if (Date.now() - lastTouch > 1000) return;
    const t = e.target.closest?.("[data-tip]");
    if (!t || t === anchor) { hide(); return; }
    anchor = t;
    const r = show(t), a = t.getBoundingClientRect();
    const x = clamp(a.left + a.width / 2 - r.width / 2, M, innerWidth - r.width - M);
    let y = a.bottom + 8;
    if (y + r.height > innerHeight - M) y = Math.max(M, a.top - r.height - 8);
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  });
  addEventListener("scroll", () => { if (anchor) hide(); }, { passive: true, capture: true });
}

// ---------- App flow ----------
function setLoading(on) { $("loading").hidden = !on; }
function banner(msg) { $("banner").hidden = !msg; $("banner").innerHTML = msg || ""; }

// Redraw a tab without the visible "blink" of a rebuild: logos that are already loaded are moved
// into the new markup instead of being downloaded and decoded again, and sideways-scrolled tables,
// the page scroll position and a focused search box are put back where they were.
function keepState(el, draw) {
  if (!el) return draw();
  const imgs = new Map();
  el.querySelectorAll("img").forEach((i) => { if (i.complete && i.naturalWidth) { const k = i.getAttribute("src"); (imgs.get(k) || imgs.set(k, []).get(k)).push(i); } });
  const scrolls = [...el.querySelectorAll(".table-wrap, .mu-pane")].map((n) => [n.scrollLeft, n.scrollTop]);
  const a = document.activeElement, focusId = el.contains(a) && a.id ? a.id : null;
  const sel = focusId && typeof a.selectionStart === "number" ? [a.selectionStart, a.selectionEnd] : null;
  const y = window.scrollY;
  draw();
  el.querySelectorAll("img").forEach((i) => {
    const old = imgs.get(i.getAttribute("src"))?.shift();
    if (!old || old === i) return;
    for (const { name } of [...old.attributes]) if (!i.hasAttribute(name)) old.removeAttribute(name);
    for (const { name, value } of [...i.attributes]) if (old.getAttribute(name) !== value) old.setAttribute(name, value);
    i.replaceWith(old);
  });
  el.querySelectorAll(".table-wrap, .mu-pane").forEach((n, i) => { if (scrolls[i]) [n.scrollLeft, n.scrollTop] = scrolls[i]; });
  if (focusId && $(focusId) && document.activeElement !== $(focusId)) {
    $(focusId).focus({ preventScroll: true });
    if (sel) try { $(focusId).setSelectionRange(...sel); } catch {}
  }
  if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y);
}

function render() {
  if (!state.week) return;
  if (!state.live && !state.liveBoot && state.tab !== "live") { state.liveBoot = true; refreshLive().finally(() => { state.liveBoot = false; }); }
  updateEspnLink();
  showView(state.tab);
  keepState($(`view-${state.tab}`), () => renderTab());
}
function renderTab() {
  ({ roster: renderRoster, matchups: renderMatchups, live: renderLive, players: renderPlayers, usage: renderUsage, injuries: renderInjuries, managers: renderManagers, season: renderSeason, history: renderHistory, trade: renderTradeAnalyzer, transactions: renderTransactions })[state.tab]();
}

// Fetch (or reuse) one week's data without touching the screen.
async function getWeek(week, force) {
  const base = state.base;
  if (!force && state.weekCache[week]?.nfl) return state.weekCache[week];
  const sp = base.scoringPeriodFor(week);
  const [raw, nfl] = await Promise.all([api(["mBoxscore", "mMatchupScore", "mRoster"], sp), loadNfl(sp)]);
  if (state.base !== base) throw new ApiError("stale", "League changed while loading.");
  const w = buildWeek(raw, week, nfl);
  w.nfl = nfl || {};
  state.weekCache[week] = w;
  return w;
}

async function loadWeek(week, force) {
  state.week = null;
  showView(null);
  setLoading(true);
  try {
    state.week = await getWeek(week, force);
    $("week-select").value = week;
    $("prev-week").disabled = week <= 1;
    $("next-week").disabled = week >= state.base.weeks;
    banner(state.demo ? `You're viewing a <strong>demo league</strong> with made-up data. <a href="${location.pathname}">Go to the real leagues</a>.` : "");
  } catch (e) {
    if (e.code === "stale") return;
    banner(esc(e.message));
  } finally {
    setLoading(false);
  }
  render();
}

// Re-fetch the shown week behind the scenes and redraw in place (no spinner, no blank page).
async function refreshWeekQuietly() {
  const wk = state.week?.week, base = state.base;
  try {
    const w = await getWeek(wk, true);
    if (state.base !== base || state.week?.week !== wk) return;
    state.week = w;
    render();
  } catch { /* keep showing what we have; the next refresh will try again */ }
}

// Switch to another league: forget everything loaded for the previous one.
async function switchLeague(leagueId, season) {
  state.leagueId = leagueId;
  state.season = season;
  state.demo = false;
  store.set("ffb.league", leagueId || null);
  store.set("ffb.season", season || null);
  clearTimeout(state.liveTimer);
  Object.assign(state, {
    base: null, week: null, weekCache: {}, awardTally: null, activity: null, history: null,
    live: null, livePrev: {}, liveBumps: {}, openMatchup: null,
    values: null, usage: null, weather: null, ta: null, rostersLoading: false, playerCache: null, fa: null, rosterTeam: null,
  });
  state.players.team = state.txFilter.team = state.liveFilter.team = "ALL";
  state.historySel = "all";
  await loadLeague();
  setUrl();
}

function renderLeagueSelect() {
  const sel = $("league-select");
  const current = state.leagueId || LEAGUES[0].id;
  const known = LEAGUES.some((l) => l.id === current);
  sel.innerHTML = LEAGUES.map((l) => `<option value="${l.id}" ${l.id === current ? "selected" : ""}>${esc(l.label)}</option>`).join("")
    + (known ? "" : `<option value="${esc(current)}" selected>League ${esc(current)}</option>`);
  sel.hidden = state.demo;
  $("league-name").hidden = !state.demo; // the dropdown doubles as the title
}

let pendingWeek = parseInt(params.get("week")) || null;

async function loadLeague(week) {
  renderLeagueSelect();
  $("setup").hidden = true;
  setLoading(true);
  try {
    state.base = buildBase(await api(["mTeam", "mSettings", "mStatus", "mMatchupScore"]));
  } catch (e) {
    setLoading(false);
    showSetup(e.code === "no_league" ? "" : e.message);
    return;
  }
  setLoading(false);
  const b = state.base;
  renderHeader();
  // A ?week= link applies to the first load only.
  const wk = Math.min(Math.max(week || pendingWeek || b.current, 1), b.weeks);
  pendingWeek = null;
  await loadWeek(wk);
}

function renderHeader() {
  const b = state.base, wk = state.week?.week;
  $("league-name").textContent = b.name;
  const label = LEAGUES.find((l) => l.id === (state.leagueId || LEAGUES[0].id))?.label;
  $("league-meta").textContent = [!state.demo && label && b.name !== label ? b.name : "", `${b.season || ""} season`, `${Object.keys(b.teams).length} teams`].filter(Boolean).join(" · ");
  document.title = `${b.name} · Weekly Breakdown`;
  // Phones get short labels ("Wk 6 · now") so the week picker fits beside the league name.
  const short = matchMedia("(max-width: 640px)").matches;
  $("week-select").innerHTML = Array.from({ length: b.weeks }, (_, i) => i + 1)
    .map((w) => `<option value="${w}">${short
      ? `Wk ${w}${w > b.regWeeks ? " (PO)" : ""}${w === b.current ? " · now" : ""}`
      : `Week ${w}${w > b.regWeeks ? " (playoffs)" : ""}${w === b.current ? " · current" : ""}`}</option>`).join("");
  if (wk) $("week-select").value = wk;
  $("week-nav").hidden = false;
  $("tabs").hidden = false;
}

// Pull-to-refresh: re-fetch the league and the shown week behind the scenes, then redraw in place
// (no spinner over the page, no blank screen). Everything else reloads as its tab needs it.
async function refreshAll() {
  const wk = state.week?.week;
  if (!wk || !state.base) return loadLeague(wk);
  try {
    const base = buildBase(await api(["mTeam", "mSettings", "mStatus", "mMatchupScore"]));
    Object.assign(state, {
      base, weekCache: {}, awardTally: null, activity: null, history: null, values: null, usage: null,
      weather: null, fa: null, gameStatus: null, playerCache: null,
    });
    state.week = await getWeek(wk, true);
    renderHeader();
    if (!state.demo) banner(""); // clear any earlier "couldn't refresh" message
    render();
    if (state.tab === "live") await refreshLive();
  } catch {
    if (!state.demo) banner("Couldn't refresh. Check your connection and pull down to try again.");
  }
}

// Refresh button (computers): spins while refreshing. Hidden on touch screens, which pull to refresh.
function initRefreshButton() {
  const b = $("refresh");
  if (!b) return;
  b.addEventListener("click", async () => {
    if (b.classList.contains("busy")) return;
    b.classList.add("busy");
    try { await refreshAll(); } finally { b.classList.remove("busy"); }
  });
}

function initPullToRefresh() {
  if (!("ontouchstart" in window)) return;
  const ind = document.createElement("div");
  ind.className = "ptr";
  ind.setAttribute("aria-hidden", "true");
  ind.innerHTML = `<span class="ptr-icon">↻</span>`;
  document.body.appendChild(ind);
  const TRIGGER = 60, MAX = 90;
  let startY = null, startX = 0, dy = 0, pulling = false, busy = false;
  const place = (y, turn) => { ind.style.transform = `translate(-50%, ${y}px)`; ind.firstChild.style.transform = `rotate(${turn}deg)`; };
  const reset = () => { ind.classList.remove("show", "ready", "busy"); place(0, 0); pulling = false; startY = null; };
  document.addEventListener("touchstart", (e) => {
    startY = null;
    if (busy || window.scrollY > 0 || e.touches.length > 1 || document.body.classList.contains("modal-open")) return;
    startY = e.touches[0].clientY;
    startX = e.touches[0].clientX;
  }, { passive: true });
  document.addEventListener("touchmove", (e) => {
    if (startY == null) return;
    const y = e.touches[0].clientY - startY, x = e.touches[0].clientX - startX;
    if (!pulling) {
      // Only a mostly-downward drag from the very top counts (sideways table swipes don't).
      if (y < -4 || Math.abs(x) > 12) { startY = null; return; }
      if (y < 10 || Math.abs(x) > y || window.scrollY > 0) return;
      pulling = true;
      ind.classList.add("show");
    }
    dy = Math.min(MAX, (y - 10) * 0.5);
    place(dy, dy * 4);
    ind.classList.toggle("ready", dy >= TRIGGER);
  }, { passive: true });
  document.addEventListener("touchend", async () => {
    if (!pulling) { startY = null; return; }
    if (dy < TRIGGER) return reset();
    busy = true;
    ind.classList.add("busy");
    place(56, 0);
    try { await refreshAll(); } finally { busy = false; reset(); }
  });
  document.addEventListener("touchcancel", () => { if (!busy) reset(); });
}

// Shown when a league fails to load. Only the leagues in LEAGUES can be viewed, so there's no form here.
function showSetup(error) {
  $("tabs").hidden = true;
  showView(null);
  $("setup").hidden = false;
  if (error) $("setup-msg").textContent = error;
  banner("");
}

function setUrl() {
  const q = new URLSearchParams();
  if (state.demo) q.set("demo", "");
  else if (state.leagueId) q.set("league", state.leagueId);
  if (state.season && !state.demo) q.set("season", state.season);
  if (state.week) q.set("week", state.week.week);
  history.replaceState(null, "", `${location.pathname}${q.toString() ? "?" + q.toString().replace("demo=", "demo") : ""}`);
}

// Show a tab. `from` ("left"/"right") slides the new tab in after a swipe.
function switchTab(tab, from) {
  state.tab = tab;
  store.set("ffb.tab", tab);
  render();
  document.querySelector(`#tabs button[data-tab="${tab}"]`)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  if (from) {
    const v = $(`view-${tab}`);
    v.classList.remove("slide-left", "slide-right");
    void v.offsetWidth; // restart the animation
    v.classList.add(from === "left" ? "slide-left" : "slide-right");
    window.scrollTo(0, 0);
  }
}

// Phones: swipe left / right to move to the next / previous tab. Swipes that start on something that
// scrolls sideways (wide tables, the tab bar), on a form control, or while a popup is open are left alone.
function initSwipeTabs() {
  if (!("ontouchstart" in window)) return;
  let sx = 0, sy = 0, t0 = 0, armed = false;
  const scrollsSideways = (el) => {
    for (; el && el !== document.body; el = el.parentElement) {
      if (el.scrollWidth > el.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true;
    }
    return false;
  };
  let onHeader = false;
  document.addEventListener("touchstart", (e) => {
    armed = false;
    if (e.touches.length !== 1 || !state.week || document.body.classList.contains("modal-open")) return;
    // Swipes on the header (above the tabs) change the week; anywhere below switches tabs.
    if (e.target.closest(".fx-alert")) return; // scoring banners handle their own swipes
    onHeader = !!e.target.closest(".topbar-inner");
    if (e.target.closest("input, textarea") || (!onHeader && (e.target.closest("select, .topbar") || scrollsSideways(e.target)))) return;
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
    t0 = Date.now();
    armed = true;
  }, { passive: true });
  // Tab swipes: once the drag is clearly sideways, the page follows the finger.
  let dragging = false, dragX = 0;
  const view = () => $(`view-${state.tab}`);
  const neighbor = (dir) => { const tabs = [...document.querySelectorAll("#tabs button[data-tab]")]; return tabs[tabs.findIndex((b) => b.dataset.tab === state.tab) + dir]; };
  document.addEventListener("touchmove", (e) => {
    if (!armed || onHeader) return;
    const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
    if (!dragging) {
      if (Math.abs(dx) < 14 || Math.abs(dx) < Math.abs(dy) * 1.6) { if (Math.abs(dy) > 14) armed = false; return; }
      dragging = true;
    }
    dragX = dx * (neighbor(dx < 0 ? 1 : -1) ? 1 : 0.25); // resist at the first/last tab
    const v = view();
    v.style.transition = "none";
    v.style.transform = `translateX(${dragX}px)`;
  }, { passive: true });
  document.addEventListener("touchend", (e) => {
    if (!armed) return;
    armed = false;
    const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (dragging) {
      dragging = false;
      const v = view(), next = neighbor(dx < 0 ? 1 : -1);
      const go = next && (Math.abs(dx) > innerWidth * 0.28 || (Math.abs(dx) > 50 && Date.now() - t0 < 300));
      v.style.transition = "transform .18s ease-out";
      v.style.transform = go ? `translateX(${dx < 0 ? -innerWidth : innerWidth}px)` : "translateX(0)";
      setTimeout(() => {
        v.style.transition = v.style.transform = "";
        if (go) switchTab(next.dataset.tab, dx < 0 ? "left" : "right");
      }, 180);
      return;
    }
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2 || Date.now() - t0 > 700) return;
    if (onHeader) {
      const wk = state.week.week + (dx < 0 ? 1 : -1);
      if (wk < 1 || wk > state.base.weeks) return;
      state.openMatchup = null;
      loadWeek(wk).then(() => {
        setUrl();
        const v = $(`view-${state.tab}`);
        v.classList.remove("slide-left", "slide-right");
        void v.offsetWidth;
        v.classList.add(dx < 0 ? "slide-left" : "slide-right");
      });
      return;
    }
    const next = neighbor(dx < 0 ? 1 : -1);
    if (next) switchTab(next.dataset.tab, dx < 0 ? "left" : "right");
  }, { passive: true });
  document.addEventListener("touchcancel", () => { if (dragging) { dragging = false; const v = view(); v.style.transition = "transform .18s"; v.style.transform = "translateX(0)"; } armed = false; });
}

function bindUi() {
  $("tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-tab]");
    if (b) switchTab(b.dataset.tab);
  });
  const go = async (w) => { state.openMatchup = null; await loadWeek(w); setUrl(); };
  $("week-select").addEventListener("change", (e) => go(+e.target.value));
  $("prev-week").addEventListener("click", () => state.week && go(state.week.week - 1));
  $("next-week").addEventListener("click", () => state.week && go(state.week.week + 1));
  $("retry").addEventListener("click", () => loadLeague());
  $("league-select").addEventListener("change", (e) => switchLeague(e.target.value, ""));
  // Keep final / live / on-field markers current while games are being played.
  setInterval(() => {
    if (document.visibilityState === "visible" && (state.tab === "matchups" || state.tab === "roster") && state.gameStatus?.anyLive) ensureGameStatus();
  }, 30000);
  // Catch up on live games when the page comes back into view.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !state.liveStale) return;
    if (state.tab === "live") keepState($("view-live"), renderLive);
    else if (state.live?.games?.some((g) => g.state === "in")) { state.liveStale = false; refreshLive(); }
  });
  // Keep live weeks fresh.
  setInterval(() => {
    if (document.visibilityState === "visible" && state.week?.status === "live" && !state.demo) refreshWeekQuietly();
  }, 120000);
}

// ---------- Picking up new versions ----------
// Home-screen web apps (especially on iPhone) resume the old page instead of reloading it,
// so they never see a new upload. When the app comes back after a while in the background,
// ask the server whether app.js changed and reload if it did.
async function siteVersion() {
  try {
    const res = await fetch(`app.js`, { method: "HEAD", cache: "no-store" });
    return res.headers.get("etag") || res.headers.get("last-modified") || null;
  } catch {
    return null;
  }
}
function watchForUpdates() {
  let version = null, hiddenAt = 0;
  siteVersion().then((v) => { version = v; });
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
    if (state.reloadPending) return freshReload();
    if (!version || Date.now() - hiddenAt < 30000) return;
    const now = await siteVersion();
    if (now && now !== version) freshReload();
  });
}
// Reload onto the newest version: the offline copy is refreshed first so the reload doesn't
// come back up on the old one.
async function freshReload() {
  const sw = navigator.serviceWorker?.controller;
  if (sw) {
    await new Promise((done) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = done;
      sw.postMessage({ type: "refresh" }, [ch.port2]);
      setTimeout(done, 5000);
    });
  }
  location.reload();
}

// ---------- Offline support ----------
// sw.js keeps a copy of the site and the last data loaded. It tells the page when it had to fall
// back to saved data (no signal) and when a newer version of the site has been published.
function initOffline() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js").catch(() => {});
  const opened = Date.now();
  navigator.serviceWorker.addEventListener("message", (e) => {
    const m = e.data || {};
    if (m.type === "offline") showOffline(m.at);
    else if (m.type === "online") showOffline(null);
    else if (m.type === "updated") {
      // Just opened: switch to the new version right away. Otherwise wait until the app is reopened.
      if (Date.now() - opened < 10000 && document.visibilityState === "visible") freshReload();
      else state.reloadPending = true;
    }
  });
  addEventListener("online", () => showOffline(null));
}
function showOffline(at) {
  let n = $("offline-note");
  if (at === null) { if (n) n.hidden = true; return; }
  if (!n) {
    n = document.createElement("div");
    n.id = "offline-note";
    n.className = "offline-note";
    n.setAttribute("role", "status");
    $("banner").before(n);
  }
  const when = at ? new Date(at).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }) : "earlier";
  n.innerHTML = `<strong>No connection</strong> · showing data saved ${esc(when)}. It updates when you're back online.`;
  n.hidden = false;
}

// ---------- ESPN sign-in check ----------
// The ESPN cookies in Netlify (ESPN_S2 / SWID) expire every so often. When ESPN clearly says they
// no longer work, show how to replace them. Can be dismissed for a few days.
async function checkEspnSignIn() {
  if (state.demo) return;
  const dismissed = Number(store.get("ffb.authDismissed") || 0);
  if (Date.now() - dismissed < 3 * 864e5) return;
  let d;
  try { d = await (await fetch("/api/auth")).json(); } catch { return; }
  if (d.status !== "expired" && d.status !== "bad_swid") return;
  const n = document.createElement("div");
  n.className = "banner auth-note";
  n.innerHTML = `<strong>The site's ESPN sign-in has ${d.status === "expired" ? "expired" : "a problem"}.</strong>
    Private leagues and past seasons may not load until it's refreshed.
    <details><summary>How to fix it (about 2 minutes)</summary><ol>
      <li>On a computer, sign in at <a href="https://fantasy.espn.com/football/" target="_blank" rel="noopener">fantasy.espn.com</a>.</li>
      <li>Open the browser's developer tools (F12) › Application › Cookies › espn.com, and copy the values of <code>espn_s2</code> and <code>SWID</code>.</li>
      <li>In Netlify: Site configuration › Environment variables. Paste them into <code>ESPN_S2</code> and <code>SWID</code>.</li>
      <li>Deploys › Trigger deploy › Deploy site, so the new values take effect.</li>
    </ol></details>
    <button type="button" class="link-btn auth-dismiss">Hide for now</button>`;
  $("banner").before(n);
  n.querySelector(".auth-dismiss").addEventListener("click", () => { store.set("ffb.authDismissed", String(Date.now())); n.remove(); });
}

initTooltip();
initPlayerModal();
initOffline();
initPullToRefresh();
initSwipeTabs();
initRefreshButton();
watchForUpdates();
bindUi();
// The demo's sample data (demo.js) is only downloaded when the demo is opened.
(state.demo ? new Promise((done) => { const sc = document.createElement("script"); sc.src = "demo.js"; sc.onload = sc.onerror = done; document.head.appendChild(sc); }) : Promise.resolve())
  .then(() => loadLeague())
  .then(checkEspnSignIn);
