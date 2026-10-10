// Demo league generator. Produces data shaped like ESPN's API responses so the
// whole site can be previewed without a real league (open the site with ?demo).

(function () {
  let seed = 20261009;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const gauss = () => {
    let u = 0, v = 0;
    while (!u) u = rand();
    while (!v) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const round = (n) => Math.round(n * 100) / 100;

  const SEASON = 2026, CURRENT_WEEK = 6, REG_WEEKS = 14, TOTAL_WEEKS = 17;
  const FIRST = ["Marcus", "Tyler", "Jalen", "Devin", "Chris", "Andre", "Malik", "Josh", "Brandon", "Kyle", "Darius", "Trey", "Cam", "Jordan", "Isaiah", "Nate", "Derek", "Omar", "Xavier", "Luke", "Zach", "Elijah", "Rashad", "Cole", "Bryce", "Dante", "Evan", "Quinn"];
  const LAST = ["Holloway", "Prescott", "Whitaker", "Ellison", "Barrett", "Mosley", "Sutton", "Crawford", "Dorsey", "Fairley", "Grayson", "Hendrix", "Jennings", "Kearse", "Lockett", "Maddox", "Norwood", "Oliver", "Pryor", "Ramsey", "Slater", "Tolbert", "Vance", "Wardell", "Yates", "Ashby", "Bostic", "Calloway"];
  const DST = ["Ravens", "Steelers", "Bills", "49ers", "Cowboys", "Jets", "Browns", "Chiefs", "Eagles", "Lions"];
  const TEAMS = [
    ["Gridiron Gurus", "GG", "Andrew B."], ["Touchdown Tyrants", "TDT", "Sam K."],
    ["Fourth & Long", "4TH", "Priya R."], ["Hail Mary Heroes", "HMH", "Jordan T."],
    ["Blitz Brigade", "BLZ", "Chris M."], ["End Zone Elite", "EZE", "Taylor W."],
    ["Pigskin Prophets", "PIG", "Morgan L."], ["Red Zone Rebels", "RZR", "Alex P."],
    ["Sunday Scaries", "SUN", "Casey D."], ["The Waiver Wire", "WVR", "Riley N."],
  ];

  // [positionId, eligibleSlots, projection range]
  const POS = {
    QB: [1, [0, 7, 20, 21], [13, 24]],
    RB: [2, [2, 3, 23, 7, 20, 21], [5, 18]],
    WR: [3, [4, 3, 5, 23, 7, 20, 21], [5, 18]],
    TE: [4, [6, 5, 23, 7, 20, 21], [4, 12]],
    K: [5, [17, 20, 21], [6, 10]],
    DST: [16, [16, 20, 21], [4, 9]],
  };
  const ROSTER_SHAPE = ["QB", "QB", "RB", "RB", "RB", "RB", "RB", "WR", "WR", "WR", "WR", "WR", "TE", "TE", "K", "DST"];
  const SLOT_COUNTS = { 0: 1, 2: 2, 4: 2, 6: 1, 23: 1, 16: 1, 17: 1, 20: 7, 21: 1 };

  let pid = 1000, dstIdx = 0;
  const teams = TEAMS.map(([name, abbrev, owner], i) => {
    const players = ROSTER_SHAPE.map((pos) => {
      const [posId, slots, [lo, hi]] = POS[pos];
      const fullName = pos === "DST" ? `${DST[dstIdx++]} D/ST` : `${pick(FIRST)} ${pick(LAST)}`;
      return {
        id: pid++, fullName, defaultPositionId: posId, eligibleSlots: slots,
        proTeamId: pick([...Array(30).keys()].map((i) => i + 1).concat([33, 34])),
        base: lo + rand() * (hi - lo),
        injuryStatus: rand() < 0.08 ? pick(["QUESTIONABLE", "QUESTIONABLE", "OUT", "DOUBTFUL", "DAY_TO_DAY", "INJURY_RESERVE"]) : "ACTIVE",
        weeks: {},
      };
    });
    return { id: i + 1, name, abbrev, owner: `{MEMBER-${i + 1}}`, ownerName: owner, players };
  });

  function statsFor(posId, pts) {
    const p = Math.max(pts, 0);
    if (posId === 1) return { 3: Math.round(p * 13), 4: Math.round(p / 9), 20: rand() < 0.4 ? 1 : 0, 24: Math.round(rand() * 25) };
    if (posId === 2) return { 24: Math.round(p * 5), 25: Math.round(p / 12), 53: Math.round(rand() * 5), 42: Math.round(p * 1.5), 58: Math.round(rand() * 6) };
    if (posId === 3 || posId === 4) return { 53: Math.round(p / 3), 42: Math.round(p * 6), 43: Math.round(p / 14), 58: Math.round(p / 2) + 2 };
    return {};
  }

  // Simulate each week: projections, actuals, lineups.
  for (let wk = 1; wk <= TOTAL_WEEKS; wk++) {
    for (const t of teams) {
      for (const p of t.players) {
        const proj = round(p.base * (0.85 + rand() * 0.3));
        const played = wk < CURRENT_WEEK || (wk === CURRENT_WEEK && rand() < 0.55);
        const actual = played ? round(Math.max(-2, proj + gauss() * proj * 0.55)) : null;
        p.weeks[wk] = { proj, actual };
      }
      // Manager sets lineup by projection (so bench points get left behind).
      const sorted = [...t.players].sort((a, b) => b.weeks[wk].proj - a.weeks[wk].proj);
      const used = new Set(), lineup = {};
      for (const slot of [0, 2, 2, 4, 4, 6, 16, 17, 23]) {
        const pl = sorted.find((p) => !used.has(p.id) && p.eligibleSlots.includes(slot) && p.injuryStatus !== "OUT");
        if (pl) { used.add(pl.id); lineup[pl.id] = slot; }
      }
      for (const p of t.players) if (!(p.id in lineup)) lineup[p.id] = p.injuryStatus === "OUT" ? 21 : 20;
      t["lineup" + wk] = lineup;
    }
  }

  // Position ranks: season scoring rank from base strength, weekly PPR rank from projections.
  const allPlayers = teams.flatMap((t) => t.players);
  const rankWithin = (score) => {
    const ranks = {};
    for (const posId of new Set(allPlayers.map((p) => p.defaultPositionId))) {
      allPlayers.filter((p) => p.defaultPositionId === posId).sort((a, b) => score(b) - score(a)).forEach((p, i) => (ranks[p.id] = i + 1));
    }
    return ranks;
  };
  const seasonRank = rankWithin((p) => p.base);
  const weekRank = {};
  const pprRank = (p, wk) => (weekRank[wk] ||= rankWithin((x) => x.weeks[wk].proj))[p.id];

  // Like ESPN, box-score entries omit injury status and rankings; roster entries include them.
  function entry(p, wk, slot, withInjury) {
    const w = p.weeks[wk];
    const stats = [{ scoringPeriodId: wk, statSourceId: 1, statSplitTypeId: 1, appliedTotal: w.proj, stats: statsFor(p.defaultPositionId, w.proj) }];
    if (w.actual !== null) stats.push({ scoringPeriodId: wk, statSourceId: 0, statSplitTypeId: 1, appliedTotal: w.actual, stats: statsFor(p.defaultPositionId, w.actual) });
    return {
      lineupSlotId: slot, playerId: p.id,
      playerPoolEntry: {
        appliedStatTotal: w.actual ?? 0,
        ...(withInjury ? { ratings: { 0: { positionalRanking: seasonRank[p.id] } } } : {}),
        player: { id: p.id, fullName: p.fullName, defaultPositionId: p.defaultPositionId, proTeamId: p.proTeamId, eligibleSlots: p.eligibleSlots, stats,
          ...(withInjury ? {
            injuryStatus: p.injuryStatus, injured: p.injuryStatus !== "ACTIVE",
            rankings: { [wk]: [{ rankType: "PPR", rankSourceId: 0, averageRank: pprRank(p, wk) + Math.round(rand() * 4) / 2 }] },
          } : {}) },
      },
    };
  }
  const entries = (t, wk, withInjury) => t.players.map((p) => entry(p, wk, t["lineup" + wk][p.id], withInjury));
  const teamScore = (t, wk) => round(t.players.reduce((s, p) => {
    const slot = t["lineup" + wk][p.id];
    return slot === 20 || slot === 21 ? s : s + (p.weeks[wk].actual ?? 0);
  }, 0));
  const teamProj = (t, wk) => round(t.players.reduce((s, p) => {
    const slot = t["lineup" + wk][p.id];
    return slot === 20 || slot === 21 ? s : s + (p.weeks[wk].actual ?? p.weeks[wk].proj);
  }, 0));

  // Round-robin schedule.
  const schedule = [];
  let mid = 1;
  const ids = teams.map((t) => t.id);
  for (let wk = 1; wk <= REG_WEEKS; wk++) {
    const rot = [ids[0], ...ids.slice(1).map((_, i, a) => a[(i + wk - 1) % a.length])];
    for (let i = 0; i < rot.length / 2; i++) {
      schedule.push({ id: mid++, matchupPeriodId: wk, homeId: rot[i], awayId: rot[rot.length - 1 - i] });
    }
  }

  // Records through completed weeks.
  const rec = Object.fromEntries(teams.map((t) => [t.id, { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 }]));
  for (const m of schedule) {
    if (m.matchupPeriodId >= CURRENT_WEEK) continue;
    const h = teamScore(teams[m.homeId - 1], m.matchupPeriodId), a = teamScore(teams[m.awayId - 1], m.matchupPeriodId);
    rec[m.homeId].pointsFor += h; rec[m.homeId].pointsAgainst += a;
    rec[m.awayId].pointsFor += a; rec[m.awayId].pointsAgainst += h;
    if (h > a) { rec[m.homeId].wins++; rec[m.awayId].losses++; } else if (a > h) { rec[m.awayId].wins++; rec[m.homeId].losses++; } else { rec[m.homeId].ties++; rec[m.awayId].ties++; }
  }
  const seeds = [...teams].sort((a, b) => rec[b.id].wins - rec[a.id].wins || rec[b.id].pointsFor - rec[a.id].pointsFor).map((t) => t.id);

  function side(teamId, wk, withRoster) {
    const t = teams[teamId - 1];
    const live = wk <= CURRENT_WEEK;
    const s = { teamId, totalPoints: live ? teamScore(t, wk) : 0 };
    if (wk === CURRENT_WEEK) { s.totalPointsLive = s.totalPoints; s.totalProjectedPointsLive = teamProj(t, wk); }
    if (withRoster) s.rosterForCurrentScoringPeriod = { appliedStatTotal: s.totalPoints, entries: entries(t, wk) };
    return s;
  }

  function response(views, scoringPeriodId) {
    const wk = scoringPeriodId || CURRENT_WEEK;
    const withRoster = views.includes("mBoxscore");
    const out = {
      id: 424242, seasonId: SEASON, scoringPeriodId: CURRENT_WEEK,
      status: { currentMatchupPeriod: CURRENT_WEEK, latestScoringPeriod: CURRENT_WEEK, finalScoringPeriod: TOTAL_WEEKS, isActive: true },
      settings: {
        name: "Demo League (sample data)",
        rosterSettings: { lineupSlotCounts: SLOT_COUNTS },
        scheduleSettings: { matchupPeriodCount: REG_WEEKS, playoffTeamCount: 4 },
      },
      members: teams.map((t) => ({ id: t.owner, displayName: t.ownerName.replace(/\W/g, "").toLowerCase(), firstName: t.ownerName.split(" ")[0], lastName: t.ownerName.split(" ")[1] })),
      teams: teams.map((t) => ({
        id: t.id, name: t.name, abbrev: t.abbrev, owners: [t.owner], primaryOwner: t.owner,
        playoffSeed: seeds.indexOf(t.id) + 1,
        record: { overall: { ...rec[t.id], pointsFor: round(rec[t.id].pointsFor), pointsAgainst: round(rec[t.id].pointsAgainst) } },
        ...(views.includes("mRoster") ? { roster: { entries: entries(t, wk, true) } } : {}),
      })),
      schedule: schedule
        .filter((m) => !withRoster || m.matchupPeriodId === wk)
        .map((m) => {
          const done = m.matchupPeriodId < CURRENT_WEEK;
          const home = side(m.homeId, m.matchupPeriodId, withRoster), away = side(m.awayId, m.matchupPeriodId, withRoster);
          if (!done) {
            // ESPN reports win probability per side as a 0–1 fraction.
            const hp = teamProj(teams[m.homeId - 1], m.matchupPeriodId), ap = teamProj(teams[m.awayId - 1], m.matchupPeriodId);
            home.winProbability = round(1 / (1 + Math.exp(-(hp - ap) / 40)));
            away.winProbability = round(1 - home.winProbability);
          }
          return {
            id: m.id, matchupPeriodId: m.matchupPeriodId, home, away, playoffTierType: "NONE",
            winner: !done ? "UNDECIDED" : home.totalPoints > away.totalPoints ? "HOME" : away.totalPoints > home.totalPoints ? "AWAY" : "TIE",
          };
        }),
    };
    return out;
  }

  // Same shape as /api/activity.
  function activity() {
    const players = {};
    const add = (p) => { players[p.id] = [p.fullName, p.defaultPositionId, p.proTeamId]; return p.id; };
    let fa = 9000;
    const freeAgent = (posName) => {
      const posId = POS[posName][0];
      const id = fa++;
      players[id] = [`${pick(FIRST)} ${pick(LAST)}`, posId, pick([1, 4, 9, 12, 18, 25, 33])];
      return id;
    };
    const day = 24 * 60 * 60 * 1000, start = Date.UTC(SEASON, 8, 9, 12);
    const moves = [];
    for (let wk = 1; wk < CURRENT_WEEK; wk++) {
      for (let n = 0; n < 4; n++) {
        const t = pick(teams), p = pick(t.players.filter((x) => x.defaultPositionId !== 16));
        const pos = Object.keys(POS).find((k) => POS[k][0] === p.defaultPositionId);
        const kind = n % 2 ? "freeagent" : "waiver";
        moves.push({ id: `d${wk}-${n}`, kind, date: start + (wk - 1) * 7 * day + (kind === "waiver" ? 1 : 3) * day + n * 3600e3, week: wk, teamId: t.id, bid: null, adds: [freeAgent(pos)], drops: [add(p)] });
      }
    }
    const [a, b] = [teams[1], teams[6]];
    moves.push({ id: "dtrade", kind: "trade", date: start + 17 * day, week: 3, sides: [
      { teamId: a.id, gets: [add(b.players[3])], drops: [] },
      { teamId: b.id, gets: [add(a.players[8]), add(a.players[12])], drops: [add(b.players[13])] },
    ] });
    moves.sort((x, y) => y.date - x.date);
    const [c, d] = [teams[2], teams[8]];
    const pendingTrades = [{ id: "dpending", proposedDate: start + 33 * day, acceptedDate: start + 34 * day, sides: [
      { teamId: c.id, gets: [add(d.players[2]), add(d.players[9])], drops: [] },
      { teamId: d.id, gets: [add(c.players[7])], drops: [] },
    ] }];
    return { usesBudget: false, moves, pendingTrades, players, signedIn: true, tradeDebug: {} };
  }

  // Same shape as /api/nfl: pro-team pairings and opponent ranks for a week.
  function nfl(sp) {
    let s = 7919 * sp;
    const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const ids = [...Array(30).keys()].map((i) => i + 1).concat([33, 34]);
    const order = shuffle(ids), games = {}, byes = {};
    // Two teams sit out each week to mimic byes.
    for (const id of order.slice(0, 2)) byes[id] = sp;
    for (let i = 2; i < order.length; i += 2) {
      const [h, a] = [order[i], order[i + 1]], date = Date.UTC(SEASON, 8, 6 + sp * 7, 17);
      games[h] = [a, true, date];
      games[a] = [h, false, date];
    }
    const oprk = {};
    for (const posId of [1, 2, 3, 4, 5, 16]) {
      oprk[posId] = {};
      shuffle(ids).forEach((id, i) => (oprk[posId][id] = [i + 1, Math.round((8 + i * 0.6 + r() * 2) * 10) / 10]));
    }
    return { games, byes, oprk };
  }

  // Same shape as /api/live. Games in progress advance each time it's called.
  const liveStart = Date.now();
  function live(sp) {
    const n = nfl(sp);
    const abbr = (id) => (typeof PRO !== "undefined" && PRO[id]) || `T${id}`;
    const logo = (id) => `https://a.espncdn.com/i/teamlogos/nfl/500/scoreboard/${abbr(id).toLowerCase()}.png`;
    const elapsedMin = (Date.now() - liveStart) / 60000;
    const pairs = Object.entries(n.games).filter(([, g]) => g[1]).map(([h, g]) => [Number(h), g[0]]);
    const progressOf = {};
    const games = pairs.map(([h, a], i) => {
      const st = i < 3 ? "post" : i < 8 ? "in" : "pre";
      const progress = st === "post" ? 1 : st === "in" ? Math.min(0.97, 0.15 + (i - 3) * 0.15 + elapsedMin / 4) : 0;
      progressOf[h] = progressOf[a] = progress;
      const q = Math.min(4, Math.floor(progress * 4) + 1), clockSec = Math.round((1 - ((progress * 4) % 1)) * 900);
      const side = (id) => ({ proId: id, abbr: abbr(id), name: abbr(id), logo: logo(id), score: st === "pre" ? 0 : Math.round(progress * (14 + (id * 7) % 20)), record: `${(id % 4) + 1}-${(id * 3) % 4}` });
      return {
        id: `demo${i}`, state: st,
        date: new Date(Date.now() + (st === "pre" ? (i - 6) * 3 * 3600e3 : -3 * 3600e3)).toISOString(),
        detail: st === "in" ? `${["1st", "2nd", "3rd", "4th"][q - 1]} ${Math.floor(clockSec / 60)}:${String(clockSec % 60).padStart(2, "0")}` : st === "post" ? "Final" : "",
        broadcast: ["CBS", "FOX", "NBC", "ESPN"][i % 4],
        possession: st === "in" ? (i % 2 ? h : a) : null,
        downDistance: st === "in" ? `${["1st & 10", "2nd & 7", "3rd & 3"][i % 3]} at ${abbr(i % 2 ? a : h)} ${20 + (i * 9) % 30}` : "",
        redZone: st === "in" && i === 4,
        lastPlay: st === "in" ? "J.Doe pass short right to M.Smith for 12 yards" : "",
        home: side(h), away: side(a),
      };
    });
    const players = [];
    const played = (posId, full, proId) => {
      const prog = progressOf[proId];
      if (!prog) return null;
      return Math.round(full * Math.floor(prog * 12) / 12 * 100) / 100;
    };
    for (const t of teams) {
      for (const p of t.players) {
        if (progressOf[p.proTeamId] === undefined) continue;
        const w = p.weeks[sp], full = w.actual ?? w.proj * 1.1;
        const pts = played(p.defaultPositionId, full, p.proTeamId);
        players.push({ id: p.id, name: p.fullName, posId: p.defaultPositionId, proId: p.proTeamId, teamId: t.id, slotId: t["lineup" + sp][p.id], pts, proj: w.proj, stats: pts == null ? {} : statsFor(p.defaultPositionId, pts), injury: p.injuryStatus === "ACTIVE" ? "" : p.injuryStatus });
      }
    }
    // A couple of free agents per NFL team.
    for (const proId of Object.keys(progressOf).map(Number)) {
      for (let k = 0; k < 2; k++) {
        const posId = k ? 3 : 2, full = 4 + ((proId * 13 + k * 7) % 12);
        const pts = played(posId, full, proId);
        players.push({ id: 50000 + proId * 10 + k, name: `${FIRST[(proId * 7 + k) % FIRST.length]} ${LAST[(proId * 11 + k * 5) % LAST.length]}`, posId, proId, teamId: 0, slotId: null, pts, proj: Math.round(full * 0.9 * 10) / 10, stats: pts == null ? {} : statsFor(posId, pts), injury: "" });
      }
    }
    return { sp, updated: Date.now(), games, byes: Object.keys(n.byes).map((id) => abbr(Number(id))), players };
  }

  window.DemoLeague = { response, activity, nfl, live };
})();
