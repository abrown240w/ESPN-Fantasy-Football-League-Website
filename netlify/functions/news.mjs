// Player updates (the short RotoWire notes ESPN shows on player cards) for up to 25 players: as much
// history as ESPN keeps (up to 25 per player), newest first.
// ESPN's news feed only takes one player per request, so they're fetched in parallel. General
// articles that merely mention a player are skipped. Cached for 30 minutes.

const FEED = "https://site.api.espn.com/apis/fantasy/v2/games/ffl/news/players";

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...extraHeaders } });
}
const strip = (html) => String(html || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"').replace(/\s+/g, " ").trim();

export default async (req) => {
  const ids = [...new Set((new URL(req.url).searchParams.get("ids") || "").split(",").filter((x) => /^\d{1,10}$/.test(x)))].slice(0, 25);
  if (!ids.length) return json(400, { error: "bad_request", message: "No players given." });
  const now = Date.now();
  const players = {};
  await Promise.all(ids.map(async (id) => {
    try {
      const res = await fetch(`${FEED}?limit=30&playerId=${id}`, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (fantasy-dashboard)" } });
      if (!res.ok) return;
      const d = await res.json();
      players[id] = (d.feed || [])
        .filter((a) => a.type === "Rotowire")
        .sort((a, b) => Date.parse(b.published) - Date.parse(a.published))
        .slice(0, 25)
        .map((a) => ({ headline: strip(a.headline), story: strip(a.story).slice(0, 600), published: a.published }));
    } catch { /* skip this player */ }
  }));
  return json(200, { updated: now, players }, {
    "cache-control": "public, max-age=900",
    "netlify-cdn-cache-control": "public, max-age=1800, stale-while-revalidate=600",
  });
};

export const config = { path: "/api/news" };
