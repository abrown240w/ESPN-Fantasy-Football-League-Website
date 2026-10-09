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
        injuryStatus: rand() < 0.06 ? pick(["QUESTIONABLE", "QUESTIONABLE", "OUT", "DOUBTFUL"]) : "ACTIVE",
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

  function entry(p, wk, slot) {
    const w = p.weeks[wk];
    const stats = [{ scoringPeriodId: wk, statSourceId: 1, statSplitTypeId: 1, appliedTotal: w.proj, stats: statsFor(p.defaultPositionId, w.proj) }];
    if (w.actual !== null) stats.push({ scoringPeriodId: wk, statSourceId: 0, statSplitTypeId: 1, appliedTotal: w.actual, stats: statsFor(p.defaultPositionId, w.actual) });
    return {
      lineupSlotId: slot, playerId: p.id,
      playerPoolEntry: {
        appliedStatTotal: w.actual ?? 0,
        player: { id: p.id, fullName: p.fullName, defaultPositionId: p.defaultPositionId, proTeamId: p.proTeamId, eligibleSlots: p.eligibleSlots, injuryStatus: p.injuryStatus, injured: p.injuryStatus !== "ACTIVE", stats },
      },
    };
  }
  const entries = (t, wk) => t.players.map((p) => entry(p, wk, t["lineup" + wk][p.id]));
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
        ...(views.includes("mRoster") ? { roster: { entries: entries(t, wk) } } : {}),
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

  window.DemoLeague = { response };
})();
