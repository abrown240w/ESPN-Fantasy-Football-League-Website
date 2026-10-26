// Live NFL games for a fantasy week: the scoreboard (scores, clock, possession) plus
// every relevant player in those games with live fantasy points under this league's
// scoring, the fantasy team that rosters them, and whether they're starting.
// Short cache so the page can poll it during games.

const FANTASY = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl";
const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
const SUMMARY = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary";
// Stat IDs used for stat lines: passing (incl. attempts/completions), rushing (incl. carries),
// receiving (incl. targets), kicking (FG/XP made and attempted) and defense (sacks, INT, fumble
// recoveries, forced fumbles, points and yards allowed).
const KEEP_STATS = ["0", "1", "3", "4", "20", "23", "24", "25", "53", "42", "43", "58", "63", "83", "84", "86", "87", "93", "99", "95", "96", "101", "102", "103", "104", "106", "120", "127"];

function defaultSeason() {
  const now = new Date();
  return now.getUTCMonth() < 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
}

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...extraHeaders } });
}

// ESPN's public NFL API (scoreboard, play-by-play) refuses requests from Netlify's servers that claim to be a
// browser ("Mozilla/5.0 …"), so those say plainly who's asking; the fantasy API is fine either way.
const SITE_UA = "brownleague.netlify.app (private fantasy league site)";
async function getJson(url, { fantasy = false, headers = {} } = {}) {
  const h = { accept: "application/json", "user-agent": fantasy ? "Mozilla/5.0 (fantasy-dashboard)" : SITE_UA, ...headers };
  if (fantasy && process.env.ESPN_S2 && process.env.SWID) h.cookie = `espn_s2=${process.env.ESPN_S2}; SWID=${process.env.SWID}`;
  const res = await fetch(url, { headers: h });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}

// ESPN's scoreboard reports only the very latest event as the "last play", and right after a kickoff, punt or
// turnover that is usually a timeout, a review or a TV break. So the real last play (the kick or the
// turnover itself) is read from the game's play-by-play, which lists every play. Cached briefly per game.
const STOPPAGE = /timeout|two-minute|end (of )?(period|half|quarter|game|regulation)|official|injury|coin toss|review|challenge/i;
const playCache = new Map(); // event id -> { at, play }
const BREAK_TYPE = /^(timeout|two-minute warning|end period|end of half)$/i, BREAK_TEXT = /^(Timeout #?\d* by |Two-Minute Warning|END QUARTER \d)/i;
export function pickLastPlay(summary) {
  const dr = summary?.drives || {};
  const plays = [...(dr.previous || []).flatMap((x) => x.plays || []), ...(dr.current?.plays || [])];
  const p = [...plays].reverse().find((q) => !STOPPAGE.test(q.type?.text || ""));
  if (!p) return null;
  // A break since that play, for the field graphic: a team timeout ("Timeout #2 by CAR at 10:33."), the
  // two-minute warning, or the end of a quarter ("END QUARTER 2").
  const after = plays.slice(plays.indexOf(p) + 1).reverse().find((q) => BREAK_TYPE.test(q.type?.text || "") || BREAK_TEXT.test(q.text || ""));
  const team = p.start?.team?.id ?? p.team?.id;
  return {
    id: p.id, type: p.type?.text || "", text: String(p.text || "").trim(),
    start: p.start?.yardLine ?? null, end: p.end?.yardLine ?? null, endText: p.end?.possessionText || "",
    yards: p.statYardage ?? null, teamId: team ? Number(team) : null, scoring: !!p.scoringPlay,
    // Who has the ball after it, and the down it was run on: a 4th down ending with the other team's ball is a turnover on downs.
    endTeamId: p.end?.team?.id ? Number(p.end.team.id) : null, down: p.start?.down ?? null,
    drive: dr.current?.description || "",
    timeout: after ? String(after.text || "").trim() : "",
  };
}
async function realLastPlay(eventId) {
  const hit = playCache.get(eventId);
  if (hit && Date.now() - hit.at < 10e3) return hit.play;
  const play = pickLastPlay(await getJson(`${SUMMARY}?event=${eventId}`));
  playCache.set(eventId, { at: Date.now(), play });
  return play;
}

const hex = (c) => (/^[0-9a-f]{6}$/i.test(c || "") ? `#${c}` : null);

function side(c) {
  return {
    proId: Number(c.team?.id),
    abbr: c.team?.abbreviation || "",
    name: c.team?.shortDisplayName || c.team?.name || "",
    logo: c.team?.logo || "",
    color: hex(c.team?.color),
    altColor: hex(c.team?.alternateColor),
    score: c.score != null ? Number(c.score) : null,
    record: c.records?.[0]?.summary || "",
  };
}

export default async (req) => {
  const params = new URL(req.url).searchParams;
  const leagueId = params.get("leagueId") || process.env.LEAGUE_ID;
  const season = params.get("season") || process.env.SEASON || String(defaultSeason());
  const sp = Number(params.get("scoringPeriodId") || 0);
  if (!leagueId || !/^\d{1,12}$/.test(leagueId) || !/^\d{4}$/.test(season) || !(sp >= 1 && sp <= 18)) {
    return json(400, { error: "bad_request", message: "Invalid league, season or week." });
  }
  const league = `${FANTASY}/seasons/${season}/segments/0/leagues/${leagueId}`;

  try {
    const board = await getJson(`${SCOREBOARD}?dates=${season}&seasontype=2&week=${sp}`);
    const games = (board.events || []).map((e) => {
      const comp = e.competitions?.[0] || {};
      const home = comp.competitors?.find((c) => c.homeAway === "home") || {};
      const away = comp.competitors?.find((c) => c.homeAway === "away") || {};
      const sit = comp.situation || {};
      const lp = sit.lastPlay || {};
      // Field position for the on-field graphic. ESPN yard lines run 0 (home goal line) to 100 (away goal line).
      const field = comp.situation ? {
        yardLine: sit.yardLine ?? null,
        possText: sit.possessionText || "",
        down: sit.down ?? null,
        distance: sit.distance ?? null,
        lastPlay: lp.text ? {
          type: lp.type?.text || "",
          start: lp.start?.yardLine ?? null,
          end: lp.end?.yardLine ?? null,
          yards: lp.statYardage ?? null,
          teamId: lp.team?.id ? Number(lp.team.id) : null,
          scoring: !!lp.scoreValue,
          endTeamId: lp.end?.team?.id ? Number(lp.end.team.id) : null,
          down: lp.start?.down ?? null,
        } : null,
        driveStart: lp.drive?.start?.yardLine ?? null,
        driveDesc: lp.drive?.description || "",
      } : null;
      return {
        id: e.id,
        date: e.date,
        state: e.status?.type?.state || "pre", // pre | in | post
        detail: e.status?.type?.shortDetail || "",
        broadcast: comp.broadcast || "",
        possession: sit.possession ? Number(sit.possession) : null,
        downDistance: sit.downDistanceText || sit.shortDownDistanceText || "",
        redZone: !!sit.isRedZone,
        lastPlay: sit.lastPlay?.text || "",
        field,
        home: { ...side(home), timeouts: sit.homeTimeouts ?? null },
        away: { ...side(away), timeouts: sit.awayTimeouts ?? null },
      };
    });
    // For games in progress, replace a timeout / review "last play" with the actual last play.
    await Promise.all(games.filter((g) => g.state === "in").map(async (g) => {
      try {
        const rp = await realLastPlay(g.id), cur = g.field?.lastPlay;
        if (!rp) return;
        // The scoreboard's own "last play" may itself be the break.
        const tNow = BREAK_TEXT.test(g.lastPlay || "") ? g.lastPlay : rp.timeout;
        if (tNow && g.field) g.field.timeout = tNow;
        const stale = !cur || STOPPAGE.test(cur.type || "") || cur.start == null || !g.lastPlay;
        if (!stale) return;
        const lastPlay = { type: rp.type, start: rp.start, end: rp.end, yards: rp.yards, teamId: rp.teamId, scoring: rp.scoring, endTeamId: rp.endTeamId, down: rp.down };
        g.lastPlay = rp.text;
        // No situation at all (the ball between plays): still give the graphic a spot from that play.
        g.field = g.field ? { ...g.field, lastPlay, yardLine: g.field.yardLine ?? rp.end, possText: g.field.possText || rp.endText }
          : { yardLine: rp.end, possText: rp.endText, down: null, distance: null, lastPlay, driveStart: null, driveDesc: rp.drive, timeout: tNow || "" };
      } catch { /* keep the scoreboard's own last play */ }
    }));
    const proIds = games.flatMap((g) => [g.home.proId, g.away.proId]).filter(Boolean);
    const byes = (board.week?.teamsOnBye || []).map((t) => t.abbreviation);

    // ?scoreboard=1 returns just the games (status, clock, possession) for lightweight polling.
    const scoreboardOnly = params.get("scoreboard") === "1";
    let players = [];
    if (proIds.length && !scoreboardOnly) {
      const filter = {
        players: {
          filterProTeamIds: { value: proIds },
          filterStatsForCurrentSeasonScoringPeriodId: { value: [sp] },
          limit: 1500,
          sortAppliedStatTotalForScoringPeriodId: { sortAsc: false, sortPriority: 1, value: sp },
        },
      };
      const [kona, rosters] = await Promise.all([
        getJson(`${league}?view=kona_player_info&scoringPeriodId=${sp}`, { fantasy: true, headers: { "x-fantasy-filter": JSON.stringify(filter) } }),
        getJson(`${league}?view=mRoster&scoringPeriodId=${sp}`, { fantasy: true }),
      ]);

      // playerId -> lineup slot for this week (20 = bench, 21 = IR).
      const slots = new Map();
      for (const t of rosters.teams || []) for (const e of t.roster?.entries || []) slots.set(e.playerId, e.lineupSlotId);

      for (const p of kona.players || []) {
        const pl = p.player || {};
        const stats = pl.stats || [];
        const act = stats.find((s) => s.scoringPeriodId === sp && s.statSourceId === 0 && (s.statSplitTypeId ?? 1) === 1);
        const prj = stats.find((s) => s.scoringPeriodId === sp && s.statSourceId === 1 && (s.statSplitTypeId ?? 1) === 1);
        const proj = prj ? Math.round(prj.appliedTotal * 10) / 10 : 0;
        const onTeam = p.onTeamId || 0;
        // Keep rostered players, anyone who has recorded stats, and free agents projected to matter.
        if (!onTeam && !act && proj < 3) continue;
        const kept = {};
        if (act?.stats) for (const k of KEEP_STATS) if (act.stats[k]) kept[k] = act.stats[k];
        players.push({
          id: pl.id,
          name: pl.fullName,
          posId: pl.defaultPositionId,
          proId: pl.proTeamId,
          teamId: onTeam,
          slotId: onTeam ? slots.get(pl.id) ?? null : null,
          pts: act ? Math.round(act.appliedTotal * 100) / 100 : null,
          proj,
          stats: kept,
          injury: pl.injuryStatus && pl.injuryStatus !== "ACTIVE" ? pl.injuryStatus : "",
        });
      }
    }

    const anyLive = games.some((g) => g.state === "in");
    return json(200, { sp, updated: Date.now(), games, byes, players }, {
      // Short cache during games so every viewer shares one ESPN fetch.
      "cache-control": `public, max-age=${anyLive ? 15 : 60}`,
      "netlify-cdn-cache-control": `public, max-age=${anyLive ? 20 : 120}`,
    });
  } catch (err) {
    console.log(JSON.stringify({ event: "live_error", message: err?.message || String(err) }));
    return json(502, { error: "upstream", message: "Couldn't load live game data from ESPN.", detail: String(err?.message || "").replace(/https?:\/\/\S+/g, "").trim() });
  }
};

export const config = { path: "/api/live" };
