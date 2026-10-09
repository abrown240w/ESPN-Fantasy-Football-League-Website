# ESPN Fantasy Football Weekly Breakdown

A website that connects to an ESPN fantasy football league and breaks down every week:

- **Matchups**: every game with score, projection and win chance. Tap one for a position-by-position head-to-head, bench comparison and key takeaways.
- **Players**: top scorer at each position, plus a searchable, sortable table of every rostered player (points, projection, over/under, stat line, injury status).
- **Managers**: weekly awards (top score, best lineup, most bench points wasted, unluckiest loss, …) and a report card with each team's optimal lineup and lineup efficiency.
- **Season**: standings with all-play record, luck rating, streaks and power rankings, a luck chart, and a weekly score heatmap.

## Files

```
netlify.toml                 Netlify config
netlify/functions/espn.mjs   Server-side proxy to ESPN (browsers can't call ESPN directly)
public/                      The website (index.html, styles.css, app.js, demo.js)
```

## Deploy to Netlify

> Netlify's drag-and-drop upload does **not** deploy the `netlify/functions` folder, and the site needs it to reach ESPN. Use option A or B.

**Option A: GitHub (easiest to keep updated)**
1. Put this folder in a GitHub repository.
2. In Netlify: **Add new site → Import an existing project → GitHub**, then pick the repo. No build command is needed; Netlify reads `netlify.toml`.
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
- `/?league=12345678&season=2025`: view any public league or past season

## Testing locally
```bash
netlify dev
```
Then open http://localhost:8888 (use `/?demo` to try it without a league).

## Notes
- ESPN's API is unofficial and undocumented. It has been stable for years, but ESPN can change it without notice.
- Win chances use ESPN projections with a simple statistical model. The power ranking blends all-play record (40%), actual record (25%), last-3-weeks scoring (20%) and season average (15%).
- During live weeks, the page refreshes scores every 2 minutes, and responses are cached for 60 seconds.
