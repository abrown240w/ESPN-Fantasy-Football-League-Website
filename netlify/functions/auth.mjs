// Is the ESPN sign-in stored in Netlify (ESPN_S2 + SWID) still good? ESPN's sign-in cookies
// expire every so often; when they do, private leagues and past seasons stop loading. This asks
// ESPN for the account the cookies belong to. Only a clear "not signed in" answer is reported as
// expired, so the site never warns by mistake. Never returns the cookies themselves.
// Cached for a few hours so it costs next to nothing.

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=1800",
      "netlify-cdn-cache-control": "public, durable, max-age=21600",
    },
  });
}

export default async () => {
  const s2 = process.env.ESPN_S2, swid = process.env.SWID;
  if (!s2 || !swid) return json(200, { status: "missing" });
  try {
    const res = await fetch(`https://fan.api.espn.com/apis/v2/fans/${encodeURIComponent(swid)}?displayEvents=false&displayNow=false&displayRecs=false&displayHiddenPrefs=false`, {
      headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (fantasy-dashboard)", cookie: `espn_s2=${s2}; SWID=${swid}` },
    });
    if (res.ok) return json(200, { status: "ok", checked: Date.now() });
    if (res.status === 401 || res.status === 403) return json(200, { status: "expired", checked: Date.now() });
    if (res.status === 404) return json(200, { status: "bad_swid", checked: Date.now() });
    return json(200, { status: "unknown", code: res.status, checked: Date.now() });
  } catch {
    return json(200, { status: "unknown", checked: Date.now() });
  }
};

export const config = { path: "/api/auth" };
