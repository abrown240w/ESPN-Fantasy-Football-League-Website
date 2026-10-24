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
  { id: "1001176763", label: "Luxa League" },
];

// ---------- Icons ----------
// Outline icons from Tabler Icons (MIT, https://tabler.io/icons), inlined so they work offline and look the
// same on every phone and computer. ic("bell") returns an <svg> sized to the text around it.
const ICONS = {
  "alert-triangle": '<path d="M12 9v4"/> <path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z"/> <path d="M12 16h.01"/>',
  "arrows-exchange": '<path d="M7 10h14l-4 -4"/> <path d="M17 14h-14l4 4"/>',
  "bell": '<path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6"/> <path d="M9 17v1a3 3 0 0 0 6 0v-1"/>',
  "broadcast": '<path d="M18.364 19.364a9 9 0 1 0 -12.728 0"/> <path d="M15.536 16.536a5 5 0 1 0 -7.072 0"/> <path d="M12 13m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/>',
  "building-stadium": '<path d="M12 12m-8 0a8 2 0 1 0 16 0a8 2 0 1 0 -16 0"/> <path d="M4 12v7c0 .94 2.51 1.785 6 2v-3h4v3c3.435 -.225 6 -1.07 6 -2v-7"/> <path d="M15 6h4v-3h-4v7"/> <path d="M7 6h4v-3h-4v7"/>',
  "calendar": '<path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12z"/> <path d="M16 3v4"/> <path d="M8 3v4"/> <path d="M4 11h16"/> <path d="M11 15h1"/> <path d="M12 15v3"/>',
  "chart-bar": '<path d="M3 13a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"/> <path d="M15 9a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"/> <path d="M9 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"/> <path d="M4 20h14"/>',
  "chevron-down": '<path d="M6 9l6 6l6 -6"/>',
  "clipboard-list": '<path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2"/> <path d="M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z"/> <path d="M9 12l.01 0"/> <path d="M13 12l2 0"/> <path d="M9 16l.01 0"/> <path d="M13 16l2 0"/>',
  "cloud": '<path d="M6.657 18c-2.572 0 -4.657 -2.007 -4.657 -4.483c0 -2.475 2.085 -4.482 4.657 -4.482c.393 -1.762 1.794 -3.2 3.675 -3.773c1.88 -.572 3.956 -.193 5.444 1c1.488 1.19 2.162 3.007 1.77 4.769h.99c1.913 0 3.464 1.56 3.464 3.486c0 1.927 -1.551 3.487 -3.465 3.487h-11.878"/>',
  "cloud-fog": '<path d="M7 16a4.6 4.4 0 0 1 0 -9a5 4.5 0 0 1 11 2h1a3.5 3.5 0 0 1 0 7h-12"/> <path d="M5 20l14 0"/>',
  "cloud-rain": '<path d="M7 18a4.6 4.4 0 0 1 0 -9a5 4.5 0 0 1 11 2h1a3.5 3.5 0 0 1 0 7"/> <path d="M11 13v2m0 3v2m4 -5v2m0 3v2"/>',
  "cloud-storm": '<path d="M7 18a4.6 4.4 0 0 1 0 -9a5 4.5 0 0 1 11 2h1a3.5 3.5 0 0 1 0 7h-1"/> <path d="M13 14l-2 4l3 0l-2 4"/>',
  "external-link": '<path d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6"/> <path d="M11 13l9 -9"/> <path d="M15 4h5v5"/>',
  "eye": '<path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0"/> <path d="M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6"/>',
  "first-aid-kit": '<path d="M8 8v-2a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v2"/> <path d="M4 8m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z"/> <path d="M10 14h4"/> <path d="M12 12v4"/>',
  "key": '<path d="M16.555 3.843l3.602 3.602a2.877 2.877 0 0 1 0 4.069l-2.643 2.643a2.877 2.877 0 0 1 -4.069 0l-.301 -.301l-6.558 6.558a2 2 0 0 1 -1.239 .578l-.175 .008h-1.172a1 1 0 0 1 -.993 -.883l-.007 -.117v-1.172a2 2 0 0 1 .467 -1.284l.119 -.13l.414 -.414h2v-2h2v-2l2.144 -2.144l-.301 -.301a2.877 2.877 0 0 1 0 -4.069l2.643 -2.643a2.877 2.877 0 0 1 4.069 0z"/> <path d="M15 9h.01"/>',
  "list-details": '<path d="M13 5h8"/> <path d="M13 9h5"/> <path d="M13 15h8"/> <path d="M13 19h5"/> <path d="M3 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"/> <path d="M3 14m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"/>',
  "list-numbers": '<path d="M11 6h9"/> <path d="M11 12h9"/> <path d="M12 18h8"/> <path d="M4 16a2 2 0 1 1 4 0c0 .591 -.5 1 -1 1.5l-3 2.5h4"/> <path d="M6 10v-6l-2 2"/>',
  "lock": '<path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z"/> <path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0"/> <path d="M8 11v-4a4 4 0 1 1 8 0v4"/>',
  "logout": '<path d="M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2"/> <path d="M9 12h12l-3 -3"/> <path d="M18 15l3 -3"/>',
  "message-circle": '<path d="M3 20l1.3 -3.9c-2.324 -3.437 -1.426 -7.872 2.1 -10.374c3.526 -2.501 8.59 -2.296 11.845 .48c3.255 2.777 3.695 7.266 1.029 10.501c-2.666 3.235 -7.615 4.215 -11.574 2.293l-4.7 1"/>',
  "news": '<path d="M16 6h3a1 1 0 0 1 1 1v11a2 2 0 0 1 -4 0v-13a1 1 0 0 0 -1 -1h-10a1 1 0 0 0 -1 1v12a3 3 0 0 0 3 3h11"/> <path d="M8 8l4 0"/> <path d="M8 12l4 0"/> <path d="M8 16l4 0"/>',
  "pencil": '<path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4"/> <path d="M13.5 6.5l4 4"/>',
  "plug-connected": '<path d="M7 12l5 5l-1.5 1.5a3.536 3.536 0 1 1 -5 -5l1.5 -1.5z"/> <path d="M17 12l-5 -5l1.5 -1.5a3.536 3.536 0 1 1 5 5l-1.5 1.5z"/> <path d="M3 21l2.5 -2.5"/> <path d="M18.5 5.5l2.5 -2.5"/> <path d="M10 11l-2 2"/> <path d="M13 14l-2 2"/>',
  "plus": '<path d="M12 5l0 14"/> <path d="M5 12l14 0"/>',
  "refresh": '<path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4"/> <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"/>',
  "scale": '<path d="M7 20l10 0"/> <path d="M6 6l6 -1l6 1"/> <path d="M12 3l0 17"/> <path d="M9 12l-3 -6l-3 6a3 3 0 0 0 6 0"/> <path d="M21 12l-3 -6l-3 6a3 3 0 0 0 6 0"/>',
  "search": '<path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"/> <path d="M21 21l-6 -6"/>',
  "snowflake": '<path d="M10 4l2 1l2 -1"/> <path d="M12 2v6.5l3 1.72"/> <path d="M17.928 6.268l.134 2.232l1.866 1.232"/> <path d="M20.66 7l-5.629 3.25l.01 3.458"/> <path d="M19.928 14.268l-1.866 1.232l-.134 2.232"/> <path d="M20.66 17l-5.629 -3.25l-2.99 1.738"/> <path d="M14 20l-2 -1l-2 1"/> <path d="M12 22v-6.5l-3 -1.72"/> <path d="M6.072 17.732l-.134 -2.232l-1.866 -1.232"/> <path d="M3.34 17l5.629 -3.25l-.01 -3.458"/> <path d="M4.072 9.732l1.866 -1.232l.134 -2.232"/> <path d="M3.34 7l5.629 3.25l2.99 -1.738"/>',
  "star": '<path d="M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873z"/>',
  "sun": '<path d="M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"/> <path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7"/>',
  "sun-high": '<path d="M14.828 14.828a4 4 0 1 0 -5.656 -5.656a4 4 0 0 0 5.656 5.656z"/> <path d="M6.343 17.657l-1.414 1.414"/> <path d="M6.343 6.343l-1.414 -1.414"/> <path d="M17.657 6.343l1.414 -1.414"/> <path d="M17.657 17.657l1.414 1.414"/> <path d="M4 12h-2"/> <path d="M12 4v-2"/> <path d="M20 12h2"/> <path d="M12 20v2"/>',
  "swords": '<path d="M21 3v5l-11 9l-4 4l-3 -3l4 -4l9 -11z"/> <path d="M5 13l6 6"/> <path d="M14.32 17.32l3.68 3.68l3 -3l-3.365 -3.365"/> <path d="M10 5.5l-2 -2.5h-5v5l3 2.5"/>',
  "trophy": '<path d="M8 21l8 0"/> <path d="M12 17l0 4"/> <path d="M7 4l10 0"/> <path d="M17 4v8a5 5 0 0 1 -10 0v-8"/> <path d="M5 9m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/> <path d="M19 9m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/>',
  "user": '<path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0"/> <path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"/>',
  "users": '<path d="M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"/> <path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"/> <path d="M16 3.13a4 4 0 0 1 0 7.75"/> <path d="M21 21v-2a4 4 0 0 0 -3 -3.85"/>',
  "wind": '<path d="M5 8h8.5a2.5 2.5 0 1 0 -2.34 -3.24"/> <path d="M3 12h15.5a2.5 2.5 0 1 1 -2.34 3.24"/> <path d="M4 16h5.5a2.5 2.5 0 1 1 -2.34 3.24"/>',
};
const ic = (name, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;

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
  tab: ({ usage: "players", injuries: "players", league: "season" })[[params.get("tab"), store.get("ffb.tab")].find((t) => ["roster", "matchups", "live", "players", "usage", "injuries", "trade", "transactions", "managers", "season", "history", "league"].includes(t))]
    || [params.get("tab"), store.get("ffb.tab")].find((t) => ["roster", "matchups", "live", "players", "trade", "transactions", "managers", "season", "history"].includes(t)) || "roster",
  base: null,
  week: null,
  weekCache: {},
  openMatchup: null,
  players: {
    mode: "avail", mine: false, q: "", pos: "ALL", sort: { key: "proj", dir: -1 }, utTeam: "", utMode: "snap",
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

async function api(views, scoringPeriodId, season = state.season, fresh = false) {
  if (state.demo) return window.DemoLeague.response(views, scoringPeriodId, season);
  const q = new URLSearchParams();
  if (fresh) q.set("fresh", Date.now()); // straight from ESPN, skipping every cache (right after a roster move)
  views.forEach((v) => q.append("view", v));
  if (scoringPeriodId) q.set("scoringPeriodId", scoringPeriodId);
  if (state.leagueId) q.set("leagueId", state.leagueId);
  if (season) q.set("season", season);
  let res, body;
  try {
    res = await fetch(`/api/espn?${q}`, fresh ? { cache: "no-store" } : undefined);
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
    return { team: PRO[g[0]] || "", home: g[1], rank, avg, date: g[2] || null };
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

// This season's fantasy points and average, and last week's points, from a player's stat list.
function seasonNums(pl, sp, season) {
  const stats = pl.stats || [];
  const tot = stats.find((x) => x.scoringPeriodId === 0 && x.statSourceId === 0 && (x.statSplitTypeId ?? 0) === 0 && (!x.seasonId || x.seasonId === Number(season)));
  const last = stats.find((x) => x.scoringPeriodId === sp - 1 && x.statSourceId === 0 && (x.statSplitTypeId ?? 1) === 1);
  return { seasonPts: tot?.appliedTotal ?? null, seasonAvg: tot?.appliedAverage ?? null, lastPts: last?.appliedTotal ?? null };
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
    locked: !!entry.playerPoolEntry?.lineupLocked,
    line: statLine(pl.defaultPositionId, act?.stats),
    short: compactLine(pl.defaultPositionId, act?.stats),
    tds: act?.stats ? TD_STATS.reduce((n, id) => n + (act.stats[id] || 0), 0) : 0, // touchdowns this week (passing TDs included)
    opp,
    pprRank: info.pprRank ?? null,
    own: pl.ownership?.percentOwned ?? info.own ?? null,
    start: pl.ownership?.percentStarted ?? info.start ?? null,
    ownChg: pl.ownership?.percentChange ?? info.ownChg ?? null,
    seasonPts: info.seasonPts ?? null, seasonAvg: info.seasonAvg ?? null, lastPts: info.lastPts ?? null,
    expertRanks: info.expertRanks || [],
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
      own: p.ownership?.percentOwned ?? null,
      start: p.ownership?.percentStarted ?? null,
      ownChg: p.ownership?.percentChange ?? null,
      ...seasonNums(p, sp, base.season),
      // Each ESPN expert's PPR rank this week (the average is pprRank above).
      expertRanks: (p.rankings?.[sp] || []).filter((r) => r.rankType === "PPR" && r.rankSourceId > 0 && r.rank > 0).map((r) => r.rank),
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
    const holder = wrap.parentElement, left = wrap.scrollLeft, top = wrap.scrollTop, y = scrollY;
    const c = cols.find((x) => x.key === key);
    if (sortState.key === key) sortState.dir *= -1;
    else { sortState.key = key; sortState.dir = c.dir || (c.num ? -1 : 1); }
    onSort();
    const next = holder?.querySelector(".table-wrap");
    if (next) { next.scrollLeft = left; next.scrollTop = top; }
    scrollTo(scrollX, y);
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
// A small NFL team logo, the way ESPN marks a player's team next to his name.
const proIc = (proId) => (PRO[proId] ? `<img class="nfl-ic" src="https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/${PRO[proId].toLowerCase()}.png&w=48&h=48&cb=1" alt="${esc(PRO[proId])}" title="${esc(NFL_NAMES?.[PRO[proId]] || PRO[proId])}" width="15" height="15" loading="lazy">` : "");
// A player's name (full on wide screens, "J. Smith" on phones) that opens his card, plus his NFL team's
// logo unless the team is already shown nearby (logo = false).
const plinkNm = (p, logo = true) => `<button type="button" class="pl-link" data-pid="${esc(p.id)}"><span class="nm-full">${esc(p.name)}</span><span class="nm-short">${esc(shortName(p.name))}</span></button>${logo && p.proId && p.posId !== 16 ? proIc(p.proId) : ""}`;

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

// Five tabs across the top. Players also holds the Injury Report; League holds Standings, the Weekly
// Snapshot, Transactions, the Trade Analyzer and History (as sub-tabs).
const TAB_GROUP = { injuries: "players", usage: "players", season: "league", managers: "league", transactions: "league", trade: "league", history: "league" };
const groupOf = (t) => TAB_GROUP[t] || t;
const homeOf = (t) => (t === "league" ? "season" : t);
const LEAGUE_SUBS = [["season", "Standings"], ["managers", "Weekly"], ["transactions", "Moves"], ["trade", "Trades"], ["history", "History"]];
function showView(name) {
  setTimeout(updateFloatHeads, 0);
  for (const v of ["roster", "matchups", "live", "players", "usage", "injuries", "trade", "transactions", "managers", "season", "history"]) $(`view-${v}`).hidden = v !== name;
  // Computers have League's sub-tabs in the main row instead of a League tab.
  const desk = DESK.matches;
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", b.classList.contains("desk-tab") ? b.dataset.tab === name : b.dataset.tab === groupOf(name)));
  const ln = $("league-nav");
  ln.hidden = desk || groupOf(name) !== "league";
  document.body.classList.toggle("in-league", !desk && groupOf(name) === "league");
  if (!ln.hidden) ln.innerHTML = LEAGUE_SUBS.map(([k, l]) => `<button type="button" data-sub="${k}" class="${k === name ? "active" : ""}">${l}</button>`).join("");
  paintLiveDot();
}
// The dot by "Live": red while an NFL game is being played, grey otherwise.
function paintLiveDot() {
  const d = $("live-dot");
  if (!d) return;
  const on = !!(state.live?.games?.some((g) => g.state === "in") || state.gameStatus?.anyLive);
  d.classList.toggle("on", on);
  d.title = on ? "Games are being played" : "No games right now";
}

// ---------- Matchups ----------
function renderMatchups() {
  const w = state.week, el = $("view-matchups");
  if (!w.matchups.length) { el.innerHTML = `<p class="muted">No matchups scheduled for week ${w.week}.</p>`; return; }
  const label = w.status === "final" ? "Final scores" : w.status === "live" ? "Live scores · win chance from ESPN" : "Projected · win chance from ESPN";
  // Every matchup as a small tile up top (phones: a grid; desktop: a column on the left); the selected
  // one fills the rest of the screen. Starts on your own matchup.
  const mine = w.matchups.find((m) => [m.home?.teamId, m.away?.teamId].map(String).includes(String(myTeamId())));
  const split = MU_SPLIT.matches;
  // Phones can also be on the league summary ("league"); otherwise default to your own matchup.
  if (!(state.openMatchup === "league" && !split) && !w.matchups.some((m) => m.id === state.openMatchup && m.away)) state.openMatchup = (mine?.away ? mine : w.matchups.find((m) => m.away))?.id ?? null;
  if (!split) return renderMatchupsPhone(el, label);
  const sel = w.matchups.find((m) => m.id === state.openMatchup);
  el.innerHTML = `<div class="section-head"><h2>Week ${w.week} matchups ${statusBadge(w.status)}</h2><span class="muted small hide-phone">${label}</span></div>
    <div class="${split ? "mu-split" : "mu-stack"}">
      <div class="${split ? "mu-list mu-cards" : "mt-grid"}">${split ? leagueCards() : w.matchups.map(matchupTile).join("")}</div>
      <div class="${split ? "mu-pane" : "mu-detail"}" id="mu-pane">${sel ? matchupDetail(sel, true) : `<p class="muted">Pick a matchup.</p>`}</div>
      <aside class="card mu-feed" id="mu-feed">${sel ? scoringFeed(sel) : ""}</aside>
    </div>
    <p class="muted small show-phone mu-note">${label}</p>`;
  fitNames(el);
  el.querySelectorAll(".mini-tile[data-mu], .lg-card[data-mb]").forEach((c) => c.addEventListener("click", () => {
    const m = w.matchups.find((x) => x.id === +(c.dataset.mu || c.dataset.mb));
    if (!m?.away || state.openMatchup === m.id) return;
    state.openMatchup = m.id;
    el.querySelectorAll(".mini-tile[data-mu], .lg-card[data-mb]").forEach((b) => b.classList.toggle("selected", b === c));
    const pane = $("mu-pane");
    pane.innerHTML = matchupDetail(m, true);
    $("mu-feed").innerHTML = scoringFeed(m);
    pane.scrollTop = 0;
    pane.classList.remove("swap");
    void pane.offsetWidth; // restart the fade
    pane.classList.add("swap");
    fitNames(pane);
    updateStickies();
  }));
  updateStickies();
}
// ---------- Matchups on phones (laid out like the ESPN app) ----------
// A bar of every game that slides sideways (League Scores first), and under it either the league
// summary (all matchups as stacked cards) or one matchup. Swipe the matchup header to go to the next game.
const shortOwner = (n = "") => { const p = String(n).trim().split(/\s+/); return p.length > 1 ? `${p[0][0]}. ${p.slice(1).join(" ")}` : n; };
function streakHtml(id) {
  const r = state.base.raw.teams?.find((t) => String(t.id) === String(id))?.record?.overall;
  if (!r?.streakLength || !r.streakType) return "";
  const k = r.streakType === "WIN" ? "W" : r.streakType === "LOSS" ? "L" : "T";
  return ` <span class="${k === "W" ? "pos" : k === "L" ? "neg" : ""}">(${k}${r.streakLength})</span>`;
}
// Swipe (and game bar) order: your game first, then the rest in order, and League Scores always last.
const muOrder = () => {
  const ids = state.week.matchups.filter((m) => m.away).map((m) => m.id), me = String(myTeamId() || "");
  const i = Math.max(0, state.week.matchups.filter((m) => m.away).findIndex((m) => [m.home.teamId, m.away.teamId].map(String).includes(me)));
  return [...ids.slice(i), ...ids.slice(0, i), "league"];
};
function renderMatchupsPhone(el, label) {
  const w = state.week, st = w.status, cur = state.openMatchup;
  const val = (sd) => (st === "upcoming" ? f1(sd.proj) : f2(sd.score));
  const games = w.matchups.filter((m) => m.away);
  const chip = (m) => (m.id === cur
    ? `<button type="button" class="mb-chip on" data-mb="${m.id}">${logoImg(team(m.home.teamId), 22)}<span class="vs">vs</span>${logoImg(team(m.away.teamId), 22)}</button>`
    : `<button type="button" class="mb-chip" data-mb="${m.id}">${logoImg(team(m.home.teamId), 20)}<b>${val(m.home)}</b><span class="vs">vs</span><b>${val(m.away)}</b>${logoImg(team(m.away.teamId), 20)}</button>`);
  const bar = `<div class="mu-bar" id="mu-bar">${muOrder().map((id) => (id === "league" ? `<button type="button" class="mb-chip lg ${cur === "league" ? "on" : ""}" data-mb="league">${ic("calendar")} League scores</button>` : chip(games.find((m) => m.id === id)))).join("")}</div>`;
  const sel = games.find((m) => m.id === cur);
  el.innerHTML = `${bar}<div class="mu-detail" id="mu-body">${sel ? matchupDetail(sel, true) : leagueSummary()}</div>
    <p class="muted small mu-note">${label}</p>`;
  el.querySelectorAll("[data-mb]").forEach((b) => b.addEventListener("click", () => {
    const id = b.dataset.mb === "league" ? "league" : +b.dataset.mb;
    if (id !== state.openMatchup) pickMatchup(id, muOrder().indexOf(id) > muOrder().indexOf(state.openMatchup) ? 1 : -1);
  }));
  // Keep the chosen chip in view (gliding there after a change).
  const bx = $("mu-bar"), on = bx.querySelector(".on");
  if (state.muBarSmooth) bx.scrollLeft = state.muBarPrev ?? 0;
  if (on) bx.scrollTo({ left: Math.max(0, on.offsetLeft - (bx.clientWidth - on.offsetWidth) / 2), behavior: state.muBarSmooth ? "smooth" : "auto" });
  state.muBarSmooth = false;
  fitNames(el);
  updateStickies();
  preloadMatchups();
}
// Team names stay on one line: shrink the text until it fits (down to a floor), then trim with "…".
function fitNames(root) {
  requestAnimationFrame(() => root.querySelectorAll(".mx-team-id strong, .lg-id strong, .er-pick strong, .er-id > strong").forEach((n) => {
    n.style.fontSize = "";
    let size = parseFloat(getComputedStyle(n).fontSize);
    const floor = size * 0.72;
    while (n.scrollWidth > n.clientWidth + 1 && size > floor) { size -= 0.5; n.style.fontSize = `${size}px`; }
  }));
}
addEventListener("resize", () => { if (state.tab === "matchups") fitNames($("view-matchups")); });
// The stacked cards on their own (the Matchup list on computers), the open game highlighted.
function leagueCards() {
  const html = leagueSummary().replace(/^[\s\S]*?<div class="lg-list">/, "").replace(/<\/div>\s*$/, "");
  return html.replace(new RegExp(`class="lg-card ([^"]*)" data-mb="${state.openMatchup}"`), `class="lg-card $1 selected" data-mb="${state.openMatchup}"`);
}
// All matchups as stacked cards; tap one to open it.
function leagueSummary() {
  const w = state.week, st = w.status, me = String(myTeamId());
  const row = (sd, lead) => {
    const t = team(sd.teamId);
    return `<div class="lg-row ${lead === false ? "trail" : ""}">${logoImg(t, 40)}<div class="lg-id"><strong>${esc(t.name)}</strong><span>${esc(shortOwner(t.owner))} <i>|</i> ${recordStr(t)}${streakHtml(sd.teamId)}</span></div>
      <div class="lg-pts"><strong>${st === "upcoming" ? f1(sd.proj) : f2(sd.score)}</strong><small>${st === "upcoming" ? "proj" : f1(st === "live" ? sd.liveProj : sd.proj)}</small></div></div>`;
  };
  const cards = w.matchups.map((m) => {
    if (!m.away) return `<div class="lg-card bye">${row(m.home, null)}<div class="muted small lg-bye">Bye</div></div>`;
    const lead = st === "upcoming" || m.home.score === m.away.score ? null : m.home.score > m.away.score;
    const mine = [m.home.teamId, m.away.teamId].map(String).includes(me);
    return `<button type="button" class="lg-card ${mine ? "mine" : ""}" data-mb="${m.id}">${row(m.home, lead == null ? null : lead)}${row(m.away, lead == null ? null : !lead)}</button>`;
  }).join("");
  return `<div class="mu-swipe mu-lghead"><strong>Week ${w.week} scoreboard</strong> ${statusBadge(w.status)}</div><div class="lg-list">${cards}</div>`;
}
// Open a game (or the league summary) and slide it in from the side it came from.
function pickMatchup(id, dir) {
  state.muBarPrev = $("mu-bar")?.scrollLeft ?? 0;
  state.muBarSmooth = true;
  state.openMatchup = id;
  renderMatchups();
  const body = $("mu-body");
  if (body && dir) { body.classList.remove("slide-left", "slide-right"); void body.offsetWidth; body.classList.add(dir > 0 ? "slide-left" : "slide-right"); }
  const bar = $("mu-bar"), top = document.querySelector(".topbar")?.getBoundingClientRect().height || 0;
  if (bar && bar.getBoundingClientRect().top < top) window.scrollTo({ top: scrollY + bar.getBoundingClientRect().top - top - 8 });
}
const muHtml = (id) => { const m = state.week.matchups.find((x) => x.id === id); return id === "league" ? leagueSummary() : m ? matchupDetail(m, true) : ""; };
function muNeighbor(dir) {
  const o = muOrder(), i = Math.max(0, o.indexOf(state.openMatchup));
  return o[(i + dir + o.length) % o.length];
}
const muCached = (id) => { const c = state.muPre?.[id]; return c && c.week === state.week && Date.now() - c.at < 20e3 ? c.html : muHtml(id); };
function preloadMatchups() {
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
  idle(() => {
    if (state.tab !== "matchups" || !state.week || MU_SPLIT.matches) return;
    state.muPre = {};
    for (const d of [1, -1]) { const id = muNeighbor(d); state.muPre[id] = { html: muHtml(id), at: Date.now(), week: state.week }; }
  });
}
function stepMatchup(dir) {
  const order = muOrder(), i = Math.max(0, order.indexOf(state.openMatchup));
  pickMatchup(order[(i + dir + order.length) % order.length], dir);
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

// ---------- Long tables scroll with the page ----------
// Player tables are no longer a box you scroll inside: the page scrolls, and while a table's header row
// is out of view a copy of it floats under the top bar (lined up with the columns, following sideways
// scrolling, and clickable to sort). Wide tables still scroll sideways on their own.
const floatHeads = new Map(); // table frame -> { el, thead, sig, src, dst }
let floatRaf = 0;
function updateFloatHeads() {
  cancelAnimationFrame(floatRaf);
  floatRaf = requestAnimationFrame(() => {
    const topH = document.querySelector(".topbar")?.getBoundingClientRect().height || 0;
    const wraps = [...document.querySelectorAll("main .view:not([hidden]) .table-wrap")].filter((w) => w.querySelector(":scope > table.pt-table > thead"));
    for (const [w, f] of floatHeads) if (!wraps.includes(w) || !w.isConnected) { f.el.remove(); floatHeads.delete(w); }
    for (const w of wraps) {
      const table = w.querySelector(":scope > table"), thead = table.tHead, r = w.getBoundingClientRect(), hh = thead.getBoundingClientRect().height;
      let f = floatHeads.get(w);
      if (!(r.top < topH && r.bottom > topH + hh + 12)) { if (f) f.el.hidden = true; continue; }
      const sig = `${table.offsetWidth}:${w.clientWidth}:${thead.textContent}`;
      if (!f || f.thead !== thead || f.sig !== sig) {
        f?.el.remove();
        const el = document.createElement("div");
        el.className = "float-head";
        const t = table.cloneNode(false), h = thead.cloneNode(true);
        t.style.width = `${table.offsetWidth}px`;
        t.style.tableLayout = "fixed";
        t.appendChild(h);
        el.appendChild(t);
        document.body.appendChild(el);
        const src = [...thead.querySelectorAll("th")], dst = [...h.querySelectorAll("th")];
        dst.forEach((th, i) => { th.style.width = `${src[i].getBoundingClientRect().width}px`; th.style.top = "auto"; });
        el.addEventListener("click", (e) => { const th = e.target.closest("th"); if (th) src[dst.indexOf(th)]?.click(); });
        f = { el, thead, sig };
        floatHeads.set(w, f);
      }
      f.el.hidden = false;
      Object.assign(f.el.style, { top: `${topH}px`, left: `${r.left + w.clientLeft}px`, width: `${w.clientWidth}px` });
      f.el.scrollLeft = w.scrollLeft;
    }
  });
}
addEventListener("scroll", updateFloatHeads, { passive: true, capture: true }); // capture: tables' own sideways scrolling too
addEventListener("resize", updateFloatHeads);

// Computers (1000px and wider): player cards and chat dock on the right, sidebars on Players and League,
// a side rail on Roster and Live. Phones keep their own layout. Redraw when crossing the line.
const DESK = matchMedia("(min-width: 1000px)");
DESK.addEventListener?.("change", () => { if (state.week) render(); if (state.base) renderLeagueSelect(); });
// Three columns on Live (games | the game | your players) need 1300px; below that it's two.
const WIDE = matchMedia("(min-width: 1300px)");
WIDE.addEventListener?.("change", () => { if (state.week && state.tab === "live") render(); });
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
// Computers, Matchup tab: every score this week by a starter in the selected matchup (touchdowns, the
// passes that threw them, field goals and extra points, D/ST returns and safeties), newest first.
const feedName = (s) => ` ${String(s).toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "").replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim()} `;
function scoringFeed(m) {
  if (!m?.away) return "";
  const gs = ensureGameStatus()?.byPro || {}, sides = [[m.home, team(m.home.teamId)], [m.away, team(m.away.teamId)]];
  const games = new Map(); // game id -> { g, starters: [{ p, t }] }
  for (const [s, t] of sides) for (const p of s.starters) {
    const g = gs[p.proId];
    if (!g || g.state === "pre") continue;
    if (!games.has(g.id)) games.set(g.id, { g, starters: [] });
    games.get(g.id).starters.push({ p, t });
  }
  const head = `<h3>Scoring feed</h3>`;
  if (!games.size) return `${head}<p class="muted small">No starters have played yet this week.</p>`;
  const plays = [];
  let loading = false;
  for (const { g, starters } of games.values()) {
    ensureBox(g, () => { if (state.tab === "matchups" && state.openMatchup === m.id && $("mu-feed")) $("mu-feed").innerHTML = scoringFeed(m); });
    const d = state.boxes?.[g.id];
    if (!d || d === "loading") { loading = true; continue; }
    (d.scoring || []).forEach((pl, i) => {
      const txt = feedName(pl.text);
      for (const { p, t } of starters) {
        if (p.proId !== pl.proId) continue;
        let role = "";
        if (p.posId === 16) role = pl.type === "SF" || /interception|fumble|return|blocked|safety/i.test(pl.kind) ? "D/ST score" : "";
        else {
          const nm = feedName(p.name);
          if (!txt.includes(nm)) continue;
          role = txt.startsWith(nm) ? (pl.type === "FG" ? "Field goal" : "Touchdown") : txt.includes(` from${nm}`) || txt.includes(` pass${nm}`) ? "TD pass" : txt.includes(`${nm}kick `) ? "Extra point" : "Two-point try";
        }
        if (!role) continue;
        const [mm, ss] = (pl.clock || "0:00").split(":").map(Number);
        // Roughly when it happened: kickoff plus game time (a quarter takes about 45 real minutes).
        const at = Date.parse(g.date) + ((pl.period - 1) * 15 + (15 - (mm || 0) - (ss || 0) / 60)) * 3 * 60e3;
        plays.push({ pl, p, t, role, at, i, g });
      }
    });
  }
  // One entry per play, listing every starter in it (a QB and his receiver can both be starting).
  const byPlay = new Map();
  for (const x of plays) {
    const k = `${x.g.id}:${x.pl.id || x.i}`;
    if (!byPlay.has(k)) byPlay.set(k, { ...x, who: [] });
    byPlay.get(k).who.push(x);
  }
  const items = [...byPlay.values()].sort((a, b) => b.at - a.at || b.i - a.i);
  if (!plays.length) return `${head}${loading ? `<div class="loading small"><span class="spinner"></span> Loading scoring plays…</div>` : `<p class="muted small">No scores by these starters yet.</p>`}`;
  const q = (n) => (n > 4 ? "OT" : `Q${n}`);
  const kind = (pl) => (pl.type === "FG" ? "Field goal" : pl.type === "SF" ? "Safety" : pl.type === "TD" ? "Touchdown" : pl.kind || "Score");
  return `${head}<div class="mf-list">${items.map(({ pl, g, who }) => {
    const score = pl.away != null && pl.home != null ? ` ${g.home ? `${pl.home}-${pl.away}` : `${pl.away}-${pl.home}`}` : "";
    return `<div class="mf-item ${who.some((x) => myRow(x.t.id)) ? "my-row" : ""}">
      <div class="mf-top"><span class="mf-role ${pl.type === "TD" ? "td" : ""}">${esc(kind(pl))}</span><span class="mf-when muted">${q(pl.period)} ${esc(pl.clock)} · ${esc(pl.team)} ${g.home ? "vs" : "@"} ${esc(g.oppAbbr || "")}${score}</span></div>
      ${who.map(({ p, t, role }) => `<div class="mf-who">${logoImg(t, 18)}${plinkNm(p)}<span class="mf-tag">${esc(role)}</span></div>`).join("")}
      <div class="mf-text small muted">${esc(pl.text)}</div></div>`;
  }).join("")}</div>`;
}

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
        <div class="mx-stats" ${p.short ? `title="${esc(p.line)}"` : ""}>${p.short ? esc(p.short) : "&nbsp;"}</div>
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
      <div class="mx-team-id"><strong>${esc(t.name)}</strong><span class="muted small">${esc(t.owner)} · ${recordStr(t)}${streakHtml(t.id)}</span></div>
      <div class="mx-total">${st === "upcoming" ? f1(s.proj) : f2(s.score)}<small>${st === "upcoming" ? "projected" : `proj ${f1(st === "live" ? s.liveProj : s.proj)}`}</small></div>
    </div>`;
  const wpBar = (v, color, right) => `<div class="mx-wp ${right ? "right" : ""}"><span class="mx-wp-pct">${pct(v)}</span><div class="mx-wp-track"><div style="width:${v * 100}%;background:${color}"></div></div></div>`;

  return `<div class="card detail mx ${withHead ? "" : "attached"}">
    ${withHead ? `<div class="mx-top"><div class="mx-head">${headSide(home, H, false)}${headSide(away, A, true)}</div>
    <div class="mx-wps">${wpBar(wpH, "var(--home)", false)}<span class="mx-tds" title="Touchdowns by each team's starters this week (passing TDs count)"><b>${sum(home.starters, (p) => p.tds || 0)}</b><span>TD</span><b>${sum(away.starters, (p) => p.tds || 0)}</b></span>${wpBar(wpA, "var(--away)", true)}</div>
    ${st === "live" ? onFieldLine(m) : ""}</div>
    ${stickBar(`<span class="sb-team">${logoImg(H, 18)}${esc(H.abbrev)}</span><strong>${st === "upcoming" ? f1(home.proj) : f2(home.score)}</strong><span class="sb-mid">${st === "final" ? "Final" : `${pct(wpH)}–${pct(wpA)}`}</span><strong>${st === "upcoming" ? f1(away.proj) : f2(away.score)}</strong><span class="sb-team">${esc(A.abbrev)}${logoImg(A, 18)}</span>`)}` : ""}
    <div class="mx-rows">${rows.map((r) => row(r, false)).join("")}</div>
    ${bn ? `<div class="mx-bench-head">Bench</div><div class="mx-rows">${benchRows.map((r) => row(r, true)).join("")}</div>` : ""}
  </div>`;
}

// ---------- Players ----------
// Available players by default (free agents and waivers together), or everyone with "All players".
// "My team" slots your own players into the available list for easy comparison.
function renderPlayers() {
  ensureValues(); // trade values fill in when they arrive
  ensureUsage(); // snap counts and targets fill in when they arrive
  ensureGameStatus(); // game lines and live highlighting
  const el = $("view-players"), f = state.players, w = state.week;
  f.mode ||= "avail";
  f.sort ||= { key: "proj", dir: -1 };
  const d = faData();
  if (!d) { el.innerHTML = `<div class="loading"><span class="spinner"></span> Loading players…</div>`; return; }
  if (d.error) { el.innerHTML = `<div class="banner">${esc(d.error)}</div>`; return; }
  const rostered = w.sides.flatMap((x) => x.players).map(rosteredRow);
  const onRoster = new Set(rostered.map((p) => String(p.id)));
  const avail = d.players.filter((p) => !onRoster.has(String(p.id))).map((p) => faRow(p, w));
  const me = String(myTeamId() || "");
  const W = ensureWatch();
  const pool = f.watch && W ? [...rostered, ...avail].filter((p) => W.has(String(p.id)))
    : f.mode === "all" ? [...rostered, ...avail]
    : f.mine && me ? [...avail, ...rostered.filter((p) => String(p.teamId) === me)] : avail;
  // Computers: the injury report is part of the table (its columns, and All / Injured / Healthy buttons).
  const desk = DESK.matches, D = desk ? ensureInjuries() : null;
  f.inj ||= "all";
  const K = D && !D.error ? injuryKit(D, w) : null, injMemo = new Map();
  const injOf = (p) => {
    const id = String(p.id);
    if (!K?.byId.has(id)) return null;
    if (!injMemo.has(id)) injMemo.set(id, K.enrich(K.byId.get(id)));
    return injMemo.get(id);
  };
  const hurt = (p) => (K ? K.byId.has(String(p.id)) : false) || (!!p.injury && !/^(ACTIVE|NORMAL)$/i.test(p.injury));
  const injCols = K ? K.cols.slice(1).map((c) => ({ ...c, key: `inj_${c.key}`,
    sort: (r) => { const x = injOf(r); return x ? (c.sort ? c.sort(x) : x[c.key]) : null; },
    render: (r) => { const x = injOf(r); return x ? (c.render ? c.render(x) : esc(x[c.key])) : `<span class="muted">–</span>`; } })) : [];
  // Search and NFL team on one line; Available / All / watch list / injuries; then the positions.
  el.innerHTML = `<div class="pl-top"><div class="filters pl-search"><input id="pl-q" type="search" placeholder="Search players…" value="${esc(f.q)}">
      <select id="pl-nfl" aria-label="NFL team"><option value="ALL">All teams</option>${Object.keys(NFL_NAMES).sort((a, b) => NFL_NAMES[a].localeCompare(NFL_NAMES[b])).map((t) => `<option value="${t}" ${f.nfl === t ? "selected" : ""}>${esc(NFL_NAMES[t].split(" ").pop())}</option>`).join("")}</select></div>
    ${playersNav(f.mode, me && !DESK.matches ? { on: !!f.mine && f.mode !== "all", off: f.mode === "all" } : null)}
    <div class="filters pl-filters">
      ${posSeg("pl-pos", f.pos, true)}
      ${desk ? `<div class="seg" id="pl-inj" role="group" aria-label="Injuries">${[["all", "All"], ["injured", "Injured"], ["healthy", "Healthy"]].map(([k, l]) => `<button type="button" data-i="${k}" class="${f.inj === k ? "active" : ""}">${l}</button>`).join("")}</div>` : ""}
    </div>
    ${me && DESK.matches ? `<label class="pl-mine ${f.mode === "all" ? "off" : ""}"><input type="checkbox" id="pl-mine" ${f.mine ? "checked" : ""} ${f.mode === "all" ? "disabled" : ""}> Include my team</label>` : ""}</div>
    <div class="pl-main"><div id="pl-list"></div>${fcCredit()}${nvCredit()}</div>`;
  const draw = () => {
    const q = f.q.toLowerCase();
    const inj = desk ? f.inj : "all";
    const rows = pool.filter((p) => posMatch(p.pos, f.pos) && (!f.nfl || f.nfl === "ALL" || PRO[p.proId] === f.nfl) && (!q || p.name.toLowerCase().includes(q))
      && (inj === "all" || (inj === "injured") === hurt(p)));
    if (inj === "healthy" && f.sort.key.startsWith("inj_")) f.sort = { key: "proj", dir: -1 };
    drawPlayerTable($("pl-list"), ["player", ...(actTeam() ? ["act"] : []), ...(W ? ["watch"] : []), "pos", "opp", "proj", "pts", "ppg", "seasonPts", "own", "snap", "tgt", "rush", "rz", "pprRank", "posRank", "value", ...(inj === "healthy" ? [] : injCols)], rows, f.sort, w.sp,
      desk && inj !== "all" && !D ? "Loading the injury report…" : "No players match those filters.");
  };
  $("pl-q").addEventListener("input", (e) => { f.q = e.target.value; draw(); });
  $("pl-nfl").addEventListener("change", (e) => { f.nfl = e.target.value; draw(); });
  bindPosSeg("pl-pos", (v) => (f.pos = v), draw);
  $("pl-inj")?.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    f.inj = b.dataset.i;
    $("pl-inj").querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
    draw();
  }));
  $("pl-mine")?.addEventListener("change", (e) => { f.mine = e.target.checked; renderPlayers(); });
  draw();
}

// ---------- Watch list (your ESPN watch list, owner only) ----------
const watchTeam = () => (state.demo ? ensureOwner()?.teams?.[0] : ownerTeam());
function ensureWatch() {
  if (!watchTeam()) return null;
  const k = ownerKey(), c = state.watch;
  if (c?.key === k) return c.ids;
  if (state.demo) { state.watch = { key: k, ids: new Set() }; return state.watch.ids; }
  if (c?.loading !== k) {
    state.watch = { loading: k };
    fetch(`/api/roster/watchlist?${new URLSearchParams({ leagueId: String(state.base.raw?.id || state.leagueId || ""), season: state.base.season })}`)
      .then((r) => r.json()).then((d) => { state.watch = { key: k, ids: new Set((d.watchList || []).map(String)) }; })
      .catch(() => { state.watch = { key: k, ids: new Set() }; })
      .finally(() => { if (state.tab === "players") renderPlayers(); });
  }
  return null;
}
// How many on the list are available (not on anyone's roster), and how many there are in all.
function watchCounts() {
  const ids = ensureWatch();
  if (!ids) return null;
  const owned = new Set((state.week?.sides || []).flatMap((s) => s.players.map((p) => String(p.id))));
  return { avail: [...ids].filter((id) => !owned.has(id)).length, total: ids.size };
}
async function toggleWatch(id, on) {
  const ids = ensureWatch();
  if (!ids) return;
  id = String(id);
  on ? ids.add(id) : ids.delete(id);
  for (const b of document.querySelectorAll(`input[data-watch="${CSS.escape(id)}"]`)) b.checked = on;
  paintWatchCount();
  if (state.players.watch && state.tab === "players") renderPlayers();
  if (state.demo) return;
  try { await sendMove("watch", { teamId: Number(watchTeam()), playerId: Number(id), on }); }
  catch (err) {
    on ? ids.delete(id) : ids.add(id);
    for (const b of document.querySelectorAll(`input[data-watch="${CSS.escape(id)}"]`)) b.checked = !on;
    paintWatchCount();
    alert(err.message);
  }
}
document.addEventListener("change", (e) => { const b = e.target.closest("input[data-watch]"); if (b) toggleWatch(b.dataset.watch, b.checked); });
const watchBox = (id, label = "") => {
  const ids = ensureWatch();
  return ids ? `<label class="watch-box" title="Watch list"><input type="checkbox" data-watch="${esc(id)}" ${ids.has(String(id)) ? "checked" : ""}>${label}</label>` : "";
};
function paintWatchCount() {
  const c = watchCounts(), el = document.querySelector("[data-watchf] b");
  if (el && c) el.textContent = `${c.avail}/${c.total}`;
}

// The row at the top of Players and the Injury Report: Available | All players, and the Injury Report.
// Players: Available | All, then the watch list and (phones) the Injury Report as their own buttons, then
// (phones) a My team toggle that adds your own roster to the Available list.
const playersNav = (cur, mine) => {
  const c = watchCounts(), inj = !DESK.matches;
  return `<div class="pl-nav"><div class="seg pl-seg">${[["avail", "Available"], ["all", `<span class="nm-full">All players</span><span class="nm-short">All</span>`]].map(([k, l]) => `<button type="button" data-plm="${k}" class="${cur === k && !state.players.watch ? "active" : ""}">${l}</button>`).join("")}</div>
  ${c || inj ? `<div class="pl-tools">${c ? `<button type="button" data-watchf class="pl-tool ${state.players.watch ? "active" : ""}" title="Your watch list: available / total">${ic("eye")} <b>${c.avail}/${c.total}</b></button>` : ""}${inj ? `<button type="button" data-injr class="pl-tool" title="Injury Report" aria-label="Injury Report">${ic("first-aid-kit")}</button>` : ""}</div>` : ""}
  ${mine ? `<button type="button" data-plmine class="pl-tool pl-mine-btn ${mine.on ? "active" : ""}" aria-pressed="${mine.on}" ${mine.off ? "disabled" : ""} title="Include your own team's players">${ic("user")} My team</button>` : ""}</div>`;
};
document.addEventListener("click", (e) => {
  const m = e.target.closest(".pl-nav [data-plm]"), inj = e.target.closest(".pl-nav [data-injr]");
  const wf = e.target.closest(".pl-nav [data-watchf]"), mb = e.target.closest(".pl-nav [data-plmine]");
  if (mb) { state.players.mine = !state.players.mine; renderPlayers(); return; }
  if (wf) { state.players.watch = !state.players.watch; renderPlayers(); return; }
  if (m) { state.players.mode = m.dataset.plm; state.players.watch = false; if (state.tab === "players") renderPlayers(); else switchTab("players"); }
  else if (inj) openInjuryReport();
});

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
    <tbody>${rows.map(({ p, opps, avg, byeWk }) => `<tr><td class="pt-player"><div class="pt-name">${plinkNm(p)} <span class="muted small">${esc(p.pos)}</span></div></td>${opps.map((o) => `<td>${cell(o)}</td>`).join("")}<td class="num">${avg == null ? "–" : f1(avg)}</td><td>${byeWk ? `<span class="neg"><strong>${ic("alert-triangle")} Bye wk ${byeWk}</strong></span>` : grade(avg)}</td></tr>`).join("")}</tbody></table></div>`;
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
// Unread news: per device, the newest update you've seen for each player. Anything newer (from the
// last 3 days, so a fresh device isn't flooded) counts as unread.
const NEWS_FRESH_MS = 3 * 864e5;
const seenNews = () => { try { return JSON.parse(store.get("ffb.newsSeen") || "{}"); } catch { return {}; } };
const unreadNews = (pid, items = []) => {
  const since = Math.max(seenNews()[pid] || 0, Date.now() - NEWS_FRESH_MS);
  return items.filter((n) => Date.parse(n.published) > since);
};
function markNewsRead(pid, items = []) {
  const newest = Math.max(0, ...items.map((n) => Date.parse(n.published) || 0));
  const seen = seenNews();
  if (!newest || (seen[pid] || 0) >= newest) return;
  seen[pid] = newest;
  for (const [k, v] of Object.entries(seen)) if (Date.now() - v > 30 * 864e5) delete seen[k]; // keep it small
  store.set("ffb.newsSeen", JSON.stringify(seen));
  state.newsReadChanged = true;
}
// Small red newspaper next to a name on the Roster tab: opens the player card.
const newsDot = (p) => `<button type="button" class="pl-link news-dot" data-pid="${esc(p.id)}" title="Unread news" aria-label="Unread news for ${esc(p.name)}"><svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M3 4h11v11a2 2 0 0 0 2 2H5a2 2 0 0 1-2-2V4zm12 3h2v8a1 1 0 0 1-2 0V7zM5 6v3h4V6H5zm5 0v1h3V6h-3zm0 2v1h3V8h-3zm-5 3v1h8v-1H5zm0 2v1h8v-1H5z"/></svg></button>`;
const newsCredit = () => `<p class="fc-credit small muted">Data: ESPN · RotoWire</p>`;
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
function lineupCheck(side, w, editable = false) {
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
  // Every change needed to get from the current lineup to the best one (for "Set best lineup").
  const bestSlot = new Map(best.lineup.map((x) => [String(x.p.id), x.slot]));
  const toBest = pool.map((p) => [p, bestSlot.get(String(p.id)) ?? BENCH]).filter(([p, to]) => to !== p.slotId);
  state.lcMoves = editable ? toBest : null;
  const ins = best.lineup.map((x) => x.p).filter((p) => !p.starter).sort((a, b) => val(b) - val(a));
  const outs = current.filter((p) => !bestIds.has(p.id)).sort((a, b) => val(a) - val(b));
  const why = (p) => (p.opp?.bye ? "on bye" : WONT_PLAY.test(p.injury || "") ? injuryInfo(p.injury)[1].toLowerCase() : "");
  const nm = (p) => `${plinkNm(p)}${injBadge(p)}`;
  const items = [];
  if (gain >= 0.5) {
    ins.forEach((p, i) => {
      const o = outs[i];
      if (!o) return;
      const btn = editable && canSwap(p, o) ? `<button type="button" class="lc-do" data-swap="${esc(p.id)},${esc(o.id)}">Swap</button>` : "";
      items.push(`<div class="lc-item lc-swap"><span class="lc-ico">⇅</span><span>Start ${nm(p)} <span class="muted small">${f1(p.proj)}</span> over ${nm(o)} <span class="muted small">${why(o) || f1(o.proj)}</span></span><strong class="pos">+${f1(val(p) - val(o))}</strong>${btn}</div>`);
    });
  }
  // Starters who won't play but have no better replacement on the roster still get a warning.
  for (const p of side.starters) {
    if (!locked(p) && out(p) && !outs.includes(p)) items.push(`<div class="lc-item lc-warn"><span class="lc-ico">${ic("alert-triangle")}</span><span>${nm(p)} is ${why(p)}. No bench player can fill in, so check free agents.</span>${editable ? `<button type="button" class="lc-do upg-btn" data-pid="${esc(p.id)}">Find one</button>` : ""}</div>`);
  }
  for (const p of side.starters) {
    if (!locked(p) && !out(p) && !outs.includes(p) && /QUESTIONABLE|DOUBTFUL/.test(p.injury || "")) items.push(`<div class="lc-item lc-note"><span class="lc-ico">⏳</span><span>${nm(p)} is ${injuryInfo(p.injury)[1].toLowerCase()}. Check the status before kickoff.</span></div>`);
  }
  if (!items.length) return LINEUP_OK; // shown as a green check next to "Starters"
  // One line until tapped; the moves slide open underneath. "Set best lineup" works either way.
  const open = !!state.lcOpen;
  return `<div class="card lc ${open ? "open" : ""}"><div class="lc-head" data-lc-toggle role="button" tabindex="0" aria-expanded="${open}">
      <span class="caret lc-caret">▸</span><strong>Lineup check</strong>${gain >= 0.5 ? ` <span class="muted small lc-sum"><span class="hide-phone">Best lineup projects </span><strong class="pos">+${f1(gain)}</strong> pts</span>` : ` <span class="muted small lc-sum">${items.length} note${items.length > 1 ? "s" : ""}</span>`}
      ${editable && gain >= 0.5 && toBest.length ? `<button type="button" class="lc-do lc-best" data-best>Set best lineup</button>` : ""}</div>
    <div class="collapse ${open ? "open" : ""}" ${open ? "" : "inert"}><div class="collapse-inner">${items.join("")}</div></div></div>`;
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
      .finally(() => { if (state.base === base && ["players", "roster", "usage", "transactions"].includes(state.tab)) render(); });
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
// Roster rows: "@DET 32nd" on one line and "Sun 3:25 PM ☀️" (or the live clock / Final) under it.
function gameLines(p) {
  const g = gameStatusOf(p), chip = p.opp?.rank ? ` ${oprkChip(p)}` : "";
  const wx = wxChip(p.proId, g?.state, true);
  const kick = (d) => new Date(d).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
  if (g?.oppAbbr) {
    const opp = `${g.home ? "" : "@"}${esc(g.oppAbbr)}`;
    const score = g.state !== "pre" && g.score != null && g.oppScore != null ? ` ${g.score}-${g.oppScore}` : "";
    const when = g.state === "pre" ? kick(g.date) : g.state === "in" ? `<span class="mx-clock">${esc((g.detail || "").replace(" - ", " "))}</span>` : "Final";
    return [`${opp}${chip}`, `${when}${score}${wx ? ` ${wx}` : ""}`];
  }
  if (p.opp?.bye) return ["BYE", ""];
  if (!p.opp?.team) return ["", ""];
  return [`${p.opp.home ? "" : "@"}${esc(p.opp.team)}${chip}`, `${p.opp.date ? kick(p.opp.date) : ""}${wx ? ` ${wx}` : ""}`];
}
// The Roster tab's right-hand columns: Ranks, Usage, Research or Schedule (buttons above Starters).
const ROSTER_VIEWS = [["ranks", "Ranks"], ["usage", "Usage"], ["research", "Research"], ["schedule", "Schedule"]];
const rosterView = () => (ROSTER_VIEWS.some(([k]) => k === state.rosterView) ? state.rosterView : (state.rosterView = store.get("ffb.rview") || "usage"));
function rosterCols(p) {
  const cell = (v, lbl, tip) => `<div class="pu" title="${tip}"><b>${v}</b><span>${lbl}</span></div>`;
  const v = rosterView();
  if (v === "ranks") return `<div class="pr-use n2">${cell(p.pprRank ? `${esc(p.pos)}${Math.round(p.pprRank)}` : "–", "PPR", "ESPN experts' average PPR rank this week, at the position")}${cell(p.posRank ? `${esc(p.pos)}${p.posRank}` : "–", "Pos", "Season rank by fantasy points, at the position")}</div>`;
  if (v === "research") {
    const val = valueOf(p.id);
    return `<div class="pr-use n3">${cell(p.own != null ? `${Math.round(p.own)}%` : "–", "Rost", "% of ESPN leagues that roster him")}${cell(p.start != null ? `${Math.round(p.start)}%` : "–", "Start", "% of ESPN leagues that start him")}${cell(val ? fmtVal(val) : "–", "Value", "FantasyCalc trade value")}</div>`;
  }
  if (v === "schedule") return schedStrip(p);
  return usageCols(p.id);
}
// This week's matchup and the rest of the season: opponent and how tough that defense is vs. his position.
function schedStrip(p) {
  const nfl = state.week?.nfl, sched = nfl?.sched?.[p.proId];
  if (!sched) return `<div class="pr-sched"><div class="ps muted">–</div></div>`;
  const cells = [];
  for (let wk = state.week.week; wk <= state.base.weeks; wk++) {
    const sp = state.base.scoringPeriodFor(wk), g = sched[sp];
    if (!g) { cells.push(`<div class="ps bye"><span>W${wk}</span><b>BYE</b><i></i></div>`); continue; }
    const [opp, home] = g, rank = nfl.oprk?.[p.posId]?.[opp]?.[0];
    const cls = rank ? (rank <= 10 ? "tough" : rank >= 23 ? "easy" : "") : "";
    cells.push(`<div class="ps ${wk === state.week.week ? "cur" : ""}" title="Week ${wk}: ${home ? "vs" : "@"} ${esc(PRO[opp] || "")}${rank ? ` · ${ordinal(rank)} vs ${esc(p.pos)}s (1st = toughest)` : ""}"><span>W${wk}</span><b>${home ? "" : "@"}${esc(PRO[opp] || "")}</b><i class="oprk ${cls}">${rank ? ordinal(rank) : ""}</i></div>`);
  }
  return `<div class="pr-sched">${cells.join("")}</div>`;
}
// Three usage columns (season average): share of snaps, targets and carries.
function usageCols(id) {
  const u = usageOf(id), avg = (k) => (u ? u.avg?.[k] ?? u.last[k] : null);
  const cell = (v, lbl, tip) => `<div class="pu" title="${tip}"><b>${v == null ? "–" : pctTxt(v)}</b><span>${lbl}</span></div>`;
  return `<div class="pr-use" ${u ? `data-tip="${usageTip(u)}"` : ""}>${cell(avg("pct"), "Snap", "Season share of the team's offensive snaps")}${cell(u && u.pos !== "QB" ? avg("share") : null, "Tgt", "Season share of the team's targets")}${cell(avg("rush"), "Rush", "Season share of the team's rushing attempts")}</div>`;
}
function playerRow(p, { label, sp, action = "", owner = true, unread = false, cols = false, faStats = false } = {}) {
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
    !cols && usageBrief(p.id),
    p.pprRank && `<span class="pd-rank">PPR ${posRankHtml(p, p.pprRank)}</span>`,
    p.posRank && `<span class="pd-rank">Rk ${posRankHtml(p, p.posRank)}</span>`,
  ].filter(Boolean);
  // Free agents in the upgrade list: position rank, points per game and % rostered instead.
  if (faStats) details.splice(0, details.length,
    `<span class="pd-k">Rank</span> ${p.posRank ? `${esc(p.pos)}${Math.round(p.posRank)}` : "–"}`,
    `<span class="pd-k">Avg</span> ${p.seasonAvg != null ? f1(p.seasonAvg) : "–"}`,
    `<span class="pd-k">Rost</span> ${p.own != null ? `${Math.round(p.own)}%` : "–"}`);
  return `<div class="pr-row ${gsState(p)} ${cols ? `has-use rv-${rosterView()}` : ""} ${faStats ? "fa-stats" : ""}">
    <div class="pr-label">${esc(label ?? p.pos)}</div>
    <div class="pr-info pr-has-hs">${headshot(p, 38)}<div class="pr-text">
      <div class="mx-name">${plinkNm(p)}${injBadge(p)}${unread ? newsDot(p) : ""}</div>
      ${cols ? (() => { const [opp, when] = gameLines(p); return `<div class="mx-game pr-opp">${opp || "&nbsp;"}</div><div class="mx-game pr-when">${when || "&nbsp;"}</div>`; })()
        : `<div class="mx-game">${gameLineHtml(p)}${p.opp?.rank ? `<span class="pr-oprk"> ${oprkChip(p)}</span>` : ""}${wxChip(p.proId, gameStatusOf(p)?.state)}</div>`}
      <div class="mx-stats" ${p.short ? `title="${esc(p.line)}"` : ""}>${p.short ? esc(p.short) : "&nbsp;"}</div>
      ${cols ? "" : `<div class="pr-details">${details.length ? details.map((d) => `<span class="pd">${d}</span>`).join("") : "&nbsp;"}</div>`}
    </div></div>
    ${cols ? rosterCols(p) : ""}
    <div class="mx-pts"><div class="mx-score">${pts}</div><div class="mx-proj">${f1(p.proj)}</div></div>
    ${action}
  </div>`;
}

// ---------- Player tables (Players tab) ----------
// Sortable columns. The Player cell keeps the matchup-style name, game line and stats,
// and rows get the same highlighting (bold = playing, gold = on the field, red = red zone).
// Two lines for every player (name, then game · stats) so the table's rows are all the same height.
function playerCell(p) {
  return `<div class="pt-name">${plinkNm(p)}${injBadge(p)}</div>
    <div class="mx-game pt-line" ${p.short ? `title="${esc(p.line)}"` : ""}>${gameLineHtml(p)}${p.short ? ` <span class="pt-stats">· ${esc(p.short)}</span>` : ""}</div>`;
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
  seasonPts: { key: "seasonPts", label: "Tot", title: "Total fantasy points this season", num: true, render: (p) => (p.seasonPts == null ? DASH : f1(p.seasonPts)) },
  ppg: { key: "seasonAvg", label: "PPG", title: "Fantasy points per game this season", num: true, render: (p) => (p.seasonAvg == null ? DASH : f1(p.seasonAvg)) },
  pprRank: { key: "pprRank", label: "PPR rk", title: "ESPN PPR rank at the position", num: true, dir: 1, render: (p) => posRankHtml(p, p.pprRank) },
  posRank: { key: "posRank", label: "Score rk", title: "Scoring rank at the position this season", num: true, dir: 1, render: (p) => posRankHtml(p, p.posRank) },
  snap: { key: "snap", label: "Snap %", title: "Season share of the team's offensive snaps (last game underneath)", num: true, render: snapCell, sort: (p) => { const u = usageOf(p.id); return u ? u.avg?.pct ?? u.last.pct : null; } },
  tgt: { key: "tgt", label: "Tgt %", title: "Season share of the team's targets (last game underneath)", num: true, render: tgtCell, sort: (p) => { const u = usageOf(p.id); return u && u.pos !== "QB" ? u.avg?.share ?? u.last.share : null; } },
  rush: { key: "rush", label: "Rush %", title: "Season share of the team's carries (last game underneath)", num: true, render: rushCell, sort: (p) => { const u = usageOf(p.id); return u ? u.avg?.rush ?? u.last.rush : null; } },
  rz: { key: "rz", label: "RZ %", title: "Season share of the team's red-zone targets and carries, inside the opponent's 20 (last game underneath)", num: true, render: rzCell, sort: (p) => { const u = usageOf(p.id); return u && u.pos !== "QB" ? u.avg?.rz ?? u.last.rz : null; } },
  value: { key: "value", label: "Value", title: "FantasyCalc trade value", num: true, render: (p) => valueCell(p.id), sort: (p) => valueOf(p.id) },
  act: { key: "", label: "", cls: "pt-act", render: (p) => moveBtns(p) },
  watch: { key: "", label: ic("eye"), cls: "pt-watch", title: "Your ESPN watch list", render: (p) => watchBox(p.id) },
};
// Draws a player table into `el`; header clicks re-sort it in place.
function drawPlayerTable(el, keys, rows, sortState, sp, empty) {
  if (!rows.length) { el.innerHTML = `<p class="muted pr-empty">${empty}</p>`; return; }
  const cols = keys.map((k) => { const c = typeof k === "object" ? k : PCOLS[k]; return c.render ? { ...c, render: (r) => c.render(r, sp) } : c; });
  const redraw = () => drawPlayerTable(el, keys, rows, sortState, sp, empty);
  el.replaceChildren(sortableTable(cols, rows, sortState, redraw, { rowClass: (p) => `${gsState(p)} ${myRow(p.teamId)}`, tableClass: "pt-table" }));
}

// Position filter as a row of buttons (same feel as the injury report).
const FLEX_POS = ["RB", "WR", "TE"];
const posMatch = (pos, want) => want === "ALL" || pos === want || (want === "FLEX" && FLEX_POS.includes(pos));
const posSeg = (id, current, flex = false) => `<div class="seg pos-seg" id="${id}" role="group" aria-label="Position">${["ALL", ...POS_ORDER.flatMap((p) => (flex && p === "TE" ? [p, "FLEX"] : [p]))].map((p) => `<button type="button" data-p="${esc(p)}" class="${current === p ? "active" : ""}">${p === "ALL" ? "All" : esc(p)}</button>`).join("")}</div>`;
function bindPosSeg(id, set, draw) {
  $(id).querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    set(b.dataset.p);
    $(id).querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
    draw();
  }));
}
const tableHint = () => `<p class="muted small pt-hint">Tap a column header to sort. Swipe sideways for more columns.</p>`;

// ---------- Logos & award icons ----------
function logoImg(t, size = 28) {
  const clean = (s) => (s || "").replace(/[^A-Za-z0-9]/g, "");
  const initials = (clean(t.abbrev).slice(0, 3) ||
    (t.name || "").split(/\s+/).map((w) => clean(w)[0] || "").join("").slice(0, 3) || "?").toUpperCase();
  if (!t.logo) return `<span class="logo logo-fb" style="--s:${size}px">${esc(initials)}</span>`;
  return `<img class="logo" style="--s:${size}px" src="${esc(t.logo)}" width="${size}" height="${size}" alt="" loading="lazy" referrerpolicy="no-referrer" data-fb="${esc(initials)}">`;
}
const teamName = (id, size = 22) => `<span class="tname" data-tpop="${esc(id)}">${logoImg(team(id), size)}<span>${esc(team(id).name)}</span></span>`;

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

// The weekly award tally, loaded once per league; onReady runs when it arrives.
function ensureAwardTally(onReady) {
  if (state.awardTally && state.awardTally !== "loading") return state.awardTally;
  if (!state.awardTally) {
    state.awardTally = "loading";
    const base = state.base;
    loadAwardTally().then((t) => { if (state.base === base) state.awardTally = t; })
      .catch(() => { if (state.base === base) state.awardTally = {}; })
      .finally(() => { if (state.base === base) onReady?.(); });
  }
  return null;
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
    <div class="grid grid-awards wk-awards" style="--n:${awards.length}">${awards.map((a) => `<div class="card award"><div class="label">${AWARD_ICONS[a.key] ? awardIcon(a.key) + " " : ""}${a.label}</div><div class="value">${a.value}</div><div class="who">${teamName(a.side.teamId, 20)}</div><div class="why">${esc(team(a.side.teamId).owner)}${a.why ? " · " + a.why : ""}</div></div>`).join("")}</div>
    <div class="section-head"><h2>Manager report card</h2><span class="muted small">Optimal = the highest-scoring lineup possible from that roster this week</span></div>
    <div id="mg-table"></div>`;
  const cols = [
    { key: "name", label: "Team", sort: (s) => team(s.teamId).name, render: (s) => `<div class="team-cell" data-tpop="${s.teamId}">${logoImg(team(s.teamId), 30)}<div><strong>${esc(team(s.teamId).name)}</strong><div class="small muted">${esc(team(s.teamId).owner)}</div></div></div>` },
    { key: "score", label: "Score", num: true, render: (s) => `${f2(s.score)}${s.won === true ? ` <span class="badge">W</span>` : s.won === false ? ` <span class="badge">L</span>` : ""}` },
    { key: "vsProj", label: "vs Proj", num: true, sort: (s) => s.score - s.proj, render: (s) => `<span class="${clsSign(s.score - s.proj)}">${signed(s.score - s.proj)}</span>` },
    { key: "optimal", label: "Optimal", num: true, render: (s) => f1(s.optimal) },
    { key: "benchLeft", label: "Bench pts left", num: true, render: (s) => f1(s.benchLeft) },
    { key: "efficiency", label: "Lineup efficiency", sort: (s) => s.efficiency, render: (s) => s.efficiency == null ? "–" : `<div class="bar-cell"><span class="track"><span class="fill" style="display:block;width:${s.efficiency * 100}%"></span></span>${pct(s.efficiency)}</div>` },
    { key: "allPlayW", label: "All-play", num: true, title: "Record if this team played every other team this week", render: (s) => `${s.allPlayW}-${s.allPlayL}` },
    { key: "mvp", label: "MVP", cls: "hide-sm", sort: (s) => s.mvp?.actual, render: (s) => (s.mvp ? `${plink(s.mvp.id, s.mvp.name)} <span class="muted">${f1(s.mvp.actual)}</span>` : "–") },
    { key: "bust", label: "Biggest bust", cls: "hide-sm", sort: (s) => s.bust?.diff, render: (s) => (s.bust ? `${plink(s.bust.id, s.bust.name)} <span class="neg">${signed(s.bust.diff)}</span>` : "–") },
  ];
  const draw = () => $("mg-table").replaceChildren(sortableTable(cols, sides, state.managers.sort, draw, { rowClass: (r) => myRow(r.teamId), tableClass: "mg-table" }));
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
  // Computers split the page into three sub-tabs; phones scroll through all of it.
  const desk = DESK.matches, sub = desk ? (state.standings.sub ||= "standings") : null;
  const show = (k) => (!desk || sub === (k === "awards" ? "standings" : k) ? "" : "hidden");
  const SUBS = [["standings", "Standings & Awards"], ["pos", "Position Rankings"], ["luck", "Luck & Weekly Scoring"]];
  el.innerHTML = `${desk ? `<div class="seg st-subs" role="tablist">${SUBS.map(([k, l]) => `<button type="button" role="tab" data-stsub="${k}" class="${sub === k ? "active" : ""}">${l}</button>`).join("")}</div>` : ""}
    <section class="st-sec" ${show("standings")}><div class="section-head"><h2>Standings & power rankings</h2><span class="muted small">Through week ${season.weeks[season.weeks.length - 1]}</span></div>
    ${desk ? `<div class="st-top"><div class="st-main"><div id="st-table"></div></div><aside class="st-rail" id="st-rail"></aside></div>` : `<div id="st-table"></div>`}</section>
    <section class="st-sec" ${show("pos")}><div class="section-head"><h2>Position rankings</h2><span class="muted small">Each team's current roster, by points per game this season</span></div><div id="pr-table"></div></section>
    <section class="st-sec st-luck" ${show("luck")}><div><div class="section-head"><h2>Luck meter</h2><span class="muted small">Actual wins minus expected wins (based on weekly scores vs. the whole league)</span></div>
    <div class="card chart-card" id="luck-chart"></div></div>
    <div><div class="section-head"><h2>Weekly scores</h2><span class="muted small">Darker = higher score relative to the league</span></div>
    <div class="card chart-card" id="heatmap"></div></div></section>
    <section class="st-sec" id="aw-sec" ${show("awards")}></section>`;
  el.querySelectorAll("[data-stsub]").forEach((b) => b.addEventListener("click", () => { state.standings.sub = b.dataset.stsub; renderSeason(); }));
  const odds = playoffOdds();
  const cols = [
    { key: "rank", label: "#", num: true },
    { key: "name", label: "Team", render: (r) => `<div class="team-cell" data-tpop="${r.id}">${logoImg(r, 34)}<div><strong>${esc(r.name)}</strong><div class="small muted">${esc(r.owner)}</div></div></div>` },
    { key: "wins", label: "Record", sort: (r) => r.winPct * 1000 + r.pf / 1e4, render: (r) => recordStr(r) },
    { key: "pf", label: "PF", num: true, render: (r) => f1(r.pf) },
    { key: "pa", label: "PA", num: true, render: (r) => f1(r.pa) },
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
  const draw = () => $("st-table").replaceChildren(sortableTable(cols, season.rows, state.standings.sort, draw, { rowClass: (r) => myRow(r.id) }));

  draw();
  // Computers: a column beside the standings with the playoff race (and the award leaders, below).
  if ($("st-rail")) {
    const race = odds ? [...season.rows].sort((a, b) => (odds.teams[b.id]?.playoffs ?? 0) - (odds.teams[a.id]?.playoffs ?? 0)) : [];
    $("st-rail").innerHTML = race.length ? `<div class="card st-race"><h3>Playoff race</h3><p class="muted small">Chance to make the top ${odds.spots}</p>
      ${race.map((r, i) => { const x = odds.teams[r.id]?.playoffs ?? 0; return `<div class="race-row ${myRow(r.id)} ${i === odds.spots - 1 ? "cutline" : ""}" data-tpop="${r.id}">${logoImg(r, 22)}<span class="race-nm">${esc(r.name)}</span><span class="race-bar"><i style="width:${Math.round(x * 100)}%" class="${x >= 0.75 ? "hi" : x <= 0.25 ? "lo" : ""}"></i></span>${oddsCell(x)}</div>`; }).join("")}</div>` : "";
  }
  // Position rankings: each team's current roster, group by group, and overall.
  const PR = positionRanks();
  if (!PR) $("pr-table").innerHTML = `<div class="loading small"><span class="spinner"></span> Loading rosters…</div>`;
  else {
    // tier 0 (best) … 4 (worst) shades the cell on computers.
    const rk = (r, n) => `<span class="rk ${r <= Math.ceil(n / 3) ? "easy" : r > n - Math.ceil(n / 3) ? "tough" : ""} rkh t${Math.min(4, Math.floor(((r - 1) / Math.max(1, n - 1)) * 5))}">${ordinal(r)}</span>`;
    const prCols = [
      { key: "name", label: "Team", sort: (r) => team(r.id).name, render: (r) => `<div class="team-cell" data-tpop="${r.id}">${logoImg(team(r.id), 28)}<div><strong>${esc(team(r.id).name)}</strong></div></div>` },
      ...PR.groups.map((g) => ({ key: g, label: g, num: true, dir: 1, title: `Rank by points per game of the team's top ${g === "FLEX" ? "flex options" : g + "s"} this season`, sort: (r) => r.rank[g], render: (r) => `${rk(r.rank[g], PR.rows.length)}<div class="pt-sub">${f1(r.val[g])}</div>` })),
      { key: "overall", label: "Overall", num: true, dir: 1, title: "Rank by the whole starting lineup's points per game", sort: (r) => r.rank.overall, render: (r) => `<strong>${rk(r.rank.overall, PR.rows.length)}</strong><div class="pt-sub">${f1(r.val.overall)}</div>` },
    ];
    const prSort = (state.posRankSort ||= { key: "overall", dir: 1 });
    const drawPr = () => $("pr-table").replaceChildren(sortableTable(prCols, PR.rows, prSort, drawPr, { rowClass: (r) => myRow(r.id), tableClass: "pr-rank-table" }));
    drawPr();
  }
  // Wide screens without the sub-tabs: Standings and Position rankings next to each other.
  if (!desk) { const g = document.createElement("div"); g.className = "st-grid"; const prHead = $("pr-table").previousElementSibling, a = document.createElement("div"), b = document.createElement("div");
    $("st-table").before(g); a.append($("st-table")); b.append(prHead, $("pr-table")); g.append(a, b); }
  if (desk) $("st-table").after($("aw-sec")); // computers: the awards sit right under the standings
  else $("st-table").insertAdjacentHTML("afterend", fcCredit());
  $("luck-chart").innerHTML = luckChart(season.rows);
  $("heatmap").innerHTML = heatmap(season);
  // Season awards: how many of each weekly award every team has won (regular season).
  $("aw-sec").insertAdjacentHTML("beforeend", `<div class="section-head"><h2>Season awards</h2><button type="button" class="aw-key" id="aw-key">Icon key</button></div><div id="aw-table"></div>`);
  $("aw-key").addEventListener("click", () => showModal(`<div class="pm-head"><h2 id="pl-modal-title">${ic("trophy")} Award icons</h2></div>
    <ul class="aw-keylist">${AWARD_ORDER.map((k) => `<li>${awardIcon(k, 22)}<span>${esc(AWARD_NAMES[k])}</span></li>`).join("")}</ul>
    <p class="muted small">Weekly awards, counted over the regular season.</p>`));
  const tally = ensureAwardTally(() => { if (state.tab === "season" && state.week) renderSeason(); });
  if (!tally || tally === "loading") { $("aw-table").innerHTML = `<div class="loading small"><span class="spinner"></span> Counting weekly awards…</div>`; return; }
  const awRows = season.rows.map((r) => { const aw = Object.fromEntries(AWARD_ORDER.map((k) => [k, (tally[r.id]?.[k] || []).length])); return { ...r, aw, total: sum(Object.values(aw)) }; });
  const awCols = [
    { key: "name", label: "Team", render: (r) => `<div class="team-cell" data-tpop="${r.id}">${logoImg(r, 28)}<div><strong>${esc(r.name)}</strong></div></div>` },
    ...AWARD_ORDER.map((k) => ({ key: k, label: awardIcon(k, 18), title: AWARD_NAMES[k], num: true, sort: (r) => r.aw[k], render: (r) => (r.aw[k] ? String(r.aw[k]) : `<span class="muted">–</span>`) })),
    { key: "total", label: "Total", num: true, render: (r) => `<strong>${r.total}</strong>` },
  ];
  const awSort = (state.awardSort ||= { key: "total", dir: -1 });
  const drawAw = () => $("aw-table").replaceChildren(sortableTable(awCols, awRows, awSort, drawAw, { rowClass: (r) => myRow(r.id), tableClass: "aw-table" }));
  drawAw();
  if ($("st-rail")) {
    const lead = AWARD_ORDER.map((k) => { const best = Math.max(0, ...awRows.map((r) => r.aw[k])); return [k, best, awRows.filter((r) => best && r.aw[k] === best)]; });
    $("st-rail").insertAdjacentHTML("beforeend", `<div class="card st-leaders"><h3>Award leaders</h3>
      ${lead.map(([k, n, who]) => `<div class="lead-row">${awardIcon(k, 20)}<span class="lead-what">${esc(AWARD_NAMES[k])}</span><span class="lead-who">${n ? `${who.slice(0, 2).map((r) => `<span data-tpop="${r.id}">${esc(r.name)}</span>`).join(", ")}${who.length > 2 ? ` +${who.length - 2}` : ""} <b>${n}</b>` : `<span class="muted">–</span>`}</span></div>`).join("")}</div>`);
  }
}

// How strong each team's current roster is at each spot: points per game this season of the players
// who'd start there (as many as the lineup holds), the flex spots filled from what's left, and overall.
// Ranked 1st (best) down. Null while this week's rosters load.
function positionRanks() {
  const wk = ensureCurrentRosters();
  if (!wk) return null;
  const sc = state.base.slotCounts || {};
  const groups = [["QB", 0, 1], ["RB", 2, 2], ["WR", 4, 3], ["TE", 6, 4], ["K", 17, 5], ["D/ST", 16, 16]].filter(([, slot]) => sc[slot]);
  const flexN = (sc[23] || 0) + (sc[3] || 0) + (sc[5] || 0);
  const ppg = (p) => p.seasonAvg ?? p.proj ?? 0;
  const rows = wk.sides.map((side) => {
    const val = {}, left = [];
    for (const [g, slot, posId] of groups) {
      const best = side.players.filter((p) => p.posId === posId && p.slotId !== IR).sort((a, b) => ppg(b) - ppg(a));
      val[g] = sum(best.slice(0, sc[slot]), ppg);
      if ([2, 3, 4].includes(posId)) left.push(...best.slice(sc[slot]));
    }
    if (flexN) val.FLEX = sum(left.sort((a, b) => ppg(b) - ppg(a)).slice(0, flexN), ppg);
    val.overall = sum(Object.values(val));
    return { id: String(side.teamId), val, rank: {} };
  });
  const names = [...groups.map(([g]) => g), ...(flexN ? ["FLEX"] : [])];
  for (const g of [...names, "overall"]) [...rows].sort((a, b) => b.val[g] - a.val[g]).forEach((r, i) => { r.rank[g] = i + 1; });
  const order = ["QB", "RB", "WR", "TE", "FLEX", "K", "D/ST"].filter((g) => names.includes(g));
  return { groups: order, rows };
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

  // Faux 3D: the field is laid out flat (x across, depth 30 far … 150 near) and drawn tilted back —
  // squashed in depth, with the far sideline narrower. Plays and labels are drawn upright on top.
  const TOP = narrow ? 36 : 50, C = narrow ? 0.58 : 0.6, FAR = 0.84, VH = TOP + 120 * C + 4;
  const P = (xu, d) => { const t = (d - 30) / 120, s = FAR + (1 - FAR) * t; return [+(W / 2 + (xu - W / 2) * s).toFixed(1), +(TOP + (d - 30) * C).toFixed(1)]; };
  const quad = (x1, x2, attrs) => `<polygon points="${[P(x1, 30), P(x2, 30), P(x2, 150), P(x1, 150)].map((p) => p.join(",")).join(" ")}" ${attrs}/>`;
  const vline = (xu, attrs) => { const [a, b] = P(xu, 30), [c, d] = P(xu, 150); return `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" ${attrs}/>`; };
  const X = (a) => P(x(a), 96)[0]; // a yard line's screen x at mid-field depth, where plays are drawn

  const parts = [];
  // Grass with 10-yard stripes, end zones in team colors.
  parts.push(quad(EZ, W - EZ, `fill="#2e7d32"`));
  for (let a = 0; a < 100; a += 20) parts.push(quad(x(a + 10), x(a + 10) + 10 * S, `fill="#348a39"`));
  parts.push(quad(0, EZ, `fill="${away.color || "#555"}"`), quad(W - EZ, W, `fill="${home.color || "#555"}"`));
  // Team names painted in each end zone, in the same perspective as the field: the text is laid out
  // flat (running up the left end zone, down the right one, tops toward the outside) and mapped onto the
  // tilted field at that spot.
  // Sized to fit (about 100 of the end zone's 120 units long, 60% of its width) and clipped to it.
  const ezText = (cx, abbr, flip, x0) => {
    const [mx, my] = P(cx, 90), s = flip ? -1 : 1;
    const [ax, ay] = P(cx, 90 - s), [bx, by] = P(cx + s, 90); // one unit along the text, one unit "down" the letters
    const m = [ax - mx, ay - my, bx - mx, by - my, mx, my].map((v) => +v.toFixed(3)).join(" ");
    const fs = Math.min(EZ * 0.6, 100 / (0.72 * Math.max(2, String(abbr).length))).toFixed(1);
    const id = `ez-${esc(g.id)}-${flip ? "h" : "a"}`;
    return `<clipPath id="${id}">${quad(x0, x0 + EZ, "")}</clipPath><g clip-path="url(#${id})"><text class="ez" style="font-size:${fs}px" transform="matrix(${m})">${esc(abbr)}</text></g>`;
  };
  parts.push(ezText(EZ / 2, away.abbr, false, 0), ezText(W - EZ / 2, home.abbr, true, W - EZ));
  // Red zone and the current drive.
  if (g.redZone && dir) { const gl = dir > 0 ? 100 : 0; parts.push(quad(Math.min(x(gl), x(gl - dir * 20)), Math.min(x(gl), x(gl - dir * 20)) + 20 * S, `fill="#e53935" opacity=".22"`)); }
  if (driveStart != null && poss) parts.push(quad(Math.min(x(driveStart), x(spot)), Math.max(x(driveStart), x(spot)), `fill="${possColor}" opacity=".3"`));
  // Yard lines and numbers (numbers along the near sideline).
  for (let a = 5; a < 100; a += 5) parts.push(vline(x(a), `stroke="#fff" stroke-opacity="${a % 10 ? 0.25 : 0.6}" stroke-width="2"`));
  for (let a = 10; a < 100; a += 10) { const [px, py] = P(x(a), 145); parts.push(`<text class="yd" transform="translate(${px} ${py}) scale(1 ${C + 0.2})">${a <= 50 ? a : 100 - a}</text>`); }
  parts.push(vline(EZ, `stroke="#fff" stroke-width="4"`), vline(W - EZ, `stroke="#fff" stroke-width="4"`));
  // First-down line (yellow) and line of scrimmage (blue).
  if (fd != null && fd > 0 && fd < 100) parts.push(vline(x(fd), `stroke="#fdd835" stroke-width="5"`));
  parts.push(vline(x(spot), `stroke="#42a5f5" stroke-width="5"`));
  // Last play, drawn from where the ball actually started to where it ended:
  //   pass: arc + arrowhead · incomplete: dotted arc ending in an X · run: straight arrow
  //   sack: straight arrow back, red · kick/punt/FG: high arc · penalty: yellow flag + dashed line
  //   interception/fumble lost: red line + label. Yardage comes from the spots, not ESPN's stat line.
  const playFrom = parts.length; // everything after this is the last play, drawn with a dark outline
  if (lp && lp.start != null && lp.end != null) {
    const text = shown.text || "";
    const kind = playKind(lp.type, text);
    const offDir = lp.teamId === home.proId ? 1 : lp.teamId === away.proId ? -1 : dir || 1; // direction the snapping team moves
    let endA = lp.end, startA = lp.start;
    // Extra points are always snapped from the 15 of the goal the team just scored in; ESPN's spots for
    // them are often left over from the touchdown or the next kickoff, so they aren't used.
    const isXp = /extra point/i.test(lp.type), isFg = /field goal/i.test(lp.type);
    const goalA = offDir > 0 ? 100 : 0;
    if (isXp) startA = endA = goalA - offDir * 15;
    if (kind === "incomplete") endA = lp.start + offDir * (/deep/i.test(text) ? 20 : 8); // no target spot recorded
    const xs = X(startA), xe = X(endA), Y = P(0, 96)[1], mid = (xs + xe) / 2;
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
      const xt = flip != null ? X(flip) : xs;
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
      if (land == null) land = lp.end;
      // Field goals and extra points fly to the posts at the back of the end zone.
      const xl = isXp || isFg ? P(x(goalA) - offDir * 10 * S, 96)[0] : X(land), lift = Math.min(52, 22 + Math.abs(xl - xs) / 6);
      if (Math.abs(xl - xs) >= 4) parts.push(`<path d="M${xs} ${Y} Q${(xs + xl) / 2} ${Y - lift * 2} ${xl} ${Y}" fill="none" stroke="#fff" stroke-width="4" stroke-dasharray="14 6" ${isXp || isFg || Math.abs(xe - xl) < 4 ? `marker-end="url(#arrow-${esc(g.id)})"` : ""}/>`);
      const ret = isXp || isFg ? 0 : Math.round(Math.abs(lp.end - land));
      if (ret >= 1) parts.push(`<path d="M${xl} ${Y + 6} L${xe} ${Y + 6}" stroke="#fff" stroke-width="4" marker-end="url(#arrow-${esc(g.id)})"/>`);
      const good = /good/i.test(lp.type) || /is GOOD/.test(text);
      const what = /punt/i.test(lp.type) ? `Punt${kd ? ` ${kd} yds` : ""}${/fair catch/i.test(text) ? " · fair catch" : /touchback/i.test(text) ? " · touchback" : ret >= 1 ? ` · ${ret} yd return` : ""}`
        : /field goal/i.test(lp.type) ? `FG${fgd ? ` ${fgd} yds` : ""} ${good ? "✓" : "✗"}`
        : /extra point/i.test(lp.type) ? `XP ${good ? "✓" : "✗"}`
        : `Kickoff${kd ? ` ${kd} yds` : ""}${/touchback/i.test(text) ? " · touchback" : ret >= 1 ? ` · ${ret} yd return` : ""}`;
      tag(`${what}${hasFlag(text) ? ` · 🚩 ${flagName(text)}` : ""}`, Math.max(16, Y - lift - 8));
    } else if (far) {
      const aerial = kind === "pass" || kind === "incomplete";
      const lift = aerial ? Math.min(38, 14 + Math.abs(xe - xs) / 8) : 0;
      const path = aerial ? `M${xs} ${Y} Q${mid} ${Y - lift * 2} ${xe} ${Y}` : `M${xs} ${Y} L${xe} ${Y}`;
      const color = kind === "sack" || kind === "safety" ? "#ef5350" : "#fff";
      const tagY = aerial ? Math.max(16, Y - lift - 8) : Y - 12;
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
    <svg class="field ${narrow ? "narrow" : ""}" viewBox="0 0 ${W} ${VH}" role="img" aria-label="${esc(label || "Field position")}">
      <defs>${[["arrow", "#fff"], ["arrowy", "#fdd835"], ["arrowr", "#ef5350"]].map(([id, fill]) => `<marker id="${id}-${esc(g.id)}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${fill}"/></marker>`).join("")}</defs>
      ${parts.slice(0, playFrom).join("")}<g class="play">${parts.slice(playFrom).join("")}</g>
    </svg>
    <div class="field-caption">${poss ? `<strong>${esc(poss.abbr)}</strong> ball ${arrowWord} · ` : ""}${esc(g.downDistance || f.possText || "")}${f.driveDesc ? ` <span class="muted">· Drive: ${esc(f.driveDesc)}</span>` : ""}</div>
  </div>`;
}

// ---------- Live games ----------
const LIVE_POLL_MS = 20000, IDLE_POLL_MS = 120000;

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
    else if (SHOW_BANNERS && isCurrentSp(data.sp)) liveAlerts(old, data);
    const prev = state.livePrev;
    const same = state.live && !state.live.error && JSON.stringify({ ...state.live, updated: 0 }) === JSON.stringify({ ...data, updated: 0 });
    state.liveBumps = {};
    for (const p of data.players) {
      if (p.pts != null && prev[p.id] != null && p.pts !== prev[p.id]) state.liveBumps[p.id] = p.pts - prev[p.id];
      prev[p.id] = p.pts;
    }
    state.live = data;
    state.liveSame = same;
    paintLiveDot();
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
// A banner drops in at the top for 7 seconds when a starter in your matchup (your team or this week's
// opponent, D/ST included) scores a
// touchdown, crosses a yardage bonus the league pays for, or gains 15+ points between two refreshes.
const TD_STATS = [4, 25, 43, 63, 93, 101, 102, 103, 104];
const BONUSES = [[17, 3, 300, "300-yd passing bonus"], [18, 3, 400, "400-yd passing bonus"], [37, 24, 100, "100-yd rushing bonus"],
  [38, 24, 200, "200-yd rushing bonus"], [56, 42, 100, "100-yd receiving bonus"], [57, 42, 200, "200-yd receiving bonus"]];
// What a touchdown was: "11-yd receiving TD", "Interception return TD".
const TD_KIND = { 4: [3, "passing TD"], 25: [24, "rushing TD"], 43: [42, "receiving TD"], 63: [null, "Fumble recovery TD"],
  93: [null, "Blocked kick return TD"], 101: [null, "Kickoff return TD"], 102: [null, "Punt return TD"], 103: [null, "Interception return TD"], 104: [null, "Fumble return TD"] };
// The in-app scoring banners are switched off for now; push notifications cover scoring. Set to true to bring them back.
const SHOW_BANNERS = false;
function liveAlerts(old, data) {
  const before = new Map(old.players.map((p) => [String(p.id), p]));
  const items = state.base.raw.settings?.scoringSettings?.scoringItems || [];
  const paid = new Set(items.map((i) => i.statId));
  const n = (p, id) => Number(p.stats?.[id] || 0);
  const events = [];
  // Only your matchup: your team and whoever you play this week.
  const me = String(myTeamId() || "");
  const wk = state.weekCache?.[state.base.current];
  const mu = me && wk?.matchups?.find((m) => [m.home?.teamId, m.away?.teamId].map(String).includes(me));
  const inMatchup = new Set(mu ? [mu.home?.teamId, mu.away?.teamId].filter((x) => x != null).map(String) : me ? [me] : []);
  // Fantasy points for a stat change under this league's scoring (D/ST overrides included).
  const ptsFor = (statId, delta, p) => {
    const it = items.find((i) => i.statId === statId);
    if (!it) return 0;
    const v = it.pointsOverrides?.[p.posId === 16 ? 16 : p.slotId] ?? it.points;
    return delta * v;
  };
  for (const p of data.players) {
    if (!p.teamId || p.slotId == null || p.slotId === BENCH || p.slotId === IR || !inMatchup.has(String(p.teamId))) continue;
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
  // Swipe it away (sideways or up); a tap opens the player. Holding it pauses the 7-second timer.
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
  timer = setTimeout(dismiss, 7000);
}

// Live rail (computers): your players this week, live ones first, with their points so far.
function liveRail(L, games, my) {
  if (!my) return `<aside class="lv-rail card"><div class="rr-head">Your players</div><p class="muted small">Pick your team to follow your players here as the games play.</p><button type="button" class="pg-go" data-pickteam>Select my team ›</button></aside>`;
  const gOf = (p) => games.find((g) => g.home.proId === p.proId || g.away.proId === p.proId);
  const rank = { in: 0, post: 1, pre: 2 };
  const mine = L.players.filter((p) => String(p.teamId) === my).map((p) => ({ p, g: gOf(p) }))
    .sort((a, b) => (rank[a.g?.state] ?? 3) - (rank[b.g?.state] ?? 3) || (b.p.pts ?? 0) - (a.p.pts ?? 0));
  const status = (g) => (!g ? "BYE" : g.state === "in" ? `<span class="badge live">LIVE</span> ${esc(g.detail || "")}` : g.state === "post" ? "Final" : new Date(g.date).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }));
  return `<aside class="lv-rail card"><div class="rr-head">Your players</div>${mine.map(({ p, g }) => `<div class="lr-row ${g?.state === "in" ? "on" : ""}">
      <div class="lr-name">${plinkNm(p)}<div class="muted small">${status(g)}</div></div><strong class="${state.liveBumps?.[p.id] ? "bump" : ""}">${p.pts != null ? f1(p.pts) : "–"}</strong></div>`).join("") || `<p class="muted small">None of your players this week.</p>`}</aside>`;
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
  // Your players' games come first within live / upcoming / final (starters count more than bench).
  const my = String(myTeamId() || "");
  const myWeight = {};
  for (const p of L.players) if (my && String(p.teamId) === my) myWeight[p.proId] = (myWeight[p.proId] || 0) + (p.slotId === BENCH || p.slotId === IR ? 1 : 10);
  const mineIn = (g) => (myWeight[g.home.proId] || 0) + (myWeight[g.away.proId] || 0);
  const games = [...L.games].sort((a, b) => order[a.state] - order[b.state] || (a.state === "pre" ? new Date(a.date) - new Date(b.date) : 0) || mineIn(b) - mineIn(a) || new Date(a.date) - new Date(b.date));
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
        <div class="mx-name">${plinkNm(p, false)} <span class="muted small">${POS[p.posId] || ""}</span>${injBadge({ injury: p.injury })}</div>
        <div class="mx-game lv-owner">${role(p)}</div>
        <div class="mx-stats" ${line && g.state !== "pre" ? `title="${esc(statLine(p.posId, p.stats))}"` : ""}>${line && g.state !== "pre" ? esc(line) : "&nbsp;"}</div>
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
      ${g.state === "pre" ? "" : `<button type="button" class="bx-toggle ${state.boxUi[g.id]?.open ? "open" : ""}" data-bx="${esc(g.id)}" data-toggle="1" aria-expanded="${!!state.boxUi[g.id]?.open}">${ic("chart-bar")} Player stats <span class="caret">▾</span></button>`}
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
    const status = g.state === "in" ? `<span class="badge live">LIVE</span> <strong>${esc(g.detail)}</strong>`
      : g.state === "post" ? `<span class="badge final">FINAL</span>` : `<strong>${esc(kickoff(g))}</strong>`;
    return `<div class="card game game-tile state-${g.state} ${state.liveSel === g.id ? "selected" : ""}" data-gsel="${esc(g.id)}" role="button" tabindex="0">
      <div class="g-head">${scoreSide(g.away, g, false)}<div class="g-status">${status}</div>${scoreSide(g.home, g, true)}</div>${g.state === "in" && (ddLine(g) || g.redZone) ? `<div class="g-dd-bar">${ddLine(g)}${g.redZone ? ` <span class="badge out">RED ZONE</span>` : ""}</div>` : ""}</div>`;
  };
  const split = MU_SPLIT.matches;
  if (split && !games.some((g) => g.id === state.liveSel)) state.liveSel = (games.find((g) => g.state === "in") || games[0])?.id;
  const selGame = games.find((g) => g.id === state.liveSel);
  const summary = [counts.in && `${counts.in} live`, counts.pre && `${counts.pre} upcoming`, counts.post && `${counts.post} final`].filter(Boolean).join(" · ");
  const updated = new Date(L.updated).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });

  el.innerHTML = `<div class="section-head"><h2>NFL week ${L.sp} ${counts.in ? `<span class="badge live">LIVE</span>` : ""}</h2>
      <span class="muted small" title="${counts.in ? "Refreshes every 20 seconds" : ""}">Updated ${updated}</span></div>
    <div class="filters">
      <div class="seg" id="lv-show"><button data-s="rostered" class="${f.show === "rostered" ? "active" : ""}">Rostered players</button><button data-s="all" class="${f.show === "all" ? "active" : ""}">All players</button></div>
      <select id="lv-team" aria-label="Fantasy team"><option value="ALL">All fantasy teams</option>${teamOpts}</select>
    </div>
    ${L.byes?.length ? `<p class="muted small">On bye: ${L.byes.map(esc).join(", ")}</p>` : ""}
    ${!games.length ? `<p class="muted">No NFL games found for this week.</p>`
      : split ? `<div class="mu-split lv-split ${WIDE.matches ? "lv-three" : ""}"><div class="mu-list">${games.map(gameTile).join("")}</div><div class="mu-pane" id="lv-pane">${selGame ? gameCard(selGame, true) : ""}</div>${WIDE.matches ? liveRail(L, games, my) : ""}</div>`
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
    // Computers: champions and league records side by side in one band.
    body = `<div class="hist-band"><div class="hist-champs"><div class="section-head"><h2>Champions</h2></div><div class="grid grid-2">${champs}</div></div>
      <div class="hist-recs"><div class="section-head"><h2>League records</h2><span class="muted small">Regular season, ${span}</span></div>
      <div class="grid grid-awards">${extremes(seasons).join("")}</div></div></div>
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
    <div class="seg hist-seg ${DESK.matches ? "st-subs" : ""}" id="hist-seg"><button data-y="all" class="${sel === "all" ? "active" : ""}">All-time</button>${seasons.map((s) => `<button data-y="${s.year}" class="${String(sel) === String(s.year) ? "active" : ""}">${s.year}</button>`).join("")}</div>
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
    const myOwner = String(state.base.raw.teams?.find((t) => String(t.id) === String(myTeamId()))?.primaryOwner || "");
    const draw = () => $("hist-table").replaceChildren(sortableTable(cols, rows, state.historySort, draw, { rowClass: (m) => (myOwner && m.ownerId === myOwner ? "my-row" : "") }));
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
    const myOwner = String(state.base.raw.teams?.find((t) => String(t.id) === String(myTeamId()))?.primaryOwner || "");
    const draw = () => $("hist-table").replaceChildren(sortableTable(cols, s.list, state.seasonSort, draw, { rowClass: (t) => (myOwner && t.ownerId === myOwner ? "my-row" : "") }));
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

// Roster columns: one view on phones; on computers the Matchup, Scoring and Usage views side by side.
// Roster columns on computers: every stat at once, grouped (this week | scoring | ownership | usage | value).
function erDeskCells(p) {
  const dash = `<span class="muted">–</span>`;
  const c = (val, sub = "", cls = "") => `<div class="erc ${cls}">${val}${sub ? `<small>${sub}</small>` : ""}</div>`;
  const u = usageOf(p.id), v = valueOf(p.id);
  const last = (k) => (u ? `last ${pctTxt(u.last[k])}` : "");
  return [
    c(p.played ? ptsLink(p.id, state.week.sp, f2(p.actual)) : dash, f1(p.proj)),
    c(p.pprRank ? `${esc(p.pos)}${Math.round(p.pprRank)}` : dash, "", "erc-g"),
    c(p.posRank ? `${esc(p.pos)}${p.posRank}` : dash),
    c(p.seasonAvg != null ? f1(p.seasonAvg) : dash),
    c(p.seasonPts != null ? f1(p.seasonPts) : dash),
    c(p.lastPts != null ? f1(p.lastPts) : dash),
    c(p.own != null ? `${Math.round(p.own)}%` : dash, "", "erc-g"),
    c(p.start != null ? `${Math.round(p.start)}%` : dash),
    c(u ? pctTxt(u.avg?.pct ?? u.last.pct) : dash, last("pct"), "erc-g"),
    c(u && u.pos !== "QB" ? pctTxt(u.avg?.share ?? u.last.share) : dash, u && u.pos !== "QB" ? last("share") : ""),
    c(u ? pctTxt(u.avg?.rush ?? u.last.rush) : dash, last("rush")),
    c(u && u.pos !== "QB" ? `<span data-tip="${rzTip(u)}">${pctTxt(u.avg?.rz ?? u.last.rz)}</span>` : dash, u && u.pos !== "QB" ? last("rz") : ""),
    c(v != null ? fmtVal(v) : dash, "", "erc-g erc-x"),
  ].join("");
}
function erDeskHeadCells() {
  const h = (l, tip, cls = "") => `<div class="erc ${cls}" title="${tip}">${l}</div>`;
  return [h("Score", "Points this week over the projection"), h("PPR rk", "ESPN experts' average PPR rank this week, at the position", "erc-g"), h("Pos rk", "Season rank at the position"),
    h("PPG", "Fantasy points per game this season"), h("Tot", "Total fantasy points this season"), h("Last", "Last week's points"),
    h("%Rost", "Percent of leagues that roster him", "erc-g"), h("%Start", "Percent of leagues that start him"),
    h("Snap", "Season share of snaps (last game underneath)", "erc-g"), h("Tgt", "Season share of team targets"), h("Rush", "Season share of team carries"),
    h("RZ", "Season share of the team's red-zone targets and carries (inside the 20)"),
    h("Value", "FantasyCalc trade value", "erc-g erc-x")].join("");
}
// The Starters total row: this week's score and projection, and the lineup's PPG, season and last-week points,
// lined up under whichever stat columns are showing.
function erTotalCells(list) {
  const dash = `<span class="muted">–</span>`;
  const c = (val = "", sub = "", cls = "") => `<div class="erc ${cls}">${val}${sub ? `<small>${sub}</small>` : ""}</div>`;
  const tot = (k) => (list.some((p) => p[k] != null) ? f1(sum(list, (p) => p[k] || 0)) : dash);
  const score = c(list.some((p) => p.played) ? f2(sum(list, (p) => p.actual || 0)) : dash, f1(sum(list, (p) => p.proj || 0)));
  if (DESK.matches) {
    const cells = Array.from({ length: 13 }, () => null), cls = ["", "erc-g", "", "", "", "", "erc-g", "", "erc-g", "", "", "", "erc-g erc-x"];
    cells[0] = score; cells[3] = c(tot("seasonAvg")); cells[4] = c(tot("seasonPts")); cells[5] = c(tot("lastPts"));
    return cells.map((x, i) => x || c("", "", cls[i])).join("");
  }
  const v = erView(), cells = Array.from({ length: erHeads(v).length }, () => c());
  if (v === "matchup") cells[0] = score;
  else if (v === "scoring") { cells[1] = c(tot("seasonAvg")); cells[2] = c(tot("seasonPts")); cells[3] = c(tot("lastPts")); cells[4] = c(f1(sum(list, (p) => p.proj || 0))); }
  return cells.join("");
}
const erColsAll = (p) => (DESK.matches ? erDeskCells(p) : erCols(p).join(""));
const erHeadsAll = () => (DESK.matches ? erDeskHeadCells() : erHeads().join(""));
// Roster rail (computers): this week's matchup at a glance and the latest news for the team on screen.
function rosterRail(sel, side) {
  const w = state.week, m = w.matchups.find((x) => [x.home?.teamId, x.away?.teamId].map(String).includes(String(sel)));
  let mu = "";
  if (m?.away) {
    const st = w.status, val = (sd) => (st === "upcoming" ? f1(sd.proj) : f2(sd.score));
    const tds = (sd) => sum(sd.starters, (p) => p.tds || 0);
    const line = (sd) => `<div class="rr-team ${String(sd.teamId) === String(sel) ? "me" : ""}">${logoImg(team(sd.teamId), 28)}<span class="rr-name">${esc(team(sd.teamId).name)}</span><strong>${val(sd)}</strong></div>`;
    mu = `<div class="card rr-card"><div class="rr-head">Week ${w.week} matchup ${statusBadge(st)}</div><div class="rr-vs">${line(m.home)}${line(m.away)}</div>
      <div class="rr-wp"><span>${pct(m.wp)}</span><span class="mt-wp"><i style="width:${m.wp * 100}%"></i></span><span>${pct(1 - m.wp)}</span></div>
      <div class="rr-sub muted small">${tds(m.home)} TD – ${tds(m.away)} TD</div>
      <button type="button" class="pg-go" data-rr-mu="${m.id}">Open the matchup ›</button></div>`;
  }
  let news = "";
  if (side) {
    const d = ensureNews(side.players.map((p) => p.id), () => { if (state.tab === "roster") render(); });
    const items = !d ? null : side.players.flatMap((p) => (d.players[p.id] || []).map((n) => ({ p, n })))
      .filter(({ n }) => Date.now() - Date.parse(n.published) < 7 * 864e5).sort((a, b) => Date.parse(b.n.published) - Date.parse(a.n.published));
    news = `<div class="card rr-card rr-news-card"><div class="rr-head">${ic("news")} News <span class="muted small">last 7 days</span></div>
      ${!items ? `<div class="loading small"><span class="spinner"></span> Loading news…</div>` : items.length ? `<div class="rr-news">${items.slice(0, 6).map(({ p, n }) => newsItem(n, `<span class="news-who">${plinkNm(p)}</span>`)).join("")}</div>${items.length > 6 ? `<button type="button" class="link-btn" data-chip="news">All news (${items.length}) ›</button>` : ""}` : `<p class="muted small">No player updates this week.</p>`}</div>`;
  }
  return mu + news;
}

// ---------- A team's roster as a popup (from the League tab) ----------
// The same rows as the Roster tab, read only (plus + / ⇄ buttons when you're signed in as owner).
function openTeamRoster(teamId) {
  const w = state.week, t = team(teamId), side = w.sides.find((x) => String(x.teamId) === String(teamId));
  const row = (p) => `<div class="er-row ${gsState(p)}"><div class="er-l"><span class="sp ro">${p.slotId === BENCH ? "BE" : esc(SLOT[p.slotId] || p.slot)}</span>${headshot(p, 36)}<div class="er-info">
      <div class="er-name">${plink(p.id, shortName(p.name))} ${p.posId === 16 ? "" : proIc(p.proId)}<span class="er-pos">${esc(p.pos)}</span>${injBadge(p)} ${moveBtns(p)}</div>
      <div class="er-game">${erGameLine(p)}</div><div class="er-stats" ${p.short ? `title="${esc(p.line)}"` : ""}>${p.short ? esc(p.short) : "&nbsp;"}</div></div></div>
    <div class="er-r rs">${erCols(rosteredRow(p)).join("")}</div></div>`;
  const section = (title, list) => (list.length ? `<div class="er-sec"><div class="er-row er-hd"><div class="er-l">${title}</div><div class="er-r rs">${erHeads().join("")}</div></div>${list.map(row).join("")}</div>` : "");
  const body = !side ? `<p class="muted">No lineup for week ${w.week}.</p>`
    : section("Starters", side.starters) + section("Bench", side.bench.filter((p) => p.slotId !== IR)) + section("IR", side.bench.filter((p) => p.slotId === IR));
  showModal(`<div class="pm-head">${logoImg(t, 44)}<div><h2 id="pl-modal-title">${esc(t.name)}</h2><div class="muted small">${esc(t.owner)} · ${recordStr(t)}${side ? ` · week ${w.week}: ${w.status === "upcoming" ? `proj ${f1(side.proj)}` : f2(side.score)}` : ""}</div></div></div>
    <div class="card er-table tr-pop ev-${erView()}">${body}</div>
    <button type="button" class="pg-go" id="tr-go">Open on the Roster tab ›</button>`);
  $("pl-modal").querySelector(".modal-card").classList.add("pm-full");
  // The stat columns of every row scroll together.
  const strips = [...$("pl-modal-body").querySelectorAll(".rs")];
  let syncing = false;
  for (const stp of strips) stp.addEventListener("scroll", () => {
    if (syncing) return;
    syncing = true;
    for (const o of strips) if (o !== stp) o.scrollLeft = stp.scrollLeft;
    requestAnimationFrame(() => { syncing = false; });
  }, { passive: true });
  $("tr-go").addEventListener("click", () => { document.querySelector("#pl-modal .modal-close").click(); state.rosterTeam = String(teamId); switchTab("roster"); });
}
// Team names on the League tab open that team's roster.
document.addEventListener("click", (e) => {
  const c = e.target.closest("[data-tpop]");
  if (!c || e.target.closest("button, a") || !e.target.closest("#view-season, #view-managers, #view-transactions, #view-trade, #view-history")) return;
  openTeamRoster(c.dataset.tpop);
});

// ---------- Roster tab (laid out like the ESPN app) ----------
// Header card with quick chips, Quick Lineup and a Views menu, then Starters / Bench / IR. Each row is
// a slot pill, photo and three lines of info on the left, and the chosen view's columns on the right;
// the columns scroll sideways together. On your own team the slot pills are how you move players.
const ER_VIEWS = [["matchup", "Matchup stats"], ["scoring", "Scoring"], ["research", "Research"], ["usage", "Usage"], ["schedule", "Schedule"], ["rankings", "PPR rankings"]];
const erView = () => (ER_VIEWS.some(([k]) => k === state.erView) ? state.erView : (state.erView = store.get("ffb.erview") || "matchup"));
const irOK = (p) => /INJURY_RESERVE|OUT|SUSPENSION/.test(p.injury || "");
// Can a and b trade lineup spots? (IR only takes players listed out or on IR.)
function canMove(a, b) {
  if (String(a.id) === String(b.id) || a.locked || b.locked || a.slotId === b.slotId) return false;
  const fits = (p, slot) => slot === BENCH || (slot === IR ? irOK(p) : p.eligible.includes(slot));
  return fits(a, b.slotId) && fits(b, a.slotId);
}
const rosterSize = () => sum(Object.entries(state.base.slotCounts).filter(([k]) => Number(k) !== IR), ([, n]) => n);
// Difficulty colors for an opponent rank (1st = toughest).
const rkCls = (r) => (!r ? "" : r <= 10 ? "tough" : r >= 23 ? "easy" : "");
// Computers show these views side by side instead of one at a time.
const ER_DESK = ["matchup", "scoring", "usage"];
function erCols(p, v = erView()) {
  const dash = `<span class="muted">–</span>`;
  const c = (val, sub = "") => `<div class="erc">${val}${sub ? `<small>${sub}</small>` : ""}</div>`;
  if (v === "scoring") return [c(p.posRank ? `${esc(p.pos)}${p.posRank}` : dash), c(p.seasonAvg != null ? f1(p.seasonAvg) : dash), c(p.seasonPts != null ? f1(p.seasonPts) : dash), c(p.lastPts != null ? f1(p.lastPts) : dash), c(f1(p.proj))];
  if (v === "research") {
    const r = p.opp?.rank;
    return [c(r ? `<span class="rk ${rkCls(r)}">${ordinal(r)}</span>` : dash), c(p.own != null ? f1(p.own) : dash), c(p.start != null ? f1(p.start) : dash),
      c(p.ownChg != null ? `<span class="${p.ownChg > 0 ? "pos" : p.ownChg < 0 ? "neg" : ""}">${p.ownChg > 0 ? "+" : ""}${f1(p.ownChg)}</span>` : dash)];
  }
  if (v === "usage") {
    const u = usageOf(p.id);
    const avg = (k) => pctTxt(u.avg?.[k] ?? u.last[k]), last = (k) => `last ${pctTxt(u.last[k])}`;
    return [c(u ? avg("pct") : dash, u ? last("pct") : ""), c(u && u.pos !== "QB" ? avg("share") : dash, u && u.pos !== "QB" ? last("share") : ""), c(u ? avg("rush") : dash, u ? last("rush") : ""),
      c(u && u.pos !== "QB" ? avg("rz") : dash, u && u.pos !== "QB" ? last("rz") : "")];
  }
  if (v === "schedule") {
    const nfl = state.week?.nfl, sched = nfl?.sched?.[p.proId], out = [c(nfl?.byes?.[p.proId] || dash)];
    for (let wk = state.week.week; wk <= state.base.weeks; wk++) {
      const g = sched?.[state.base.scoringPeriodFor(wk)];
      if (!g) { out.push(c(sched ? `<span class="muted">BYE</span>` : dash)); continue; }
      const r = nfl.oprk?.[p.posId]?.[g[0]]?.[0];
      out.push(c(`<span class="rk ${rkCls(r)}" title="${r ? `${ordinal(r)} vs ${esc(p.pos)}s` : ""}">${g[1] ? "" : "@"}${esc(PRO[g[0]] || "")}</span>`, r ? ordinal(r) : ""));
    }
    return out;
  }
  if (v === "rankings") {
    const ex = p.expertRanks || [];
    return [c(p.pprRank ? `${esc(p.pos)}${Math.round(p.pprRank)}` : dash), c(ex.length ? `${Math.min(...ex)}–${Math.max(...ex)}` : dash, ex.length ? `${ex.length} experts` : ""),
      c(valueOf(p.id) ? fmtVal(valueOf(p.id)) : dash)];
  }
  // Matchup stats: points (or a dash) over the projection.
  return [c(p.played ? ptsLink(p.id, state.week.sp, f2(p.actual)) : dash, f1(p.proj))];
}
function erHeads(v = erView()) {
  const h = (l, tip = "") => `<div class="erc" ${tip ? `title="${tip}"` : ""}>${l}</div>`;
  if (v === "scoring") return [h("Pos rk", "Season rank at the position"), h("Avg", "Points per game this season"), h("Pts", "Season points"), h("Last", "Last week"), h("Proj", "This week's projection")];
  if (v === "research") return [h("Opp rk", "Opponent's rank vs. the position (1st = toughest)"), h("%Rost"), h("%Start"), h("+/-", "Change in % rostered")];
  if (v === "usage") return [h("Snap", "Season average share of snaps, last game underneath"), h("Tgt", "Season share of team targets, last game underneath"), h("Rush", "Season share of team carries, last game underneath"), h("RZ", "Season share of the team's red-zone targets and carries (inside the 20), last game underneath")];
  if (v === "schedule") return [h("Bye"), ...Array.from({ length: state.base.weeks - state.week.week + 1 }, (_, i) => h(`Wk ${state.week.week + i}`))];
  if (v === "rankings") return [h("Avg", "ESPN experts' average PPR rank this week"), h("Range", "Best to worst expert rank"), h("Value", "FantasyCalc trade value")];
  return [h("Score", "Points this week over the projection")];
}
// "Sun 12:00 PM @ATL (19th)", or the live clock / final score, plus a small weather icon.
function erGameLine(p) {
  const g = gameStatusOf(p), r = p.opp?.rank, wx = ""; // weather left out to save room
  const opp = (abbr, home) => `<span class="rk ${rkCls(r)}">${home ? "" : "@"}${esc(abbr)}${r ? ` (${ordinal(r)})` : ""}</span>`;
  const kick = (d) => new Date(d).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
  if (g?.oppAbbr) {
    const when = g.state === "pre" ? kick(g.date) : g.state === "in" ? `<span class="mx-clock">${esc((g.detail || "").replace(" - ", " "))}</span> ${g.score ?? ""}-${g.oppScore ?? ""}` : `Final ${g.score ?? ""}-${g.oppScore ?? ""}`;
    return `${when} ${opp(g.oppAbbr, g.home)}${wx ? ` ${wx}` : ""}`;
  }
  if (p.opp?.bye) return `<span class="bye-tag">BYE</span>`;
  return p.opp?.team ? `${p.opp.date ? kick(p.opp.date) : ""} ${opp(p.opp.team, p.opp.home)}${wx ? ` ${wx}` : ""}` : "";
}

// Roster chips: each opens its own popup.
// "My team": anyone can say which team is theirs (saved on this device), so Live, Matchup and the rest open on it.
// Signed-in owners get theirs automatically.
function openPickTeam() {
  const mine = myTeamId(), owner = ownerTeam();
  const head = `<div class="pm-head"><div><h2 id="pl-modal-title">${ic("user")} My team</h2><div class="muted small">${owner ? "You're signed in, so your team is set automatically." : "Pick your team and Live, Matchup and the Roster open on it. Saved on this device."}</div></div></div>`;
  if (owner) return showModal(`${head}<div class="mt-list"><div class="mt-pick on">${logoImg(team(owner), 30)}<span class="mt-main"><strong>${esc(team(owner).name)}</strong><span class="muted small">${esc(team(owner).owner)} · ${recordStr(team(owner))}</span></span><span class="pos">✓</span></div></div>`);
  const ids = Object.keys(state.base.teams).sort((a, b) => team(a).name.localeCompare(team(b).name));
  showModal(`${head}<div class="mt-list">${ids.map((id) => `<button type="button" class="mt-pick ${String(id) === String(mine) ? "on" : ""}" data-mypick="${esc(id)}">${logoImg(team(id), 30)}<span class="mt-main"><strong>${esc(team(id).name)}</strong><span class="muted small">${esc(team(id).owner)} · ${recordStr(team(id))}</span></span>${String(id) === String(mine) ? `<span class="pos">✓</span>` : ""}</button>`).join("")}</div>`);
}
function chooseMyTeam(id) {
  setMyTeam(id);
  Object.assign(state, { rosterTeam: String(id), openMatchup: null, winWin: null, preDrawn: {} });
  document.querySelector("#pl-modal .modal-close")?.click();
  updateEspnLink();
  render();
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-mypick]");
  if (b) { chooseMyTeam(b.dataset.mypick); return; }
  if (e.target.closest("[data-pickteam]")) openPickTeam();
});
function chipPopup(kind, teamId, side) {
  const t = team(teamId);
  const head = (icon, title, sub = "") => `<div class="pm-head">${logoImg(t, 40)}<div><h2 id="pl-modal-title">${icon} ${title}</h2><div class="muted small">${esc(t.name)}${sub ? ` · ${sub}` : ""}</div></div></div>`;
  const reopen = () => { if (!$("pl-modal").hidden && state.chipOpen === kind) chipPopup(kind, teamId, side); };
  state.chipOpen = kind;
  if (kind === "myteam") return openPickTeam();
  if (kind === "news") {
    const d = side ? ensureNews(side.players.map((p) => p.id), reopen) : null;
    if (!d) return showModal(`${head(ic("news"), "News")}<div class="loading small"><span class="spinner"></span> Loading news…</div>`);
    const items = side.players.flatMap((p) => (d.players[p.id] || []).map((n) => ({ p, n, isNew: unreadNews(String(p.id), d.players[p.id]).includes(n) })))
      .filter(({ n }) => Date.now() - Date.parse(n.published) < 7 * 864e5)
      .sort((a, b) => Date.parse(b.n.published) - Date.parse(a.n.published));
    showModal(`${head(ic("news"), "News", "last 7 days")}${items.length ? `<div class="news chip-news">${items.map(({ p, n, isNew }) => newsItem(n, `${isNew ? `<span class="badge live news-new">NEW</span>` : ""}<span class="news-who">${plinkNm(p)}${injBadge(p)}</span>`)).join("")}</div>${newsCredit()}` : `<p class="muted">No player updates in the last week.</p>`}`);
    for (const p of side.players) markNewsRead(String(p.id), d.players[p.id]); // the red icons clear when you close this
    return;
  }
  if (kind === "claims" || kind === "trades") {
    const P = ensurePending();
    const list = (P?.pending || []).filter((x) => (kind === "trades") === /TRADE/.test(x.type));
    const next = nextWaiverRun(), deadline = state.base.raw.settings?.tradeSettings?.deadlineDate;
    const sub = kind === "claims" ? (next ? `next waiver run ${fmtWhen(next)}` : "") : (deadline ? `trade deadline ${fmtWhen(deadline)}` : "");
    const body = !P ? `<div class="loading small"><span class="spinner"></span> Loading from ESPN…</div>`
      : list.length ? `<div class="pd-pop" data-pdk="${kind}">${sortPending(list).map((x) => pendingRow(x, (P.teams || [Number(teamId)]).map(Number))).join("")}${kind === "claims" ? claimHint(list) : ""}</div>`
      : `<p class="muted">${kind === "claims" ? "No pending waiver claims." : "No pending trade offers."}</p>`;
    showModal(`${head(ic(kind === "claims" ? "clipboard-list" : "arrows-exchange"), kind === "claims" ? "Claims" : "Trades", sub)}${body}
      ${kind === "trades" ? `<button type="button" class="pg-go" id="chip-ta">Build a trade in the Trade Analyzer ›</button>` : ""}`);
    $("chip-ta")?.addEventListener("click", () => { document.querySelector("#pl-modal .modal-close").click(); switchTab("trade"); });
    if (!P) setTimeout(reopen, 1500);
    return;
  }
  if (kind === "deadline") {
    const ts = state.base.raw.settings?.tradeSettings || {}, dl = ts.deadlineDate;
    const days = dl ? Math.ceil((dl - Date.now()) / 864e5) : null;
    return showModal(`${head(ic("calendar"), "Trade deadline")}
      <div class="chip-big">${dl ? fmtWhen(dl) : "No deadline set"}</div>
      ${days != null ? `<p class="muted">${days > 0 ? `${days} day${days === 1 ? "" : "s"} left to make trades.` : "The trade deadline has passed."}</p>` : ""}
      <ul class="chip-facts">${ts.revisionHours ? `<li>Accepted trades wait <strong>${ts.revisionHours} hours</strong> for league review before they go through.</li>` : ""}
        ${ts.vetoVotesRequired ? `<li><strong>${ts.vetoVotesRequired}</strong> veto votes cancel a trade.</li>` : ""}</ul>`);
  }
  if (kind === "waivers") {
    const teams = (state.base.raw.teams || []).filter((x) => x.waiverRank).sort((a, b) => a.waiverRank - b.waiverRank);
    const next = nextWaiverRun(), days = waiverDays();
    return showModal(`${head(ic("list-numbers"), "Waivers", waiverPlace(teamId) ? `${waiverPlace(teamId)}` : "")}
      <p class="muted small">${next ? `Next run ${fmtWhen(next)}` : "Waivers run overnight"}${days ? ` · runs ${days}` : ""}</p>
      <ol class="chip-order">${teams.map((x) => `<li class="${String(x.id) === String(teamId) ? "me" : ""}"><span class="wv-rk">${x.waiverRank}</span>${logoImg(team(x.id), 20)}<span>${esc(team(x.id).name)}</span></li>`).join("")}</ol>`);
  }
  if (kind === "awards") {
    const tally = ensureAwardTally(reopen);
    if (!tally) return showModal(`${head(ic("trophy"), "Awards")}<div class="loading small"><span class="spinner"></span> Counting weekly awards…</div>`);
    const mine = tally[teamId] || {};
    const won = AWARD_ORDER.filter((k) => mine[k]?.length);
    const total = sum(won, (k) => mine[k].length);
    const rank = 1 + Object.values(state.base.teams).filter((o) => o.seed < t.seed).length;
    const pfRank = 1 + Object.values(state.base.teams).filter((o) => o.pf > t.pf).length;
    return showModal(`${head(ic("trophy"), "Awards", `${total} weekly award${total === 1 ? "" : "s"} this season`)}
      <div class="pm-sheet"><div><span>Standing</span><strong>${ordinal(rank)}</strong></div><div><span>Record</span><strong>${recordStr(t)}</strong></div><div><span>Points for</span><strong>${f1(t.pf)}</strong><small>${ordinal(pfRank)}</small></div><div><span>Awards</span><strong>${total}</strong></div></div>
      ${won.length ? `<div class="chip-awards">${won.map((k) => `<div class="chip-award">${awardIcon(k, 26)}<div><strong>${AWARD_NAMES[k]}</strong><span class="muted small">Week${mine[k].length > 1 ? "s" : ""} ${mine[k].join(", ")}</span></div><b>×${mine[k].length}</b></div>`).join("")}</div>`
        : `<p class="muted">No weekly awards yet this season.</p>`}
      <p class="small muted">Weekly awards from the Standings tab, regular season.</p>`);
  }
}

function renderRoster() {
  ensureValues(); // trade values fill in when they arrive
  ensureWeather(); // game-day forecasts fill in when they arrive
  ensureUsage(); // snap counts and targets fill in when they arrive
  ensureGameStatus(); // game lines and live highlighting
  const w = state.week, el = $("view-roster");
  const ids = Object.keys(state.base.teams).sort((a, b) => team(a).name.localeCompare(team(b).name));
  const key = `ffb.rosterteam.${state.leagueId || "default"}`;
  let sel = state.rosterTeam || ownerTeam() || store.get(key) || myTeamId();
  if (!state.base.teams[sel]) sel = ids[0];
  state.rosterTeam = sel;
  const t = team(sel);
  const side = w.sides.find((x) => String(x.teamId) === String(sel));
  const standing = 1 + Object.values(state.base.teams).filter((o) => o.seed < t.seed).length;
  const fa = faData();
  const own = ensureOwner();
  const canEdit = !!own?.signedIn && own.teams?.map(String).includes(String(sel)) && w.week === state.base.current;
  const ed = !canEdit ? null : state.lineupEdit?.teamId === String(sel) ? state.lineupEdit : (state.lineupEdit = { teamId: String(sel), pick: null });
  const picked = ed?.pick ? side?.players.find((x) => String(x.id) === String(ed.pick)) : null;
  const rn = side ? ensureNews(side.players.map((p) => p.id), () => { if (state.tab === "roster") render(); }) : null;
  const unread = (p) => !!rn && unreadNews(String(p.id), rn.players?.[p.id]).length > 0;
  // Only used for Quick Lineup's moves and the ✓ next to Starters (the card itself isn't shown here).
  const lc = side ? lineupCheck(side, w, canEdit) : "";

  // Slot pill: the label, and on your team the way to pick a player and where he can go.
  const pill = (p) => {
    const label = p.slotId === BENCH ? "BE" : esc(SLOT[p.slotId] || p.slot);
    if (!canEdit) return `<span class="sp ro">${label}</span>`;
    if (p.locked) return `<span class="sp locked" title="Locked: his game has started">${label}</span>`;
    if (!picked) return `<button type="button" class="sp" data-sp="${esc(p.id)}" title="Move ${esc(p.name)}">${label}</button>`;
    if (String(picked.id) === String(p.id)) return `<button type="button" class="sp on" data-sp="${esc(p.id)}" title="Cancel">${label}</button>`;
    return canMove(picked, p) ? `<button type="button" class="sp tgt" data-sp="${esc(p.id)}" title="Swap with ${esc(picked.name)}">${label}</button>` : `<span class="sp dim">${label}</span>`;
  };
  const row = (p) => {
    const n = fa && !fa.error ? upgradesFor(p, fa).length : 0;
    const upg = n ? ` <button type="button" class="upg-btn er-upg" data-pid="${esc(p.id)}" title="${n} available ${esc(p.pos)}${n > 1 ? "s" : ""} projected at least ${UPGRADE_MIN_GAIN} points higher">▲${n >= 10 ? "10+" : n}</button>` : "";
    const trade = actTeam() && String(sel) !== actTeam() ? ` ${moveBtns(p)}` : "";
    return `<div class="er-row ${gsState(p)} ${picked && String(picked.id) === String(p.id) ? "picked" : ""}">
      <div class="er-l">${pill(p)}${headshot(p, 40)}<div class="er-info">
        <div class="er-name">${plink(p.id, shortName(p.name))} ${p.posId === 16 ? "" : proIc(p.proId)}<span class="er-pos">${esc(p.pos)}</span>${injBadge(p)}${unread(p) ? newsDot(p) : ""}${trade}</div>
        <div class="er-sub">${p.own != null ? `${Math.round(p.own)}% Rost` : ""}${p.start != null ? ` <span class="er-bar">|</span> ${Math.round(p.start)}% Start` : ""}${upg}</div>
        <div class="er-game">${erGameLine(p)}</div>
        <div class="er-stats" ${p.short ? `title="${esc(p.line)}"` : ""}>${p.short ? esc(p.short) : "&nbsp;"}</div>
      </div></div>
      <div class="er-r rs">${erColsAll(rosteredRow(p))}</div></div>`;
  };
  // Empty spots you can move a picked player into: the bench, or an open IR slot.
  const irCount = side ? side.players.filter((p) => p.slotId === IR).length : 0, irSlots = state.base.slotCounts[IR] || 0;
  const toBench = picked && picked.slotId !== BENCH && !picked.locked;
  const toIR = picked && picked.slotId !== IR && irOK(picked) && irCount < irSlots;
  const emptyRow = (slot, label) => `<div class="er-row empty"><div class="er-l"><button type="button" class="sp tgt" data-empty="${slot}">${slot === IR ? "IR" : "BE"}</button><div class="er-info"><div class="er-name muted">${label}</div></div></div><div class="er-r rs"></div></div>`;
  const section = (title, list, extra = "") => (list.length || extra) ? `<div class="er-sec">
      <div class="er-row er-hd"><div class="er-l">${title}</div><div class="er-r rs">${erHeadsAll()}</div></div>
      ${list.map(row).join("")}${extra}</div>` : "";

  let table = `<p class="muted">${esc(t.name)} has no lineup for week ${w.week}.</p>`;
  if (side) {
    const bench = side.bench.filter((p) => p.slotId !== IR), ir = side.bench.filter((p) => p.slotId === IR);
    const tick = lc === LINEUP_OK ? ` <span class="lc-tick" title="Lineup is optimal by ESPN's week ${w.week} projections">✓</span>` : "";
    table = section(`${canEdit ? "Edit starters" : "Starters"}${tick}`, side.starters, side.starters.length ? `<div class="er-row er-total"><div class="er-l"><strong>Starters total</strong></div><div class="er-r rs">${erTotalCells(side.starters)}</div></div>` : "")
      + section(canEdit ? "Edit bench" : "Bench", bench, toBench ? emptyRow(BENCH, picked.slotId === IR && side.players.filter((p) => p.slotId !== IR).length >= rosterSize() ? "Move to bench (needs a drop)" : "Move to bench") : "")
      + section("IR", ir, toIR ? emptyRow(IR, "Move to IR") : "");
  }

  // Header card, ESPN style, with quick chips underneath.
  const st = w.status;
  const isMine = String(myTeamId()) === String(sel);
  const P = canEdit ? ensurePending() : null;
  const claims = (P?.pending || []).filter((x) => !/TRADE/.test(x.type)).length, offers = (P?.pending || []).filter((x) => /TRADE/.test(x.type)).length;
  const anyNews = side && side.players.some(unread);
  const deadline = state.base.raw.settings?.tradeSettings?.deadlineDate;
  const chip = (k, icon, label, sub) => `<button type="button" class="er-chip" data-chip="${k}"><span class="er-chip-t">${icon} ${label}</span><span class="er-chip-s">${sub}</span></button>`;
  const tally = state.awardTally && state.awardTally !== "loading" ? state.awardTally[sel] : null;
  const nAwards = tally ? sum(Object.values(tally), (wks) => wks.length) : null;
  const chips = [
    chip("news", ic("news"), "News", anyNews ? `<i class="er-dot"></i> New` : "Latest"),
    waiverPlace(sel) ? chip("waivers", ic("list-numbers"), "Waivers", waiverPlace(sel)) : "",
    canEdit ? chip("claims", ic("clipboard-list"), "Claims", P ? `${claims} pending` : "…") : "",
    canEdit ? chip("trades", ic("arrows-exchange"), "Trades", P ? `${offers} offer${offers === 1 ? "" : "s"}` : "…") : "",
    deadline ? chip("deadline", ic("calendar"), "Trade deadline", new Date(deadline).toLocaleString(undefined, { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })) : "",
    chip("myteam", ic("user"), "My team", myTeamId() ? esc(team(myTeamId()).abbrev || team(myTeamId()).name) : "Select"),
    chip("awards", ic("trophy"), "Awards", nAwards == null ? "View" : `${nAwards} award${nAwards === 1 ? "" : "s"}`),
  ].join("");
  const opts = ids.map((id) => `<option value="${id}" ${id === String(sel) ? "selected" : ""}>${esc(team(id).name)}</option>`).join("");
  const head = `<div class="card er-head">
      <div class="er-top">${logoImg(t, 48)}<div class="er-id">${ids.length > 1 ? `<label class="er-pick"><strong>${esc(t.name)} <span class="caret" aria-hidden="true">▾</span></strong><select id="roster-team" aria-label="Show team">${opts}</select></label>` : `<strong>${esc(t.name)}</strong>`}
          <span class="muted small">${esc(t.owner)} · ${recordStr(t)} · ${ordinal(standing)} <button type="button" class="my-star ${isMine ? "on" : ""}" id="my-star" title="${ownerTeam() ? "Your team is set by your ESPN sign-in" : isMine ? "This is your team" : "Make this my team"}">${isMine ? "★" : "☆"}</button></span></div>
        ${side ? `<div class="er-score"><strong>${st === "upcoming" ? "0.0" : f1(side.score)}</strong><small>${f1(st === "live" ? side.liveProj : side.proj)}</small></div>` : ""}</div>
      <div class="er-chips">${chips}</div></div>`;
  const viewLabel = ER_VIEWS.find(([k]) => k === erView())[1];
  const tools = side ? `<div class="er-tools">${canEdit ? `<button type="button" class="er-btn" id="er-quick">Quick Lineup</button>` : ""}<button type="button" class="er-btn" id="er-views">${viewLabel} <span class="caret">▾</span></button></div>` : "";
  const moving = picked ? `<div class="er-moving"><span>Moving <strong>${esc(picked.name)}</strong>: tap a highlighted spot</span><span class="rh-edit-btns"><button type="button" class="mv-cancel" id="mv-drop">Drop</button><button type="button" class="mv-done" id="mv-done">Cancel</button></span></div>` : "";
  el.innerHTML = DESK.matches
    ? `<div class="er-layout"><div class="er-main">${moving}<div class="card er-table ev-desk">${table}</div>${side ? playoffSchedule(side) : ""}</div>
        <aside class="er-rail">${head}${canEdit && side ? `<button type="button" class="er-btn er-quick-btn" id="er-quick">Quick Lineup</button>` : ""}${rosterRail(sel, side)}</aside></div>${fcCredit()}${nvCredit()}${wxCredit()}`
    : `${head}${tools}${moving}
    <div class="card er-table ev-${erView()}">${table}</div>
    ${side ? playoffSchedule(side) : ""}
    ${fcCredit()}${nvCredit()}${wxCredit()}`;
  el.querySelector("[data-rr-mu]")?.addEventListener("click", (e) => { const id = +e.currentTarget.dataset.rrMu; switchTab("matchups"); state.openMatchup = id; renderMatchups(); });

  fitNames(el);
  $("roster-team")?.addEventListener("change", (e) => { state.rosterTeam = e.target.value; store.set(key, e.target.value); renderRoster(); });
  $("my-star").addEventListener("click", () => { if (ownerTeam()) return; setMyTeam(sel); state.winWin = null; updateEspnLink(); renderRoster(); });
  el.querySelectorAll("[data-chip]").forEach((b) => b.addEventListener("click", () => {
    state.modalReturn = b;
    if (b.dataset.chip === "alerts") return openNotifications();
    if (b.dataset.chip === "owner") return openOwnerSignIn();
    chipPopup(b.dataset.chip, sel, side);
  }));
  $("er-views")?.addEventListener("click", () => {
    showModal(`<div class="pm-head"><h2 id="pl-modal-title">Views</h2></div><div class="er-menu">${ER_VIEWS.map(([k, label]) => `<button type="button" data-ev="${k}" class="${erView() === k ? "on" : ""}">${label}${erView() === k ? " <span>✓</span>" : ""}</button>`).join("")}</div>`);
    $("pl-modal-body").querySelectorAll("[data-ev]").forEach((b) => b.addEventListener("click", () => {
      state.erView = b.dataset.ev; store.set("ffb.erview", b.dataset.ev); state.erScroll = 0;
      document.querySelector("#pl-modal .modal-close").click(); renderRoster();
    }));
  });
  $("er-quick")?.addEventListener("click", () => {
    if (state.lcMoves?.length) confirmLineup(sel, state.lcMoves);
    else showModal(`<div class="pm-head"><h2 id="pl-modal-title">Quick Lineup</h2></div><p>Your lineup is already the best one by ESPN's projections. ✓</p>`);
  });
  // The column area of every row scrolls together.
  const strips = [...el.querySelectorAll(".rs")];
  let syncing = false;
  for (const stp of strips) {
    stp.scrollLeft = state.erScroll || 0;
    stp.addEventListener("scroll", () => {
      if (syncing) return;
      syncing = true;
      state.erScroll = stp.scrollLeft;
      for (const o of strips) if (o !== stp) o.scrollLeft = stp.scrollLeft;
      requestAnimationFrame(() => { syncing = false; });
    }, { passive: true });
  }
  // Roster moves with the slot pills.
  el.querySelectorAll("[data-sp]").forEach((b) => b.addEventListener("click", () => {
    const p = side.players.find((x) => String(x.id) === b.dataset.sp);
    if (!picked || b.classList.contains("on")) { state.lineupEdit.pick = picked ? null : p.id; renderRoster(); return; }
    confirmLineup(sel, [[picked, p.slotId], [p, picked.slotId]]);
  }));
  el.querySelectorAll("[data-empty]").forEach((b) => b.addEventListener("click", () => {
    const slot = Number(b.dataset.empty);
    const needDrop = slot === BENCH && picked.slotId === IR && side.players.filter((p) => p.slotId !== IR).length >= rosterSize();
    confirmLineup(sel, [[picked, slot]], { needDrop, side });
  }));
  $("mv-done")?.addEventListener("click", () => { state.lineupEdit.pick = null; renderRoster(); });
  $("mv-drop")?.addEventListener("click", () => { const p = picked; state.lineupEdit.pick = null; confirmDrop(sel, p); });
  el.querySelectorAll(".upg-btn[data-pid]").forEach((b) => b.addEventListener("click", () => {
    const p = side.players.find((x) => String(x.id) === b.dataset.pid);
    if (p) { state.modalReturn = b; openUpgrades(p); }
  }));
}

// ---------- League chat (owner only) ----------
// ESPN's league chat, read and written through the owner sign-in (netlify/functions/roster.mjs).
// The 💬 button replaces the ESPN button when you're signed in as owner.
// The league whose chats are open (the chat popup can switch between your leagues).
const curLid = () => String(state.base.raw?.id || state.leagueId || "");
const chatLid = () => state.chatLeague || curLid();
const chatParams = (extra = {}) => new URLSearchParams({ leagueId: chatLid(), season: state.base.season, ...extra });
async function chatGet(route, extra) {
  const r = await fetch(`/api/roster/${route}?${chatParams(extra)}`);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || `Request failed (${r.status})`);
  return d;
}
async function chatPost(route, body) {
  const r = await fetch(`/api/roster/${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ leagueId: chatLid(), season: state.base.season, ...body }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || `Request failed (${r.status})`);
  return d;
}
// Unread count on the button, for all your leagues: checked when the site loads and every few minutes.
const unreadOf = (d) => sum(d?.topics || [], (t) => t.unread || 0);
function ensureChatBadge() {
  if (Date.now() - (state.chatBadgeAt || 0) < 3 * 60e3) return;
  state.chatBadgeAt = Date.now();
  for (const l of LEAGUES) {
    chatGet("chat", { leagueId: l.id }).then((d) => { (state.chatCounts ||= {})[l.id] = unreadOf(d); paintChatBadge(); }).catch(() => {});
  }
}
function paintChatBadge() {
  const n = sum(Object.values(state.chatCounts || {}));
  const dot = $("chat-dot");
  if (dot) { dot.hidden = !n; dot.textContent = n > 9 ? "9+" : String(n || ""); }
}
setInterval(() => { if (document.visibilityState === "visible" && !$("chat-open")?.hidden) { state.chatBadgeAt = 0; ensureChatBadge(); } }, 3 * 60e3);
const chatTime = (ms) => {
  const d = new Date(ms), today = new Date();
  return d.toDateString() === today.toDateString() ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
};
// On computers the chat is a window that slides up out of the bar at the bottom right (the page stays
// usable behind it); on phones it fills the screen.
function chatShell(inner) {
  const m = $("pl-modal"), was = !m.hidden && m.classList.contains("chat-pop");
  showModal(inner);
  m.querySelector(".modal-card").classList.add("pm-full", "chat-card");
  if (!DESK.matches) return setDock(true);
  m.classList.add("chat-pop");
  document.body.classList.remove("modal-open");
  document.body.classList.add("chat-up");
  if (!was) { m.classList.remove("rise"); void m.offsetWidth; }
  m.classList.add("rise"); // (redrawing an open window keeps it in place)
}
function dropChatPop() {
  $("pl-modal")?.classList.remove("chat-pop", "rise");
  document.body.classList.remove("chat-up");
}
// Computers: the chat button leaves the header for a bar along the bottom right of the screen.
let chatHome = null;
function placeChatBtn() {
  const b = $("chat-open");
  if (!b) return;
  chatHome ||= { parent: b.parentElement, next: b.nextElementSibling };
  if (DESK.matches) { if (b.parentElement !== document.body) document.body.appendChild(b); }
  else if (b.parentElement !== chatHome.parent) chatHome.parent.insertBefore(b, chatHome.next);
  b.classList.toggle("chat-bar", DESK.matches);
  updateEspnLink();
}
// Unread numbers on the league buttons at the top of the chat popup.
function paintLgCounts() {
  for (const b of $("pl-modal-body")?.querySelectorAll("[data-chatlg]") || []) {
    const n = state.chatCounts?.[b.dataset.chatlg] || 0;
    let i = b.querySelector(".ct-unread");
    if (n && !i) { b.insertAdjacentHTML("beforeend", `<i class="ct-unread"></i>`); i = b.querySelector(".ct-unread"); }
    if (i) { if (n) i.textContent = n > 9 ? "9+" : String(n); else i.remove(); }
  }
}
// The list: league chat, your matchup opponent, then everyone else. Buttons on top switch between your
// leagues, each with its unread count. Opened from the 💬 button it starts on the league you're viewing.
async function openChat(lid) {
  if (typeof lid !== "string") lid = curLid();
  state.chatLeague = lid;
  state.chatView = "list";
  const other = lid !== curLid(); // logos and matchups only exist for the league on screen
  const lgBtns = () => (LEAGUES.length > 1 ? `<div class="ct-leagues">${LEAGUES.map((l) => `<button type="button" data-chatlg="${l.id}" class="ct-lg ${l.id === lid ? "active" : ""}">${esc(l.label.replace(/\s*League\s*$/i, ""))}${state.chatCounts?.[l.id] ? `<i class="ct-unread">${state.chatCounts[l.id] > 9 ? "9+" : state.chatCounts[l.id]}</i>` : ""}</button>`).join("")}</div>` : "");
  const head = () => `<div class="pm-head"><h2 id="pl-modal-title">${ic("message-circle")} League chat</h2></div>${lgBtns()}`;
  const bindLg = () => $("pl-modal-body").querySelectorAll("[data-chatlg]").forEach((b) => b.addEventListener("click", () => { if (b.dataset.chatlg !== state.chatLeague) openChat(b.dataset.chatlg); }));
  chatShell(`${head()}<div class="loading small"><span class="spinner"></span> Loading chats…</div>`);
  bindLg();
  // The other leagues' unread counts, so you can see which one has new messages without opening each.
  for (const l of LEAGUES) {
    if (l.id === lid) continue;
    chatGet("chat", { leagueId: l.id }).then((x) => { (state.chatCounts ||= {})[l.id] = unreadOf(x); paintChatBadge(); paintLgCounts(); }).catch(() => {});
  }
  let d;
  try { d = await chatGet("chat", { leagueId: lid }); state.chatList = { key: lid, data: d }; (state.chatCounts ||= {})[lid] = unreadOf(d); paintChatBadge(); }
  catch (e) { chatShell(`${head()}<div class="banner">${esc(e.message)}</div>`); bindLg(); return; }
  if (state.chatView !== "list" || state.chatLeague !== lid) return;
  const me = String(d.me.teamId ?? myTeamId());
  const wk = other ? null : state.weekCache?.[state.base.current];
  const mu = wk?.matchups?.find((m) => [m.home?.teamId, m.away?.teamId].map(String).includes(me));
  const opp = mu ? String(String(mu.home?.teamId) === me ? mu.away?.teamId : mu.home?.teamId) : null;
  const league = d.topics.filter((t) => t.type === "CHAT_ALL_MEMBERS");
  const vsOpp = d.topics.filter((t) => t.type !== "CHAT_ALL_MEMBERS" && t.members.length === 1 && String(t.members[0].teamId) === opp);
  const rest = d.topics.filter((t) => !league.includes(t) && !vsOpp.includes(t)).sort((a, b) => b.date - a.date);
  const row = (t, isLeague) => `<button type="button" class="ct-row" data-topic="${esc(t.id)}">
      ${isLeague ? `<span class="ct-ico">${ic("message-circle")}</span>` : `<span class="ct-ico">${other ? ic("user") : t.members.slice(0, 2).map((m) => (m.teamId != null ? logoImg(team(m.teamId), 26) : "")).join("")}</span>`}
      <span class="ct-main"><strong>${esc(t.title)}</strong>${!isLeague ? `<span class="muted small">${esc(t.members.map((m) => m.team).filter(Boolean).join(", "))}</span>` : ""}</span>
      <span class="ct-meta">${t.date ? `<span class="muted small">${chatTime(t.date)}</span>` : ""}${t.unread ? `<i class="ct-unread">${t.unread}</i>` : ""}</span></button>`;
  const group = (label, list, isLeague) => (list.length ? `<div class="ct-group">${label}</div>${list.map((t) => row(t, isLeague)).join("")}` : "");
  chatShell(`${head()}
    <div class="ct-list">${group("League chat", league, true)}${group("Matchup opponent", vsOpp)}${group("All chats", rest)}
      ${!d.topics.length ? `<p class="muted">No chats yet.</p>` : ""}</div>
    <button type="button" class="ct-new" id="ct-new" title="New chat" aria-label="New chat">${ic("pencil")}</button>`);
  $("pl-modal-body").querySelectorAll("[data-topic]").forEach((b) => b.addEventListener("click", () => {
    const t = d.topics.find((x) => x.id === b.dataset.topic);
    openChatTopic(t, d);
  }));
  $("ct-new").addEventListener("click", () => newChat(d));
  bindLg();
}
// One conversation, newest at the bottom, with a reply box. Refreshes every 15 seconds while open.
async function openChatTopic(t, list) {
  state.chatView = t.id;
  // Which messages are new: the ones unread when you opened it, plus anything that arrives while it's open.
  // The red dots go away once you leave (ESPN marks them read).
  const newN = t.unread || 0, openedAt = Date.now();
  const title = `<div class="ct-head"><button type="button" class="ct-back" id="ct-back" aria-label="Back to chats">‹</button><h2 id="pl-modal-title">${esc(t.title)}</h2></div>`;
  chatShell(`${title}<div class="ct-msgs" id="ct-msgs"><div class="loading small"><span class="spinner"></span> Loading messages…</div></div>
    <form class="ct-send" id="ct-send"><textarea id="ct-text" rows="1" maxlength="1000" placeholder="Message"></textarea><button type="submit">Send</button></form><p class="small" id="ct-msg"></p>`);
  $("ct-back").addEventListener("click", () => openChat(chatLid()));
  const box = $("ct-msgs");
  const load = async (stick) => {
    let c;
    try { c = await chatGet("chattopic", { topic: t.id }); } catch (e) { if (state.chatView === t.id) box.innerHTML = `<div class="banner">${esc(e.message)}</div>`; return; }
    if (state.chatView !== t.id || !$("ct-msgs")) return;
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    let lastDay = "";
    const others = c.messages.filter((m) => !m.mine);
    const fresh = new Set([...others.slice(Math.max(0, others.length - newN)), ...others.filter((m) => m.date > openedAt)].map((m) => m.id));
    const dot = (m) => (fresh.has(m.id) ? `<i class="ct-dot" title="New"></i>` : "");
    box.innerHTML = c.messages.map((m) => {
      const day = new Date(m.date).toDateString();
      const sep = day !== lastDay ? `<div class="ct-day">${new Date(m.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</div>` : "";
      lastDay = day;
      if (m.system) return `${sep}<div class="ct-sys"><strong>${dot(m)}${esc(m.title)}</strong>${m.week ? `<div>Week ${m.week} is in the books.</div>` : ""}${m.lines.map((l) => `<div>${esc(l)}</div>`).join("")}${m.text ? `<div>${esc(m.text)}</div>` : ""}
          ${m.week && chatLid() === curLid() ? `<button type="button" class="ct-wk" data-week="${m.week}">See week ${m.week} matchups ›</button>` : ""}${/^Waiver/.test(m.title) && chatLid() === curLid() ? `<button type="button" class="ct-wk" data-wrun="${m.date}">See every claim, in order ›</button>` : ""}<span class="muted small">${chatTime(m.date)}</span></div>`;
      const body = m.img ? `<img class="ct-img ${m.sticker ? "sticker" : ""}" src="${esc(m.img)}" alt="${m.sticker ? "Sticker" : "GIF"}" loading="lazy">` : `<div class="ct-bubble">${esc(m.text)}</div>`;
      return `${sep}<div class="ct-msg ${m.mine ? "mine" : ""}">${m.mine ? "" : `<div class="ct-who">${dot(m)}${esc(m.author)}${m.team ? ` <span class="muted">· ${esc(m.team)}</span>` : ""}</div>`}${body}<span class="muted small">${new Date(m.date).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span></div>`;
    }).join("") || `<p class="muted">No messages yet. Say something!</p>`;
    if (stick || atBottom) box.scrollTop = box.scrollHeight;
    // Mark it read on ESPN (and clear the count here) whenever something newer than last time shows up.
    const newest = Math.max(0, ...c.messages.map((m) => m.date));
    if (newest > (t.readTo || 0) && !document.hidden) {
      t.readTo = newest;
      chatPost("chatread", { topic: t.id }).then(() => {
        for (const x of [t, ...(state.chatList?.data?.topics || []).filter((x) => x.id === t.id)]) x.unread = 0;
        if (state.chatList?.key === chatLid()) (state.chatCounts ||= {})[chatLid()] = unreadOf(state.chatList.data);
        paintChatBadge();
      }).catch(() => {});
    }
    box.querySelectorAll("img.ct-img").forEach((im) => im.addEventListener("load", () => { if (stick) box.scrollTop = box.scrollHeight; }, { once: true }));
    box.querySelectorAll("[data-wrun]").forEach((b) => b.addEventListener("click", () => openWaiverRun(Number(b.dataset.wrun))));
    box.querySelectorAll("[data-week]").forEach((b) => b.addEventListener("click", async () => {
      document.querySelector("#pl-modal .modal-close").click();
      switchTab("matchups");
      await loadWeek(Number(b.dataset.week));
      setUrl(); render();
    }));
  };
  await load(true);
  clearInterval(state.chatTimer);
  state.chatTimer = setInterval(() => { if ($("pl-modal").hidden || state.chatView !== t.id) { clearInterval(state.chatTimer); return; } load(false); }, 15000);
  const text = $("ct-text");
  text.addEventListener("input", () => { text.style.height = "auto"; text.style.height = `${Math.min(120, text.scrollHeight)}px`; });
  text.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !/iPhone|iPad|Android/.test(navigator.userAgent)) { e.preventDefault(); $("ct-send").requestSubmit(); } });
  $("ct-send").addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = text.value.trim();
    if (!v) return;
    const btn = e.target.querySelector("button");
    btn.disabled = true; $("ct-msg").textContent = "";
    try { await chatPost("chatsend", { topic: t.id, text: v }); text.value = ""; text.style.height = "auto"; await load(true); }
    catch (err) { $("ct-msg").innerHTML = `<span class="neg">${esc(err.message)}</span>`; }
    btn.disabled = false;
  });
}
// Start a chat with one or more managers.
function newChat(list) {
  state.chatView = "new";
  chatShell(`<div class="ct-head"><button type="button" class="ct-back" id="ct-back" aria-label="Back to chats">‹</button><h2 id="pl-modal-title">New chat</h2></div>
    <div class="ct-pick">${list.members.map((m) => `<label class="dr-opt"><input type="checkbox" value="${esc(m.id)}"> ${m.teamId != null && chatLid() === curLid() ? logoImg(team(m.teamId), 22) : ""}<span><strong>${esc(m.name)}</strong> <span class="muted small">${esc(m.team)}</span></span></label>`).join("")}</div>
    <form class="ct-send" id="ct-send"><textarea id="ct-text" rows="2" maxlength="1000" placeholder="First message"></textarea><button type="submit">Start chat</button></form><p class="small" id="ct-msg"></p>`);
  $("ct-back").addEventListener("click", () => openChat(chatLid()));
  $("ct-send").addEventListener("submit", async (e) => {
    e.preventDefault();
    const members = [...document.querySelectorAll(".ct-pick input:checked")].map((x) => x.value);
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    try { await chatPost("chatnew", { members, text: $("ct-text").value }); await openChat(); }
    catch (err) { $("ct-msg").innerHTML = `<span class="neg">${esc(err.message)}</span>`; btn.disabled = false; }
  });
}

// ---------- Push notifications ----------
// Each device signs up per league for its own team and picks which alerts it wants.
// The server side is netlify/functions/push.mjs (sign-up) and push-watch.mjs (sends them).
const NOTIFY_KINDS = [
  ["td", "Touchdowns", "One of your starters scores, with the points from the play"],
  ["big", "Big plays", "A starter gains 15+ points on one play"],
  ["bonus", "Bonuses", "A starter crosses a yardage bonus (100-yd rushing, 300-yd passing…)"],
  ["injury", "Injury alerts", "A player's status changes: Questionable, Out, back to Active…"],
  ["news", "Player news", "A new update on one of your players (the RotoWire notes ESPN shows)"],
  ["lineup", "Start/bench", "Sundays at 10:30 AM Central, if your bench is projected to outscore a starter"],
  ["trade", "Trades", "A trade involving your team is accepted"],
  ["waiver", "Waiver report", "One summary after each waiver run: who you got (and missed)"],
  ["adds", "Adds & drops", "Another team in your league picks up or drops a player (waiver runs come as one summary)"],
];
const pushPost = (action, body) => fetch(`/api/push/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
  .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.message || `Request failed (${r.status})`); return d; });
const b64ToBytes = (b64) => { const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
async function openNotifications() {
  const lid = String(state.base.raw?.id || state.leagueId || ""), season = state.base.season;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const head = `<div class="pm-head"><h2 id="pl-modal-title">${ic("bell")} Notifications</h2></div>`;
  if (state.demo) return showModal(`${head}<p class="muted">Notifications work on the real leagues, not the demo.</p>`);
  if (ios && !standalone) return showModal(`${head}<p>On iPhone, notifications only work in the home-screen app.</p>
    <ol class="nt-steps"><li>In Safari, tap <strong>Share</strong> → <strong>Add to Home Screen</strong>.</li><li>Open the site from the new icon.</li><li>Tap the <strong>bell</strong> at the top again.</li></ol><p class="muted small">Needs iOS 16.4 or later.</p>`);
  if (!supported) return showModal(`${head}<p class="muted">This browser doesn't support notifications.</p>`);
  showModal(`${head}<div class="loading small"><span class="spinner"></span> Checking…</div>`);
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  let status = { subscribed: false };
  if (sub) status = await pushPost("status", { endpoint: sub.endpoint, leagueId: lid, season }).catch(() => status);
  const teamSel = String(status.teamId || myTeamId() || "");
  const ids = Object.keys(state.base.teams).sort((a, b) => team(a).name.localeCompare(team(b).name));
  const denied = Notification.permission === "denied";
  showModal(`${head}
    <p class="small muted">${esc(state.base.raw.settings?.name || "This league")} · alerts are only about your own team.${status.subscribed ? ` <strong class="pos">On for this device.</strong>` : ""}</p>
    ${denied ? `<div class="banner small">Notifications are blocked for this app. Turn them on in your phone's Settings → Notifications, then come back.</div>` : ""}
    <label class="nt-team small">Your team <select id="nt-team">${ids.map((id) => `<option value="${id}" ${id === teamSel ? "selected" : ""}>${esc(team(id).name)}</option>`).join("")}</select></label>
    <div class="nt-list">${NOTIFY_KINDS.map(([k, label, desc]) => `<label class="nt-row"><span><strong>${label}</strong><span class="muted small">${desc}</span></span>
      <input type="checkbox" class="nt-sw" data-k="${k}" ${status.prefs?.[k] === false ? "" : "checked"}></label>`).join("")}</div>
    <div class="mv-actions"><button type="button" class="mv-go" id="nt-save" ${denied ? "disabled" : ""}>${status.subscribed ? "Save" : "Turn on notifications"}</button>
      ${status.subscribed ? `<button type="button" class="mv-cancel" id="nt-test">Send a test</button><button type="button" class="mv-cancel" id="nt-off">Turn off</button>` : ""}</div>
    <p id="nt-msg" class="small"></p>`);
  const msg = (h) => { $("nt-msg").innerHTML = h; };
  $("nt-save").addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      // iPhone only shows the permission prompt straight from a tap, so ask first.
      if (Notification.permission !== "granted" && (await Notification.requestPermission()) !== "granted") throw new Error("Notifications weren't allowed.");
      msg(`<span class="spinner"></span> Saving…`);
      if (!sub) {
        const { publicKey } = await fetch("/api/push/key").then((r) => r.json());
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
      }
      const prefs = Object.fromEntries([...document.querySelectorAll(".nt-sw")].map((c) => [c.dataset.k, c.checked]));
      await pushPost("subscribe", { subscription: sub.toJSON(), leagueId: lid, season, teamId: Number($("nt-team").value), prefs });
      // Signed in as the owner: waiver reports can include your missed claims too.
      if (store.get("ffb.owner") === "1") await fetch("/api/roster/pushowner", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint, leagueId: lid, season }) }).catch(() => {});
      msg(`<span class="pos">✓ Saved. You'll get alerts for ${esc(team($("nt-team").value).name)}.</span>`);
      setTimeout(openNotifications, 1200);
    } catch (err) { msg(`<span class="neg">${esc(err.message)}</span>`); e.target.disabled = false; }
  });
  $("nt-test")?.addEventListener("click", () => pushPost("test", { endpoint: sub.endpoint, leagueId: lid, season })
    .then(() => msg(`<span class="pos">Sent. It should arrive in a few seconds.</span>`)).catch((err) => msg(`<span class="neg">${esc(err.message)}</span>`)));
  $("nt-off")?.addEventListener("click", () => pushPost("unsubscribe", { endpoint: sub.endpoint, leagueId: lid, season })
    .then(() => { msg("Turned off for this league."); setTimeout(openNotifications, 900); }).catch((err) => msg(`<span class="neg">${esc(err.message)}</span>`)));
}

// ---------- Owner lineup editing ----------
// Changing your team needs a sign-in: your own connected ESPN account (or the site owner's passphrase),
// and the server checks every change. See netlify/functions/roster.mjs.
const slotOk = (p, slot) => slot === BENCH || (slot !== IR && p.eligible.includes(slot));
const canSwap = (a, b) => a.id !== b.id && !b.locked && !a.locked && b.slotId !== IR && a.slotId !== b.slotId && slotOk(b, a.slotId) && slotOk(a, b.slotId);
const slotName = (id) => (id === BENCH ? "Bench" : SLOT[id] || String(id));
const ownerKey = () => `${state.base.raw?.id || state.leagueId || ""}:${state.base.season}`;
function ensureOwner() {
  if (state.demo) return { signedIn: true, teams: [myTeamId() || state.rosterTeam || Object.keys(state.base.teams)[0]], demo: true }; // demo: your starred team, else the one on screen
  if (store.get("ffb.owner") !== "1") return null;
  const k = ownerKey(), o = state.owner;
  if (o?.key === k) return o.data;
  if (o?.loading === k) return null;
  state.owner = { loading: k };
  const q = new URLSearchParams({ leagueId: state.base.raw?.id || state.leagueId || "", season: state.base.season });
  fetch(`/api/roster/session?${q}`).then((r) => r.json()).then((d) => {
    state.owner = { key: k, data: d };
    if (!d.signedIn) store.set("ffb.owner", null);
    if (ownerTeam()) {
      state.rosterTeam = null; state.openMatchup = null; state.liveSel = null;
      if (state.ta && !state.ta.give.length && !state.ta.get.length) state.ta.my = ownerTeam();
    }
  }).catch(() => { state.owner = { key: k, data: { signedIn: false } }; })
    .finally(() => { updateOwnerLink(); updateEspnLink(); if (state.week && state.base) render(); });
  return null;
}
// ---------- Your ESPN account ----------
// Anyone in the leagues connects their own ESPN sign-in (two cookies copied from a computer browser) so
// their lineup, pickups, claims, trades and chat go to ESPN as them. Other devices sign in with a
// one-time code. The site owner can still use the passphrase. See netlify/functions/roster.mjs.
const signedInHere = () => store.get("ffb.owner") === "1";
function updateOwnerLink() {
  const b = $("owner-btn"), on = signedInHere();
  if ($("ft-acct")) $("ft-acct").textContent = on ? "Account" : "Sign in";
  if (b) { b.innerHTML = `${ic(on ? "user" : "key")}<span class="hb-l">${on ? "Account" : "Sign in"}</span>`; b.title = on ? "Your account: other devices, sign out" : "Connect your ESPN account"; b.setAttribute("aria-label", on ? "Account" : "Sign in"); }
}
function openOwnerSignIn() {
  if (signedInHere()) return openAccount();
  openConnect();
}
// Signed in on this device (after connecting, a code, or the passphrase): reload who you are.
function afterSignIn() {
  store.set("ffb.owner", "1"); state.owner = null; state.pending = null; state.watch = null;
  document.querySelector("#pl-modal .modal-close")?.click();
  updateOwnerLink(); render();
}
function signOutHere(disconnect) {
  fetch(`/api/roster/${disconnect ? "disconnect" : "logout"}`, { method: "POST" }).finally(() => {
    store.set("ffb.owner", null); state.owner = null; state.lineupEdit = null; state.pending = null; state.watch = null;
    document.querySelector("#pl-modal .modal-close")?.click();
    updateOwnerLink(); render();
  });
}
const CONNECT_STEPS = {
  chrome: ["Press <kbd>F12</kbd> to open the developer tools. On a Mac, press <kbd>Cmd</kbd> + <kbd>Option</kbd> + <kbd>I</kbd>.",
    "Open the <strong>Application</strong> tab (it may be hidden under <kbd>»</kbd>), then go to <span class=\"cx-path\">Storage › Cookies › https://fantasy.espn.com</span>"],
  firefox: ["Press <kbd>F12</kbd> to open the developer tools. On a Mac, press <kbd>Cmd</kbd> + <kbd>Option</kbd> + <kbd>I</kbd>.",
    "Open the <strong>Storage</strong> tab, then go to <span class=\"cx-path\">Cookies › https://fantasy.espn.com</span>"],
  safari: ["First turn on Safari › Settings › Advanced › <strong>Show features for web developers</strong>. Then press <kbd>Cmd</kbd> + <kbd>Option</kbd> + <kbd>I</kbd>.",
    "Open the <strong>Storage</strong> tab, then go to <span class=\"cx-path\">Cookies › fantasy.espn.com</span>"],
};
function openConnect() {
  const ff = /Firefox\//.test(navigator.userAgent), sf = /Safari\//.test(navigator.userAgent) && !/Chrome|Chromium|Edg\//.test(navigator.userAgent);
  let br = ff ? "firefox" : sf ? "safari" : "chrome";
  const touch = matchMedia("(pointer: coarse)").matches && !DESK.matches;
  showModal(`<div class="pm-head"><h2 id="pl-modal-title">${ic("key")} Connect your ESPN account</h2></div>
    <div class="cx">
      ${touch ? `<div class="cx-code-first"><strong>On your phone?</strong> Connect on a computer first, then sign this phone in with a code.
        <form class="cx-code" id="cx-redeem"><input id="cx-code-in" autocomplete="one-time-code" autocapitalize="characters" placeholder="Code from your computer" maxlength="12"><button type="submit">Sign in</button></form><p class="cx-err" id="cx-code-err"></p></div>` : ""}
      <p class="cx-intro">Set your lineup, add and drop players, make waiver claims, send trades and chat for your own team from this site. ESPN doesn't offer a "sign in with ESPN" button, so you copy your sign-in from ESPN once. It takes about two minutes on a computer.</p>
      <div class="seg cx-br" role="group" aria-label="Browser">${[["chrome", "Chrome or Edge"], ["firefox", "Firefox"], ["safari", "Safari"]].map(([k, l]) => `<button type="button" data-br="${k}" class="${br === k ? "active" : ""}">${l}</button>`).join("")}</div>
      <ol class="cx-steps">
        <li>On a computer, open <kbd>fantasy.espn.com</kbd> and make sure you're signed in to ESPN.</li>
        <li id="cx-s2">${CONNECT_STEPS[br][0]}</li>
        <li id="cx-s3">${CONNECT_STEPS[br][1]}</li>
        <li>Type <kbd>espn_s2</kbd> in the filter box. Double-click its <strong>Value</strong>, copy it, and paste it below.<small>It's a long string of letters and symbols, about 300 characters.</small></li>
        <li>Do the same for <kbd>SWID</kbd>.<small>Include the curly braces, like {1A2B3C4D-…}.</small></li>
        <li>Press <strong>Connect</strong>. The site checks with ESPN and finds your team in each league.</li>
      </ol>
      <form id="cx-form" class="cx-form">
        <label>espn_s2<textarea id="cx-s2v" rows="2" spellcheck="false" autocomplete="off" placeholder="AEBx7f3k…%2B9Qz"></textarea></label><p class="cx-err" id="cx-e1"></p>
        <label>SWID<input id="cx-swv" spellcheck="false" autocomplete="off" placeholder="{1A2B3C4D-5E6F-7A8B-9C0D-1E2F3A4B5C6D}"></label><p class="cx-err" id="cx-e2"></p>
        <div class="cx-go"><button type="submit" class="mv-go" id="cx-btn">Connect</button><span id="cx-msg" class="small"></span></div>
      </form>
      ${touch ? "" : `<details class="cx-more"><summary>Have a code from another device?</summary><form class="cx-code" id="cx-redeem"><input id="cx-code-in" autocomplete="one-time-code" autocapitalize="characters" placeholder="8-letter code" maxlength="12"><button type="submit">Sign in</button></form><p class="cx-err" id="cx-code-err"></p></details>`}
      <p class="cx-safe">${ic("lock")} Your ESPN sign-in is stored encrypted and only used to make changes for your own team. Other managers can't see it. Disconnect any time from Account. Signing out of ESPN on all devices also cuts the site off. It stops working when ESPN signs you out (usually after several months); then you connect again.</p>
      <div class="cx-links"><a href="${esc($("espn-open")?.href || "https://fantasy.espn.com/football/")}" target="_blank" rel="noopener">${ic("external-link")} Open this league in ESPN</a>
        <button type="button" class="linkish cx-owner" id="cx-owner">Site owner? Sign in with the passphrase</button></div>
    </div>`);
  const body = $("pl-modal-body");
  body.querySelectorAll("[data-br]").forEach((b) => b.addEventListener("click", () => {
    br = b.dataset.br;
    body.querySelectorAll("[data-br]").forEach((x) => x.classList.toggle("active", x === b));
    $("cx-s2").innerHTML = CONNECT_STEPS[br][0]; $("cx-s3").innerHTML = CONNECT_STEPS[br][1];
  }));
  $("cx-owner").addEventListener("click", openPassphrase);
  $("cx-s2v").addEventListener("input", () => { $("cx-e1").textContent = ""; });
  $("cx-swv").addEventListener("input", () => { $("cx-e2").textContent = ""; });
  $("cx-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const s2 = $("cx-s2v").value.trim(), swid = $("cx-swv").value.trim(), msg = $("cx-msg");
    let bad = false;
    if (s2.length < 60) { $("cx-e1").textContent = s2 ? "That looks too short. Copy the whole espn_s2 value." : "Paste your espn_s2 value first."; bad = true; }
    if (!/^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i.test(swid)) { $("cx-e2").textContent = swid ? "That doesn't look like a SWID. It looks like {1A2B3C4D-…}." : "Paste your SWID value first."; bad = true; }
    if (bad) return;
    if (state.demo) { msg.textContent = "Connecting works on the real leagues, not the demo."; return; }
    const btn = $("cx-btn");
    btn.disabled = true; msg.className = "small muted"; msg.textContent = "Checking with ESPN…";
    try {
      const r = await fetch("/api/roster/connect", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ s2, swid, leagues: LEAGUES.map((l) => ({ id: l.id, season: state.base.season })) }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || "Couldn't connect. Try again.");
      if (d.history) state.history = null; // seasons that couldn't be read before are saved now
      const n = Object.keys(d.teams || {}).length;
      msg.className = "small pos";
      msg.textContent = `Connected${d.name ? ` as ${d.name}` : ""}: your team in ${n} league${n === 1 ? "" : "s"}.`;
      setTimeout(afterSignIn, 900);
    } catch (err) { msg.className = "small neg"; msg.textContent = err.message; btn.disabled = false; }
  });
  bindRedeem();
}
function bindRedeem() {
  const f = $("cx-redeem");
  f?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("cx-code-err"), btn = f.querySelector("button");
    btn.disabled = true; err.textContent = "";
    try { await redeemCode($("cx-code-in").value); afterSignIn(); }
    catch (x) { err.textContent = x.message; btn.disabled = false; }
  });
}
async function redeemCode(code) {
  const r = await fetch("/api/roster/redeem", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || "That code didn't work.");
}
// Account: who you're signed in as, sign another device in, sign out, disconnect.
function openAccount() {
  const o = ensureOwner(), mgr = o?.kind === "manager", t = ownerTeam();
  showModal(`<div class="pm-head"><h2 id="pl-modal-title">${ic("user")} Your account</h2></div>
    <div class="cx">
      ${o?.expired ? `<div class="banner">Your ESPN connection has run out (ESPN signed you out). Connect again to keep making changes.</div><button type="button" class="mv-go" id="ac-reconnect">Connect again</button>` : ""}
      <p>${mgr ? `Signed in as <strong>${esc(o.name || "a league manager")}</strong>` : o?.kind === "owner" ? "Signed in as the <strong>site owner</strong> (passphrase)" : "Signed in"}${t ? ` · ${teamName(t, 20)}` : ""}</p>
      ${mgr ? `<div class="ac-block"><strong>Sign in on another device</strong><p class="small muted">Get a one-time code, then on your phone open the site, tap the key at the top (Sign in), and type it (or scan the QR code with the phone's camera).</p>
        <button type="button" id="ac-code">Get a code</button><div id="ac-code-out"></div></div>` : ""}
      ${mgr ? "" : `<div class="ac-block"><strong>Connect your own ESPN account</strong><p class="small muted">Changes then go to ESPN as you, and you can sign your phone in with a code instead of the passphrase.</p>
        <button type="button" id="ac-connect">Connect ESPN</button></div>`}
      <div class="ac-actions"><button type="button" id="ac-out">Sign out on this device</button>
        ${mgr ? `<button type="button" class="ac-danger" id="ac-disc">Disconnect ESPN</button>` : ""}</div>
      ${mgr ? `<p class="small muted">Disconnect deletes your saved ESPN sign-in from the site and signs out every device.</p>` : ""}
      <div class="cx-links"><a href="${esc($("espn-open")?.href || "https://fantasy.espn.com/football/")}" target="_blank" rel="noopener">${ic("external-link")} Open your team in ESPN</a></div>
    </div>`);
  $("ac-reconnect")?.addEventListener("click", openConnect);
  $("ac-connect")?.addEventListener("click", openConnect);
  $("ac-out").addEventListener("click", () => signOutHere(false));
  $("ac-disc")?.addEventListener("click", () => { if (confirm("Disconnect your ESPN account from this site? Every device you signed in will be signed out.")) signOutHere(true); });
  $("ac-code")?.addEventListener("click", async (e) => {
    const out = $("ac-code-out");
    e.target.disabled = true;
    try {
      const r = await fetch("/api/roster/handoff", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || "Couldn't make a code.");
      const nice = `${d.code.slice(0, 4)}-${d.code.slice(4)}`, link = `${location.origin}/?connect=${d.code}`;
      out.innerHTML = `<div class="ac-code"><span>${nice}</span><small>Works once, for 10 minutes</small></div><div id="ac-qr" class="ac-qr"></div>`;
      loadQr().then((QR) => { if ($("ac-qr")) new QR($("ac-qr"), { text: link, width: 168, height: 168, correctLevel: QR.CorrectLevel.M }); }).catch(() => {});
    } catch (x) { out.innerHTML = `<p class="small neg">${esc(x.message)}</p>`; }
    e.target.disabled = false;
  });
}
// QR codes: a small library, loaded only when a code is shown.
function loadQr() {
  if (window.QRCode) return Promise.resolve(window.QRCode);
  return new Promise((ok, no) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
    s.onload = () => ok(window.QRCode); s.onerror = no;
    document.head.appendChild(s);
  });
}
// A sign-in link from a QR code (?connect=CODE): use it, then tidy the address.
if (params.get("connect")) {
  const code = params.get("connect");
  params.delete("connect");
  history.replaceState(null, "", `${location.pathname}${params.toString() ? `?${params}` : ""}${location.hash}`);
  redeemCode(code).then(() => { store.set("ffb.owner", "1"); state.owner = null; updateOwnerLink(); if (state.week) render(); })
    .catch((e) => alert(e.message));
}
// The site owner's passphrase sign-in (acts with the ESPN sign-in saved in Netlify).
function openPassphrase() {
  showModal(`<div class="pm-head"><h2 id="pl-modal-title">Site owner sign-in</h2></div>
    <p class="small muted">Unlocks changes on this device for 90 days. Only the passphrase saved in Netlify works.</p>
    <form id="owner-form" class="owner-form"><input id="owner-pass" type="password" autocomplete="current-password" placeholder="Passphrase" required>
      <button type="submit">Sign in</button></form><p id="owner-msg" class="small"></p>`);
  $("owner-pass").focus();
  $("owner-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("owner-msg"), btn = e.target.querySelector("button");
    btn.disabled = true; msg.textContent = "Checking…";
    try {
      const r = await fetch("/api/roster/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passphrase: $("owner-pass").value }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || "Couldn't sign in.");
      afterSignIn();
    } catch (err) { msg.textContent = err.message; btn.disabled = false; }
  });
}
// ---------- Waivers ----------
const waiverRankOf = (teamId) => state.base.raw.teams?.find((t) => String(t.id) === String(teamId))?.waiverRank || null;
const waiverPlace = (teamId) => { const r = waiverRankOf(teamId); return r ? `${ordinal(r)} of ${Object.keys(state.base.teams).length}` : ""; };
const fmtWhen = (ms) => new Date(ms).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
// Next waiver run: the soonest clear time among players on waivers now.
function nextWaiverRun() {
  const fa = state.week ? faData() : null;
  const times = (fa && !fa.error ? fa.players : []).filter((p) => p.status === "W" && p.waiverDate > Date.now()).map((p) => p.waiverDate);
  return times.length ? Math.min(...times) : null;
}
const waiverDays = () => (state.base.raw.settings?.acquisitionSettings?.waiverProcessDays || []).map((d) => d[0] + d.slice(1, 3).toLowerCase()).join(", ");
// Your pending claims and trade offers (owner only; ESPN keeps claims private).
function ensurePending() {
  if (!actTeam()) return null;
  if (state.demo) return demoPending();
  const k = ownerKey(), c = state.pending;
  if (c?.key === k && c.data && Date.now() - c.at < 60e3) return c.data;
  if (c?.loading !== k) {
    state.pending = { ...(c?.key === k ? c : {}), loading: k };
    const q = new URLSearchParams({ leagueId: state.base.raw?.id || state.leagueId || "", season: state.base.season });
    fetch(`/api/roster/pending?${q}`).then((r) => r.json()).then((d) => { state.pending = { key: k, at: Date.now(), data: d.pending ? d : { pending: [], error: d.message } }; })
      .catch(() => { state.pending = { key: k, at: Date.now(), data: { pending: [], error: "Couldn't load pending moves." } }; })
      .finally(() => {
        if (["transactions", "roster"].includes(state.tab)) render();
        if (state.pdModal && !$("pl-modal").hidden && $("pl-modal-body").querySelector(".pd-pop")) openPendingModal();
      });
  }
  return c?.key === k ? c.data : null;
}
// Demo: a few made-up claims so the layout (and reordering) can be seen.
function demoPending() {
  if (state.demoPending) return state.demoPending;
  const fa = faData(), me = actTeam(), side = state.week.sides.find((x) => String(x.teamId) === me);
  const adds = (fa?.players || []).filter((p) => p.status === "W").slice(0, 3), drop = side?.bench.slice(-1)[0];
  if (!adds.length || !drop) return { pending: [] };
  return (state.demoPending = { pending: adds.map((add, i) => ({ id: `demo${i}`, type: "WAIVER", status: "PENDING", teamId: Number(me), bid: 0, subOrder: i + 1, process: add.waiverDate,
    items: [{ playerId: add.id, type: "ADD", to: Number(me), info: [add.name, add.posId, add.proId] }, { playerId: drop.id, type: "DROP", from: Number(me), info: [drop.name, drop.posId, drop.proId] }] })) });
}
// Your claims in the order ESPN will try them: higher bids first (budget leagues), then your order,
// then oldest first for claims you've never reordered. Trades keep their place after the claims.
const usesFaab = () => !!state.base.raw.settings?.acquisitionSettings?.isUsingAcquisitionBudget;
function claimSort(a, b) {
  return (usesFaab() ? (b.bid || 0) - (a.bid || 0) : 0) || (a.subOrder ?? 999) - (b.subOrder ?? 999) || (a.proposed || 0) - (b.proposed || 0);
}
const sortPending = (list) => [...list.filter((t) => t.type === "WAIVER").sort(claimSort), ...list.filter((t) => t.type !== "WAIVER")];
// Move a claim one place up (-1) or down (+1). Shown right away; ESPN gets the whole new order.
async function moveClaim(id, dir) {
  const P = ensurePending(), me = actTeam();
  const t = P?.pending?.find((x) => String(x.id) === id);
  if (!t) return;
  const list = P.pending.filter((x) => x.type === "WAIVER" && x.teamId === t.teamId).sort(claimSort);
  const i = list.indexOf(t), j = i + dir;
  if (j < 0 || j >= list.length || (usesFaab() && (list[j].bid || 0) !== (t.bid || 0))) return;
  [list[i], list[j]] = [list[j], list[i]];
  const before = list.map((x) => x.subOrder);
  list.forEach((x, k) => { x.subOrder = k + 1; });
  repaintPending();
  try { await sendMove("reorder", { teamId: Number(me), order: list.map((x) => String(x.id)) }); }
  catch (err) {
    list.forEach((x, k) => { x.subOrder = before[k]; });
    state.pending = null; repaintPending();
    showModal(`<div class="pm-head"><h2 id="pl-modal-title">Claim order</h2></div><p class="neg">${esc(err.message)}</p>`);
  }
}
// Redraw whatever is showing pending moves.
function repaintPending() {
  const body = $("pl-modal-body");
  if (!$("pl-modal").hidden && body.querySelector(".pd-pop")) {
    if (body.querySelector('[data-pdk="claims"]')) chipPopup("claims", state.rosterTeam || actTeam(), state.week.sides.find((x) => String(x.teamId) === String(state.rosterTeam || actTeam())));
    else if (state.pdModal) openPendingModal();
  }
  if (["transactions", "roster"].includes(state.tab)) render();
}
document.addEventListener("click", (e) => {
  const w = e.target.closest(".wr-last[data-wrun]");
  if (w) openWaiverRun(0);
  const b = e.target.closest("[data-claim-move]");
  if (b) moveClaim(b.dataset.claimMove, Number(b.dataset.dir));
});
// Cancel a pending claim, withdraw a trade offer you sent, or decline one you got.
function cancelPending(t, kind, label) {
  const me = actTeam();
  moveDialog(label, `<p class="small muted">${kind === "trade-in" ? "The other manager is told you declined." : "Nothing else on your roster changes."}</p>`, label,
    () => sendMove("cancel", { teamId: Number(me), txId: t.id, kind }), kind === "trade-in" ? "Declined on ESPN" : "Canceled on ESPN");
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-cancel]");
  if (!b) return;
  const P = ensurePending(), t = P?.pending?.find((x) => String(x.id) === b.dataset.cancel);
  if (t) cancelPending(t, b.dataset.kind, b.dataset.label);
});
// One pending move as a card row.
function pendingRow(t, mine) {
  const nm = (i) => (i.info ? `${plink(i.playerId, i.info[0])} <span class="muted small">${POS[i.info[1]] || ""}</span>` : `Player ${esc(i.playerId)}`);
  const fa = faData(), clears = (id) => fa?.players?.find((p) => String(p.id) === String(id))?.waiverDate;
  if (/TRADE/.test(t.type)) {
    const me = (t.items || []).some((i) => mine.includes(i.from)) ? mine.find((m) => t.items.some((i) => i.from === m)) : mine[0];
    const other = (t.items || []).map((i) => (i.from === me ? i.to : i.from)).find((x) => x != null && x !== me);
    const sent = t.items.filter((i) => i.from === me).map(nm).join(", "), got = t.items.filter((i) => i.to === me).map(nm).join(", ");
    const outgoing = mine.includes(t.teamId);
    const kind = outgoing ? "trade-out" : "trade-in", label = outgoing ? "Withdraw offer" : "Decline offer";
    return `<div class="pd-row"><span class="pd-kind trade">Trade</span><div class="pd-main">
      <div>${outgoing ? "Offer to" : "Offer from"} <strong>${esc(team(other).name)}</strong></div>
      <div class="small">You send ${sent || "–"} · you get ${got || "–"}</div>
      <div class="muted small">${t.expires ? `Expires ${fmtWhen(t.expires)}` : esc(t.status || "Pending")}</div></div>
      <button type="button" class="pd-cancel" data-cancel="${esc(t.id)}" data-kind="${kind}" data-label="${label}">${outgoing ? "Withdraw" : "Decline"}</button></div>`;
  }
  const adds = (t.items || []).filter((i) => i.type === "ADD"), drops = (t.items || []).filter((i) => i.type === "DROP");
  const when = t.process || (adds[0] && clears(adds[0].playerId)) || nextWaiverRun();
  const faab = usesFaab();
  // Claim order: number, and arrows when there's more than one.
  const queue = t.type === "WAIVER" ? (ensurePending()?.pending || []).filter((x) => x.type === "WAIVER" && x.teamId === t.teamId).sort(claimSort) : [];
  const qi = queue.indexOf(t), canSwap = (j) => queue[j] && (!faab || (queue[j].bid || 0) === (t.bid || 0));
  const order = queue.length > 1 && qi >= 0 ? `<span class="pd-order"><button type="button" data-claim-move="${esc(t.id)}" data-dir="-1" ${canSwap(qi - 1) ? "" : "disabled"} aria-label="Move up">▲</button><b>${qi + 1}</b><button type="button" data-claim-move="${esc(t.id)}" data-dir="1" ${canSwap(qi + 1) ? "" : "disabled"} aria-label="Move down">▼</button></span>` : "";
  return `<div class="pd-row">${order}<span class="pd-kind ${t.type === "WAIVER" ? "wv" : ""}">${t.type === "WAIVER" ? "Claim" : "Add"}</span><div class="pd-main">
    <div>${adds.length ? `<span class="pos">+</span> ${adds.map(nm).join(", ")}` : ""}${drops.length ? ` <span class="neg">−</span> ${drops.map(nm).join(", ")}` : ""}</div>
    <div class="muted small">${when ? `Processes ${fmtWhen(when)}` : "Processes at the next waiver run"}${faab && t.bid != null ? ` · bid $${t.bid}` : ""}</div></div>
    <button type="button" class="pd-cancel" data-cancel="${esc(t.id)}" data-kind="claim" data-label="Cancel claim">Cancel</button></div>`;
}
const claimHint = (list) => (list.filter((t) => t.type === "WAIVER").length > 1 ? `<p class="muted small pd-hint">Claims process top to bottom: #1 is tried first.${usesFaab() ? " Higher bids still go first; arrows reorder claims with the same bid." : ""}</p>` : "");
// Popup with your pending moves (Roster tab button). Fills in when the list arrives.
function openPendingModal() {
  const me = actTeam();
  if (!me) return;
  const P = ensurePending(), next = nextWaiverRun();
  state.pdModal = true;
  showModal(`<div class="pm-head">${logoImg(team(me), 44)}<div><h2 id="pl-modal-title">Pending moves</h2>
      <div class="muted small">${esc(team(me).name)}${waiverPlace(me) ? ` · ${waiverPlace(me)} in waiver order` : ""}${next ? ` · next waiver run ${fmtWhen(next)}` : ""}</div></div></div>
    <div class="pd-pop" data-pdk="all">${!P ? `<div class="loading small"><span class="spinner"></span> Loading from ESPN…</div>`
      : P.error && !P.pending.length ? `<p class="muted small">${esc(P.error)}</p>`
      : P.pending.length ? `${sortPending(P.pending).map((t) => pendingRow(t, (P.teams || [Number(me)]).map(Number))).join("")}${claimHint(P.pending)}`
      : `<p class="muted">No pending claims or trade offers.</p>`}</div>`);
}

// One waiver run: every claim in the order ESPN processed it, won or missed (misses only for the owner).
const WAIVER_FAIL = {
  FAILED_INVALIDPLAYERSOURCE: "Player already taken", FAILED_PLAYERALREADYDROPPED: "Drop player already gone", FAILED_ROSTERLIMIT: "Roster full",
  FAILED_AUCTIONBUDGETEXCEEDED: "Over budget", FAILED_ROSTERLOCK: "Roster locked", FAILED_POSITIONLIMIT: "Position limit", FAILED_TRADELOCK: "Player in a trade",
};
const failText = (s) => WAIVER_FAIL[s] || (s || "").replace(/^FAILED_?/, "").toLowerCase().replace(/^./, (x) => x.toUpperCase()) || "Not processed";
async function openWaiverRun(at) {
  const title = `<div class="pm-head"><h2 id="pl-modal-title">${ic("list-numbers")} Waiver results</h2></div>`;
  showModal(`${title}<div class="loading small"><span class="spinner"></span> Loading from ESPN…</div>`);
  let d;
  try {
    if (state.demo) d = demoWaiverRun();
    else {
      const r = await fetch(`/api/roster/waivers?${new URLSearchParams({ leagueId: String(state.base.raw?.id || state.leagueId || ""), season: state.base.season, at: String(at || "") })}`);
      d = await r.json();
      if (!r.ok) throw new Error(d.message || "Couldn't load the waiver results.");
    }
  } catch (e) { return showModal(`${title}<div class="banner">${esc(e.message)}</div>`); }
  const me = myTeamId();
  const nm = (i) => (i.info ? `${plink(i.playerId, i.info[0])} <span class="muted small">${POS[i.info[1]] || ""}</span>` : `Player ${esc(i.playerId)}`);
  const rows = d.claims.map((c, k) => {
    const add = c.items.filter((i) => i.type === "ADD"), drop = c.items.filter((i) => i.type === "DROP"), won = c.status === "EXECUTED";
    return `<div class="wr-row ${won ? "won" : "lost"} ${String(c.teamId) === String(me) ? "me" : ""}"><span class="wr-n">${k + 1}</span>${logoImg(team(c.teamId), 26)}
      <div class="pd-main"><div><strong>${esc(team(c.teamId).name)}</strong>${c.bid != null ? ` <span class="muted small">$${c.bid}</span>` : ""}</div>
        <div class="small">${add.length ? `<span class="pos">+</span> ${add.map(nm).join(", ")}` : ""}${drop.length ? ` <span class="neg">−</span> ${drop.map(nm).join(", ")}` : ""}</div></div>
      <span class="wr-st">${won ? `<span class="pos">✓ Won</span>` : `<span class="neg">✗ ${esc(failText(c.status))}</span>`}</span></div>`;
  }).join("");
  const won = d.claims.filter((c) => c.status === "EXECUTED").length;
  showModal(`<div class="pm-head"><div><h2 id="pl-modal-title">${ic("list-numbers")} Waiver results</h2><div class="muted small">${d.at ? fmtWhen(d.at) : ""}${d.claims.length ? ` · ${won} won${d.owner ? ` · ${d.claims.length - won} missed` : ""}` : ""}</div></div></div>
    ${d.claims.length ? `<p class="muted small">In the order ESPN processed them.</p><div class="wr-list">${rows}</div>` : `<p class="muted">No processed claims found for that run.</p>`}
    ${d.hidden ? `<p class="muted small">${d.hidden} claim${d.hidden === 1 ? "" : "s"} that didn't go through ${d.hidden === 1 ? "is" : "are"} hidden. Sign in to see yours.</p>` : ""}`);
}
// Demo: a made-up run from this week's waiver players.
function demoWaiverRun() {
  const fa = faData(), ids = Object.keys(state.base.teams);
  const pl = (fa?.players || []).slice(0, 6);
  const fails = ["FAILED_INVALIDPLAYERSOURCE", "FAILED_ROSTERLIMIT"];
  return { owner: true, at: Date.now() - 6 * 3600e3, hidden: 0, claims: pl.map((p, k) => ({ id: `w${k}`, teamId: Number(ids[(k * 3) % ids.length]), status: k === 2 || k === 4 ? fails[k % 2] : "EXECUTED", bid: null,
    items: [{ playerId: p.id, type: "ADD", info: [p.name, p.posId, p.proId] }] })) };
}

// Transactions tab: next waiver run, your pending moves (owner) and the waiver order.
function waiverSection() {
  const teams = (state.base.raw.teams || []).filter((t) => t.waiverRank).sort((a, b) => a.waiverRank - b.waiverRank);
  if (!teams.length) return "";
  const next = nextWaiverRun(), days = waiverDays(), me = actTeam();
  const P = me ? ensurePending() : null;
  const pending = !me ? "" : `<div class="card pd-card"><div class="pd-head"><strong>Your pending moves</strong></div>${
    !P ? `<div class="loading small"><span class="spinner"></span> Loading…</div>`
    : P.error && !P.pending.length ? `<p class="muted small">${esc(P.error)}</p>`
    : P.pending.length ? `${sortPending(P.pending).map((t) => pendingRow(t, (P.teams || [Number(me)]).map(Number))).join("")}${claimHint(P.pending)}`
    : `<p class="muted small">No pending claims or trade offers.</p>`}</div>`;
  return `<div class="section-head"><h2>Waivers</h2><span class="muted small">${next ? `Next run ${fmtWhen(next)}` : "Next run: overnight"}${days ? ` · runs ${days}` : ""}</span><button type="button" class="wr-last" data-wrun="">Last run results ›</button></div>
    ${pending}
    <div class="card wv-order"><div class="pd-head"><strong>Waiver order</strong>${me && waiverPlace(me) ? ` <span class="muted small">You're ${waiverPlace(me)}</span>` : ""}</div>
      <ol>${teams.map((t) => `<li class="${myRow(t.id)}"><span class="wv-rk">${t.waiverRank}</span>${logoImg(team(t.id), 20)}<span>${esc(team(t.id).name)}</span></li>`).join("")}</ol></div>`;
}

// The team you can make moves for right now: signed in as owner, current week (null otherwise).
function actTeam() {
  const own = ensureOwner();
  if (!own?.signedIn || !state.week || state.week.week !== state.base.current) return null;
  const t = state.demo ? myTeamId() || own.teams?.[0] : own.teams?.[0];
  return t != null ? String(t) : null;
}
// After any move: reload this week straight from ESPN (no caches) and redraw.
async function refreshAfterMove() {
  const wk = state.week.week;
  try { state.week = await getWeek(wk, true, true); } catch { /* keep what we have */ }
  state.fa = {}; state.live = null; state.lcMoves = null; state.pending = null;
  render();
}
async function sendMove(route, body) {
  if (state.demo) return;
  const r = await fetch(`/api/roster/${route}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ leagueId: state.base.raw?.id || state.leagueId, season: state.base.season, ...body }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || `Request failed (${r.status})`);
}
// Who has a player right now (this week's rosters): a team id, null if he's available, undefined
// while rosters are still loading.
function rosterOwnerOf(id) {
  const w = state.weekCache?.[state.base.current];
  if (!w?.sides) return undefined;
  if (state.ownerMapFor !== w) {
    state.ownerMap = new Map(w.sides.flatMap((sd) => sd.players.map((p) => [String(p.id), String(sd.teamId)])));
    state.ownerMapFor = w;
  }
  return state.ownerMap.get(String(id)) ?? null;
}
const posIdOf = (pos) => Number(Object.keys(POS).find((k) => POS[k] === pos)) || null;
const proIdOf = (abbr) => Number(Object.keys(PRO).find((k) => PRO[k] === abbr)) || null;
// Owner-only quick actions next to a player: + to add (yellow when he's on waivers) if he's available,
// ⇄ to put him in the mock trade if another team has him. Nothing for your own players.
function moveBtns(p, big = false) {
  const me = actTeam();
  if (!me || p?.id == null) return "";
  const own = rosterOwnerOf(p.id);
  if (own === undefined || own === me) return "";
  const nm = esc(p.name || "");
  if (own === null) {
    const wv = faData()?.players?.find((x) => String(x.id) === String(p.id))?.status === "W";
    return `<button type="button" class="add-btn ${big ? "" : "sm"} ${wv ? "wv" : ""}" data-add="${esc(p.id)}" data-nm="${nm}" data-pos="${esc(p.posId ?? "")}" data-pro="${esc(p.proId ?? "")}" title="${wv ? "Claim" : "Add"} ${nm}">${big ? `+ ${wv ? "Claim" : "Add"}` : "+"}</button>`;
  }
  return `<button type="button" class="trade-btn ${big ? "" : "sm"}" data-trade="${esc(p.id)}" title="Trade for ${nm} (${esc(team(own).abbrev || "")})">${big ? "⇄ Trade" : "⇄"}</button>`;
}
// ---------- Compare players (player card) ----------
// Compare from a card: with other cards already open it compares them; with just one open it asks which of
// your players to compare against, opens that card too, and shows the comparison: season and weekly
// numbers, how each would fit your lineup, who to drop to add him, or what to offer in a trade.
const hideCmp = () => { const c = $("cmp-modal"); if (c) { c.hidden = true; state.cmpIds = null; } };
function showCmp(html) {
  const c = $("cmp-modal");
  $("cmp-body").innerHTML = html;
  c.hidden = false;
  c.querySelector(".modal-card").scrollTop = 0;
}
function startCompare(baseId) {
  const open = (state.cards || []).filter((c) => c !== baseId);
  if (open.length) openCompare([baseId, ...open].slice(0, 3));
  else openComparePicker(baseId);
}
// "Compare other": the popups tuck away into a bar at the bottom ("Compare with Josh Allen · QB · BUF"). It stays
// through every screen until you tap a player (his name anywhere) or close it, then both cards and the comparison open.
function startPick(baseId) {
  baseId = String(baseId);
  const d = state.playerCache?.[baseId]?.data?.player || {};
  hideCmp();
  closeStage();
  document.querySelector("#pl-modal .modal-close")?.click(); // closes the cards; the bar keeps who we're comparing
  state.cmpPick = { id: baseId, name: d.name || "this player", pos: POS[d.posId] || "", team: PRO[d.proId] || "" };
  paintPickBar();
}
function endPick() { state.cmpPick = null; paintPickBar(); }
function paintPickBar(note) {
  const c = state.cmpPick;
  let bar = $("cmp-bar");
  document.body.classList.toggle("cmp-picking", !!c);
  if (!c) { bar?.remove(); return; }
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "cmp-bar";
    bar.addEventListener("click", (e) => { if (e.target.closest("[data-pick-cancel]")) endPick(); });
    document.body.appendChild(bar);
  }
  bar.innerHTML = `<span class="cb-ico">${ic("scale")}</span><span class="cb-text"><strong>Compare with ${esc(c.name)}</strong><span class="cb-sub">${esc(note || [c.pos, c.team].filter(Boolean).join(" · ") + " · tap any player to compare")}</span></span><button type="button" class="cb-x" data-pick-cancel aria-label="Cancel comparing">×</button>`;
}
async function finishPick(pickId) {
  const c = state.cmpPick;
  if (!c) return;
  pickId = String(pickId);
  if (pickId === c.id) { paintPickBar("That's the same player: pick someone else"); return; }
  endPick();
  if (wideStage()) return openStage([c.id, pickId]);
  await openPlayer(c.id);
  await openPlayer(pickId);
  openCompare([c.id, pickId]);
}
const cmpMe = () => String(myTeamId() || state.rosterTeam || "");
const cmpWeek = () => ensureCurrentRosters() || state.weekCache?.[state.base.current] || state.week;
function openComparePicker(baseId) {
  const wk = cmpWeek(), me = cmpMe(), side = wk?.sides?.find((x) => String(x.teamId) === me);
  const name = state.playerCache?.[baseId]?.data?.player?.name || "this player";
  const head = `<div class="pm-head"><div><h2 id="cmp-title">${ic("scale")} Compare ${esc(name)}</h2><div class="muted small">Pick a player from your roster, or</div></div></div>
    <button type="button" class="cmp-other" data-cmp-other="${esc(baseId)}">${ic("search")} Compare other <span class="muted small">pick any player from another screen</span></button>`;
  if (!side) return showCmp(`${head}<p class="muted">Star your team (☆ on the Roster tab) or sign in so the site knows which roster is yours.</p>`);
  const row = (p) => `<button type="button" class="cmp-pick" data-cmp-pick="${esc(p.id)}"><span class="sp ro">${p.slotId === BENCH ? "BE" : esc(SLOT[p.slotId] || p.slot)}</span>${headshot(p, 32)}
      <span class="cp-main"><strong>${esc(p.name)}</strong><span class="muted small">${esc(p.pos)} · ${esc(PRO[p.proId] || "")}${injBadge(p)}</span></span>
      <span class="cp-nums"><b>${f1(p.proj)}</b><small>${p.seasonAvg != null ? `${f1(p.seasonAvg)} ppg` : "proj"}</small></span></button>`;
  const grp = (t, l) => (l.length ? `<div class="ct-group">${t}</div>${l.map(row).join("")}` : "");
  const others = side.players.filter((p) => String(p.id) !== String(baseId));
  showCmp(`${head}<div class="cmp-picks">${grp("Starters", others.filter((p) => p.starter))}${grp("Bench", others.filter((p) => !p.starter && p.slotId !== IR))}${grp("IR", others.filter((p) => p.slotId === IR))}</div>`);
  $("cmp-body").querySelectorAll("[data-cmp-pick]").forEach((b) => b.addEventListener("click", async () => {
    const id = b.dataset.cmpPick;
    if (wideStage()) return openStage([String(baseId), id]);
    await openPlayer(id);
    openCompare([String(baseId), id]);
  }));
}
// On wide screens (1300px+) two players compare with both cards on screen and the comparison between them.
const wideStage = () => DESK.matches && innerWidth >= 1300;
const stageOpen = () => !!$("cmp-stage") && !$("cmp-stage").hidden;
function closeStage() {
  const st = $("cmp-stage");
  if (!st || st.hidden) return;
  st.hidden = true;
  st.innerHTML = "";
  state.stageIds = null;
  document.body.classList.remove("modal-open");
}
async function openStage(ids) {
  ids = ids.slice(0, 2).map(String);
  hideCmp();
  if (!$("pl-modal").hidden) document.querySelector("#pl-modal .modal-close").click();
  let st = $("cmp-stage");
  if (!st) {
    st = document.createElement("div");
    st.id = "cmp-stage";
    st.hidden = true;
    st.addEventListener("click", (e) => {
      const other = e.target.closest("[data-cmp-other]");
      if (other) { startPick(other.dataset.cmpOther); return; }
      if (e.target === st || e.target.closest(".stg-x")) closeStage();
    });
    document.body.appendChild(st);
  }
  const load = `<div class="loading small"><span class="spinner"></span> Loading…</div>`;
  st.innerHTML = `<div class="stg-card" id="stg-a">${load}</div><div class="stg-cmp"><button type="button" class="stg-x" aria-label="Close comparison">×</button><div id="stg-body">${load}</div></div><div class="stg-card" id="stg-b">${load}</div>`;
  st.hidden = false;
  document.body.classList.add("modal-open");
  state.stageIds = ids;
  ensureValues(); ensureUsage();
  const cache = (state.playerCache ||= {});
  await Promise.all(ids.map(async (id) => {
    const hit = cache[id];
    if (hit && Date.now() - hit.at < 60000) return;
    try { cache[id] = { at: Date.now(), data: await fetchPlayer(id) }; } catch { /* that card shows an error */ }
  }));
  if (!stageOpen() || state.stageIds !== ids) return;
  ids.forEach((id, i) => {
    const el = $(i ? "stg-b" : "stg-a");
    if (!cache[id]?.data) { el.innerHTML = `<div class="banner">Couldn't load that player.</div>`; return; }
    renderPlayerModal(cache[id].data, null, { body: el, st: { pmTab: "overview" }, stage: true, alive: () => stageOpen() && state.stageIds === ids });
  });
  renderCompare(ids, $("stg-body"));
}
async function openCompare(ids) {
  ids = [...new Set(ids.map(String))].slice(0, 3);
  if (wideStage() && ids.length === 2) return openStage(ids);
  state.cmpIds = ids;
  showCmp(`<div class="pm-head"><h2 id="cmp-title">${ic("scale")} Compare players</h2></div><div class="loading small"><span class="spinner"></span> Loading their seasons…</div>`);
  ensureValues(); ensureUsage();
  const cache = (state.playerCache ||= {});
  await Promise.all(ids.map(async (id) => {
    const hit = cache[id];
    if (hit && Date.now() - hit.at < 60000) return;
    try { cache[id] = { at: Date.now(), data: await fetchPlayer(id) }; } catch { /* that column shows what it can */ }
  }));
  if (state.cmpIds !== ids || $("cmp-modal").hidden) return;
  renderCompare(ids);
}
function cmpRow(id, wk) {
  for (const sd of wk?.sides || []) { const p = sd.players.find((x) => String(x.id) === String(id)); if (p) return { ...p, ownerId: String(sd.teamId) }; }
  const f = faData()?.players?.find((x) => String(x.id) === String(id));
  return f ? { ...faRow(f, state.week), ownerId: null } : null;
}
// Everything the comparison needs about one player.
function cmpModel(id, wk) {
  const d = state.playerCache?.[id]?.data, pl = d?.player || {}, row = cmpRow(id, wk) || {};
  const posId = row.posId ?? pl.posId, weeks = d?.weeks || [], pts = weeks.map((w) => w.pts);
  const total = d?.seasonPts ?? (pts.length ? sum(pts) : row.seasonPts ?? null), gp = pts.length;
  const u = usageOf(Number(id)), cur = state.base.current, nfl = state.week?.nfl, proId = row.proId ?? pl.proId;
  const sched = nfl?.sched?.[proId], next = [];
  for (let w = cur; w < cur + 3 && w <= state.base.weeks; w++) {
    const g = sched?.[state.base.scoringPeriodFor(w)];
    next.push(g ? { opp: g[0], home: g[1], rank: nfl.oprk?.[posId]?.[g[0]]?.[0] } : { bye: true });
  }
  const byWeek = Object.fromEntries(weeks.map((w) => [w.sp, w.pts]));
  return {
    id: String(id), name: row.name || pl.name || "Player", posId, pos: POS[posId] || "", proId, nfl: PRO[proId] || "",
    ownerId: row.ownerId ?? null, status: row.status || "", waiverDate: row.waiverDate || null, row, byWeek,
    total, gp, ppg: total != null && gp ? total / gp : row.seasonAvg ?? null, best: pts.length ? Math.max(...pts) : null, floor: pts.length ? Math.min(...pts) : null,
    last3: pts.length ? sum(pts.slice(-3)) / Math.min(3, pts.length) : null,
    proj: row.proj ?? null, seasonProj: d?.seasonProj ?? row.seasonProj ?? null,
    snap: u ? u.avg?.pct ?? u.last.pct : null, tgt: u && u.pos !== "QB" ? u.avg?.share ?? u.last.share : null, rush: u ? u.avg?.rush ?? u.last.rush : null,
    rz: u && u.pos !== "QB" ? u.avg?.rz ?? u.last.rz : null,
    posRank: row.posRank ?? null, pprRank: row.pprRank ?? null, own: row.own ?? null, start: row.start ?? null, value: valueOf(Number(id)),
    injury: row.injury || pl.injury || "", bye: pl.bye ?? null, next,
  };
}
const CMP_ELIG = { 1: [0, 7], 2: [2, 3, 23, 7], 3: [4, 3, 5, 23, 7], 4: [6, 5, 23, 7], 5: [17], 16: [16] };
// How a player would fit your lineup: the points he adds, who he'd replace, who to drop, or what to offer.
function cmpFit(x, wk) {
  const side = wk?.sides?.find((sd) => String(sd.teamId) === cmpMe());
  if (!side) return null;
  const counts = { ...state.base.slotCounts };
  const gone = (p) => WONT_PLAY.test(p.injury || "") || !!p.opp?.bye;
  const val = (p) => (gone(p) ? 0 : p.proj || 0);
  const locked = (p) => { const g = gameStatusOf(p); return !!g && (g.state === "in" || g.state === "post"); };
  const active = side.players.filter((p) => p.slotId !== IR);
  const cand = { id: `cand-${x.id}`, name: x.name, posId: x.posId, pos: x.pos, proj: x.proj ?? 0, injury: x.injury, opp: x.row?.opp || { bye: x.bye === state.week.sp }, eligible: CMP_ELIG[x.posId] || [], slotId: BENCH };
  const base = optimalLineup(active, counts, val), withX = optimalLineup([...active, cand], counts, val);
  const gain = withX.points - base.points;
  const slot = withX.lineup.find((e) => e.p.id === cand.id)?.slot ?? null;
  const baseIds = new Set(base.lineup.map((e) => e.p.id)), newIds = new Set(withX.lineup.map((e) => e.p.id));
  const displaced = base.lineup.map((e) => e.p).filter((p) => !newIds.has(p.id)).sort((a, b) => val(a) - val(b))[0] || null;
  const need = (counts[{ 1: 0, 2: 2, 3: 4, 4: 6, 5: 17, 16: 16 }[x.posId]] || 0);
  const healthy = active.filter((p) => p.posId === x.posId && !gone(p)).length;
  const longTerm = (p) => (p.seasonAvg || 0) * 0.35 + (p.proj || 0) * 0.25 + (valueOf(Number(p.id)) || 0) / 2000;
  // Who to drop: the player whose loss hurts your best lineup (with him added) the least, then the weakest long-term.
  const size = rosterSize(), open = size - active.length;
  const drops = active.filter((p) => !locked(p)).map((p) => {
    const after = optimalLineup([...active.filter((q) => q.id !== p.id), cand], counts, val).points;
    const loss = Math.max(0, withX.points - after);
    return { p, loss, score: loss * 3 + longTerm(p) };
  }).sort((a, b) => a.score - b.score).slice(0, 2);
  // Trade: your players closest in value to him, with what each does to your lineup.
  let offers = [];
  if (x.ownerId && x.value) {
    offers = active.filter((p) => valueOf(Number(p.id)) != null && !locked(p)).map((p) => {
      const v = valueOf(Number(p.id)), after = optimalLineup([...active.filter((q) => q.id !== p.id), cand], counts, val).points;
      return { p, v, net: after - base.points, gap: (v - x.value) / x.value };
    }).filter((o) => o.v >= 0.6 * x.value && o.v <= 1.5 * x.value).sort((a, b) => (b.net - a.net) || (Math.abs(a.gap) - Math.abs(b.gap))).slice(0, 3);
  }
  return { gain, slot, displaced, need, healthy, open, drops, offers, side, cand, startsNow: baseIds.has(x.id) };
}
function renderCompare(ids, target) {
  const put = (h) => { if (target) target.innerHTML = h; else showCmp(h); };
  const wk = cmpWeek(), M = ids.map((id) => cmpModel(id, wk)), me = cmpMe();
  const cols = M.length;
  const pct0 = (v) => `${Math.round(v)}%`;
  const ownerOf = (m) => (m.ownerId ? (String(m.ownerId) === me ? `<strong>Your team</strong>` : esc(team(m.ownerId).name)) : m.status === "W" ? "Waivers" : "Free agent");
  // [label, value, better (hi/lo/null), format]
  const spec = [
    ["Team", (m) => `${esc(m.nfl)} · ${esc(m.pos)}`, null, null], ["On", ownerOf, null, null],
    ["Status", (m) => (m.injury ? injuryInfo(m.injury)[1] : "Healthy"), null, null],
    ["Season pts", (m) => m.total, "hi", f1], ["Games", (m) => m.gp, null, String], ["PPG", (m) => m.ppg, "hi", f1],
    ["Best week", (m) => m.best, "hi", f1], ["Floor", (m) => m.floor, "hi", f1], ["Last 3 avg", (m) => m.last3, "hi", f1],
    ["Proj this week", (m) => m.proj, "hi", f1], ["Season proj", (m) => m.seasonProj, "hi", f1],
    ["Snap %", (m) => m.snap, "hi", pct0], ["Target %", (m) => m.tgt, "hi", pct0], ["Rush %", (m) => m.rush, "hi", pct0], ["Red zone %", (m) => m.rz, "hi", pct0],
    ["Pos rank", (m) => m.posRank, "lo", (v) => `#${Math.round(v)}`], ["PPR rank", (m) => m.pprRank, "lo", (v) => `#${Math.round(v)}`],
    ["Rostered", (m) => m.own, "hi", pct0], ["Started", (m) => m.start, "hi", pct0], ["Trade value", (m) => m.value, "hi", fmtVal],
    ["Bye", (m) => m.bye, null, (v) => `Wk ${v}`],
    ["Next 3", (m) => m.next.map((n) => (n.bye ? "BYE" : `${n.home ? "" : "@"}${esc(PRO[n.opp] || "")}${n.rank ? ` <span class="rk ${rkCls(n.rank)}">${ordinal(n.rank)}</span>` : ""}`)).join(" · "), null, null],
  ];
  const cell = (m, [, get, better, fmt], vals) => {
    const v = get(m);
    if (v == null || v === "") return `<td class="muted">–</td>`;
    if (!fmt) return `<td>${v}</td>`;
    const nums = vals.filter((x) => typeof x === "number");
    const win = better && nums.length > 1 && new Set(nums).size > 1 && v === (better === "hi" ? Math.max(...nums) : Math.min(...nums));
    return `<td class="${win ? "best" : ""}">${fmt(v)}</td>`;
  };
  const head = `<tr><th></th>${M.map((m) => `<th class="cmp-p">${headshot({ id: m.id, name: m.name, posId: m.posId, proId: m.proId }, 44)}<strong>${esc(m.name)}</strong></th>`).join("")}</tr>`;
  const season = spec.map((sp) => { const vals = M.map((m) => sp[1](m)); return `<tr><td>${sp[0]}</td>${M.map((m) => cell(m, sp, vals)).join("")}</tr>`; }).join("");
  // Weekly: points each week, the best of the group highlighted.
  const weeksN = Math.max(1, state.base.current), wkRows = [];
  const wins = M.map(() => 0);
  for (let w = 1; w <= weeksN; w++) {
    const v = M.map((m) => m.byWeek[w]), nums = v.filter((x) => x != null), top = nums.length > 1 ? Math.max(...nums) : null;
    if (top != null && new Set(nums).size > 1) v.forEach((x, i) => { if (x === top) wins[i]++; });
    if (!nums.length) continue;
    wkRows.push(`<tr><td>Wk ${w}</td>${v.map((x) => (x == null ? `<td class="muted">–</td>` : `<td class="${top != null && x === top && new Set(nums).size > 1 ? "best" : ""}">${f1(x)}</td>`)).join("")}</tr>`);
  }
  const weekly = wkRows.length ? `<table class="cmp-table"><thead><tr><th>Week</th>${M.map((m) => `<th>${esc(shortName(m.name))}</th>`).join("")}</tr></thead><tbody>${wkRows.join("")}<tr class="cmp-sum"><td>Weeks won</td>${wins.map((n) => `<td>${n}</td>`).join("")}</tr></tbody></table>` : `<p class="muted small">No weekly stats yet.</p>`;

  // The verdict on each player who isn't already yours.
  const fits = M.map((m) => (String(m.ownerId) === me ? null : cmpFit(m, wk)));
  const grade = (g) => (g >= 3 ? ["Strong add", "pos"] : g >= 1 ? ["Good add", "pos"] : g >= 0.25 ? ["Depth only", ""] : ["Pass", "neg"]);
  const verdicts = M.map((m, i) => {
    const f = fits[i], mine = String(m.ownerId) === me;
    if (mine) {
      const me2 = wk?.sides?.find((sd) => String(sd.teamId) === me)?.players.find((p) => String(p.id) === m.id);
      return `<div class="cmp-v"><div class="cmp-vh">${esc(m.name)} <span class="muted small">is on your team</span></div><p class="small">${me2 ? (me2.starter ? `Starting at ${esc(SLOT[me2.slotId] || me2.slot)}.` : me2.slotId === IR ? "On your IR." : "On your bench.") : ""}</p></div>`;
    }
    if (!f) return `<div class="cmp-v"><div class="cmp-vh">${esc(m.name)}</div><p class="muted small">Star your team (☆ on the Roster tab) or sign in to see how he'd fit your lineup.</p></div>`;
    const [label, cls] = grade(f.gain), x = m;
    const lines = [];
    lines.push(f.slot != null && f.displaced ? `Would start at <strong>${esc(SLOT[f.slot])}</strong> over ${plinkNm(f.displaced, false)} (${f1(f.displaced.proj)} proj): <strong class="${cls}">+${f1(f.gain)} pts a week</strong>.`
      : f.slot != null ? `Would fill an open <strong>${esc(SLOT[f.slot])}</strong> spot: <strong class="pos">+${f1(f.gain)} pts a week</strong>.`
      : `Wouldn't crack your lineup right now; he'd be depth behind your ${esc(x.pos)}s.`);
    if (f.displaced && x.ppg != null && f.displaced.seasonAvg != null) lines.push(`${f1(x.ppg)} PPG this year vs ${f1(f.displaced.seasonAvg)} for ${esc(shortName(f.displaced.name))}.`);
    lines.push(f.healthy <= f.need ? `You're <strong>thin at ${esc(x.pos)}</strong>: ${f.healthy} healthy for ${f.need} lineup spot${f.need === 1 ? "" : "s"}.` : `You're set at ${esc(x.pos)} (${f.healthy} healthy for ${f.need} spot${f.need === 1 ? "" : "s"}).`);
    if (x.injury) lines.push(`Injury flag: ${esc(injuryInfo(x.injury)[1])}.`);
    const nb = x.next.findIndex((n) => n.bye);
    if (nb >= 0) lines.push(`Bye in ${nb === 0 ? "week " + state.base.current : "the next " + (nb + 1) + " weeks"}.`);
    let action = "";
    if (!x.ownerId) {
      const where = x.status === "W" ? `On waivers${x.waiverDate ? `, clears ${fmtWhen(x.waiverDate)}` : ""}${waiverPlace(me) ? `; you're ${waiverPlace(me)} in the order` : ""}.` : "Free agent: available now.";
      const drop = f.open > 0 ? `<p class="small">You have an open roster spot, so no drop needed.</p>` : `<div class="cmp-drops"><div class="small"><strong>Drop one of:</strong></div>${f.drops.map((d) => `<div class="cmp-drop"><span>${plinkNm(d.p, false)} <span class="muted small">${d.p.starter ? "starter" : "bench"} · ${f1(d.p.proj)} proj${d.p.seasonAvg != null ? ` · ${f1(d.p.seasonAvg)} ppg` : ""}</span><br><span class="small ${d.loss > 0.05 ? "neg" : "muted"}">${d.loss > 0.05 ? `costs ${f1(d.loss)} pts a week` : "doesn't change your lineup"}</span></span>${actTeam() ? `<button type="button" class="cmp-do" data-cmp-add="${esc(x.id)}" data-cmp-drop="${esc(d.p.id)}">Add & drop</button>` : ""}</div>`).join("")}</div>`;
      action = `<p class="small">${where}</p>${drop}`;
    } else {
      action = `<p class="small">Owned by ${esc(team(x.ownerId).name)}.${x.value ? ` Trade value ${fmtVal(x.value)}.` : ""}</p>${f.offers.length ? `<div class="cmp-drops"><div class="small"><strong>What to offer:</strong></div>${f.offers.map((o) => `<div class="cmp-drop"><span>${plinkNm(o.p, false)} <span class="muted small">${fmtVal(o.v)}</span><br><span class="small ${Math.abs(o.gap) <= 0.15 ? "pos" : "muted"}">${Math.abs(o.gap) <= 0.15 ? "even value" : o.gap > 0 ? `you'd overpay about ${Math.round(o.gap * 100)}%` : `he's worth about ${Math.round(-o.gap * 100)}% more, so expect to add something`} · your lineup ${o.net >= 0 ? "+" : "−"}${f1(Math.abs(o.net))}</span></span>${actTeam() ? `<button type="button" class="cmp-do" data-cmp-trade="${esc(x.id)}" data-cmp-give="${esc(o.p.id)}">Build trade</button>` : ""}</div>`).join("")}</div>` : `<p class="muted small">No players on your roster are close enough in trade value to match him.</p>`}`;
    }
    return `<div class="cmp-v"><div class="cmp-vh">${esc(x.name)} <span class="cmp-badge ${cls}">${label}</span></div>${lines.map((l) => `<p class="small">${l}</p>`).join("")}${action}</div>`;
  }).join("");
  // The bottom line.
  const best = M.map((m, i) => ({ m, f: fits[i] })).filter((o) => o.f).sort((a, b) => b.f.gain - a.f.gain);
  const bottom = !best.length ? "" : best.length > 1 && best[0].f.gain - best[1].f.gain >= 0.25
    ? `${esc(best[0].m.name)} is the better fit for your lineup (+${f1(best[0].f.gain)} vs +${f1(best[1].f.gain)} pts a week).`
    : best.length > 1 ? `They'd help your lineup about the same (+${f1(best[0].f.gain)} and +${f1(best[1].f.gain)} pts a week).`
    : `${esc(best[0].m.name)}: ${grade(best[0].f.gain)[0].toLowerCase()} for your lineup (+${f1(best[0].f.gain)} pts a week).`;
  put(`<div class="pm-head"><div><h2 id="cmp-title">${ic("scale")} Compare players</h2>${bottom ? `<div class="cmp-bottom">${bottom}</div>` : ""}<button type="button" class="cmp-other sm" data-cmp-other="${esc(ids[0])}">Compare other</button></div></div>
    <h3 class="pm-sub">Fit with your team</h3><div class="cmp-vs cols-${cols}">${verdicts}</div>
    <h3 class="pm-sub">Season</h3><div class="table-wrap"><table class="cmp-table"><thead>${head}</thead><tbody>${season}</tbody></table></div>
    <h3 class="pm-sub">Week by week</h3><div class="table-wrap">${weekly}</div>
    <p class="muted small">Fit uses ESPN's projections for this week and the best lineup your roster can field. It's an estimate, not a promise.</p>`);
  const body = target || $("cmp-body");
  body.querySelectorAll("[data-cmp-add]").forEach((b) => b.addEventListener("click", () => {
    const m = M.find((q) => q.id === b.dataset.cmpAdd);
    hideCmp();
    openAdd(b.dataset.cmpAdd, b.dataset.cmpDrop, { name: m?.name, posId: m?.posId, proId: m?.proId });
  }));
  body.querySelectorAll("[data-cmp-trade]").forEach((b) => b.addEventListener("click", () => {
    const x = M.find((q) => q.id === b.dataset.cmpTrade), mine = actTeam();
    if (!x?.ownerId || !mine) return;
    const ta = (state.ta ||= { my: mine, a: mine, b: x.ownerId, give: [], get: [] });
    ta.a = mine; ta.b = String(x.ownerId); ta.give = [b.dataset.cmpGive]; ta.get = [x.id];
    hideCmp();
    document.querySelector("#pl-modal .modal-close").click();
    switchTab("trade");
  }));
}

// ---------- Waiver claim odds (player card) ----------
// For a player on waivers: how likely each team is to put in a claim, in waiver order. It weighs how
// often each team has claimed or picked up players this season, whether they can field the position
// this week (byes, injuries), whether he'd start for them, and how their group at that spot compares
// with the rest of the league. An estimate, not a promise.
const claimOddsBtn = (p) => (faData()?.players?.find((x) => String(x.id) === String(p.id))?.status === "W"
  ? `<button type="button" class="odds-btn" data-wvodds="${esc(p.id)}">${ic("chart-bar")} Claim odds</button>` : "");
document.addEventListener("click", (e) => { const b = e.target.closest("[data-wvodds]"); if (b) openClaimOdds(b.dataset.wvodds); });
function claimOdds(p) {
  const pos = p.pos || POS[p.posId] || "";
  const wk = ensureCurrentRosters();
  if (!wk) return null;
  if (!state.activity) {
    state.activity = "loading";
    loadActivity().then((d) => { state.activity = d; }).catch((e) => { state.activity = { error: e.message }; })
      .finally(() => { if (state.oddsFor && !$("pl-modal").hidden && $("pl-modal-body").querySelector(".odds-pop")) openClaimOdds(state.oddsFor); });
  }
  const A = state.activity && state.activity !== "loading" && !state.activity.error ? state.activity : null;
  const sc = state.base.slotCounts || {}, slotOf = { 1: 0, 2: 2, 3: 4, 4: 6, 5: 17, 16: 16 };
  const flex = (sc[23] || 0) + (sc[3] || 0) + (sc[5] || 0);
  const need = Math.max(1, (sc[slotOf[p.posId]] || 0) + ([2, 3, 4].includes(p.posId) ? Math.round(flex / 2) : 0) + (p.posId === 1 ? sc[7] || 0 : 0));
  const canPlay = (x) => !x.opp?.bye && !WONT_PLAY.test(x.injury || "") && x.slotId !== IR;
  const weeks = Math.max(1, state.base.current - 1);
  const rows = (state.base.raw.teams || []).filter((t) => t.waiverRank).sort((a, b) => a.waiverRank - b.waiverRank).map((t) => {
    const side = wk.sides.find((x) => String(x.teamId) === String(t.id));
    const healthy = (side?.players || []).filter((x) => x.posId === p.posId && canPlay(x)).sort((a, b) => (b.proj || 0) - (a.proj || 0));
    const moves = A ? A.moves.filter((m) => String(m.teamId) === String(t.id) && (m.kind === "waiver" || m.kind === "freeagent")) : [];
    return { id: String(t.id), rank: t.waiverRank, healthy: healthy.length, kth: healthy[need - 1]?.proj ?? 0, strength: sum(healthy.slice(0, need), (x) => x.proj || 0),
      rate: sum(moves, (m) => (m.kind === "waiver" ? 1 : 0.5)) / weeks, claims: moves.filter((m) => m.kind === "waiver").length, adds: moves.filter((m) => m.kind === "freeagent").length };
  });
  const maxRate = Math.max(0.5, ...rows.map((r) => r.rate));
  const avg = sum(rows, (r) => r.strength) / Math.max(1, rows.length);
  const proj = p.proj || 0;
  for (const r of rows) {
    const act = A ? 0.25 + 0.75 * Math.min(1, r.rate / maxRate) : 0.6; // how busy they are on the wire
    const gap = r.healthy < need ? 1 : r.healthy === need ? 0.55 : 0.2; // can they field the spot this week?
    const upg = 1 / (1 + Math.exp(-(proj - r.kth) / 2.5)); // would he start for them?
    const weak = Math.max(0, Math.min(1, 0.5 + (avg - r.strength) / Math.max(5, avg))); // their group vs the league
    r.pct = Math.max(2, Math.min(95, Math.round(100 * act * (0.45 * upg + 0.3 * gap + 0.25 * weak))));
    r.why = [r.healthy < need ? `short at ${pos}` : upg > 0.6 ? `he'd start` : "", weak > 0.62 ? `thin ${pos} group` : weak < 0.35 ? `deep at ${pos}` : "",
      A ? `${r.claims} claim${r.claims === 1 ? "" : "s"} · ${r.adds} add${r.adds === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ");
  }
  return { rows, loadingActivity: !A && state.activity === "loading" };
}
function openClaimOdds(id) {
  state.oddsFor = String(id);
  const p = faData()?.players?.find((x) => String(x.id) === String(id));
  const pos = p ? p.pos || POS[p.posId] || "" : "";
  const head = `<div class="ct-head"><button type="button" class="ct-back" id="odds-back" aria-label="Back to the player">‹</button><div><h2 id="pl-modal-title">${ic("chart-bar")} Claim odds</h2>
    ${p ? `<div class="muted small">${esc(p.name)} · ${esc(pos)} · proj ${f1(p.proj)}${p.waiverDate ? ` · clears ${fmtWhen(p.waiverDate)}` : ""}</div>` : ""}</div></div>`;
  const back = () => $("odds-back")?.addEventListener("click", () => { state.oddsFor = null; openPlayer(id); });
  if (!p) { showModal(`${head}<p class="muted">He isn't on waivers anymore.</p>`); back(); return; }
  const O = claimOdds(p);
  if (!O) { showModal(`${head}<div class="odds-pop"><div class="loading small"><span class="spinner"></span> Loading rosters…</div></div>`); back(); setTimeout(() => { if (state.oddsFor === String(id) && !$("pl-modal").hidden) openClaimOdds(id); }, 800); return; }
  const me = String(myTeamId() || "");
  const mine = O.rows.findIndex((r) => r.id === me);
  const reach = mine > 0 ? O.rows.slice(0, mine).reduce((x, r) => x * (1 - r.pct / 100), 1) : null;
  showModal(`${head}<div class="odds-pop">
    ${reach != null ? `<p class="odds-reach">Chance nobody ahead of you claims him: <strong>${Math.round(reach * 100)}%</strong></p>` : mine === 0 ? `<p class="odds-reach">You're first in the waiver order. He's yours if you claim him.</p>` : ""}
    <ol class="odds-list">${O.rows.map((r) => `<li class="${r.id === me ? "me" : ""}"><span class="wv-rk">${r.rank}</span>${logoImg(team(r.id), 24)}
      <div class="odds-team"><strong>${esc(team(r.id).name)}</strong><span class="muted small">${esc(r.why)}</span></div>
      <div class="odds-pct"><strong>${r.pct}%</strong><span class="odds-bar"><i style="width:${r.pct}%"></i></span></div></li>`).join("")}</ol>
    ${O.loadingActivity ? `<p class="muted small"><span class="spinner"></span> Adding each team's claim history…</p>` : ""}
    <p class="muted small">Estimates from how often each team has claimed or picked up players this season, whether they can field a ${esc(pos)} this week (byes and injuries), whether he'd start for them, and how their ${esc(pos)} group compares with the league.</p></div>`);
  back();
}

// Put a player from another team into the mock trade, on the side opposite your team.
function goTrade(id) {
  const me = actTeam(), own = rosterOwnerOf(id);
  if (!me || !own || own === me) return;
  const ta = (state.ta ||= { my: me, a: me, b: own, give: [], get: [] });
  if (String(ta.a) !== me) { ta.a = me; ta.give = []; }
  if (String(ta.b) !== own) { ta.b = own; ta.get = []; }
  if (!ta.get.map(String).includes(String(id)) && ta.get.length < 3) ta.get.push(String(id));
  if (!$("pl-modal").hidden) document.querySelector("#pl-modal .modal-close").click();
  switchTab("trade");
  setTimeout(() => $("mock-trade")?.scrollIntoView({ behavior: "smooth", block: "start" }), 350);
}

// Shared confirm dialog: run `send`, show the result, refresh, close.
function moveDialog(title, html, goLabel, send, done) {
  showModal(`<div class="pm-head"><h2 id="pl-modal-title">${title}</h2></div>${html}
    <div class="mv-actions"><button type="button" class="mv-go" id="mv-go">${state.demo ? "Try it (demo, not sent)" : goLabel}</button><button type="button" class="mv-cancel" id="mv-cancel">Cancel</button></div>
    <p id="mv-msg" class="small"></p>`);
  const close = () => document.querySelector("#pl-modal .modal-close").click();
  $("mv-cancel").addEventListener("click", close);
  $("mv-go").addEventListener("click", async (e) => {
    const msg = $("mv-msg");
    e.target.disabled = true;
    msg.innerHTML = `<span class="spinner"></span> Sending to ESPN…`;
    try {
      await send();
      msg.innerHTML = `<span class="pos">✓ ${state.demo ? "Looks good (demo: nothing was sent)" : done}.</span>`;
      await refreshAfterMove();
      setTimeout(() => { close(); if (state.tab === "roster" && /Cancel|Withdraw|Decline/.test(title)) { if (["claims", "trades"].includes(state.chipOpen)) chipPopup(state.chipOpen, state.rosterTeam, state.week.sides.find((x) => String(x.teamId) === String(state.rosterTeam))); else if (state.pdModal) openPendingModal(); } }, 900);
    } catch (err) { msg.innerHTML = `<span class="neg">${esc(err.message)}</span>`; e.target.disabled = false; }
  });
}
function confirmDrop(teamId, p) {
  moveDialog(`Drop ${esc(p.name)}?`, `<p class="small muted">${esc(team(teamId).name)} · he goes to waivers and other teams can claim him.</p>`, "Drop on ESPN",
    () => sendMove("transaction", { teamId: Number(teamId), drop: Number(p.id) }), "Dropped on ESPN");
}
// Short summary at the top of the add/claim dialog: when it happens and where you stand.
function addSummary(p, tid, waiver) {
  if (!waiver) return `<div class="wv-sum fa"><strong>Free agent</strong> · added to your roster right away.</div>`;
  const P = ensurePending();
  const others = (P?.pending || []).filter((t) => t.type === "WAIVER").length;
  const when = p.waiverDate || nextWaiverRun();
  return `<div class="wv-sum"><strong>Waiver claim</strong>
    <div>Processes ${when ? fmtWhen(when) : "at the next waiver run"}. Nothing changes until then.</div>
    ${waiverPlace(tid) ? `<div>You're <strong>${waiverPlace(tid)}</strong> in the waiver order. If a team ahead of you claims him, your claim fails.</div>` : ""}
    ${others ? `<div>You already have ${others} pending claim${others > 1 ? "s" : ""}.</div>` : ""}</div>`;
}

// Add a free agent or claim a player off waivers, picking who (if anyone) to drop.
function openAdd(id, dropId, info = {}) {
  const tid = actTeam(), fa = faData();
  const listed = fa?.players?.find((x) => String(x.id) === String(id));
  // Not in the free-agent list the site loads (it covers the top 200): build a minimal entry.
  const raw = listed || (info.name ? { id: Number(id), name: info.name, posId: Number(info.posId) || null, proId: Number(info.proId) || null, status: "FA", proj: 0 } : null);
  if (!tid || !raw || rosterOwnerOf(id)) return;
  const p = faRow(raw, state.week), waiver = p.status === "W";
  const side = state.week.sides.find((x) => String(x.teamId) === tid);
  const roster = side?.players || [];
  const size = sum(Object.entries(state.base.slotCounts).filter(([k]) => Number(k) !== IR), ([, n]) => n);
  const full = roster.filter((x) => x.slotId !== IR).length >= size;
  const faab = !!state.base.raw.settings?.acquisitionSettings?.isUsingAcquisitionBudget;
  const order = [...roster].sort((a, b) => (a.starter - b.starter) || (a.slotId === IR) - (b.slotId === IR) || (a.proj || 0) - (b.proj || 0));
  const opt = (x) => `<label class="dr-opt ${x.locked ? "off" : ""}"><input type="radio" name="dr" value="${esc(x.id)}" ${String(x.id) === String(dropId) ? "checked" : ""} ${x.locked ? "disabled" : ""}>
    <span><strong>${esc(x.name)}</strong> <span class="muted small">${esc(x.pos)} · ${x.starter ? esc(x.slot) : x.slotId === IR ? "IR" : "Bench"} · proj ${f1(x.proj)}${x.locked ? " · locked" : ""}</span></span></label>`;
  moveDialog(`${waiver ? "Claim" : "Add"} ${esc(p.name)}`, `
    <div class="add-head">${headshot(p, 44)}<div><strong>${esc(p.name)}</strong>${injBadge(p)}<div class="muted small">${esc(p.pos)}${p.nfl ? ` · ${esc(p.nfl)}` : ""} · proj ${f1(p.proj)} in week ${state.week.week}</div></div></div>
    ${addSummary(p, tid, waiver)}
    ${waiver && faab ? `<label class="bid small">FAAB bid $ <input id="add-bid" type="number" min="0" step="1" value="0" inputmode="numeric"></label>` : ""}
    <h3 class="pm-sub">Drop</h3>
    <div class="dr-list">${full ? "" : `<label class="dr-opt"><input type="radio" name="dr" value="" ${dropId ? "" : "checked"}><span>Nobody <span class="muted small">(you have an open roster spot)</span></span></label>`}${order.map(opt).join("")}</div>`,
    waiver ? "Claim on ESPN" : "Add on ESPN",
    () => {
      const drop = document.querySelector('input[name="dr"]:checked')?.value;
      if (full && !drop) return Promise.reject(new Error("Your roster is full. Pick someone to drop."));
      return sendMove("transaction", { teamId: Number(tid), add: Number(p.id), drop: drop ? Number(drop) : null, waiver, bid: Number($("add-bid")?.value || 0) });
    },
    waiver ? "Claim submitted on ESPN" : "Added on ESPN");
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-add], [data-trade]");
  if (!b) return;
  e.preventDefault();
  if (b.dataset.trade) goTrade(b.dataset.trade);
  else openAdd(b.dataset.add, b.dataset.drop, { name: b.dataset.nm, posId: b.dataset.pos, proId: b.dataset.pro });
});

// Confirm, then send the moves to ESPN. moves = [[player, toSlot], …]
function confirmLineup(teamId, moves, opts = {}) {
  const rows = moves.map(([p, to]) => `<li><strong>${esc(p.name)}</strong> <span class="muted">${esc(p.pos)}</span>: ${esc(slotName(p.slotId))} → <strong>${esc(slotName(to))}</strong></li>`).join("");
  // Coming off IR onto a full roster: someone has to be dropped first.
  const moving = new Set(moves.map(([p]) => String(p.id)));
  const dropPick = !opts.needDrop ? "" : `<div class="wv-sum">Your roster is full, so bringing him off IR means dropping someone.</div>
    <div class="dr-list">${(opts.side?.players || []).filter((x) => x.slotId !== IR && !moving.has(String(x.id))).sort((x, y) => (x.starter - y.starter) || (x.proj || 0) - (y.proj || 0))
      .map((x) => `<label class="dr-opt ${x.locked ? "off" : ""}"><input type="radio" name="dr" value="${esc(x.id)}" ${x.locked ? "disabled" : ""}><span><strong>${esc(x.name)}</strong> <span class="muted small">${esc(x.pos)} · ${x.starter ? esc(x.slot) : "Bench"} · proj ${f1(x.proj)}</span></span></label>`).join("")}</div>`;
  showModal(`<div class="pm-head"><h2 id="pl-modal-title">Change lineup</h2></div>
    <p class="small muted">${esc(team(teamId).name)} · week ${state.week.week}</p><ul class="mv-list">${rows}</ul>${dropPick}
    <div class="mv-actions"><button type="button" class="mv-go" id="mv-go">${state.demo ? "Try it (demo, not sent)" : "Send to ESPN"}</button><button type="button" class="mv-cancel" id="mv-cancel">Cancel</button></div>
    <p id="mv-msg" class="small"></p>`);
  const close = () => document.querySelector("#pl-modal .modal-close").click();
  $("mv-cancel").addEventListener("click", close);
  $("mv-go").addEventListener("click", async (e) => {
    const msg = $("mv-msg");
    e.target.disabled = true; msg.innerHTML = `<span class="spinner"></span> Sending to ESPN…`;
    try {
      if (opts.needDrop) {
        const drop = document.querySelector('input[name="dr"]:checked')?.value;
        if (!drop) throw new Error("Pick someone to drop first.");
        await sendMove("transaction", { teamId: Number(teamId), drop: Number(drop) });
      }
      await sendMove("lineup", { teamId: Number(teamId), items: moves.map(([p, to]) => ({ playerId: Number(p.id), from: p.slotId, to })) });
      msg.innerHTML = `<span class="pos">✓ ${state.demo ? "Looks good (demo: nothing was sent)" : "Saved on ESPN"}.</span>`;
      state.lineupEdit = { teamId: String(teamId), pick: null };
      await refreshAfterMove();
      setTimeout(close, 900);
    } catch (err) { msg.innerHTML = `<span class="neg">${esc(err.message)}</span>`; e.target.disabled = false; }
  });
}

// Popup listing the available players who'd be an upgrade for `p` this week.
function openUpgrades(p) {
  const w = state.week, fa = faData();
  if (!fa || fa.error) return;
  const ups = upgradesFor(p, fa).slice(0, 20);
  const rows = ups.map((u) => {
    const row = faRow(u, w);
    const add = String(p.teamId) === actTeam() ? `<button type="button" class="add-btn ${u.status === "W" ? "wv" : ""}" data-add="${esc(u.id)}" data-drop="${esc(p.id)}" title="${u.status === "W" ? "Claim" : "Add"} ${esc(u.name)}, drop ${esc(p.name)}">+ ${u.status === "W" ? "Claim" : "Add"}</button>` : "";
    return playerRow(row, { sp: w.sp, faStats: true, action: `<div class="upg-act"><div class="upg-diff" title="Projected points more than ${esc(p.name)}">+${f1(u.proj - (p.proj || 0))}</div>${add}</div>` });
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
// Signed in as the site owner: the team you actually control in this league comes first.
const ownerTeam = () => {
  const o = state.owner;
  return !state.demo && state.base && o?.key === ownerKey() && o.data?.signedIn && o.data.teams?.length ? String(o.data.teams[0]) : null;
};
const myTeamId = () => ownerTeam() || store.get(`ffb.myteam.${state.leagueId || "default"}`) || state.base?.raw?.siteOwnerTeamIds?.[0] || null;
const myRow = (teamId) => (teamId != null && String(teamId) === String(myTeamId()) ? "my-row" : "");
const setMyTeam = (id) => { store.set(`ffb.myteam.${state.leagueId || "default"}`, String(id)); if (state.ta) state.ta.my = String(id); };
function updateEspnLink() {
  const a = $("espn-open");
  if (!a || !state.base) return;
  const chat = $("chat-open"), owner = !state.demo && !!ownerTeam();
  if (chat) { chat.hidden = !owner; a.hidden = owner; if (owner) ensureChatBadge(); }
  document.body.classList.toggle("has-chatbar", !!chat && !chat.hidden && DESK.matches);
  const my = myTeamId(), season = state.base.season;
  a.href = my && state.base.teams[my]
    ? `${ESPN_FF}/team?leagueId=${espnLeague()}&teamId=${my}&seasonId=${season}`
    : `${ESPN_FF}/league?leagueId=${espnLeague()}&seasonId=${season}`;
  a.title = my && state.base.teams[my] ? `Open ${team(my).name} in ESPN` : "Open this league in ESPN";
}

// ---------- Trade values (FantasyCalc) ----------
// FantasyCalc's terms require a visible credit and link wherever their values appear.
const fcCredit = () => `<p class="fc-credit small muted">Data: <a href="https://fantasycalc.com" target="_blank" rel="noopener">FantasyCalc</a></p>`;
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
const nvCredit = () => `<p class="fc-credit small muted">Data: <a href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noopener">nflverse</a> (CC BY 4.0)</p>`;
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
  // Red zone (plays snapped inside the opponent's 20): his targets + carries vs. the team's.
  const rzOf = (wk) => pl.w[wk]?.[5] || [0, 0, 0, 0, 0];
  const teamRz = (wk, t) => (teamOf(wk, t)[3] || 0) + (teamOf(wk, t)[4] || 0);
  const e = pl.w[lastWk];
  const lastRz = rzOf(lastWk), lastTeamRz = teamRz(lastWk, e?.[3] || team);
  const last = e ? { wk: lastWk, snaps: e[0], pct: e[1], tgt: e[2], teamSnaps: teamOf(lastWk, e[3])[0], share: teamOf(lastWk, e[3])[1] ? (e[2] / teamOf(lastWk, e[3])[1]) * 100 : null,
      car: e[4] || 0, rush: teamOf(lastWk, e[3])[2] ? ((e[4] || 0) / teamOf(lastWk, e[3])[2]) * 100 : null,
      rzN: lastRz[0] + lastRz[1], rzTeam: lastTeamRz, rz: lastTeamRz ? ((lastRz[0] + lastRz[1]) / lastTeamRz) * 100 : null, rzTd: lastRz[3] }
    : { wk: lastWk, snaps: 0, pct: 0, tgt: 0, teamSnaps: teamOf(lastWk, team)[0], share: 0, car: 0, rush: 0, rzN: 0, rzTeam: lastTeamRz, rz: 0, rzTd: 0, out: true };
  const avgOf = (list) => {
    if (!list.length) return null;
    const tgt = sum(list, (w) => pl.w[w][2]), teamTgt = sum(list, (w) => teamOf(w, pl.w[w][3])[1]);
    const car = sum(list, (w) => pl.w[w][4] || 0), teamCar = sum(list, (w) => teamOf(w, pl.w[w][3])[2] || 0);
    const rz = (i) => sum(list, (w) => rzOf(w)[i]), rzTeam = sum(list, (w) => teamRz(w, pl.w[w][3]));
    const rzN = rz(0) + rz(1);
    return { pct: sum(list, (w) => pl.w[w][1]) / list.length, share: teamTgt ? (tgt / teamTgt) * 100 : null, tgt: tgt / list.length,
      rush: teamCar ? (car / teamCar) * 100 : null, car: car / list.length, games: list.length,
      rz: rzTeam ? (rzN / rzTeam) * 100 : null, rzN, rzTeam, rzTgt: rz(0), rzCar: rz(1), rz10: rz(2), rzTd: rz(3), rzPass: rz(4) };
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
  return `<span data-tip="${usageTip(u)}">${pctTxt(u.avg?.pct ?? u.last.pct)}${usageTrend(u.last.pct, u.prior?.pct)}</span><div class="pt-sub">last ${pctTxt(u.last.pct)}</div>`;
}
function tgtCell(p) {
  const u = usageOf(p.id);
  if (!u || u.pos === "QB") return DASH;
  return `<span data-tip="${usageTip(u)}">${pctTxt(u.avg?.share ?? u.last.share)}${usageTrend(u.last.share ?? 0, u.prior?.share)}</span><div class="pt-sub">last ${pctTxt(u.last.share)}</div>`;
}
// Red zone: share of the team's targets + carries snapped inside the opponent's 20 (QBs: not shown).
const rzTip = (u) => { const a = u.avg; return esc(`<b>Red zone (inside the 20)</b>${a ? `Season: ${a.rzTgt} target${a.rzTgt === 1 ? "" : "s"}, ${a.rzCar} carr${a.rzCar === 1 ? "y" : "ies"} (${pctTxt(a.rz)} of the team's ${a.rzTeam}), ${a.rz10} inside the 10, ${a.rzTd} TD${a.rzTd === 1 ? "" : "s"}<br>` : ""}Week ${u.last.wk}: ${u.last.rzN} of ${u.last.rzTeam}${u.last.rzTd ? `, ${u.last.rzTd} TD` : ""}`); };
function rzCell(p) {
  const u = usageOf(p.id);
  if (!u || u.pos === "QB") return DASH;
  return `<span data-tip="${rzTip(u)}">${pctTxt(u.avg?.rz ?? u.last.rz)}${usageTrend(u.last.rz ?? 0, u.prior?.rz)}</span><div class="pt-sub">last ${pctTxt(u.last.rz)}</div>`;
}
function rushCell(p) {
  const u = usageOf(p.id);
  if (!u) return DASH;
  return `<span data-tip="${usageTip(u)}">${pctTxt(u.avg?.rush ?? u.last.rush)}${usageTrend(u.last.rush ?? 0, u.prior?.rush)}</span><div class="pt-sub">last ${pctTxt(u.last.rush)}</div>`;
}
// One-line summary for player rows: season shares, "Snaps 84% · Tgt 22%".
function usageBrief(id) {
  const u = usageOf(id);
  if (!u) return "";
  const avg = (k) => u.avg?.[k] ?? u.last[k];
  return `<span data-tip="${usageTip(u)}">Snaps ${pctTxt(avg("pct"))}${usageTrend(u.last.pct, u.prior?.pct)}${u.pos !== "QB" && avg("share") != null ? ` · Tgt ${pctTxt(avg("share"))}` : ""}${u.pos === "RB" && avg("rush") != null ? ` · Rush ${pctTxt(avg("rush"))}` : ""}</span>`;
}

// ---------- Game-day weather (Open-Meteo) ----------
// Open-Meteo's license (CC BY 4.0) asks for credit wherever the forecast appears.
const wxCredit = () => `<p class="fc-credit small muted">Data: <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a> (CC BY 4.0)</p>`;

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

const wxIcon = (code) => ic(code >= 95 ? "cloud-storm" : (code >= 71 && code <= 77) || code >= 85 ? "snowflake" : code >= 51 ? "cloud-rain" : code >= 45 ? "cloud-fog" : code >= 2 ? "cloud" : code >= 1 ? "sun-high" : "sun");
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
function wxChip(proId, liveState, compact = false) {
  const g = wxGame(proId);
  if (!g || g.state === "post" || liveState === "post") return "";
  if (wxIndoors(g)) return `<span class="wx wx-in" data-tip="${wxTip(g)}">${ic("building-stadium")}</span>`;
  const f = g.forecast;
  if (!f) return "";
  if (compact) return `<span class="wx ${f.precipProb >= 50 ? "wx-wet" : ""}" data-tip="${wxTip(g)}">${wxIcon(f.code)}${f.windMph >= 15 ? ic("wind") : ""}</span>`;
  return `<span class="wx ${f.precipProb >= 50 ? "wx-wet" : ""}" data-tip="${wxTip(g)}">${wxIcon(f.code)} ${f.precipProb}%${f.windMph >= 15 ? ` ${ic("wind")}` : ""}</span>`;
}
// One-line summary for a game card on the Live games tab.
function wxLine(g) {
  if (!g || g.state === "post") return "";
  const f = g.forecast;
  if (g.roof === "dome") return `<div class="g-wx" data-tip="${wxTip(g)}">${ic("building-stadium")} <strong>Indoors</strong> <span class="muted">· ${esc(g.venue)}</span></div>`;
  const roof = g.roof === "retractable"
    ? `<span class="wx-roof ${wxIndoors(g) ? "closed" : ""}">Retractable roof${g.roofCall?.call ? `: ${esc(g.roofCall.call)}` : ""}</span>` : "";
  if (wxIndoors(g)) return `<div class="g-wx" data-tip="${wxTip(g)}">${ic("building-stadium")} ${roof} <span class="muted">· ${esc(g.roofCall?.why || "")}</span></div>`;
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
      .finally(() => { if (state.base === base && (state.tab === "injuries" || state.tab === "players")) render(); });
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

// The Injury Report, as a popup over the Players tab.
function openInjuryReport() {
  showModal(`<div class="pm-head"><h2 id="pl-modal-title">${ic("first-aid-kit")} Injury Report</h2></div><div class="inj-pop"></div>`);
  $("pl-modal").querySelector(".modal-card").classList.add("pm-full");
  const el = $("pl-modal-body").querySelector(".inj-pop");
  const draw = () => { if (el.isConnected) renderInjuries(el, draw); };
  draw();
}
// The Injury Report's columns, shared with the Players table on computers.
function injuryKit(D, week) {
  const owners = new Map((week?.sides || []).flatMap((sd) => sd.players.map((p) => [String(p.id), sd.teamId])));
  const me = String(myTeamId() || "");
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
  const who = (x, p) => (x ? `${plink(x[0], shortName(x[1]))} ${ownerTag(x[0])} ${moveBtns({ id: x[0], name: x[1], posId: posIdOf(p.pos), proId: p.proId })}${snap(x[0]) != null ? `<div class="pt-sub">${pctTxt(snap(x[0]))} snaps last game</div>` : ""}` : `<span class="muted">–</span>`);
  const recovery = (p) => { const t = `${p.type} ${p.detail} ${p.status}`; return RECOVERY.find(([re]) => re.test(t))?.[1] || "Varies"; };

  const enrich = (p) => { const x = { ...p, out: weeksOut(p), next: nextUp(p), fnext: fantasyNext(p) }; x.ret = retWeek(x); return x; };
  const cols = [
    { key: "name", label: "Player", cls: "pt-player", dir: 1, render: (p) => `<div class="pt-name inj-name">${plinkNm(p)}</div><div class="pt-sub inj-sub">${esc(p.pos)} ${ownerTag(p.id)}${injBadge({ injury: INJ_CODE[p.status] || p.status.toUpperCase() })}${moveBtns({ id: p.id, name: p.name, posId: posIdOf(p.pos), proId: p.proId })}</div>` },
    { key: "status", label: "Status", dir: 1, sort: (p) => INJ_ORDER[p.status] ?? 9, render: (p) => esc(p.status) },
    { key: "type", label: "Injury", dir: 1, render: (p) => `<span ${p.note ? `data-tip="${esc(`<b>${esc(p.name)}</b>${esc(p.note)}`)}"` : ""}>${esc([p.type, p.detail].filter(Boolean).join(" – ") || (p.status === "Suspension" ? "Suspension" : "Not disclosed"))}${p.side ? ` <span class="muted">(${esc(p.side)})</span>` : ""}</span>` },
    { key: "recovery", label: "Typical recovery", title: "Typical time missed for this kind of injury (a rough guide)", dir: 1, sort: (p) => recovery(p), render: (p) => esc(recovery(p)) },
    { key: "out", label: "Weeks out", title: "Games in a row his team has played without him (from nflverse snap counts)", num: true, render: (p) => (p.out == null ? `<span class="muted">–</span>` : String(p.out)) },
    { key: "ret", label: "Possible return", title: "Fantasy week he could be back: ESPN's return date matched to his team's schedule (byes skipped). IR players must sit at least four games.", dir: 1, sort: (p) => (p.ret === "season" ? 99 : p.ret ?? 98), render: retCell },
    { key: "next", label: "Next up", title: "Next healthy player behind him on the team's depth chart", dir: 1, sort: (p) => p.next?.[1] || "~", render: (p) => who(p.next, p) },
    { key: "fnext", label: "Fantasy fill-in", title: "Of his healthy backups, the one who played the most snaps last game", dir: 1, sort: (p) => p.fnext?.[1] || "~", render: (p) => who(p.fnext, p) },
  ];
  return { owners, me, ownerTag, enrich, cols, byId: new Map(D.players.map((p) => [String(p.id), p])) };
}
function renderInjuries(el = $("view-injuries"), redraw = () => renderInjuries()) {
  ensureUsage(); // weeks missed and snap shares fill in when they arrive
  const D = ensureInjuries(), week = ensureCurrentRosters();
  if (!D) { el.innerHTML = `<div class="loading"><span class="spinner"></span> Loading the injury report…</div>`; setTimeout(() => { if (el.isConnected) redraw(); }, 800); return; }
  if (D.error) { el.innerHTML = `<div class="banner">${esc(D.error)}</div>`; return; }
  const f = (state.injF ||= { pos: "ALL", roster: "all", mine: false, sort: { key: "status", dir: 1 } });
  const K = injuryKit(D, week), { owners, me } = K, cols = K.cols;
  const rows = D.players
    .filter((p) => f.pos === "ALL" || p.pos === f.pos)
    .filter((p) => f.roster === "all" || (f.roster === "rostered" ? owners.has(String(p.id)) : !owners.has(String(p.id)) || (f.mine && String(owners.get(String(p.id))) === me)))
    .map(K.enrich);
  const btn = (key, val, label) => `<button type="button" data-${key}="${val}" class="${f[key] === val ? "active" : ""}">${label}</button>`;
  el.innerHTML = `<div class="filters inj-filters">
      <div class="seg">${["ALL", "QB", "RB", "WR", "TE", "K"].map((p) => btn("pos", p, p === "ALL" ? "All" : p)).join("")}</div>
      <div class="seg">${btn("roster", "all", "All")}${btn("roster", "available", "Available")}${btn("roster", "rostered", "On rosters")}</div>
    </div>
    <div id="inj-table"></div>
    <p class="fc-credit small muted">Data: ESPN · <a href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noopener">nflverse</a> (CC BY 4.0)</p>`;
  const draw = () => {
    const box = el.querySelector("#inj-table");
    if (!rows.length) { box.innerHTML = `<p class="muted">No players match those filters.</p>`; return; }
    box.replaceChildren(sortableTable(cols, rows, f.sort, draw, { tableClass: "pt-table inj-table" }));
  };
  draw();
  el.querySelectorAll("[data-pos],[data-roster]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.pos) f.pos = b.dataset.pos;
    if (b.dataset.roster) f.roster = b.dataset.roster;
    redraw();
  }));
  el.querySelector("#inj-mine")?.addEventListener("change", (e) => { f.mine = e.target.checked; redraw(); });
}

// ---------- Team usage tab ----------
// Every QB/RB/WR/TE on one NFL team, week by week, in one of three views:
// share of offensive snaps, share of the team's targets, share of the team's rushing attempts, or share
// of its red-zone targets + carries (plays inside the opponent's 20).
// Week entries are [snaps, snap%, targets, team, carries, rz?: [targets, carries, inside10, tds, passAtt]];
// team weeks are [snaps, targets, carries, rzTargets, rzCarries]. count/team are an index or a function.
const UT_MODES = {
  snap: { label: "Snap share", count: 0, team: 0, unit: "snaps", what: "offensive snaps", full: 100, pos: ["QB", "RB", "WR", "TE"] },
  tgt: { label: "Target share", count: 2, team: 1, unit: "tgt", what: "targets", full: 35, pos: ["RB", "WR", "TE"] },
  rush: { label: "Rushing share", count: 4, team: 2, unit: "att", what: "rushing attempts", full: 70, pos: ["QB", "RB", "WR", "TE"] },
  rz: { label: "Red zone", count: (e) => (e[5]?.[0] || 0) + (e[5]?.[1] || 0), team: (t) => (t[3] || 0) + (t[4] || 0), unit: "rz", what: "red-zone targets and carries", full: 50, pos: ["QB", "RB", "WR", "TE"] },
};
const utGet = (row, k) => (typeof k === "function" ? k(row) : row[k]);
function renderUsage(el = $("view-usage"), redraw = () => renderUsage()) {
  ensureValues(); // trade values (used by the player popup) fill in when they arrive
  const U = ensureUsage(), w = state.week, f = state.players;
  if (!U) { el.innerHTML = `<div class="loading"><span class="spinner"></span> Loading snap counts…</div>`; setTimeout(() => { if (el.isConnected) redraw(); }, 800); return; }
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

  const teamTot = (wk) => (tw[wk] ? utGet(tw[wk], M.team) || 0 : 0);
  const seasonTot = sum(played, teamTot);
  const entry = (p, wk) => (p.w[wk]?.[3] === T ? p.w[wk] : null);
  const count = (p, wk) => { const e = entry(p, wk); return e ? utGet(e, M.count) || 0 : 0; };
  // Share for one week: snap % comes straight from the data; the others are count / team total.
  const share = (p, wk) => {
    const e = entry(p, wk);
    if (!e) return 0;
    return snapMode ? e[1] : teamTot(wk) ? (utGet(e, M.count) / teamTot(wk)) * 100 : 0;
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
        const n = utGet(e, M.count) || 0;
        return `<td class="num" ${heat(v)} title="${n} of ${teamTot(wk)} team ${M.what}">${pctTxt(v)}<div class="pt-sub">${n} ${M.unit}</div></td>`;
      }).join("");
      const name = typeof p.id === "number" ? plinkNm({ id: p.id, name: p.name }) : `<span class="nm-full">${esc(p.name)}</span><span class="nm-short">${esc(shortName(p.name))}</span>`;
      const acts = typeof p.id === "number" ? moveBtns({ id: p.id, name: p.name, posId: posIdOf(p.pos), proId: proIdOf(T) }) : "";
      return `<tr><td class="pt-player"><div class="pt-name">${name}${trend(p)} ${acts}</div><div class="ut-owner">${ownerOf(p.id)}</div></td>${cells}
        <td class="num"><strong>${pctTxt(seasonShare(p))}</strong><div class="pt-sub">${p.total} ${M.unit}</div></td></tr>`;
    }).join("");
    return head + rows;
  }).join("");

  const whatCap = M.what[0].toUpperCase() + M.what.slice(1);
  el.innerHTML = `<div class="filters ut-filters">
      <select class="ut-team" aria-label="NFL team">${teams.map((t) => `<option value="${t}" ${t === T ? "selected" : ""}>${esc(NFL_NAMES[t])}</option>`).join("")}</select>
      <div class="seg ut-mode">${Object.entries(UT_MODES).map(([k, m]) => `<button data-m="${k}" class="${f.utMode === k ? "active" : ""}">${m.label}</button>`).join("")}</div>
    </div>
    ${players.length ? `<div class="table-wrap"><table class="data pt-table ut-table"><thead><tr><th class="pt-player">Player</th>${weeks.map((wk) => `<th class="num">Wk ${wk}</th>`).join("")}<th class="num">Season</th></tr></thead>
      <tbody><tr class="ut-total"><td class="pt-player">Team total<div class="pt-sub">${whatCap}</div></td>${weeks.map((wk) => (!tw[wk] ? noGame : `<td class="num">${teamTot(wk)}</td>`)).join("")}<td class="num">${seasonTot}</td></tr>
      ${groups}</tbody></table></div>` : `<p class="muted">No ${M.what} recorded for this team yet.</p>`}${nvCredit()}`;
  el.querySelector(".ut-team").addEventListener("change", (e) => { f.utTeam = e.target.value; redraw(); });
  el.querySelector(".ut-mode").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { f.utMode = b.dataset.m; redraw(); }));
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
      ${list.map((v) => `<div class="fa-row"><span>${plink(v.espnId, v.name)} <span class="muted small">${esc(v.nfl)}</span> ${moveBtns({ id: v.espnId, name: v.name, posId: posIdOf(pos), proId: proIdOf(v.nfl) })}${upgrade(v) ? ` <span class="badge live" title="Worth more than your weakest starter at ${pos}">UPGRADE</span>` : ""}</span><span class="num">${valueCell(v.espnId)}</span></div>`).join("") || `<p class="muted small">No ${pos}s with a FantasyCalc value are available.</p>`}</div>`;
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
    // Phones: the running total of what this side sends, under its players.
    const total = sum(ids.map((id) => list.find((p) => String(p.id) === id)).filter(Boolean), (p) => p.value);
    if (!DESK.matches) return chips + (ids.length ? `<div class="mock-total">Total value <strong>${fmtVal(total)}</strong></div>` : "") + add;
    // Computers: the team's whole roster (starters, bench, IR) with a tap to add or remove each player.
    const order = (x) => (x.slotId === IR ? 3 : x.slotId === BENCH ? 2 : 1) * 100 + (POS_ORDER.indexOf(x.pos) + 1) * 10 - Math.min(9, x.value / 1000);
    const full = ids.length >= 3;
    const row = (x) => { const on = ids.includes(String(x.id)); return `<button type="button" class="mock-pl ${on ? "on" : ""}" data-tg="${name}" data-id="${x.id}" ${!on && full ? "disabled" : ""}>
        <span class="mock-ck">${on ? "✓" : "+"}</span><span class="mock-pl-slot">${esc(x.slotId === IR ? "IR" : x.slotId === BENCH ? "BE" : SLOT[x.slotId] || x.pos)}</span>
        <span class="mock-pl-nm">${esc(x.name)}<small>${esc(x.pos)}${x.nfl ? ` · ${esc(x.nfl)}` : ""}${injBadge(x)}</small></span><span class="mock-pl-val">${x.value ? fmtVal(x.value) : "–"}</span></button>`; };
    const sorted = [...list].sort((a, b) => order(a) - order(b));
    // Computers: the picked players show in the trade window above, so the card is just the roster.
    return `<div class="mock-roster">${sorted.map(row).join("")}</div>${full ? `<p class="small muted">Up to 3 players per side.</p>` : ""}`;
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
      <div class="tr-impact">${impact(A, nameA, L.profiles[A], afterA)}${impact(B, nameB, L.profiles[B], afterB)}</div>${consolidation}
      ${actTeam() && [String(A), String(B)].includes(actTeam()) ? `<button type="button" class="mv-go ta-propose" id="ta-propose">Propose this trade on ESPN</button>` : ""}</div>`;
  }

  const teamOpts = (sel, exclude) => teamIds.filter((id) => id !== exclude).map((id) => `<option value="${id}" ${id === String(sel) ? "selected" : ""}>${esc(team(id).name)}</option>`).join("");
  // Computers: the mock trade and trade ideas on the left; your team and free agents in a column on the right.
  const desk = DESK.matches;
  const meSel = `<label class="small muted ta-me">My team <select id="ta-my">${teamOpts(ta.my)}</select></label>`;
  // Computers: a trade window above the two full rosters: what each side sends, with running totals, and
  // the grade underneath once both sides have someone. It updates in view as players are picked.
  const sideBox = (tid, list, k) => `<div class="tw-side"><div class="tw-head">${logoImg(team(tid), 22)}<strong>${esc(team(tid).name)}</strong><span class="muted small">sends</span></div>
      ${list.length ? list.map((p) => `<div class="tw-pl"><span class="tw-nm">${esc(p.name)} <span class="muted small">${esc(p.pos)}${p.nfl ? ` · ${esc(p.nfl)}` : ""}</span></span><span class="tw-v">${fmtVal(p.value)}</span><button type="button" class="mock-rm" data-rm="${k}" data-id="${p.id}" aria-label="Remove ${esc(p.name)}">×</button></div>`).join("")
        : `<p class="muted small tw-empty">Pick players from ${esc(team(tid).name)}'s roster below.</p>`}
      <div class="tw-total"><span>Total value</span><strong>${fmtVal(sum(list, (p) => p.value))}</strong></div></div>`;
  const tradeWindow = `<div class="tw">${sideBox(A, sendA, "give")}<div class="tw-x" aria-hidden="true">⇄</div>${sideBox(B, sendB, "get")}</div>`;
  const mockSec = `<div class="section-head" id="mock-trade"><h2>Mock trade</h2><span class="muted small">Any two teams · up to 3 players per side</span></div>
    ${desk ? `<div class="card ta-result">${tradeWindow}${sendA.length && sendB.length ? result : ""}</div>` : ""}
    <div class="mock">
      <div class="card"><div class="mock-head">${logoImg(team(A), 22)}<select id="ta-a" aria-label="First team">${teamOpts(A)}</select></div><div class="mock-sends">sends</div>${pick(playersA, ta.give, "give")}</div>
      ${desk ? `<div class="mock-x" aria-hidden="true">⇄</div>` : ""}
      <div class="card"><div class="mock-head">${logoImg(team(B), 22)}<select id="ta-b" aria-label="Second team">${teamOpts(B, A)}</select></div><div class="mock-sends">sends</div>${pick(playersB, ta.get, "get")}</div>
    </div>
    ${desk ? "" : `<div class="card ta-result">${result}</div>`}`;
  const teamSec = `<div class="section-head"><h2>Your team</h2>${desk ? meSel : ""}</div>
    <div class="grid grid-awards">
      <div class="card award"><div class="label">Roster value</div><div class="value">${fmtVal(me.total)}</div><div class="why"><span class="${rkCls(L.ranks.total[ta.my])}">${rk(L.ranks.total[ta.my])}</span> in the league</div></div>
      <div class="card award"><div class="label">Starting lineup value</div><div class="value">${fmtVal(me.lineupValue)}</div><div class="why"><span class="${rkCls(L.ranks.lineup[ta.my])}">${rk(L.ranks.lineup[ta.my])}</span> in the league</div></div>
      <div class="card award"><div class="label">Strongest position</div><div class="value">${strongest}</div><div class="why">${rk(L.ranks[strongest][ta.my])}</div></div>
      <div class="card award"><div class="label">Weakest position</div><div class="value">${weakest}</div><div class="why">${rk(L.ranks[weakest][ta.my])}</div></div>
    </div>
    <div class="section-head"><h2>Team analysis</h2><span class="muted small">Your top players at each position vs. every other team</span></div>
    <div class="table-wrap"><table class="data ta-pos"><thead><tr><th>Pos</th><th>Your core players</th><th class="num">Value</th><th class="num">League rank</th><th class="num">vs. avg</th></tr></thead><tbody>${posRows}</tbody></table></div>
    <h3 class="ta-sub">What your team is lacking</h3>
    <ul class="insights">${lacking.map((s) => `<li>${s}</li>`).join("")}</ul>`;
  const faSec = `${desk ? `<div class="section-head"><h2>Best available free agents</h2></div>` : `<div class="section-head"><h2>Potential adds</h2></div>
    <h3 class="ta-sub">Best available free agents</h3>`}
    <div class="grid grid-2 fa-grid">${faRows}</div>
    <p class="small muted">Free agents or players on waivers. FantasyCalc only values QB, RB, WR and TE.</p>`;
  const ideasSec = `${desk ? `<div class="section-head"><h2>Trade ideas</h2></div>` : ""}
    <h3 class="ta-sub">Win-win trades</h3>
    <p class="small muted">Fair trades (within 15% in value) where both teams' starting lineups get better.</p>
    <div class="grid targets">${winWinRows}</div>
    <h3 class="ta-sub">Trade targets</h3>
    <div class="grid targets">${targetRows}</div>`;
  el.innerHTML = desk
    ? `<div class="section-head"><h2>Trade Analyzer</h2></div>
      <div class="ta-layout"><div class="ta-main">${mockSec}${ideasSec}</div><aside class="ta-side">${teamSec}${faSec}</aside></div>
      ${fcCredit()}${nvCredit()}`
    : `<div class="section-head"><h2>Trade Analyzer</h2>
      ${meSel}</div>
    ${mockSec}${teamSec}${faSec}${ideasSec}
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
  $("ta-propose")?.addEventListener("click", () => {
    const meA = String(A) === actTeam();
    const mine = meA ? sendA : sendB, theirs = meA ? sendB : sendA, other = meA ? B : A;
    const li = (list) => list.map((p) => `<li><strong>${esc(p.name)}</strong> <span class="muted small">${esc(p.pos)} · ${fmtVal(p.value)}</span></li>`).join("");
    moveDialog(`Propose a trade to ${esc(team(other).name)}`, `
      <div class="tp-sides"><div><div class="muted small">You send</div><ul class="mv-list">${li(mine)}</ul></div><div><div class="muted small">You get</div><ul class="mv-list">${li(theirs)}</ul></div></div>
      <p class="small muted">ESPN sends the offer to ${esc((team(other).owner || team(other).name).replace(/\.$/, ""))}. It expires in 2 days if they don't answer, and the league's review period applies if they accept.</p>
      <label class="tp-note small">Message (optional)<textarea id="tp-comment" rows="2" maxlength="500"></textarea></label>`,
      "Send proposal",
      () => sendMove("trade", { teamId: Number(actTeam()), otherTeamId: Number(other), send: mine.map((p) => Number(p.id)), receive: theirs.map((p) => Number(p.id)), comment: $("tp-comment")?.value || "" }),
      "Trade proposal sent on ESPN");
  });
  el.querySelectorAll("select[data-side]").forEach((s) => s.addEventListener("change", () => {
    if (!s.value) return;
    ta[s.dataset.side] = [...ta[s.dataset.side], s.value].filter((v, i, a) => v && a.indexOf(v) === i).slice(0, 3);
    renderTradeAnalyzer();
  }));
  el.querySelectorAll("[data-tg]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.tg, id = b.dataset.id;
    ta[k] = ta[k].map(String).includes(id) ? ta[k].filter((x) => String(x) !== id) : [...ta[k], id].slice(0, 3);
    const y = scrollY;
    renderTradeAnalyzer();
    scrollTo(scrollX, y);
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
  const desk = DESK.matches;
  const row = (m) => {
    const when = `<div class="tx-when">${fmtDate(m.date)}</div>`;
    if (m.kind === "trade") {
      return `<div class="card tx tx-trade">${when}<div class="tx-main"><span class="tx-kind trade">Trade</span>${tradeSidesHtml(m.sides)}</div></div>`;
    }
    const lines = [...m.adds.map((id) => `<div class="tx-line add">+ ${player(id)}</div>`), ...m.drops.map((id) => `<div class="tx-line drop">− ${player(id)}</div>`)].join("");
    const bid = m.bid != null && m.kind === "waiver" ? `<div class="tx-bid">$${m.bid}</div>` : "";
    // Computers: one line per move (when · team · added · dropped · bid).
    if (desk) return `<div class="tx tx-row">${when}<div class="tx-who">${teamName(m.teamId, 22)}<span class="tx-kind ${m.kind}">${kindLabel[m.kind]}</span></div>
      <div class="tx-adds">${m.adds.map((id) => `<div class="tx-line add">+ ${player(id)}</div>`).join("")}</div>
      <div class="tx-drops">${m.drops.map((id) => `<div class="tx-line drop">− ${player(id)}</div>`).join("")}</div>${bid || `<div class="tx-bid"></div>`}</div>`;
    return `<div class="card tx">${when}<div class="tx-main"><div class="tx-head">${teamName(m.teamId, 26)}<span class="tx-kind ${m.kind}">${kindLabel[m.kind]}</span></div>${lines}</div>${bid}</div>`;
  };
  const groups = [];
  for (const m of moves) {
    const g = groups[groups.length - 1];
    if (g && g.week === m.week) g.items.push(m); else groups.push({ week: m.week, items: [m] });
  }
  const teamOpts = Object.values(state.base.teams).sort((x, y) => x.name.localeCompare(y.name))
    .map((t) => `<option value="${t.id}" ${String(f.team) === String(t.id) ? "selected" : ""}>${esc(t.name)}</option>`).join("");

  const sideHtml = `${waiverSection()}<div class="section-head"><h2>Pending trades</h2><span class="muted small">Trades both teams accepted that haven't gone through yet</span></div>
    ${pending}`;
  const mainHtml = `<div class="section-head"><h2>Transactions</h2><span class="muted small">Waiver claims, free-agent moves and completed trades, newest first</span></div>
    <div class="filters">
      <select id="tx-team" aria-label="Team"><option value="ALL">All teams</option>${teamOpts}</select>
      <div class="seg" id="tx-kind">${[["all", "All"], ["waiver", "Waivers"], ["freeagent", "Free agents"], ["trade", "Trades"]].map(([k, l]) => `<button data-k="${k}" class="${f.kind === k ? "active" : ""}">${l}</button>`).join("")}</div>
    </div>
    ${groups.length ? groups.map((g) => `<h3 class="tx-week">${weekLabel(g.week)}</h3><div class="tx-list${desk ? " card" : ""}">${g.items.map(row).join("")}</div>`).join("") : `<p class="muted">No transactions match.</p>`}`;
  // Computers: the transaction feed on the left, waivers and pending trades in a column on the right.
  el.innerHTML = desk
    ? `<div class="mv-layout"><div class="mv-main">${mainHtml}</div><aside class="mv-side">${sideHtml}</aside></div>${hasValues ? fcCredit() : ""}`
    : `${sideHtml}${mainHtml}${hasValues ? fcCredit() : ""}`;
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
    state.cards = [];
    hideCmp();
    setDock(false);
    dropChatPop();
    document.body.classList.remove("modal-open");
    m.querySelector(".modal-card").classList.remove("pm-full", "chat-card");
    clearInterval(state.chatTimer); state.chatView = null;
    state.modalReturn?.focus?.();
    if (state.newsReadChanged && state.tab === "roster") { state.newsReadChanged = false; renderRoster(); }
  };
  m.addEventListener("click", (e) => { if (e.target === m || e.target.closest(".modal-close")) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !m.hidden) close(); });
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".pl-link, .pts-link");
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    if (state.cmpPick && b.classList.contains("pl-link")) { finishPick(b.dataset.pid); return; }
    if (b.classList.contains("pts-link")) { openPtsPop(b.dataset.pid, Number(b.dataset.sp), b); return; } // a score: a small scoring breakdown
    if (stageOpen()) closeStage();
    state.modalReturn = b;
    openPlayer(b.dataset.pid, b.dataset.sp ? Number(b.dataset.sp) : null);
  }, true);
  // The scoring breakdown: a popup anchored to the score you tapped, growing upward from it.
  const pts = document.createElement("div");
  pts.id = "pts-modal";
  pts.hidden = true;
  pts.innerHTML = `<div class="pts-card" role="dialog" aria-labelledby="pts-title"><button type="button" class="modal-close pts-x" aria-label="Close">×</button><div id="pts-body"></div><i class="pts-arrow"></i></div>`;
  document.body.appendChild(pts);
  pts.addEventListener("click", (e) => {
    const full = e.target.closest("[data-pts-card]");
    if (full) { closePts(); openPlayer(full.dataset.ptsCard, Number(full.dataset.sp)); return; }
    if (!e.target.closest(".pts-card") || e.target.closest(".pts-x")) closePts();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !pts.hidden) { closePts(); e.stopImmediatePropagation(); } }, true);
  // The comparison popup sits on top of the card(s).
  const cmp = document.createElement("div");
  cmp.id = "cmp-modal";
  cmp.className = "modal cmp";
  cmp.hidden = true;
  cmp.innerHTML = `<div class="modal-card cmp-card" role="dialog" aria-modal="true" aria-labelledby="cmp-title"><button type="button" class="modal-close" aria-label="Close">×</button><div id="cmp-body"></div></div>`;
  document.body.appendChild(cmp);
  cmp.addEventListener("click", (e) => {
    const o = e.target.closest("[data-cmp-other]");
    if (o) { startPick(o.dataset.cmpOther); return; }
    if (e.target === cmp || e.target.closest(".modal-close")) hideCmp();
  });
  // Esc with nothing open cancels "Compare other".
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && state.cmpPick && $("pl-modal").hidden && cmp.hidden) endPick(); });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (stageOpen()) { closeStage(); e.stopImmediatePropagation(); }
    else if (!cmp.hidden) { hideCmp(); e.stopImmediatePropagation(); }
  }, true);
}

// On computers the player card and chat open as a panel docked on the right (the page stays usable);
// other popups stay centered.
function setDock(on) {
  const d = !!on && DESK.matches;
  $("pl-modal").classList.toggle("dock", d);
  document.body.classList.toggle("has-dock", d);
  if (d) document.body.classList.remove("modal-open");
}
// Docked player card: ↑ / ↓ step through the players on the page, in order.
document.addEventListener("keydown", (e) => {
  if (!$("pl-modal")?.classList.contains("dock") || $("pl-modal").hidden || !state.pmFor || !["ArrowUp", "ArrowDown"].includes(e.key)) return;
  if (e.target.closest?.("input, textarea, select")) return;
  const ids = [...new Set([...$(`view-${state.tab}`).querySelectorAll(".pl-link[data-pid]")].map((b) => b.dataset.pid))];
  const i = ids.indexOf(String(state.pmFor)), next = ids[i + (e.key === "ArrowDown" ? 1 : -1)];
  if (i < 0 || !next) return;
  e.preventDefault();
  $(`view-${state.tab}`).querySelector(`.pl-link[data-pid="${CSS.escape(next)}"]`)?.scrollIntoView({ block: "nearest" });
  openPlayer(next, null, null, { replace: true });
});
// How a score was made: the week's scoring lines, in a popup that grows upward from the score you tapped
// (below it only when there's no room above).
let ptsAnchor = null;
const ptsScrollClose = (e) => { if (!(e.target?.nodeType === 1 && e.target.closest(".pts-card"))) closePts(); };
function closePts() {
  const pop = $("pts-modal");
  if (!pop || pop.hidden) return;
  pop.hidden = true;
  ptsAnchor?.classList.remove("pts-active");
  ptsAnchor = null;
  window.removeEventListener("scroll", ptsScrollClose, true);
  window.removeEventListener("resize", closePts);
}
function placePts() {
  const card = $("pts-modal").querySelector(".pts-card"), a = ptsAnchor;
  if (!a || !a.isConnected) return closePts();
  const r = a.getBoundingClientRect(), vw = innerWidth, vh = innerHeight, m = 8, gap = 10;
  const w = Math.min(340, vw - 2 * m), cx = r.left + r.width / 2, left = Math.max(m, Math.min(cx - w / 2, vw - w - m));
  const above = r.top - gap - m, below = vh - r.bottom - gap - m, up = above >= 160 || above >= below;
  card.style.width = `${w}px`;
  card.style.left = `${left}px`;
  card.style.setProperty("--ax", `${Math.max(20, Math.min(cx - left, w - 20))}px`);
  card.classList.toggle("below", !up);
  const room = Math.max(120, up ? above : below);
  card.style.top = up ? "auto" : `${r.bottom + gap}px`;
  card.style.bottom = up ? `${vh - r.top + gap}px` : "auto";
  $("pts-body").style.maxHeight = `${room - 4}px`;
}
async function openPtsPop(id, sp, anchor) {
  const pop = $("pts-modal"), body = $("pts-body");
  id = String(id);
  closePts();
  ptsAnchor = anchor || null;
  anchor?.classList.add("pts-active");
  body.innerHTML = `<div class="loading small"><span class="spinner"></span> Loading…</div>`;
  pop.hidden = false;
  window.addEventListener("scroll", ptsScrollClose, true);
  window.addEventListener("resize", closePts);
  const card = pop.querySelector(".pts-card");
  card.classList.remove("grow"); void card.offsetWidth; card.classList.add("grow"); // the pop-up animation
  placePts();
  const cache = (state.playerCache ||= {});
  if (!cache[id] || Date.now() - cache[id].at > 60000) {
    try { cache[id] = { at: Date.now(), data: await fetchPlayer(id) }; }
    catch (e) { if (!pop.hidden) { body.innerHTML = `<div class="banner">${esc(e.message)}</div>`; placePts(); } return; }
  }
  if (pop.hidden || ptsAnchor !== (anchor || null)) return;
  const d = cache[id].data, p = d.player, w = d.weeks.find((x) => x.sp === sp);
  body.innerHTML = `<div class="pm-head">${headshot({ id: p.id, name: p.name, posId: p.posId, proId: p.proId }, 44)}<div><h2 id="pts-title">${esc(p.name)}</h2>
      <div class="muted small">${esc(POS[p.posId] || "")} · ${esc(PRO[p.proId] || "")} · Week ${sp}${w?.opp ? ` · ${w.home ? "vs" : "@"} ${esc(PRO[w.opp] || "")}` : ""}</div></div></div>
    ${w ? `<div class="pts-line">${esc(compactLine(p.posId, w.stats) || gameLine(p.posId, w.stats))}</div>${breakdownHtml(w, p.posId)}` : (() => {
        const row = cmpRow(id, cmpWeek()), live = row && sp === state.week?.sp && row.played;
        return `${live && row.short ? `<div class="pts-line">${esc(row.short)}</div>` : ""}<p class="muted small">${live ? `${f2(row.actual)} points so far. ESPN hasn't posted the scoring detail yet; it fills in as the game goes.` : `No scoring for week ${sp}.`}</p>`;
      })()}
    <button type="button" class="pg-go" data-pts-card="${esc(id)}" data-sp="${sp}">Open player card ›</button>`;
  placePts(); // taller now: it grows upward from the score
}
// Open the shared popup with arbitrary content (e.g. the Roster tab's upgrade list).
function showModal(html) {
  const m = $("pl-modal");
  setDock(false);
  dropChatPop();
  m.querySelector(".modal-card").classList.remove("pm-full", "chat-card");
  $("pl-modal-body").innerHTML = html;
  m.hidden = false;
  document.body.classList.add("modal-open");
  m.querySelector(".modal-close").focus();
  m.querySelector(".modal-card").scrollTop = 0;
}

// Up to three player cards stay open at once (chips across the top of the card switch between them).
const MAX_CARDS = 3;
function pushCard(id, replace) {
  const cards = (state.cards ||= []);
  const at = cards.indexOf(id);
  if (at >= 0) cards.splice(at, 1);
  else if (replace) { const cur = cards.indexOf(String(state.pmFor)); if (cur >= 0) cards.splice(cur, 1); }
  cards.push(id); // the one on screen is always last, so the oldest is the one that drops off
  while (cards.length > MAX_CARDS) cards.shift();
}
function closeCard(id) {
  const cards = state.cards || [], i = cards.indexOf(String(id));
  if (i < 0) return;
  cards.splice(i, 1);
  hideCmp();
  if (!cards.length) { document.querySelector("#pl-modal .modal-close").click(); return; }
  openPlayer(String(state.pmFor) === String(id) ? cards.at(-1) : state.pmFor);
}
async function openPlayer(id, focusSp, tab, opts = {}) {
  id = String(id);
  closeStage();
  pushCard(id, opts.replace);
  const m = $("pl-modal"), body = $("pl-modal-body");
  dropChatPop();
  m.querySelector(".modal-card").classList.remove("chat-card");
  m.querySelector(".modal-card").classList.add("pm-full"); // same size on every tab, so switching tabs doesn't jump
  state.pmNewsSnap = null;
  m.hidden = false;
  document.body.classList.add("modal-open");
  setDock(true);
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
  state.pmTab = tab || (focusSp ? "log" : "overview");
  renderPlayerModal(cache[id].data, focusSp);
}

// Jump from a player popup to their game on Live games: open the game with the box score on their team.
function goLiveGame(id, side) {
  closeStage();
  document.querySelector("#pl-modal .modal-close")?.click();
  (state.liveOpen ||= {})[id] = true;
  state.liveSel = id;
  (state.boxUi ||= {})[id] = { open: true, view: "players", side: side || "away" };
  switchTab("live");
  const scrollTo = () => document.querySelector(`.card.game[data-game="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  setTimeout(scrollTo, 350);
  setTimeout(scrollTo, 1600); // again once the live data has loaded
}

// ctx is only given for the side-by-side compare screen: { body, st, alive, stage }, so two cards can be on screen
// at once, each with its own tab and game-log view. Otherwise it draws into the usual popup.
function renderPlayerModal(d, focusSp, ctx) {
  const S = ctx?.st || state, body = ctx?.body || $("pl-modal-body");
  const alive = () => (ctx ? ctx.alive() : !$("pl-modal").hidden);
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
    const rz = e?.[5] || [0, 0, 0, 0, 0], tRz = (tm?.[3] || 0) + (tm?.[4] || 0);
    return e ? { snap: e[1], snaps: e[0], tgt: tm?.[1] ? (e[2] / tm[1]) * 100 : null, tgts: e[2], rush: tm?.[2] ? ((e[4] || 0) / tm[2]) * 100 : null, car: e[4] || 0,
      rz: tRz ? ((rz[0] + rz[1]) / tRz) * 100 : null, rzN: rz[0] + rz[1] } : null;
  };
  const uCell = (v, n, unit) => (v == null ? `<td class="num muted">–</td>` : `<td class="num">${Math.round(v)}%<div class="pt-sub">${n} ${unit}</div></td>`);
  // Game log views: Passing / Rushing / Receiving / Usage (QB, RB, WR, TE). Starts on the one that fits him.
  const hasViews = [1, 2, 3, 4].includes(p.posId);
  if (S.glFor !== String(p.id)) { S.glFor = String(p.id); S.glMode = { 1: "pass", 2: "rush", 3: "rec", 4: "rec" }[p.posId] || "pass"; }
  const mode = hasViews ? S.glMode : "game";
  const STAT = { pass: [3, 4], rush: [24, 25], rec: [42, 43] };
  const ncols = mode === "use" ? 6 : mode === "game" ? 3 : mode === "rec" ? 8 : mode === "rush" ? 7 : 6;
  const sv = (w, id) => Math.round(w.stats?.[id] || 0);
  // Opponent, with its rank against his position (red = tough, green = easy).
  const oppCell = (opp, home, sub = "") => {
    const r = opp ? state.week?.nfl?.oprk?.[p.posId]?.[opp]?.[0] : null;
    return `<td class="gl-game"><strong>${opp ? `${home ? "vs" : "@"} ${esc(PRO[opp] || "")}` : "–"}</strong>${r ? ` <span class="rk ${rkCls(r)}">${ordinal(r)}</span>` : ""}${sub ? `<div class="gl-line">${sub}</div>` : ""}</td>`;
  };
  const logRows = (sps) => sps.map((sp) => {
    const w = bySp[sp];
    if (!w) {
      // Same row as a played game: the opponent and kickoff (or why there's no line), dashes for the numbers.
      const g = state.week?.nfl?.sched?.[p.proId]?.[sp];
      const bye = p.bye === sp || (state.week?.nfl?.sched?.[p.proId] && !g);
      const future = sp > state.base.current || (sp === state.base.current && !bySp[sp]);
      const why = bye ? "" : future ? (sp === state.base.current ? "This week" : "Upcoming") : "Did not play";
      return `<tr class="gl-row gl-none ${future ? "gl-future" : ""}"><td class="gl-wk">${sp}</td>${bye ? `<td class="gl-game"><strong>BYE</strong></td>` : oppCell(g?.[0], g?.[1], why)}
        ${`<td class="num muted">–</td>`.repeat(ncols - 2)}</tr>`;
    }
    const open = focusSp === sp;
    const pts = `<td class="num gl-ptd"><button type="button" class="gl-pts" aria-expanded="${open}" aria-controls="gl-bd-${sp}">${f1(w.pts)}<span class="caret">▾</span></button></td>`;
    let cells;
    if (mode === "use") {
      const u = ul ? usage(sp) : null;
      cells = !u ? `<td class="num muted">–</td>`.repeat(4) : `${uCell(u.snap, u.snaps, "snp")}${uCell(u.tgt, u.tgts, "tgt")}${uCell(u.rush, u.car, "att")}${uCell(u.rz, u.rzN, "rz")}`;
    } else if (mode === "game") {
      cells = pts;
    } else {
      const [yd, td] = STAT[mode];
      cells = `${mode === "rec" ? `<td class="num">${sv(w, 58)}</td><td class="num">${sv(w, 53)}</td>` : mode === "rush" ? `<td class="num">${sv(w, 23)}</td>` : ""}<td class="num">${sv(w, yd)}</td><td class="num">${sv(w, td)}</td><td class="num">${sv(w, 20)}/${sv(w, 72)}</td>${pts}`;
    }
    const line = mode === "game" ? esc(compactLine(p.posId, w.stats) || gameLine(p.posId, w.stats)) : "";
    return `<tr class="gl-row ${open ? "open" : ""}" data-sp="${sp}"><td class="gl-wk">${sp}</td>${oppCell(w.opp, w.home, line)}${cells}</tr>
      ${mode === "use" ? "" : `<tr class="gl-bd" id="gl-bd-${sp}" ${open ? "" : "hidden"}><td colspan="${ncols}">${breakdownHtml(w, p.posId)}</td></tr>`}`;
  }).join("");
  const heads = mode === "use" ? `<th class="num" title="Share of the team's offensive snaps">Snap%</th><th class="num" title="Share of the team's targets">Tgt%</th><th class="num" title="Share of the team's rushing attempts">Rush%</th><th class="num" title="Share of the team's red-zone targets and carries (inside the 20)">RZ%</th>`
    : mode === "game" ? `<th class="num">FPTS</th>`
    : `${mode === "rec" ? `<th class="num" title="Targets">Tgt</th><th class="num" title="Receptions">Rec</th>` : mode === "rush" ? `<th class="num" title="Rushing attempts">Att</th>` : ""}<th class="num" title="${{ pass: "Passing", rush: "Rushing", rec: "Receiving" }[mode]} yards">Yds</th><th class="num" title="${{ pass: "Passing", rush: "Rushing", rec: "Receiving" }[mode]} touchdowns">TD</th><th class="num" title="Interceptions thrown / fumbles lost">I/F</th><th class="num" title="Fantasy points (tap to see how they were scored)">FPTS</th>`;
  const logTable = (sps) => `<table class="data gamelog gl-compact gl-${mode}"><thead><tr><th class="gl-wk">Wk</th><th>Opp</th>${heads}</tr></thead><tbody>${logRows(sps)}</tbody></table>`;
  const glModes = hasViews ? `<div class="seg gl-modes">${[["pass", "Passing"], ["rush", "Rushing"], ["rec", "Receiving"], ["use", "Usage"]].map(([k, l]) => `<button type="button" data-glm="${k}" class="${mode === k ? "active" : ""}">${l}</button>`).join("")}</div>` : "";

  S.pmFor = String(p.id);
  const rerender = () => { if (alive() && S.pmFor === String(p.id)) renderPlayerModal(d, focusSp, ctx); };

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
  // His moves this season (adds, drops, trades), newest first: the last three, then the rest behind a button.
  const txHistory = () => {
    if (!state.activity) {
      state.activity = "loading";
      loadActivity().then((x) => { state.activity = x; }).catch((e) => { state.activity = { error: e.message }; }).finally(rerender);
    }
    const A = state.activity;
    if (A === "loading") return `<h3 class="pm-sub">Transactions</h3><div class="loading small"><span class="spinner"></span> Loading transactions…</div>`;
    if (!A || A.error) return "";
    const pid = Number(p.id);
    const list = A.moves.filter((m) => (m.adds || []).includes(pid) || (m.drops || []).includes(pid) || (m.sides || []).some((x) => x.gets.includes(pid) || x.drops.includes(pid))).sort((a, b) => b.date - a.date);
    const when = (ms) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const tn = (id) => `<strong>${esc(team(id).name)}</strong>`;
    const row = (m) => {
      let kind = "", text = "";
      if (m.kind === "trade") {
        const to = m.sides.find((x) => x.gets.includes(pid)), from = m.sides.find((x) => x !== to);
        kind = "trade"; text = to ? `Traded to ${tn(to.teamId)}${from ? ` from ${tn(from.teamId)}` : ""}` : `Dropped by ${tn(m.sides.find((x) => x.drops.includes(pid))?.teamId)} in a trade`;
      } else if ((m.adds || []).includes(pid)) {
        kind = m.kind; text = `${m.kind === "waiver" ? "Claimed" : "Added"} by ${tn(m.teamId)}${m.bid ? ` for $${m.bid}` : ""}`;
      } else { kind = "drop"; text = `Dropped by ${tn(m.teamId)}`; }
      const label = { waiver: "Waivers", freeagent: "Free agent", trade: "Trade", drop: "Drop" }[kind];
      return `<div class="txh-row"><span class="txh-date">${when(m.date)}</span><span class="tx-kind ${kind}">${label}</span><span class="txh-text">${text}</span></div>`;
    };
    if (!list.length) return `<h3 class="pm-sub">Transactions</h3><p class="muted small">No moves this season.</p>`;
    return `<h3 class="pm-sub">Transactions</h3><div class="txh">${list.slice(0, 3).map(row).join("")}</div>
      ${list.length > 3 ? `<div class="txh tx-more" hidden>${list.slice(3).map(row).join("")}</div><button type="button" class="link-btn txh-btn" data-txmore="Full history (${list.length}) ▾">Full history (${list.length}) ▾</button>` : ""}`;
  };
  // This week's game (what used to be the Game tab): score, the field, last play, his lines, his team's box score.
  const gameSection = () => {
    if (!lg) return !state.live ? `<div class="loading small"><span class="spinner"></span> Loading this week's game…</div>`
      : `<h3 class="pm-sub">This week</h3><p class="muted small">${p.bye && p.bye === state.base.current ? `On bye in week ${p.bye}.` : "No game for his team this week."}</p>`;
    const head = `<div class="pm-game-head">
        <span class="pgh-team"><img src="${esc(lg.away.logo)}" alt="" width="26" height="26">${esc(lg.away.abbr)}</span><strong>${lg.state === "pre" ? "" : lg.away.score ?? ""}</strong>
        <span class="pgh-mid">${lg.state === "in" ? `<span class="badge live">LIVE</span> ${esc(lg.detail)}` : lg.state === "post" ? "Final" : esc(kick(lg))}</span>
        <strong>${lg.state === "pre" ? "" : lg.home.score ?? ""}</strong><span class="pgh-team">@${esc(lg.home.abbr)}<img src="${esc(lg.home.logo)}" alt="" width="26" height="26"></span></div>`;
    const sp2 = lg.state === "in" ? shownPlay(lg) : null;
    const ddm = /^(.*?)\s+at\s+(.+)$/.exec(lg.downDistance || "");
    const dd = lg.state === "in" && lg.downDistance ? `<p class="small pm-dd"><strong>${esc(ddm ? ddm[1] : lg.downDistance)}</strong>${ddm ? ` at ${esc(ddm[2])}` : ""}</p>` : "";
    const team = boxReady ? (box.players[side] || []) : [];
    const pre = lg.state === "pre" ? `<p class="muted small">${lg.broadcast ? `${esc(lg.broadcast)} · ` : ""}Stats and the field show up here at kickoff.</p>` : "";
    return `<h3 class="pm-sub">This week</h3>${head}${lg.state === "in" ? fieldGraphic(lg) : ""}${dd}${sp2?.text ? `<p class="small muted pm-last">${sp2.earlier ? "Last snap" : "Last play"}: ${esc(sp2.text)}</p>` : ""}${pre}
      ${started ? `<h3 class="pm-sub">${esc(p.name)}</h3>${myLines}` : ""}
      ${team.length ? `<details class="pm-box"><summary>${esc(box.teams?.[side]?.name || "Team")} box score</summary><div class="pg-cats">${team.map((c) => catTable(c, c.rows.map((r) => `<tr class="${String(r.id) === String(p.id) ? "me" : ""}"><td class="pg-name">${esc(r.short || shortName(r.name))}</td>${r.stats.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join(""))).join("")}</div></details>` : ""}
      <button type="button" class="pg-go" data-golive="${esc(lg.id)}" data-side="${side}">Open on the Live tab ›</button>`;
  };

  const tabs = [["overview", lg?.state === "in" ? `<span class="pm-live-dot"></span>Overview` : "Overview"], ["log", "Game log"], ["news", "News"], ["usage", "Usage"], ["depth", "Depth chart"]];
  if (S.pmTab === "game") S.pmTab = "overview";
  if (!tabs.some(([k]) => k === S.pmTab)) S.pmTab = "overview";
  const tab = S.pmTab;

  let pane = "";
  if (tab === "overview") {
    // Stat sheet: label over value, four to a row; season totals; this week; the last three games.
    const totals = {};
    for (const w of weeks) for (const [k, v] of Object.entries(w.stats || {})) if (typeof v === "number") totals[k] = (totals[k] || 0) + v;
    const seasonLine = weeks.length ? gameLine(p.posId, totals) : "";
    const cells = [
      ["Pts", f1(total)], ["GP", games], ["PPG", games ? f1(total / games) : "–"], ["Best", best ? `${f1(best.pts)}<small>wk ${best.sp}</small>` : "–"],
      d.seasonProj ? ["Proj", f1(d.seasonProj)] : null,
      uAvg?.avg ? ["Snap %", pctTxt(uAvg.avg.pct)] : null,
      uAvg?.avg && uAvg.pos !== "QB" ? ["Tgt %", pctTxt(uAvg.avg.share)] : null,
      val ? ["Value", fmtVal(val.value)] : null,
      ...(() => {
        const r = state.week?.sides?.flatMap((x) => x.players).find((x) => String(x.id) === String(p.id)) || faData()?.players?.find((x) => String(x.id) === String(p.id));
        if (!r) return [];
        return [["PPR rk", r.pprRank ? `${pos}${Math.round(r.pprRank)}<small>wk ${state.week.week}</small>` : "–"], ["Pos rk", r.posRank ? `${pos}${r.posRank}` : "–"],
          r.own != null ? ["Rost %", `${Math.round(r.own)}%`] : null, r.start != null ? ["Start %", `${Math.round(r.start)}%`] : null].filter(Boolean);
      })(),
    ].filter(Boolean);
    const recent = weeks.map((w) => w.sp).sort((x, y) => y - x).slice(0, 3);
    const score = (sd) => (lg.state === "pre" ? "" : ` ${sd.score ?? ""}`);
    const nd = ensureNews([p.id], rerender), all = nd?.players?.[p.id] || [];
    // What was unread when the card opened stays marked "New" while you flip tabs.
    if (nd && !S.pmNewsSnap) { S.pmNewsSnap = unreadNews(String(p.id), all); markNewsRead(String(p.id), all); }
    const fresh = S.pmNewsSnap || [];
    const shown = fresh.length ? fresh.slice(0, 3) : all.slice(0, 1);
    const newsBox = !nd ? "" : !all.length ? "" : `<h3 class="pm-sub">${fresh.length ? `News <span class="badge live">${fresh.length} new</span>` : "Latest news"}</h3>
      <div class="news">${shown.map((n) => newsItem(n)).join("")}</div>${all.length > shown.length ? `<button type="button" class="link-btn pm-allnews" data-pmtab="news">All news (${all.length}) ›</button>` : ""}`;
    pane = `<div class="pm-sheet">${cells.map(([l, v]) => `<div><span>${l}</span><strong>${v}</strong></div>`).join("")}</div>
      ${seasonLine ? `<p class="pm-season small"><span class="muted">Season:</span> ${esc(seasonLine)}</p>` : ""}
      ${newsBox}
      ${gameSection()}
      ${recent.length ? `<h3 class="pm-sub">Recent games</h3>${logTable(recent)}` : ""}
      ${txHistory()}`;
  } else if (tab === "usage") {
    pane = `<div class="pm-usage"></div>`;
  } else if (tab === "log") {
    const all = Array.from({ length: Math.max(18, lastWeek) }, (_, i) => i + 1); // the whole NFL season
    pane = `${focusSp && !bySp[focusSp] ? `<p class="muted small">No stats yet for week ${focusSp}.</p>` : ""}
      ${glModes}
      ${logTable(all)}${ul ? nvCredit() : ""}`;
  } else if (tab === "depth") {
    const dc = p.proId ? ensureDepth(p.proId, rerender) : null;
    pane = !p.proId ? `<p class="muted">Not on an NFL team.</p>`
      : !dc ? `<div class="loading small"><span class="spinner"></span> Loading the depth chart…</div>`
      : dc.error ? `<p class="muted small">${esc(dc.error)}</p>` : depthTable(dc.depth, p);
  } else {
    const nd = ensureNews([p.id], rerender);
    const items = nd?.players?.[p.id] || [];
    if (nd && !S.pmNewsSnap) { S.pmNewsSnap = unreadNews(String(p.id), items); markNewsRead(String(p.id), items); }
    const isNew = new Set((S.pmNewsSnap || []).map((n) => n.published));
    pane = !nd ? `<div class="loading small"><span class="spinner"></span> Loading news…</div>`
      : items.length ? `<div class="news">${items.map((n) => newsItem(n, isNew.has(n.published) ? `<span class="badge live news-new">NEW</span>` : "")).join("")}</div>${newsCredit()}`
      : `<p class="muted small">No player updates from ESPN yet.</p>`;
  }

  const cardStrip = !ctx && (state.cards || []).length > 1 ? `<div class="pm-cards">${state.cards.map((cid) => { const nm = state.playerCache?.[cid]?.data?.player?.name || "Player"; return `<span class="pc-chip ${cid === String(p.id) ? "active" : ""}" data-card="${esc(cid)}" role="button" tabindex="0">${esc(shortName(nm))}<button type="button" class="pc-x" data-cardx="${esc(cid)}" aria-label="Close ${esc(nm)}">×</button></span>`; }).join("")}</div>` : "";
  body.innerHTML = `${cardStrip}<div class="pm-head">
      ${headshot({ id: p.id, name: p.name, posId: p.posId, proId: p.proId }, 64)}
      <div><h2 id="pl-modal-title">${esc(p.name)}${injBadge({ injury: p.injury })}</h2>
        <div class="muted small">${pos}${p.proId ? ` · ${esc(PRO[p.proId] || "")}` : ""}${p.bye ? ` · Bye wk ${p.bye}` : ""}</div>
        <div class="pm-owner">${owner}</div><div class="pm-acts">${moveBtns({ id: p.id, name: p.name, posId: p.posId, proId: p.proId }, true) + claimOddsBtn(p) + watchBox(p.id, ` ${ic("eye")}`)}<button type="button" class="cmp-btn" data-compare>${ic("scale")} Compare</button></div></div>
    </div>
    <div class="pm-tabs-wrap"><div class="pm-tabs" role="tablist">${tabs.map(([k, label]) => `<button type="button" role="tab" data-pmtab="${k}" aria-selected="${k === tab}" class="${k === tab ? "active" : ""}">${label}</button>`).join("")}</div>
      <button type="button" class="pm-more" aria-label="More tabs" hidden>»</button></div>
    <div class="pm-pane">${pane}</div>`;
  body.querySelectorAll("[data-pmtab]").forEach((b) => b.addEventListener("click", () => {
    const x = body.querySelector(".pm-tabs")?.scrollLeft || 0;
    S.pmTab = b.dataset.pmtab;
    renderPlayerModal(d, focusSp, ctx);
    const sc = body.closest(".modal-card, .stg-card"); if (sc) sc.scrollTop = 0;
    const row = body.querySelector(".pm-tabs");
    if (row) { row.scrollLeft = x; row.querySelector(".active")?.scrollIntoView({ block: "nearest", inline: "nearest" }); }
  }));
  // Swipe left/right on the card to move between its tabs.
  if (!body.dataset.swipe) {
    body.dataset.swipe = "1";
    let sx = 0, sy = 0, ok = false;
    body.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      ok = e.touches.length === 1 && !e.target.closest(".pm-tabs, .table-wrap, .pg-cats, .field-wrap, input, textarea, select");
      sx = t.clientX; sy = t.clientY;
    }, { passive: true });
    body.addEventListener("touchend", (e) => {
      if (!ok) return;
      const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      const keys = [...body.querySelectorAll(".pm-tabs [data-pmtab]")].map((b) => b.dataset.pmtab);
      const next = keys[keys.indexOf(S.pmTab) + (dx < 0 ? 1 : -1)];
      if (!next) return;
      S.pmSlide = dx < 0 ? "right" : "left";
      body.querySelector(`.pm-tabs [data-pmtab="${next}"]`)?.click();
    }, { passive: true });
  }
  const paneEl = body.querySelector(".pm-pane");
  if (S.pmSlide && paneEl) { paneEl.classList.add(`slide-${S.pmSlide}`); S.pmSlide = null; }
  // » shows while tabs are hidden off the right edge; tapping it scrolls them into view.
  const tabRow = body.querySelector(".pm-tabs"), more = body.querySelector(".pm-more");
  const updMore = () => { more.hidden = tabRow.scrollLeft + tabRow.clientWidth >= tabRow.scrollWidth - 4; };
  tabRow.addEventListener("scroll", updMore, { passive: true });
  more.addEventListener("click", () => tabRow.scrollBy({ left: tabRow.clientWidth * 0.7, behavior: "smooth" }));
  requestAnimationFrame(updMore);
  body.querySelector("[data-golive]")?.addEventListener("click", (e) => goLiveGame(e.currentTarget.dataset.golive, e.currentTarget.dataset.side));
  const ue = body.querySelector(".pm-usage");
  if (ue) {
    // Starts on his NFL team each time a card opens; the menu can look at any team.
    if (S.pmUsageFor !== String(p.id)) { S.pmUsageFor = String(p.id); state.players.utTeam = PRO[p.proId] || ""; state.players.utMode = "snap"; }
    const draw = () => { if (body.querySelector(".pm-usage") === ue) renderUsage(ue, draw); };
    draw();
  }
  body.querySelectorAll("[data-card]").forEach((b) => b.addEventListener("click", (e) => { if (!e.target.closest("[data-cardx]")) openPlayer(b.dataset.card); }));
  body.querySelectorAll("[data-cardx]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); closeCard(b.dataset.cardx); }));
  body.querySelector("[data-compare]")?.addEventListener("click", () => startCompare(String(p.id)));
  body.querySelectorAll("[data-glm]").forEach((b) => b.addEventListener("click", () => { S.glMode = b.dataset.glm; renderPlayerModal(d, focusSp, ctx); }));
  body.querySelectorAll("[data-txmore]").forEach((b) => b.addEventListener("click", () => { const box = body.querySelector(".tx-more"); box.hidden = !box.hidden; b.textContent = box.hidden ? b.dataset.txmore : "Show less ▴"; }));
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
    <p class="fc-credit small muted">Data: ESPN</p>` : `<p class="muted small">No depth chart from ESPN for this team.</p>`;
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
  if (!$("owner-btn").dataset.wired) { $("owner-btn").dataset.wired = "1"; $("owner-btn").addEventListener("click", openOwnerSignIn); $("notify-btn")?.addEventListener("click", openNotifications); $("chat-open")?.addEventListener("click", openChat); placeChatBtn();
    $("ft-alerts")?.addEventListener("click", openNotifications); $("ft-acct")?.addEventListener("click", openOwnerSignIn);
    document.querySelectorAll("[data-ftlg]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); if (a.dataset.ftlg !== String(state.leagueId || LEAGUES[0].id)) switchLeague(a.dataset.ftlg, ""); scrollTo(0, 0); })); DESK.addEventListener?.("change", placeChatBtn); }
  ensureOwner();
  updateOwnerLink();
  if (!state.live && !state.liveBoot && state.tab !== "live") { state.liveBoot = true; refreshLive().finally(() => { state.liveBoot = false; }); }
  updateEspnLink();
  showView(state.tab);
  keepState($(`view-${state.tab}`), () => renderTab());
}
function renderTab() {
  ({ roster: renderRoster, matchups: renderMatchups, live: renderLive, players: renderPlayers, usage: renderUsage, injuries: renderInjuries, managers: renderManagers, season: renderSeason, history: renderHistory, trade: renderTradeAnalyzer, transactions: renderTransactions })[state.tab]();
}

// Fetch (or reuse) one week's data without touching the screen.
async function getWeek(week, force, fresh = false) {
  const base = state.base;
  if (!force && state.weekCache[week]?.nfl) return state.weekCache[week];
  const sp = base.scoringPeriodFor(week);
  const [raw, nfl] = await Promise.all([api(["mBoxscore", "mMatchupScore", "mRoster"], sp, state.season, fresh), loadNfl(sp)]);
  if (state.base !== base) throw new ApiError("stale", "League changed while loading.");
  const w = buildWeek(raw, week, nfl);
  w.nfl = nfl || {};
  state.weekCache[week] = w;
  return w;
}

async function loadWeek(week, force) {
  state.week = null;
  state.preDrawn = {};
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
  preloadNeighbors();
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
  // Phones: one word in the pill, like the logo ("Brown"); computers have room for "Brown League".
  const name = (l) => (DESK.matches ? l.label : l.label.replace(/\s*League\s*$/i, ""));
  sel.innerHTML = LEAGUES.map((l) => `<option value="${l.id}" ${l.id === current ? "selected" : ""}>${esc(name(l))}</option>`).join("")
    + (known ? "" : `<option value="${esc(current)}" selected>League ${esc(current)}</option>`);
  sel.hidden = state.demo;
  $("league-name").hidden = !state.demo; // the dropdown doubles as the title
  requestAnimationFrame(fitLeagueSelect);
}
// A dropdown is as wide as its longest option; size the pill to the league that's showing.
function fitLeagueSelect() {
  const sel = $("league-select");
  if (!sel || sel.hidden) return;
  const cs = getComputedStyle(sel), c = (fitLeagueSelect.ctx ||= document.createElement("canvas").getContext("2d"));
  c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const w = c.measureText(sel.options[sel.selectedIndex]?.text || "").width;
  sel.style.width = `${Math.ceil(w + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 2 * parseFloat(cs.borderLeftWidth) + 4)}px`;
}
document.fonts?.ready.then(() => fitLeagueSelect());

let pendingWeek = parseInt(params.get("week")) || null;
let pendingWaivers = params.has("waivers") ? Number(params.get("waivers")) || 0 : null;
let pendingPlayer = /^\d{1,10}$/.test(params.get("player") || "") ? params.get("player") : null; // a news alert opens his news
// A notification about a play opens that game on Live games.
if (params.get("game")) { state.liveOpen = { [params.get("game")]: true }; state.liveSel = params.get("game"); }

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
  if (pendingWaivers != null) { const at = pendingWaivers; pendingWaivers = null; openWaiverRun(at); }
  if (pendingPlayer) { const id = pendingPlayer; pendingPlayer = null; openPlayer(id, null, "news"); }
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
      ? `Wk ${w}${w > b.regWeeks ? " (PO)" : ""}${w === b.current && innerWidth > 360 ? " · now" : ""}`
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

// Leaving a tab (swiping or tapping to another one) puts it back the way it opens by default (views,
// filters, sorts), so it's fresh next time. Jumps from a popup or player card into another tab don't.
// The Trade Analyzer keeps a trade you're building.
function resetTab(tab) {
  if (tab === "roster") {
    state.erView = "matchup"; store.set("ffb.erview", "matchup"); state.erScroll = 0;
    // Back to your own team if the site knows it (owner sign-in or your ★ team); otherwise the team
    // you were looking at stays.
    if (ownerTeam() || store.get(`ffb.myteam.${state.leagueId || "default"}`)) { state.rosterTeam = null; store.set(`ffb.rosterteam.${state.leagueId || "default"}`, ""); }
    if (state.lineupEdit) state.lineupEdit.pick = null;
  } else if (tab === "players") {
    Object.assign(state.players, { mode: "avail", mine: false, watch: false, q: "", pos: "ALL", nfl: "ALL", team: "ALL", sort: { key: "proj", dir: -1 } });
  } else if (tab === "usage") {
    Object.assign(state.players, { utTeam: "", utMode: "snap" });
  } else if (tab === "matchups") {
    state.openMatchup = null; // back to your own game
  } else if (tab === "live") {
    state.liveFilter = { show: "rostered", team: "ALL" };
  } else if (tab === "injuries") {
    state.injF = null;
  } else if (tab === "transactions") {
    state.txFilter = { team: "ALL", kind: "all" };
  } else if (tab === "managers") {
    state.managers.sort = { key: "score", dir: -1 };
  } else if (tab === "season") {
    state.standings.sort = { key: "rank", dir: 1 }; state.seasonSort = { key: "finish", dir: 1 };
  } else if (tab === "history") {
    state.historySel = "all"; state.historySort = { key: "titles", dir: -1 };
  }
}

// Show a tab. `from` ("left"/"right") slides the new tab in after a swipe. "league" opens Standings.
function switchTab(tab, from, leaving = false) {
  tab = homeOf(tab);
  if (leaving && state.tab && groupOf(state.tab) !== groupOf(tab)) {
    for (const t of ["roster", "matchups", "live", "players", "usage", "injuries", "trade", "transactions", "managers", "season", "history"]) if (groupOf(t) === groupOf(state.tab)) resetTab(t);
    if (tab === "matchups") state.openMatchup = null; // always arrive on your own game
  }
  state.tab = tab;
  store.set("ffb.tab", tab);
  render();
  preloadNeighbors();
  if (from === "peek") { window.scrollTo(0, 0); return; } // already slid in by the swipe
  if (from) {
    const v = $(`view-${tab}`);
    v.classList.remove("slide-left", "slide-right");
    void v.offsetWidth; // restart the animation
    v.classList.add(from === "left" ? "slide-left" : "slide-right");
    window.scrollTo(0, 0);
  }
}

// Phones: the five main tabs don't swipe. On Matchup a swipe flips through the games, and on League
// through its sub-tabs (both looping), with the next one already drawn and sliding in beside the page.
// A swipe that starts on a sideways-scrolling table only counts from the end it's resting at.
// Draw a tab into its (hidden) section without switching to it, so it can slide in from the side.
function renderInto(tab) {
  const prev = state.tab;
  state.tab = tab;
  try { renderTab(); } catch { /* it'll draw properly when opened */ } finally { state.tab = prev; }
  (state.preDrawn ||= {})[tab] = Date.now();
}
// The tabs either side of this one, drawn ahead of time once the page settles.
function preloadNeighbors() {
  if (!("ontouchstart" in window) || !state.week) return;
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 300));
  idle(() => {
    const subs = LEAGUE_SUBS.map(([k]) => k), si = subs.indexOf(state.tab);
    const near = si >= 0 ? [subs[(si + 1) % subs.length], subs[(si - 1 + subs.length) % subs.length]] : [];
    for (const t of near) if (t && t !== state.tab && Date.now() - (state.preDrawn?.[t] || 0) > 20e3) renderInto(t);
  });
}
function neighborTab(dir) {
  const groups = [...document.querySelectorAll("#tabs button[data-tab]")].map((b) => b.dataset.tab);
  const i = groups.indexOf(groupOf(state.tab));
  return i < 0 ? null : homeOf(groups[(i + dir + groups.length) % groups.length]);
}
function initSwipeTabs() {
  if (!("ontouchstart" in window)) return;
  let sx = 0, sy = 0, t0 = 0, armed = false;
  let scroller = null;
  const sideScroller = (el) => {
    for (; el && el !== document.body; el = el.parentElement) {
      if (el.scrollWidth > el.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(el).overflowX)) return el;
    }
    return null;
  };
  const W = () => innerWidth;
  const view = () => $(`view-${state.tab}`);
  // The neighboring tab, shown beside the page while dragging.
  let peek = null;
  const subNeighbor = (dir) => { const subs = LEAGUE_SUBS.map(([k]) => k), i = Math.max(0, subs.indexOf(state.tab)); return subs[(i + dir + subs.length) % subs.length]; };
  const showPeek = (dir, pick = neighborTab) => {
    const tab = pick(dir);
    if (!tab) return null;
    if (peek?.tab === tab && peek.dir === dir) return peek;
    hidePeek();
    if (Date.now() - (state.preDrawn?.[tab] || 0) > 20e3) renderInto(tab);
    const el = $(`view-${tab}`), cur = view().getBoundingClientRect();
    const top = Math.max(cur.top, document.querySelector(".topbar")?.getBoundingClientRect().bottom || 0);
    el.hidden = false;
    el.classList.add("peek");
    Object.assign(el.style, { position: "fixed", top: `${top}px`, left: `${cur.left}px`, width: `${cur.width}px`, height: `${innerHeight - top}px`, overflow: "hidden", zIndex: 1, transition: "none" });
    peek = { tab, el, dir };
    return peek;
  };
  const hidePeek = () => {
    if (!peek) return;
    const { el, tab } = peek;
    el.classList.remove("peek");
    el.removeAttribute("style");
    if (tab !== state.tab) el.hidden = true;
    peek = null;
  };
  const place = (dx, pick) => {
    const v = view(), dir = dx < 0 ? 1 : -1, p = showPeek(dir, pick);
    v.style.transition = "none";
    v.style.transform = `translateX(${dx}px)`;
    if (p) p.el.style.transform = `translateX(${dx + dir * W()}px)`;
  };
  const settle = (go, dx, leaving = false) => {
    const v = view(), dir = dx < 0 ? 1 : -1, p = peek;
    const ease = "transform .2s ease-out";
    v.style.transition = ease;
    v.style.transform = go ? `translateX(${-dir * W()}px)` : "translateX(0)";
    if (p) { p.el.style.transition = ease; p.el.style.transform = go ? "translateX(0)" : `translateX(${dir * W()}px)`; }
    setTimeout(() => {
      v.style.transition = v.style.transform = "";
      const tab = p?.tab;
      hidePeek();
      if (go && tab) switchTab(tab, "peek", leaving);
    }, 200);
  };
  // Matchup: the next game slides in beside the open one.
  let mp = null;
  const muPeekHide = () => { if (mp) { mp.el.remove(); mp = null; } };
  const muPeekShow = (dir) => {
    const id = muNeighbor(dir);
    if (mp?.id === id && mp.dir === dir) return mp;
    muPeekHide();
    const body = $("mu-body");
    if (!body) return null;
    body.parentElement.style.position = "relative";
    const el = document.createElement("div");
    el.className = "mu-detail mu-peek";
    el.innerHTML = muCached(id);
    Object.assign(el.style, { position: "absolute", top: `${body.offsetTop}px`, left: `${body.offsetLeft}px`, width: `${body.offsetWidth}px`, pointerEvents: "none", transition: "none" });
    body.parentElement.appendChild(el);
    fitNames(el);
    mp = { id, el, dir };
    return mp;
  };
  const muGap = () => ($("mu-body")?.offsetWidth || W()) + 12;
  const placeMu = (dx) => {
    const body = $("mu-body"), dir = dx < 0 ? 1 : -1, p = muPeekShow(dir);
    body.style.transition = "none";
    body.style.transform = `translateX(${dx}px)`;
    if (p) p.el.style.transform = `translateX(${dx + dir * muGap()}px)`;
  };
  const settleMu = (go, dx) => {
    const body = $("mu-body"), dir = dx < 0 ? 1 : -1, p = mp, ease = "transform .2s ease-out";
    body.style.transition = ease;
    body.style.transform = go ? `translateX(${-dir * muGap()}px)` : "translateX(0)";
    if (p) { p.el.style.transition = ease; p.el.style.transform = go ? "translateX(0)" : `translateX(${dir * muGap()}px)`; }
    setTimeout(() => {
      const id = p?.id;
      muPeekHide();
      body.style.transition = body.style.transform = "";
      if (go && id != null) pickMatchup(id, 0);
    }, 200);
  };
  document.addEventListener("touchstart", (e) => {
    armed = false; scroller = null;
    if (e.touches.length !== 1 || !state.week || document.body.classList.contains("modal-open")) return;
    if (e.target.closest(".fx-alert, input, textarea, select, .topbar, .subnav, .pl-nav")) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; t0 = Date.now();
    // Matchups (phones): anywhere on the open matchup or the scoreboard.
    if (state.tab === "matchups" && !MU_SPLIT.matches && e.target.closest("#mu-body")) { armed = true; return; }
    const sc = sideScroller(e.target);
    if (sc) {
      // A sideways-scrolling table: only from an end it was already resting at.
      sc.startAtLeft = sc.scrollLeft <= 1;
      sc.startAtRight = sc.scrollLeft + sc.clientWidth >= sc.scrollWidth - 1;
      if (!sc.startAtLeft && !sc.startAtRight) return;
      scroller = sc;
    }
    // League (phones): its sub-tabs, the same way as the games on Matchup.
    if (groupOf(state.tab) === "league" && !MU_SPLIT.matches) armed = true;
    // Anywhere else, a swipe does nothing: the five main tabs don't swipe.
  }, { passive: true });
  let dragging = false;
  document.addEventListener("touchmove", (e) => {
    if (!armed) return;
    const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
    if (!dragging) {
      if (scroller && !(dx > 0 ? scroller.startAtLeft : scroller.startAtRight)) { armed = false; return; }
      if (Math.abs(dx) < (scroller ? 40 : 10) || Math.abs(dx) < Math.abs(dy) * 1.6) { if (Math.abs(dy) > 14) armed = false; return; }
      dragging = true;
    }
    // The next game (or League sub-tab) slides in beside this one.
    if (groupOf(state.tab) === "league") place(dx, subNeighbor); else placeMu(dx);
  }, { passive: true });
  document.addEventListener("touchend", (e) => {
    if (!armed) return;
    armed = false;
    const t = e.changedTouches[0], dx = t.clientX - sx;
    const wasDragging = dragging;
    dragging = false;
    if (!wasDragging) return;
    const go = Math.abs(dx) > W() * 0.2 || (Math.abs(dx) > 40 && Date.now() - t0 < 300);
    if (groupOf(state.tab) === "league") settle(go, dx, false);
    else settleMu(go, dx);
  }, { passive: true });
  document.addEventListener("touchcancel", () => {
    if (dragging) { dragging = false; if (mp) settleMu(false, 0); else settle(false, 0); }
    armed = false;
  });
}

// Keyboard (computers): 1–9 switch tabs (in the order across the top), / jumps to the player search.
document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.("input, textarea, select, [contenteditable]") || !state.week) return;
  const tabs = [...document.querySelectorAll("#tabs button[data-tab]")].filter((b) => b.offsetParent).map((b) => b.dataset.tab);
  if (/^[1-9]$/.test(e.key) && tabs[+e.key - 1]) { switchTab(tabs[+e.key - 1], null, true); e.preventDefault(); }
  else if (e.key === "/") { e.preventDefault(); if (state.tab !== "players") switchTab("players", null, true); setTimeout(() => $("pl-q")?.focus(), 50); }
});
function bindUi() {
  $("tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-tab]");
    if (b) switchTab(b.dataset.tab, null, true);
  });
  $("league-nav").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-sub]");
    if (b && b.dataset.sub !== state.tab) switchTab(b.dataset.sub);
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
    if (!version) return;
    const now = await siteVersion();
    if (!now || now === version) return;
    if (Date.now() - hiddenAt >= 30000) freshReload(); // back after a while: just switch
    else showUpdateBar();
  });
  // While the app stays open, look for a new version every few minutes.
  setInterval(async () => {
    if (document.visibilityState !== "visible" || !version) return;
    const now = await siteVersion();
    if (now && now !== version) showUpdateBar();
  }, 5 * 60e3);
}
// A bar at the bottom: "A new version is ready · Reload".
function showUpdateBar() {
  if ($("upd-bar")) return;
  const bar = document.createElement("div");
  bar.id = "upd-bar";
  bar.className = "upd-bar";
  bar.innerHTML = `<span>A new version of the site is ready.</span><button type="button">Reload</button>`;
  bar.querySelector("button").addEventListener("click", freshReload);
  document.body.append(bar);
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
    if (m.type === "open" && m.url) { location.href = m.url; return; }
    if (m.type === "offline") showOffline(m.at);
    else if (m.type === "online") showOffline(null);
    else if (m.type === "updated") {
      // Just opened: switch to the new version right away. Otherwise wait until the app is reopened.
      if (Date.now() - opened < 10000 && document.visibilityState === "visible") freshReload();
      else { state.reloadPending = true; showUpdateBar(); }
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
