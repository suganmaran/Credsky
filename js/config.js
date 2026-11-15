/**
 * SKY CRED — configuration
 *
 * The WeatherAPI key lives in `.env` (WEATHER_API_KEY) and is used by the
 * serverless proxy at /api/weather. It is never shipped to the browser.
 *
 * `apiKey` below is an optional client-side fallback for static hosting
 * without functions. Leave it empty for the secure proxy setup.
 */
export const config = {
  proxyUrl: "/api/weather",
  apiOrigin: "https://api.weatherapi.com/v1/current.json",
  apiKey: "",
  timeoutMs: 14000,
  defaultCity: "Mumbai",
  popularCities: [
    { label: "Mumbai", query: "Mumbai, India" },
    { label: "Delhi", query: "Delhi, India" },
    { label: "Bengaluru", query: "Bengaluru, India" },
    { label: "Hyderabad", query: "Hyderabad, India" },
    { label: "Chennai", query: "Chennai, India" },
    { label: "Kolkata", query: "Kolkata, India" },
    { label: "Pune", query: "Pune, India" },
    { label: "Ahmedabad", query: "Ahmedabad, India" },
    { label: "New York", query: "New York, United States" },
    { label: "London", query: "London, United Kingdom" },
  ],
};

const ALIASES = new Map(config.popularCities.map((city) => [city.label.toLowerCase(), city.query]));

const normalizeCity = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

/**
 * Resolve a typed city name to a WeatherAPI query.
 *
 * A bare "Delhi" (or "London", "New York", …) is ambiguous at the API and can
 * resolve to an unrelated town. Popular shortcut names are therefore mapped to
 * their intended city, and all other input is passed through untouched.
 */
export function resolveQuery(value) {
  const normalized = normalizeCity(value);
  return ALIASES.get(normalized.toLowerCase()) ?? normalized;
}
