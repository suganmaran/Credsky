/**
 * SKY CRED — application flow.
 * Owns request state, search handling and the loading / success / error states.
 */

import { config, resolveQuery } from "./config.js";
import { fetchWeather, WeatherError } from "./api.js";
import { interpret } from "./personality.js";
import * as ui from "./ui.js";
import { formatMeasure } from "./utils.js";

const state = {
  data: null,
  raw: null,
  reading: null,
  query: "",
  lastQuery: null,
  controller: null,
  requestId: 0,
  loading: false,
};

/**
 * Load weather for a city.
 * Every call supersedes the previous one (FR-08: stale responses can never
 * overwrite newer results).
 */
async function load(city) {
  const query = String(city ?? "").trim();

  if (!query) {
    ui.setInputError("Enter a city name to check its sky cred.");
    ui.focusInput();
    return;
  }

  ui.setInputError(null);
  ui.hideBanner();

  state.controller?.abort();
  const controller = new AbortController();
  state.controller = controller;
  const requestId = ++state.requestId;

  state.lastQuery = query;
  state.loading = true;

  const hasData = Boolean(state.data);
  ui.setSearchBusy(true);
  if (hasData) {
    ui.setRefreshing(true);
  } else {
    ui.showSkeleton();
  }

  try {
    const result = await fetchWeather(query, { signal: controller.signal });
    if (requestId !== state.requestId) return;

    const reading = interpret(result.data);

    state.data = result.data;
    state.raw = result.raw;
    state.reading = reading;
    state.query = query;

    ui.renderWeather({
      data: result.data,
      reading,
      timeZone: result.data.location?.tz_id ?? null,
    });
    ui.renderJson(result);
    ui.hideBanner();
    ui.showContent();
    ui.setRefreshing(false);
    ui.announce(
      `${reading.signals.city}: ${formatMeasure(reading.signals.tempC)} degrees, ${
        reading.signals.conditionText
      }. ${reading.title} — ${reading.description}`,
    );
  } catch (error) {
    if (requestId !== state.requestId) return;
    if (error?.name === "AbortError") return;

    const weatherError =
      error instanceof WeatherError
        ? error
        : new WeatherError("generic", { detail: String(error?.message ?? error) });

    ui.setRefreshing(false);

    if (hasData) {
      // Keep the last valid reading on screen; explain the failed search above it.
      ui.showContent();
      ui.showBanner({
        title: weatherError.title,
        message: `${weatherError.userMessage}`,
        retryable: weatherError.retryable,
      });
      ui.announce(`${weatherError.title}. ${weatherError.userMessage}`);
    } else {
      ui.showEmpty({
        title: weatherError.title,
        text: weatherError.userMessage,
        retryable: weatherError.retryable,
      });
      ui.announce(`${weatherError.title}. ${weatherError.userMessage}`);
    }
  } finally {
    if (requestId === state.requestId) {
      state.loading = false;
      ui.setSearchBusy(false);
    }
  }
}

function retry() {
  if (state.lastQuery) load(state.lastQuery);
}

function wireEvents() {
  ui.els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    load(resolveQuery(ui.getInput()));
  });

  ui.els.input.addEventListener("input", () => {
    ui.syncClearButton();
    if (!ui.els.inputError.hidden) ui.setInputError(null);
  });

  ui.els.clearBtn.addEventListener("click", () => {
    ui.setInput("");
    ui.setInputError(null);
    ui.focusInput();
  });

  ui.els.retryBtn.addEventListener("click", retry);
  ui.els.emptyRetry.addEventListener("click", retry);

  ui.renderChips(config.popularCities, (city) => {
    ui.setInput(city.label);
    load(city.query);
  });

  ui.initJsonViewer();
}

function start() {
  wireEvents();
  ui.setInput(config.defaultCity);
  ui.setInputError(null);
  ui.syncClearButton();
  load(resolveQuery(config.defaultCity));
}

start();
