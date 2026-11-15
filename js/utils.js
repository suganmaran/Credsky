/** Small, dependency-free helpers used across the app. */

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const isNumber = (value) => typeof value === "number" && Number.isFinite(value);

/** Trim trailing `.0` so displayed values match the API without noise. */
export function formatMeasure(value) {
  if (!isNumber(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** WeatherAPI returns protocol-relative, 64px icon URLs. Request the crisp set. */
export function iconUrl(icon) {
  if (!icon || typeof icon !== "string") return "";
  const absolute = icon.startsWith("//") ? `https:${icon}` : icon;
  return absolute.replace("/64x64/", "/128x128/");
}

function safeFormatter(options, timeZone) {
  try {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone });
  } catch {
    return null;
  }
}

/** "3:24 PM" in the city's own timezone. */
export function cityClock(timeZone, date = new Date(), withSeconds = false) {
  const formatter = safeFormatter(
    {
      hour: "numeric",
      minute: "2-digit",
      ...(withSeconds ? { second: "2-digit" } : {}),
      hour12: true,
    },
    timeZone,
  );
  return formatter ? formatter.format(date) : null;
}

/** "Nov 15, 3:15 PM" in the city's own timezone. */
export function cityTimestamp(epochSeconds, timeZone) {
  if (!isNumber(epochSeconds)) return null;
  const formatter = safeFormatter(
    { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true },
    timeZone,
  );
  return formatter ? formatter.format(new Date(epochSeconds * 1000)) : null;
}

/** "just now", "9 min ago", "2 hr ago", "3 days ago". */
export function relativeTime(epochSeconds) {
  if (!isNumber(epochSeconds)) return null;
  const diff = Math.max(0, Math.round(Date.now() / 1000 - epochSeconds));
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return `${Math.floor(diff / 86400)} day${Math.floor(diff / 86400) === 1 ? "" : "s"} ago`;
}

/** Local-clock time of day used for a friendly greeting/eyebrow. */
export function dayPart(timeZone) {
  const formatter = safeFormatter({ hour: "numeric", hour12: false }, timeZone);
  if (!formatter) return null;
  const hour = Number(formatter.format(new Date()));
  if (Number.isNaN(hour)) return null;
  if (hour < 5) return "night";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}
