const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const { URL } = require("url");

const ROOT_DIR = __dirname;
const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT || 8000);
const UPLOADS_MANIFEST_PATH = path.join(ROOT_DIR, "uploads.json");
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
  ".webp": "image/webp",
};

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host || `${HOST}:${PORT}`}`);

    if (request.method === "GET" && requestUrl.pathname === "/api/uploads") {
      return handleGetUploads(response);
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/upload") {
      return handleUpload(request, response);
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/delete-upload") {
      return handleDeleteUpload(request, response);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return writeJson(response, 405, { ok: false, message: "Method not allowed" });
    }

    return serveStaticFile(requestUrl.pathname, response, request.method === "HEAD");
  } catch (error) {
    console.error(error);
    return writeJson(response, 500, { ok: false, message: "Internal server error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
});

async function handleGetUploads(response) {
  const manifest = await readUploadsManifest();
  const publicCities = {};
  Object.entries(manifest.cities || {}).forEach(([cityIndex, entries]) => {
    publicCities[cityIndex] = Array.isArray(entries)
      ? entries.map(({ src, title, credit }) => ({ src, title, credit }))
      : [];
  });
  return writeJson(response, 200, { ok: true, cities: publicCities });
}

async function handleUpload(request, response) {
  const payload = await readJsonBody(request);
  const cityIndex = Number(payload.cityIndex);
  const files = Array.isArray(payload.files) ? payload.files : [];
  const conferenceType = String(payload.conferenceType || "").trim() || "other";
  const country = String(payload.country || "").trim() || "country";
  const eventDate = String(payload.eventDate || "").trim() || "unknown";
  const deletePassword = String(payload.deletePassword || "").trim() || "test";

  if (!Number.isInteger(cityIndex) || cityIndex < 0 || files.length === 0) {
    return writeJson(response, 400, { ok: false, message: "cityIndex または files が不正です" });
  }

  const uploadDirectoryName = buildUploadDirectoryName(conferenceType, country, eventDate);
  const uploadDirectoryPath = path.join(ROOT_DIR, "images", "uploaded", uploadDirectoryName);
  await fs.mkdir(uploadDirectoryPath, { recursive: true });

  const savedPhotos = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const savedPhoto = await saveUploadedFile(uploadDirectoryPath, uploadDirectoryName, file, index, deletePassword);
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

  if (!Number.isInteger(cityIndex) || cityIndex < 0 || !src.startsWith("./images/uploaded/")) {
    return writeJson(response, 400, { ok: false, message: "cityIndex または src が不正です" });
  }

  const manifest = await readUploadsManifest();
  const existingEntries = Array.isArray(manifest.cities?.[cityIndex]) ? manifest.cities[cityIndex] : [];
  const matchedEntry = existingEntries.find((entry) => String(entry?.src || "").trim() === src);
  if (!matchedEntry) {
    return writeJson(response, 404, { ok: false, message: "削除対象の画像が見つかりませんでした" });
  }

  if ((matchedEntry.deletePassword || "test") !== password) {
    return writeJson(response, 403, { ok: false, message: "パスワードが違います" });
  }

  const nextEntries = existingEntries.filter((entry) => String(entry?.src || "").trim() !== src);

  manifest.cities = manifest.cities || {};
  if (nextEntries.length === 0) {
    delete manifest.cities[cityIndex];
  } else {
    manifest.cities[cityIndex] = nextEntries;
  }
  await fs.writeFile(UPLOADS_MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  const filePath = path.resolve(ROOT_DIR, src.replace(/^\.\//, ""));
  if (filePath.startsWith(ROOT_DIR)) {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }

    await removeEmptyParentDirectories(path.dirname(filePath), path.join(ROOT_DIR, "images", "uploaded"));
  }

  return writeJson(response, 200, { ok: true, message: "画像を削除しました", src });
}

async function saveUploadedFile(uploadDirectoryPath, uploadDirectoryName, file, index, deletePassword) {
  const dataUrl = String(file?.dataUrl || "");
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) {
    return null;
  }

  const mimeType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  const fileName = await createUniqueFileName(uploadDirectoryPath, String(file?.name || `photo-${index + 1}`), mimeType, index);
  const filePath = path.join(uploadDirectoryPath, fileName);
  await fs.writeFile(filePath, buffer);

  return {
    src: `./images/uploaded/${uploadDirectoryName}/${fileName}`,
    title: String(file?.title || "").trim(),
    credit: String(file?.credit || "").trim(),
    deletePassword,
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

function buildUploadDirectoryName(conferenceType, country, eventDate) {
  const conferencePart = slugify(conferenceType) || "other";
  const countryPart = slugify(country) || "country";
  const yearPart = slugify(eventDate) || "unknown";
  return `${conferencePart}-${countryPart}-${yearPart}`;
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
    return normalizeUploadsManifest(parsed && typeof parsed === "object" ? parsed : { cities: {} });
  } catch (error) {
    if (error.code === "ENOENT") {
      return { cities: {} };
    }
    throw error;
  }
}

function normalizeUploadsManifest(manifest) {
  const normalized = { cities: {} };
  Object.entries(manifest.cities || {}).forEach(([cityIndex, entries]) => {
    normalized.cities[cityIndex] = Array.isArray(entries)
      ? entries
          .filter((entry) => entry && typeof entry === "object" && entry.src)
          .map((entry) => ({
            src: String(entry.src || "").trim(),
            title: String(entry.title || "").trim(),
            credit: String(entry.credit || "").trim(),
            deletePassword: String(entry.deletePassword || "test"),
          }))
      : [];
  });
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

async function serveStaticFile(urlPathname, response, headOnly) {
  const normalizedPath = decodeURIComponent(urlPathname === "/" ? "/index.html" : urlPathname);
  const filePath = path.join(ROOT_DIR, normalizedPath);
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(ROOT_DIR)) {
    return writeText(response, 403, "Forbidden");
  }

  try {
    const stat = await fs.stat(resolvedPath);
    if (stat.isDirectory()) {
      return serveStaticFile(path.join(normalizedPath, "index.html"), response, headOnly);
    }

    const extension = path.extname(resolvedPath).toLowerCase();
    const contentType = STATIC_TYPES[extension] || "application/octet-stream";
    response.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-cache" });
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

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
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

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function writeText(response, statusCode, message) {
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(message);
}
