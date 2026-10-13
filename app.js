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
    view: "fa", q: "", pos: "ALL", team: "ALL", role: "starters", sort: { key: "actual", dir: -1 },
    faQ: "", faPos: "ALL", faStatus: "all", faSort: { key: "own", dir: -1 },
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
    starter: slotId !== BENCH && slotId !== IR,
    played: actual != null,
    actual: actual ?? 0,
    proj,
    diff: actual != null ? actual - proj : null,
    injury: inj,
    eligible: pl.eligibleSlots || [],
    line: statLine(pl.defaultPositionId, act?.stats),
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
function sortableTable(cols, rows, sortState, onSort) {
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
  const body = sorted.map((r) => `<tr>${cols.map((c) => `<td class="${c.num ? "num " : ""}${c.cls || ""}">${c.render ? c.render(r) : esc(r[c.key])}</td>`).join("")}</tr>`).join("");
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  wrap.innerHTML = `<table class="data"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  wrap.querySelectorAll("th.sortable").forEach((th) => th.addEventListener("click", () => {
    const key = th.dataset.key;
    const c = cols.find((x) => x.key === key);
    if (sortState.key === key) sortState.dir *= -1;
    else { sortState.key = key; sortState.dir = c.num ? -1 : 1; }
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
function oppHtml(p) {
  const o = p.opp;
  if (!o) return `<span class="muted">–</span>`;
  if (o.bye) return `<span class="muted">BYE</span>`;
  const label = `${o.home ? "vs" : "@"} ${esc(o.team)}`;
  if (!o.rank) return label;
  const cls = o.rank <= 10 ? "tough" : o.rank >= 23 ? "easy" : "";
  const tip = `<b>${esc(o.team)} vs ${esc(p.pos)}s: ${ordinal(o.rank)}</b>Allows ${f1(o.avg)} fantasy pts per game to ${esc(p.pos)}s. 1st = toughest matchup, 32nd = easiest.`;
  return `<span class="opp">${label} <span class="oprk ${cls}" data-tip="${esc(tip)}">${ordinal(o.rank)}</span></span>`;
}
const posRankHtml = (p, rank) => (rank ? `${esc(p.pos)}${Math.round(rank)}` : `<span class="muted">–</span>`);

const injBadge = (p) => {
  if (!p.injury) return "";
  const [short, full, severe] = injuryInfo(p.injury);
  return ` <span class="badge ${severe ? "out" : "inj"}" title="${esc(full)}" data-tip="${esc(full)}">${esc(short)}</span>`;
};
const statusBadge = (s) => (s === "final" ? `<span class="badge final">FINAL</span>` : s === "live" ? `<span class="badge live">LIVE</span>` : `<span class="badge">UPCOMING</span>`);
const ptsCell = (p, status) => (p.played ? ptsLink(p.id, state.week.sp, f1(p.actual)) : status === "final" ? f1(p.actual) : `<span class="muted">–</span>`);

function showView(name) {
  for (const v of ["roster", "matchups", "live", "players", "trade", "transactions", "managers", "season", "history"]) $(`view-${v}`).hidden = v !== name;
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
}

// ---------- Matchups ----------
function renderMatchups() {
  const w = state.week, el = $("view-matchups");
  if (!w.matchups.length) { el.innerHTML = `<p class="muted">No matchups scheduled for week ${w.week}.</p>`; return; }
  const label = w.status === "final" ? "Final scores" : w.status === "live" ? "Live scores · win chance from ESPN" : "Projected · win chance from ESPN";
  el.innerHTML = `<div class="section-head"><h2>Week ${w.week} matchups ${statusBadge(w.status)}</h2><span class="muted small">${label}. Tap a matchup for the full breakdown.</span></div>
    <div class="grid grid-2" id="mu-grid">${w.matchups.map(matchupCard).join("")}</div>
    <div id="mu-detail"></div>`;
  el.querySelectorAll(".matchup").forEach((c) => c.addEventListener("click", () => {
    state.openMatchup = state.openMatchup === +c.dataset.id ? null : +c.dataset.id;
    renderMatchups();
    if (state.openMatchup) $("mu-detail").scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  const open = w.matchups.find((m) => m.id === state.openMatchup);
  if (open) $("mu-detail").innerHTML = matchupDetail(open);
}

function sideRow(s, color, status, isWinner) {
  const t = team(s.teamId);
  const sub = status === "final" ? `proj ${f1(s.proj)}` : status === "live" ? `proj ${f1(s.liveProj)}` : "projected";
  const big = status === "upcoming" ? f1(s.proj) : f2(s.score);
  return `<div class="mu-row ${isWinner === true ? "winner" : isWinner === false ? "loser" : ""}">
    <span class="swatch" style="background:${color}"></span>
    <div class="mu-id">${logoImg(t, 34)}<div class="mu-team"><strong>${esc(t.name)}</strong><span>${esc(t.owner)} · ${recordStr(t)}</span></div></div>
    <div class="mu-score">${big}<small>${sub}</small></div></div>`;
}

function matchupCard(m) {
  const st = state.week.status;
  const playoff = m.playoff ? `<div class="small muted" style="margin-bottom:6px">${m.tier === "WINNERS_BRACKET" ? "🏆 Playoffs" : "Consolation"}</div>` : "";
  if (!m.away) return `<button class="card matchup" data-id="${m.id}">${playoff}${sideRow(m.home, "var(--home)", st, null)}<p class="muted small">Bye week</p></button>`;
  const hw = st === "final" ? m.winner === "HOME" : null;
  const wp = m.wp;
  return `<button class="card matchup ${state.openMatchup === m.id ? "open" : ""}" data-id="${m.id}">${playoff}
    ${sideRow(m.home, "var(--home)", st, hw === null ? null : hw)}
    ${sideRow(m.away, "var(--away)", st, hw === null ? null : !hw)}
    ${st !== "final" ? `<div class="wp"><div class="wp-bar" aria-label="Win chance"><div style="width:${wp * 100}%;background:var(--home)"></div><div style="width:${(1 - wp) * 100}%;background:var(--away)"></div></div>
      <div class="wp-labels"><span>${pct(wp)} ${esc(team(m.home.teamId).abbrev)}</span><span>win chance</span><span>${esc(team(m.away.teamId).abbrev)} ${pct(1 - wp)}</span></div></div>`
    : `<div class="wp-labels"><span>Margin ${f2(Math.abs(m.home.score - m.away.score))}</span><span>${esc(team((hw ? m.home : m.away).teamId).abbrev)} wins</span></div>`}
  </button>`;
}

function matchupDetail(m) {
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
  const cellL = (p, win) => p ? `<td class="pl ${win ? "edge-win" : ""}"><span class="nm">${plink(p.id, p.name)}${injBadge(p)}</span><span class="sub">${p.pos} · ${p.nfl}${p.line ? " · " + esc(p.line) : ""}</span>${p.opp ? `<span class="opp-sub">${oppHtml(p)}</span>` : ""}</td><td class="num hide-sm muted">${f1(p.proj)}</td><td class="num edge">${ptsCell(p, st)}</td>` : `<td class="pl muted">Empty</td><td class="hide-sm"></td><td></td>`;
  const cellR = (p, win) => p ? `<td class="num edge">${ptsCell(p, st)}</td><td class="num hide-sm muted">${f1(p.proj)}</td><td class="pl right ${win ? "edge-win" : ""}"><span class="nm">${injBadge(p)} ${plink(p.id, p.name)}</span><span class="sub">${p.line ? esc(p.line) + " · " : ""}${p.pos} · ${p.nfl}</span>${p.opp ? `<span class="opp-sub">${oppHtml(p)}</span>` : ""}</td>` : `<td></td><td class="hide-sm"></td><td class="pl right muted">Empty</td>`;
  const scoreOf = (p) => (p ? (st === "upcoming" ? p.proj : p.actual) : -Infinity);
  const row = ([h, slot, a]) => {
    const hs = scoreOf(h), as = scoreOf(a);
    return `<tr>${cellL(h, hs > as)}<td class="slot">${slot}</td>${cellR(a, as > hs)}</tr>`;
  };
  const bn = Math.max(home.bench.length, away.bench.length);
  const benchRows = Array.from({ length: bn }, (_, i) => [home.bench[i], home.bench[i]?.slot || away.bench[i]?.slot, away.bench[i]]);
  const benchRow = ([h, slot, a]) => `<tr class="muted">${h ? cellL(h) : `<td></td><td class="hide-sm"></td><td></td>`}<td class="slot">${slot || ""}</td>${a ? cellR(a) : `<td></td><td class="hide-sm"></td><td></td>`}</tr>`;

  return `<div class="card detail">
    <div class="detail-head"><h3 class="vs-head"><span style="color:var(--home)">■</span>${teamName(home.teamId, 26)}<span class="muted">vs</span><span style="color:var(--away)">■</span>${teamName(away.teamId, 26)}</h3>${statusBadge(st)}</div>
    <div style="overflow-x:auto"><table class="h2h">
      <thead><tr><th>${esc(H.abbrev || "Home")}</th><th class="num hide-sm">Proj</th><th class="num">Pts</th><th class="slot">Slot</th><th class="num">Pts</th><th class="num hide-sm">Proj</th><th class="right">${esc(A.abbrev || "Away")}</th></tr></thead>
      <tbody>${rows.map(row).join("")}
        <tr class="total"><td>Total</td><td class="num hide-sm">${f1(home.proj)}</td><td class="num">${st === "upcoming" ? "–" : f2(home.score)}</td><td class="slot"></td><td class="num">${st === "upcoming" ? "–" : f2(away.score)}</td><td class="num hide-sm">${f1(away.proj)}</td><td class="right">Total</td></tr>
        ${bn ? `<tr class="bench-head"><td colspan="7">Bench</td></tr>${benchRows.map(benchRow).join("")}` : ""}
      </tbody></table></div>
    <h3 style="margin-top:16px">Key takeaways</h3>
    <ul class="insights">${matchupInsights(m).map((s) => `<li>${s}</li>`).join("")}</ul>
  </div>`;
}

function matchupInsights(m) {
  const st = state.week.status, out = [];
  const sides = [m.home, m.away];
  const nm = (s) => `<strong>${esc(team(s.teamId).name)}</strong>`;
  if (st === "upcoming") {
    const fav = m.wp >= 0.5 ? m.home : m.away;
    out.push(`${nm(fav)} is favored, projected to win by ${f1(Math.abs(m.home.proj - m.away.proj))} (${pct(Math.max(m.wp, 1 - m.wp))} win chance).`);
    for (const s of sides) {
      const top = [...s.starters].sort((a, b) => b.proj - a.proj)[0];
      if (top) out.push(`${nm(s)}'s top projected starter: ${esc(top.name)} (${f1(top.proj)}).`);
      const hurt = s.starters.filter((p) => p.injury);
      if (hurt.length) out.push(`⚠️ ${nm(s)} is starting ${hurt.length} injury-listed player${hurt.length > 1 ? "s" : ""}: ${hurt.map((p) => `${esc(p.name)} (${esc(injuryInfo(p.injury)[1].toLowerCase())})`).join(", ")}.`);
    }
    return out;
  }
  for (const s of sides) {
    if (s.mvp) out.push(`${nm(s)} MVP: ${esc(s.mvp.name)} with ${f1(s.mvp.actual)} pts (${signed(s.mvp.diff)} vs projection).`);
    if (s.bust && s.bust.diff < -3) out.push(`${nm(s)} biggest letdown: ${esc(s.bust.name)}, ${f1(s.bust.actual)} pts (${signed(s.bust.diff)} vs projection).`);
    if (s.benchLeft > 0.5) out.push(`${nm(s)} left ${f1(s.benchLeft)} pts on the bench${s.bestBench ? ` (best bench player: ${esc(s.bestBench.name)}, ${f1(s.bestBench.actual)})` : ""}.`);
  }
  if (st === "final") {
    const [w, l] = m.home.score >= m.away.score ? [m.home, m.away] : [m.away, m.home];
    if (l.optimal > w.score) out.push(`💡 ${nm(l)} would have won with their best possible lineup (${f1(l.optimal)} pts).`);
    const startedHurt = sides.flatMap((s) => s.starters.filter((p) => p.injury === "OUT"));
    if (startedHurt.length) out.push(`⚠️ Started a player listed OUT: ${startedHurt.map((p) => esc(p.name)).join(", ")}.`);
  } else {
    out.push(`Players finished: ${m.home.playedCount}/${m.home.starters.length} vs ${m.away.playedCount}/${m.away.starters.length}. Live projection ${f1(m.home.liveProj)} – ${f1(m.away.liveProj)}.`);
  }
  return out;
}

// ---------- Players ----------
function renderPlayers() {
  ensureValues(); // the Trade value column fills in when values arrive
  const el = $("view-players"), f = state.players;
  el.innerHTML = `<div class="seg view-seg" id="pf-view" role="tablist">
      <button data-v="fa" role="tab" aria-selected="${f.view === "fa"}" class="${f.view === "fa" ? "active" : ""}">Free agents</button>
      <button data-v="rostered" role="tab" aria-selected="${f.view !== "fa"}" class="${f.view !== "fa" ? "active" : ""}">Rostered players</button>
    </div><div id="pf-body"></div>`;
  $("pf-view").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { f.view = b.dataset.v; renderPlayers(); }));
  if (f.view === "fa") renderFreeAgents($("pf-body"));
  else renderRosteredPlayers($("pf-body"));
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

function renderFreeAgents(el) {
  const w = state.week, sp = w.sp, f = state.players;
  const cache = (state.fa ||= {});
  const d = cache[sp];
  if (!d || d === "loading") {
    el.innerHTML = `<div class="loading"><span class="spinner"></span> Loading free agents…</div>`;
    if (!d) {
      cache[sp] = "loading";
      const base = state.base;
      fetchFreeAgents(sp)
        .then((x) => { if (state.base === base) cache[sp] = x; })
        .catch((e) => { if (state.base === base) cache[sp] = { error: e.message }; })
        .finally(() => { if (state.base === base && state.tab === "players" && f.view === "fa") renderPlayers(); });
    }
    return;
  }
  if (d.error) { el.innerHTML = `<div class="banner">${esc(d.error)}</div>`; return; }

  const all = d.players.map((p) => ({ ...p, pos: POS[p.posId] || "?", nfl: PRO[p.proId] || "", opp: computeOpp(w.nfl, p.posId, p.proId, sp) }));
  const posOpts = ["ALL", ...POS_ORDER].map((p) => `<option ${f.faPos === p ? "selected" : ""}>${p}</option>`).join("");
  const showPts = all.some((p) => p.pts != null);
  el.innerHTML = `<div class="section-head"><h2>Available free agents</h2><span class="muted small">Unrostered in your league now · week ${w.week} projections${showPts ? " and points" : ""}</span></div>
    <div class="inj-legend small muted"><span><span class="badge wv">W</span> On waivers</span>${Object.entries(INJURY).filter(([k]) => k !== "PROBABLE").map(([, [s, full, sev]]) => `<span><span class="badge ${sev ? "out" : "inj"}">${s}</span> ${full}</span>`).join("")}</div>
    <div class="filters">
      <input id="fa-q" type="search" placeholder="Search free agents…" value="${esc(f.faQ)}">
      <select id="fa-pos" aria-label="Position">${posOpts}</select>
      <div class="seg" id="fa-status">${[["all", "All"], ["FA", "Free agents"], ["W", "On waivers"]].map(([k, l]) => `<button data-s="${k}" class="${f.faStatus === k ? "active" : ""}">${l}</button>`).join("")}</div>
    </div><div id="fa-table"></div>
    <p class="small muted">Sorted by % rostered across all ESPN leagues by default. Click a column to sort.</p>${fcCredit()}`;
  const waiverTip = (p) => (p.waiverDate ? `<b>On waivers</b>Clears ${new Date(p.waiverDate).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "<b>On waivers</b>");
  const draw = () => {
    const q = f.faQ.toLowerCase();
    const rows = all.filter((p) => (f.faPos === "ALL" || p.pos === f.faPos) && (f.faStatus === "all" || p.status === f.faStatus) && (!q || p.name.toLowerCase().includes(q)));
    const cols = [
      { key: "name", label: "Player", render: (p) => `<strong>${plink(p.id, p.name)}</strong>${p.status === "W" ? ` <span class="badge wv" data-tip="${esc(waiverTip(p))}">W</span>` : ""}${injBadge(p)}` },
      { key: "pos", label: "Pos", sort: (p) => POS_ORDER.indexOf(p.pos) },
      { key: "nfl", label: "NFL", cls: "hide-sm" },
      { key: "opp", label: "Opp", title: "This week's opponent and ESPN's opponent rank vs. the player's position (1st = toughest, 32nd = easiest)", sort: (p) => p.opp?.rank ?? null, render: oppHtml },
      { key: "own", label: "% Rost", num: true, title: "Percent of ESPN leagues where the player is rostered, with the change this week", render: (p) => (p.own == null ? "–" : `${f1(p.own)}%${Math.abs(p.ownChg || 0) >= 0.5 ? ` <span class="trend ${p.ownChg > 0 ? "pos" : "neg"}">${p.ownChg > 0 ? "▲" : "▼"}${f1(Math.abs(p.ownChg))}</span>` : ""}`) },
      { key: "proj", label: "Proj", num: true, title: `ESPN projection for week ${w.week}`, render: (p) => f1(p.proj) },
      ...(showPts ? [{ key: "pts", label: "Pts", num: true, title: `Points in week ${w.week}`, render: (p) => (p.pts == null ? `<span class="muted">–</span>` : ptsLink(p.id, sp, f1(p.pts))) }] : []),
      { key: "seasonPts", label: "Season pts", num: true, render: (p) => f1(p.seasonPts) },
      { key: "pprRank", label: "PPR rank", num: true, cls: "hide-sm", title: "ESPN experts' average PPR rank for this week, within the position", sort: (p) => p.pprRank, render: (p) => posRankHtml(p, p.pprRank) },
      { key: "posRank", label: "Scoring rank", num: true, cls: "hide-sm", title: "Season rank by fantasy points, within the position", sort: (p) => p.posRank, render: (p) => posRankHtml(p, p.posRank) },
      { key: "value", label: "Trade value", num: true, title: "FantasyCalc redraft trade value, with 30-day trend", sort: (p) => valueOf(p.id), render: (p) => valueCell(p.id) },
    ];
    const t = $("fa-table");
    t.replaceChildren(sortableTable(cols, rows, f.faSort, draw));
    if (!rows.length) t.insertAdjacentHTML("beforeend", `<p class="muted">No free agents match those filters.</p>`);
  };
  $("fa-q").addEventListener("input", (e) => { f.faQ = e.target.value; draw(); });
  $("fa-pos").addEventListener("change", (e) => { f.faPos = e.target.value; draw(); });
  $("fa-status").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    f.faStatus = b.dataset.s;
    $("fa-status").querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
    draw();
  }));
  draw();
}

function renderRosteredPlayers(el) {
  const w = state.week, f = state.players;
  const all = w.sides.flatMap((s) => s.players);
  const showPts = w.status !== "upcoming";
  // Week leaders per position (rostered players).
  const leaders = POS_ORDER.map((pos) => {
    const list = all.filter((p) => p.pos === pos && (showPts ? p.played : true)).sort((a, b) => (showPts ? b.actual - a.actual : b.proj - a.proj));
    return list[0] && { pos, p: list[0] };
  }).filter(Boolean);
  const teamOpts = Object.values(state.base.teams).sort((a, b) => a.name.localeCompare(b.name)).map((t) => `<option value="${t.id}" ${String(f.team) === String(t.id) ? "selected" : ""}>${esc(t.name)}</option>`).join("");
  const posOpts = ["ALL", ...POS_ORDER].map((p) => `<option ${f.pos === p ? "selected" : ""}>${p}</option>`).join("");
  el.innerHTML = `<div class="section-head"><h2>Week ${w.week} ${showPts ? "top scorers" : "top projections"} by position</h2></div>
    <div class="grid grid-awards">${leaders.map(({ pos, p }) => `<div class="card award"><div class="label">${pos}</div><div class="value">${f1(showPts ? p.actual : p.proj)}</div><div class="who">${plink(p.id, p.name)}${injBadge(p)}</div><div class="why">${esc(team(p.teamId).name)} · ${p.starter ? "started" : "on bench"}${p.diff != null ? ` · ${signed(p.diff)} vs proj` : ""}</div></div>`).join("")}</div>
    <div class="section-head"><h2>All rostered players</h2><span class="muted small">Click a column to sort</span></div>
    <div class="inj-legend small muted">${Object.entries(INJURY).filter(([k]) => k !== "PROBABLE").map(([, [s, f, sev]]) => `<span><span class="badge ${sev ? "out" : "inj"}">${s}</span> ${f}</span>`).join("")}</div>
    <div class="filters">
      <input id="pf-q" type="search" placeholder="Search players…" value="${esc(f.q)}">
      <select id="pf-pos" aria-label="Position">${posOpts}</select>
      <select id="pf-team" aria-label="Manager"><option value="ALL">All managers</option>${teamOpts}</select>
      <div class="seg" id="pf-role">${["starters", "bench", "all"].map((r) => `<button data-r="${r}" class="${f.role === r ? "active" : ""}">${r[0].toUpperCase() + r.slice(1)}</button>`).join("")}</div>
    </div><div id="pf-table"></div>${fcCredit()}`;
  const draw = () => {
    const q = f.q.toLowerCase();
    const rows = all.filter((p) => (f.pos === "ALL" || p.pos === f.pos) && (f.team === "ALL" || String(p.teamId) === String(f.team)) &&
      (f.role === "all" || (f.role === "starters" ? p.starter : !p.starter)) && (!q || p.name.toLowerCase().includes(q)));
    const maxPts = Math.max(...rows.map((p) => p.actual), 1);
    const cols = [
      { key: "name", label: "Player", render: (p) => `<strong>${plink(p.id, p.name)}</strong>${injBadge(p)}${p.line ? `<div class="small muted">${esc(p.line)}</div>` : ""}` },
      { key: "pos", label: "Pos", sort: (p) => POS_ORDER.indexOf(p.pos) },
      { key: "nfl", label: "NFL", cls: "hide-sm" },
      { key: "opp", label: "Opp", title: "This week's opponent and ESPN's opponent rank vs. the player's position (1st = toughest, 32nd = easiest)", sort: (p) => p.opp?.rank ?? null, render: oppHtml },
      { key: "pprRank", label: "PPR rank", num: true, title: "ESPN experts' average PPR rank for this week, within the position", sort: (p) => p.pprRank, render: (p) => posRankHtml(p, p.pprRank) },
      { key: "posRank", label: "Scoring rank", num: true, title: "Season rank by fantasy points, within the position", sort: (p) => p.posRank, render: (p) => posRankHtml(p, p.posRank) },
      { key: "value", label: "Trade value", num: true, title: "FantasyCalc redraft trade value, with 30-day trend", sort: (p) => valueOf(p.id), render: (p) => valueCell(p.id) },
      { key: "teamId", label: "Manager", sort: (p) => team(p.teamId).name, render: (p) => esc(team(p.teamId).name) },
      { key: "slot", label: "Slot", sort: (p) => SLOT_DISPLAY.indexOf(p.slotId) + (p.starter ? 0 : 100) },
      { key: "actual", label: "Pts", num: true, sort: (p) => (p.played ? p.actual : null), render: (p) => p.played ? `<div class="bar-cell"><span class="track"><span class="fill" style="display:block;width:${Math.max(0, (p.actual / maxPts) * 100)}%"></span></span>${ptsLink(p.id, w.sp, f1(p.actual))}</div>` : `<span class="muted">–</span>` },
      { key: "proj", label: "Proj", num: true, render: (p) => f1(p.proj) },
      { key: "diff", label: "+/−", num: true, title: "Actual points minus ESPN projection", render: (p) => `<span class="${clsSign(p.diff)}">${signed(p.diff)}</span>` },
    ];
    const t = $("pf-table");
    t.replaceChildren(sortableTable(cols, rows, f.sort, draw));
    if (!rows.length) t.insertAdjacentHTML("beforeend", `<p class="muted">No players match those filters.</p>`);
  };
  $("pf-q").addEventListener("input", (e) => { f.q = e.target.value; draw(); });
  $("pf-pos").addEventListener("change", (e) => { f.pos = e.target.value; draw(); });
  $("pf-team").addEventListener("change", (e) => { f.team = e.target.value; draw(); });
  $("pf-role").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    f.role = b.dataset.r;
    $("pf-role").querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
    draw();
  }));
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
document.addEventListener("error", (e) => {
  const img = e.target;
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
const AWARD_NAMES = { top: "Top score", low: "Lowest score", bench: "Most bench points wasted", lineup: "Best lineup", blowout: "Biggest blowout", lucky: "Luckiest win", unlucky: "Unluckiest loss" };
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
    add("lineup", "Best lineup", pct(eff.efficiency ?? 0), eff, `Only ${f1(eff.benchLeft)} pts left on the bench`);
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
    el.innerHTML = `<div class="section-head"><h2>Week ${w.week} manager report</h2></div><p class="muted">Manager stats appear once games kick off. Check the Matchups tab for projections.</p>`;
    return;
  }
  const so = w.status === "final" ? "" : " (so far)";
  const awards = weekAwards(w);

  el.innerHTML = `<div class="section-head"><h2>Week ${w.week} awards${so} ${statusBadge(w.status)}</h2></div>
    <div class="grid grid-awards">${awards.map((a) => `<div class="card award"><div class="label">${AWARD_ICONS[a.key] ? awardIcon(a.key) + " " : ""}${a.label}</div><div class="value">${a.value}</div><div class="who">${teamName(a.side.teamId, 20)}</div><div class="why">${esc(team(a.side.teamId).owner)}${a.why ? " · " + a.why : ""}</div></div>`).join("")}</div>
    <div class="section-head"><h2>Manager report card</h2><span class="muted small">Optimal = best lineup possible from that roster this week</span></div>
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
  $("st-table").insertAdjacentHTML("afterend", fcCredit());
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
  // If the raw yard lines look mirrored relative to the spot, flip them.
  let lp = f.lastPlay, driveStart = f.driveStart;
  if (lp?.end != null && Math.abs(100 - lp.end - spot) + 1 < Math.abs(lp.end - spot)) {
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
  // Last play: an arc from where it started to where it ended.
  if (lp && lp.start != null && lp.end != null) {
    const xs = x(lp.start), xe = x(lp.end);
    if (Math.abs(xe - xs) >= 4) {
      const mid = (xs + xe) / 2, yds = lp.yards;
      const lift = Math.min(38, 14 + Math.abs(xe - xs) / 8); // arc height; stays inside the field
      parts.push(`<path d="M${xs} 96 Q${mid} ${96 - lift * 2} ${xe} 96" fill="none" stroke="#fff" stroke-width="4" stroke-dasharray="${lp.type.match(/pass/i) ? "10 8" : "0"}" marker-end="url(#arrow-${esc(g.id)})"/>`);
      if (yds != null) parts.push(`<text x="${mid}" y="${Math.max(54, 96 - lift - 8)}" class="lp-yds">${yds > 0 ? "+" : ""}${yds} yds</text>`);
    }
  }
  // Ball, with a chevron pointing the way the offense is going.
  const bx = x(spot);
  parts.push(`<ellipse cx="${bx}" cy="110" rx="17" ry="11" fill="#8d5524" stroke="#fff" stroke-width="2"/><line x1="${bx - 7}" x2="${bx + 7}" y1="110" y2="110" stroke="#fff" stroke-width="2"/>`);
  if (dir) {
    const cx = bx - dir * (narrow ? 28 : 34); // left = toward the away goal
    parts.push(`<path d="M${cx + dir * 10} 100 L${cx - dir * 6} 110 L${cx + dir * 10} 120" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`);
    // Team label just behind the ball, low on the field, clear of the play arc.
    const lx = Math.min(W - EZ - 40, Math.max(EZ + 40, bx + dir * 5 * S));
    parts.push(`<text x="${lx}" y="124" class="poss-lbl" fill="${possColor}">${esc(poss.abbr)}</text>`);
  }
  const arrowWord = dir > 0 ? "←" : dir < 0 ? "→" : "";
  const label = `${poss ? `${poss.abbr} ball ` : ""}${g.downDistance || ""}`.trim();
  return `<div class="field-wrap">
    <svg class="field ${narrow ? "narrow" : ""}" viewBox="0 0 ${W} 160" role="img" aria-label="${esc(label || "Field position")}">
      <defs><marker id="arrow-${esc(g.id)}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#fff"/></marker></defs>
      ${parts.join("")}
    </svg>
    <div class="field-caption">${poss ? `<strong>${esc(poss.abbr)}</strong> ball ${arrowWord} · ` : ""}${esc(g.downDistance || f.possText || "")}${f.driveDesc ? ` <span class="muted">· Drive: ${esc(f.driveDesc)}</span>` : ""}
      <span class="field-key"><i class="k-los"></i>Line of scrimmage <i class="k-fd"></i>First down</span></div>
  </div>`;
}

// ---------- Live games ----------
const LIVE_POLL_MS = 30000, IDLE_POLL_MS = 120000;

async function fetchLive() {
  const sp = state.base.scoringPeriodFor(state.base.current);
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
    const prev = state.livePrev;
    state.liveBumps = {};
    for (const p of data.players) {
      if (p.pts != null && prev[p.id] != null && p.pts !== prev[p.id]) state.liveBumps[p.id] = p.pts - prev[p.id];
      prev[p.id] = p.pts;
    }
    state.live = data;
  } catch (e) {
    if (!state.live || state.live.error) state.live = { error: e.message };
  }
  if (state.tab === "live") renderLive();
  const anyLive = state.live?.games?.some((g) => g.state === "in");
  state.liveTimer = setTimeout(() => {
    if (state.tab === "live" && document.visibilityState === "visible") refreshLive();
    else state.liveStale = true;
  }, anyLive ? LIVE_POLL_MS : IDLE_POLL_MS);
}

function renderLive() {
  const el = $("view-live");
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

  const kickoff = (g) => new Date(g.date).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
  const role = (p) => {
    if (!p.teamId) return `<span class="role fa">Free agent</span>`;
    const slot = p.slotId === BENCH ? `<span class="role bench">Bench</span>` : p.slotId === IR ? `<span class="role bench">IR</span>`
      : p.slotId != null ? `<span class="role start">Starting · ${esc(SLOT[p.slotId] || "")}</span>` : "";
    return `${teamName(p.teamId, 18)} ${slot}`;
  };
  const playerRow = (p, g) => {
    const pos = POS[p.posId] || "";
    const bump = state.liveBumps[p.id];
    const pts = g.state === "pre" ? `<span class="muted">–</span>` : ptsLink(p.id, L.sp, f2(p.pts ?? 0));
    const line = statLine(p.posId, p.stats);
    return `<div class="lp ${bump ? "bump" : ""} ${p.teamId && p.slotId !== BENCH && p.slotId !== IR ? "is-starter" : ""}">
      <div class="lp-main">
        <div><span class="lp-name">${plink(p.id, p.name)}</span> <span class="muted small">${pos}</span>${injBadge({ injury: p.injury })}</div>
        ${line ? `<div class="small muted">${esc(line)}</div>` : ""}
        <div class="lp-owner">${role(p)}</div>
      </div>
      <div class="lp-pts">${pts}${bump ? `<span class="lp-delta ${bump > 0 ? "pos" : "neg"}">${signed(bump)}</span>` : ""}<small>proj ${f1(p.proj)}</small></div>
    </div>`;
  };
  const teamPlayers = (proId, g) => {
    let list = byPro[proId] || [];
    if (f.show === "rostered") list = list.filter((p) => p.teamId);
    if (f.team !== "ALL") list = list.filter((p) => String(p.teamId) === String(f.team));
    list = [...list].sort((a, b) => (g.state === "pre" ? b.proj - a.proj : (b.pts ?? 0) - (a.pts ?? 0) || b.proj - a.proj));
    return list.length ? list.map((p) => playerRow(p, g)).join("") : `<p class="muted small">No ${f.show === "rostered" ? "rostered " : ""}players${f.team !== "ALL" ? " for this team" : ""}.</p>`;
  };
  const scoreSide = (s, g, right) => {
    const won = g.state === "post" && s.score > (s === g.home ? g.away.score : g.home.score);
    return `<div class="g-team ${right ? "right" : ""} ${won ? "won" : ""}">
      <img class="g-logo" src="${esc(s.logo)}" alt="" width="36" height="36" loading="lazy">
      <div class="g-name"><strong>${esc(s.abbr)}</strong>${g.possession === s.proId ? ` <span class="poss" title="Has the ball">🏈</span>` : ""}<span class="muted small">${esc(s.record)}</span></div>
      <div class="g-score">${g.state === "pre" ? "" : s.score ?? ""}</div>
    </div>`;
  };
  const gameCard = (g) => {
    const status = g.state === "in" ? `<span class="badge live">LIVE</span> <strong>${esc(g.detail)}</strong>`
      : g.state === "post" ? `<span class="badge final">FINAL</span>` : `<strong>${esc(kickoff(g))}</strong>`;
    // The field graphic shows down & distance itself; fall back to text when ESPN sends no field position.
    const graphic = g.state === "in" ? fieldGraphic(g) : "";
    const sit = g.state === "in" && (g.downDistance || g.redZone)
      ? `<div class="g-sit">${graphic ? "" : g.downDistance ? esc(g.downDistance) : ""}${g.redZone ? ` <span class="badge out">RED ZONE</span>` : ""}</div>` : "";
    return `<div class="card game state-${g.state}">
      <div class="g-head">
        ${scoreSide(g.away, g, false)}
        <div class="g-status">${status}${g.broadcast ? `<div class="muted small">${esc(g.broadcast)}</div>` : ""}</div>
        ${scoreSide(g.home, g, true)}
      </div>
      ${graphic}${sit}${g.state === "in" && g.lastPlay ? `<div class="g-last small muted">Last play: ${esc(g.lastPlay)}</div>` : ""}
      <div class="g-players">
        <div class="g-col"><div class="g-col-head">${esc(g.away.name || g.away.abbr)}</div>${teamPlayers(g.away.proId, g)}</div>
        <div class="g-col"><div class="g-col-head">${esc(g.home.name || g.home.abbr)}</div>${teamPlayers(g.home.proId, g)}</div>
      </div>
    </div>`;
  };

  const teamOpts = Object.values(state.base.teams).sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => `<option value="${t.id}" ${String(f.team) === String(t.id) ? "selected" : ""}>${esc(t.name)}</option>`).join("");
  const summary = [counts.in && `${counts.in} live`, counts.pre && `${counts.pre} upcoming`, counts.post && `${counts.post} final`].filter(Boolean).join(" · ");
  const updated = new Date(L.updated).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });

  el.innerHTML = `<div class="section-head"><h2>NFL week ${L.sp} ${counts.in ? `<span class="badge live">LIVE</span>` : ""}</h2>
      <span class="muted small">${summary} · Updated ${updated}${counts.in ? " · refreshes every 30 seconds" : ""}</span></div>
    <div class="filters">
      <div class="seg" id="lv-show"><button data-s="rostered" class="${f.show === "rostered" ? "active" : ""}">Rostered players</button><button data-s="all" class="${f.show === "all" ? "active" : ""}">All players</button></div>
      <select id="lv-team" aria-label="Fantasy team"><option value="ALL">All fantasy teams</option>${teamOpts}</select>
    </div>
    ${L.byes?.length ? `<p class="muted small">On bye: ${L.byes.map(esc).join(", ")}</p>` : ""}
    <div class="games">${games.map(gameCard).join("") || `<p class="muted">No NFL games found for this week.</p>`}</div>`;
  $("lv-show").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { f.show = b.dataset.s; renderLive(); }));
  $("lv-team").addEventListener("change", (e) => { f.team = e.target.value; renderLive(); });
  // Only flash a score change once.
  state.liveBumps = {};
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
  const games = (raw.schedule || []).filter((g) => g.winner && g.winner !== "UNDECIDED" && g.away);
  const weekly = [];
  let final = null;
  for (const g of games) {
    const h = g.home, a = g.away;
    const bracket = g.playoffTierType === "WINNERS_BRACKET";
    if (bracket) {
      const [w, l] = h.totalPoints >= a.totalPoints ? [h, a] : [a, h];
      if (teams[w.teamId]) teams[w.teamId].poW++;
      if (teams[l.teamId]) teams[l.teamId].poL++;
      if (!final || g.matchupPeriodId > final.week) final = { week: g.matchupPeriodId, winner: w, loser: l };
    }
    if (g.matchupPeriodId <= regWeeks) {
      for (const [me, opp] of [[h, a], [a, h]]) weekly.push({ teamId: me.teamId, score: me.totalPoints, opp: opp.teamId, oppScore: opp.totalPoints, week: g.matchupPeriodId, year });
    }
  }
  const list = Object.values(teams);
  const champ = list.find((t) => t.finish === 1) || (final && teams[final.winner.teamId]);
  return {
    year, name: raw.settings?.name || "", teams, list, weekly, regWeeks, playoffTeams, champ,
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
      <div id="hist-table"></div>`;
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
function renderRoster() {
  ensureValues(); // the Value column fills in when values arrive
  const w = state.week, el = $("view-roster");
  const ids = Object.keys(state.base.teams).sort((a, b) => team(a).name.localeCompare(team(b).name));
  const key = `ffb.rosterteam.${state.leagueId || "default"}`;
  let sel = state.rosterTeam || store.get(key) || store.get(`ffb.myteam.${state.leagueId || "default"}`);
  if (!state.base.teams[sel]) sel = ids[0];
  state.rosterTeam = sel;

  const t = team(sel);
  const side = w.sides.find((s) => String(s.teamId) === String(sel));
  const m = w.matchups.find((x) => String(x.home?.teamId) === String(sel) || String(x.away?.teamId) === String(sel));
  const opp = m && (String(m.home.teamId) === String(sel) ? m.away : m.home);
  const myWp = m?.away && (String(m.home.teamId) === String(sel) ? m.wp : 1 - m.wp);
  const standing = 1 + Object.values(state.base.teams).filter((o) => o.seed < t.seed).length;
  const played = w.status !== "upcoming";

  let matchupLine = `<span class="muted">No matchup in week ${w.week}.</span>`;
  if (side && opp) {
    const score = played ? `${f2(side.score)} – ${f2(opp.score)}` : `proj ${f1(side.proj)} – ${f1(opp.proj)}`;
    const result = w.status === "final" ? (side.score > opp.score ? `<span class="badge live">W</span>` : side.score < opp.score ? `<span class="badge out">L</span>` : `<span class="badge">T</span>`)
      : `<span class="muted small">${pct(myWp)} win chance</span>`;
    matchupLine = `Week ${w.week} vs ${teamName(opp.teamId, 22)} · <strong>${score}</strong> ${result}`;
  }

  const row = (p) => `<tr><td class="slot-cell">${esc(p.slot)}</td>
    <td><strong>${plink(p.id, p.name)}</strong>${injBadge(p)}<div class="small muted">${p.pos}${p.nfl ? ` · ${p.nfl}` : ""}${p.line ? ` · ${esc(p.line)}` : ""}</div></td>
    <td>${oppHtml(p)}</td>
    <td class="num">${f1(p.proj)}</td>
    <td class="num">${p.played ? ptsLink(p.id, w.sp, f1(p.actual)) : `<span class="muted">–</span>`}</td>
    <td class="num hide-sm">${posRankHtml(p, p.pprRank)}</td>
    <td class="num hide-sm">${posRankHtml(p, p.posRank)}</td>
    <td class="num">${valueCell(p.id)}</td></tr>`;
  const head = `<thead><tr><th>Slot</th><th>Player</th><th>Opp</th><th class="num">Proj</th><th class="num">Pts</th><th class="num hide-sm" title="ESPN experts' average PPR rank for this week">PPR rank</th><th class="num hide-sm" title="Season rank by fantasy points">Scoring rank</th><th class="num" title="FantasyCalc redraft trade value">Value</th></tr></thead>`;
  const table = (title, list, totals) => list.length ? `<h3 class="ta-sub">${title}</h3><div class="table-wrap"><table class="data roster-table">${head}<tbody>${list.map(row).join("")}${totals || ""}</tbody></table></div>` : "";

  let body = `<p class="muted">${esc(t.name)} has no lineup for week ${w.week}.</p>`;
  if (side) {
    const bench = side.bench.filter((p) => p.slotId !== IR), ir = side.bench.filter((p) => p.slotId === IR);
    const totals = `<tr class="total-row"><td></td><td><strong>Starters total</strong></td><td></td><td class="num"><strong>${f1(side.proj)}</strong></td><td class="num"><strong>${played ? f2(side.score) : "–"}</strong></td><td class="hide-sm"></td><td class="hide-sm"></td><td class="num"><strong>${state.values?.byId ? fmtVal(sum(side.starters, (p) => valueOf(p.id) || 0)) : ""}</strong></td></tr>`;
    body = table("Starters", side.starters, totals) + table("Bench", bench) + table("Injured reserve", ir);
  }
  const rosterValue = side && state.values?.byId?.size ? sum(side.players, (p) => valueOf(p.id) || 0) : null;
  const opts = ids.map((id) => `<option value="${id}" ${id === String(sel) ? "selected" : ""}>${esc(team(id).name)} (${esc(team(id).owner)})</option>`).join("");

  el.innerHTML = `<div class="section-head"><h2>Rosters</h2><label class="small muted ta-me">Team <select id="roster-team">${opts}</select></label></div>
    <div class="card roster-head">
      ${logoImg(t, 56)}
      <div class="roster-id"><h3>${esc(t.name)}</h3><div class="muted">${esc(t.owner)}</div><div class="roster-match">${matchupLine}</div></div>
      <div class="roster-stats">
        <div><span class="muted small">Record</span><strong>${recordStr(t)}</strong></div>
        <div><span class="muted small">Standing</span><strong>${ordinal(standing)}</strong></div>
        <div><span class="muted small">Points for</span><strong>${f1(t.pf)}</strong></div>
        ${rosterValue != null ? `<div><span class="muted small">Roster value</span><strong>${fmtVal(rosterValue)}</strong></div>` : ""}
      </div>
    </div>
    <p class="small muted">Lineup for week ${w.week}. Change the week at the top to see other weeks.</p>
    ${body}
    ${fcCredit()}`;
  $("roster-team").addEventListener("change", (e) => { state.rosterTeam = e.target.value; store.set(key, e.target.value); renderRoster(); });
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
  const week = ensureCurrentRosters();
  if (!values || !week) { el.innerHTML = `<div class="loading"><span class="spinner"></span> Loading rosters and trade values…</div>`; return; }
  if (values.error) { el.innerHTML = `<div class="banner">${esc(values.error)}</div>`; return; }

  const rosters = rostersWithValues();
  const L = leagueProfiles(rosters);
  const teamIds = Object.keys(rosters).sort((a, b) => team(a).name.localeCompare(team(b).name));
  const myKey = `ffb.myteam.${state.leagueId || "default"}`;
  const ta = (state.ta ||= { my: store.get(myKey) || "", other: "", give: [], get: [] });
  if (!rosters[ta.my]) ta.my = teamIds[0];
  if (!rosters[ta.other] || ta.other === ta.my) ta.other = teamIds.find((id) => id !== ta.my);
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

  // --- Mock trade ---
  const myPlayers = [...rosters[ta.my]].sort((a, b) => b.value - a.value);
  const theirPlayers = [...rosters[ta.other]].sort((a, b) => b.value - a.value);
  const pick = (list, chosen, name) => [0, 1, 2].map((i) => `<select data-side="${name}" data-i="${i}" aria-label="Player ${i + 1}"><option value="">${i ? "Add a player (optional)" : "Choose a player"}</option>
      ${list.map((p) => `<option value="${p.id}" ${String(chosen[i]) === String(p.id) ? "selected" : ""}>${esc(p.name)} (${p.pos}) · ${fmtVal(p.value)}</option>`).join("")}</select>`).join("");
  const giveP = ta.give.map((id) => myPlayers.find((p) => String(p.id) === String(id))).filter(Boolean);
  const getP = ta.get.map((id) => theirPlayers.find((p) => String(p.id) === String(id))).filter(Boolean);
  let result = `<p class="muted">Pick players on both sides to see how the trade grades out.</p>`;
  if (giveP.length && getP.length) {
    const gv = sum(giveP, (p) => p.value), rv = sum(getP, (p) => p.value), d = rv - gv, pctD = d / Math.max(gv, rv, 1);
    const verdict = Math.abs(pctD) <= 0.05 ? `<span class="verdict even">Fair trade</span> <span class="muted">(within 5%)</span>`
      : d > 0 ? `<span class="verdict pos">You win by ${fmtVal(d)}</span> <span class="muted">(${Math.round(pctD * 100)}%)</span>`
      : `<span class="verdict neg">You lose by ${fmtVal(-d)}</span> <span class="muted">(${Math.round(-pctD * 100)}%)</span>`;
    const after = (players, out, inn) => players.filter((p) => !out.includes(p)).concat(inn.map((p) => ({ ...p, slotId: BENCH })));
    const myAfter = teamProfile(after(rosters[ta.my], giveP, getP), L.needs, state.base.slotCounts);
    const theirAfter = teamProfile(after(rosters[ta.other], getP, giveP), L.needs, state.base.slotCounts);
    const theirBefore = L.profiles[ta.other];
    // Re-rank positions for my team with the trade applied.
    const rankAfter = (pos) => 1 + Object.entries(L.profiles).filter(([id]) => id !== String(ta.my)).map(([id, p]) => (id === String(ta.other) ? theirAfter : p).byPos[pos].coreValue).filter((v) => v > myAfter.byPos[pos].coreValue).length;
    const posChanges = TA_POS.map((pos) => [pos, L.ranks[pos][ta.my], rankAfter(pos)]).filter(([, a, b]) => a !== b)
      .map(([pos, a, b]) => `<span class="${b < a ? "pos" : "neg"}">${pos} ${ordinal(a)} → ${ordinal(b)}</span>`).join(" · ");
    const consolidation = giveP.length !== getP.length
      ? `<p class="small muted">${giveP.length > getP.length ? "You're getting fewer players back." : "You're getting more players back."} In uneven trades the side receiving the single best player usually deserves a bit extra, since roster spots and star power matter; raw totals don't capture that.</p>` : "";
    result = `<div class="trade-result">
      <div class="tr-totals"><div><span class="muted small">You give</span><strong>${fmtVal(gv)}</strong></div><div class="tr-arrow">⇄</div><div><span class="muted small">You get</span><strong>${fmtVal(rv)}</strong></div></div>
      <div class="tr-verdict">${verdict}</div>
      <div class="tr-impact">
        <div><span class="muted small">Your starting lineup value</span> ${fmtVal(me.lineupValue)} → <strong>${fmtVal(myAfter.lineupValue)}</strong> ${valDelta(myAfter.lineupValue - me.lineupValue)}</div>
        <div><span class="muted small">${esc(team(ta.other).name)}'s starting lineup value</span> ${fmtVal(theirBefore.lineupValue)} → <strong>${fmtVal(theirAfter.lineupValue)}</strong> ${valDelta(theirAfter.lineupValue - theirBefore.lineupValue)}</div>
        ${posChanges ? `<div><span class="muted small">Your position ranks</span> ${posChanges}</div>` : ""}
      </div>${consolidation}</div>`;
  }

  const teamOpts = (sel, exclude) => teamIds.filter((id) => id !== exclude).map((id) => `<option value="${id}" ${id === String(sel) ? "selected" : ""}>${esc(team(id).name)}</option>`).join("");
  el.innerHTML = `<div class="section-head"><h2>Trade Analyzer</h2>
      <label class="small muted ta-me">My team <select id="ta-my">${teamOpts(ta.my)}</select></label></div>
    <div class="section-head" id="mock-trade"><h2>Mock trade</h2><span class="muted small">Up to 3 players per side</span></div>
    <div class="grid grid-2 mock">
      <div class="card"><div class="mock-head">You give <span class="muted small">(${esc(team(ta.my).name)})</span></div>${pick(myPlayers, ta.give, "give")}</div>
      <div class="card"><div class="mock-head">You get from <select id="ta-other">${teamOpts(ta.other, ta.my)}</select></div>${pick(theirPlayers, ta.get, "get")}</div>
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
    <h3 class="ta-sub">Trade targets</h3>
    <div class="grid targets">${targetRows}</div>
    ${fcCredit()}`;

  $("ta-my").addEventListener("change", (e) => { ta.my = e.target.value; store.set(myKey, ta.my); ta.give = []; if (ta.other === ta.my) { ta.other = ""; ta.get = []; } renderTradeAnalyzer(); });
  $("ta-other").addEventListener("change", (e) => { ta.other = e.target.value; ta.get = []; renderTradeAnalyzer(); });
  el.querySelectorAll("select[data-side]").forEach((s) => s.addEventListener("change", () => {
    const arr = ta[s.dataset.side];
    arr[+s.dataset.i] = s.value;
    ta[s.dataset.side] = arr.filter((v, i, a) => v && a.indexOf(v) === i);
    renderTradeAnalyzer();
  }));
  el.querySelectorAll("[data-target]").forEach((b) => b.addEventListener("click", () => {
    const t = topTargets[+b.dataset.target];
    Object.assign(ta, { other: t.teamId, get: [String(t.p.id)], give: t.pkg.players.map((p) => String(p.id)) });
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
  if (posId === 16) return [s[99] && `${fmtNum(s[99])} sacks`, s[95] && `${s[95]} INT`, s[96] && `${s[96]} fumble rec`, s[120] != null && `${s[120]} pts allowed`].filter(Boolean).join(", ");
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
  renderPlayerModal(cache[id].data, focusSp);
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
  const rows = [];
  for (let sp = 1; sp <= lastWeek; sp++) {
    const w = bySp[sp];
    if (!w) {
      const why = p.bye === sp ? "BYE" : sp === state.base.current ? "Hasn't played yet" : "Did not play";
      rows.push(`<tr class="muted"><td>${sp}</td><td colspan="2">${why}</td></tr>`);
      continue;
    }
    const opp = w.opp ? `${w.home ? "vs" : "@"} ${esc(PRO[w.opp] || "")}` : "";
    const open = focusSp === sp;
    rows.push(`<tr class="gl-row ${open ? "open" : ""}" data-sp="${sp}"><td>${sp}</td><td><strong>${opp || "–"}</strong><div class="gl-line">${esc(gameLine(p.posId, w.stats))}</div></td>
      <td class="num"><button type="button" class="gl-pts" aria-expanded="${open}" aria-controls="gl-bd-${sp}">${f2(w.pts)} <span class="caret">▾</span></button></td></tr>
      <tr class="gl-bd" id="gl-bd-${sp}" ${open ? "" : "hidden"}><td></td><td colspan="2">${breakdownHtml(w, p.posId)}</td></tr>`);
  }
  body.innerHTML = `<div class="pm-head">
      <div><h2 id="pl-modal-title">${esc(p.name)}${injBadge({ injury: p.injury })}</h2>
        <div class="muted">${pos}${p.proId ? ` · ${esc(PRO[p.proId] || "")}` : ""}${p.bye ? ` · Bye week ${p.bye}` : ""}</div>
        <div class="pm-owner">${owner}</div></div>
    </div>
    <div class="pm-stats">
      <div><span class="muted small">Season points</span><strong>${f1(total)}</strong></div>
      <div><span class="muted small">Games</span><strong>${games}</strong></div>
      <div><span class="muted small">Per game</span><strong>${games ? f1(total / games) : "–"}</strong></div>
      <div><span class="muted small">Best week</span><strong>${best ? f1(best.pts) : "–"}</strong>${best ? `<span class="muted small">week ${best.sp}</span>` : ""}</div>
      ${d.seasonProj ? `<div><span class="muted small">ESPN season proj.</span><strong>${f1(d.seasonProj)}</strong></div>` : ""}
      ${val ? `<div><span class="muted small">Trade value</span><strong>${fmtVal(val.value)}</strong><span class="muted small">FantasyCalc</span></div>` : ""}
    </div>
    ${focusSp && !bySp[focusSp] ? `<p class="muted small">No stats yet for week ${focusSp}.</p>` : ""}
    <h3 class="pm-sub">${state.base.season} game log <span class="muted small">· tap points to see how they were scored</span></h3>
    <div class="table-wrap"><table class="data gamelog"><thead><tr><th>Wk</th><th>Game</th><th class="num">Pts</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
  body.querySelectorAll(".gl-pts").forEach((b) => b.addEventListener("click", () => {
    const row = b.closest("tr"), bd = $(`gl-bd-${row.dataset.sp}`);
    bd.hidden = !bd.hidden;
    row.classList.toggle("open", !bd.hidden);
    b.setAttribute("aria-expanded", String(!bd.hidden));
  }));
  if (focusSp && bySp[focusSp]) $(`gl-bd-${focusSp}`).scrollIntoView({ block: "center" });
  else body.closest(".modal-card").scrollTop = 0;
}

// ---------- Tooltip ----------
function initTooltip() {
  const tip = $("tooltip");
  document.addEventListener("mousemove", (e) => {
    const t = e.target.closest?.("[data-tip]");
    if (!t) { tip.hidden = true; return; }
    tip.innerHTML = t.getAttribute("data-tip");
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
    tip.style.left = `${x}px`; tip.style.top = `${y}px`;
  });
}

// ---------- App flow ----------
function setLoading(on) { $("loading").hidden = !on; }
function banner(msg) { $("banner").hidden = !msg; $("banner").innerHTML = msg || ""; }

function render() {
  if (!state.week) return;
  showView(state.tab);
  ({ roster: renderRoster, matchups: renderMatchups, live: renderLive, players: renderPlayers, managers: renderManagers, season: renderSeason, history: renderHistory, trade: renderTradeAnalyzer, transactions: renderTransactions })[state.tab]();
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
    values: null, ta: null, rostersLoading: false, playerCache: null, fa: null, rosterTeam: null,
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
  $("league-name").textContent = b.name;
  $("league-meta").textContent = `${b.season || ""} season · ${Object.keys(b.teams).length} teams`;
  document.title = `${b.name} · Weekly Breakdown`;
  $("week-select").innerHTML = Array.from({ length: b.weeks }, (_, i) => i + 1)
    .map((w) => `<option value="${w}">Week ${w}${w > b.regWeeks ? " (playoffs)" : ""}${w === b.current ? " · current" : ""}</option>`).join("");
  $("week-nav").hidden = false;
  $("tabs").hidden = false;
  // A ?week= link applies to the first load only.
  const wk = Math.min(Math.max(week || pendingWeek || b.current, 1), b.weeks);
  pendingWeek = null;
  await loadWeek(wk);
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

function bindUi() {
  $("tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-tab]");
    if (!b) return;
    state.tab = b.dataset.tab;
    store.set("ffb.tab", state.tab);
    render();
  });
  const go = async (w) => { state.openMatchup = null; await loadWeek(w); setUrl(); };
  $("week-select").addEventListener("change", (e) => go(+e.target.value));
  $("prev-week").addEventListener("click", () => state.week && go(state.week.week - 1));
  $("next-week").addEventListener("click", () => state.week && go(state.week.week + 1));
  $("refresh").addEventListener("click", async () => {
    const wk = state.week?.week;
    state.weekCache = {};
    state.awardTally = null;
    state.activity = null;
    state.history = null;
    state.values = null;
    state.fa = null;
    await loadLeague(wk);
  });
  $("retry").addEventListener("click", () => loadLeague());
  $("league-select").addEventListener("change", (e) => switchLeague(e.target.value, ""));
  // Catch up on live games when the page comes back into view.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.tab === "live" && state.liveStale) renderLive();
  });
  // Keep live weeks fresh.
  setInterval(() => {
    if (document.visibilityState === "visible" && state.week?.status === "live" && !state.demo) loadWeek(state.week.week, true);
  }, 120000);
}

initTooltip();
initPlayerModal();
bindUi();
loadLeague();
