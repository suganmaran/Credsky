# SKY CRED

**Check the sky's credit score before you step out.**

SKY CRED is a lightweight weather app that turns live weather into a simple, actionable reading. Search any city, see the current conditions, and get a plain-English verdict on whether it is a good time to go outside.

Built with HTML, CSS and vanilla JavaScript. No frameworks, no build step, no mock data — every value in the UI comes from the live WeatherAPI response.

---

## Contents

- [How it works](#how-it-works)
- [Project structure](#project-structure)
- [Run locally](#run-locally)
- [Deploy](#deploy)
- [Weather interpretation logic](#weather-interpretation-logic)
- [API dependency](#api-dependency)
- [Error handling](#error-handling)
- [Requirement checklist](#requirement-checklist)
- [Known limitations](#known-limitations)

---

## How it works

```
Browser (HTML/CSS/JS)
        │  GET /api/weather?q=Mumbai, India
        ▼
Vercel function (api/weather.js)  ── injects WEATHER_API_KEY ──▶  api.weatherapi.com/v1/current.json
        │  passes the WeatherAPI response through untouched
        ▼
UI renders weather card + "sky cred" reading + JSON viewer
```

- The API key is read from `WEATHER_API_KEY` (`.env` locally, Vercel Environment Variable in production).
- A single serverless proxy function keeps the key off the client. The frontend itself is plain static HTML/CSS/JS.
- `js/config.js` also supports a direct-from-browser fallback (`apiKey`) for static hosting without functions. Leave it empty in the normal setup.

### Application states

| State | Behaviour |
| --- | --- |
| First load | Mumbai is pre-filled, skeleton + button spinner show immediately, then the card renders |
| Refreshing | Previous reading stays visible, dimmed, with an "Updating" badge (never a blank card) |
| Success | All fields, metrics, verdict, timestamp and JSON viewer update together |
| Validation error | Inline message, no API request is made |
| API error | Banner with a specific message + Retry where it can help; last valid reading is preserved |
| First-load error | Intentional empty state with the reason and a Retry action — never a blank weather card |

---

## Project structure

```
index.html            Markup, icon sprite, all UI regions
css/styles.css        Design system, layout, responsive rules, states
js/config.js          API settings, popular cities, query aliases
js/api.js             Transport, timeouts, WeatherAPI error → product error mapping
js/personality.js     "Sky cred" thresholds, priority order, score, metric notes
js/ui.js              DOM rendering, JSON viewer, clipboard, local-time clock
js/app.js             State machine: search, loading, success, error, retry
api/weather.js        Serverless proxy that adds the API key
.env.example          Template for WEATHER_API_KEY
```

---

## Run locally

The app needs the `/api/weather` function, so use the Vercel CLI (it serves static files **and** the function, and loads `.env`):

```bash
npm i -g vercel
cp .env.example .env     # then put your WeatherAPI key inside
vercel dev
```

Open the printed local URL (usually <http://localhost:3000>).

A plain static server (`python -m http.server`, VS Code Live Server, …) will serve the UI but `/api/weather` will 404. For that case, set `apiKey` in `js/config.js` — the app then calls WeatherAPI directly (the key is exposed in the browser, which is why it is not the default).

---

## Deploy

```bash
vercel --prod
```

Then add the environment variable for Production, Preview and Development:

```bash
vercel env add WEATHER_API_KEY
```

No build command, no output directory, no framework preset is required — Vercel serves the static files and treats `api/weather.js` as a Node function.

---

## Weather interpretation logic

Thresholds are explicit and evaluated in a fixed priority order, so overlapping conditions always resolve the same way.

| Priority | Scenario title | Rule | Recommendation |
| --- | --- | --- | --- |
| 1 | **Freeze Frame** | `tempC <= 8` | Bone-chilling cold. Bundle up tight. |
| 2 | **Sun Alert** | `tempC >= 35` | Stay hydrated and avoid excessive sun exposure. |
| 3 | **Rain Check** | condition matches rain / drizzle / shower / storm / thunder / snow / sleet / hail / ice, or `precip_mm > 0` | Carry an umbrella before stepping out. |
| 4 | **Breezy Mode** | `wind_kph >= 30` | Expect strong winds. Dress accordingly. |
| 5 | **Perfect Day** | `16 <= tempC <= 33`, `wind_kph < 30`, dry, no fog/mist/dust | Great weather to step outside. |
| 6 | **Cloud Nine** | fallback | Context-aware mild-weather message (cool, warm, hazy or low visibility) |

The 0–100 "sky cred" score is generated in the browser from temperature, wind, UV, humidity, cloud cover and visibility, then capped per scenario so the number never contradicts the verdict (for example, a rainy day can never grade A). It is a playful interpretation, not a real credit score and not official meteorological advice.

Metric notes (humidity comfort, UV band, wind strength + direction) are derived from the same thresholds in `js/personality.js`.

---

## API dependency

| Item | Value |
| --- | --- |
| Provider | [WeatherAPI.com](https://www.weatherapi.com/) |
| Endpoint | `GET https://api.weatherapi.com/v1/current.json` |
| Proxy route | `GET /api/weather?q={city}` |
| Query params | `key` (server-side only), `q`, `aqi=no` |

Fields consumed: `location.name`, `location.region`, `location.country`, `location.tz_id`, `location.localtime_epoch`, `current.temp_c`, `current.temp_f`, `current.feelslike_c`, `current.condition.text`, `current.condition.icon`, `current.wind_kph`, `current.wind_dir`, `current.humidity`, `current.uv`, `current.cloud`, `current.vis_km`, `current.pressure_mb`, `current.precip_mm`, `current.last_updated_epoch`.

---

## Error handling

Every failure is normalised in `js/api.js` and rendered with a specific title and message.

| Scenario | Message shown | Retry |
| --- | --- | --- |
| Empty input | "Enter a city name to check its sky cred." (inline, no request) | — |
| City not found (`1006`) | "City not found" | No |
| Invalid / missing key (`2006`, `2008`, `1002`, `1004`, `1005`, `1010`, `401`, `403`) | "API configuration error" | No |
| Rate limit / quota (`2007`, `2009`, `2010`, `429`) | "Temporarily unavailable" | Yes |
| Offline / transport failure | "No internet connection" | Yes |
| Request timeout (14 s) | "Request timed out" | Yes |
| 5xx / proxy failure | "Service unavailable" | Yes |
| Unreadable payload | "Unexpected response" | Yes |
| Anything else | "Something went wrong" | Yes |

Stale responses are discarded: each search increments a request id and aborts the previous request, so an older response can never overwrite a newer one.

---

## Requirement checklist

Status legend: **Implemented + tested** (verified in a real browser against the live API), **Implemented** (wired, not exercised end-to-end), **Not implemented**.

### FR-01 — Application initialization

| ID | Requirement | Status | Verification |
| --- | --- | --- | --- |
| FR-01.1 | Mumbai is the default city | Implemented + tested | Input is `Mumbai` on load; request is `Mumbai, India` |
| FR-01.2 | Fetch Mumbai on load | Implemented + tested | Live API call on first paint, no interaction needed |
| FR-01.3 | Initial loading indicator | Implemented + tested | Skeleton + spinner + `aria-busy=true` captured while a 3 s delayed response was in flight |
| FR-01.4 | Render card on success | Implemented + tested | Card, metrics and JSON appear after the response |
| FR-01.5 | Render error state on failure | Implemented + tested | Invalid-key server produced the empty state with the API configuration message |

**Acceptance:** automatic Mumbai request ✅ · input shows Mumbai ✅ · populated from the response ✅ · no hardcoded weather values ✅

### FR-02 — City search

| ID | Requirement | Status | Verification |
| --- | --- | --- | --- |
| FR-02.1 | City input | Implemented + tested | Typed `Delhi`, `Oslo`, `Pune`, invalid strings |
| FR-02.2 | Search button | Implemented + tested | Button submits the form |
| FR-02.3 | Enter triggers search | Implemented + tested | Verified with keyboard Enter in the input |
| FR-02.4 | Empty input makes no request | Implemented + tested | Inline error shown; API request count unchanged |
| FR-02.5 | Fetch entered city | Implemented + tested | Delhi → Delhi, India; Oslo, Pune, Bengaluru all returned live data |
| FR-02.6 | Update the card | Implemented + tested | City, temperature, condition, metrics, verdict and JSON all change |
| FR-02.7 | Search failure message | Implemented + tested | "City not found" banner for an unmatchable query |

**Acceptance:** Delhi/London resolution ✅ (bare `Delhi` is mapped to `Delhi, India` because WeatherAPI otherwise returns Delhi, Ontario) · input retains the searched name ✅ · previous data cannot be mistaken for the new result (old data stays only with an explicit error banner) ✅ · repeated searches without reload ✅

### FR-03 — Popular cities

| ID | Requirement | Status | Verification |
| --- | --- | --- | --- |
| FR-03.1 | Clickable chips for the 10 cities | Implemented + tested | Mumbai, Delhi, Bengaluru, Hyderabad, Chennai, Kolkata, Pune, Ahmedabad, New York, London |
| FR-03.2 | Click triggers a request | Implemented + tested | Bengaluru chip fetched Bengaluru |
| FR-03.3 | Input syncs with selection | Implemented + tested | Input updated to the chip label |
| FR-03.4 | Highlight the selected city | Implemented + tested | Only one `aria-pressed="true"` chip at a time |
| FR-03.5 | All weather data updates | Implemented + tested | Metrics, details and JSON changed with the city |

**Acceptance:** Bengaluru loads ✅ · selected chip highlighted ✅ · previous chip cleared ✅ · every component updates ✅

### FR-04 — Current weather information

| ID | Requirement | Status | Verification |
| --- | --- | --- | --- |
| Temperature in °C | Implemented + tested | `31.1` for Mumbai, `26.2` for Bengaluru (matches API) |
| Wind in km/h | Implemented + tested | `6.8 km/h` for Bengaluru |
| Icon matches condition | Implemented + tested | 128 px WeatherAPI icon; `naturalWidth > 0` confirmed |
| Local time in city timezone | Implemented + tested | Intl clock per `tz_id`, e.g. `3:33 PM local`; ticks every 15 s |
| All values dynamic | Implemented + tested | Nothing hardcoded; Fahrenheit, cloud, visibility, pressure, updated time all from the payload |

### FR-05 — Weather interpretation

| ID | Requirement | Status | Verification |
| --- | --- | --- | --- |
| Dynamic personality | Implemented + tested | Mumbai → Perfect Day (82/A) |
| Uses temperature, condition and wind | Implemented + tested | See thresholds table |
| Title + description shown | Implemented + tested | Rendered in the cred panel |
| Updates on new city | Implemented + tested | Freeze Frame appeared for 3.2 °C, Perfect Day for 26.2 °C |
| Defined thresholds | Implemented + tested | Constants in `js/personality.js` |
| Priority for overlaps | Implemented + tested | 2 °C + rain + 60 km/h → Freeze Frame; 38 °C + rain → Sun Alert; 24 °C + rain + 50 km/h → Rain Check |
| “Not a real credit score” note | Implemented + tested | Visible under the score |

### FR-06 — Additional metrics

| Requirement | Status | Verification |
| --- | --- | --- |
| Humidity (%) | Implemented + tested | `current.humidity` |
| Wind (km/h) | Implemented + tested | `current.wind_kph` |
| UV index | Implemented + tested | `current.uv` |
| Cloud coverage | Implemented + tested | `current.cloud` |
| Visibility | Implemented + tested | `current.vis_km` |
| Atmospheric pressure | Implemented + tested | `current.pressure_mb` |
| Wind speed (secondary) | Implemented + tested | `current.wind_kph` + direction |
| Fahrenheit | Implemented + tested | `current.temp_f` |
| Last updated | Implemented + tested | `last_updated_epoch` in the city timezone + relative age |
| Updates on every search | Implemented + tested | All six detail tiles and three metric cards re-render |

### FR-07 — API response viewer

| ID | Requirement | Status | Verification |
| --- | --- | --- | --- |
| FR-07.1 | Formatted JSON | Implemented + tested | 2-space indentation + syntax colours |
| FR-07.2 | Raw JSON | Implemented + tested | Exact response text, 948 chars, unmodified |
| FR-07.3 | Tab switching | Implemented + tested | `aria-selected`, `aria-labelledby`, arrow-key support |
| FR-07.4 | Copy current view | Implemented + tested | Clipboard write verified for both views |
| FR-07.5 | Updates after every request | Implemented + tested | Meta line shows city, HTTP status, size, received time |
| FR-07.6 | Scroll for large responses | Implemented + tested | Container scrolls (`scrollHeight > clientHeight`), page does not overflow |

**Acceptance:** real payload ✅ · indented formatted view ✅ · raw preserved byte-for-byte ✅ · copy matches the active tab ✅

### FR-08 — Error and exception handling

| Scenario | Status | Verification |
| --- | --- | --- |
| Empty city input | Implemented + tested | Inline validation, no request |
| Invalid city | Implemented + tested | `zzzqqqxxxx` → City not found |
| Invalid API key | Implemented + tested | Forced `2006` → API configuration error |
| Rate limit | Implemented + tested | Forced `2007`/429 → Temporarily unavailable |
| No internet | Implemented + tested | Forced `TypeError` → No internet connection |
| Server unavailable | Implemented + tested | Forced 502 HTML → Service unavailable |
| Slow response | Implemented + tested | 3 s delayed server → spinner, skeleton, `aria-busy` |
| Unexpected response | Implemented + tested | Forced non-weather JSON → Unexpected response |
| No blank weather card | Implemented + tested | First-load failure shows the empty state; later failures keep the last reading |
| Valid data not replaced by bad data | Implemented + tested | Error cases kept the previous city on screen |
| Retry action | Implemented + tested | Retry after timeout loaded the city successfully |
| Outdated responses cannot win | Implemented + tested | Slow London response never replaced the newer Pune result |

### FR-09 — Responsive behaviour

| Requirement | Status | Verification |
| --- | --- | --- |
| Desktop: centered, max width | Implemented + tested | 1080 px shell, centered |
| Laptop/tablet: consistent layout | Implemented + tested | Hero stacks at ≤940 px; metrics reflow at ≤760 px |
| Mobile: stacked metrics, stacked search | Implemented + tested | Single-column metrics and search at ≤560 px |
| No horizontal overflow | Implemented + tested | `scrollWidth === clientWidth` at 1280, 1024, 940, 900, 768, 600, 560, 430, 375 and 320 px |

### FR-10 — WeatherAPI integration

| Requirement | Status | Verification |
| --- | --- | --- |
| WeatherAPI `/v1/current.json`, GET, JSON | Implemented + tested | Live 200 responses |
| Key from `.env`, never in the client | Implemented + tested | Proxy injects `WEATHER_API_KEY`; no key in any JS/CSS/HTML file |
| `key` + `q` query params | Implemented + tested | Proxy builds the request |
| Parse and populate UI | Implemented + tested | All fields mapped |
| Fetch on every search | Implemented + tested | Multiple sequential searches |
| Handle API/network failures | Implemented + tested | See FR-08 |

### Non-functional requirements

| Category | Status | Notes |
| --- | --- | --- |
| Performance | Implemented + tested | No framework, no build step, two font requests, one API request per search |
| Immediate loading feedback | Implemented + tested | Spinner + `aria-busy` set synchronously before the request |
| Reliability | Implemented + tested | Timeouts, abort handling, stale-response guard, Retry |
| Security | Implemented | Key stays server-side; frontend treats API access as public (no false claims of secret storage) |
| Maintainability | Implemented | HTML / CSS / JS separated; config, transport, interpretation, rendering and flow in their own modules |
| Compatibility | Implemented | Modern Chrome, Safari, Firefox, Edge (ES modules, `fetch`, `Intl`) |
| Accessibility | Implemented + tested | Lighthouse accessibility 100; labelled controls, `aria-live` announcements, `aria-pressed`, focus styles, `prefers-reduced-motion` |
| Responsiveness | Implemented + tested | 320 px → 1280 px verified |
| Scalability | Implemented | Pure functions for interpretation; UI rendering isolated from data flow |

Lighthouse (local production build): Accessibility **100**, Best Practices **100**, SEO **100**.

---

## Known limitations

- **Popular-city aliases.** WeatherAPI resolves a bare `Delhi` to Delhi, Ontario (Canada), so the 10 popular names are mapped to `City, Country` queries. Free-text searches are passed through unchanged.
- **Static hosting.** The secure setup needs the `/api/weather` function. Without it the UI loads but the weather request fails with "Service unavailable" unless a client key is set in `js/config.js`.
- **No auto-refresh.** Data updates on load, search, chip selection or Retry. Live polling is out of scope.
- **Score is illustrative.** The 0–100 sky cred is a product construct, not an official index.
- **Out of scope per PRD:** accounts, database, profiles, history, forecast, notifications, payments, admin, other backend services.

---

Weather data by [WeatherAPI.com](https://www.weatherapi.com/). SKY CRED is an application-generated interpretation — not a real credit score.
