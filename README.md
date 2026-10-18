# ESPN Fantasy Football Weekly Breakdown

A website that connects to ESPN fantasy football leagues (switch between them with the dropdown next to the league name) and breaks down every week:

- **Roster**: pick any team to see its lineup for the selected week (starters, bench and IR) with opponent rank, projections, points, rankings and trade values, plus record, standing and this week's matchup.
- **Matchups**: every game with score, projection and win chance. Tap one for a position-by-position head-to-head, bench comparison and key takeaways.
- **Live games**: this week's NFL games with live scores and clock, an ESPN-style field graphic for games in progress (ball spot, possession and direction, first-down line, the last play, and the current drive), and every rostered player's live stats and fantasy points, who rosters them, and whether they're starting. Refreshes every 30 seconds during games.
- **Players**: opens on available free agents (free agents and players on waivers, with % rostered across ESPN, projections, points, opponent rank and trade value). Switch to Rostered players for the top scorer at each position plus a searchable, sortable table of every rostered player (points, projection, over/under, stat line, injury status, opponent and opponent rank, ESPN PPR rank, season scoring rank).
- **Weekly Snapshot**: weekly awards (top score, optimal lineup, most bench points wasted, unluckiest loss, …) and a report card with each team's optimal lineup and lineup efficiency.
- **Standings**: standings with all-play record, luck rating, streaks and power rankings, a luck chart, and a weekly score heatmap.
- **History**: champions by year, league records, an all-time manager table, and final standings for each completed season.
- **Trade Analyzer**: your team's strengths and weaknesses by position vs. the league, best available free agents, suggested trade targets with matching offers, and a mock trade tool (up to 3 players per side). Uses FantasyCalc trade values.
- **Transactions**: accepted trades awaiting league review, plus every waiver claim, free-agent move and completed trade, filterable by team and type.

## Files

```
netlify/functions/espn.mjs   Server-side proxy to ESPN (browsers can't call ESPN directly)
netlify/functions/logo.mjs   Loads custom-uploaded team logos (needs ESPN_S2 and SWID)
netlify/functions/activity.mjs   League transactions and pending trades
netlify/functions/nfl.mjs   NFL opponents and opponent ranks (OPRK) for each week
netlify/functions/live.mjs   Live NFL scoreboard with live fantasy points for every player
netlify/functions/values.mjs   FantasyCalc redraft trade values, cached for 24 hours
netlify/functions/player.mjs   A player's season game log with ESPN's per-stat scoring breakdown
netlify/functions/fa.mjs   Free agents and players on waivers
index.html, styles.css, app.js, demo.js   The website
```

## Deploy to Netlify

This site deploys from GitHub: any change pushed to the `main` branch is published automatically.
When uploading files through GitHub's website, upload from a short path (like `Documents`) so file names aren't shortened. `index.html` must keep its exact name.

**Option A: GitHub (easiest to keep updated)**
1. Put this folder in a GitHub repository.
2. In Netlify: **Add new site → Import an existing project → GitHub**, then pick the repo. No build command or publish directory is needed; the defaults work.
3. Go to **Site configuration → Environment variables** and add `LEAGUE_ID` = your league ID.
4. Under **Deploys**, choose **Trigger deploy**.

**Option B: Netlify CLI**
```bash
npm install -g netlify-cli
netlify login
netlify deploy --prod
```
Then add the `LEAGUE_ID` environment variable in the Netlify dashboard and deploy again.

### Finding your league ID
Open your league on ESPN. The ID is the number after `leagueId=` in the URL, e.g. `fantasy.espn.com/football/league?leagueId=12345678`.

### Environment variables
| Name | Required | What it does |
|---|---|---|
| `LEAGUE_ID` | Recommended | Your league; visitors go straight to it. Without it, the site asks for a league ID. |
| `SEASON` | No | Season year, e.g. `2026`. Defaults to the current NFL season. |
| `ESPN_S2`, `SWID` | Only for private leagues | Your ESPN login cookies. Keep them secret. |

## Handy URLs
- `/?demo`: demo league with sample data
- `/?week=3`: jump to a specific week
- `/?league=1001176763`: open one of the leagues in the dropdown (other league IDs open the default league). To add or remove leagues, edit the `LEAGUES` list at the top of `app.js`.

## Testing locally
```bash
netlify dev
```
Then open http://localhost:8888 (use `/?demo` to try it without a league).

## Notes
- ESPN's API is unofficial and undocumented. It has been stable for years, but ESPN can change it without notice.
- Win chances use ESPN projections with a simple statistical model. The power ranking blends all-play record (40%), actual record (25%), last-3-weeks scoring (20%) and season average (15%).
- During live weeks, the page refreshes scores every 2 minutes, and responses are cached for 60 seconds.

## FantasyCalc trade values
Trade values come from FantasyCalc's documented API (`/values/current`, redraft), fetched at most once a day per league format and cached by Netlify. FantasyCalc's terms allow non-commercial use with a visible credit and link to FantasyCalc.com on every page that shows their values. Keep the "Trade values from FantasyCalc.com" line in place.

## Player popups
Tap or click any player name to open their season game log. Tap a player's points (anywhere on the site, or any week in the game log) to see exactly how they were scored under your league's rules. The breakdown uses ESPN's own per-stat points, so it always adds up to ESPN's official total.
