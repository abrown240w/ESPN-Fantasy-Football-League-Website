// Game-time weather for each NFL game in a week. ESPN's scoreboard gives the kickoff time and
// stadium; the forecast comes from Open-Meteo (https://open-meteo.com, free for non-commercial
// use, CC BY 4.0: pages that show it credit Open-Meteo). Fixed-roof stadiums are reported as
// indoors instead of a forecast. For retractable roofs the forecast is kept along with a best
// guess at whether the roof will be open (teams decide on game day). Cached for an hour.

const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
const FORECAST = "https://api.open-meteo.com/v1/forecast";
const GEOCODE = "https://geocoding-api.open-meteo.com/v1/search";
const HOURS = ["temperature_2m", "apparent_temperature", "precipitation_probability", "precipitation", "weather_code", "wind_speed_10m", "wind_gusts_10m"];

// NFL stadiums (2026): name keywords, coordinates and roof. "dome" = fixed roof (including SoFi's
// canopy roof), "retractable" = can open, "open" = outdoors. Neutral sites abroad are listed too;
// anything else is located by city and uses ESPN's indoor flag.
const STADIUMS = [
  { re: /state farm stadium/i, lat: 33.5276, lon: -112.2626, roof: "retractable", team: "ARI" },
  { re: /mercedes-benz stadium/i, lat: 33.7554, lon: -84.4008, roof: "retractable", team: "ATL", usuallyClosed: true },
  { re: /m&t bank/i, lat: 39.278, lon: -76.6227, roof: "open" },
  { re: /highmark/i, lat: 42.7738, lon: -78.787, roof: "open" },
  { re: /bank of america stadium/i, lat: 35.2258, lon: -80.8528, roof: "open" },
  { re: /soldier field/i, lat: 41.8623, lon: -87.6167, roof: "open" },
  { re: /paycor|paul brown/i, lat: 39.0955, lon: -84.516, roof: "open" },
  { re: /huntington bank field|cleveland browns stadium/i, lat: 41.5061, lon: -81.6995, roof: "open" },
  { re: /at&t stadium/i, lat: 32.7473, lon: -97.0945, roof: "retractable", team: "DAL" },
  { re: /empower field|mile high/i, lat: 39.7439, lon: -105.0201, roof: "open" },
  { re: /ford field/i, lat: 42.34, lon: -83.0456, roof: "dome" },
  { re: /lambeau/i, lat: 44.5013, lon: -88.0622, roof: "open" },
  { re: /nrg stadium|reliant stadium/i, lat: 29.6847, lon: -95.4107, roof: "retractable", team: "HOU" },
  { re: /lucas oil/i, lat: 39.7601, lon: -86.1639, roof: "retractable", team: "IND" },
  { re: /everbank|tiaa bank/i, lat: 30.324, lon: -81.6373, roof: "open" },
  { re: /arrowhead|geha field/i, lat: 39.0489, lon: -94.4839, roof: "open" },
  { re: /allegiant/i, lat: 36.0909, lon: -115.1833, roof: "dome" },
  { re: /sofi stadium/i, lat: 33.9535, lon: -118.3392, roof: "dome" },
  { re: /hard rock stadium/i, lat: 25.958, lon: -80.2389, roof: "open" },
  { re: /u\.?s\.? bank stadium/i, lat: 44.9737, lon: -93.2581, roof: "dome" },
  { re: /gillette/i, lat: 42.0909, lon: -71.2643, roof: "open" },
  { re: /superdome/i, lat: 29.9511, lon: -90.0812, roof: "dome" },
  { re: /metlife/i, lat: 40.8135, lon: -74.0745, roof: "open" },
  { re: /lincoln financial/i, lat: 39.9008, lon: -75.1675, roof: "open" },
  { re: /acrisure|heinz field/i, lat: 40.4468, lon: -80.0158, roof: "open" },
  { re: /levi'?s stadium/i, lat: 37.403, lon: -121.97, roof: "open" },
  { re: /lumen field/i, lat: 47.5952, lon: -122.3316, roof: "open" },
  { re: /raymond james/i, lat: 27.9759, lon: -82.5033, roof: "open" },
  { re: /nissan stadium/i, lat: 36.1665, lon: -86.7713, roof: "open" },
  { re: /northwest stadium|fedex field|commanders field/i, lat: 38.9077, lon: -76.8645, roof: "open" },
  // International / neutral sites
  { re: /wembley/i, lat: 51.556, lon: -0.2796, roof: "open" },
  { re: /tottenham/i, lat: 51.6043, lon: -0.0664, roof: "open" },
  { re: /allianz arena/i, lat: 48.2188, lon: 11.6247, roof: "open" },
  { re: /olympiastadion/i, lat: 52.5147, lon: 13.2395, roof: "open" },
  { re: /deutsche bank park|frankfurt/i, lat: 50.0686, lon: 8.6455, roof: "retractable", usuallyClosed: false },
  { re: /azteca|banorte/i, lat: 19.3029, lon: -99.1505, roof: "open" },
  { re: /bernab[eé]u/i, lat: 40.4531, lon: -3.6883, roof: "retractable" },
  { re: /stade de france/i, lat: 48.9245, lon: 2.3602, roof: "open" },
  { re: /croke park/i, lat: 53.3607, lon: -6.2512, roof: "open" },
  { re: /melbourne cricket|\bmcg\b/i, lat: -37.82, lon: 144.9834, roof: "open" },
  { re: /maracan[aã]/i, lat: -22.9122, lon: -43.2302, roof: "open" },
  { re: /neo qu[ií]mica|corinthians/i, lat: -23.5453, lon: -46.4742, roof: "open" },
];

const WX = {
  0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Cloudy", 45: "Fog", 48: "Freezing fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 56: "Freezing drizzle", 57: "Freezing drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Rain showers", 81: "Rain showers", 82: "Heavy showers", 85: "Snow showers", 86: "Heavy snow showers",
  95: "Thunderstorms", 96: "Thunderstorms with hail", 99: "Thunderstorms with hail",
};
// Worst weather wins when summarizing the game window (snow/storms over rain over clouds).
const severity = (c) => (c >= 95 ? 9 : (c >= 71 && c <= 77) || c >= 85 ? 8 : c >= 61 ? 6 : c >= 51 ? 4 : c >= 45 ? 3 : c);

function defaultSeason() {
  const now = new Date();
  return now.getUTCMonth() < 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
}
function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...extraHeaders } });
}
async function getJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "brownleague.netlify.app (private fantasy league site)" } });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}

// Best guess for a retractable roof: closed for rain, cold, heat or strong wind.
function roofCall(st, f, hoursAway) {
  if (st.usuallyClosed) return { call: "closed", why: "This roof is almost always closed for games" };
  if (!f) return { call: null, why: "Decided on game day" };
  const reasons = [];
  if (f.precipProb >= 30) reasons.push(`${f.precipProb}% rain chance`);
  if (f.tempF < 55) reasons.push(`${Math.round(f.tempF)}° at kickoff`);
  if (f.tempF >= 80) reasons.push(`${Math.round(f.tempF)}° heat`);
  if (f.windMph >= 20) reasons.push(`${Math.round(f.windMph)} mph wind`);
  const sure = hoursAway < 30 ? "" : "likely ";
  return reasons.length ? { call: `${sure}closed`, why: reasons.join(", ") } : { call: `${sure}open`, why: "Mild, dry forecast" };
}

export default async (req) => {
  const params = new URL(req.url).searchParams;
  const season = params.get("season") || String(defaultSeason());
  const sp = Number(params.get("scoringPeriodId") || 0);
  if (!/^\d{4}$/.test(season) || !(sp >= 1 && sp <= 18)) return json(400, { error: "bad_request", message: "Invalid season or week." });

  try {
    const board = await getJson(`${SCOREBOARD}?dates=${season}&seasontype=2&week=${sp}`);
    const games = [];
    for (const e of board.events || []) {
      const comp = e.competitions?.[0] || {};
      const v = comp.venue || {};
      const home = comp.competitors?.find((c) => c.homeAway === "home")?.team || {};
      const away = comp.competitors?.find((c) => c.homeAway === "away")?.team || {};
      let st = STADIUMS.find((s) => s.re.test(v.fullName || ""));
      if (!st && v.address?.city) {
        // Unknown venue (new name or a new neutral site): find the city.
        try {
          const g = await getJson(`${GEOCODE}?name=${encodeURIComponent(v.address.city)}&count=10`);
          const country = (v.address.country || "").toLowerCase().replace(/^usa$/, "united states");
          const r = (g.results || []).find((x) => country && (x.country || "").toLowerCase() === country) || g.results?.[0];
          if (r) st = { lat: r.latitude, lon: r.longitude, roof: v.indoor ? "dome" : "open" };
        } catch { /* no location: show no forecast */ }
      }
      games.push({
        id: e.id, date: e.date, state: e.status?.type?.state || "pre",
        home: Number(home.id), away: Number(away.id), homeAbbr: home.abbreviation || "", awayAbbr: away.abbreviation || "",
        venue: v.fullName || "", city: [v.address?.city, v.address?.state || v.address?.country].filter(Boolean).join(", "),
        roof: st?.roof || (v.indoor ? "dome" : "open"), st,
      });
    }

    // One Open-Meteo request for every game that needs a forecast (not indoors, not finished, within 16 days).
    const now = Date.now();
    const need = games.filter((g) => g.st && g.roof !== "dome" && g.state !== "post" && new Date(g.date) - now < 15.5 * 864e5);
    if (need.length) {
      const q = new URLSearchParams({
        latitude: need.map((g) => g.st.lat).join(","), longitude: need.map((g) => g.st.lon).join(","),
        hourly: HOURS.join(","), temperature_unit: "fahrenheit", wind_speed_unit: "mph", precipitation_unit: "inch",
        timezone: "GMT", forecast_days: "16",
      });
      let data = await getJson(`${FORECAST}?${q}`);
      if (!Array.isArray(data)) data = [data];
      need.forEach((g, i) => {
        const h = data[i]?.hourly;
        if (!h) return;
        const kick = new Date(g.date);
        kick.setUTCMinutes(0, 0, 0);
        const start = h.time.indexOf(kick.toISOString().slice(0, 16));
        if (start < 0) return;
        // Kickoff hour plus the next three (a game lasts about 3¼ hours).
        const hours = [0, 1, 2, 3].map((k) => start + k).filter((j) => j < h.time.length).map((j) => ({
          t: `${h.time[j]}:00Z`, tempF: h.temperature_2m[j], feelsF: h.apparent_temperature[j], precipProb: h.precipitation_probability[j] ?? 0,
          precipIn: h.precipitation[j] ?? 0, code: h.weather_code[j], windMph: h.wind_speed_10m[j], gustMph: h.wind_gusts_10m[j],
        }));
        const worst = hours.reduce((a, x) => (severity(x.code) > severity(a.code) ? x : a), hours[0]);
        g.forecast = {
          tempF: hours[0].tempF, feelsF: hours[0].feelsF,
          precipProb: Math.max(...hours.map((x) => x.precipProb)), precipIn: Math.round(hours.reduce((s, x) => s + x.precipIn, 0) * 100) / 100,
          windMph: Math.max(...hours.map((x) => x.windMph)), gustMph: Math.max(...hours.map((x) => x.gustMph)),
          code: worst.code, desc: WX[worst.code] || "", hours,
        };
      });
    }
    for (const g of games) {
      if (g.roof === "retractable" && g.state !== "post") g.roofCall = roofCall(g.st || {}, g.forecast, (new Date(g.date) - now) / 36e5);
      delete g.st;
    }
    return json(200, { sp, updated: now, games }, {
      "cache-control": "public, max-age=900",
      "netlify-cdn-cache-control": "public, durable, max-age=3600, stale-while-revalidate=3600",
    });
  } catch {
    return json(502, { error: "upstream", message: "Couldn't load the weather forecast." }, { "cache-control": "no-store" });
  }
};

export const config = { path: "/api/weather" };
