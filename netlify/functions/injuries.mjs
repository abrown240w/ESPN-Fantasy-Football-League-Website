// Injury report: every QB/RB/WR/TE/K who isn't fully active (out, IR, questionable, doubtful,
// suspended), from ESPN's league-wide injury feed, plus each team's offensive depth chart so the
// site can show who's next up. Cached for an hour.

const INJURIES = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries";
const DEPTH = (team) => `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${team}/depthcharts`;
const POS = { QB: "QB", RB: "RB", FB: "RB", WR: "WR", TE: "TE", PK: "K", K: "K" };

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...extraHeaders } });
}
async function getJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (fantasy-dashboard)" } });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}
const idFrom = (a) => Number(a?.id) || Number(/\/id\/(\d+)/.exec((a?.links || []).map((l) => l.href).join(" "))?.[1]) || null;

export default async () => {
  let feed;
  try { feed = await getJson(INJURIES); } catch {
    return json(502, { error: "upstream", message: "Couldn't load the injury report from ESPN." }, { "cache-control": "no-store" });
  }
  const players = [];
  for (const t of feed.injuries || []) {
    for (const i of t.injuries || []) {
      const pos = POS[i.athlete?.position?.abbreviation];
      if (!pos || !i.status || i.status === "Active") continue;
      const d = i.details || {};
      players.push({
        id: idFrom(i.athlete), name: i.athlete?.displayName || "", pos, proId: Number(t.id),
        status: i.status, date: i.date || null,
        type: d.type || "", detail: d.detail && d.detail !== "Not Specified" ? d.detail : "", side: d.side && d.side !== "Not Specified" ? d.side : "",
        returnDate: d.returnDate || null, note: i.shortComment || "",
      });
    }
  }

  // Offensive depth charts for teams with someone on the report: [id, name, injured] in depth order.
  const teams = [...new Set(players.map((p) => p.proId))];
  const depth = {};
  await Promise.all(teams.map(async (tid) => {
    try {
      const dc = await getJson(DEPTH(tid));
      const forms = dc.depthchart || [];
      const off = forms.find((f) => f.positions?.qb) || {}, st = forms.find((f) => f.positions?.pk) || {};
      const list = (slot) => (slot?.athletes || []).map((a) => [Number(a.id), a.displayName, (a.injuries || []).length > 0]);
      const wr = [list(off.positions?.wr1), list(off.positions?.wr2), list(off.positions?.wr3)];
      const wrs = [];
      for (let i = 0; i < 6; i++) for (const col of wr) if (col[i] && !wrs.some((x) => x[0] === col[i][0])) wrs.push(col[i]);
      depth[tid] = { QB: list(off.positions?.qb), RB: list(off.positions?.rb), WR: wrs, TE: list(off.positions?.te), K: list(st.positions?.pk) };
    } catch { /* no depth chart for this team */ }
  }));

  return json(200, { updated: Date.now(), players, depth }, {
    "cache-control": "public, max-age=900",
    "netlify-cdn-cache-control": "public, durable, max-age=3600, stale-while-revalidate=1800",
  });
};

export const config = { path: "/api/injuries" };
