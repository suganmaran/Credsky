/**
 * Weather interpretation ("sky cred").
 *
 * Thresholds are explicit and evaluated in a fixed priority order so that
 * overlapping conditions always resolve predictably:
 *
 *   1. Freeze Frame  — tempC <= 8
 *   2. Sun Alert     — tempC >= 35
 *   3. Rain Check    — condition mentions rain / snow / storm / fog, or precip > 0
 *   4. Breezy Mode   — windKph >= 30
 *   5. Perfect Day   — 16 <= tempC <= 33, windKph < 30, dry
 *   6. Cloud Nine    — fallback for everything in between
 *
 * The score is an app-generated 0–100 reading derived from temperature,
 * wind, UV, humidity, cloud and visibility. It is not a real credit score.
 */

import { clamp, isNumber } from "./utils.js";

export const THRESHOLDS = {
  freezeMaxC: 8,
  hotMinC: 35,
  windyMinKph: 30,
  pleasantMinC: 16,
  pleasantMaxC: 33,
};

const WET_CONDITION = /(rain|drizzle|shower|thunder|storm|snow|sleet|hail|blizzard|ice|freezing)/i;
const MURKY_CONDITION = /(mist|fog|haze|smoke|dust|sand)/i;
const LOW_VISIBILITY = /(mist|fog|dust|sand)/i;

/** A scenario caps the score so the number can never contradict the verdict. */
const SCORE_CAP = {
  freeze: 52,
  hot: 60,
  rain: 62,
  wind: 68,
  pleasant: 100,
  mild: 90,
};

export function readSignals(data) {
  const current = data?.current ?? {};
  const text = current.condition?.text ?? "";
  const precip = isNumber(current.precip_mm) ? current.precip_mm : 0;

  return {
    tempC: isNumber(current.temp_c) ? current.temp_c : null,
    tempF: isNumber(current.temp_f) ? current.temp_f : null,
    feelsLikeC: isNumber(current.feelslike_c) ? current.feelslike_c : null,
    windKph: isNumber(current.wind_kph) ? current.wind_kph : 0,
    windDir: current.wind_dir ?? "",
    humidity: isNumber(current.humidity) ? current.humidity : null,
    uv: isNumber(current.uv) ? current.uv : 0,
    cloud: isNumber(current.cloud) ? current.cloud : null,
    visibilityKm: isNumber(current.vis_km) ? current.vis_km : null,
    pressureMb: isNumber(current.pressure_mb) ? current.pressure_mb : null,
    precipMm: precip,
    conditionText: text,
    conditionCode: current.condition?.code ?? null,
    isDay: current.is_day === 1,
    lastUpdatedEpoch: current.last_updated_epoch ?? null,
    localtimeEpoch: data?.location?.localtime_epoch ?? null,
    timeZone: data?.location?.tz_id ?? null,
    city: data?.location?.name ?? "",
    region: data?.location?.region ?? "",
    country: data?.location?.country ?? "",
    isWet: WET_CONDITION.test(text) || precip > 0,
    isMurky: MURKY_CONDITION.test(text),
    isLowVisibility: LOW_VISIBILITY.test(text),
  };
}

/** Evaluate the priority-ordered scenarios against the raw signals. */
export function interpret(data) {
  const signals = readSignals(data);
  const t = signals.tempC ?? 24;

  const freeze = t <= THRESHOLDS.freezeMaxC;
  const hot = t >= THRESHOLDS.hotMinC;
  const wet = signals.isWet;
  const windy = signals.windKph >= THRESHOLDS.windyMinKph;
  const pleasant =
    t >= THRESHOLDS.pleasantMinC &&
    t <= THRESHOLDS.pleasantMaxC &&
    !windy &&
    !wet &&
    !signals.isLowVisibility;

  let scenario = "mild";
  if (freeze) scenario = "freeze";
  else if (hot) scenario = "hot";
  else if (wet) scenario = "rain";
  else if (windy) scenario = "wind";
  else if (pleasant) scenario = "pleasant";

  const reading = {
    freeze: {
      title: "Freeze Frame",
      description: "Bone-chilling cold. Bundle up tight.",
      advice: "Layer up and keep extremities covered",
    },
    hot: {
      title: "Sun Alert",
      description: "Stay hydrated and avoid excessive sun exposure.",
      advice: "Water, shade and sunscreen",
    },
    rain: {
      title: "Rain Check",
      description: "Carry an umbrella before stepping out.",
      advice: "An umbrella is non-negotiable",
    },
    wind: {
      title: "Breezy Mode",
      description: "Expect strong winds. Dress accordingly.",
      advice: "Secure loose layers",
    },
    pleasant: {
      title: "Perfect Day",
      description: "Great weather to step outside.",
      advice: "Green light — go outside",
    },
    mild: {
      title: "Cloud Nine",
      description: mildDescription(t, signals),
      advice: "A steady, unremarkable sky",
    },
  }[scenario];

  const rawScore = scoreFor(signals);
  const score = rawScore == null ? null : Math.min(rawScore, SCORE_CAP[scenario] ?? 100);
  const grade = gradeFor(score);

  return {
    scenario,
    title: reading.title,
    description: reading.description,
    advice: reading.advice,
    score,
    grade: grade.label,
    tone: grade.tone,
    signals,
    reasons: reasonsFor(signals, { hot, freeze, wet, windy, pleasant }),
  };
}

function mildDescription(tempC, signals) {
  if (signals.isLowVisibility) return "Low visibility out there. Take care if you're heading out.";
  if (signals.isMurky) return "Hazy and settled. Take it easy if you're sensitive.";
  if (tempC < THRESHOLDS.pleasantMinC) return "Crisp and cool. A light jacket keeps it comfortable.";
  if (tempC > THRESHOLDS.pleasantMaxC) return "Warm and sticky. Keep some water handy.";
  return "Mild and steady. A light layer should do.";
}

function reasonsFor(signals, flags) {
  const reasons = [];
  if (flags.freeze) reasons.push(`Temperature is ${signals.tempC}°C`);
  if (flags.hot) reasons.push(`Temperature is ${signals.tempC}°C`);
  if (flags.wet) reasons.push(signals.conditionText || "Precipitation detected");
  if (flags.windy) reasons.push(`Wind at ${signals.windKph} km/h`);
  if (flags.pleasant) reasons.push("Comfortable temperature and calm wind");
  if (!reasons.length) reasons.push(signals.conditionText || "Mixed conditions");
  return reasons;
}

export function scoreFor(signals) {
  if (!isNumber(signals.tempC)) return null;

  let score = 100;
  const temp = signals.tempC;

  // Temperature comfort curve, centred on 24°C.
  score -= Math.min(34, Math.abs(temp - 24) * 1.5);
  if (temp >= 38) score -= 12;
  if (temp <= 2) score -= 12;

  score -= Math.min(18, Math.max(0, signals.windKph - 10) * 0.55);
  score -= Math.min(14, Math.max(0, signals.uv) * 1);
  score -= Math.min(9, Math.max(0, (signals.humidity ?? 50) - 55) * 0.22);
  score -= Math.min(6, Math.max(0, 35 - (signals.humidity ?? 50)) * 0.18);

  if (signals.isWet) score -= 20;
  if (signals.isMurky) score -= 5;
  if ((signals.cloud ?? 0) > 80) score -= 3;
  if (isNumber(signals.visibilityKm) && signals.visibilityKm < 2) score -= 8;

  return Math.round(clamp(score, 12, 99));
}

export function gradeFor(score) {
  if (!isNumber(score)) return { label: "—", tone: "neutral" };
  if (score >= 85) return { label: "A+", tone: "great" };
  if (score >= 75) return { label: "A", tone: "great" };
  if (score >= 65) return { label: "B", tone: "good" };
  if (score >= 52) return { label: "C", tone: "fair" };
  if (score >= 40) return { label: "D", tone: "poor" };
  return { label: "E", tone: "poor" };
}

export function ringColor(tone) {
  switch (tone) {
    case "great":
      return "#5ee8a8";
    case "good":
      return "#ffca6b";
    case "fair":
      return "#ff9f6b";
    case "poor":
      return "#ff7b8a";
    default:
      return "#8b7bff";
  }
}

/** Plain-language notes for the three primary metric cards. */
export function metricNotes(signals) {
  const humidity = signals.humidity;
  let humidityNote = "—";
  if (isNumber(humidity)) {
    if (humidity < 30) humidityNote = "Dry air";
    else if (humidity <= 60) humidityNote = "Comfortable";
    else if (humidity <= 75) humidityNote = "Humid";
    else humidityNote = "Very humid";
  }

  const uv = signals.uv ?? 0;
  const uvNote = uv >= 11 ? "Extreme" : uv >= 8 ? "Very high" : uv >= 6 ? "High" : uv >= 3 ? "Moderate" : "Low";

  const wind = signals.windKph ?? 0;
  const windLabel =
    wind < 6 ? "Calm" : wind < 20 ? "Light breeze" : wind < 39 ? "Breezy" : wind < 62 ? "Strong" : "Gale";
  const windNote = signals.windDir ? `${windLabel} · from ${signals.windDir}` : windLabel;

  return { humidityNote, uvNote, windNote };
}
