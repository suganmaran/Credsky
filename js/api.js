/**
 * WeatherAPI transport.
 *
 * Primary path: /api/weather (serverless proxy that injects the API key).
 * Optional fallback: direct WeatherAPI call if `config.apiKey` is set.
 *
 * Every failure is normalised into a WeatherError with a stable `kind` so the
 * UI can show the right message (FR-08).
 */

import { config } from "./config.js";

export class WeatherError extends Error {
  constructor(kind, { title, message, retryable = true, code = null, status = null } = {}) {
    super(message ?? title ?? "Unknown weather error");
    this.name = "WeatherError";
    this.kind = kind;
    this.title = title ?? "Something went wrong";
    this.userMessage = message ?? "We couldn't load the weather. Please try again.";
    this.retryable = retryable;
    this.code = code;
    this.status = status;
  }
}

const MESSAGES = {
  "not-found": {
    title: "City not found",
    message: "We couldn't find that city. Check the spelling, or try a nearby larger city.",
    retryable: false,
  },
  config: {
    title: "API configuration error",
    message: "The weather service isn't configured correctly (invalid or missing API key).",
    retryable: false,
  },
  rate: {
    title: "Temporarily unavailable",
    message: "The weather service is busy or has reached its request limit. Try again in a moment.",
    retryable: true,
  },
  network: {
    title: "No internet connection",
    message: "We couldn't reach the weather service. Check your connection and try again.",
    retryable: true,
  },
  timeout: {
    title: "Request timed out",
    message: "The weather service took too long to respond. Please try again.",
    retryable: true,
  },
  server: {
    title: "Service unavailable",
    message: "The weather service is unavailable right now. Please try again shortly.",
    retryable: true,
  },
  "bad-response": {
    title: "Unexpected response",
    message: "The weather service returned something we couldn't read. Please try again.",
    retryable: true,
  },
  generic: {
    title: "Something went wrong",
    message: "We couldn't load the weather for that city. Please try again.",
    retryable: true,
  },
};

function fail(kind, extra = {}) {
  return new WeatherError(kind, { ...MESSAGES[kind], ...extra });
}

/** Map a WeatherAPI error object onto a product-level message. */
function mapApiError(error, status) {
  const code = error?.code != null ? String(error.code) : null;
  const detail = typeof error?.message === "string" ? error.message : "";

  if (code === "1006") return fail("not-found", { code, status, detail });
  if (code === "PROXY") return fail("server", { code, status, detail });

  if (["2006", "2008", "1002", "1004", "1005", "1010"].includes(code)) {
    return fail("config", { code, status, detail });
  }

  if (["2007", "2009", "2010"].includes(code)) {
    return fail("rate", { code, status, detail });
  }

  if (status === 401 || status === 403) return fail("config", { code, status, detail });
  if (status === 429) return fail("rate", { code, status, detail });
  if (status >= 500) return fail("server", { code, status, detail });

  return fail("generic", { code, status, detail });
}

function classifyTransport(status, hasJson) {
  if (status === 404 || status === 405 || (status >= 500 && !hasJson)) {
    // Proxy isn't present or the platform failed before reaching WeatherAPI.
    return fail("server", { status, detail: `HTTP ${status}` });
  }
  if (status === 401 || status === 403) return fail("config", { status });
  if (status === 429) return fail("rate", { status });
  return fail("bad-response", { status });
}

async function readBody(response) {
  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { text, json };
}

function withTimeout(parentSignal, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("Request timed out", "TimeoutError"));
  }, timeoutMs);

  const onAbort = () => controller.abort(parentSignal?.reason);
  if (parentSignal) {
    if (parentSignal.aborted) controller.abort(parentSignal.reason);
    else parentSignal.addEventListener("abort", onAbort, { once: true });
  }

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    done: () => {
      clearTimeout(timer);
      parentSignal?.removeEventListener("abort", onAbort);
    },
  };
}

/**
 * Fetch current weather for a city.
 * Resolves with { data, raw, status, source, receivedAt }.
 */
export async function fetchWeather(city, { signal } = {}) {
  const query = String(city ?? "").trim();
  if (!query) throw fail("generic", { title: "Enter a city", message: "Type a city name first." });

  const attempts = [];
  if (config.proxyUrl) {
    attempts.push({ source: "proxy", url: `${config.proxyUrl}?q=${encodeURIComponent(query)}` });
  }
  if (config.apiKey) {
    attempts.push({
      source: "direct",
      url: `${config.apiOrigin}?key=${encodeURIComponent(config.apiKey)}&q=${encodeURIComponent(query)}&aqi=no`,
    });
  }
  if (!attempts.length) throw fail("config", { detail: "No transport configured" });

  let lastError = null;

  for (const attempt of attempts) {
    const timeout = withTimeout(signal, config.timeoutMs);
    try {
      const response = await fetch(attempt.url, {
        signal: timeout.signal,
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      const { text, json } = await readBody(response);

      if (json && typeof json?.current?.temp_c === "number" && json?.location) {
        return {
          data: json,
          raw: text,
          status: response.status,
          source: attempt.source,
          receivedAt: Date.now(),
        };
      }

      if (json?.error) throw mapApiError(json.error, response.status);

      // No WeatherAPI payload and no error envelope: this transport is missing,
      // so fall through to the next strategy when one is available.
      lastError = classifyTransport(response.status, Boolean(json));
    } catch (error) {
      if (error instanceof WeatherError) throw error;

      if (signal?.aborted) throw error; // caller cancelled — let the app ignore it
      lastError = timeout.didTimeout() ? fail("timeout") : fail("network", { detail: String(error?.message ?? error) });
    } finally {
      timeout.done();
    }
  }

  throw lastError ?? fail("generic");
}
