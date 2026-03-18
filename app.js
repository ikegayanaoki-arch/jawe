const STORAGE_KEY = "flagged-world-map-cities";
const GEOCODE_ENDPOINT = "https://nominatim.openstreetmap.org/search";
const DIRECTORY_DB_NAME = "flagged-world-map-directory";
const DIRECTORY_STORE_NAME = "handles";
const DIRECTORY_HANDLE_KEY = "project-directory";
const CONFERENCE_TYPES = ["ICWE", "CWE", "APCWE", "BBAA", "その他"];
const DEFAULT_FLAG = "🏳️";
const DEFAULT_COORDINATES = [0, 0];
const DEFAULT_ZOOM_FACTOR = 1.728;
const AUTO_CITY_ADVANCE_MS = 6000;
const AUTO_CITY_RESUME_DELAY_MS = 7000;

const cities = [
  {
    name: "Tokyo",
    country: "Japan",
    flag: "🇯🇵",
    comment: "第1回CWE96",
    eventDate: "1996",
    organizer: "世界風工学会",
    conferenceType: "CWE",
    coordinates: [139.6917, 35.6895],
    labelOffset: [28, -58],
  },
];

const mapElement = document.getElementById("map");
const cityListElement = document.getElementById("city-list");
const cityEditorElement = document.getElementById("city-editor");
const photoCarouselElement = document.getElementById("photo-carousel");
const photoGridElement = document.getElementById("photo-grid");
const conferencePhotoTrack = document.getElementById("conference-photo-track");
const conferencePhotoCaption = document.getElementById("conference-photo-caption");
const conferencePhotoPrevButton = document.getElementById("conference-photo-prev");
const conferencePhotoNextButton = document.getElementById("conference-photo-next");
const photoViewCarouselButton = document.getElementById("photo-view-carousel");
const photoViewGridButton = document.getElementById("photo-view-grid");
const hostingCitiesChartButton = document.getElementById("hosting-cities-chart-button");
const toggleCityEditorButton = document.getElementById("toggle-city-editor");
const zoomInButton = document.getElementById("zoom-in-button");
const zoomOutButton = document.getElementById("zoom-out-button");
const zoomResetButton = document.getElementById("zoom-reset-button");
const cityAutoPlayToggleButton = document.getElementById("city-autoplay-toggle");
const sortButtons = document.querySelectorAll("[data-sort-key]");
const conferenceFilterButtons = document.querySelectorAll("[data-conference-filter]");

let activeCityIndex = 0;
let worldDataPromise;
let mapState;
let currentSortKey = "eventDate";
let currentConferenceFilter = "all";
let currentZoomFactor = DEFAULT_ZOOM_FACTOR;
let isCityEditorVisible = false;
let currentPhotoIndex = 0;
let photoCarouselTimerId = null;
let currentPhotoViewMode = "grid";
let cityAutoPlayTimerId = null;
let cityAutoPlayResumeTimerId = null;
let isCityAutoPlayEnabled = false;

bootstrapApp();

zoomInButton.addEventListener("click", () => {
  updateZoom(1.2);
});

zoomOutButton.addEventListener("click", () => {
  updateZoom(1 / 1.2);
});

zoomResetButton.addEventListener("click", () => {
  currentZoomFactor = DEFAULT_ZOOM_FACTOR;
  redrawMap();
});

toggleCityEditorButton.addEventListener("click", () => {
  setCityEditorVisibility(!isCityEditorVisible);
});

conferencePhotoPrevButton?.addEventListener("click", () => {
  moveConferencePhoto(-1, { restartTimer: true });
});

conferencePhotoNextButton?.addEventListener("click", () => {
  moveConferencePhoto(1, { restartTimer: true });
});

photoViewCarouselButton?.addEventListener("click", () => {
  setPhotoViewMode("carousel");
});

photoViewGridButton?.addEventListener("click", () => {
  setPhotoViewMode("grid");
});

hostingCitiesChartButton?.addEventListener("click", () => {
  window.open("./cities-chart.html", "_blank", "noopener");
});

cityAutoPlayToggleButton?.addEventListener("click", () => {
  if (isCityAutoPlayEnabled) {
    stopCityAutoPlay();
    return;
  }

  isCityAutoPlayEnabled = true;
  startCityAutoPlay();
});

window.addEventListener(
  "resize",
  debounce(() => {
    initializeMap().catch((error) => {
      console.error("Failed to reinitialize map.", error);
    });
  }, 120),
);

function renderCityList(items, selectedIndex) {
  cityListElement.innerHTML = getSortedEntries(getVisibleCityEntries(items))
    .map(
      ({ city, index }) => `
        <button
          type="button"
          class="city-card type-${conferenceTypeToToken(normalizeConferenceType(city.conferenceType))}${city.isUpcoming ? " is-upcoming" : ""}${index === selectedIndex ? " is-active" : ""}"
          data-city-index="${index}"
          data-conference-type="${escapeHtml(normalizeConferenceType(city.conferenceType))}"
          aria-pressed="${index === selectedIndex}"
        >
          <span class="comment">${city.comment}</span>
          <span class="city-card-header">
            <span class="city-card-title">
              <span class="flag">${city.flag}</span>
              <span>${city.name}${city.eventDate ? ` ${city.eventDate}` : ""}</span>
            </span>
            <span class="country">${city.country}</span>
          </span>
	      </button>
	    `,
    )
    .join("");

  cityListElement.querySelectorAll("[data-city-index]").forEach((button) => {
    button.addEventListener("click", () => {
      selectCity(Number(button.dataset.cityIndex), { pauseAutoPlay: true });
    });
  });

  fitCityCardsText(cityListElement);
  syncSortActions();
}

function fitCityCardsText(root = cityListElement) {
  root.querySelectorAll(".city-card").forEach((card) => {
    card.style.removeProperty("--card-comment-size");
    card.style.removeProperty("--card-title-size");
    card.style.removeProperty("--card-country-size");

    const title = card.querySelector(".city-card-title");
    const country = card.querySelector(".country");
    if (!title || !country) {
      return;
    }

    const sizeSteps = [
      { title: "0.78rem", comment: "0.92rem", country: "0.78rem" },
      { title: "0.74rem", comment: "0.86rem", country: "0.74rem" },
      { title: "0.7rem", comment: "0.8rem", country: "0.7rem" },
      { title: "0.68rem", comment: "0.76rem", country: "0.68rem" },
    ];

    for (const step of sizeSteps) {
      card.style.setProperty("--card-title-size", step.title);
      card.style.setProperty("--card-comment-size", step.comment);
      card.style.setProperty("--card-country-size", step.country);

      if (title.scrollWidth <= title.clientWidth && country.scrollWidth <= country.clientWidth) {
        break;
      }
    }
  });
}

function renderCityEditor(city) {
  cityEditorElement.innerHTML = `
    <div class="editor-header">
      <div>
        <p class="editor-title">選択中の都市を編集</p>
        <p class="editor-subtitle">変更は開催都市リストと地図ラベルへ即時反映されます。</p>
      </div>
      <div class="editor-header-actions">
        <button type="button" id="add-city-button" class="sidebar-button">追加</button>
        <button type="button" id="delete-city-button" class="sidebar-button sidebar-button-danger">削除</button>
      </div>
    </div>
    <label class="editor-field">
      <span class="editor-label">会議名</span>
      <input name="comment" type="text" value="${escapeHtml(city.comment)}" />
    </label>
    <div class="editor-grid">
      <label class="editor-field">
        <span class="editor-label">都市名</span>
        <input name="name" type="text" value="${escapeHtml(city.name)}" />
      </label>
      <label class="editor-field">
        <span class="editor-label">国名</span>
        <input name="country" type="text" value="${escapeHtml(city.country)}" />
      </label>
    </div>
    <div class="editor-grid editor-grid-compact">
      <label class="editor-field">
        <span class="editor-label">旗</span>
        <input name="flag" type="text" value="${escapeHtml(city.flag)}" />
      </label>
      <label class="editor-field">
        <span class="editor-label">開催年</span>
        <input name="eventDate" type="text" value="${escapeHtml(city.eventDate || "")}" />
      </label>
    </div>
    <label class="editor-field">
      <span class="editor-label">主催</span>
      <input name="organizer" type="text" value="${escapeHtml(city.organizer || "")}" />
    </label>
    <div class="editor-photo-grid">
      <label class="editor-field">
        <span class="editor-label">写真パス</span>
        <textarea name="photos" rows="4" placeholder="./images/example-1.jpg&#10;./images/example-2.jpg">${escapeHtml(
          serializeCityPhotoPaths(city),
        )}</textarea>
      </label>
      <label class="editor-field">
        <span class="editor-label">写真タイトル</span>
        <textarea name="photoTitles" rows="4" placeholder="会場外観&#10;会場内">${escapeHtml(
          serializeCityPhotoTitles(city),
        )}</textarea>
      </label>
      <label class="editor-field">
        <span class="editor-label">写真提供者</span>
        <textarea name="photoCredits" rows="4" placeholder="山田太郎&#10;佐藤花子">${escapeHtml(
          serializeCityPhotoCredits(city),
        )}</textarea>
      </label>
    </div>
    <label class="editor-check">
      <input name="isUpcoming" type="checkbox"${city.isUpcoming ? " checked" : ""} />
      <span class="editor-check-label">開催前</span>
    </label>
    <label class="editor-field">
      <span class="editor-label">会議種類</span>
      <select name="conferenceType">
        ${CONFERENCE_TYPES.map(
          (type) => `
            <option value="${escapeHtml(type)}"${normalizeConferenceType(city.conferenceType) === type ? " selected" : ""}>${type}</option>
          `,
        ).join("")}
      </select>
    </label>
    <div class="editor-grid">
      <label class="editor-field">
        <span class="editor-label">緯度</span>
        <input name="latitude" type="text" value="${escapeHtml(formatCoordinate(city.coordinates[1]))}" readonly />
      </label>
      <label class="editor-field">
        <span class="editor-label">経度</span>
        <input name="longitude" type="text" value="${escapeHtml(formatCoordinate(city.coordinates[0]))}" readonly />
      </label>
    </div>
    <div class="editor-actions">
      <button type="button" id="geocode-city-data" class="secondary-button">登録</button>
      <button type="button" id="save-city-data" class="save-button">ファイル保存</button>
      <span id="save-status" class="save-status" aria-live="polite"></span>
    </div>
  `;

  cityEditorElement.querySelectorAll("input, select, textarea").forEach((field) => {
    field.addEventListener("input", (event) => {
      const fieldName = event.target.name;
      if (fieldName === "latitude" || fieldName === "longitude") {
        return;
      }
      if (fieldName === "photos") {
        cities[activeCityIndex].photos = mergePhotoEntries(
          event.target.value,
          cityEditorElement.querySelector('[name="photoTitles"]')?.value || "",
          cityEditorElement.querySelector('[name="photoCredits"]')?.value || "",
        );
      } else if (fieldName === "photoTitles") {
        cities[activeCityIndex].photos = mergePhotoEntries(
          cityEditorElement.querySelector('[name="photos"]')?.value || "",
          event.target.value,
          cityEditorElement.querySelector('[name="photoCredits"]')?.value || "",
        );
      } else if (fieldName === "photoCredits") {
        cities[activeCityIndex].photos = mergePhotoEntries(
          cityEditorElement.querySelector('[name="photos"]')?.value || "",
          cityEditorElement.querySelector('[name="photoTitles"]')?.value || "",
          event.target.value,
        );
      } else {
        cities[activeCityIndex][fieldName] =
          event.target.type === "checkbox" ? event.target.checked : event.target.value;
      }
      renderCityList(cities, activeCityIndex);
      renderConferencePhoto(cities[activeCityIndex]);
      syncCityActions();
      redrawMap();
    });
  });

  cityEditorElement.querySelector("#geocode-city-data").addEventListener("click", () => {
    geocodeActiveCity();
  });

  cityEditorElement.querySelector("#save-city-data").addEventListener("click", async () => {
    await saveCities();
  });

  cityEditorElement.querySelector("#add-city-button").addEventListener("click", () => {
    addCity();
  });

  cityEditorElement.querySelector("#delete-city-button").addEventListener("click", () => {
    deleteCity();
  });
}

function addCity() {
  stopCityAutoPlay();
  const newCity = createEmptyCity(cities.length + 1);
  cities.push(newCity);
  activeCityIndex = cities.length - 1;
  renderCityList(cities, activeCityIndex);
  renderCityEditor(cities[activeCityIndex]);
  renderConferencePhoto(cities[activeCityIndex]);
  syncCityActions();
  redrawMap();
  focusCity(cities[activeCityIndex], true);
}

function deleteCity() {
  stopCityAutoPlay();
  if (cities.length <= 1) {
    setSaveStatus("最後の1件は削除できません");
    return;
  }

  cities.splice(activeCityIndex, 1);
  activeCityIndex = Math.max(0, Math.min(activeCityIndex, cities.length - 1));
  renderCityList(cities, activeCityIndex);
  renderCityEditor(cities[activeCityIndex]);
  renderConferencePhoto(cities[activeCityIndex]);
  syncCityActions();
  redrawMap();
  focusCity(cities[activeCityIndex], true);
}

sortButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentSortKey = button.dataset.sortKey;
    renderCityList(cities, activeCityIndex);
    syncCityAutoPlay();
  });
});

conferenceFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentConferenceFilter = button.dataset.conferenceFilter;
    syncConferenceFilterActions();
    syncActiveCityWithFilter();
    renderCityList(cities, activeCityIndex);
    renderCityEditor(cities[activeCityIndex]);
    renderConferencePhoto(cities[activeCityIndex]);
    redrawMap();
    focusCity(cities[activeCityIndex], true);
    syncCityAutoPlay();
  });
});

function syncConferenceFilterActions() {
  conferenceFilterButtons.forEach((button) => {
    const isActive = button.dataset.conferenceFilter === currentConferenceFilter;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

async function geocodeActiveCity(options = {}) {
  const { force = true } = options;
  const city = cities[activeCityIndex];
  const query = [city.name, city.country].filter(Boolean).join(", ").trim();
  if (!query) {
    return false;
  }

  const shouldUpdateCoordinates = force || hasDefaultCoordinates(city.coordinates);
  const shouldUpdateFlag = force || hasDefaultFlag(city.flag);
  if (!shouldUpdateCoordinates && !shouldUpdateFlag) {
    return false;
  }

  setSaveStatus("位置を検索中...");

  try {
    const url = new URL(GEOCODE_ENDPOINT);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("addressdetails", "1");

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Geocoding failed with ${response.status}`);
    }

    const results = await response.json();
    if (!Array.isArray(results) || results.length === 0) {
      setSaveStatus("位置が見つかりませんでした");
      return false;
    }

    const [result] = results;
    if (shouldUpdateCoordinates) {
      city.coordinates = [Number(result.lon), Number(result.lat)];
    }
    if (shouldUpdateFlag && result.address?.country_code) {
      city.flag = countryCodeToFlag(result.address.country_code);
    }
    renderCityEditor(city);
    renderCityList(cities, activeCityIndex);
    renderConferencePhoto(cities[activeCityIndex]);
    redrawMap();
    focusCity(city, true);
    setSaveStatus("緯度経度を更新しました");
    return true;
  } catch (error) {
    console.error("Failed to geocode city.", error);
    setSaveStatus("位置を更新できませんでした");
    return false;
  }
}

async function bootstrapApp() {
  await hydrateCities();
  syncInitialActiveCity();
  setCityEditorVisibility(isCityEditorVisible);
  renderCityList(cities, activeCityIndex);
  renderCityEditor(cities[activeCityIndex]);
  renderConferencePhoto(cities[activeCityIndex]);
  syncCityActions();
  syncConferenceFilterActions();
  initializeMap().catch((error) => {
    console.error("Failed to initialize map.", error);
  });
  syncCityAutoPlay();
}

async function initializeMap() {
  const width = mapElement.clientWidth;
  const height = Math.max(420, Math.min(760, width * 0.62));

  mapElement.innerHTML = "";

  const svg = d3
    .select(mapElement)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr("aria-label", "旗とコメント付きの世界地図");

  const defs = svg.append("defs");
  const gradient = defs
    .append("linearGradient")
    .attr("id", "ocean-gradient")
    .attr("x1", "0%")
    .attr("x2", "0%")
    .attr("y1", "0%")
    .attr("y2", "100%");

  gradient.append("stop").attr("offset", "0%").attr("stop-color", "var(--ocean-top)");
  gradient.append("stop").attr("offset", "100%").attr("stop-color", "var(--ocean-bottom)");

  const projection = d3.geoNaturalEarth1().fitExtent(
    [
      [2, 2],
      [width - 2, height - 2],
    ],
    { type: "Sphere" },
  );
  const path = d3.geoPath(projection);

  const sphere = svg.append("path").datum({ type: "Sphere" }).attr("class", "sphere");
  const graticule = svg
    .append("path")
    .datum(d3.geoGraticule10())
    .attr("class", "graticule");
  const countriesGroup = svg.append("g");
  const markersGroup = svg.append("g");

  mapState = {
    width,
    height,
    svg,
    projection,
    baseScale: projection.scale(),
    path,
    sphere,
    graticule,
    countriesGroup,
    markersGroup,
    countries: [],
  };

  attachMapInteraction();

  redrawMap();

  try {
    if (!worldDataPromise) {
      worldDataPromise = d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");
    }

    const world = await worldDataPromise;
    mapState.countries = topojson.feature(world, world.objects.countries).features;

    countriesGroup
      .selectAll("path")
      .data(mapState.countries)
      .join("path")
      .attr("class", "country-shape");

    focusCity(cities[activeCityIndex], true);
  } catch (error) {
    console.error("Failed to load world map data.", error);
    drawFallbackMessage(svg, width, height);
  }
}

function focusCity(city, skipAnimation = false) {
  if (!mapState) {
    return;
  }

  const [longitude, latitude] = city.coordinates;
  const currentRotation = mapState.projection.rotate();
  const targetRotation = [-longitude, -latitude, 0];

  if (skipAnimation) {
    mapState.projection.rotate(targetRotation);
    redrawMap();
    return;
  }

  mapState.svg
    .transition("rotate-map")
    .duration(900)
    .ease(d3.easeCubicInOut)
    .tween("rotate-map", () => {
      const interpolate = d3.interpolate(currentRotation, targetRotation);
      return (t) => {
        mapState.projection.rotate(interpolate(t));
        redrawMap();
      };
    });
}

function attachMapInteraction() {
  const { svg, projection, width, height } = mapState;
  const degreesPerPixel = 180 / Math.min(width, height);
  let dragStart;

  svg
    .style("cursor", "grab")
    .call(
      d3
        .drag()
        .on("start", (event) => {
          svg.interrupt("rotate-map");
          svg.style("cursor", "grabbing");
          dragStart = {
            x: event.x,
            y: event.y,
            rotate: [...projection.rotate()],
          };
        })
        .on("drag", (event) => {
          if (!dragStart) {
            return;
          }

          const dx = event.x - dragStart.x;
          const dy = event.y - dragStart.y;
          const nextLongitude = dragStart.rotate[0] + dx * degreesPerPixel;
          const nextLatitude = clamp(dragStart.rotate[1] - dy * degreesPerPixel, -85, 85);

          projection.rotate([nextLongitude, nextLatitude, dragStart.rotate[2] || 0]);
          redrawMap();
        })
        .on("end", () => {
          dragStart = null;
          svg.style("cursor", "grab");
        }),
    );
}

function updateZoom(multiplier) {
  if (!mapState) {
    return;
  }

  currentZoomFactor = clamp(currentZoomFactor * multiplier, 0.8, 4);
  redrawMap();
}

function applyZoom() {
  if (!mapState) {
    return;
  }

  mapState.projection.scale(mapState.baseScale * currentZoomFactor);
  syncZoomControls();
}

function syncZoomControls() {
  if (!zoomResetButton) {
    return;
  }

  const isDefaultZoom = Math.abs(currentZoomFactor - DEFAULT_ZOOM_FACTOR) < 0.0001;
  zoomResetButton.classList.toggle("is-active", isDefaultZoom);
  zoomResetButton.setAttribute("aria-pressed", String(isDefaultZoom));
}

function redrawMap() {
  if (!mapState) {
    return;
  }

  const { path, sphere, graticule, countriesGroup } = mapState;
  applyZoom();

  sphere.attr("d", path);
  graticule.attr("d", path);
  countriesGroup.selectAll("path").attr("d", path);
  drawMarkers(activeCityIndex);
}

function selectCity(index, options = {}) {
  const { skipAnimation = false, forceScroll = true, pauseAutoPlay = false } = options;
  const isSameCity = index === activeCityIndex;
  if (!isSameCity) {
    activeCityIndex = index;
    renderCityList(cities, activeCityIndex);
    renderCityEditor(cities[activeCityIndex]);
    renderConferencePhoto(cities[activeCityIndex]);
    syncCityActions();
    focusCity(cities[activeCityIndex], skipAnimation);
  }

  if (forceScroll) {
    scrollActiveCityCardIntoView();
  }

  if (pauseAutoPlay) {
    pauseCityAutoPlay();
  }
}

function renderConferencePhoto(city) {
  if (!conferencePhotoTrack || !conferencePhotoCaption || !photoGridElement || !city) {
    return;
  }

  const missingPhotoMessage =
    "この会議での日本風工学会員に関わる集合写真やグループ写真をお持ちの方はご提供ください。";
  const photos = getCityPhotos(city);
  const slides = [
    ...photos,
    {
      src: "",
      title: missingPhotoMessage,
      credit: "",
      isNotice: true,
    },
  ];
  currentPhotoIndex = 0;

  if (photos.length === 0) {
    conferencePhotoTrack.innerHTML = `<div class="photo-empty">${missingPhotoMessage}</div>`;
    photoGridElement.innerHTML = `<div class="photo-empty">${missingPhotoMessage}</div>`;
    conferencePhotoCaption.textContent = "";
    updatePhotoControls(photos.length);
    stopPhotoCarousel();
    syncPhotoView();
    return;
  }

  conferencePhotoTrack.innerHTML = slides
    .map(
      (photo, index) => `
        <div class="photo-slide">
          ${
            photo.isNotice
              ? `<div class="photo-empty">${escapeHtml(missingPhotoMessage)}</div>`
              : `<img class="photo-image" src="${escapeHtml(photo.src)}" alt="${escapeHtml(photo.title || `${city.comment} の関連写真 ${index + 1}`)}" />`
          }
        </div>
      `,
    )
    .join("");
  conferencePhotoTrack.innerHTML = `<div class="photo-strip">${conferencePhotoTrack.innerHTML}</div>`;
  photoGridElement.innerHTML = photos
    .map(
      (photo, index) => `
        <button
          type="button"
          class="photo-grid-button"
          data-photo-index="${index}"
          data-photo-title="${escapeHtml(photo.title || "写真タイトル未設定")}"
        >
          <img class="photo-thumb" src="${escapeHtml(photo.src)}" alt="${escapeHtml(photo.title || `写真 ${index + 1}`)}" />
        </button>
      `,
    )
    .join("");
  photoGridElement.innerHTML += `
    <div class="photo-empty">
      ${escapeHtml(missingPhotoMessage)}
    </div>
  `;
  photoGridElement.querySelectorAll("[data-photo-index]").forEach((button) => {
    button.addEventListener("click", () => {
      currentPhotoIndex = Number(button.dataset.photoIndex);
      setPhotoViewMode("carousel");
      updateVisiblePhoto();
      startPhotoCarousel();
    });
  });

  updateVisiblePhoto();
  syncPhotoView();
}

function getCityPhotos(city) {
  if (Array.isArray(city.photos)) {
    return city.photos
      .map((entry) => normalizePhotoEntry(entry))
      .filter((entry) => entry && entry.src);
  }

  const singlePhoto = String(city.photo || "").trim();
  return singlePhoto ? [{ src: singlePhoto, title: "" }] : [];
}

function normalizePhotoEntry(entry) {
  if (typeof entry === "string") {
    const [srcPart, ...titleParts] = entry.split("|");
    const src = String(srcPart || "").trim();
    const title = titleParts.join("|").trim();
    return src ? { src, title, credit: "" } : null;
  }

  if (!entry || typeof entry !== "object") {
    return null;
  }

  const src = String(entry.src || "").trim();
  const title = String(entry.title || "").trim();
  const credit = String(entry.credit || "").trim();
  return src ? { src, title, credit } : null;
}

function parsePhotoEntries(value) {
  return String(value)
    .split("\n")
    .map((line) => normalizePhotoEntry(line))
    .filter(Boolean);
}

function serializeCityPhotoPaths(city) {
  return getCityPhotos(city)
    .map((photo) => photo.src)
    .join("\n");
}

function serializeCityPhotoTitles(city) {
  return getCityPhotos(city)
    .map((photo) => photo.title || "")
    .join("\n");
}

function serializeCityPhotoCredits(city) {
  return getCityPhotos(city)
    .map((photo) => photo.credit || "")
    .join("\n");
}

function mergePhotoEntries(pathsValue, titlesValue, creditsValue) {
  const paths = String(pathsValue)
    .split("\n")
    .map((value) => String(value).trim());
  const titles = String(titlesValue)
    .split("\n")
    .map((value) => String(value).trim());
  const credits = String(creditsValue)
    .split("\n")
    .map((value) => String(value).trim());

  return paths
    .map((src, index) => {
      if (!src) {
        return null;
      }

      return {
        src,
        title: titles[index] || "",
        credit: credits[index] || "",
      };
    })
    .filter(Boolean);
}

function moveConferencePhoto(step, options = {}) {
  const { restartTimer = false } = options;
  const slides = conferencePhotoTrack?.querySelectorAll(".photo-slide");
  if (!slides || slides.length <= 1) {
    return;
  }

  currentPhotoIndex = (currentPhotoIndex + step + slides.length) % slides.length;
  updateVisiblePhoto();

  if (restartTimer) {
    startPhotoCarousel();
  }
}

function updateVisiblePhoto() {
  const strip = conferencePhotoTrack?.querySelector(".photo-strip");
  const slides = conferencePhotoTrack?.querySelectorAll(".photo-slide");
  if (!slides || slides.length === 0) {
    updatePhotoControls(0);
    return;
  }

  if (strip) {
    strip.style.transform = `translateX(-${currentPhotoIndex * 100}%)`;
  }
  const city = cities[activeCityIndex];
  const photos = getCityPhotos(city);
  if (currentPhotoIndex >= photos.length) {
    conferencePhotoCaption.textContent = "";
    updatePhotoControls(slides.length);
    return;
  }

  const activePhoto = photos[currentPhotoIndex];
  const parts = [activePhoto?.title, activePhoto?.credit].filter(Boolean);
  conferencePhotoCaption.textContent = parts.join(" | ") || "写真タイトル未設定";
  updatePhotoControls(slides.length);
}

function setPhotoViewMode(mode) {
  currentPhotoViewMode = mode;
  syncPhotoView();
}

function syncPhotoView() {
  const isCarousel = currentPhotoViewMode === "carousel";
  photoCarouselElement?.classList.toggle("is-hidden", !isCarousel);
  photoGridElement?.classList.toggle("is-hidden", isCarousel);
  photoViewCarouselButton?.classList.toggle("is-active", isCarousel);
  photoViewGridButton?.classList.toggle("is-active", !isCarousel);
  if (!isCarousel && conferencePhotoCaption) {
    conferencePhotoCaption.textContent = "";
  } else if (isCarousel) {
    updateVisiblePhoto();
  }

  if (isCarousel) {
    startPhotoCarousel();
  } else {
    stopPhotoCarousel();
  }
}

function updatePhotoControls(count) {
  const disabled = count <= 1;
  if (conferencePhotoPrevButton) {
    conferencePhotoPrevButton.disabled = disabled;
  }
  if (conferencePhotoNextButton) {
    conferencePhotoNextButton.disabled = disabled;
  }
}

function startPhotoCarousel() {
  stopPhotoCarousel();

  const slides = conferencePhotoTrack?.querySelectorAll(".photo-slide");
  if (!slides || slides.length <= 1 || currentPhotoViewMode !== "carousel") {
    return;
  }

  photoCarouselTimerId = window.setInterval(() => {
    moveConferencePhoto(1);
  }, 3500);
}

function stopPhotoCarousel() {
  window.clearInterval(photoCarouselTimerId);
  photoCarouselTimerId = null;
}

function scrollActiveCityCardIntoView() {
  const activeButton = cityListElement.querySelector(`[data-city-index="${activeCityIndex}"]`);
  if (!activeButton) {
    return;
  }

  const targetLeft =
    activeButton.offsetLeft - (cityListElement.clientWidth - activeButton.clientWidth) / 2;

  cityListElement.scrollTo({
    left: Math.max(0, targetLeft),
    behavior: "smooth",
  });
}

function isDefaultCityListState() {
  return currentSortKey === "eventDate" && currentConferenceFilter === "all";
}

function getVisibleSortedCityEntries() {
  return getSortedEntries(getVisibleCityEntries(cities));
}

function advanceCityAutoPlay() {
  const visibleEntries = getVisibleSortedCityEntries();
  if (visibleEntries.length <= 1) {
    return;
  }

  const currentPosition = visibleEntries.findIndex(({ index }) => index === activeCityIndex);
  const nextEntry = visibleEntries[(currentPosition + 1 + visibleEntries.length) % visibleEntries.length];
  if (!nextEntry) {
    return;
  }

  selectCity(nextEntry.index, { forceScroll: true });
}

function startCityAutoPlay() {
  window.clearInterval(cityAutoPlayTimerId);
  cityAutoPlayTimerId = null;
  window.clearTimeout(cityAutoPlayResumeTimerId);
  cityAutoPlayResumeTimerId = null;

  const visibleEntries = getVisibleSortedCityEntries();
  if (visibleEntries.length <= 1) {
    isCityAutoPlayEnabled = false;
    syncCityAutoPlayButton();
    return;
  }

  isCityAutoPlayEnabled = true;
  syncCityAutoPlayButton();
  cityAutoPlayTimerId = window.setInterval(() => {
    advanceCityAutoPlay();
  }, AUTO_CITY_ADVANCE_MS);
}

function stopCityAutoPlay() {
  isCityAutoPlayEnabled = false;
  window.clearInterval(cityAutoPlayTimerId);
  cityAutoPlayTimerId = null;
  window.clearTimeout(cityAutoPlayResumeTimerId);
  cityAutoPlayResumeTimerId = null;
  syncCityAutoPlayButton();
}

function pauseCityAutoPlay() {
  window.clearInterval(cityAutoPlayTimerId);
  cityAutoPlayTimerId = null;
  window.clearTimeout(cityAutoPlayResumeTimerId);
  cityAutoPlayResumeTimerId = null;

  if (!isCityAutoPlayEnabled) {
    return;
  }

  cityAutoPlayResumeTimerId = window.setTimeout(() => {
    startCityAutoPlay();
  }, AUTO_CITY_RESUME_DELAY_MS);
}

function syncCityAutoPlay() {
  if (isCityAutoPlayEnabled) {
    startCityAutoPlay();
    return;
  }

  syncCityAutoPlayButton();
}

function syncCityAutoPlayButton() {
  if (!cityAutoPlayToggleButton) {
    return;
  }

  cityAutoPlayToggleButton.classList.toggle("is-active", isCityAutoPlayEnabled);
  cityAutoPlayToggleButton.setAttribute("aria-pressed", String(isCityAutoPlayEnabled));
  cityAutoPlayToggleButton.textContent = "Auto-scroll";
}

function syncInitialActiveCity() {
  const visibleEntries = getVisibleSortedCityEntries();
  if (visibleEntries.length === 0) {
    activeCityIndex = 0;
    return;
  }

  activeCityIndex = visibleEntries[0].index;
}

function setCityEditorVisibility(isVisible) {
  isCityEditorVisible = isVisible;
  cityEditorElement.classList.toggle("is-hidden", !isVisible);
  toggleCityEditorButton.textContent = isVisible ? "編集ウィンドウを隠す" : "編集ウィンドウを表示";
  toggleCityEditorButton.setAttribute("aria-expanded", String(isVisible));
}

function drawMarkers(activeIndex) {
  const { markersGroup, projection, width, height } = mapState;
  markersGroup.selectAll("*").remove();
  const occupiedRects = [];

  const orderedCities = getVisibleCityEntries(cities)
    .sort((left, right) => Number(left.index === activeIndex) - Number(right.index === activeIndex));

  orderedCities.forEach(({ city, index }) => {
    const projected = projection(city.coordinates);
    if (!projected) {
      return;
    }

    const [x, y] = projected;
    const isActive = index === activeIndex;

    const group = markersGroup
      .append("g")
      .attr(
        "class",
        `marker-group type-${conferenceTypeToToken(normalizeConferenceType(city.conferenceType))}${city.isUpcoming ? " is-upcoming" : ""}${isActive ? " is-active" : ""}`,
      )
      .attr("data-conference-type", normalizeConferenceType(city.conferenceType));

    group.on("click", (event) => {
      event.stopPropagation();
      selectCity(index, { pauseAutoPlay: true });
    });

    group
      .append("circle")
      .attr("class", "marker-ring")
      .attr("cx", x)
      .attr("cy", y)
      .attr("r", isActive ? 16 : 12);

    group
      .append("circle")
      .attr("class", "marker-dot")
      .attr("cx", x)
      .attr("cy", y)
      .attr("r", isActive ? 7 : 5.5);

    if (!isActive) {
      return;
    }

    const metrics = measureLabelMetrics(markersGroup, city);
    const preferredOffset = city.manualLabelOffset ?? city.labelOffset ?? [24, -62];
    const placement = city.manualLabelOffset
      ? getPlacementFromOffset(x, y, preferredOffset, metrics)
      : findLabelPlacement(x, y, preferredOffset, metrics, occupiedRects, width, height);

    const labelLayer = group.append("g").attr("class", "label-layer").style("cursor", "grab");

    const line = labelLayer
      .append("line")
      .attr("class", "label-line")
      .attr("x1", x)
      .attr("y1", y)
      .attr("x2", placement.lineX)
      .attr("y2", placement.lineY);

    const commentText = labelLayer
      .append("text")
      .attr("class", "label-comment")
      .attr("x", placement.rect.x + metrics.commentX)
      .attr("y", placement.rect.y + metrics.commentY)
      .text(truncate(city.comment, 34));

    const title = labelLayer
      .append("text")
      .attr("class", "label-title")
      .attr("x", placement.rect.x + metrics.titleX)
      .attr("y", placement.rect.y + metrics.titleY);

    title
      .append("tspan")
      .attr("class", "label-title-main")
      .text(`${city.flag} ${city.name}`);

    title
      .append("tspan")
      .attr("class", "label-title-country")
      .text(` ${city.country}`);

    const labelBox = labelLayer
      .insert("rect", ":first-child")
      .attr("class", "label-box")
      .attr("x", placement.rect.x)
      .attr("y", placement.rect.y)
      .attr("width", placement.rect.width)
      .attr("height", placement.rect.height)
      .attr("rx", 20)
      .attr("ry", 20);

    enableLabelDrag(labelLayer, labelBox, line, commentText, title, city, x, y, metrics);
    occupiedRects.push(placement.rect);
  });
}

function drawFallbackMessage(svg, width, height) {
  svg.selectAll("*").remove();

  svg
    .append("text")
    .attr("x", width / 2)
    .attr("y", height / 2 - 14)
    .attr("text-anchor", "middle")
    .attr("font-family", "Space Grotesk, sans-serif")
    .attr("font-size", 28)
    .attr("font-weight", 700)
    .attr("fill", "var(--ink)")
    .text("Map data could not be loaded");

  svg
    .append("text")
    .attr("x", width / 2)
    .attr("y", height / 2 + 18)
    .attr("text-anchor", "middle")
    .attr("font-size", 14)
    .attr("fill", "var(--muted)")
    .text("ネットワーク接続を確認するか、world-atlas をローカル配信してください。");
}

function truncate(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1)}…`;
}

function debounce(fn, wait) {
  let timerId;

  return (...args) => {
    window.clearTimeout(timerId);
    timerId = window.setTimeout(() => fn(...args), wait);
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function hydrateCities() {
  try {
    const initialCities = await loadInitialCities();
    if (initialCities) {
      replaceCities(initialCities);
    }
  } catch (error) {
    console.error("Failed to restore saved city data.", error);
  }
}

async function saveCities() {
  try {
    await geocodeActiveCity({ force: false });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cities));
    await exportInitialCityData();
    setSaveStatus("jsファイルを保存しました");
  } catch (error) {
    console.error("Failed to save city data.", error);
    setSaveStatus("jsファイルを保存できませんでした");
  }
}

async function exportInitialCityData() {
  const source = buildInitialCitiesSource();
  const savedToDirectory = await saveInitialDataToProjectDirectory(source);
  if (savedToDirectory) {
    return;
  }

  downloadInitialData(source);
}

function syncCityActions() {
  const deleteButton = cityEditorElement.querySelector("#delete-city-button");
  if (deleteButton) {
    deleteButton.disabled = cities.length <= 1;
  }
}

function syncSortActions() {
  sortButtons.forEach((button) => {
    const isActive = button.dataset.sortKey === currentSortKey;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function setSaveStatus(message) {
  const status = cityEditorElement.querySelector("#save-status");
  if (!status) {
    return;
  }

  status.textContent = message;

  window.clearTimeout(setSaveStatus.timeoutId);
  if (message) {
    setSaveStatus.timeoutId = window.setTimeout(() => {
      if (status.textContent === message) {
        status.textContent = "";
      }
    }, 1800);
  }
}

function createEmptyCity(sequence) {
  return {
    name: `New City ${sequence}`,
    country: "Country",
    flag: DEFAULT_FLAG,
    comment: "第 回",
    eventDate: "",
    organizer: "",
    photo: "",
    photos: [],
    isUpcoming: false,
    conferenceType: "その他",
    coordinates: [...DEFAULT_COORDINATES],
    labelOffset: [24, -62],
  };
}

function buildInitialCitiesSource() {
  return `window.__INITIAL_CITIES__ = ${JSON.stringify(cities, null, 2)};\n`;
}

async function saveInitialDataToProjectDirectory(source) {
  if (!("showDirectoryPicker" in window)) {
    return false;
  }

  const directoryHandle = await getProjectDirectoryHandle();
  if (!directoryHandle) {
    return false;
  }

  const fileHandle = await directoryHandle.getFileHandle("cities.initial-data.js", {
    create: true,
  });
  const writable = await fileHandle.createWritable();
  await writable.write(source);
  await writable.close();
  return true;
}

async function getProjectDirectoryHandle() {
  let directoryHandle = await loadStoredDirectoryHandle();
  if (directoryHandle) {
    const permission = await directoryHandle.queryPermission({ mode: "readwrite" });
    if (permission === "granted") {
      return directoryHandle;
    }

    if (permission === "prompt") {
      const requested = await directoryHandle.requestPermission({ mode: "readwrite" });
      if (requested === "granted") {
        return directoryHandle;
      }
    }
  }

  directoryHandle = await window.showDirectoryPicker({
    id: "flagged-world-map-project-directory",
    mode: "readwrite",
  });
  await storeDirectoryHandle(directoryHandle);
  return directoryHandle;
}

function downloadInitialData(source) {
  const blob = new Blob([source], { type: "application/javascript;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "cities.initial-data.js";
  document.body.append(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function openDirectoryDatabase() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DIRECTORY_DB_NAME, 1);

    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DIRECTORY_STORE_NAME)) {
        database.createObjectStore(DIRECTORY_STORE_NAME);
      }
    });

    request.addEventListener("success", () => {
      resolve(request.result);
    });

    request.addEventListener("error", () => {
      reject(request.error);
    });
  });
}

async function storeDirectoryHandle(directoryHandle) {
  const database = await openDirectoryDatabase();

  await new Promise((resolve, reject) => {
    const transaction = database.transaction(DIRECTORY_STORE_NAME, "readwrite");
    const store = transaction.objectStore(DIRECTORY_STORE_NAME);
    const request = store.put(directoryHandle, DIRECTORY_HANDLE_KEY);

    request.addEventListener("success", resolve);
    request.addEventListener("error", () => {
      reject(request.error);
    });
  });

  database.close();
}

async function loadStoredDirectoryHandle() {
  if (!("indexedDB" in window)) {
    return null;
  }

  const database = await openDirectoryDatabase();

  const handle = await new Promise((resolve, reject) => {
    const transaction = database.transaction(DIRECTORY_STORE_NAME, "readonly");
    const store = transaction.objectStore(DIRECTORY_STORE_NAME);
    const request = store.get(DIRECTORY_HANDLE_KEY);

    request.addEventListener("success", () => {
      resolve(request.result || null);
    });
    request.addEventListener("error", () => {
      reject(request.error);
    });
  });

  database.close();
  return handle;
}

async function loadInitialCities() {
  try {
    const parsed = window.__INITIAL_CITIES__;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return null;
    }

    return parsed;
  } catch (error) {
    console.error("Failed to load initial city data.", error);
    return null;
  }
}

function replaceCities(nextCities) {
  cities.splice(
    0,
    cities.length,
    ...nextCities.map((city, index) => ({
      ...createEmptyCity(index + 1),
      ...city,
    })),
  );
}

function formatCoordinate(value) {
  if (!Number.isFinite(value)) {
    return "";
  }

  return value.toFixed(4);
}

function getSortedEntries(items) {
  return items
    .sort((left, right) => {
      const leftValue = normalizeSortValue(left.city[currentSortKey]);
      const rightValue = normalizeSortValue(right.city[currentSortKey]);

      if (leftValue < rightValue) {
        return -1;
      }

      if (leftValue > rightValue) {
        return 1;
      }

      return left.index - right.index;
    });
}

function normalizeSortValue(value) {
  return String(value || "").trim().toLocaleLowerCase("ja");
}

function getVisibleCityEntries(items) {
  return items
    .map((city, index) => ({ city, index }))
    .filter(({ city }) => {
      if (currentConferenceFilter === "all") {
        return true;
      }

      return normalizeConferenceType(city.conferenceType) === currentConferenceFilter;
    });
}

function syncActiveCityWithFilter() {
  const filtered = getVisibleCityEntries(cities);
  if (filtered.length === 0) {
    return;
  }

  const activeVisible = filtered.some(({ index }) => index === activeCityIndex);
  if (!activeVisible) {
    activeCityIndex = filtered[0].index;
  }
}

function countryCodeToFlag(countryCode) {
  return String(countryCode)
    .trim()
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

function normalizeConferenceType(conferenceType) {
  const normalized = String(conferenceType || "").trim();
  if (CONFERENCE_TYPES.includes(normalized)) {
    return normalized;
  }

  return "その他";
}

function conferenceTypeToToken(conferenceType) {
  return String(conferenceType || "その他")
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "other";
}

function hasDefaultFlag(flag) {
  return !flag || flag === DEFAULT_FLAG;
}

function hasDefaultCoordinates(coordinates) {
  return (
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    (Number(coordinates[0]) === DEFAULT_COORDINATES[0] &&
      Number(coordinates[1]) === DEFAULT_COORDINATES[1])
  );
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function measureLabelMetrics(parentGroup, city) {
  const paddingX = 12;
  const paddingTop = 10;
  const paddingBottom = 10;
  const probe = parentGroup.append("g").attr("visibility", "hidden").attr("pointer-events", "none");
  const commentX = paddingX;
  const commentY = paddingTop + 18;
  const titleX = paddingX;
  const titleY = paddingTop + 36;

  const commentText = probe
    .append("text")
    .attr("class", "label-comment")
    .attr("x", commentX)
    .attr("y", commentY)
    .text(truncate(city.comment, 34));

  const title = probe
    .append("text")
    .attr("class", "label-title")
    .attr("x", titleX)
    .attr("y", titleY);

  title.append("tspan").attr("class", "label-title-main").text(`${city.flag} ${city.name}`);
  title.append("tspan").attr("class", "label-title-country").text(` ${city.country}`);

  const commentBox = commentText.node().getBBox();
  const titleBox = title.node().getBBox();
  const contentLeft = Math.min(commentBox.x, titleBox.x);
  const contentTop = Math.min(commentBox.y, titleBox.y);
  const contentRight = Math.max(commentBox.x + commentBox.width, titleBox.x + titleBox.width);
  const contentBottom = Math.max(commentBox.y + commentBox.height, titleBox.y + titleBox.height);
  const rectLeft = contentLeft - paddingX;
  const rectTop = contentTop - paddingTop;
  const rectRight = contentRight + paddingX;
  const rectBottom = contentBottom + paddingBottom;

  probe.remove();

  return {
    width: rectRight - rectLeft,
    height: rectBottom - rectTop,
    commentX: commentX - rectLeft,
    commentY: commentY - rectTop,
    titleX: titleX - rectLeft,
    titleY: titleY - rectTop,
  };
}

function findLabelPlacement(x, y, preferredOffset, metrics, occupiedRects, width, height) {
  const margin = 10;
  const [preferredX, preferredY] = preferredOffset;
  const candidates = [
    [preferredX, preferredY],
    [26, -metrics.height - 12],
    [26, 12],
    [-metrics.width - 26, -metrics.height - 12],
    [-metrics.width - 26, 12],
    [34, -metrics.height / 2],
    [-metrics.width - 34, -metrics.height / 2],
    [-metrics.width / 2, -metrics.height - 16],
    [-metrics.width / 2, 16],
  ];

  let bestPlacement;

  candidates.forEach(([dx, dy], candidateIndex) => {
    const rect = { x: x + dx, y: y + dy, width: metrics.width, height: metrics.height };
    const overlapPenalty = occupiedRects.reduce(
      (total, occupied) => total + getOverlapArea(rect, occupied),
      0,
    );
    const outOfBoundsPenalty = getOutOfBoundsArea(rect, width, height, margin);
    const distancePenalty = Math.abs(dx) + Math.abs(dy);
    const score =
      overlapPenalty * 50 + outOfBoundsPenalty * 80 + distancePenalty + candidateIndex * 0.01;

    if (!bestPlacement || score < bestPlacement.score) {
      bestPlacement = { score, rect };
    }
  });

  const rect = bestPlacement.rect;
  return getPlacementFromRect(x, y, rect);
}

function getOverlapArea(left, right) {
  const overlapWidth =
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x);
  const overlapHeight =
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y);

  if (overlapWidth <= 0 || overlapHeight <= 0) {
    return 0;
  }

  return overlapWidth * overlapHeight;
}

function getOutOfBoundsArea(rect, width, height, margin) {
  const left = Math.max(0, margin - rect.x);
  const top = Math.max(0, margin - rect.y);
  const right = Math.max(0, rect.x + rect.width - (width - margin));
  const bottom = Math.max(0, rect.y + rect.height - (height - margin));

  return (left + right) * rect.height + (top + bottom) * rect.width;
}

function enableLabelDrag(labelLayer, labelBox, line, commentText, title, city, x, y, metrics) {
  let dragStart;

  labelLayer.call(
    d3
      .drag()
      .on("start", (event) => {
        event.sourceEvent?.stopPropagation();
        dragStart = {
          rectX: Number(labelBox.attr("x")),
          rectY: Number(labelBox.attr("y")),
          pointerX: event.x,
          pointerY: event.y,
        };
        labelLayer.style("cursor", "grabbing");
      })
      .on("drag", (event) => {
        if (!dragStart) {
          return;
        }

        const rect = {
          x: dragStart.rectX + (event.x - dragStart.pointerX),
          y: dragStart.rectY + (event.y - dragStart.pointerY),
          width: Number(labelBox.attr("width")),
          height: Number(labelBox.attr("height")),
        };
        const placement = getPlacementFromRect(x, y, rect);
        applyLabelPlacement(labelBox, line, commentText, title, placement, metrics);
        city.manualLabelOffset = [rect.x - x, rect.y - y];
      })
      .on("end", (event) => {
        event.sourceEvent?.stopPropagation();
        dragStart = null;
        labelLayer.style("cursor", "grab");
      }),
  );
}

function applyLabelPlacement(labelBox, line, commentText, title, placement, metrics) {
  labelBox.attr("x", placement.rect.x).attr("y", placement.rect.y);
  line.attr("x2", placement.lineX).attr("y2", placement.lineY);
  commentText
    .attr("x", placement.rect.x + metrics.commentX)
    .attr("y", placement.rect.y + metrics.commentY);
  title.attr("x", placement.rect.x + metrics.titleX).attr("y", placement.rect.y + metrics.titleY);
}

function getPlacementFromOffset(x, y, offset, metrics) {
  const [dx, dy] = offset;
  return getPlacementFromRect(x, y, {
    x: x + dx,
    y: y + dy,
    width: metrics.width,
    height: metrics.height,
  });
}

function getPlacementFromRect(x, y, rect) {
  const lineX = x < rect.x ? rect.x : rect.x + rect.width;
  const lineY = clamp(y, rect.y + 12, rect.y + rect.height - 12);

  return { rect, lineX, lineY };
}
