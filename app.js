const STORAGE_KEY = "flagged-world-map-cities";
const GEOCODE_ENDPOINT = "https://nominatim.openstreetmap.org/search";
const DIRECTORY_DB_NAME = "flagged-world-map-directory";
const DIRECTORY_STORE_NAME = "handles";
const DIRECTORY_HANDLE_KEY = "project-directory";
const CONFERENCE_TYPES = ["ICWE", "CWE", "APCWE", "BBAA", "その他"];
const DEFAULT_FLAG = "🏳️";
const DEFAULT_COORDINATES = [0, 0];
const DEFAULT_FLAT_ZOOM_FACTOR = 1.728;
const DEFAULT_GLOBE_ZOOM_FACTOR = 1;
const AUTO_CITY_ADVANCE_MS = 6000;
const AUTO_CITY_RESUME_DELAY_MS = 7000;
const PHOTO_UPLOAD_POPUP_NAME = "photo-upload-popup";
const QUICK_GUIDE_DISMISSED_KEY = "flagged-world-map-quick-guide-dismissed";
const MAP_PROJECTION_STORAGE_KEY = "flagged-world-map-projection";
const MAP_VIEW_MODE_STORAGE_KEY = "flagged-world-map-view-mode";
const PANEL_SPLIT_STORAGE_KEY = "flagged-world-map-panel-split";
const CITY_EDITOR_PASSWORD = "ikegaya.naoki";
const MAP_PROJECTION_TYPES = {
  natural: {
    create: () => d3.geoNaturalEarth1(),
    label: "Natural",
  },
  mercator: {
    create: () => d3.geoMercator(),
    label: "Mercator",
  },
};

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
const layoutElement = document.querySelector(".layout");
const panelResizerElement = document.getElementById("panel-resizer");
const heroLeadElement = document.querySelector(".hero .lead");
const cityListElement = document.getElementById("city-list");
const cityEditorElement = document.getElementById("city-editor");
const photoCarouselElement = document.getElementById("photo-carousel");
const photoGridElement = document.getElementById("photo-grid");
const conferencePhotoTrack = document.getElementById("conference-photo-track");
const conferencePhotoCaption = document.getElementById("conference-photo-caption");
const photoSourceBadgeElement = document.getElementById("photo-source-badge");
const conferencePhotoPrevButton = document.getElementById("conference-photo-prev");
const conferencePhotoNextButton = document.getElementById("conference-photo-next");
const photoViewCarouselButton = document.getElementById("photo-view-carousel");
const photoViewGridButton = document.getElementById("photo-view-grid");
const photoUploadCountElement = document.getElementById("photo-upload-count");
const photoLightboxElement = document.getElementById("photo-lightbox");
const photoLightboxImageElement = document.getElementById("photo-lightbox-image");
const photoLightboxCloseButton = document.getElementById("photo-lightbox-close");
const photoDeleteDialogElement = document.getElementById("photo-delete-dialog");
const photoDeletePasswordElement = document.getElementById("photo-delete-password");
const photoDeleteAdminElement = document.getElementById("photo-delete-admin");
const photoDeleteStatusElement = document.getElementById("photo-delete-status");
const photoDeleteCancelButton = document.getElementById("photo-delete-cancel");
const photoDeleteConfirmButton = document.getElementById("photo-delete-confirm");
const quickGuideElement = document.getElementById("quick-guide");
const quickGuideTitleElement = document.getElementById("quick-guide-title");
const quickGuideTextElement = document.getElementById("quick-guide-text");
const quickGuideStepElement = document.getElementById("quick-guide-step");
const quickGuidePrevButton = document.getElementById("quick-guide-prev");
const quickGuideNextButton = document.getElementById("quick-guide-next");
const quickGuideCloseButton = document.getElementById("quick-guide-close");
const quickGuideToggleButton = document.getElementById("quick-guide-toggle");
const hostingCitiesChartButton = document.getElementById("hosting-cities-chart-button");
const toggleCityEditorButton = document.getElementById("toggle-city-editor");
const authGateElement = document.getElementById("auth-gate");
const authFormElement = document.getElementById("auth-form");
const authPasswordElement = document.getElementById("auth-password");
const authStatusElement = document.getElementById("auth-status");
const authLogoutButton = document.getElementById("auth-logout-button");
const zoomInButton = document.getElementById("zoom-in-button");
const zoomOutButton = document.getElementById("zoom-out-button");
const zoomResetButton = document.getElementById("zoom-reset-button");
const projectionNaturalButton = document.getElementById("projection-natural-earth");
const projectionMercatorButton = document.getElementById("projection-mercator");
const projectionGlobeToggleButton = document.getElementById("projection-globe-toggle");
const cityAutoPlayToggleButton = document.getElementById("city-autoplay-toggle");
const cityAutoPlayStatusElement = document.getElementById("city-autoplay-status");
const upcomingVisibilityToggleButton = document.getElementById("upcoming-visibility-toggle");
const sortButtons = document.querySelectorAll("[data-sort-key]");
const conferenceFilterButtons = document.querySelectorAll("[data-conference-filter]");

let activeCityIndex = 0;
let worldDataPromise;
let mapState;
let currentSortKey = "eventDate";
let currentConferenceFilter = "all";
let isCityEditorVisible = false;
let currentPhotoIndex = 0;
let photoCarouselTimerId = null;
let currentPhotoViewMode = "grid";
let cityAutoPlayTimerId = null;
let cityAutoPlayResumeTimerId = null;
let isCityAutoPlayEnabled = false;
let isUpcomingVisible = false;
let cityListResizeObserver;
let photoGridResizeObserver;
let quickGuideStepIndex = 0;
let appBootstrapped = false;
let isViewerAuthenticated = false;
let isViewerPasswordConfigured = false;
let pendingPhotoDeleteResolver = null;
let currentEditorPhotoSourceMode = "public";
let currentMapViewMode = loadStoredMapViewMode();
let currentMapProjectionType = loadStoredMapProjectionType();
let currentZoomFactor = getDefaultZoomFactor();
let currentPanelSplit = loadStoredPanelSplit();
let panelResizeFrameId = null;

const QUICK_GUIDE_STEPS = [
  {
    selector: ".map-panel",
    title: "World map",
    text: "選択中の開催都市に合わせて地図が回転します．右上のボタンで拡大・縮小できます．開催都市をクリックすると，会議名と都市名が表示されます．",
  },
  {
    selector: ".photo-panel",
    title: "Conference Photo",
    text: "会議写真をスライド表示または一覧表示で確認できます．画像を追加するとここに共有表示されます．アップロードアイコンから追加できます．",
  },
  {
    selector: ".sidebar",
    title: "Hosting Cities",
    text: "開催都市カードの一覧です．カードをクリックすると地図と写真がその都市に切り替わります．HOSTING CITIESをクリックすると開催都市の一覧表が表示されます．",
  },
];

initializeViewerAuth();

zoomInButton.addEventListener("click", () => {
  updateZoom(1.2);
});

zoomOutButton.addEventListener("click", () => {
  updateZoom(1 / 1.2);
});

zoomResetButton.addEventListener("click", () => {
  currentZoomFactor = getDefaultZoomFactor();
  redrawMap();
});

projectionNaturalButton?.addEventListener("click", () => {
  setMapProjectionType("natural");
});

projectionMercatorButton?.addEventListener("click", () => {
  setMapProjectionType("mercator");
});

projectionGlobeToggleButton?.addEventListener("click", () => {
  setMapViewMode(currentMapViewMode === "globe" ? "flat" : "globe");
});

attachPanelResize();

authFormElement?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = String(authPasswordElement?.value || "").trim();
  if (!password) {
    setAuthStatus("パスワードを入力してください", { isError: true });
    return;
  }

  setAuthStatus("ログイン中...");
  try {
    const response = await fetch("./api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ password }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
      throw new Error(result?.message || "ログインできませんでした");
    }

    isViewerPasswordConfigured = true;
    if (authPasswordElement) {
      authPasswordElement.value = "";
    }
    setAuthStatus("");
    setViewerAuthenticated(true);
    startApp();
  } catch (error) {
    setAuthStatus(error?.message || "ログインできませんでした", { isError: true });
  }
});

authLogoutButton?.addEventListener("click", async () => {
  try {
    await fetch("./api/auth/logout", { method: "POST", headers: { Accept: "application/json" } });
  } catch (error) {
    console.error("Failed to logout.", error);
  }
  window.location.reload();
});

toggleCityEditorButton.addEventListener("click", () => {
  if (!isCityEditorVisible) {
    const password = window.prompt("編集ウィンドウを表示するにはパスワードを入力してください。");
    if (password === null) {
      return;
    }
    if (password !== CITY_EDITOR_PASSWORD) {
      setSaveStatus("パスワードが違います");
      return;
    }
  }

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

quickGuidePrevButton?.addEventListener("click", () => {
  quickGuideStepIndex = Math.max(0, quickGuideStepIndex - 1);
  renderQuickGuideStep();
});

quickGuideNextButton?.addEventListener("click", () => {
  if (quickGuideStepIndex >= QUICK_GUIDE_STEPS.length - 1) {
    dismissQuickGuide();
    return;
  }

  quickGuideStepIndex += 1;
  renderQuickGuideStep();
});

quickGuideCloseButton?.addEventListener("click", dismissQuickGuide);
quickGuideToggleButton?.addEventListener("click", () => {
  if (quickGuideElement?.classList.contains("is-hidden")) {
    openQuickGuide();
    return;
  }

  hideQuickGuide();
});

hostingCitiesChartButton?.addEventListener("click", () => {
  window.open(
    "./cities-chart.html",
    "hosting-cities-timeline",
    "popup=yes,width=1400,height=900,resizable=yes,scrollbars=yes",
  );
});

cityAutoPlayToggleButton?.addEventListener("click", () => {
  if (isCityAutoPlayEnabled) {
    stopCityAutoPlay();
    return;
  }

  isCityAutoPlayEnabled = true;
  startCityAutoPlay();
});

photoDeleteCancelButton?.addEventListener("click", () => {
  resolvePhotoDeleteDialog(null);
});

photoDeleteConfirmButton?.addEventListener("click", () => {
  const password = String(photoDeletePasswordElement?.value || "").trim();
  if (!password) {
    setPhotoDeleteStatus("パスワードを入力してください");
    photoDeletePasswordElement?.focus();
    return;
  }

  resolvePhotoDeleteDialog({
    password,
    useAdminPassword: Boolean(photoDeleteAdminElement?.checked),
  });
});

photoDeleteDialogElement?.addEventListener("click", (event) => {
  const target = event.target;
  if (
    target === photoDeleteDialogElement ||
    (target instanceof HTMLElement && target.classList.contains("photo-delete-dialog-backdrop"))
  ) {
    resolvePhotoDeleteDialog(null);
  }
});

window.addEventListener(
  "resize",
  debounce(() => {
    initializeMap().catch((error) => {
      console.error("Failed to reinitialize map.", error);
    });
    fitHeroLeadText();
    if (!quickGuideElement?.classList.contains("is-hidden")) {
      renderQuickGuideStep();
    }
  }, 120),
);

window.addEventListener("message", (event) => {
  if (event.data?.type !== "select-city-from-timeline") {
    return;
  }

  window.selectCityFromTimelinePopup?.(Number(event.data.index));
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && pendingPhotoDeleteResolver) {
    resolvePhotoDeleteDialog(null);
  }
});

window.addEventListener("message", (event) => {
  if (event.data?.type !== "upload-photos-to-city") {
    return;
  }

  handleUploadedPhotosMessage(event.data)
    .then((result) => {
      event.source?.postMessage(
        {
          type: "upload-photos-result",
          ok: true,
          count: result.count,
          message: result.message,
        },
        "*",
      );
    })
    .catch((error) => {
      event.source?.postMessage(
        {
          type: "upload-photos-result",
          ok: false,
          message: error?.message || "画像の保存に失敗しました",
        },
        "*",
      );
      console.error("Failed to import uploaded photos.", error);
      setSaveStatus("画像の保存に失敗しました");
    });
});

window.addEventListener("message", (event) => {
  if (event.data?.type !== "server-uploaded-photos") {
    return;
  }

  const cityIndex = Number(event.data.cityIndex);
  const uploadedPhotos = Array.isArray(event.data.photos)
    ? event.data.photos.map((entry) => normalizePhotoEntry(entry)).filter(Boolean)
    : [];

  if (!Number.isInteger(cityIndex) || cityIndex < 0 || cityIndex >= cities.length || uploadedPhotos.length === 0) {
    return;
  }

  cities[cityIndex].photos = mergeUniquePhotoEntries(cities[cityIndex].photos, uploadedPhotos);

  if (cityIndex === activeCityIndex) {
    renderCityEditor(cities[activeCityIndex]);
    renderConferencePhoto(cities[activeCityIndex]);
  }

  renderCityList(cities, activeCityIndex);
  redrawMap();
  setSaveStatus(`${uploadedPhotos.length}件の画像を追加しました`);
});

function renderCityList(items, selectedIndex) {
  cityListElement.innerHTML = getSortedEntries(getVisibleCityEntries(items))
    .map(
      ({ city, index }) => {
        const hasPhotos = getCityPhotos(city).length > 0;
        return `
        <button
          type="button"
          class="city-card type-${conferenceTypeToToken(normalizeConferenceType(city.conferenceType))}${city.isUpcoming ? " is-upcoming" : ""}${index === selectedIndex ? " is-active" : ""}"
          data-city-index="${index}"
          data-conference-type="${escapeHtml(normalizeConferenceType(city.conferenceType))}"
          aria-pressed="${index === selectedIndex}"
        >
          ${hasPhotos ? '<img src="./images/logo/logo-photo.svg" alt="写真あり" class="city-card-photo-badge" />' : ""}
          <span class="comment">${city.comment}</span>
          <span class="city-card-header">
            <span class="city-card-title">
              <span class="flag">${city.flag}</span>
              <span>${city.name}${city.eventDate ? ` ${city.eventDate}` : ""}</span>
            </span>
            <span class="country">${city.country}</span>
          </span>
	      </button>
	    `;
      },
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
    const title = card.querySelector(".city-card-title");
    const country = card.querySelector(".country");
    if (!title || !country) {
      return;
    }

    const cardWidth = card.clientWidth || 210;
    const titleSize = clamp(cardWidth * 0.0042, 0.74, 0.94);
    const commentSize = clamp(cardWidth * 0.0045, 0.82, 1.04);
    const countrySize = titleSize;
    const flagSize = clamp(cardWidth * 0.0072, 1.14, 1.56);

    card.style.setProperty("--card-title-size", `${titleSize}rem`);
    card.style.setProperty("--card-comment-size", `${commentSize}rem`);
    card.style.setProperty("--card-country-size", `${countrySize}rem`);
    card.style.setProperty("--card-flag-size", `${flagSize}rem`);

    if (title.scrollWidth > title.clientWidth || country.scrollWidth > country.clientWidth) {
      const shrinkRatio = Math.min(title.clientWidth / title.scrollWidth || 1, country.clientWidth / country.scrollWidth || 1);
      if (shrinkRatio < 1) {
        card.style.setProperty("--card-title-size", `${Math.max(titleSize * shrinkRatio * 0.96, 0.62)}rem`);
        card.style.setProperty("--card-comment-size", `${Math.max(commentSize * shrinkRatio * 0.98, 0.72)}rem`);
        card.style.setProperty("--card-country-size", `${Math.max(countrySize * shrinkRatio * 0.96, 0.6)}rem`);
        card.style.setProperty("--card-flag-size", `${Math.max(flagSize * shrinkRatio, 0.96)}rem`);
      }
    }
  });
}

function observeCityCardSizing() {
  cityListResizeObserver?.disconnect();
  if (!cityListElement || typeof ResizeObserver === "undefined") {
    return;
  }

  cityListResizeObserver = new ResizeObserver(() => {
    requestAnimationFrame(() => {
      fitCityCardsText(cityListElement);
    });
  });
  cityListResizeObserver.observe(cityListElement);
}

function observePhotoGridSizing() {
  photoGridResizeObserver?.disconnect();
  if (!photoGridElement || typeof ResizeObserver === "undefined") {
    return;
  }

  photoGridResizeObserver = new ResizeObserver(() => {
    requestAnimationFrame(() => {
      syncPhotoGridLayout();
    });
  });
  photoGridResizeObserver.observe(photoGridElement);
}


function renderCityEditor(city) {
  currentEditorPhotoSourceMode = getCityPhotoSourceMode(city);
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
        <span class="editor-label-row">
          <span class="editor-label">写真ファイル名</span>
          <label class="editor-check editor-check-inline">
            <input name="photoSourceMode" type="checkbox"${currentEditorPhotoSourceMode === "original" ? " checked" : ""} />
            <span class="editor-check-label">originalで表示する</span>
          </label>
        </span>
        <textarea name="photos" rows="4" placeholder="./images/example-1.jpg&#10;./images/example-2.jpg">${escapeHtml(
          serializeCityPhotoPaths(city),
        )}</textarea>
      </label>
      <label class="editor-field">
        <span class="editor-label-row">
          <span class="editor-label">写真タイトル</span>
          <span class="editor-label-spacer" aria-hidden="true"></span>
        </span>
        <textarea name="photoTitles" rows="4" placeholder="会場外観&#10;会場内">${escapeHtml(
          serializeCityPhotoTitles(city),
        )}</textarea>
      </label>
      <label class="editor-field">
        <span class="editor-label-row">
          <span class="editor-label">写真提供者</span>
          <span class="editor-label-spacer" aria-hidden="true"></span>
        </span>
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
    const handleFieldEdit = (event) => {
      const fieldName = event.target.name;
      if (fieldName === "latitude" || fieldName === "longitude") {
        return;
      }
      if (fieldName === "photoSourceMode") {
        currentEditorPhotoSourceMode = event.target.checked ? "original" : "public";
        cities.forEach((entry) => {
          entry.photoSourceMode = currentEditorPhotoSourceMode;
        });
        applyPhotoSourceModeToAllCities(currentEditorPhotoSourceMode);
        renderCityEditor(cities[activeCityIndex]);
        renderCityList(cities, activeCityIndex);
        renderConferencePhoto(cities[activeCityIndex]);
        redrawMap();
        return;
      }
      if (fieldName === "photos") {
        cities[activeCityIndex].photos = mergePhotoEntries(
          event.target.value,
          cityEditorElement.querySelector('[name="photoTitles"]')?.value || "",
          cityEditorElement.querySelector('[name="photoCredits"]')?.value || "",
          getCityPhotos(cities[activeCityIndex]),
        );
      } else if (fieldName === "photoTitles") {
        cities[activeCityIndex].photos = mergePhotoEntries(
          cityEditorElement.querySelector('[name="photos"]')?.value || "",
          event.target.value,
          cityEditorElement.querySelector('[name="photoCredits"]')?.value || "",
          getCityPhotos(cities[activeCityIndex]),
        );
      } else if (fieldName === "photoCredits") {
        cities[activeCityIndex].photos = mergePhotoEntries(
          cityEditorElement.querySelector('[name="photos"]')?.value || "",
          cityEditorElement.querySelector('[name="photoTitles"]')?.value || "",
          event.target.value,
          getCityPhotos(cities[activeCityIndex]),
        );
      } else {
        cities[activeCityIndex][fieldName] =
          event.target.type === "checkbox" ? event.target.checked : event.target.value;
      }
      renderCityList(cities, activeCityIndex);
      renderConferencePhoto(cities[activeCityIndex]);
      syncCityActions();
      redrawMap();
    };

    field.addEventListener("input", handleFieldEdit);
    field.addEventListener("change", handleFieldEdit);
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

upcomingVisibilityToggleButton?.addEventListener("click", () => {
  isUpcomingVisible = !isUpcomingVisible;
  syncUpcomingVisibilityButton();
  syncActiveCityWithFilter();
  renderCityList(cities, activeCityIndex);
  renderCityEditor(cities[activeCityIndex]);
  renderConferencePhoto(cities[activeCityIndex]);
  redrawMap();
  focusCity(cities[activeCityIndex], true);
  syncCityAutoPlay();
});

function syncConferenceFilterActions() {
  conferenceFilterButtons.forEach((button) => {
    const isActive = button.dataset.conferenceFilter === currentConferenceFilter;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function syncUpcomingVisibilityButton() {
  if (!upcomingVisibilityToggleButton) {
    return;
  }

  upcomingVisibilityToggleButton.classList.toggle("is-active", isUpcomingVisible);
  upcomingVisibilityToggleButton.setAttribute("aria-pressed", String(isUpcomingVisible));
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
  applyStoredPanelSplit();
  await hydrateCities();
  await hydrateServerUploads();
  applyPhotoSourceModeToAllCities(getGlobalPhotoSourceMode());
  syncInitialActiveCity();
  setCityEditorVisibility(isCityEditorVisible);
  renderCityList(cities, activeCityIndex);
  observeCityCardSizing();
  observePhotoGridSizing();
  renderCityEditor(cities[activeCityIndex]);
  renderConferencePhoto(cities[activeCityIndex]);
  syncCityActions();
  syncConferenceFilterActions();
  initializeMap().catch((error) => {
    console.error("Failed to initialize map.", error);
  });
  fitHeroLeadText();
  syncCityAutoPlay();
  showQuickGuideIfNeeded();
}

function attachPanelResize() {
  if (!panelResizerElement || !layoutElement) {
    return;
  }

  let dragState = null;

  panelResizerElement.addEventListener("pointerdown", (event) => {
    if (window.innerWidth <= 1100) {
      return;
    }

    const rect = layoutElement.getBoundingClientRect();
    dragState = {
      layoutLeft: rect.left,
      layoutWidth: rect.width,
    };

    panelResizerElement.classList.add("is-dragging");
    panelResizerElement.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  panelResizerElement.addEventListener("pointermove", (event) => {
    if (!dragState) {
      return;
    }

    const resizerSize = panelResizerElement.getBoundingClientRect().width || 10;
    const nextSplit = clamp(((event.clientX - dragState.layoutLeft - resizerSize / 2) / dragState.layoutWidth) * 100, 32, 68);
    currentPanelSplit = nextSplit;
    applyStoredPanelSplit();
    scheduleMapResizeRefresh();
  });

  const finishDrag = (event) => {
    if (!dragState) {
      return;
    }

    persistPanelSplit(currentPanelSplit);
    panelResizerElement.classList.remove("is-dragging");
    if (event && panelResizerElement.hasPointerCapture?.(event.pointerId)) {
      panelResizerElement.releasePointerCapture(event.pointerId);
    }
    dragState = null;
    initializeMap().catch((error) => {
      console.error("Failed to reinitialize map.", error);
    });
  };

  panelResizerElement.addEventListener("pointerup", finishDrag);
  panelResizerElement.addEventListener("pointercancel", finishDrag);

  window.addEventListener("resize", () => {
    applyStoredPanelSplit();
  });
}

function applyStoredPanelSplit() {
  if (!layoutElement) {
    return;
  }

  if (window.innerWidth <= 1100) {
    layoutElement.style.removeProperty("grid-template-columns");
    return;
  }

  const leftPercent = clamp(currentPanelSplit, 32, 68);
  const rightPercent = 100 - leftPercent;
  layoutElement.style.gridTemplateColumns = `minmax(0, ${leftPercent}%) var(--panel-resizer-size) minmax(320px, ${rightPercent}%)`;
}

function scheduleMapResizeRefresh() {
  window.cancelAnimationFrame(panelResizeFrameId);
  panelResizeFrameId = window.requestAnimationFrame(() => {
    panelResizeFrameId = null;
    initializeMap().catch((error) => {
      console.error("Failed to reinitialize map.", error);
    });
  });
}

function loadStoredPanelSplit() {
  try {
    const stored = Number(window.localStorage.getItem(PANEL_SPLIT_STORAGE_KEY));
    return Number.isFinite(stored) ? clamp(stored, 32, 68) : 58;
  } catch (error) {
    return 58;
  }
}

function persistPanelSplit(split) {
  try {
    window.localStorage.setItem(PANEL_SPLIT_STORAGE_KEY, String(clamp(split, 32, 68)));
  } catch (error) {
    console.error("Failed to persist panel split.", error);
  }
}

async function initializeViewerAuth() {
  setViewerAuthenticated(false);

  try {
    const response = await fetch("./api/auth/session", { headers: { Accept: "application/json" } });
    const payload = await response.json().catch(() => null);
    const authenticated = Boolean(payload?.auth?.authenticated);
    const viewerPasswordConfigured = Boolean(payload?.auth?.viewerPasswordConfigured);
    isViewerPasswordConfigured = viewerPasswordConfigured;

    if (!viewerPasswordConfigured || authenticated) {
      setViewerAuthenticated(true);
      startApp();
      return;
    }

    setAuthStatus("会議写真を表示するには共通パスワードが必要です。");
  } catch (error) {
    console.error("Failed to check viewer auth session.", error);
    setAuthStatus("認証状態を確認できませんでした。再読み込みしてください。", { isError: true });
  }
}

function startApp() {
  if (appBootstrapped) {
    return;
  }

  appBootstrapped = true;
  bootstrapApp().catch((error) => {
    console.error("Failed to bootstrap app.", error);
    setSaveStatus("画面の初期化に失敗しました");
  });
}

function setViewerAuthenticated(authenticated) {
  isViewerAuthenticated = Boolean(authenticated);
  document.body.classList.toggle("auth-locked", !isViewerAuthenticated);
  authGateElement?.classList.toggle("is-hidden", isViewerAuthenticated);
  authGateElement?.setAttribute("aria-hidden", String(isViewerAuthenticated));
  authLogoutButton?.classList.toggle("is-hidden", !isViewerAuthenticated || !isViewerPasswordConfigured);
}

function setAuthStatus(message, options = {}) {
  if (!authStatusElement) {
    return;
  }

  authStatusElement.textContent = message;
  authStatusElement.classList.toggle("is-error", Boolean(options.isError));
}

function handleViewerAuthRequired(message) {
  if (!isViewerAuthenticated) {
    return;
  }

  setViewerAuthenticated(false);
  setAuthStatus(message || "認証の有効期限が切れました。もう一度パスワードを入力してください。", { isError: true });
}

function fitHeroLeadText() {
  if (!heroLeadElement) {
    return;
  }

  heroLeadElement.style.removeProperty("font-size");

  if (window.innerWidth > 720) {
    heroLeadElement.style.removeProperty("white-space");
    return;
  }

  heroLeadElement.style.whiteSpace = "nowrap";

  const baseSize = window.innerWidth <= 520 ? 0.72 : 0.8;
  const minSize = window.innerWidth <= 520 ? 0.5 : 0.58;
  let currentSize = baseSize;
  heroLeadElement.style.fontSize = `${currentSize}rem`;

  while (currentSize > minSize && heroLeadElement.scrollWidth > heroLeadElement.clientWidth) {
    currentSize -= 0.02;
    heroLeadElement.style.fontSize = `${currentSize}rem`;
  }
}

function showQuickGuideIfNeeded() {
  if (!quickGuideElement || isQuickGuideDismissed()) {
    return;
  }

  openQuickGuide();
}

function openQuickGuide() {
  if (!quickGuideElement) {
    return;
  }

  quickGuideStepIndex = 0;
  quickGuideElement.classList.remove("is-hidden");
  quickGuideElement.setAttribute("aria-hidden", "false");
  renderQuickGuideStep();
}

function isQuickGuideDismissed() {
  try {
    return window.localStorage.getItem(QUICK_GUIDE_DISMISSED_KEY) === "1";
  } catch (error) {
    return false;
  }
}

function dismissQuickGuide() {
  hideQuickGuide();
  try {
    window.localStorage.setItem(QUICK_GUIDE_DISMISSED_KEY, "1");
  } catch (error) {
    console.error("Failed to persist quick guide dismissal.", error);
  }
}

function hideQuickGuide() {
  if (!quickGuideElement) {
    return;
  }

  clearQuickGuideHighlights();
  quickGuideElement.classList.add("is-hidden");
  quickGuideElement.setAttribute("aria-hidden", "true");
}

function renderQuickGuideStep() {
  if (!quickGuideElement || !quickGuideTitleElement || !quickGuideTextElement || !quickGuideStepElement) {
    return;
  }

  const step = QUICK_GUIDE_STEPS[quickGuideStepIndex];
  if (!step) {
    dismissQuickGuide();
    return;
  }

  quickGuideTitleElement.textContent = step.title;
  quickGuideTextElement.textContent = step.text;
  quickGuideStepElement.textContent = `${quickGuideStepIndex + 1} / ${QUICK_GUIDE_STEPS.length}`;
  quickGuidePrevButton.disabled = quickGuideStepIndex === 0;
  quickGuideNextButton.textContent = quickGuideStepIndex === QUICK_GUIDE_STEPS.length - 1 ? "完了" : "次へ";
  const target = highlightQuickGuideTarget(step.selector);
  ensureQuickGuideTargetVisible(target);
  positionQuickGuideDialog(target);
  window.setTimeout(() => positionQuickGuideDialog(target), 260);
}

function highlightQuickGuideTarget(selector) {
  clearQuickGuideHighlights();
  const target = document.querySelector(selector);
  if (!target) {
    return null;
  }

  target.classList.add("is-guide-highlight");
  return target;
}

function clearQuickGuideHighlights() {
  document.querySelectorAll(".is-guide-highlight").forEach((element) => {
    element.classList.remove("is-guide-highlight");
  });
}

function ensureQuickGuideTargetVisible(target) {
  if (!(target instanceof HTMLElement)) {
    return;
  }

  target.scrollIntoView({
    behavior: "smooth",
    block: "center",
    inline: "nearest",
  });
}

function positionQuickGuideDialog(target) {
  const dialog = quickGuideElement?.querySelector(".quick-guide-dialog");
  if (!dialog) {
    return;
  }

  dialog.style.top = "20px";
  dialog.style.right = "20px";
  dialog.style.left = "auto";
  dialog.style.bottom = "auto";

  if (!(target instanceof HTMLElement)) {
    return;
  }

  const gap = 18;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const targetRect = target.getBoundingClientRect();
  const dialogRect = dialog.getBoundingClientRect();

  let left = targetRect.right + gap;
  if (left + dialogRect.width > viewportWidth - 20) {
    left = targetRect.left - dialogRect.width - gap;
  }
  if (left < 20) {
    left = Math.max(20, viewportWidth - dialogRect.width - 20);
  }

  let top = targetRect.top;
  if (top + dialogRect.height > viewportHeight - 20) {
    top = viewportHeight - dialogRect.height - 20;
  }
  if (top < 20) {
    top = 20;
  }

  const overlapsHorizontally =
    left < targetRect.right + gap && left + dialogRect.width > targetRect.left - gap;
  const overlapsVertically =
    top < targetRect.bottom + gap && top + dialogRect.height > targetRect.top - gap;

  if (overlapsHorizontally && overlapsVertically) {
    const belowTop = targetRect.bottom + gap;
    const aboveTop = targetRect.top - dialogRect.height - gap;
    if (belowTop + dialogRect.height <= viewportHeight - 20) {
      top = belowTop;
    } else if (aboveTop >= 20) {
      top = aboveTop;
    }
  }

  dialog.style.left = `${Math.round(left)}px`;
  dialog.style.top = `${Math.round(top)}px`;
  dialog.style.right = "auto";
  dialog.style.bottom = "auto";
}

async function hydrateServerUploads() {
  try {
    const response = await fetch("./api/uploads", { headers: { Accept: "application/json" } });
    if (response.status === 401) {
      handleViewerAuthRequired("ログイン後に写真を読み込みます。");
      return;
    }
    if (!response.ok) {
      return;
    }

    const payload = await response.json();
    if (!payload || typeof payload !== "object" || !payload.cities) {
      return;
    }

    Object.entries(payload.cities).forEach(([indexKey, entries]) => {
      const cityIndex = Number(indexKey);
      if (!Number.isInteger(cityIndex) || cityIndex < 0 || cityIndex >= cities.length || !Array.isArray(entries)) {
        return;
      }

      cities[cityIndex].photos = mergeServerUploadedPhotoEntries(cities[cityIndex].photos, entries);
    });
  } catch (error) {
    console.error("Failed to load shared uploaded photos.", error);
  }
}

async function initializeMap() {
  const width = mapElement.clientWidth;
  const isCompactViewport = window.innerWidth <= 720;
  const minHeight = isCompactViewport ? 240 : 420;
  const maxHeight = isCompactViewport ? 420 : 760;
  const height = Math.max(minHeight, Math.min(maxHeight, width * 0.62));

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

  const globeGradient = defs
    .append("radialGradient")
    .attr("id", "globe-ocean-gradient")
    .attr("cx", "34%")
    .attr("cy", "28%")
    .attr("r", "72%");

  globeGradient.append("stop").attr("offset", "0%").attr("stop-color", "#edf8fc");
  globeGradient.append("stop").attr("offset", "34%").attr("stop-color", "#c2d9e6");
  globeGradient.append("stop").attr("offset", "68%").attr("stop-color", "#6d93ab");
  globeGradient.append("stop").attr("offset", "100%").attr("stop-color", "#35596c");

  const projection = createMapProjection(currentMapProjectionType).fitExtent(
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
    projectionType: currentMapProjectionType,
    baseScale: projection.scale(),
    path,
    sphere,
    graticule,
    countriesGroup,
    markersGroup,
    countries: [],
  };

  attachMapInteraction();
  syncMapProjectionButtons();

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

  currentZoomFactor = clamp(currentZoomFactor * multiplier, 0.8, 20);
  redrawMap();
}

function createMapProjection(projectionType) {
  if (currentMapViewMode === "globe") {
    return d3.geoOrthographic().clipAngle(90);
  }

  const projectionConfig = MAP_PROJECTION_TYPES[projectionType] || MAP_PROJECTION_TYPES.natural;
  return projectionConfig.create();
}

function setMapProjectionType(projectionType) {
  const normalizedType = MAP_PROJECTION_TYPES[projectionType] ? projectionType : "natural";
  if (currentMapProjectionType === normalizedType) {
    return;
  }

  currentMapProjectionType = normalizedType;
  persistMapProjectionType(normalizedType);
  syncMapProjectionButtons();
  initializeMap().catch((error) => {
    console.error("Failed to reinitialize map.", error);
  });
}

function syncMapProjectionButtons() {
  const isGlobeMode = currentMapViewMode === "globe";
  if (projectionGlobeToggleButton) {
    projectionGlobeToggleButton.classList.toggle("is-active", isGlobeMode);
    projectionGlobeToggleButton.setAttribute("aria-pressed", String(isGlobeMode));
  }

  const projectionButtons = [
    ["natural", projectionNaturalButton],
    ["mercator", projectionMercatorButton],
  ];

  projectionButtons.forEach(([projectionType, button]) => {
    if (!button) {
      return;
    }

    const isActive = currentMapProjectionType === projectionType;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
    button.disabled = isGlobeMode;
  });
}

function loadStoredMapProjectionType() {
  try {
    const stored = String(window.localStorage.getItem(MAP_PROJECTION_STORAGE_KEY) || "").trim();
    return MAP_PROJECTION_TYPES[stored] ? stored : "natural";
  } catch (error) {
    return "natural";
  }
}

function persistMapProjectionType(projectionType) {
  try {
    window.localStorage.setItem(MAP_PROJECTION_STORAGE_KEY, projectionType);
  } catch (error) {
    console.error("Failed to persist map projection.", error);
  }
}

function loadStoredMapViewMode() {
  try {
    return window.localStorage.getItem(MAP_VIEW_MODE_STORAGE_KEY) === "globe" ? "globe" : "flat";
  } catch (error) {
    return "flat";
  }
}

function persistMapViewMode(viewMode) {
  try {
    window.localStorage.setItem(MAP_VIEW_MODE_STORAGE_KEY, viewMode);
  } catch (error) {
    console.error("Failed to persist map view mode.", error);
  }
}

function setMapViewMode(viewMode) {
  const normalizedMode = viewMode === "globe" ? "globe" : "flat";
  if (currentMapViewMode === normalizedMode) {
    return;
  }

  currentMapViewMode = normalizedMode;
  persistMapViewMode(normalizedMode);
  syncMapProjectionButtons();
  initializeMap().catch((error) => {
    console.error("Failed to reinitialize map.", error);
  });
}

function applyZoom() {
  if (!mapState) {
    return;
  }

  mapState.projection.scale(mapState.baseScale * currentZoomFactor);
  syncZoomControls();
}

function getDefaultZoomFactor() {
  return currentMapViewMode === "globe" ? DEFAULT_GLOBE_ZOOM_FACTOR : DEFAULT_FLAT_ZOOM_FACTOR;
}

function syncZoomControls() {
  if (!zoomResetButton) {
    return;
  }

  const defaultZoomFactor = getDefaultZoomFactor();
  const isDefaultZoom = Math.abs(currentZoomFactor - defaultZoomFactor) < 0.0001;
  zoomResetButton.classList.toggle("is-active", isDefaultZoom);
  zoomResetButton.setAttribute("aria-pressed", String(isDefaultZoom));
}

function redrawMap() {
  if (!mapState) {
    return;
  }

  const { path, sphere, graticule, countriesGroup } = mapState;
  applyZoom();
  const isGlobeMode = currentMapViewMode === "globe";

  sphere.classed("is-globe-mode", isGlobeMode);
  sphere.attr("fill", isGlobeMode ? "url(#globe-ocean-gradient)" : "url(#ocean-gradient)");
  graticule.classed("is-globe-mode", isGlobeMode);
  countriesGroup.classed("is-globe-mode", isGlobeMode);

  sphere.attr("d", path);
  graticule.attr("d", path);
  countriesGroup.selectAll("path").attr("d", path);
  syncActiveCountryHighlight();
  drawMarkers(activeCityIndex);
}

function syncActiveCountryHighlight() {
  if (!mapState || !Array.isArray(mapState.countries) || mapState.countries.length === 0) {
    return;
  }

  const activeCity = cities[activeCityIndex];
  const coordinates = Array.isArray(activeCity?.coordinates) ? activeCity.coordinates : null;
  if (!coordinates || coordinates.length < 2) {
    mapState.countriesGroup.selectAll("path").classed("is-active-country", false);
    return;
  }

  const [longitude, latitude] = coordinates;
  const activeCountry = mapState.countries.find((feature) => d3.geoContains(feature, [longitude, latitude])) || null;
  const activeTypeClass = `type-${conferenceTypeToToken(normalizeConferenceType(activeCity?.conferenceType))}`;
  const highlightTypeClasses = ["type-icwe", "type-cwe", "type-apcwe", "type-bbaa", "type-other"];

  mapState.countriesGroup.selectAll("path").each(function applyCountryHighlightClass(feature) {
    const isActiveCountry = feature === activeCountry;
    const selection = d3.select(this);
    selection.classed("is-active-country", isActiveCountry);
    highlightTypeClasses.forEach((className) => {
      selection.classed(className, isActiveCountry && className === activeTypeClass);
    });
  });
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

window.selectCityFromTimelinePopup = (index) => {
  if (!Number.isInteger(index) || index < 0 || index >= cities.length) {
    return;
  }

  if (document.visibilityState === "hidden") {
    window.focus();
  }

  const cityButton = cityListElement?.querySelector(`[data-city-index="${index}"]`);
  if (cityButton instanceof HTMLButtonElement) {
    cityButton.click();
    return;
  }

  selectCity(index, { pauseAutoPlay: true, forceScroll: true });
};

function renderConferencePhoto(city) {
  if (!conferencePhotoTrack || !conferencePhotoCaption || !photoGridElement || !city) {
    return;
  }

  syncPhotoSourceBadge();
  const missingPhotoMessage =
    "この会議での日本風工学会員に関わる集合写真やグループ写真をお持ちの方はご提供ください。\nアップロードされている写真の削除を希望される場合は，運営・学術委員会までご連絡ください．";
  const photos = getCityPhotos(city);
  syncPhotoUploadCount(photos.length);
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
    conferencePhotoTrack.innerHTML = renderPhotoUploadNotice(city, missingPhotoMessage);
    photoGridElement.innerHTML = renderPhotoUploadNotice(city, missingPhotoMessage);
    conferencePhotoCaption.textContent = "";
    updatePhotoControls(photos.length);
    stopPhotoCarousel();
    syncPhotoView();
    bindPhotoUploadTriggers(city);
    syncPhotoGridLayout();
    return;
  }

  conferencePhotoTrack.innerHTML = slides
    .map(
      (photo, index) => `
        <div class="photo-slide">
          ${
            photo.isNotice
              ? renderPhotoUploadNotice(city, missingPhotoMessage)
              : `<img class="photo-image" data-carousel-photo-index="${index}" src="${escapeHtml(getRenderablePhotoSrc(photo))}" alt="${escapeHtml(photo.title || `${city.comment} の関連写真 ${index + 1}`)}" />`
          }
        </div>
      `,
    )
    .join("");
  conferencePhotoTrack.innerHTML = `<div class="photo-strip">${conferencePhotoTrack.innerHTML}</div>`;
  conferencePhotoTrack.querySelectorAll("[data-carousel-photo-index]").forEach((image) => {
    image.addEventListener("dblclick", () => {
      const photoIndex = Number(image.dataset.carouselPhotoIndex);
      openPhotoLightbox(photos[photoIndex]);
    });
  });
  photoGridElement.innerHTML = photos
    .map(
      (photo, index) => `
        <div class="photo-grid-item">
          <button
            type="button"
            class="photo-grid-button"
            data-photo-index="${index}"
            data-photo-title="${escapeHtml(photo.title || "写真タイトル未設定")}"
          >
            <img class="photo-thumb" src="${escapeHtml(getRenderablePhotoSrc(photo))}" alt="${escapeHtml(photo.title || `写真 ${index + 1}`)}" />
          </button>
          ${
            isUploadedPhoto(photo)
              ? `<button type="button" class="photo-delete-button" data-photo-delete-index="${index}" aria-label="画像を削除"><img src="./images/logo/logo-trash.svg.svg" alt="" class="photo-delete-icon" /></button>`
              : ""
          }
        </div>
      `,
    )
    .join("");
  photoGridElement.innerHTML += `
    ${renderPhotoUploadNotice(city, missingPhotoMessage)}
  `;
  photoGridElement.querySelectorAll("[data-photo-index]").forEach((button) => {
    button.addEventListener("click", () => {
      currentPhotoIndex = Number(button.dataset.photoIndex);
      setPhotoViewMode("carousel");
      updateVisiblePhoto();
      startPhotoCarousel();
    });
  });
  photoGridElement.querySelectorAll("[data-photo-delete-index]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const photoIndex = Number(button.dataset.photoDeleteIndex);
      await deleteUploadedPhoto(activeCityIndex, photos[photoIndex]);
    });
  });
  bindPhotoUploadTriggers(city);
  syncPhotoGridLayout();

  updateVisiblePhoto();
  syncPhotoView();
}

function isUploadedPhoto(photo) {
  const src = String(photo?.src || "").trim();
  return (
    src.startsWith("./data/uploaded/public/") ||
    src.startsWith("./data/uploaded/original/") ||
    src.startsWith("./images/uploaded/")
  );
}

function openPhotoLightbox(photo) {
  if (!photoLightboxElement || !photoLightboxImageElement || !photo?.src) {
    return;
  }

  stopPhotoCarousel();
  photoLightboxImageElement.src = getRenderablePhotoSrc(photo);
  photoLightboxImageElement.alt = photo.title || "拡大写真";
  photoLightboxElement.classList.remove("is-hidden");
  photoLightboxElement.setAttribute("aria-hidden", "false");
}

function closePhotoLightbox() {
  if (!photoLightboxElement || !photoLightboxImageElement) {
    return;
  }

  photoLightboxElement.classList.add("is-hidden");
  photoLightboxElement.setAttribute("aria-hidden", "true");
  photoLightboxImageElement.removeAttribute("src");
  photoLightboxImageElement.alt = "";
  if (currentPhotoViewMode === "carousel") {
    startPhotoCarousel();
  }
}

async function deleteUploadedPhoto(cityIndex, photo) {
  if (!photo || !isUploadedPhoto(photo)) {
    return;
  }

  let dialogOptions = {};
  while (true) {
    const deleteOptions = await openPhotoDeleteDialog(dialogOptions);
    if (!deleteOptions) {
      return;
    }

    try {
      const response = await fetch("./api/delete-upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          cityIndex,
          src: photo.src,
          password: deleteOptions.password,
          useAdminPassword: deleteOptions.useAdminPassword,
        }),
      });

      if (response.status === 401) {
        handleViewerAuthRequired();
        throw new Error("再ログイン後に削除してください");
      }

      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        if (response.status === 403) {
          const message = result?.message || "パスワードが違います";
          setSaveStatus(message);
          dialogOptions = {
            preserveAdminMode: deleteOptions.useAdminPassword,
            initialMessage: message,
          };
          continue;
        }
        throw new Error(result?.message || "画像を削除できませんでした");
      }

      cities[cityIndex].photos = getCityPhotos(cities[cityIndex]).filter((entry) => entry.src !== photo.src);
      if (cityIndex === activeCityIndex) {
        renderCityEditor(cities[activeCityIndex]);
        renderConferencePhoto(cities[activeCityIndex]);
      }
      renderCityList(cities, activeCityIndex);
      redrawMap();
      setSaveStatus("画像を削除しました");
      return;
    } catch (error) {
      console.error("Failed to delete uploaded photo.", error);
      setSaveStatus(error?.message || "画像を削除できませんでした");
      return;
    }
  }
}

function openPhotoDeleteDialog(options = {}) {
  if (!photoDeleteDialogElement || !photoDeletePasswordElement || !photoDeleteAdminElement) {
    const fallbackPassword = window.prompt("削除用パスワードを入力してください");
    return Promise.resolve(
      fallbackPassword
        ? {
            password: fallbackPassword,
            useAdminPassword: false,
          }
        : null,
    );
  }

  if (pendingPhotoDeleteResolver) {
    resolvePhotoDeleteDialog(null);
  }

  photoDeleteDialogElement.classList.remove("is-hidden");
  photoDeleteDialogElement.setAttribute("aria-hidden", "false");
  photoDeletePasswordElement.value = "";
  photoDeleteAdminElement.checked = Boolean(options.preserveAdminMode);
  setPhotoDeleteStatus(String(options.initialMessage || "").trim());
  window.setTimeout(() => {
    photoDeletePasswordElement.focus();
  }, 0);

  return new Promise((resolve) => {
    pendingPhotoDeleteResolver = resolve;
  });
}

function resolvePhotoDeleteDialog(result) {
  if (!pendingPhotoDeleteResolver || !photoDeleteDialogElement || !photoDeletePasswordElement || !photoDeleteAdminElement) {
    return;
  }

  const resolver = pendingPhotoDeleteResolver;
  pendingPhotoDeleteResolver = null;
  photoDeleteDialogElement.classList.add("is-hidden");
  photoDeleteDialogElement.setAttribute("aria-hidden", "true");
  photoDeletePasswordElement.value = "";
  photoDeleteAdminElement.checked = false;
  setPhotoDeleteStatus("");
  resolver(result);
}

function setPhotoDeleteStatus(message) {
  if (!photoDeleteStatusElement) {
    return;
  }

  photoDeleteStatusElement.textContent = String(message || "").trim();
}

function syncPhotoGridLayout() {
  if (!photoGridElement) {
    return;
  }

  const photoItems = photoGridElement.querySelectorAll(".photo-grid-button");
  const noticeItems = photoGridElement.querySelectorAll(".photo-empty");
  const itemCount = photoItems.length + noticeItems.length;
  if (itemCount === 0) {
    return;
  }

  const availableWidth = photoGridElement.clientWidth;
  const availableHeight = photoGridElement.clientHeight;
  if (!availableWidth || !availableHeight) {
    return;
  }

  const photoCount = photoItems.length;
  let preferredColumns = 2;
  if (photoCount >= 13) {
    preferredColumns = 5;
  } else if (photoCount >= 10) {
    preferredColumns = 4;
  } else if (photoCount >= 5) {
    preferredColumns = 3;
  }
  const gap = 1;
  const bestColumns = preferredColumns;
  const tileSize = Math.max(Math.floor((availableWidth - gap * (bestColumns - 1)) / bestColumns), 48);
  const noticePadding = Math.max(4, Math.min(10, Math.floor(tileSize * 0.08)));

  photoGridElement.style.setProperty("--photo-grid-columns", String(bestColumns));
  photoGridElement.style.setProperty("--photo-grid-tile-size", `${tileSize}px`);
  photoGridElement.style.setProperty("--photo-grid-gap", `${gap}px`);
  photoGridElement.style.setProperty("--photo-empty-padding", `${noticePadding}px`);
  fitPhotoNoticeTiles(tileSize);
}

function fitPhotoNoticeTiles(tileSize) {
  if (!photoGridElement) {
    return;
  }

  photoGridElement.querySelectorAll(".photo-empty").forEach((noticeElement) => {
    if (!(noticeElement instanceof HTMLElement)) {
      return;
    }

    const maxFontSize = Math.max(12, Math.min(18, tileSize * 0.12));
    const minFontSize = Math.max(8, Math.min(11, tileSize * 0.07));
    const lineHeight = 1.28;

    noticeElement.style.fontSize = `${maxFontSize}px`;
    noticeElement.style.lineHeight = String(lineHeight);

    let currentFontSize = maxFontSize;
    while (
      currentFontSize > minFontSize &&
      (noticeElement.scrollHeight > noticeElement.clientHeight ||
        noticeElement.scrollWidth > noticeElement.clientWidth)
    ) {
      currentFontSize -= 0.5;
      noticeElement.style.fontSize = `${currentFontSize}px`;
    }
  });
}

function renderPhotoUploadNotice(city, message) {
  return `
    <button
      type="button"
      class="photo-empty photo-upload-trigger"
      data-photo-upload-city-index="${activeCityIndex}"
      aria-label="${escapeHtml(city.comment || city.name || "写真アップロード")}"
    >
      ${escapeHtml(message)}
    </button>
  `;
}

function bindPhotoUploadTriggers(city) {
  document.querySelectorAll("[data-photo-upload-city-index]").forEach((button) => {
    button.addEventListener("click", () => {
      openPhotoUploadPopup(activeCityIndex, city);
    });
  });
}

function openPhotoUploadPopup(cityIndex, city) {
  if (!Number.isInteger(cityIndex) || cityIndex < 0 || cityIndex >= cities.length) {
    return;
  }

  const url = new URL("./photo-upload.html", window.location.href);
  url.searchParams.set("cityIndex", String(cityIndex));
  url.searchParams.set("cityName", city.name || "");
  url.searchParams.set("comment", city.comment || "");
  url.searchParams.set("conferenceType", city.conferenceType || "");
  url.searchParams.set("country", city.country || "");
  url.searchParams.set("eventDate", city.eventDate || "");

  window.open(
    url.toString(),
    PHOTO_UPLOAD_POPUP_NAME,
    "popup=yes,width=460,height=620,resizable=yes,scrollbars=yes",
  );
}

async function handleUploadedPhotosMessage(data) {
  const cityIndex = Number(data.cityIndex);
  const uploadedFiles = Array.isArray(data.files) ? data.files : [];

  if (!Number.isInteger(cityIndex) || cityIndex < 0 || cityIndex >= cities.length || uploadedFiles.length === 0) {
    throw new Error("保存対象の都市または画像データが不正です");
  }

  const savedPhotos = await saveUploadedPhotosToProjectDirectory(cities[cityIndex], uploadedFiles);
  if (savedPhotos.length === 0) {
    throw new Error("保存できる画像がありませんでした");
  }

  const existingPhotos = getCityPhotos(cities[cityIndex]);
  cities[cityIndex].photos = [...existingPhotos, ...savedPhotos];

  if (cityIndex === activeCityIndex) {
    renderCityEditor(cities[activeCityIndex]);
    renderConferencePhoto(cities[activeCityIndex]);
  }

  renderCityList(cities, activeCityIndex);
  redrawMap();
  setSaveStatus(`${savedPhotos.length}件の画像を保存しました`);
  return {
    count: savedPhotos.length,
    message: `${savedPhotos.length}件の画像を保存しました`,
  };
}

async function saveUploadedPhotosToProjectDirectory(city, uploadedFiles) {
  if (!("showDirectoryPicker" in window)) {
    throw new Error("このブラウザはディレクトリ保存に対応していません。localhost 上の Chrome 系ブラウザで開いてください。");
  }

  const projectDirectoryHandle = await getProjectDirectoryHandle();
  const dataDirectoryHandle = await projectDirectoryHandle.getDirectoryHandle("data", { create: true });
  const uploadsDirectoryHandle = await dataDirectoryHandle.getDirectoryHandle("uploaded", { create: true });
  const publicDirectoryHandle = await uploadsDirectoryHandle.getDirectoryHandle("public", { create: true });
  const cityDirectoryHandle = await publicDirectoryHandle.getDirectoryHandle(buildPhotoDirectoryName(city), { create: true });

  const savedPhotos = [];

  for (let index = 0; index < uploadedFiles.length; index += 1) {
    const uploadedFile = uploadedFiles[index];
    if (!uploadedFile || !(uploadedFile.buffer instanceof ArrayBuffer)) {
      continue;
    }

    const fileName = await createUniquePhotoFileName(cityDirectoryHandle, uploadedFile.name, index);
    const fileHandle = await cityDirectoryHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(new Blob([uploadedFile.buffer], { type: uploadedFile.type || "application/octet-stream" }));
    await writable.close();

    savedPhotos.push({
      src: `./data/uploaded/public/${buildPhotoDirectoryName(city)}/${fileName}`,
      title: String(uploadedFile.title || "").trim(),
      credit: String(uploadedFile.credit || "").trim(),
    });
  }

  return savedPhotos;
}

function buildPhotoDirectoryName(city) {
  const conferenceType = slugifyFileName(city.conferenceType || "other");
  const year = String(city.eventDate || "unknown").trim() || "unknown";
  const country = slugifyFileName(city.country || "country");
  const name = slugifyFileName(city.name || "city");
  return [conferenceType || "other", year, country || "country", name || "city"].join("-").slice(0, 160);
}

async function createUniquePhotoFileName(directoryHandle, originalName, index) {
  const parsedName = String(originalName || `photo-${index + 1}`).trim();
  const extensionMatch = parsedName.match(/(\.[a-z0-9]+)$/i);
  const extension = extensionMatch ? extensionMatch[1].toLowerCase() : ".png";
  const baseName = slugifyFileName(parsedName.replace(/(\.[a-z0-9]+)$/i, "")) || `photo-${index + 1}`;

  let candidate = `${baseName}${extension}`;
  let suffix = 1;

  while (await fileExistsInDirectory(directoryHandle, candidate)) {
    suffix += 1;
    candidate = `${baseName}-${suffix}${extension}`;
  }

  return candidate;
}

async function fileExistsInDirectory(directoryHandle, fileName) {
  try {
    await directoryHandle.getFileHandle(fileName);
    return true;
  } catch (error) {
    if (error?.name === "NotFoundError") {
      return false;
    }
    throw error;
  }
}

function slugifyFileName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function getCityPhotos(city) {
  if (Array.isArray(city.photos)) {
    const sourceMode = getCityPhotoSourceMode(city);
    return city.photos
      .map((entry) => normalizePhotoEntry(entry))
      .map((entry) => {
        if (!entry) {
          return null;
        }

        const selectedSrc = getPhotoSourceForMode(entry, sourceMode) || entry.src;
        return {
          ...entry,
          src: selectedSrc,
        };
      })
      .filter((entry) => entry && entry.src);
  }

  const singlePhoto = String(city.photo || "").trim();
  return singlePhoto ? [{ src: singlePhoto, title: "" }] : [];
}

function getCityPhotoSourceMode(city) {
  const globalMode = readConfiguredPhotoSourceMode();
  if (globalMode) {
    return globalMode;
  }

  return String(city?.photoSourceMode || "").trim() === "original" ? "original" : "public";
}

function getGlobalPhotoSourceMode() {
  const configuredMode = readConfiguredPhotoSourceMode();
  if (configuredMode) {
    return configuredMode;
  }

  return cities.some((city) => getCityPhotoSourceMode(city) === "original") ? "original" : "public";
}

function readConfiguredPhotoSourceMode() {
  const configuredMode = String(window.__PHOTO_SOURCE_MODE__ || "").trim();
  if (configuredMode === "original" || configuredMode === "public") {
    return configuredMode;
  }

  return "";
}

function syncPhotoSourceBadge() {
  if (!photoSourceBadgeElement) {
    return;
  }

  const isOriginalMode = getGlobalPhotoSourceMode() === "original";
  photoSourceBadgeElement.classList.toggle("is-hidden", !isOriginalMode);
}

function applyPhotoSourceModeToAllCities(sourceMode) {
  const normalizedMode = sourceMode === "original" ? "original" : "public";
  window.__PHOTO_SOURCE_MODE__ = normalizedMode;
  cities.forEach((city) => {
    city.photoSourceMode = normalizedMode;
    if (!Array.isArray(city.photos)) {
      return;
    }

    city.photos = city.photos
      .map((entry) => normalizePhotoEntry(entry))
      .map((entry) => {
        if (!entry || !isUploadedPhoto(entry)) {
          return entry;
        }

        return {
          ...entry,
          src: getPhotoSourceForMode(entry, normalizedMode) || entry.src,
        };
      })
      .filter(Boolean);
  });
}

function normalizePhotoEntry(entry) {
  if (typeof entry === "string") {
    const [srcPart, ...titleParts] = entry.split("|");
    const src = String(srcPart || "").trim();
    const title = titleParts.join("|").trim();
    return src ? { src, title, credit: "", publicSrc: "", originalSrc: "", publicPath: "", originalPath: "" } : null;
  }

  if (!entry || typeof entry !== "object") {
    return null;
  }

  const src = String(entry.src || "").trim();
  const title = String(entry.title || "").trim();
  const credit = String(entry.credit || "").trim();
  const explicitPublicSrc = String(entry.publicSrc || "").trim();
  const explicitOriginalSrc = String(entry.originalSrc || "").trim();
  const publicSrc =
    explicitPublicSrc ||
    (src.startsWith("./data/uploaded/public/") ? src : "") ||
    derivePublicUploadedSrc(explicitOriginalSrc || src);
  const originalSrc = explicitOriginalSrc || deriveOriginalUploadedSrc(explicitPublicSrc || src);
  const publicPath = String(entry.publicPath || "").trim() || derivePublicArchivePath(publicSrc || src);
  const originalPath = String(entry.originalPath || "").trim() || deriveOriginalArchivePath(originalSrc || src);
  const normalizedSrc = publicSrc || originalSrc || src;
  return src
    ? {
        src: normalizedSrc,
        title,
        credit,
        publicSrc,
        originalSrc,
        publicPath,
        originalPath,
        originalName: String(entry.originalName || "").trim(),
      }
    : null;
}

function deriveOriginalUploadedSrc(value) {
  const normalizedValue = String(value || "").trim();
  if (normalizedValue.startsWith("./data/uploaded/original/")) {
    return normalizedValue;
  }
  if (normalizedValue.startsWith("./data/uploaded/public/")) {
    return normalizedValue.replace("./data/uploaded/public/", "./data/uploaded/original/");
  }
  if (normalizedValue.startsWith("./images/uploaded/")) {
    return normalizedValue.replace("./images/uploaded/", "./data/uploaded/original/");
  }
  return "";
}

function derivePublicUploadedSrc(value) {
  const normalizedValue = String(value || "").trim();
  if (normalizedValue.startsWith("./data/uploaded/public/")) {
    return normalizedValue;
  }
  if (normalizedValue.startsWith("./data/uploaded/original/")) {
    return normalizedValue.replace("./data/uploaded/original/", "./data/uploaded/public/");
  }
  if (normalizedValue.startsWith("./images/uploaded/")) {
    return normalizedValue.replace("./images/uploaded/", "./data/uploaded/public/");
  }
  return "";
}

function deriveOriginalArchivePath(value) {
  const normalizedValue = String(value || "").trim();
  if (normalizedValue.startsWith("uploaded/original/")) {
    return normalizedValue;
  }
  if (normalizedValue.startsWith("uploaded/public/")) {
    return normalizedValue.replace("uploaded/public/", "uploaded/original/");
  }
  if (normalizedValue.startsWith("./data/uploaded/original/")) {
    return normalizedValue.replace("./data/uploaded/original/", "uploaded/original/");
  }
  if (normalizedValue.startsWith("./data/uploaded/public/")) {
    return normalizedValue.replace("./data/uploaded/public/", "uploaded/original/");
  }
  if (normalizedValue.startsWith("./images/uploaded/")) {
    return normalizedValue.replace("./images/uploaded/", "uploaded/original/");
  }
  return "";
}

function derivePublicArchivePath(value) {
  const normalizedValue = String(value || "").trim();
  if (normalizedValue.startsWith("uploaded/public/")) {
    return normalizedValue;
  }
  if (normalizedValue.startsWith("uploaded/original/")) {
    return normalizedValue.replace("uploaded/original/", "uploaded/public/");
  }
  if (normalizedValue.startsWith("./data/uploaded/public/")) {
    return normalizedValue.replace("./data/uploaded/public/", "uploaded/public/");
  }
  if (normalizedValue.startsWith("./data/uploaded/original/")) {
    return normalizedValue.replace("./data/uploaded/original/", "uploaded/public/");
  }
  if (normalizedValue.startsWith("./images/uploaded/")) {
    return normalizedValue.replace("./images/uploaded/", "uploaded/public/");
  }
  return "";
}

function parsePhotoEntries(value) {
  return String(value)
    .split("\n")
    .map((line) => normalizePhotoEntry(line))
    .filter(Boolean);
}

function serializeCityPhotoPaths(city) {
  return getCityPhotos(city)
    .map((photo) => getDisplayedPhotoFileName(photo))
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

function mergePhotoEntries(pathsValue, titlesValue, creditsValue, existingPhotos = []) {
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
    .map((fileName, index) => {
      if (!fileName) {
        return null;
      }

      const existingEntry = findPhotoEntryByDisplayedFileName(existingPhotos, fileName) || existingPhotos[index] || null;
      if (existingEntry) {
        return updatePhotoEntryFromDisplayedFileName(existingEntry, fileName, titles[index] || "", credits[index] || "");
      }

      return {
        src: fileName,
        title: titles[index] || "",
        credit: credits[index] || "",
        publicSrc: "",
        originalSrc: "",
        publicPath: "",
        originalPath: "",
      };
    })
    .filter(Boolean);
}

function getDisplayedPhotoFileName(photo) {
  const sourcePath = getPhotoSourceForMode(photo, currentEditorPhotoSourceMode) || photo.src || "";
  return getFileNameFromPath(sourcePath);
}

function getRenderablePhotoSrc(photo) {
  const sourceMode = getGlobalPhotoSourceMode();
  return getPhotoSourceForMode(photo, sourceMode) || String(photo?.src || "").trim();
}

function getPhotoSourceForMode(photo, sourceMode) {
  if (sourceMode === "original") {
    return String(photo?.originalSrc || "").trim() || String(photo?.src || "").trim();
  }

  return String(photo?.publicSrc || "").trim() || String(photo?.src || "").trim();
}

function getFileNameFromPath(value) {
  return String(value || "")
    .split("/")
    .pop()
    .trim();
}

function findPhotoEntryByDisplayedFileName(existingPhotos, fileName) {
  const normalizedFileName = String(fileName || "").trim();
  return (Array.isArray(existingPhotos) ? existingPhotos : []).find((entry) => {
    return getDisplayedPhotoFileName(entry) === normalizedFileName;
  });
}

function updatePhotoEntryFromDisplayedFileName(photo, fileName, title, credit) {
  const normalized = normalizePhotoEntry(photo);
  if (!normalized) {
    return null;
  }

  const nextEntry = {
    ...normalized,
    title,
    credit,
  };

  if (isUploadedPhoto(normalized)) {
    if (currentEditorPhotoSourceMode === "original") {
      nextEntry.originalSrc = replaceFileNameInPath(normalized.originalSrc || normalized.src, fileName);
      nextEntry.originalPath = replaceFileNameInPath(normalized.originalPath, fileName);
      nextEntry.src = nextEntry.originalSrc || nextEntry.src;
    } else {
      nextEntry.publicSrc = replaceFileNameInPath(normalized.publicSrc || normalized.src, fileName);
      nextEntry.publicPath = replaceFileNameInPath(normalized.publicPath, fileName);
      nextEntry.src = nextEntry.publicSrc || nextEntry.src;
    }
    return nextEntry;
  }

  nextEntry.src = replaceFileNameInPath(normalized.src, fileName);
  return nextEntry;
}

function replaceFileNameInPath(value, fileName) {
  const source = String(value || "").trim();
  if (!source) {
    return fileName;
  }

  return source.replace(/[^/]+$/, fileName);
}

function mergeUniquePhotoEntries(existingEntries, nextEntries) {
  const mergedEntries = [...(Array.isArray(existingEntries) ? existingEntries : []), ...(Array.isArray(nextEntries) ? nextEntries : [])]
    .map((entry) => normalizePhotoEntry(entry))
    .filter(Boolean);

  const seen = new Set();
  return mergedEntries.filter((entry) => {
    if (seen.has(entry.src)) {
      return false;
    }

    seen.add(entry.src);
    return true;
  });
}

function mergeServerUploadedPhotoEntries(existingEntries, nextEntries) {
  const normalizedExistingEntries = (Array.isArray(existingEntries) ? existingEntries : [])
    .map((entry) => normalizePhotoEntry(entry))
    .filter(Boolean);

  const preservedExistingEntries = normalizedExistingEntries.filter((entry) => !isUploadedPhoto(entry));
  const existingUploadedEntries = normalizedExistingEntries.filter((entry) => isUploadedPhoto(entry));

  const mergedUploadedEntries = (Array.isArray(nextEntries) ? nextEntries : [])
    .map((entry) => normalizePhotoEntry(entry))
    .filter(Boolean)
    .map((entry) => {
      const existingEntry = existingUploadedEntries.find((candidate) => isSameUploadedPhoto(candidate, entry));
      if (!existingEntry) {
        return entry;
      }

      return {
        ...entry,
        title: String(existingEntry.title || "").trim() || String(entry.title || "").trim(),
        credit: String(existingEntry.credit || "").trim() || String(entry.credit || "").trim(),
      };
    });

  return mergeUniquePhotoEntries(preservedExistingEntries, mergedUploadedEntries);
}

function isSameUploadedPhoto(left, right) {
  const leftEntry = normalizePhotoEntry(left);
  const rightEntry = normalizePhotoEntry(right);
  if (!leftEntry || !rightEntry) {
    return false;
  }

  const leftKeys = [
    String(leftEntry.publicPath || "").trim(),
    String(leftEntry.originalPath || "").trim(),
    String(leftEntry.publicSrc || "").trim(),
    String(leftEntry.originalSrc || "").trim(),
    String(leftEntry.src || "").trim(),
  ].filter(Boolean);
  const rightKeys = [
    String(rightEntry.publicPath || "").trim(),
    String(rightEntry.originalPath || "").trim(),
    String(rightEntry.publicSrc || "").trim(),
    String(rightEntry.originalSrc || "").trim(),
    String(rightEntry.src || "").trim(),
  ].filter(Boolean);

  if (leftKeys.some((key) => rightKeys.includes(key))) {
    return true;
  }

  return (
    getFileNameFromPath(leftEntry.publicSrc || leftEntry.originalSrc || leftEntry.src) ===
    getFileNameFromPath(rightEntry.publicSrc || rightEntry.originalSrc || rightEntry.src)
  );
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
    syncPhotoGridLayout();
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

function syncPhotoUploadCount(count) {
  if (!photoUploadCountElement) {
    return;
  }

  photoUploadCountElement.textContent = `${count}枚`;
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

photoLightboxCloseButton?.addEventListener("click", closePhotoLightbox);
photoLightboxElement?.addEventListener("click", (event) => {
  if (event.target === photoLightboxElement) {
    closePhotoLightbox();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !photoLightboxElement?.classList.contains("is-hidden")) {
    closePhotoLightbox();
  }
  if (event.key === "Escape" && !quickGuideElement?.classList.contains("is-hidden")) {
    dismissQuickGuide();
  }
});

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
  syncUpcomingVisibilityButton();
}

function syncCityAutoPlayButton() {
  if (!cityAutoPlayToggleButton) {
    return;
  }

  cityAutoPlayToggleButton.classList.toggle("is-active", isCityAutoPlayEnabled);
  cityAutoPlayToggleButton.setAttribute("aria-pressed", String(isCityAutoPlayEnabled));
  cityAutoPlayToggleButton.textContent = "Auto-scroll";
  if (cityAutoPlayStatusElement) {
    cityAutoPlayStatusElement.textContent = isCityAutoPlayEnabled ? "Auco-scrolling..." : "";
  }
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
    if (!isCityVisibleOnCurrentMap(city, projection)) {
      return;
    }

    const projected = projection(city.coordinates);
    if (!projected) {
      return;
    }

    const [x, y] = projected;
    const isActive = index === activeIndex;
    const hasPhotos = getCityPhotos(city).length > 0;

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

    const metrics = measureLabelMetrics(markersGroup, city, hasPhotos);
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

    if (hasPhotos) {
      labelLayer
        .append("image")
        .attr("class", "label-photo-badge")
        .attr("href", "./images/logo/logo-photo.svg")
        .attr("x", placement.rect.x + placement.rect.width - 20)
        .attr("y", placement.rect.y + 8)
        .attr("width", 12)
        .attr("height", 12)
        .attr("preserveAspectRatio", "xMidYMid meet");
    }

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

function isCityVisibleOnCurrentMap(city, projection) {
  if (currentMapViewMode !== "globe") {
    return true;
  }

  const coordinates = Array.isArray(city?.coordinates) ? city.coordinates : null;
  if (!coordinates || coordinates.length < 2) {
    return false;
  }

  const rotate = projection.rotate();
  const center = [-Number(rotate?.[0] || 0), -Number(rotate?.[1] || 0)];
  return d3.geoDistance(coordinates, center) <= Math.PI / 2;
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
    photoSourceMode: "public",
    isUpcoming: false,
    conferenceType: "その他",
    coordinates: [...DEFAULT_COORDINATES],
    labelOffset: [24, -62],
  };
}

function buildInitialCitiesSource() {
  const photoSourceMode = getGlobalPhotoSourceMode();
  return `window.__PHOTO_SOURCE_MODE__ = ${JSON.stringify(photoSourceMode)};\nwindow.__INITIAL_CITIES__ = ${JSON.stringify(buildSerializableCities(), null, 2)};\n`;
}

function buildSerializableCities() {
  return cities.map((city) => {
    const normalizedPhotos = (Array.isArray(city.photos) ? city.photos : [])
      .map((entry) => normalizePhotoEntry(entry))
      .filter(Boolean)
      .map((entry) => ({
        src: String(getPhotoSourceForMode(entry, getCityPhotoSourceMode(city)) || entry.src || "").trim(),
        title: String(entry.title || "").trim(),
        credit: String(entry.credit || "").trim(),
        publicSrc: String(entry.publicSrc || "").trim(),
        originalSrc: String(entry.originalSrc || "").trim(),
        publicPath: String(entry.publicPath || "").trim(),
        originalPath: String(entry.originalPath || "").trim(),
        originalName: String(entry.originalName || "").trim(),
      }));

    return {
      name: String(city.name || "").trim(),
      country: String(city.country || "").trim(),
      flag: String(city.flag || "").trim(),
      comment: String(city.comment || "").trim(),
      eventDate: String(city.eventDate || "").trim(),
      organizer: String(city.organizer || "").trim(),
      photo: normalizedPhotos[0]?.src || "",
      photos: normalizedPhotos,
      photoSourceMode: getCityPhotoSourceMode(city),
      isUpcoming: Boolean(city.isUpcoming),
      conferenceType: normalizeConferenceType(city.conferenceType),
      coordinates: normalizeCoordinatePair(city.coordinates, DEFAULT_COORDINATES),
      labelOffset: normalizeCoordinatePair(city.labelOffset, [24, -62]),
      ...(Array.isArray(city.manualLabelOffset)
        ? { manualLabelOffset: normalizeCoordinatePair(city.manualLabelOffset, [24, -62]) }
        : {}),
    };
  });
}

function normalizeCoordinatePair(value, fallback) {
  const source = Array.isArray(value) ? value : fallback;
  const first = Number(source[0]);
  const second = Number(source[1]);
  return [
    Number.isFinite(first) ? first : Number(fallback[0]),
    Number.isFinite(second) ? second : Number(fallback[1]),
  ];
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
    if (String(window.__PHOTO_SOURCE_MODE__ || "").trim() === "original") {
      currentEditorPhotoSourceMode = "original";
    } else {
      currentEditorPhotoSourceMode = "public";
    }
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
      const sortDirection = currentSortKey === "eventDate" ? -1 : 1;

      if (leftValue < rightValue) {
        return -1 * sortDirection;
      }

      if (leftValue > rightValue) {
        return 1 * sortDirection;
      }

      return (left.index - right.index) * sortDirection;
    });
}

function normalizeSortValue(value) {
  return String(value || "").trim().toLocaleLowerCase("ja");
}

function getVisibleCityEntries(items) {
  return items
    .map((city, index) => ({ city, index }))
    .filter(({ city }) => {
      if (city.isUpcoming && !isUpcomingVisible) {
        return false;
      }

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

function measureLabelMetrics(parentGroup, city, hasPhotos = false) {
  const paddingX = 12;
  const paddingTop = 10;
  const paddingBottom = 10;
  const photoBadgeSpace = hasPhotos ? 18 : 0;
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
  const rectRight = contentRight + paddingX + photoBadgeSpace;
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
