const STORAGE_KEY = "flagged-world-map-cities";
const DISPLAY_CONFERENCE_TYPES = ["ICWE", "APCWE", "BBAA", "CWE"];
const GUIDE_YEARS = new Set(["1980", "1990", "2000", "2010", "2020"]);
let timelineResizeObserver;
let timelineFitFrameId;

const chartRoot = document.getElementById("cities-chart-page-content");

renderChartPage().catch((error) => {
  console.error("Failed to render chart page.", error);
});

async function renderChartPage() {
  if (!chartRoot) {
    return;
  }

  const cities = await loadCities();
  const yearAxis = buildYearAxis(cities);
  const panelWrapper = document.createElement("div");
  panelWrapper.className = "cities-chart-panels";

  const leftAxis = yearAxis.filter((axisEntry) => {
    const numericYear = Number(axisEntry.year);
    return Number.isInteger(numericYear) && numericYear <= 2000;
  });
  const rightAxis = yearAxis.filter((axisEntry) => {
    const numericYear = Number(axisEntry.year);
    return !Number.isInteger(numericYear) || numericYear >= 2001;
  });

  panelWrapper.append(
    createTimelinePanel("1963-1999", leftAxis, cities),
    createTimelinePanel("2000-2028", rightAxis, cities),
  );

  chartRoot.replaceChildren(panelWrapper);
  fitCityCardsText(chartRoot);
  setupTimelineFit(chartRoot);
}

function createTimelinePanel(eyebrow, axisEntries, cities) {
  const panel = document.createElement("section");
  panel.className = "cities-chart-panel";

  const header = document.createElement("header");
  header.className = "cities-chart-panel-header";
  header.innerHTML = `<p class="eyebrow">${escapeHtml(eyebrow)}</p>`;

  const body = document.createElement("div");
  body.className = "cities-chart-panel-body";

  const scaleFrame = document.createElement("div");
  scaleFrame.className = "cities-chart-scale-frame";

  const grid = document.createElement("div");
  grid.className = "cities-chart-grid";

  grid.append(createTextCell("Year", "cities-chart-corner"));
  for (const type of DISPLAY_CONFERENCE_TYPES) {
    grid.append(createTextCell(type, "cities-chart-type"));
  }

  for (const axisEntry of axisEntries) {
    const rowClassName = axisEntry.isGap ? "cities-chart-row-gap" : "";
    const guideClassName = GUIDE_YEARS.has(axisEntry.year) ? "cities-chart-row-guide" : "";
    const stripeClassName = axisEntry.rowIndex % 2 === 0 ? "cities-chart-row-even" : "cities-chart-row-odd";

    grid.append(
      createTextCell(axisEntry.label, `cities-chart-year ${rowClassName} ${guideClassName} ${stripeClassName}`.trim()),
    );

    for (const type of DISPLAY_CONFERENCE_TYPES) {
      const cell = document.createElement("div");
      cell.className = `cities-chart-cell ${rowClassName} ${guideClassName} ${stripeClassName}`.trim();

      const items = axisEntry.isGap
        ? []
        : cities.filter(
            (city) =>
              normalizeYear(city.eventDate) === axisEntry.year && normalizeConferenceType(city.conferenceType) === type,
          );

      for (const city of items) {
        cell.append(createCityCard(city, cities.indexOf(city)));
      }

      grid.append(cell);
    }
  }

  scaleFrame.append(grid);
  body.append(scaleFrame);
  panel.append(header, body);
  return panel;
}

function createTextCell(text, className) {
  const element = document.createElement("div");
  element.className = className;
  element.textContent = text;
  return element;
}

function createCityCard(city, cityIndex) {
  const photoCount = getCityPhotoCount(city);
  const button = document.createElement("button");
  button.type = "button";
  button.className =
    `city-card cities-chart-card type-${conferenceTypeToToken(normalizeConferenceType(city.conferenceType))}` +
    (city.isUpcoming ? " is-upcoming" : "");
  button.dataset.cityIndex = String(cityIndex);

  button.innerHTML = `
    ${
      photoCount > 0
        ? `<span class="cities-chart-photo-meta" aria-label="登録写真 ${photoCount}枚"><img src="./images/logo/logo-photo.svg" alt="" class="city-card-photo-badge" /><span>${photoCount}</span></span>`
        : ""
    }
    <span class="comment">${escapeHtml(city.comment || "")}</span>
    <span class="city-card-header">
      <span class="city-card-title">
        <span class="flag">${escapeHtml(city.flag || "")}</span>
        <span>${escapeHtml(city.name || "")}</span>
      </span>
    </span>
  `;
  button.addEventListener("click", () => {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(
        {
          type: "select-city-from-timeline",
          index: cityIndex,
        },
        "*",
      );
      window.opener.focus?.();
    }
  });

  return button;
}

function getCityPhotoCount(city) {
  if (Array.isArray(city?.photos)) {
    const count = city.photos.filter((entry) => {
      if (typeof entry === "string") {
        return Boolean(String(entry.split("|")[0] || "").trim());
      }

      return Boolean(String(entry?.src || entry?.publicSrc || entry?.originalSrc || "").trim());
    }).length;

    if (count > 0) {
      return count;
    }
  }

  return String(city?.photo || "").trim() ? 1 : 0;
}

function fitCityCardsText(root) {
  root.querySelectorAll(".city-card").forEach((card) => {
    card.style.removeProperty("--card-comment-size");
    card.style.removeProperty("--card-title-size");

    const title = card.querySelector(".city-card-title");
    if (!title) {
      return;
    }

    const sizeSteps = [
      { title: "2.25rem", comment: "2.4rem" },
      { title: "2.13rem", comment: "2.28rem" },
      { title: "2.01rem", comment: "2.16rem" },
      { title: "1.875rem", comment: "2.025rem" },
    ];

    for (const step of sizeSteps) {
      card.style.setProperty("--card-title-size", step.title);
      card.style.setProperty("--card-comment-size", step.comment);

      if (title.scrollWidth <= title.clientWidth) {
        break;
      }
    }

    card.dataset.baseTitleSize = String(parseFloat(card.style.getPropertyValue("--card-title-size")) || 1.875);
    card.dataset.baseCommentSize = String(parseFloat(card.style.getPropertyValue("--card-comment-size")) || 2.025);
  });
}

function setupTimelineFit(root) {
  timelineResizeObserver?.disconnect();

  const scheduleFit = () => {
    window.cancelAnimationFrame(timelineFitFrameId);
    timelineFitFrameId = window.requestAnimationFrame(() => fitTimelineToViewport(root));
  };

  timelineResizeObserver = new ResizeObserver(scheduleFit);
  timelineResizeObserver.observe(root);
  scheduleFit();
  document.fonts?.ready.then(scheduleFit);
}

function fitTimelineToViewport(root) {
  const panelBodies = [...root.querySelectorAll(".cities-chart-panel-body")];
  if (panelBodies.length === 0) {
    return;
  }

  const fits = () => panelBodies.every((body) => body.scrollHeight <= body.clientHeight + 1);
  applyTimelineFontScale(root, 1);
  if (fits()) {
    return;
  }

  let minimumScale = 0.2;
  let maximumScale = 1;
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const candidateScale = (minimumScale + maximumScale) / 2;
    applyTimelineFontScale(root, candidateScale);
    if (fits()) {
      minimumScale = candidateScale;
    } else {
      maximumScale = candidateScale;
    }
  }

  applyTimelineFontScale(root, minimumScale);
}

function applyTimelineFontScale(root, scale) {
  root.style.setProperty("--timeline-type-size", `${2.4 * scale}rem`);
  root.style.setProperty("--timeline-year-size", `${2.4 * scale}rem`);
  root.style.setProperty("--timeline-range-size", `${2.4 * scale}rem`);
  root.style.setProperty("--timeline-card-min-height", `${40 * scale}px`);
  root.style.setProperty("--timeline-card-padding-y", `${3 * scale}px`);
  root.style.setProperty("--timeline-card-padding-x", `${5 * scale}px`);
  root.style.setProperty("--timeline-photo-count-size", `${3.2 * scale}rem`);
  root.style.setProperty("--timeline-photo-icon-size", `${24 * scale}px`);
  root.style.setProperty("--timeline-flag-size", `${0.95 * scale}rem`);

  root.querySelectorAll(".cities-chart-card").forEach((card) => {
    const baseTitleSize = Number(card.dataset.baseTitleSize) || 1.875;
    const baseCommentSize = Number(card.dataset.baseCommentSize) || 2.025;
    card.style.setProperty("--card-title-size", `${baseTitleSize * scale}rem`);
    card.style.setProperty("--card-comment-size", `${baseCommentSize * scale}rem`);
  });
}

async function loadCities() {
  let cities = [];

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        cities = parsed;
      }
    }
  } catch (error) {
    console.error("Failed to load saved city data.", error);
  }

  if (cities.length === 0) {
    cities = Array.isArray(window.__INITIAL_CITIES__) ? window.__INITIAL_CITIES__ : [];
  }

  try {
    const response = await fetch("./api/uploads", { headers: { Accept: "application/json" } });
    if (response.ok) {
      const payload = await response.json();
      if (payload && typeof payload === "object" && payload.cities) {
        Object.entries(payload.cities).forEach(([indexKey, entries]) => {
          const cityIndex = Number(indexKey);
          if (!Number.isInteger(cityIndex) || cityIndex < 0 || cityIndex >= cities.length || !Array.isArray(entries)) {
            return;
          }

          const existing = Array.isArray(cities[cityIndex].photos) ? cities[cityIndex].photos : [];
          const preservedExisting = existing.filter((entry) => {
            const src = typeof entry === "string" ? String(entry.split("|")[0] || "").trim() : String(entry?.src || "").trim();
            return src && !src.startsWith("./data/uploaded/public/") && !src.startsWith("./data/uploaded/original/");
          });
          const merged = [...preservedExisting, ...entries].filter(Boolean);
          const seen = new Set();
          cities[cityIndex].photos = merged.filter((entry) => {
            const src = typeof entry === "string" ? String(entry.split("|")[0] || "").trim() : String(entry?.src || "").trim();
            if (!src || seen.has(src)) {
              return false;
            }
            seen.add(src);
            return true;
          });
        });
      }
    }
  } catch (error) {
    console.error("Failed to load shared uploaded photos for timeline.", error);
  }

  return cities;
}

function normalizeConferenceType(conferenceType) {
  const normalized = String(conferenceType || "").trim();
  if (DISPLAY_CONFERENCE_TYPES.includes(normalized)) {
    return normalized;
  }

  return "";
}

function normalizeYear(eventDate) {
  return String(eventDate || "未設定").trim() || "未設定";
}

function buildYearAxis(cities) {
  const normalizedYears = [...new Set(cities.map((city) => normalizeYear(city.eventDate)))];
  const numericYears = normalizedYears
    .map((year) => Number(year))
    .filter((year) => Number.isInteger(year));

  const axis = [];

  if (numericYears.length > 0) {
    const startYear = Math.min(...numericYears);
    const endYear = Math.max(...numericYears);
    const earlyYears = [...new Set(numericYears.filter((year) => year <= 1983))].sort((a, b) => a - b);

    for (let index = 0; index < earlyYears.length; index += 1) {
      const year = earlyYears[index];
        axis.push({ year: String(year), label: String(year), isGap: false });

      const nextYear = earlyYears[index + 1];
      if (nextYear && nextYear - year > 1) {
        axis.push({ year: "", label: "...", isGap: true });
      }
    }

    for (let year = Math.max(1984, startYear); year <= endYear; year += 1) {
      axis.push({ year: String(year), label: String(year), isGap: false });
    }
  }

  const nonNumericYears = normalizedYears
    .filter((year) => !Number.isInteger(Number(year)))
    .sort((left, right) => left.localeCompare(right, "ja"));

  return [
    ...axis,
    ...nonNumericYears.map((year) => ({ year, label: year, isGap: false })),
  ].map((entry, index) => ({ ...entry, rowIndex: index }));
}

function conferenceTypeToToken(conferenceType) {
  return String(conferenceType || "other")
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "other";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
