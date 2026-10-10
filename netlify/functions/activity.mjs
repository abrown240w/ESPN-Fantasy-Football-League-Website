// League transactions: waiver claims, free-agent moves, completed trades and
// accepted trades awaiting league review. ESPN reports transactions one scoring
// period at a time and only by player ID, so this gathers every period and adds
// player names from ESPN's player list.
//
// Privacy: trade offers that haven't been accepted are private on ESPN. Because
// this function may be signed in with the commissioner's cookies, those offers
// are dropped here and never sent to the browser.

const ESPN = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl";
const PLAYER_CACHE_MS = 12 * 60 * 60 * 1000;
let playerCache = { season: null, at: 0, map: null };

function defaultSeason() {
  const now = new Date();
  return now.getUTCMonth() < 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
}

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...extraHeaders } });
}

class UpstreamError extends Error {
  constructor(status) { super(`ESPN returned ${status}`); this.status = status; }
}

function headers(extra = {}) {
  const h = { accept: "application/json", "user-agent": "Mozilla/5.0 (fantasy-dashboard)", ...extra };
  if (process.env.ESPN_S2 && process.env.SWID) h.cookie = `espn_s2=${process.env.ESPN_S2}; SWID=${process.env.SWID}`;
  return h;
}

async function getJson(url, extra) {
  const res = await fetch(url, { headers: headers(extra) });
  if (!res.ok) throw new UpstreamError(res.status);
  return res.json();
}

async function playerMap(season) {
  if (playerCache.map && playerCache.season === season && Date.now() - playerCache.at < PLAYER_CACHE_MS) return playerCache.map;
  const list = await getJson(`${ESPN}/seasons/${season}/players?scoringPeriodId=0&view=players_wl`,
    { "x-fantasy-filter": JSON.stringify({ filterActive: { value: true } }) });
  const map = new Map(list.map((p) => [p.id, [p.fullName, p.defaultPositionId, p.proTeamId]]));
  playerCache = { season, at: Date.now(), map };
  return map;
}

const isClosed = (status = "") => /^(EXECUTED|CANCEL|FAIL|VETO|DECLINE)/.test(status);

function tradeSides(t) {
  const sides = {};
  for (const i of t.items || []) {
    if (i.type === "TRADE") (sides[i.toTeamId] ||= { teamId: i.toTeamId, gets: [], drops: [] }).gets.push(i.playerId);
    if (i.type === "DROP") (sides[i.fromTeamId] ||= { teamId: i.fromTeamId, gets: [], drops: [] }).drops.push(i.playerId);
  }
  return Object.values(sides);
}

export default async (req) => {
  const params = new URL(req.url).searchParams;
  const leagueId = params.get("leagueId") || process.env.LEAGUE_ID;
  const season = params.get("season") || process.env.SEASON || String(defaultSeason());
  if (!leagueId) return json(400, { error: "no_league", message: "No league ID configured." });
  if (!/^\d{1,12}$/.test(leagueId) || !/^\d{4}$/.test(season)) return json(400, { error: "bad_request", message: "Invalid league ID or season." });

  const league = `${ESPN}/seasons/${season}/segments/0/leagues/${leagueId}`;
  try {
    const info = await getJson(`${league}?view=mStatus&view=mSettings`);
    const latest = Math.min(Math.max(info.status?.latestScoringPeriod || info.scoringPeriodId || 1, 1), 25);
    const usesBudget = !!info.settings?.acquisitionSettings?.isUsingAcquisitionBudget;

    const periods = Array.from({ length: latest }, (_, i) => i + 1);
    const pages = await Promise.all(periods.map((sp) => getJson(`${league}?view=mTransactions2&scoringPeriodId=${sp}`)));
    const byId = new Map();
    for (const page of pages) for (const t of page.transactions || []) byId.set(t.id, t);
    const all = [...byId.values()];

    // A proposal the other team accepted has a TRADE_ACCEPT pointing at it.
    const acceptedAt = new Map(all.filter((t) => t.type === "TRADE_ACCEPT").map((t) => [t.relatedTransactionId, t.proposedDate]));

    const moves = [], pendingTrades = [];
    for (const t of all) {
      const date = t.processDate || t.proposedDate;
      if ((t.type === "WAIVER" || t.type === "FREEAGENT") && t.status === "EXECUTED") {
        const items = t.items || [];
        moves.push({
          id: t.id, kind: t.type === "WAIVER" ? "waiver" : "freeagent", date, week: t.scoringPeriodId, teamId: t.teamId,
          bid: usesBudget ? t.bidAmount || 0 : null,
          adds: items.filter((i) => i.type === "ADD").map((i) => i.playerId),
          drops: items.filter((i) => i.type === "DROP").map((i) => i.playerId),
        });
      } else if (t.type === "TRADE_PROPOSAL" && t.status === "EXECUTED") {
        moves.push({ id: t.id, kind: "trade", date, week: t.scoringPeriodId, sides: tradeSides(t) });
      } else if (t.type === "TRADE_UPHOLD" && t.status === "EXECUTED" && (t.items || []).length && !byId.has(t.relatedTransactionId)) {
        moves.push({ id: t.id, kind: "trade", date, week: t.scoringPeriodId, sides: tradeSides(t) });
      } else if (t.type === "TRADE_PROPOSAL" && acceptedAt.has(t.id) && !isClosed(t.status)) {
        pendingTrades.push({ id: t.id, proposedDate: t.proposedDate, acceptedDate: acceptedAt.get(t.id), sides: tradeSides(t) });
      }
    }
    moves.sort((a, b) => b.date - a.date);

    const ids = new Set();
    for (const m of [...moves, ...pendingTrades]) {
      for (const id of [...(m.adds || []), ...(m.drops || [])]) ids.add(id);
      for (const s of m.sides || []) for (const id of [...s.gets, ...s.drops]) ids.add(id);
    }
    const map = await playerMap(season);
    const players = {};
    for (const id of ids) players[id] = map.get(id) || null;

    // Counts only (no players or teams), to help diagnose how ESPN reports trades.
    const tradeDebug = {};
    for (const t of all.filter((x) => x.type.startsWith("TRADE"))) {
      const k = `${t.type}/${t.status || "none"}/${(t.items || []).length ? "items" : "no-items"}/${byId.has(t.relatedTransactionId) ? "related-found" : "related-missing"}`;
      tradeDebug[k] = (tradeDebug[k] || 0) + 1;
    }

    return json(200, { usesBudget, moves, pendingTrades, players, signedIn: !!(process.env.ESPN_S2 && process.env.SWID), tradeDebug }, {
      "cache-control": "public, max-age=120",
      "netlify-cdn-cache-control": "public, max-age=120, stale-while-revalidate=300",
    });
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) {
      return json(401, { error: "private", message: "ESPN didn't allow access to this league's transactions." });
    }
    if (err instanceof UpstreamError && err.status === 404) return json(404, { error: "not_found", message: "League not found." });
    return json(502, { error: "upstream", message: "Couldn't load transactions from ESPN." });
  }
};

export const config = { path: "/api/activity" };
