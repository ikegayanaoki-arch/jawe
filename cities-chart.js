const STORAGE_KEY = "flagged-world-map-cities";
const DISPLAY_CONFERENCE_TYPES = ["ICWE", "APCWE", "BBAA", "CWE"];
const GUIDE_YEARS = new Set(["1980", "1990", "2000", "2010", "2020"]);
const panelScaleObservers = [];

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
  fitTimelinePanels(chartRoot);
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
  const hasPhotos = hasCityPhotos(city);
  const button = document.createElement("button");
  button.type = "button";
  button.className =
    `city-card cities-chart-card type-${conferenceTypeToToken(normalizeConferenceType(city.conferenceType))}` +
    (city.isUpcoming ? " is-upcoming" : "");
  button.dataset.cityIndex = String(cityIndex);

  button.innerHTML = `
    ${hasPhotos ? '<img src="./images/logo/logo-photo.svg" alt="写真あり" class="city-card-photo-badge" />' : ""}
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

function hasCityPhotos(city) {
  if (Array.isArray(city?.photos)) {
    return city.photos.some((entry) => {
      if (typeof entry === "string") {
        return Boolean(String(entry.split("|")[0] || "").trim());
      }

      return Boolean(String(entry?.src || "").trim());
    });
  }

  return Boolean(String(city?.photo || "").trim());
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

function fitTimelinePanels(root) {
  panelScaleObservers.splice(0).forEach((observer) => observer.disconnect());

  const panels = [...root.querySelectorAll(".cities-chart-panel-body")]
    .map((body) => {
      const frame = body.querySelector(".cities-chart-scale-frame");
      const grid = body.querySelector(".cities-chart-grid");
      if (!frame || !grid) {
        return null;
      }

      return { body, frame, grid };
    })
    .filter(Boolean);

  const updateScale = () => {
    let sharedContentWidth = 0;
    let sharedScale = 1;

    panels.forEach(({ frame, body, grid }) => {
      frame.style.removeProperty("--timeline-scale");

      const availableWidth = body.clientWidth;
      const availableHeight = body.clientHeight;
      const contentWidth = grid.scrollWidth;
      const contentHeight = grid.scrollHeight;

      if (!availableWidth || !availableHeight || !contentWidth || !contentHeight) {
        return;
      }

      frame.style.height = `${contentHeight}px`;
      sharedContentWidth = Math.max(sharedContentWidth, contentWidth);
    });

    panels.forEach(({ body, grid }) => {
      const availableWidth = body.clientWidth;
      const availableHeight = body.clientHeight;
      const contentHeight = grid.scrollHeight;

      if (!sharedContentWidth || !availableWidth || !availableHeight || !contentHeight) {
        return;
      }

      sharedScale = Math.min(sharedScale, availableWidth / sharedContentWidth, availableHeight / contentHeight);
    });

    panels.forEach(({ frame }) => {
      if (sharedContentWidth) {
        frame.style.width = `${sharedContentWidth}px`;
      }
      frame.style.setProperty("--timeline-scale", String(Math.min(sharedScale, 1)));
    });
  };

  updateScale();

  panels.forEach(({ body, grid }) => {
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(updateScale);
    });
    observer.observe(body);
    observer.observe(grid);
    panelScaleObservers.push(observer);
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
          const merged = [...existing, ...entries].filter(Boolean);
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
