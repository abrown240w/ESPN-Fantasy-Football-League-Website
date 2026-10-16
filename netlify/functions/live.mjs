// Live NFL games for a fantasy week: the scoreboard (scores, clock, possession) plus
// every relevant player in those games with live fantasy points under this league's
// scoring, the fantasy team that rosters them, and whether they're starting.
// Short cache so the page can poll it during games.

const FANTASY = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl";
const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
// Stat IDs used for stat lines: passing, rushing, receiving, kicking (FG/XP made and
// attempted) and defense (sacks, INT, fumble recoveries, points allowed).
const KEEP_STATS = ["3", "4", "20", "24", "25", "53", "42", "43", "58", "83", "84", "86", "87", "99", "95", "96", "120"];

function defaultSeason() {
  const now = new Date();
  return now.getUTCMonth() < 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
}

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...extraHeaders } });
}

async function getJson(url, { fantasy = false, headers = {} } = {}) {
  const h = { accept: "application/json", "user-agent": "Mozilla/5.0 (fantasy-dashboard)", ...headers };
  if (fantasy && process.env.ESPN_S2 && process.env.SWID) h.cookie = `espn_s2=${process.env.ESPN_S2}; SWID=${process.env.SWID}`;
  const res = await fetch(url, { headers: h });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
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
        home: side(home),
        away: side(away),
      };
    });
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
  } catch {
    return json(502, { error: "upstream", message: "Couldn't load live game data from ESPN." });
  }
};

export const config = { path: "/api/live" };
