const http = require("http");
const crypto = require("crypto");
const { spawn } = require("child_process");
const fsNative = require("fs");
const fs = require("fs/promises");
const path = require("path");
const heicConvert = require("heic-convert");
const sharp = require("sharp");
const { URL } = require("url");

const ROOT_DIR = __dirname;
const PORT = Number(process.env.PORT || 8000);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT_DIR, "data"));
const WATERMARK_FONT_CANDIDATE_PATHS = [
  process.env.WATERMARK_FONT_PATH ? path.resolve(process.env.WATERMARK_FONT_PATH) : "",
  path.join(ROOT_DIR, "fonts", "NotoSansJP-Bold.otf"),
  path.join(ROOT_DIR, "fonts", "NotoSansJP-Bold.ttf"),
  path.join(ROOT_DIR, "fonts", "NotoSansJP-Regular.ttf"),
  path.join(ROOT_DIR, "fonts", "NotoSansJP-VariableFont_wght.ttf"),
].filter(Boolean);
const UPLOADS_DIR = path.join(DATA_DIR, "uploaded");
const ORIGINAL_UPLOADS_DIR = path.join(UPLOADS_DIR, "original");
const PUBLIC_UPLOADS_DIR = path.join(UPLOADS_DIR, "public");
const EXPORTS_DIR = path.join(DATA_DIR, "exports");
const UPLOADS_MANIFEST_PATH = path.join(DATA_DIR, "uploads.json");
const LEGACY_UPLOADS_MANIFEST_PATH = path.join(ROOT_DIR, "uploads.json");
const LEGACY_ROOT_UPLOADS_DIR = path.join(ROOT_DIR, "images", "uploaded");
const LEGACY_DATA_UPLOADS_DIR = path.join(DATA_DIR, "images", "uploaded");
const VIEWER_PASSWORD = String(process.env.VIEWER_PASSWORD || "").trim();
const ADMIN_DOWNLOAD_PASSWORD = String(process.env.ADMIN_DOWNLOAD_PASSWORD || "").trim();
const AUTH_COOKIE_NAME = "iawe_viewer_session";
const AUTH_DURATION_MS = 1000 * 60 * 60 * 12;
const PUBLIC_IMAGE_MAX_DIMENSION = Number(process.env.PUBLIC_IMAGE_MAX_DIMENSION || 1200);
const PUBLIC_IMAGE_QUALITY = Number(process.env.PUBLIC_IMAGE_QUALITY || 82);
const AUTH_SECRET = String(
  process.env.AUTH_SECRET || `${ROOT_DIR}:${VIEWER_PASSWORD || "viewer"}:${ADMIN_DOWNLOAD_PASSWORD || "admin"}`,
);
const STATIC_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".tar": "application/x-tar",
  ".gz": "application/gzip",
  ".webp": "image/webp",
};
const WATERMARK_FONT_EMBED = loadWatermarkFontEmbed();

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host || `localhost:${PORT}`}`);
    const cookies = parseCookies(request.headers.cookie || "");

    if (request.method === "GET" && requestUrl.pathname === "/api/uploads") {
      if (!requireViewerAuthentication(request, response, cookies)) {
        return;
      }
      return handleGetUploads(response);
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/auth/session") {
      return handleGetAuthSession(response, cookies);
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/auth/login") {
      return handleLogin(request, response);
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/auth/logout") {
      return handleLogout(response);
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/upload") {
      if (!requireViewerAuthentication(request, response, cookies)) {
        return;
      }
      return handleUpload(request, response);
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/delete-upload") {
      if (!requireViewerAuthentication(request, response, cookies)) {
        return;
      }
      return handleDeleteUpload(request, response);
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/storage-info") {
      return handleGetStorageInfo(response);
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/export/uploads-archive") {
      return handleCreateUploadsArchive(request, response);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return writeJson(response, 405, { ok: false, message: "Method not allowed" });
    }

    return serveStaticFile(requestUrl.pathname, response, request.method === "HEAD", cookies, request);
  } catch (error) {
    console.error(error);
    return writeJson(response, 500, { ok: false, message: "Internal server error" });
  }
});

bootstrapStorage()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Uploads data directory: ${DATA_DIR}`);
      console.log(`Uploads original directory: ${ORIGINAL_UPLOADS_DIR}`);
      console.log(`Uploads public directory: ${PUBLIC_UPLOADS_DIR}`);
      console.log(`Uploads archive endpoint: http://localhost:${PORT}/api/export/uploads-archive`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize storage.", error);
    process.exitCode = 1;
  });

async function handleGetUploads(response) {
  const manifest = await readUploadsManifest();
  const publicCities = {};
  Object.entries(manifest.cities || {}).forEach(([cityIndex, entries]) => {
    publicCities[cityIndex] = Array.isArray(entries)
      ? entries.map((entry) => buildClientPhotoEntry(entry))
      : [];
  });
  return writeJson(response, 200, { ok: true, cities: publicCities });
}

function handleGetAuthSession(response, cookies) {
  return writeJson(response, 200, {
    ok: true,
    auth: {
      viewerPasswordConfigured: Boolean(VIEWER_PASSWORD),
      authenticated: isViewerAuthenticated(cookies),
    },
  });
}

async function handleLogin(request, response) {
  if (!VIEWER_PASSWORD) {
    return writeJson(response, 200, {
      ok: true,
      message: "閲覧用パスワードは設定されていません",
      auth: { viewerPasswordConfigured: false, authenticated: true },
    });
  }

  const payload = await readJsonBody(request);
  const password = String(payload.password || "").trim();
  if (password !== VIEWER_PASSWORD) {
    return writeJson(response, 401, { ok: false, message: "パスワードが違います" });
  }

  const expiresAt = Date.now() + AUTH_DURATION_MS;
  const token = signViewerSessionToken(expiresAt);
  return writeJson(
    response,
    200,
    {
      ok: true,
      message: "ログインしました",
      auth: { viewerPasswordConfigured: true, authenticated: true, expiresAt: new Date(expiresAt).toISOString() },
    },
    {
      "Set-Cookie": buildSessionCookie(token, expiresAt),
    },
  );
}

function handleLogout(response) {
  return writeJson(
    response,
    200,
    { ok: true, message: "ログアウトしました" },
    {
      "Set-Cookie": buildExpiredSessionCookie(),
    },
  );
}

async function handleUpload(request, response) {
  const payload = await readJsonBody(request);
  const cityIndex = Number(payload.cityIndex);
  const files = Array.isArray(payload.files) ? payload.files : [];
  const cityName = String(payload.cityName || "").trim() || `city-${cityIndex}`;
  const conferenceType = String(payload.conferenceType || "").trim() || "other";
  const country = String(payload.country || "").trim() || "country";
  const eventDate = String(payload.eventDate || "").trim() || "unknown";
  const deletePassword = String(payload.deletePassword || "").trim() || "test";

  if (!Number.isInteger(cityIndex) || cityIndex < 0 || files.length === 0) {
    return writeJson(response, 400, { ok: false, message: "cityIndex または files が不正です" });
  }

  const uploadDirectoryRelativePath = buildUploadDirectoryRelativePath({
    conferenceType,
    eventDate,
    country,
    cityName,
  });
  const originalUploadDirectoryPath = path.join(ORIGINAL_UPLOADS_DIR, uploadDirectoryRelativePath);
  const publicUploadDirectoryPath = path.join(PUBLIC_UPLOADS_DIR, uploadDirectoryRelativePath);
  await fs.mkdir(originalUploadDirectoryPath, { recursive: true });
  await fs.mkdir(publicUploadDirectoryPath, { recursive: true });

  const savedPhotos = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const savedPhoto = await saveUploadedFile(
      uploadDirectoryRelativePath,
      originalUploadDirectoryPath,
      publicUploadDirectoryPath,
      file,
      index,
      deletePassword,
      {
        cityIndex,
        cityName,
        conferenceType,
        country,
        eventDate,
      },
    );
    if (savedPhoto) {
      savedPhotos.push(savedPhoto);
    }
  }

  if (savedPhotos.length === 0) {
    return writeJson(response, 400, { ok: false, message: "保存できる画像がありませんでした" });
  }

  const manifest = await readUploadsManifest();
  const existingEntries = Array.isArray(manifest.cities?.[cityIndex]) ? manifest.cities[cityIndex] : [];
  manifest.cities = manifest.cities || {};
  manifest.cities[cityIndex] = mergeUniquePhotos(existingEntries, savedPhotos);
  await fs.writeFile(UPLOADS_MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  return writeJson(response, 200, {
    ok: true,
    message: `${savedPhotos.length}件の画像をアップロードしました`,
    photos: savedPhotos,
  });
}

async function handleDeleteUpload(request, response) {
  const payload = await readJsonBody(request);
  const cityIndex = Number(payload.cityIndex);
  const src = String(payload.src || "").trim();
  const password = String(payload.password || "").trim();

  if (!Number.isInteger(cityIndex) || cityIndex < 0 || !isServedUploadedSrc(src)) {
    return writeJson(response, 400, { ok: false, message: "cityIndex または src が不正です" });
  }

  const manifest = await readUploadsManifest();
  const existingEntries = Array.isArray(manifest.cities?.[cityIndex]) ? manifest.cities[cityIndex] : [];
  const matchedEntry = existingEntries.find((entry) => photoEntryMatchesSrc(entry, src));
  if (!matchedEntry) {
    return writeJson(response, 404, { ok: false, message: "削除対象の画像が見つかりませんでした" });
  }

  if ((matchedEntry.deletePassword || "test") !== password) {
    return writeJson(response, 403, { ok: false, message: "パスワードが違います" });
  }

  const nextEntries = existingEntries.filter((entry) => !photoEntryMatchesSrc(entry, src));

  manifest.cities = manifest.cities || {};
  if (nextEntries.length === 0) {
    delete manifest.cities[cityIndex];
  } else {
    manifest.cities[cityIndex] = nextEntries;
  }
  await fs.writeFile(UPLOADS_MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  const publicFilePath = resolvePublicAssetPath(src);
  if (publicFilePath && publicFilePath.startsWith(PUBLIC_UPLOADS_DIR)) {
    try {
      await fs.unlink(publicFilePath);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }

    await removeEmptyParentDirectories(path.dirname(publicFilePath), PUBLIC_UPLOADS_DIR);
  }

  const originalFilePath = matchedEntry.originalPath ? resolveOriginalArchivePath(matchedEntry.originalPath) : null;
  if (originalFilePath && originalFilePath.startsWith(ORIGINAL_UPLOADS_DIR)) {
    try {
      await fs.unlink(originalFilePath);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }

    await removeEmptyParentDirectories(path.dirname(originalFilePath), ORIGINAL_UPLOADS_DIR);
  }

  return writeJson(response, 200, { ok: true, message: "画像を削除しました", src });
}

async function handleGetStorageInfo(response) {
  const manifest = await readUploadsManifest();
  const photoCount = Object.values(manifest.cities || {}).reduce(
    (count, entries) => count + (Array.isArray(entries) ? entries.length : 0),
    0,
  );

  return writeJson(response, 200, {
    ok: true,
    storage: {
      dataDir: DATA_DIR,
      uploadsDir: UPLOADS_DIR,
      originalUploadsDir: ORIGINAL_UPLOADS_DIR,
      publicUploadsDir: PUBLIC_UPLOADS_DIR,
      manifestPath: UPLOADS_MANIFEST_PATH,
      exportsDir: EXPORTS_DIR,
    },
    photoCount,
    archiveDownloadPath: "/api/export/uploads-archive",
  });
}

async function handleCreateUploadsArchive(request, response) {
  if (!isAdminDownloadAuthorized(request)) {
    return writeJson(response, 403, {
      ok: false,
      message: "管理者パスワードが必要です。`X-Admin-Password` ヘッダーを付けてください。",
    });
  }

  await ensureDirectory(EXPORTS_DIR);
  const archiveFileName = `uploads-export-${formatTimestampForFileName(new Date())}.tar.gz`;
  const archivePath = path.join(EXPORTS_DIR, archiveFileName);

  await createUploadsArchive(archivePath);

  const stat = await fs.stat(archivePath);
  response.writeHead(200, {
    "Content-Type": "application/gzip",
    "Content-Disposition": `attachment; filename="${archiveFileName}"`,
    "Content-Length": stat.size,
    "Cache-Control": "no-cache",
  });
  fsNative.createReadStream(archivePath).pipe(response);
}

async function saveUploadedFile(
  uploadDirectoryRelativePath,
  originalUploadDirectoryPath,
  publicUploadDirectoryPath,
  file,
  index,
  deletePassword,
  context,
) {
  const dataUrl = String(file?.dataUrl || "");
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) {
    return null;
  }

  const mimeType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  const originalFileName = await createUniqueFileName(
    originalUploadDirectoryPath,
    String(file?.name || `photo-${index + 1}`),
    mimeType,
    index,
  );
  const originalFilePath = path.join(originalUploadDirectoryPath, originalFileName);
  await fs.writeFile(originalFilePath, buffer);

  const publicFileName = await createVariantFileName(
    publicUploadDirectoryPath,
    path.basename(originalFileName, path.extname(originalFileName)),
    ".jpg",
  );
  const publicFilePath = path.join(publicUploadDirectoryPath, publicFileName);
  const publicImage = await buildPublicImageVariant(buffer, context);
  await fs.writeFile(publicFilePath, publicImage.buffer);

  const storedAt = new Date().toISOString();
  const publicPath = `./data/uploaded/public/${toPosixPath(path.join(uploadDirectoryRelativePath, publicFileName))}`;
  const originalPath = toPosixPath(path.join("uploaded", "original", uploadDirectoryRelativePath, originalFileName));
  const publicArchivePath = toPosixPath(path.join("uploaded", "public", uploadDirectoryRelativePath, publicFileName));

  return {
    id: `${storedAt}-${originalFileName}`.replace(/[^a-z0-9._-]+/gi, "-"),
    src: publicPath,
    title: String(file?.title || "").trim(),
    credit: String(file?.credit || "").trim(),
    deletePassword,
    originalName: String(file?.name || "").trim() || originalFileName,
    mimeType,
    bytes: publicImage.buffer.length,
    originalBytes: buffer.length,
    publicBytes: publicImage.buffer.length,
    storedAt,
    archivePath: originalPath,
    originalPath,
    publicPath: publicArchivePath,
    width: publicImage.width,
    height: publicImage.height,
    originalWidth: publicImage.originalWidth,
    originalHeight: publicImage.originalHeight,
    watermarkText: publicImage.watermarkText,
    cityIndex: context.cityIndex,
    cityName: context.cityName,
    conferenceType: context.conferenceType,
    country: context.country,
    eventDate: context.eventDate,
  };
}

async function createUniqueFileName(directoryPath, originalName, mimeType, index) {
  const extension = getFileExtension(originalName, mimeType);
  const baseName = slugify(path.basename(originalName, path.extname(originalName))) || `photo-${index + 1}`;
  let candidate = `${baseName}${extension}`;
  let suffix = 1;

  while (await fileExists(path.join(directoryPath, candidate))) {
    suffix += 1;
    candidate = `${baseName}-${suffix}${extension}`;
  }

  return candidate;
}

async function createVariantFileName(directoryPath, baseName, extension) {
  const normalizedBaseName = slugify(baseName) || "photo";
  let candidate = `${normalizedBaseName}${extension}`;
  let suffix = 1;

  while (await fileExists(path.join(directoryPath, candidate))) {
    suffix += 1;
    candidate = `${normalizedBaseName}-${suffix}${extension}`;
  }

  return candidate;
}

function getFileExtension(originalName, mimeType) {
  const existing = path.extname(originalName || "").toLowerCase();
  if (existing) {
    return existing;
  }

  const byMime = {
    "image/gif": ".gif",
    "image/heic": ".heic",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/svg+xml": ".svg",
    "image/webp": ".webp",
  };
  return byMime[mimeType] || ".png";
}

function buildUploadDirectoryRelativePath({ conferenceType, eventDate, country, cityName }) {
  const conferencePart = slugify(conferenceType) || "other";
  const eventPart = slugify(eventDate) || "unknown";
  const countryPart = slugify(country) || "country";
  const cityPart = slugify(cityName) || "city";
  return path.join(conferencePart, eventPart, countryPart, cityPart);
}

async function buildPublicImageVariant(buffer, context) {
  const normalizedSourceBuffer = await normalizeSourceImageBuffer(buffer);
  const pipeline = sharp(normalizedSourceBuffer, { failOn: "none" }).rotate();
  const metadata = await pipeline.metadata();
  const originalWidth = Number(metadata.width) || 0;
  const originalHeight = Number(metadata.height) || 0;

  const resizedBuffer = await pipeline
    .resize({
      width: PUBLIC_IMAGE_MAX_DIMENSION,
      height: PUBLIC_IMAGE_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({
      quality: PUBLIC_IMAGE_QUALITY,
      mozjpeg: true,
      chromaSubsampling: "4:4:4",
    })
    .toBuffer();

  const resizedMetadata = await sharp(resizedBuffer).metadata();
  const width = Number(resizedMetadata.width) || originalWidth;
  const height = Number(resizedMetadata.height) || originalHeight;
  const watermarkText = buildWatermarkText(context);
  const watermarkSvg = createWatermarkSvg(width, height, watermarkText);
  const compositedBuffer = await sharp(resizedBuffer)
    .composite([{ input: Buffer.from(watermarkSvg), gravity: "southeast" }])
    .jpeg({
      quality: PUBLIC_IMAGE_QUALITY,
      mozjpeg: true,
      chromaSubsampling: "4:4:4",
    })
    .toBuffer();

  return {
    buffer: compositedBuffer,
    width,
    height,
    originalWidth,
    originalHeight,
    watermarkText,
  };
}

async function normalizeSourceImageBuffer(buffer) {
  if (looksLikeHeic(buffer)) {
    const converted = await heicConvert({
      buffer,
      format: "JPEG",
      quality: 0.92,
    });
    return Buffer.from(converted);
  }

  return buffer;
}

function looksLikeHeic(buffer) {
  const signature = buffer.subarray(0, 64).toString("latin1");
  return signature.includes("ftypheic") || signature.includes("ftypheix") || signature.includes("ftypmif1");
}

function buildWatermarkText(context) {
  return [
    "日本風工学会会員限定|転載禁止",
    [context.conferenceType, context.eventDate].filter(Boolean).join(" "),
    [context.cityName, context.country].filter(Boolean).join(" / "),
  ]
    .map((line) => String(line || "").trim())
    .filter(Boolean);
}

function createWatermarkSvg(width, height, lines) {
  const safeWidth = Math.max(320, width);
  const safeHeight = Math.max(240, height);
  const padding = Math.round(Math.min(safeWidth, safeHeight) * 0.03);
  const lineHeight = Math.max(18, Math.round(safeHeight * 0.035));
  const fontSize = Math.max(15, Math.round(safeHeight * 0.03));
  const watermarkWidth = Math.min(Math.round(safeWidth * 0.62), 720);
  const watermarkHeight = padding * 2 + lineHeight * lines.length;
  const x = safeWidth - watermarkWidth - padding;
  const y = safeHeight - watermarkHeight - padding;

  const textElements = lines
    .map((line, index) => {
      const dy = padding + fontSize + index * lineHeight;
      return `<text x="${x + watermarkWidth / 2}" y="${y + dy}" text-anchor="middle">${escapeXml(line)}</text>`;
    })
    .join("");
  const fontFaceStyle = WATERMARK_FONT_EMBED
    ? `<style>
        @font-face {
          font-family: "WatermarkJP";
          src: url("${WATERMARK_FONT_EMBED.dataUrl}") format("${WATERMARK_FONT_EMBED.format}");
          font-weight: 400 900;
          font-style: normal;
        }
      </style>`
    : "";
  const fontFamily = WATERMARK_FONT_EMBED
    ? 'WatermarkJP, "Noto Sans JP", "Noto Sans CJK JP", sans-serif'
    : '"Noto Sans JP", "Noto Sans CJK JP", Arial, sans-serif';

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${safeWidth}" height="${safeHeight}">
      <defs>${fontFaceStyle}</defs>
      <rect x="${x}" y="${y}" width="${watermarkWidth}" height="${watermarkHeight}" rx="18" ry="18" fill="#0a1b1f" fill-opacity="0.62" />
      <g font-family="${escapeXml(fontFamily)}" font-size="${fontSize}" font-weight="700" fill="#ffffff" fill-opacity="0.94">
        ${textElements}
      </g>
    </svg>
  `;
}

function loadWatermarkFontEmbed() {
  for (const candidatePath of WATERMARK_FONT_CANDIDATE_PATHS) {
    try {
      if (!candidatePath || !fsNative.existsSync(candidatePath)) {
        continue;
      }

      const buffer = fsNative.readFileSync(candidatePath);
      const extension = path.extname(candidatePath).toLowerCase();
      const mimeType =
        extension === ".woff2"
          ? "font/woff2"
          : extension === ".woff"
            ? "font/woff"
            : extension === ".otf"
              ? "font/otf"
              : "font/ttf";
      const format =
        extension === ".woff2" ? "woff2" : extension === ".woff" ? "woff" : extension === ".otf" ? "opentype" : "truetype";

      return {
        dataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`,
        format,
      };
    } catch (error) {
      console.warn(`Failed to load watermark font from ${candidatePath}:`, error);
    }
  }

  return null;
}

function mergeUniquePhotos(existingEntries, nextEntries) {
  const allEntries = [...existingEntries, ...nextEntries];
  const seen = new Set();
  return allEntries.filter((entry) => {
    const src = String(entry?.src || "").trim();
    if (!src || seen.has(src)) {
      return false;
    }

    seen.add(src);
    return true;
  });
}

async function readUploadsManifest() {
  try {
    const content = await fs.readFile(UPLOADS_MANIFEST_PATH, "utf8");
    const parsed = JSON.parse(content);
    return normalizeUploadsManifest(parsed && typeof parsed === "object" ? parsed : createEmptyManifest());
  } catch (error) {
    if (error.code === "ENOENT") {
      return createEmptyManifest();
    }
    throw error;
  }
}

function createEmptyManifest() {
  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    storage: {
      dataDir: DATA_DIR,
      uploadsDir: UPLOADS_DIR,
      originalUploadsDir: ORIGINAL_UPLOADS_DIR,
      publicUploadsDir: PUBLIC_UPLOADS_DIR,
      exportsDir: EXPORTS_DIR,
    },
    cities: {},
  };
}

function normalizeUploadsManifest(manifest) {
  const normalized = createEmptyManifest();
  normalized.version = Number(manifest.version) || 2;
  normalized.generatedAt = String(manifest.generatedAt || new Date().toISOString());
  Object.entries(manifest.cities || {}).forEach(([cityIndex, entries]) => {
    normalized.cities[cityIndex] = Array.isArray(entries)
      ? entries
          .filter((entry) => entry && typeof entry === "object" && entry.src)
          .map((entry) => {
            const legacySrc = String(entry.src || "").trim();
            const normalizedPublicPath = normalizePublicArchivePath(
              String(entry.publicPath || "").trim() || legacySrc,
            );
            const normalizedOriginalPath = normalizeOriginalArchivePath(
              String(entry.originalPath || entry.archivePath || "").trim() || legacySrc,
            );
            const normalizedSrc =
              buildPublicSrcFromArchivePath(normalizedPublicPath) ||
              convertLegacyUploadedSrcToPublicSrc(legacySrc) ||
              legacySrc;

            return {
              id: String(entry.id || normalizedSrc).trim(),
              src: normalizedSrc,
              title: String(entry.title || "").trim(),
              credit: String(entry.credit || "").trim(),
              deletePassword: String(entry.deletePassword || "test"),
              originalName: String(entry.originalName || path.basename(normalizedOriginalPath || normalizedSrc)).trim(),
              mimeType: String(entry.mimeType || "").trim(),
              bytes: Number(entry.bytes) || 0,
              originalBytes: Number(entry.originalBytes) || Number(entry.bytes) || 0,
              publicBytes: Number(entry.publicBytes) || Number(entry.bytes) || 0,
              storedAt: String(entry.storedAt || "").trim(),
              archivePath: normalizedOriginalPath,
              originalPath: normalizedOriginalPath,
              publicPath: normalizedPublicPath,
              width: Number(entry.width) || 0,
              height: Number(entry.height) || 0,
              originalWidth: Number(entry.originalWidth) || 0,
              originalHeight: Number(entry.originalHeight) || 0,
              watermarkText: Array.isArray(entry.watermarkText)
                ? entry.watermarkText.map((line) => String(line || "").trim()).filter(Boolean)
                : [],
              cityIndex: Number(entry.cityIndex),
              cityName: String(entry.cityName || "").trim(),
              conferenceType: String(entry.conferenceType || "").trim(),
              country: String(entry.country || "").trim(),
              eventDate: String(entry.eventDate || "").trim(),
            };
          })
      : [];
  });
  normalized.generatedAt = new Date().toISOString();
  return normalized;
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on("data", (chunk) => {
      chunks.push(chunk);
    });

    request.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString("utf8");
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });

    request.on("error", reject);
  });
}

async function serveStaticFile(urlPathname, response, headOnly, cookies, request) {
  const normalizedPath = decodeURIComponent(urlPathname === "/" ? "/index.html" : urlPathname);
  if (isProtectedImagePath(normalizedPath) && !requireViewerAuthentication(request, response, cookies)) {
    return;
  }

  const resolvedPath = resolvePublicFilePath(normalizedPath);
  if (!resolvedPath) {
    return writeText(response, 403, "Forbidden");
  }

  try {
    const stat = await fs.stat(resolvedPath);
    if (stat.isDirectory()) {
      return serveStaticFile(path.join(normalizedPath, "index.html"), response, headOnly, cookies, request);
    }

    const extension = path.extname(resolvedPath).toLowerCase();
    if (normalizedPath.startsWith("/data/uploaded/original/") && (extension === ".heic" || extension === ".heif")) {
      return serveOriginalHeicFile(resolvedPath, response, headOnly);
    }

    const contentType = STATIC_TYPES[extension] || "application/octet-stream";
    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": isProtectedImagePath(normalizedPath) ? "private, no-store" : "no-cache",
    });
    if (headOnly) {
      response.end();
      return;
    }

    const content = await fs.readFile(resolvedPath);
    response.end(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      return writeText(response, 404, "Not found");
    }
    throw error;
  }
}

async function serveOriginalHeicFile(filePath, response, headOnly) {
  const sourceBuffer = await fs.readFile(filePath);
  const jpegBuffer = await normalizeSourceImageBuffer(sourceBuffer);
  response.writeHead(200, {
    "Content-Type": "image/jpeg",
    "Cache-Control": "private, no-store",
  });
  if (headOnly) {
    response.end();
    return;
  }
  response.end(jpegBuffer);
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function toPosixPath(value) {
  return String(value || "").split(path.sep).join("/");
}

function escapeXml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function parseCookies(cookieHeader) {
  return String(cookieHeader || "")
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .reduce((cookies, pair) => {
      const separatorIndex = pair.indexOf("=");
      if (separatorIndex <= 0) {
        return cookies;
      }

      const name = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();
      cookies[name] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function isProtectedImagePath(pathname) {
  return (
    String(pathname || "").startsWith("/data/uploaded/public/") ||
    String(pathname || "").startsWith("/data/uploaded/original/")
  );
}

function isViewerAuthenticated(cookies) {
  if (!VIEWER_PASSWORD) {
    return true;
  }

  const token = String(cookies?.[AUTH_COOKIE_NAME] || "").trim();
  return verifyViewerSessionToken(token);
}

function requireViewerAuthentication(request, response, cookies) {
  if (isViewerAuthenticated(cookies)) {
    return true;
  }

  if (isProtectedImagePath(String(request?.url || ""))) {
    writeText(response, 401, "Authentication required");
    return false;
  }

  writeJson(response, 401, {
    ok: false,
    message: "閲覧用パスワードでログインしてください",
    authRequired: true,
  });
  return false;
}

function signViewerSessionToken(expiresAt) {
  const payload = JSON.stringify({ role: "viewer", expiresAt });
  const encodedPayload = Buffer.from(payload, "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", AUTH_SECRET).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function verifyViewerSessionToken(token) {
  const [encodedPayload, signature] = String(token || "").split(".");
  if (!encodedPayload || !signature) {
    return false;
  }

  const expectedSignature = crypto.createHmac("sha256", AUTH_SECRET).update(encodedPayload).digest("base64url");
  if (!timingSafeEqual(signature, expectedSignature)) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    return payload.role === "viewer" && Number(payload.expiresAt) > Date.now();
  } catch (error) {
    return false;
  }
}

function timingSafeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function buildSessionCookie(token, expiresAt) {
  const attributes = [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))}`,
  ];

  if (process.env.NODE_ENV === "production") {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

function buildExpiredSessionCookie() {
  const attributes = [`${AUTH_COOKIE_NAME}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (process.env.NODE_ENV === "production") {
    attributes.push("Secure");
  }
  return attributes.join("; ");
}

function isAdminDownloadAuthorized(request) {
  if (!ADMIN_DOWNLOAD_PASSWORD) {
    return false;
  }

  const headerPassword = String(request.headers["x-admin-password"] || "").trim();
  return headerPassword === ADMIN_DOWNLOAD_PASSWORD;
}

function resolvePublicFilePath(normalizedPath) {
  const relativePath = normalizedPath.replace(/^\/+/, "");
  const rootPath = path.resolve(path.join(ROOT_DIR, relativePath));
  if (
    rootPath.startsWith(ROOT_DIR) &&
    !relativePath.startsWith("data/uploaded/public/") &&
    !relativePath.startsWith("data/uploaded/original/")
  ) {
    return rootPath;
  }

  if (relativePath.startsWith("data/uploaded/public/")) {
    const uploadsPath = path.resolve(path.join(PUBLIC_UPLOADS_DIR, relativePath.replace(/^data\/uploaded\/public\/?/, "")));
    if (uploadsPath.startsWith(PUBLIC_UPLOADS_DIR)) {
      return uploadsPath;
    }
  }

  if (relativePath.startsWith("data/uploaded/original/")) {
    const uploadsPath = path.resolve(
      path.join(ORIGINAL_UPLOADS_DIR, relativePath.replace(/^data\/uploaded\/original\/?/, "")),
    );
    if (uploadsPath.startsWith(ORIGINAL_UPLOADS_DIR)) {
      return uploadsPath;
    }
  }

  if (relativePath.startsWith("exports/")) {
    const exportPath = path.resolve(path.join(DATA_DIR, relativePath));
    if (exportPath.startsWith(DATA_DIR)) {
      return exportPath;
    }
  }

  return null;
}

function resolvePublicAssetPath(src) {
  const relativeAssetPath = String(src || "").replace(/^\.\//, "");
  if (!relativeAssetPath.startsWith("data/uploaded/public/")) {
    return null;
  }

  const filePath = path.resolve(path.join(PUBLIC_UPLOADS_DIR, relativeAssetPath.replace(/^data\/uploaded\/public\/?/, "")));
  return filePath.startsWith(PUBLIC_UPLOADS_DIR) ? filePath : null;
}

function resolveOriginalArchivePath(archivePath) {
  const relativeAssetPath = String(archivePath || "").trim().replace(/^\/+/, "");
  if (!relativeAssetPath.startsWith("uploaded/original/")) {
    return null;
  }

  const filePath = path.resolve(path.join(DATA_DIR, relativeAssetPath));
  return filePath.startsWith(ORIGINAL_UPLOADS_DIR) ? filePath : null;
}

function buildPublicSrcFromArchivePath(archivePath) {
  const relativePath = String(archivePath || "").trim().replace(/^uploaded\/public\//, "");
  return relativePath && relativePath !== archivePath ? `./data/uploaded/public/${relativePath}` : "";
}

function buildOriginalSrcFromArchivePath(archivePath) {
  const relativePath = String(archivePath || "").trim().replace(/^uploaded\/original\//, "");
  return relativePath && relativePath !== archivePath ? `./data/uploaded/original/${relativePath}` : "";
}

function convertLegacyUploadedSrcToPublicSrc(src) {
  const normalizedSrc = String(src || "").trim();
  if (normalizedSrc.startsWith("./data/uploaded/public/")) {
    return normalizedSrc;
  }
  if (normalizedSrc.startsWith("./images/uploaded/")) {
    return normalizedSrc.replace("./images/uploaded/", "./data/uploaded/public/");
  }
  return "";
}

function normalizePublicArchivePath(value) {
  const normalizedValue = String(value || "").trim();
  if (normalizedValue.startsWith("uploaded/public/")) {
    return normalizedValue;
  }
  if (normalizedValue.startsWith("./data/uploaded/public/")) {
    return normalizedValue.replace("./data/uploaded/public/", "uploaded/public/");
  }
  if (normalizedValue.startsWith("./images/uploaded/")) {
    return normalizedValue.replace("./images/uploaded/", "uploaded/public/");
  }
  return "";
}

function normalizeOriginalArchivePath(value) {
  const normalizedValue = String(value || "").trim();
  if (normalizedValue.startsWith("uploaded/original/")) {
    return normalizedValue;
  }
  if (normalizedValue.startsWith("./data/uploaded/original/")) {
    return normalizedValue.replace("./data/uploaded/original/", "uploaded/original/");
  }
  if (normalizedValue.startsWith("./images/uploaded/")) {
    return normalizedValue.replace("./images/uploaded/", "uploaded/original/");
  }
  return "";
}

function isServedUploadedSrc(src) {
  return (
    String(src || "").startsWith("./data/uploaded/public/") ||
    String(src || "").startsWith("./data/uploaded/original/")
  );
}

function photoEntryMatchesSrc(entry, src) {
  const normalizedSrc = String(src || "").trim();
  return (
    String(entry?.src || "").trim() === normalizedSrc ||
    buildPublicSrcFromArchivePath(String(entry?.publicPath || "").trim()) === normalizedSrc ||
    buildOriginalSrcFromArchivePath(String(entry?.originalPath || "").trim()) === normalizedSrc
  );
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function removeEmptyParentDirectories(startPath, stopPath) {
  let currentPath = startPath;
  const resolvedStopPath = path.resolve(stopPath);

  while (currentPath.startsWith(resolvedStopPath) && currentPath !== resolvedStopPath) {
    try {
      const entries = await fs.readdir(currentPath);
      if (entries.length > 0) {
        break;
      }
      await fs.rmdir(currentPath);
      currentPath = path.dirname(currentPath);
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ENOTEMPTY") {
        break;
      }
      throw error;
    }
  }
}

async function bootstrapStorage() {
  await ensureDirectory(ORIGINAL_UPLOADS_DIR);
  await ensureDirectory(PUBLIC_UPLOADS_DIR);
  await ensureDirectory(EXPORTS_DIR);

  if (await fileExists(LEGACY_ROOT_UPLOADS_DIR)) {
    await fs.cp(LEGACY_ROOT_UPLOADS_DIR, ORIGINAL_UPLOADS_DIR, { recursive: true, force: false, errorOnExist: false });
    await fs.cp(LEGACY_ROOT_UPLOADS_DIR, PUBLIC_UPLOADS_DIR, { recursive: true, force: false, errorOnExist: false });
  }

  if (await fileExists(LEGACY_DATA_UPLOADS_DIR)) {
    await fs.cp(LEGACY_DATA_UPLOADS_DIR, ORIGINAL_UPLOADS_DIR, { recursive: true, force: false, errorOnExist: false });
    await fs.cp(LEGACY_DATA_UPLOADS_DIR, PUBLIC_UPLOADS_DIR, { recursive: true, force: false, errorOnExist: false });
  }

  const entries = await fs.readdir(UPLOADS_DIR, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "original" || entry.name === "public") {
      continue;
    }

    const legacyFlatPath = path.join(UPLOADS_DIR, entry.name);
    await fs.cp(legacyFlatPath, path.join(ORIGINAL_UPLOADS_DIR, entry.name), {
      recursive: true,
      force: false,
      errorOnExist: false,
    });
    await fs.cp(legacyFlatPath, path.join(PUBLIC_UPLOADS_DIR, entry.name), {
      recursive: true,
      force: false,
      errorOnExist: false,
    });
  }

  if (!(await fileExists(UPLOADS_MANIFEST_PATH)) && (await fileExists(LEGACY_UPLOADS_MANIFEST_PATH))) {
    const legacyContent = await fs.readFile(LEGACY_UPLOADS_MANIFEST_PATH, "utf8");
    const legacyManifest = normalizeUploadsManifest(JSON.parse(legacyContent));
    await fs.writeFile(UPLOADS_MANIFEST_PATH, JSON.stringify(legacyManifest, null, 2));
  } else if (!(await fileExists(UPLOADS_MANIFEST_PATH))) {
    await fs.writeFile(UPLOADS_MANIFEST_PATH, JSON.stringify(createEmptyManifest(), null, 2));
  }
}

async function ensureDirectory(directoryPath) {
  await fs.mkdir(directoryPath, { recursive: true });
}

function formatTimestampForFileName(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
    "-",
    String(date.getUTCHours()).padStart(2, "0"),
    String(date.getUTCMinutes()).padStart(2, "0"),
    String(date.getUTCSeconds()).padStart(2, "0"),
  ].join("");
}

async function createUploadsArchive(outputPath) {
  await new Promise((resolve, reject) => {
    const child = spawn("tar", ["-czf", outputPath, "-C", DATA_DIR, "uploads.json", "uploaded/original"], { cwd: ROOT_DIR });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `tar exited with code ${code}`));
    });
  });
}

function writeJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8", ...headers });
  response.end(JSON.stringify(payload));
}

function writeText(response, statusCode, message) {
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(message);
}
function buildClientPhotoEntry(entry) {
  return {
    src: String(entry.src || "").trim(),
    title: String(entry.title || "").trim(),
    credit: String(entry.credit || "").trim(),
    originalName: String(entry.originalName || "").trim(),
    publicPath: String(entry.publicPath || "").trim(),
    originalPath: String(entry.originalPath || "").trim(),
    publicSrc: buildPublicSrcFromArchivePath(String(entry.publicPath || "").trim()),
    originalSrc: buildOriginalSrcFromArchivePath(String(entry.originalPath || "").trim()),
  };
}
