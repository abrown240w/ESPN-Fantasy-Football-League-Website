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
  leagueId: params.get("league") || store.get("ffb.league") || "",
  season: params.get("season") || store.get("ffb.season") || "",
  tab: store.get("ffb.tab") || "matchups",
  base: null,
  week: null,
  weekCache: {},
  openMatchup: null,
  players: { q: "", pos: "ALL", team: "ALL", role: "starters", sort: { key: "actual", dir: -1 } },
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
  return {
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
  // This week's NFL opponent and how tough that defense is against the player's position.
  let opp = null;
  if (nfl && pl.proTeamId) {
    const g = nfl.games[pl.proTeamId];
    if (g) {
      const [rank, avg] = nfl.oprk[pl.defaultPositionId]?.[g[0]] || [];
      opp = { team: PRO[g[0]] || "", home: g[1], rank, avg };
    } else if (nfl.byes[pl.proTeamId] === sp) {
      opp = { bye: true };
    }
  }
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

function optimalLineup(players, slotCounts) {
  const slots = [];
  const ids = Object.keys(slotCounts).map(Number).filter((id) => id !== BENCH && id !== IR && slotCounts[id] > 0);
  ids.sort((a, b) => (FLEX_SLOTS.has(a) - FLEX_SLOTS.has(b)) || (a === 7) - (b === 7));
  for (const id of ids) for (let i = 0; i < slotCounts[id]; i++) slots.push(id);
  const pool = players.filter((p) => p.slotId !== IR).sort((a, b) => b.actual - a.actual);
  const used = new Set(), lineup = [];
  for (const slot of slots) {
    const p = pool.find((x) => !used.has(x.id) && x.eligible.includes(slot));
    if (p) { used.add(p.id); lineup.push({ slot, p }); }
  }
  return { points: sum(lineup, (x) => x.p.actual), lineup };
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
const ptsCell = (p, status) => (p.played || status === "final" ? f1(p.actual) : `<span class="muted">–</span>`);

function showView(name) {
  for (const v of ["matchups", "live", "players", "managers", "season", "history", "transactions"]) $(`view-${v}`).hidden = v !== name;
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
  const cellL = (p, win) => p ? `<td class="pl ${win ? "edge-win" : ""}"><span class="nm">${esc(p.name)}${injBadge(p)}</span><span class="sub">${p.pos} · ${p.nfl}${p.line ? " · " + esc(p.line) : ""}</span>${p.opp ? `<span class="opp-sub">${oppHtml(p)}</span>` : ""}</td><td class="num hide-sm muted">${f1(p.proj)}</td><td class="num edge">${ptsCell(p, st)}</td>` : `<td class="pl muted">Empty</td><td class="hide-sm"></td><td></td>`;
  const cellR = (p, win) => p ? `<td class="num edge">${ptsCell(p, st)}</td><td class="num hide-sm muted">${f1(p.proj)}</td><td class="pl right ${win ? "edge-win" : ""}"><span class="nm">${injBadge(p)} ${esc(p.name)}</span><span class="sub">${p.line ? esc(p.line) + " · " : ""}${p.pos} · ${p.nfl}</span>${p.opp ? `<span class="opp-sub">${oppHtml(p)}</span>` : ""}</td>` : `<td></td><td class="hide-sm"></td><td class="pl right muted">Empty</td>`;
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
  const w = state.week, el = $("view-players"), f = state.players;
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
    <div class="grid grid-awards">${leaders.map(({ pos, p }) => `<div class="card award"><div class="label">${pos}</div><div class="value">${f1(showPts ? p.actual : p.proj)}</div><div class="who">${esc(p.name)}${injBadge(p)}</div><div class="why">${esc(team(p.teamId).name)} · ${p.starter ? "started" : "on bench"}${p.diff != null ? ` · ${signed(p.diff)} vs proj` : ""}</div></div>`).join("")}</div>
    <div class="section-head"><h2>All rostered players</h2><span class="muted small">Click a column to sort</span></div>
    <div class="inj-legend small muted">${Object.entries(INJURY).filter(([k]) => k !== "PROBABLE").map(([, [s, f, sev]]) => `<span><span class="badge ${sev ? "out" : "inj"}">${s}</span> ${f}</span>`).join("")}</div>
    <div class="filters">
      <input id="pf-q" type="search" placeholder="Search players…" value="${esc(f.q)}">
      <select id="pf-pos" aria-label="Position">${posOpts}</select>
      <select id="pf-team" aria-label="Manager"><option value="ALL">All managers</option>${teamOpts}</select>
      <div class="seg" id="pf-role">${["starters", "bench", "all"].map((r) => `<button data-r="${r}" class="${f.role === r ? "active" : ""}">${r[0].toUpperCase() + r.slice(1)}</button>`).join("")}</div>
    </div><div id="pf-table"></div>`;
  const draw = () => {
    const q = f.q.toLowerCase();
    const rows = all.filter((p) => (f.pos === "ALL" || p.pos === f.pos) && (f.team === "ALL" || String(p.teamId) === String(f.team)) &&
      (f.role === "all" || (f.role === "starters" ? p.starter : !p.starter)) && (!q || p.name.toLowerCase().includes(q)));
    const maxPts = Math.max(...rows.map((p) => p.actual), 1);
    const cols = [
      { key: "name", label: "Player", render: (p) => `<strong>${esc(p.name)}</strong>${injBadge(p)}${p.line ? `<div class="small muted">${esc(p.line)}</div>` : ""}` },
      { key: "pos", label: "Pos", sort: (p) => POS_ORDER.indexOf(p.pos) },
      { key: "nfl", label: "NFL", cls: "hide-sm" },
      { key: "opp", label: "Opp", title: "This week's opponent and ESPN's opponent rank vs. the player's position (1st = toughest, 32nd = easiest)", sort: (p) => p.opp?.rank ?? null, render: oppHtml },
      { key: "pprRank", label: "PPR rank", num: true, title: "ESPN experts' average PPR rank for this week, within the position", sort: (p) => p.pprRank, render: (p) => posRankHtml(p, p.pprRank) },
      { key: "posRank", label: "Scoring rank", num: true, title: "Season rank by fantasy points, within the position", sort: (p) => p.posRank, render: (p) => posRankHtml(p, p.posRank) },
      { key: "teamId", label: "Manager", sort: (p) => team(p.teamId).name, render: (p) => esc(team(p.teamId).name) },
      { key: "slot", label: "Slot", sort: (p) => SLOT_DISPLAY.indexOf(p.slotId) + (p.starter ? 0 : 100) },
      { key: "actual", label: "Pts", num: true, sort: (p) => (p.played ? p.actual : null), render: (p) => p.played ? `<div class="bar-cell"><span class="track"><span class="fill" style="display:block;width:${Math.max(0, (p.actual / maxPts) * 100)}%"></span></span>${f1(p.actual)}</div>` : `<span class="muted">–</span>` },
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
    { key: "mvp", label: "MVP", cls: "hide-sm", sort: (s) => s.mvp?.actual, render: (s) => (s.mvp ? `${esc(s.mvp.name)} <span class="muted">${f1(s.mvp.actual)}</span>` : "–") },
    { key: "bust", label: "Biggest bust", cls: "hide-sm", sort: (s) => s.bust?.diff, render: (s) => (s.bust ? `${esc(s.bust.name)} <span class="neg">${signed(s.bust.diff)}</span>` : "–") },
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
  ];
  const draw = () => $("st-table").replaceChildren(sortableTable(cols, season.rows, state.standings.sort, draw));
  draw();
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
    const pts = g.state === "pre" ? `<span class="muted">–</span>` : f2(p.pts ?? 0);
    const line = statLine(p.posId, p.stats);
    return `<div class="lp ${bump ? "bump" : ""} ${p.teamId && p.slotId !== BENCH && p.slotId !== IR ? "is-starter" : ""}">
      <div class="lp-main">
        <div><span class="lp-name">${esc(p.name)}</span> <span class="muted small">${pos}</span>${injBadge({ injury: p.injury })}</div>
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
    const sit = g.state === "in" && (g.downDistance || g.redZone)
      ? `<div class="g-sit">${g.downDistance ? esc(g.downDistance) : ""}${g.redZone ? ` <span class="badge out">RED ZONE</span>` : ""}</div>` : "";
    return `<div class="card game state-${g.state}">
      <div class="g-head">
        ${scoreSide(g.away, g, false)}
        <div class="g-status">${status}${g.broadcast ? `<div class="muted small">${esc(g.broadcast)}</div>` : ""}</div>
        ${scoreSide(g.home, g, true)}
      </div>
      ${sit}${g.state === "in" && g.lastPlay ? `<div class="g-last small muted">Last play: ${esc(g.lastPlay)}</div>` : ""}
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
    return `<span class="tx-player">${esc(name)} <span class="muted small">${POS[posId] || ""}${PRO[proId] && proId ? " · " + PRO[proId] : ""}</span></span>`;
  };
  const fmtDate = (ms) => new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const weekLabel = (w) => (w ? `Week ${w}` : "Preseason");
  const tradeSidesHtml = (sides) => sides.map((s) => `<div class="trade-side">
      <div class="trade-team">${teamName(s.teamId, 26)}</div>
      <div class="small muted">receives</div>
      ${s.gets.map((id) => `<div class="tx-line add">+ ${player(id)}</div>`).join("") || `<div class="muted small">Nothing</div>`}
      ${s.drops.map((id) => `<div class="tx-line drop">− ${player(id)} <span class="muted small">(dropped)</span></div>`).join("")}
    </div>`).join(`<div class="trade-swap" aria-hidden="true">⇄</div>`);

  // Pending trades
  const pending = a.pendingTrades.length
    ? `<div class="grid">${a.pendingTrades.map((t) => `<div class="card trade-card">
        <div class="trade-meta"><span class="badge inj">PENDING</span> <span class="muted small">Accepted ${fmtDate(t.acceptedDate)} · awaiting league review</span></div>
        <div class="trade-sides">${tradeSidesHtml(t.sides)}</div></div>`).join("")}</div>`
    : `<p class="muted">No pending trades right now.${a.signedIn || state.demo ? "" : " (ESPN only shows trades to signed-in members: add the ESPN_S2 and SWID settings in Netlify.)"}</p>`;

  // Completed moves
  const f = state.txFilter;
  const involves = (m, teamId) => m.teamId === teamId || (m.sides || []).some((s) => s.teamId === teamId);
  const moves = a.moves.filter((m) => (f.kind === "all" || m.kind === f.kind) && (f.team === "ALL" || involves(m, +f.team)));
  const kindLabel = { waiver: "Waiver", freeagent: "Free agent", trade: "Trade" };
  const row = (m) => {
    const when = `<div class="tx-when">${fmtDate(m.date)}</div>`;
    if (m.kind === "trade") {
      return `<div class="card tx tx-trade">${when}<div class="tx-main"><span class="tx-kind trade">Trade</span><div class="trade-sides">${tradeSidesHtml(m.sides)}</div></div></div>`;
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
    ${groups.length ? groups.map((g) => `<h3 class="tx-week">${weekLabel(g.week)}</h3><div class="tx-list">${g.items.map(row).join("")}</div>`).join("") : `<p class="muted">No transactions match.</p>`}`;
  $("tx-team").addEventListener("change", (e) => { f.team = e.target.value; renderTransactions(); });
  $("tx-kind").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { f.kind = b.dataset.k; renderTransactions(); }));
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
  ({ matchups: renderMatchups, live: renderLive, players: renderPlayers, managers: renderManagers, season: renderSeason, history: renderHistory, transactions: renderTransactions })[state.tab]();
}

async function loadWeek(week, force) {
  state.week = null;
  showView(null);
  setLoading(true);
  const base = state.base;
  try {
    if (force || !state.weekCache[week]?.nfl) {
      const sp = base.scoringPeriodFor(week);
      const [raw, nfl] = await Promise.all([api(["mBoxscore", "mMatchupScore", "mRoster"], sp), loadNfl(sp)]);
      if (state.base !== base) return; // league changed while loading
      state.weekCache[week] = buildWeek(raw, week, nfl);
      state.weekCache[week].nfl = nfl || {};
    }
    state.week = state.weekCache[week];
    $("week-select").value = week;
    $("prev-week").disabled = week <= 1;
    $("next-week").disabled = week >= state.base.weeks;
    banner(state.demo ? `You're viewing a <strong>demo league</strong> with made-up data. <a href="${location.pathname}">Connect your real league</a>.` : "");
  } catch (e) {
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

function showSetup(error) {
  $("tabs").hidden = true;
  showView(null);
  $("setup").hidden = false;
  $("league-input").value = state.leagueId;
  $("season-input").value = state.season;
  banner(error ? esc(error) : "");
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
    await loadLeague(wk);
  });
  $("settings-btn").addEventListener("click", () => { $("week-nav").hidden = true; showSetup(""); });
  $("setup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    await switchLeague($("league-input").value.trim(), $("season-input").value.trim());
  });
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
bindUi();
loadLeague();
