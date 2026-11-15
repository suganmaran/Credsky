/**
 * All DOM reads/writes live here so app.js stays about state and flow.
 */

import { cityClock, cityTimestamp, formatMeasure, iconUrl, relativeTime } from "./utils.js";
import { metricNotes, ringColor } from "./personality.js";

const $ = (id) => document.getElementById(id);

export const els = {
  form: $("search-form"),
  input: $("city-input"),
  searchBtn: $("search-btn"),
  clearBtn: $("clear-btn"),
  inputError: $("input-error"),
  popular: $("popular-cities"),

  banner: $("banner"),
  bannerTitle: $("banner-title"),
  bannerMessage: $("banner-message"),
  retryBtn: $("retry-btn"),

  weather: $("weather"),
  skeleton: $("skeleton"),
  content: $("content"),
  empty: $("empty-state"),
  emptyTitle: $("empty-title"),
  emptyText: $("empty-text"),
  emptyRetry: $("empty-retry"),
  liveStatus: $("live-status"),

  cityName: $("city-name"),
  cityRegion: $("city-region"),
  cityTimeText: $("city-time-text"),
  cityTime: $("city-time"),
  tempValue: $("temp-value"),
  conditionIcon: $("condition-icon"),
  conditionText: $("condition-text"),
  feelsLike: $("feels-like"),
  updatingBadge: $("updating-badge"),

  credRing: $("cred-ring"),
  credScore: $("cred-score"),
  credGrade: $("cred-grade"),
  personalityTitle: $("personality-title"),
  personalityDesc: $("personality-desc"),

  metricHumidity: $("metric-humidity"),
  metricWind: $("metric-wind"),
  metricUv: $("metric-uv"),
  humidityNote: $("humidity-note"),
  windNote: $("wind-note"),
  uvNote: $("uv-note"),

  detailCloud: $("detail-cloud"),
  detailVisibility: $("detail-visibility"),
  detailPressure: $("detail-pressure"),
  detailWind: $("detail-wind"),
  detailTempF: $("detail-tempf"),
  detailUpdated: $("detail-updated"),

  jsonView: $("json-view"),
  jsonMeta: $("json-meta"),
  copyBtn: $("copy-btn"),
  copyLabel: $("copy-label"),
  copyStatus: $("copy-status"),
  tabs: Array.from(document.querySelectorAll(".tab")),
};

const kb = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 0 });

/* ------------------------------------------------------------------ */
/* Popular cities                                                      */
/* ------------------------------------------------------------------ */

export function renderChips(cities, onSelect) {
  const fragment = document.createDocumentFragment();
  cities.forEach((city) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.dataset.city = city.label;
    chip.setAttribute("aria-pressed", "false");
    chip.innerHTML = `<span class="chip-dot" aria-hidden="true"></span>${city.label}`;
    chip.addEventListener("click", () => onSelect(city));
    fragment.appendChild(chip);
  });
  els.popular.replaceChildren(fragment);
}

export function setActiveChip(cityName) {
  const target = String(cityName ?? "").trim().toLowerCase();
  els.popular.querySelectorAll(".chip").forEach((chip) => {
    chip.setAttribute("aria-pressed", String(chip.dataset.city.toLowerCase() === target));
  });
}

/* ------------------------------------------------------------------ */
/* Search field                                                        */
/* ------------------------------------------------------------------ */

export function getInput() {
  return els.input.value.trim();
}

export function setInput(value) {
  els.input.value = value;
  syncClearButton();
}

export function focusInput() {
  els.input.focus();
  els.input.select();
}

export function syncClearButton() {
  els.clearBtn.hidden = els.input.value.length === 0;
}

export function setInputError(message) {
  const hasError = Boolean(message);
  els.inputError.hidden = !hasError;
  els.inputError.textContent = hasError ? message : "";
  els.input.setAttribute("aria-invalid", String(hasError));
}

export function setSearchBusy(busy) {
  els.searchBtn.classList.toggle("is-loading", busy);
  els.searchBtn.setAttribute("aria-busy", String(busy));
  els.searchBtn.querySelector(".btn-label").textContent = busy ? "Checking" : "Check sky";
}

/* ------------------------------------------------------------------ */
/* Banner / empty / loading states                                     */
/* ------------------------------------------------------------------ */

export function showBanner({ title, message, retryable }) {
  els.bannerTitle.textContent = title;
  els.bannerMessage.textContent = message;
  els.retryBtn.hidden = !retryable;
  els.banner.hidden = false;
}

export function hideBanner() {
  els.banner.hidden = true;
}

export function showSkeleton() {
  els.skeleton.hidden = false;
  els.content.hidden = true;
  els.empty.hidden = true;
  els.weather.setAttribute("aria-busy", "true");
}

export function showContent() {
  els.skeleton.hidden = true;
  els.empty.hidden = true;
  els.content.hidden = false;
  els.weather.setAttribute("aria-busy", "false");
}

export function showEmpty({ title, text, retryable = false }) {
  els.emptyTitle.textContent = title;
  els.emptyText.textContent = text;
  els.emptyRetry.hidden = !retryable;
  els.skeleton.hidden = true;
  els.content.hidden = true;
  els.empty.hidden = false;
  els.weather.setAttribute("aria-busy", "false");
}

export function setRefreshing(refreshing) {
  els.content.classList.toggle("is-refreshing", refreshing);
  els.updatingBadge.hidden = !refreshing;
  els.weather.setAttribute("aria-busy", String(refreshing));
}

export function announce(message) {
  els.liveStatus.textContent = "";
  // Retrigger the live region reliably.
  requestAnimationFrame(() => {
    els.liveStatus.textContent = message;
  });
}

/* ------------------------------------------------------------------ */
/* Weather rendering                                                   */
/* ------------------------------------------------------------------ */

let clockTimer = null;

export function renderWeather({ data, reading, timeZone }) {
  const location = data.location ?? {};
  const current = data.current ?? {};

  els.cityName.textContent = location.name || "Unknown city";
  els.cityRegion.textContent = [location.region, location.country].filter(Boolean).join(", ") || "—";

  els.tempValue.textContent = formatMeasure(current.temp_c);
  els.conditionText.textContent = current.condition?.text || "—";
  els.feelsLike.textContent =
    current.feelslike_c != null ? `${formatMeasure(current.feelslike_c)}°C` : "—";

  const src = iconUrl(current.condition?.icon);
  if (src) {
    els.conditionIcon.src = src;
    els.conditionIcon.alt = "";
    els.conditionIcon.hidden = false;
  } else {
    els.conditionIcon.removeAttribute("src");
    els.conditionIcon.hidden = true;
  }

  // Sky cred reading
  const score = reading.score;
  els.credScore.textContent = score == null ? "—" : String(score);
  els.credGrade.textContent = reading.grade;
  els.credGrade.dataset.tone = reading.tone;
  els.credRing.style.setProperty("--p", String(score ?? 0));
  els.credRing.style.setProperty("--ring-color", ringColor(reading.tone));
  els.personalityTitle.textContent = reading.title;
  els.personalityDesc.textContent = reading.description;

  // Primary metrics
  const signals = reading.signals;
  const notes = metricNotes(signals);
  els.metricHumidity.textContent = signals.humidity == null ? "—" : String(Math.round(signals.humidity));
  els.metricWind.textContent = formatMeasure(signals.windKph);
  els.metricUv.textContent = signals.uv == null ? "—" : formatMeasure(signals.uv);
  els.humidityNote.textContent = notes.humidityNote;
  els.windNote.textContent = notes.windNote;
  els.uvNote.textContent = notes.uvNote;

  // Secondary detail
  els.detailCloud.textContent = signals.cloud == null ? "—" : `${Math.round(signals.cloud)}%`;
  els.detailVisibility.textContent =
    signals.visibilityKm == null ? "—" : `${formatMeasure(signals.visibilityKm)} km`;
  els.detailPressure.textContent =
    signals.pressureMb == null ? "—" : `${Math.round(signals.pressureMb)} mb`;
  els.detailWind.textContent = `${formatMeasure(signals.windKph)} km/h${signals.windDir ? ` ${signals.windDir}` : ""}`;
  els.detailTempF.textContent = signals.tempF == null ? "—" : `${formatMeasure(signals.tempF)}°F`;

  const absolute = cityTimestamp(signals.lastUpdatedEpoch, timeZone);
  const relative = relativeTime(signals.lastUpdatedEpoch);
  els.detailUpdated.textContent = absolute ? `${absolute} · ${relative}` : relative || "—";
  els.detailUpdated.title = absolute ? `Last updated ${absolute} local time` : "";

  startClock(timeZone);
  setActiveChip(location.name);

  document.title = `${location.name || "Weather"} ${formatMeasure(current.temp_c)}°C · ${reading.title} · SKY CRED`;
}

export function startClock(timeZone) {
  if (clockTimer) clearInterval(clockTimer);
  const tick = () => {
    const time = cityClock(timeZone);
    els.cityTimeText.textContent = time ? `${time} local` : "—";
    els.cityTime.title = timeZone ? `Local time in ${timeZone}` : "";
  };
  tick();
  if (timeZone) clockTimer = setInterval(tick, 15000);
}

/* ------------------------------------------------------------------ */
/* JSON viewer                                                         */
/* ------------------------------------------------------------------ */

let jsonState = { raw: "", data: null, view: "formatted", city: "", status: null, bytes: 0 };
const highlighter = /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlight(json) {
  return escapeHtml(json).replace(highlighter, (match) => {
    let token = "tok-num";
    if (match.startsWith('"')) token = match.endsWith(":") ? "tok-key" : "tok-str";
    else if (match === "true" || match === "false") token = "tok-bool";
    else if (match === "null") token = "tok-null";
    return `<span class="${token}">${match}</span>`;
  });
}

function paintJson() {
  const { raw, data, view } = jsonState;
  if (!raw) return;

  if (view === "raw") {
    els.jsonView.textContent = raw;
  } else {
    const pretty = JSON.stringify(data, null, 2);
    els.jsonView.innerHTML = highlight(pretty);
  }

  els.tabs.forEach((tab) => {
    const active = tab.dataset.view === jsonState.view;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  els.jsonView.setAttribute("aria-labelledby", `tab-${jsonState.view}`);
}

export function renderJson(payload) {
  const bytes = new Blob([payload.raw]).size;
  jsonState = {
    raw: payload.raw,
    data: payload.data,
    view: jsonState.view,
    city: payload.data?.location?.name ?? "",
    status: payload.status,
    bytes,
  };

  const size = bytes < 1024 ? `${bytes} B` : `${kb.format(bytes / 1024)} KB`;
  const statusText = jsonState.status ? `HTTP ${jsonState.status}` : "response";
  els.jsonMeta.textContent = `${jsonState.city} · ${statusText} · ${size} · received ${relativeTime(
    Math.round(payload.receivedAt / 1000),
  )}`;

  paintJson();
}

export function setJsonView(view) {
  jsonState.view = view === "raw" ? "raw" : "formatted";
  paintJson();
}

export function currentJsonText() {
  if (!jsonState.raw) return "";
  return jsonState.view === "raw" ? jsonState.raw : JSON.stringify(jsonState.data, null, 2);
}

export function hasJson() {
  return Boolean(jsonState.raw);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through */
    }
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

export function initJsonViewer() {
  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => setJsonView(tab.dataset.view));
    tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const index = els.tabs.indexOf(tab);
      const next = els.tabs[(index + (event.key === "ArrowRight" ? 1 : els.tabs.length - 1)) % els.tabs.length];
      next.focus();
      setJsonView(next.dataset.view);
    });
  });

  els.copyBtn.addEventListener("click", async () => {
    const text = currentJsonText();
    if (!text) {
      announce("There is no response to copy yet.");
      return;
    }
    const ok = await copyText(text);
    const view = jsonState.view === "raw" ? "Raw" : "Formatted";
    els.copyLabel.textContent = ok ? "Copied" : "Copy failed";
    els.copyStatus.textContent = ok ? `${view} JSON copied to clipboard.` : "Copy failed. Select the text manually.";
    window.setTimeout(() => {
      els.copyLabel.textContent = "Copy";
      els.copyStatus.textContent = "";
    }, 1900);
  });
}
