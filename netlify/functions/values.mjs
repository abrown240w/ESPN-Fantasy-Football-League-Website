// Redraft trade values from FantasyCalc (https://fantasycalc.com), via their documented
// /values/current endpoint. FantasyCalc's terms ask API users to cache results and fetch
// about once a day, so Netlify's shared CDN cache holds each league format for 24 hours:
// FantasyCalc is called roughly once per day per format, however many people visit.
// Pages that show these values must credit and link to FantasyCalc.com.

const FANTASYCALC = "https://api.fantasycalc.com/values/current";

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...extraHeaders } });
}

export default async (req) => {
  const params = new URL(req.url).searchParams;
  const numTeams = params.get("numTeams") || "12";
  const ppr = params.get("ppr") || "1";
  const numQbs = params.get("numQbs") || "1";
  // Only formats FantasyCalc supports, which also keeps the number of cached variants small.
  if (!["8", "10", "12", "14"].includes(numTeams) || !["0", "0.5", "1"].includes(ppr) || !["1", "2"].includes(numQbs)) {
    return json(400, { error: "bad_request", message: "Unsupported league format." });
  }

  const url = `${FANTASYCALC}?isDynasty=false&numQbs=${numQbs}&numTeams=${numTeams}&ppr=${ppr}`;
  let list;
  try {
    const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "brownleague.netlify.app (private fantasy league site)" } });
    if (!res.ok) throw new Error(`FantasyCalc returned ${res.status}`);
    list = await res.json();
  } catch {
    return json(502, { error: "upstream", message: "Couldn't load trade values from FantasyCalc." }, { "cache-control": "no-store" });
  }

  // [espnId, name, position, nflTeam, value, overallRank, positionRank, trend30Day]
  const players = list
    .filter((v) => v.player?.espnId && v.player.position !== "PICK")
    .map((v) => [Number(v.player.espnId), v.player.name, v.player.position, v.player.maybeTeam || "", v.value, v.overallRank, v.positionRank, v.trend30Day || 0]);

  return json(200, { updated: Date.now(), format: { numTeams, ppr, numQbs }, players }, {
    "cache-control": "public, max-age=3600",
    // "durable" shares one cached copy across all of Netlify's servers.
    "netlify-cdn-cache-control": "public, durable, max-age=86400, stale-while-revalidate=3600",
  });
};

export const config = { path: "/api/values" };
