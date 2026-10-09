// Proxy for custom-uploaded ESPN team logos.
// ESPN only serves uploaded logos to signed-in users, so this fetches them with the
// ESPN_S2 and SWID cookies from Netlify's environment variables. Without those
// variables it returns 404 and the site shows the team's initials instead.

const IMAGE_BASE = "https://mystique-api.fantasy.espn.com/apis/v1/domains/lm/images/";

export default async (req) => {
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!/^[0-9a-f-]{36}$/i.test(id) || !process.env.ESPN_S2 || !process.env.SWID) {
    return new Response("Not found", { status: 404 });
  }

  let res;
  try {
    res = await fetch(IMAGE_BASE + id, {
      headers: {
        cookie: `espn_s2=${process.env.ESPN_S2}; SWID=${process.env.SWID}`,
        "user-agent": "Mozilla/5.0 (fantasy-dashboard)",
      },
    });
  } catch {
    return new Response("Upstream error", { status: 502 });
  }

  const type = res.headers.get("content-type") || "";
  if (!res.ok || !type.startsWith("image/")) {
    return new Response("Not found", { status: 404, headers: { "cache-control": "public, max-age=300" } });
  }

  return new Response(await res.arrayBuffer(), {
    status: 200,
    headers: {
      "content-type": type,
      // Logos rarely change; cache for a day.
      "cache-control": "public, max-age=86400",
      "netlify-cdn-cache-control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
};

export const config = { path: "/api/logo" };
