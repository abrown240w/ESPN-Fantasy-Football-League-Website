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
    if (posId === 1) { const yd = Math.round(rand() * 25); return { 3: Math.round(p * 13), 4: Math.round(p / 9), 20: rand() < 0.4 ? 1 : 0, 24: yd, 23: Math.max(yd ? 1 : 0, Math.round(yd / 5)) }; }
    if (posId === 2) { const yd = Math.round(p * 5); return { 24: yd, 23: Math.max(1, Math.round(yd / 4.3)), 25: Math.round(p / 12), 53: Math.round(rand() * 5), 42: Math.round(p * 1.5), 58: Math.round(rand() * 6) }; }
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
    // Season total and last week, like ESPN's roster entries (for the Roster tab's Scoring view).
    const played = Object.entries(p.weeks).filter(([k, x]) => Number(k) < Math.min(wk, CURRENT_WEEK) && x.actual != null).map(([, x]) => x.actual);
    if (played.length) stats.push({ seasonId: SEASON, scoringPeriodId: 0, statSourceId: 0, statSplitTypeId: 0, appliedTotal: played.reduce((a, b) => a + b, 0), appliedAverage: played.reduce((a, b) => a + b, 0) / played.length });
    if (p.weeks[wk - 1]?.actual != null) stats.push({ scoringPeriodId: wk - 1, statSourceId: 0, statSplitTypeId: 1, appliedTotal: p.weeks[wk - 1].actual });
    return {
      lineupSlotId: slot, playerId: p.id,
      playerPoolEntry: {
        appliedStatTotal: w.actual ?? 0,
        ...(withInjury ? { ratings: { 0: { positionalRanking: seasonRank[p.id] } } } : {}),
        player: { id: p.id, fullName: p.fullName, defaultPositionId: p.defaultPositionId, proTeamId: p.proTeamId, eligibleSlots: p.eligibleSlots, stats,
          ownership: { percentOwned: Math.min(99.9, 40 + (p.id * 37) % 60), percentStarted: Math.min(99, 10 + (p.id * 53) % 85) },
          ...(withInjury ? {
            injuryStatus: p.injuryStatus, injured: p.injuryStatus !== "ACTIVE",
            rankings: { [wk]: [{ rankType: "PPR", rankSourceId: 0, averageRank: pprRank(p, wk) + Math.round(rand() * 4) / 2 },
              ...[3, 5, 6, 7, 10].map((src) => ({ rankType: "PPR", rankSourceId: src, rank: Math.max(1, pprRank(p, wk) + Math.round((rand() - 0.5) * 8)) }))] },
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

  // A finished past season: 14 regular-season weeks, then a 4-team playoff.
  function pastSeason(year) {
    let s = year * 977;
    const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const strength = Object.fromEntries(teams.map((t) => [t.id, 95 + r() * 40]));
    const score = (id) => round(strength[id] + (r() - 0.5) * 50);
    const rec = Object.fromEntries(teams.map((t) => [t.id, { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 }]));
    const sched = [];
    let id = 1;
    for (const m of schedule) {
      const h = score(m.homeId), a = score(m.awayId);
      rec[m.homeId].pointsFor += h; rec[m.homeId].pointsAgainst += a; rec[m.awayId].pointsFor += a; rec[m.awayId].pointsAgainst += h;
      if (h > a) { rec[m.homeId].wins++; rec[m.awayId].losses++; } else { rec[m.awayId].wins++; rec[m.homeId].losses++; }
      sched.push({ id: id++, matchupPeriodId: m.matchupPeriodId, playoffTierType: "NONE", winner: h > a ? "HOME" : "AWAY", home: { teamId: m.homeId, totalPoints: h }, away: { teamId: m.awayId, totalPoints: a } });
    }
    const seeds = [...teams].sort((x, y) => rec[y.id].wins - rec[x.id].wins || rec[y.id].pointsFor - rec[x.id].pointsFor).map((t) => t.id);
    const game = (wk, x, y) => {
      const h = score(x), a = score(y);
      sched.push({ id: id++, matchupPeriodId: wk, playoffTierType: "WINNERS_BRACKET", winner: h > a ? "HOME" : "AWAY", home: { teamId: x, totalPoints: h }, away: { teamId: y, totalPoints: a } });
      return h > a ? [x, y] : [y, x];
    };
    const [w1, l1] = game(15, seeds[0], seeds[3]), [w2, l2] = game(15, seeds[1], seeds[2]);
    const [champ, runner] = game(16, w1, w2);
    const finishOrder = [champ, runner, ...[l1, l2].sort((x, y) => seeds.indexOf(x) - seeds.indexOf(y)), ...seeds.slice(4)];
    const draftOrder = [...teams].sort(() => r() - 0.5).map((t) => t.id);
    return {
      id: 424242, seasonId: year,
      status: { currentMatchupPeriod: 16, isActive: false },
      settings: { name: "Demo League (sample data)", scheduleSettings: { matchupPeriodCount: REG_WEEKS, playoffTeamCount: 4 } },
      members: teams.map((t) => ({ id: t.owner, displayName: t.ownerName, firstName: t.ownerName.split(" ")[0], lastName: t.ownerName.split(" ")[1] })),
      teams: teams.map((t) => ({
        id: t.id, name: year === 2024 && t.id % 3 === 0 ? `${t.name} Classic` : t.name, abbrev: t.abbrev, owners: [t.owner], primaryOwner: t.owner,
        playoffSeed: seeds.indexOf(t.id) + 1, rankCalculatedFinal: finishOrder.indexOf(t.id) + 1, draftDayProjectedRank: draftOrder.indexOf(t.id) + 1,
        record: { overall: { ...rec[t.id], pointsFor: round(rec[t.id].pointsFor), pointsAgainst: round(rec[t.id].pointsAgainst) } },
        transactionCounter: { acquisitions: Math.round(r() * 40), trades: Math.round(r() * 5) },
      })),
      schedule: sched,
    };
  }

  function response(views, scoringPeriodId, season) {
    if (season && Number(season) !== SEASON) return pastSeason(Number(season));
    const wk = scoringPeriodId || CURRENT_WEEK;
    const withRoster = views.includes("mBoxscore");
    const out = {
      id: 424242, seasonId: SEASON, scoringPeriodId: CURRENT_WEEK,
      status: { currentMatchupPeriod: CURRENT_WEEK, latestScoringPeriod: CURRENT_WEEK, finalScoringPeriod: TOTAL_WEEKS, isActive: true, previousSeasons: [2024, 2025] },
      settings: {
        name: "Demo League (sample data)",
        rosterSettings: { lineupSlotCounts: SLOT_COUNTS },
        scheduleSettings: { matchupPeriodCount: REG_WEEKS, playoffTeamCount: 4 },
        acquisitionSettings: { isUsingAcquisitionBudget: false, waiverProcessDays: ["WEDNESDAY", "SATURDAY"], waiverHours: 24 },
        // Same scoring as the real leagues (PPR, yardage bonuses), so scoring banners add up the same way.
        scoringSettings: { scoringItems: [{"statId":17,"points":10.0},{"statId":119,"points":0.0,"pointsOverrides":{"16":1.0}},{"statId":117,"points":0.0,"pointsOverrides":{"16":1.0}},{"statId":45,"points":4.0},{"statId":25,"points":6.0},{"statId":134,"points":0.0,"pointsOverrides":{"16":-4.0}},{"statId":53,"points":1.0},{"statId":18,"points":20.0},{"statId":72,"points":-2.0},{"statId":46,"points":5.0},{"statId":64,"points":-1.0},{"statId":36,"points":5.0},{"statId":43,"points":6.0},{"statId":35,"points":4.0},{"statId":102,"points":6.0,"pointsOverrides":{"16":6.0}},{"statId":85,"points":-2.0},{"statId":24,"points":0.1},{"statId":103,"points":6.0,"pointsOverrides":{"16":6.0}},{"statId":86,"points":2.0},{"statId":101,"points":6.0,"pointsOverrides":{"16":6.0}},{"statId":88,"points":-2.0},{"statId":104,"points":6.0,"pointsOverrides":{"16":6.0}},{"statId":90,"points":0.0,"pointsOverrides":{"16":15.0}},{"statId":121,"points":0.0,"pointsOverrides":{"16":4.0}},{"statId":131,"points":0.0,"pointsOverrides":{"16":5.0}},{"statId":15,"points":4.0},{"statId":106,"points":0.0,"pointsOverrides":{"16":3.0}},{"statId":37,"points":10.0},{"statId":89,"points":0.0,"pointsOverrides":{"16":25.0}},{"statId":125,"points":0.0,"pointsOverrides":{"16":-5.0}},{"statId":16,"points":5.0},{"statId":3,"points":0.04},{"statId":91,"points":0.0,"pointsOverrides":{"16":10.0}},{"statId":124,"points":0.0,"pointsOverrides":{"16":-3.0}},{"statId":132,"points":0.0,"pointsOverrides":{"16":1.0}},{"statId":133,"points":0.0,"pointsOverrides":{"16":-1.0}},{"statId":42,"points":0.1},{"statId":123,"points":0.0,"pointsOverrides":{"16":2.0}},{"statId":4,"points":6.0},{"statId":122,"points":0.0,"pointsOverrides":{"16":3.0}},{"statId":38,"points":20.0},{"statId":128,"points":0.0,"pointsOverrides":{"16":25.0}},{"statId":206,"points":2.0,"pointsOverrides":{"16":2.0}},{"statId":57,"points":20.0},{"statId":95,"points":0.0,"pointsOverrides":{"16":4.0}},{"statId":129,"points":0.0,"pointsOverrides":{"16":15.0}},{"statId":92,"points":0.0,"pointsOverrides":{"16":5.0}},{"statId":209,"points":1.0,"pointsOverrides":{"16":1.0}},{"statId":130,"points":0.0,"pointsOverrides":{"16":10.0}},{"statId":56,"points":10.0},{"statId":93,"points":6.0,"pointsOverrides":{"16":6.0}},{"statId":98,"points":0.0,"pointsOverrides":{"16":2.0}},{"statId":99,"points":0.0,"pointsOverrides":{"16":2.0}},{"statId":96,"points":0.0,"pointsOverrides":{"16":2.0}},{"statId":97,"points":0.0,"pointsOverrides":{"16":2.0}},{"statId":19,"points":2.0},{"statId":20,"points":-2.0},{"statId":135,"points":0.0,"pointsOverrides":{"16":-8.0}},{"statId":136,"points":0.0,"pointsOverrides":{"16":-10.0}},{"statId":63,"points":6.0},{"statId":80,"points":3.0},{"statId":26,"points":2.0},{"statId":77,"points":4.0},{"statId":44,"points":2.0},{"statId":201,"points":6.0},{"statId":198,"points":5.0}] },
      },
      members: teams.map((t) => ({ id: t.owner, displayName: t.ownerName.replace(/\W/g, "").toLowerCase(), firstName: t.ownerName.split(" ")[0], lastName: t.ownerName.split(" ")[1] })),
      teams: teams.map((t) => ({
        id: t.id, name: t.name, abbrev: t.abbrev, owners: [t.owner], primaryOwner: t.owner,
        playoffSeed: seeds.indexOf(t.id) + 1, waiverRank: teams.length - seeds.indexOf(t.id),
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

  // Whole-season schedule for the Roster tab's Schedule view: sched[team][week] = [opponent, home].
  let schedMemo = null;
  function demoSched() {
    if (schedMemo) return schedMemo;
    schedMemo = {};
    for (let w = 1; w <= TOTAL_WEEKS; w++) {
      let s = 7919 * w;
      const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
      const ids = [...Array(30).keys()].map((i) => i + 1).concat([33, 34]);
      const order = [...ids];
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      for (let i = 2; i < order.length; i += 2) {
        (schedMemo[order[i]] ||= {})[w] = [order[i + 1], true];
        (schedMemo[order[i + 1]] ||= {})[w] = [order[i], false];
      }
    }
    return schedMemo;
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
    return { games, byes, oprk, sched: demoSched() };
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
      const st = sp < CURRENT_WEEK || i < 3 ? "post" : i < 8 ? "in" : "pre";
      const progress = st === "post" ? 1 : st === "in" ? Math.min(0.97, 0.15 + (i - 3) * 0.15 + elapsedMin / 4) : 0;
      progressOf[h] = progressOf[a] = progress;
      const q = Math.min(4, Math.floor(progress * 4) + 1), clockSec = Math.round((1 - ((progress * 4) % 1)) * 900);
      const colors = ["#0b2265", "#a71930", "#004c54", "#fb4f14", "#203731", "#002244", "#00338d", "#e31837", "#4f2683", "#125740"];
      const side = (id) => ({ timeouts: st === "in" ? 3 - ((id + i) % 3) : null, proId: id, abbr: abbr(id), name: abbr(id), logo: logo(id), color: colors[id % colors.length], score: st === "pre" ? 0 : Math.round(progress * (14 + (id * 7) % 20)), record: `${(id % 4) + 1}-${(id * 3) % 4}` });
      // Field position (0 = home goal line, 100 = away goal line), moving as the demo game advances.
      let field = null, downDistance = "";
      const possession = st === "in" ? (i % 2 ? h : a) : null;
      if (st === "in") {
        const dir = possession === h ? 1 : -1;
        const gain = [7, 12, -3, 24][i % 4];
        const own = i === 4 ? 85 : 20 + Math.round((progress * 140 + i * 9) % 55); // yards from the offense's own goal line
        const spot = dir > 0 ? own : 100 - own;
        const yl = (s) => (s === 50 ? "50" : s < 50 ? `${abbr(h)} ${s}` : `${abbr(a)} ${100 - s}`);
        const down = 1 + (i % 3), dist = [10, 7, 3][i % 3];
        downDistance = `${["1st", "2nd", "3rd"][down - 1]} & ${own >= 90 ? "Goal" : dist} at ${yl(spot)}`;
        field = {
          yardLine: spot, possText: yl(spot), down, distance: dist,
          // Game 5 shows an incomplete pass (no yardage, same spot); the rest alternate passes and runs.
          lastPlay: i === 5
            ? { type: "Pass Incompletion", start: spot, end: spot, yards: 0, teamId: possession, scoring: false }
            : i === 6 ? { type: "Rush", start: spot + dir * 10, end: spot, yards: -18, teamId: possession, scoring: false }
            : i === 7 ? { type: "Pass Interception Return", start: spot + dir * 25, end: spot, yards: 0, teamId: possession === h ? a : h, scoring: false }
            : { type: i % 2 ? "Pass Reception" : "Rush", start: spot - dir * gain, end: spot, yards: gain, teamId: possession, scoring: false },
          driveStart: Math.max(0, Math.min(100, spot - dir * (gain + 18))), driveDesc: `${3 + i} plays, ${gain + 18} yards, ${2 + (i % 3)}:${String(10 + i * 7).slice(-2)}`,
        };
      }
      return {
        field,
        id: `demo${i}`, state: st,
        date: new Date(Date.now() + (st === "pre" ? (i - 6) * 3 * 3600e3 : -3 * 3600e3)).toISOString(),
        detail: st === "in" ? `${["1st", "2nd", "3rd", "4th"][q - 1]} ${Math.floor(clockSec / 60)}:${String(clockSec % 60).padStart(2, "0")}` : st === "post" ? "Final" : "",
        broadcast: ["CBS", "FOX", "NBC", "ESPN"][i % 4],
        possession,
        downDistance,
        redZone: st === "in" && i === 4,
        lastPlay: st !== "in" ? "" : i === 5 ? "J.Doe pass incomplete deep left to M.Smith" : i === 6 ? "R.Roe left tackle for 4 yards. PENALTY on X-B.Lee, Offensive Holding, 10 yards, enforced at the spot of the foul." : i === 7 ? "J.Doe pass short left intended for M.Smith INTERCEPTED by K.Fox. K.Fox for 25 yards." : i % 2 ? `J.Doe pass short right to M.Smith for ${[7, 12, -3, 24][i % 4]} yards` : `R.Roe up the middle for ${[7, 12, -3, 24][i % 4]} yards`,
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

  // Same shape as /api/values: [espnId, name, position, nflTeam, value, overallRank, positionRank, trend30Day].
  function values() {
    const posName = (id) => Object.keys(POS).find((k) => POS[k][0] === id);
    const scale = { QB: 260, RB: 520, WR: 470, TE: 420 };
    const list = allPlayers.filter((p) => scale[posName(p.defaultPositionId)])
      .map((p) => { const pos = posName(p.defaultPositionId); return { id: p.id, name: p.fullName, pos, nfl: p.proTeamId, value: Math.round(p.base * scale[pos] * (0.8 + ((p.id * 37) % 40) / 100)) }; });
    // A handful of unrostered players so the Trade Analyzer has free agents to suggest.
    ["RB", "RB", "WR", "WR", "WR", "TE", "QB", "RB", "TE", "WR"].forEach((pos, i) => list.push({ id: 80000 + i, name: `${FIRST[(i * 5 + 3) % FIRST.length]} ${LAST[(i * 7 + 2) % LAST.length]}`, pos, nfl: 1 + (i * 3) % 30, value: 900 + ((i * 613) % 2600) }));
    list.sort((a, b) => b.value - a.value);
    const posCount = {};
    const abbr = (id) => (typeof PRO !== "undefined" && PRO[id]) || "";
    return { updated: Date.now(), players: list.map((v, i) => [v.id, v.name, v.pos, abbr(v.nfl), v.value, i + 1, (posCount[v.pos] = (posCount[v.pos] || 0) + 1), ((v.id * 131) % 1400) - 600]) };
  }

  // Same shape as /api/player: a season game log with per-stat points (appliedStats).
  function player(id) {
    let p = null, teamId = 0;
    for (const t of teams) { const f = t.players.find((x) => x.id === id); if (f) { p = f; teamId = t.id; } }
    const scoring = { 3: 0.04, 4: 6, 20: -2, 24: 0.1, 25: 6, 53: 1, 42: 0.1, 43: 6 };
    const weeks = [];
    if (p) {
      for (let sp = 1; sp < CURRENT_WEEK; sp++) {
        const w = p.weeks[sp];
        if (w.actual == null) continue;
        let stats, applied = {};
        if (p.defaultPositionId === 5) { const fg = Math.max(0, Math.round((w.actual - 2) / 3)); stats = { 80: fg, 83: fg, 84: fg + 1, 86: 2, 87: 2 }; applied = { 80: fg * 3, 86: 2 }; }
        else if (p.defaultPositionId === 16) { const sacks = Math.max(0, Math.round(w.actual / 2)); stats = { 99: sacks, 120: 17, 92: 1 }; applied = { 99: sacks, 92: 5 }; }
        else { stats = statsFor(p.defaultPositionId, w.actual); for (const [k, v] of Object.entries(stats)) if (scoring[k] && v) applied[k] = round(v * scoring[k]); }
        const nflWeek = nfl(sp), g = nflWeek.games[p.proTeamId];
        weeks.push({ sp, proId: p.proTeamId, opp: g ? g[0] : null, home: g ? g[1] : null, date: null, pts: round(Object.values(applied).reduce((a, b) => a + b, 0)), stats, applied });
      }
    }
    const name = p ? p.fullName : `Demo player ${id}`;
    return { player: { id, name, posId: p ? p.defaultPositionId : 3, proId: p ? p.proTeamId : 1, injury: p && p.injuryStatus !== "ACTIVE" ? p.injuryStatus : "", teamId, bye: 9 }, seasonPts: 0, seasonProj: p ? round(p.base * 16) : 0, weeks };
  }

  // Same shape as /api/freeagents. The first ten match the free agents in values() so trade values line up.
  function freeAgents(sp) {
    const shape = ["RB", "RB", "WR", "WR", "WR", "TE", "QB", "RB", "TE", "WR", "WR", "RB", "QB", "TE", "K", "K", "DST", "DST", "WR", "RB", "WR", "RB", "TE", "WR", "K", "DST", "QB", "WR", "RB", "WR"];
    const played = sp < CURRENT_WEEK;
    const players = shape.map((pos, i) => {
      const [posId, , [lo, hi]] = POS[pos];
      const proj = round(lo * 0.6 + ((i * 37) % 10) / 10 * (hi - lo) * 0.6);
      const name = i < 10 ? `${FIRST[(i * 5 + 3) % FIRST.length]} ${LAST[(i * 7 + 2) % LAST.length]}` : pos === "DST" ? `${["Saints", "Colts", "Titans"][i % 3]} D/ST` : `${FIRST[(i * 11 + 1) % FIRST.length]} ${LAST[(i * 13 + 4) % LAST.length]}`;
      return {
        id: i < 10 ? 80000 + i : 81000 + i, name, posId, proId: 1 + (i * 7) % 30,
        status: i % 6 === 2 ? "W" : "FA", waiverDate: i % 6 === 2 ? Date.now() + 2 * 864e5 : null,
        injury: i % 9 === 4 ? "QUESTIONABLE" : "",
        own: round(Math.max(1, 78 - i * 2.4)), ownChg: round(((i * 53) % 130) / 10 - 5),
        proj, pts: played ? round(Math.max(0, proj + (((i * 29) % 13) - 6))) : null,
        seasonPts: round(proj * (CURRENT_WEEK - 1) * 0.9), seasonAvg: round(proj * 0.9), seasonProj: round(proj * 17),
        pprRank: 20 + i, posRank: 25 + (i * 3) % 40,
      };
    });
    return { sp, updated: Date.now(), players };
  }

  // Same shape as /api/usage: weekly snap counts and targets (nflverse). Uses its own hash-based
  // noise so it doesn't disturb the shared random sequence used elsewhere in the demo.
  function usage() {
    const abbr = (id) => (typeof PRO !== "undefined" && PRO[id]) || "";
    const noise = (a, b) => (((a * 2654435761) ^ (b * 40503)) >>> 0) % 1000 / 1000;
    const posName = (id) => ({ 1: "QB", 2: "RB", 3: "WR", 4: "TE" })[id];
    const people = allPlayers.filter((p) => posName(p.defaultPositionId)).map((p) => ({ id: p.id, name: p.fullName, pos: posName(p.defaultPositionId), proId: p.proTeamId, base: p.base }));
    for (const p of freeAgents(1).players) if (posName(p.posId)) people.push({ id: p.id, name: p.name, pos: posName(p.posId), proId: p.proId, base: p.proj * 0.9, fa: true });
    const weeks = [...Array(CURRENT_WEEK - 1).keys()].map((i) => i + 1);
    const teams = {};
    for (const id of Object.keys(PRO_IDS)) {
      const t = abbr(Number(id));
      teams[t] = {};
      for (const wk of weeks) if (Number(id) % 13 !== wk) teams[t][wk] = [58 + Math.round(noise(Number(id), wk) * 18), 0, 0, 0, 0];
    }
    const players = people.map((p) => {
      const t = abbr(p.proId), w = {};
      for (const wk of weeks) {
        const tw = teams[t]?.[wk];
        if (!tw) continue;
        const n = noise(p.id, wk);
        // A few free agents see their role jump in the latest week (shows the ▲ trend).
        const riser = p.fa && p.id % 3 === 0 && wk === weeks.at(-1);
        let pct = p.pos === "QB" ? (n < 0.9 ? 100 : 0) : Math.min(100, Math.round((p.pos === "RB" ? 22 : 35) + p.base * 3.2 + (n - 0.5) * 24));
        if (p.fa && !riser) pct = Math.round(pct * 0.55);
        if (riser) pct = Math.min(96, pct + 40);
        if (pct <= 0) continue;
        const tgt = p.pos === "QB" ? 0 : Math.max(0, Math.round((pct / 100) * (p.pos === "RB" ? 4 : p.pos === "TE" ? 6 : 8) * (0.6 + n)));
        const att = p.pos === "RB" ? Math.round((pct / 100) * 20 * (0.6 + n)) : p.pos === "QB" ? Math.round(n * 6) : 0;
        tw[1] += tgt;
        tw[2] += att;
        // Red zone: roughly one in six targets and one in five carries happen inside the 20.
        const rzT = Math.round(tgt * (0.1 + n * 0.15)), rzC = Math.round(att * (0.12 + n * 0.18));
        tw[3] += rzT; tw[4] += rzC;
        w[wk] = [Math.round((tw[0] * pct) / 100), pct, tgt, t, att, [rzT, rzC, Math.round((rzT + rzC) * 0.5), n > 0.8 && rzT + rzC ? 1 : 0, p.pos === "QB" ? Math.round(n * 7) : 0]];
      }
      return [p.id, p.name, p.pos, w];
    });
    // Unrostered teammates soak up the rest of each team's targets and carries.
    for (const t of Object.keys(teams)) for (const wk of weeks) if (teams[t][wk]) { teams[t][wk][1] += 18 + Math.round(noise(t.length * 7 + t.charCodeAt(0), wk) * 10); teams[t][wk][2] += 3 + Math.round(noise(t.charCodeAt(0), wk) * 5); teams[t][wk][3] += 2; teams[t][wk][4] += 1; }
    return { season: SEASON, updated: Date.now(), weeks, teams, players };
  }
  const PRO_IDS = Object.fromEntries([...Array(30).keys()].map((i) => [i + 1, 1]).concat([[33, 1], [34, 1]]));

  // Same shape as /api/weather. Domes and retractable roofs follow the real stadiums for each team ID.
  function weather(sp) {
    const abbr = (id) => (typeof PRO !== "undefined" && PRO[id]) || "";
    const DOMES = { 8: "Ford Field", 13: "Allegiant Stadium", 14: "SoFi Stadium", 16: "U.S. Bank Stadium", 18: "Caesars Superdome", 24: "SoFi Stadium" };
    const RETRACT = { 1: "Mercedes-Benz Stadium", 6: "AT&T Stadium", 11: "Lucas Oil Stadium", 22: "State Farm Stadium", 34: "NRG Stadium" };
    const noise = (a, b) => (((a * 2654435761) ^ (b * 40503)) >>> 0) % 1000 / 1000;
    const n = nfl(sp), games = [];
    for (const [id, [opp, home, date]] of Object.entries(n.games)) {
      if (!home) continue;
      const h = Number(id), k = noise(h, sp), state = sp < CURRENT_WEEK ? "post" : "pre";
      const roof = DOMES[h] ? "dome" : RETRACT[h] ? "retractable" : "open";
      const code = [0, 1, 2, 3, 61, 63, 80, 0, 2, 71][Math.floor(k * 10)];
      const wet = code >= 51;
      const kick = Date.now() + (1 + Math.floor(k * 3)) * 864e5;
      const f = state === "post" || roof === "dome" ? null : (() => {
        const temp = 38 + Math.round(k * 45), wind = 4 + Math.round(noise(sp, h) * 20);
        const hours = [0, 1, 2, 3].map((i) => ({ t: new Date(kick + i * 36e5).toISOString(), tempF: temp - i, feelsF: temp - i - (wind > 12 ? 5 : 1), precipProb: wet ? 45 + i * 10 : Math.round(k * 15), precipIn: wet ? 0.05 * (i + 1) : 0, code, windMph: wind + i, gustMph: wind + 9 + i }));
        return { tempF: temp, feelsF: hours[0].feelsF, precipProb: Math.max(...hours.map((x) => x.precipProb)), precipIn: wet ? 0.5 : 0, windMph: wind + 3, gustMph: wind + 12, code, desc: { 0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Cloudy", 61: "Light rain", 63: "Rain", 80: "Rain showers", 71: "Light snow" }[code], hours };
      })();
      const g = { id: `${sp}-${h}`, date: new Date(kick).toISOString(), state, home: h, away: opp, homeAbbr: abbr(h), awayAbbr: abbr(opp), venue: DOMES[h] || RETRACT[h] || `${abbr(h)} Stadium`, city: "", roof, forecast: f };
      if (roof === "retractable" && state !== "post") g.roofCall = h === 1 ? { call: "closed", why: "This roof is almost always closed for games" } : f && (f.precipProb >= 30 || f.tempF < 55 || f.tempF >= 80) ? { call: "likely closed", why: f.precipProb >= 30 ? `${f.precipProb}% rain chance` : `${f.tempF}° at kickoff` } : { call: "likely open", why: "Mild, dry forecast" };
      games.push(g);
    }
    return { sp, updated: Date.now(), games };
  }

  // Same shape as /api/boxscore, built from the demo's live players for one game.
  function box(id, sp) {
    const L = live(sp || CURRENT_WEEK), g = L.games.find((x) => x.id === id);
    if (!g) return { event: id, state: "pre", updated: Date.now(), teams: {}, teamStats: [], players: { away: [], home: [] } };
    const forTeam = (proId) => L.players.filter((p) => p.proId === proId && p.pts != null);
    const row = (p, stats) => ({ id: p.id, name: p.name, short: p.name.replace(/^(\w)\w*\s/, "$1. "), jersey: String(10 + (p.id % 80)), headshot: "", stats });
    const cats = (proId) => {
      const ps = forTeam(proId), out = [];
      const qbs = ps.filter((p) => p.posId === 1 && p.stats[3] != null);
      if (qbs.length) out.push({ key: "passing", title: "Passing", labels: ["C/ATT", "YDS", "TD", "INT"], rows: qbs.map((p) => { const att = Math.max(1, Math.round(p.stats[3] / 7.5)); return row(p, [`${Math.round(att * 0.65)}/${att}`, String(p.stats[3]), String(p.stats[4] || 0), String(p.stats[20] || 0)]); }) });
      const rush = ps.filter((p) => p.stats[24]);
      if (rush.length) out.push({ key: "rushing", title: "Rushing", labels: ["CAR", "YDS", "AVG", "TD"], rows: rush.map((p) => { const car = Math.max(1, Math.round(p.stats[24] / 4.4)); return row(p, [String(car), String(p.stats[24]), (p.stats[24] / car).toFixed(1), String(p.stats[25] || 0)]); }) });
      const rec = ps.filter((p) => p.stats[53] != null || p.stats[42]);
      if (rec.length) out.push({ key: "receiving", title: "Receiving", labels: ["REC", "YDS", "TD", "TGTS"], rows: rec.map((p) => row(p, [String(p.stats[53] || 0), String(p.stats[42] || 0), String(p.stats[43] || 0), String(p.stats[58] || (p.stats[53] || 0) + 1)])) });
      return out;
    };
    const tot = (proId, k) => forTeam(proId).reduce((s, p) => s + (p.stats[k] || 0), 0);
    const ts = (label, a, h, bar) => ({ label, away: String(a), home: String(h), bar: !!bar });
    const A = g.away.proId, H = g.home.proId;
    return {
      event: id, state: g.state, updated: Date.now(),
      teams: { away: { proId: A, abbr: g.away.abbr, name: g.away.name }, home: { proId: H, abbr: g.home.abbr, name: g.home.name } },
      teamStats: [
        ts("Total yards", tot(A, 3) + tot(A, 24), tot(H, 3) + tot(H, 24), true),
        ts("Passing yards", tot(A, 3), tot(H, 3), true),
        ts("Rushing yards", tot(A, 24), tot(H, 24), true),
        ts("First downs", Math.round((tot(A, 3) + tot(A, 24)) / 16), Math.round((tot(H, 3) + tot(H, 24)) / 16)),
        ts("Turnovers", tot(A, 20), tot(H, 20)),
        ts("Time of possession", "29:12", "30:48"),
      ],
      players: { away: cats(A), home: cats(H) },
    };
  }

  // Same shape as /api/news: a couple of recent updates for some players.
  function news(ids) {
    const lines = [
      ["was limited in practice Wednesday with a hamstring injury.", "He's considered questionable for Sunday; check back before kickoff."],
      ["caught five of seven targets for 64 yards in Sunday's win.", "He has seen at least six targets in three straight games."],
      ["is expected to handle lead-back duties with the starter sidelined.", "Coaches said the workload will be split, but he should see most early-down snaps."],
      ["was a full participant in practice and has no injury designation.", "He's on track to play his usual role."],
    ];
    const players = {};
    ids.forEach((id, i) => {
      const n = Number(id);
      if (n % 3 === 0) return;
      const pl = allPlayers.find((p) => p.id === n);
      const name = pl ? pl.fullName : "He";
      const [head, story] = lines[(n + i) % lines.length];
      players[id] = [{ headline: `${name} ${head}`, story: `${name} ${head} ${story}`, published: new Date(Date.now() - ((n % 40) + 1) * 3600e3).toISOString() }];
    });
    return { updated: Date.now(), players };
  }

  // Same shape as /api/injuries: demo players with an injury status, plus depth charts by NFL team.
  function injuries() {
    const STATUS = { OUT: "Out", INJURY_RESERVE: "Injured Reserve", QUESTIONABLE: "Questionable", DOUBTFUL: "Doubtful", DAY_TO_DAY: "Questionable" };
    const posName = (id) => ({ 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K" })[id];
    const types = ["Hamstring", "Ankle", "Knee", "Concussion", "Shoulder", "Calf", "Groin", "Foot"];
    const fa = freeAgents(1).players.map((p) => ({ id: p.id, fullName: p.name, defaultPositionId: p.posId, proTeamId: p.proId, injuryStatus: p.injury || "ACTIVE", base: p.proj }));
    const pool = allPlayers.concat(fa).filter((p) => posName(p.defaultPositionId));
    const hurt = pool.filter((p) => p.injuryStatus && p.injuryStatus !== "ACTIVE");
    const players = hurt.map((p, i) => ({
      id: p.id, name: p.fullName, pos: posName(p.defaultPositionId), proId: p.proTeamId, status: STATUS[p.injuryStatus] || "Out", date: new Date(Date.now() - (i + 2) * 864e5).toISOString(),
      type: types[(p.id + i) % types.length], detail: "", side: i % 3 ? "" : "Left",
      returnDate: p.injuryStatus === "INJURY_RESERVE" ? null : new Date(Date.now() + ((p.id % 4) + 1) * 7 * 864e5).toISOString().slice(0, 10),
      note: `${p.fullName} is dealing with an injury and is ${(STATUS[p.injuryStatus] || "out").toLowerCase()} for now.`,
    }));
    // Depth charts like ESPN's: QB, RB, three receiver spots, TE, K; each [id, name, injury status].
    const STAT = { OUT: "Out", INJURY_RESERVE: "Injured Reserve", QUESTIONABLE: "Questionable", DOUBTFUL: "Doubtful" };
    const byTeam = {};
    for (const p of pool) ((byTeam[p.proTeamId] ||= { QB: [], RB: [], WR: [], TE: [], K: [] })[posName(p.defaultPositionId)]).push(p);
    const depth = {};
    for (const [tid, d] of Object.entries(byTeam)) {
      const row = (p) => [p.id, p.fullName, STAT[p.injuryStatus] || ""];
      const ord = (list) => [...list].sort((a, b) => (b.base || 0) - (a.base || 0)).map(row);
      const wr = ord(d.WR);
      depth[tid] = { QB: ord(d.QB), RB: ord(d.RB), WR1: wr.filter((_, i) => i % 3 === 0), WR2: wr.filter((_, i) => i % 3 === 1), WR3: wr.filter((_, i) => i % 3 === 2), TE: ord(d.TE), K: ord(d.K) };
    }
    // Remaining game weeks per team (byes left out) and each team's bye.
    const upcoming = {}, byes = {};
    for (let sp = CURRENT_WEEK + 1; sp <= TOTAL_WEEKS; sp++) {
      const off = nfl(sp).byes;
      for (const tid of Object.keys(byTeam)) {
        if (off[tid]) byes[tid] ||= sp;
        else (upcoming[tid] ||= []).push(sp);
      }
    }
    for (const p of players) {
      const up = upcoming[p.proId] || [];
      p.nextWeek = up[0] ?? null;
      p.returnWeek = p.returnDate ? up[Math.max(0, Math.round((Date.parse(p.returnDate) - Date.now()) / (7 * 864e5)) - 1)] ?? null : null;
    }
    return { updated: Date.now(), players, depth, byes, upcoming };
  }

  // Same shape as /api/injuries?team=N: one team's offensive depth chart.
  function depthChart(tid) {
    return { team: Number(tid), depth: injuries().depth[tid] || {} };
  }

  window.DemoLeague = { response, activity, nfl, live, values, player, freeAgents, usage, weather, box, news, injuries, depthChart };
})();
