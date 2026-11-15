/**
 * Serverless proxy for WeatherAPI (Vercel Node function).
 *
 * Keeps WEATHER_API_KEY on the server so the browser never receives it,
 * while the frontend stays plain HTML/CSS/JS.
 */
module.exports = async function handler(req, res) {
  const city = String(req.query?.q ?? "").trim();

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (!city) {
    res.status(400).json({ error: { code: 1003, message: "Parameter q is required." } });
    return;
  }

  if (city.length > 80) {
    res.status(400).json({ error: { code: 1004, message: "City name is too long." } });
    return;
  }

  const key = process.env.WEATHER_API_KEY;
  if (!key) {
    res.status(500).json({ error: { code: 2006, message: "API key is not configured." } });
    return;
  }

  const url = new URL("https://api.weatherapi.com/v1/current.json");
  url.searchParams.set("key", key);
  url.searchParams.set("q", city);
  url.searchParams.set("aqi", "no");

  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    const body = await response.text();

    res.status(response.status);
    res.send(body);
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    res.status(502).json({
      error: {
        code: "PROXY",
        message: timedOut ? "Weather service timed out." : "Weather service unreachable.",
      },
    });
  }
};
