const fsNative = require("fs");
const fs = require("fs/promises");
const path = require("path");
const heicConvert = require("heic-convert");
const sharp = require("sharp");

const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploaded");
const ORIGINAL_UPLOADS_DIR = path.join(UPLOADS_DIR, "original");
const PUBLIC_UPLOADS_DIR = path.join(UPLOADS_DIR, "public");
const MANIFEST_PATH = path.join(DATA_DIR, "uploads.json");
const CITIES_PATH = path.join(ROOT_DIR, "cities.initial-data.js");
const PUBLIC_IMAGE_MAX_DIMENSION = Number(process.env.PUBLIC_IMAGE_MAX_DIMENSION || 1200);
const PUBLIC_IMAGE_QUALITY = Number(process.env.PUBLIC_IMAGE_QUALITY || 82);

async function main() {
  const cities = await loadCities();
  const manifest = await loadManifest();
  await fs.mkdir(ORIGINAL_UPLOADS_DIR, { recursive: true });
  await fs.mkdir(PUBLIC_UPLOADS_DIR, { recursive: true });

  for (const [cityIndexKey, entries] of Object.entries(manifest.cities || {})) {
    const cityIndex = Number(cityIndexKey);
    const city = Number.isInteger(cityIndex) ? cities[cityIndex] || {} : {};
    const normalizedEntries = [];

    for (const entry of Array.isArray(entries) ? entries : []) {
      const migrated = await migrateEntry(entry, cityIndex, city);
      if (migrated) {
        normalizedEntries.push(migrated);
      }
    }

    manifest.cities[cityIndexKey] = dedupeBySrc(normalizedEntries);
  }

  manifest.version = 2;
  manifest.generatedAt = new Date().toISOString();
  manifest.storage = {
    dataDir: DATA_DIR,
    uploadsDir: UPLOADS_DIR,
    originalUploadsDir: ORIGINAL_UPLOADS_DIR,
    publicUploadsDir: PUBLIC_UPLOADS_DIR,
    exportsDir: path.join(DATA_DIR, "exports"),
  };

  await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  await cleanupLegacyFlatDirectories();
  console.log("Migration completed.");
}

async function migrateEntry(entry, cityIndex, city) {
  const src = String(entry?.src || "").trim();
  if (!src.startsWith("./data/uploaded/public/")) {
    return null;
  }

  const relativeLegacyPath = src.replace(/^\.\/data\/uploaded\/public\//, "");
  const relativeDirectory = path.dirname(relativeLegacyPath);
  const sourceFilePath = await resolveSourceFile(entry, relativeLegacyPath);
  if (!sourceFilePath) {
    console.warn(`Skipping missing source: ${src}`);
    return null;
  }

  const originalName = String(entry?.originalName || path.basename(sourceFilePath)).trim() || path.basename(sourceFilePath);
  const originalDirectory = path.join(ORIGINAL_UPLOADS_DIR, relativeDirectory);
  const publicDirectory = path.join(PUBLIC_UPLOADS_DIR, relativeDirectory);
  await fs.mkdir(originalDirectory, { recursive: true });
  await fs.mkdir(publicDirectory, { recursive: true });

  const originalFilePath = path.join(originalDirectory, originalName);
  if (path.resolve(sourceFilePath) !== path.resolve(originalFilePath)) {
    await fs.copyFile(sourceFilePath, originalFilePath);
  } else if (!(await fileExists(originalFilePath))) {
    await fs.copyFile(sourceFilePath, originalFilePath);
  }

  const publicBaseName = slugify(path.basename(originalName, path.extname(originalName))) || "photo";
  const publicFileName = await createVariantFileName(publicDirectory, publicBaseName, ".jpg");
  const publicFilePath = path.join(publicDirectory, publicFileName);
  const publicImage = await buildPublicImageVariant(await fs.readFile(originalFilePath), {
    cityIndex,
    cityName: String(city?.name || entry?.cityName || "").trim(),
    conferenceType: String(city?.conferenceType || entry?.conferenceType || "").trim(),
    country: String(city?.country || entry?.country || "").trim(),
    eventDate: String(city?.eventDate || entry?.eventDate || "").trim(),
  });
  await fs.writeFile(publicFilePath, publicImage.buffer);

  const storedAt = String(entry?.storedAt || "").trim() || new Date().toISOString();
  const originalStat = await fs.stat(originalFilePath);
  const publicStat = await fs.stat(publicFilePath);

  return {
    id: String(entry?.id || `${storedAt}-${originalName}`).replace(/[^a-z0-9._-]+/gi, "-"),
    src: `./data/uploaded/public/${toPosixPath(path.join(relativeDirectory, publicFileName))}`,
    title: String(entry?.title || "").trim(),
    credit: String(entry?.credit || "").trim(),
    deletePassword: String(entry?.deletePassword || "test"),
    originalName,
    mimeType: String(entry?.mimeType || "").trim() || guessMimeType(originalName),
    bytes: publicStat.size,
    originalBytes: originalStat.size,
    publicBytes: publicStat.size,
    storedAt,
    archivePath: toPosixPath(path.join("uploaded", "original", relativeDirectory, originalName)),
    originalPath: toPosixPath(path.join("uploaded", "original", relativeDirectory, originalName)),
    publicPath: toPosixPath(path.join("uploaded", "public", relativeDirectory, publicFileName)),
    width: publicImage.width,
    height: publicImage.height,
    originalWidth: publicImage.originalWidth,
    originalHeight: publicImage.originalHeight,
    watermarkText: publicImage.watermarkText,
    cityIndex,
    cityName: String(city?.name || entry?.cityName || "").trim(),
    conferenceType: String(city?.conferenceType || entry?.conferenceType || "").trim(),
    country: String(city?.country || entry?.country || "").trim(),
    eventDate: String(city?.eventDate || entry?.eventDate || "").trim(),
  };
}

async function resolveSourceFile(entry, relativeLegacyPath) {
  const candidates = [
    path.join(ORIGINAL_UPLOADS_DIR, relativeLegacyPath),
    path.join(UPLOADS_DIR, relativeLegacyPath),
    path.join(ROOT_DIR, "images", "uploaded", relativeLegacyPath),
    resolveArchivePath(entry?.originalPath),
    resolveArchivePath(entry?.archivePath),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

function resolveArchivePath(relativePath) {
  const value = String(relativePath || "").trim().replace(/^\/+/, "");
  if (!value) {
    return null;
  }

  return path.join(DATA_DIR, value);
}

async function cleanupLegacyFlatDirectories() {
  const entries = await fs.readdir(UPLOADS_DIR, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "original" || entry.name === "public") {
      continue;
    }

    await fs.rm(path.join(UPLOADS_DIR, entry.name), { recursive: true, force: true });
  }
}

async function loadCities() {
  if (!(await fileExists(CITIES_PATH))) {
    return [];
  }

  const content = await fs.readFile(CITIES_PATH, "utf8");
  const match = content.match(/window\.__INITIAL_CITIES__\s*=\s*(\[.*\]);?\s*$/s);
  if (!match) {
    return [];
  }

  try {
    return JSON.parse(match[1]);
  } catch (error) {
    console.warn("Failed to parse cities.initial-data.js");
    return [];
  }
}

async function loadManifest() {
  const content = await fs.readFile(MANIFEST_PATH, "utf8");
  return JSON.parse(content);
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
  const watermarkText = [
    "JAWE Members Only",
    [context.conferenceType, context.eventDate].filter(Boolean).join(" "),
    [context.cityName, context.country].filter(Boolean).join(" / "),
  ].filter(Boolean);
  const svg = createWatermarkSvg(width, height, watermarkText);
  const output = await sharp(resizedBuffer)
    .composite([{ input: Buffer.from(svg), gravity: "southeast" }])
    .jpeg({
      quality: PUBLIC_IMAGE_QUALITY,
      mozjpeg: true,
      chromaSubsampling: "4:4:4",
    })
    .toBuffer();

  return { buffer: output, width, height, originalWidth, originalHeight, watermarkText };
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

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${safeWidth}" height="${safeHeight}">
      <rect x="${x}" y="${y}" width="${watermarkWidth}" height="${watermarkHeight}" rx="18" ry="18" fill="#0a1b1f" fill-opacity="0.62" />
      <g font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="#ffffff" fill-opacity="0.94">
        ${textElements}
      </g>
    </svg>
  `;
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

function dedupeBySrc(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    if (!entry?.src || seen.has(entry.src)) {
      return false;
    }
    seen.add(entry.src);
    return true;
  });
}

function toPosixPath(value) {
  return String(value || "").split(path.sep).join("/");
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function guessMimeType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const byExt = {
    ".gif": "image/gif",
    ".heic": "image/heic",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
  };
  return byExt[ext] || "application/octet-stream";
}

function escapeXml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
