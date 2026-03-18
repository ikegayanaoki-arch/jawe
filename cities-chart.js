const STORAGE_KEY = "flagged-world-map-cities";
const DISPLAY_CONFERENCE_TYPES = ["ICWE", "APCWE", "BBAA", "CWE"];
const GUIDE_YEARS = new Set(["1980", "1990", "2000", "2010", "2020"]);

const chartRoot = document.getElementById("cities-chart-page-content");

renderChartPage();

function renderChartPage() {
  if (!chartRoot) {
    return;
  }

  const cities = loadCities();
  const yearAxis = buildYearAxis(cities);

  const grid = document.createElement("div");
  grid.className = "cities-chart-grid";

  grid.append(createTextCell("Year", "cities-chart-corner"));
  for (const type of DISPLAY_CONFERENCE_TYPES) {
    grid.append(createTextCell(type, "cities-chart-type"));
  }

  for (const axisEntry of yearAxis) {
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
        cell.append(createCityCard(city));
      }

      grid.append(cell);
    }
  }

  chartRoot.replaceChildren(grid);
  fitCityCardsText(chartRoot);
}

function createTextCell(text, className) {
  const element = document.createElement("div");
  element.className = className;
  element.textContent = text;
  return element;
}

function createCityCard(city) {
  const article = document.createElement("article");
  article.className =
    `city-card cities-chart-card type-${conferenceTypeToToken(normalizeConferenceType(city.conferenceType))}` +
    (city.isUpcoming ? " is-upcoming" : "");

  article.innerHTML = `
    <span class="comment">${escapeHtml(city.comment || "")}</span>
    <span class="city-card-header">
      <span class="city-card-title">
        <span class="flag">${escapeHtml(city.flag || "")}</span>
        <span>${escapeHtml(city.name || "")}</span>
      </span>
    </span>
  `;

  return article;
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
      { title: "0.72rem", comment: "0.82rem" },
      { title: "0.68rem", comment: "0.78rem" },
      { title: "0.64rem", comment: "0.74rem" },
      { title: "0.6rem", comment: "0.7rem" },
    ];

    for (const step of sizeSteps) {
      card.style.setProperty("--card-title-size", step.title);
      card.style.setProperty("--card-comment-size", step.comment);

      if (title.scrollWidth <= title.clientWidth) {
        break;
      }
    }
  });
}

function loadCities() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (error) {
    console.error("Failed to load saved city data.", error);
  }

  return Array.isArray(window.__INITIAL_CITIES__) ? window.__INITIAL_CITIES__ : [];
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
