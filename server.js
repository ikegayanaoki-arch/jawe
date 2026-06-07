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
const WATERMARK_NOTICE_TEXT = "日本風工学会会員限定|転載禁止";
const WATERMARK_NOTICE_PATH_D =
  "M27.70-33.50L72.30-33.50L72.30-10.90L27.70-10.90ZM27.70-45.30L27.70-66.80L72.30-66.80L72.30-45.30ZM15.40-78.90L15.40 7.80L27.70 7.80L27.70 1.20L72.30 1.20L72.30 7.60L85.20 7.60L85.20-78.90ZM143.60-84.90L143.60-65.50L105.90-65.50L105.90-53.30L136.50-53.30C128.70-37.80 116-23.40 101.90-15.70C104.70-13.30 108.60-8.70 110.70-5.70C116.30-9.20 121.50-13.60 126.40-18.60L126.40-8L143.60-8L143.60 9L156.30 9L156.30-8L172.90-8L172.90-19.50C177.90-14.20 183.40-9.70 189.30-6.10C191.40-9.50 195.60-14.40 198.60-16.90C184.20-24.50 171.40-38.30 163.50-53.30L194.30-53.30L194.30-65.50L156.30-65.50L156.30-84.90ZM143.60-20.20L127.90-20.20C133.80-26.60 139.10-34 143.60-42.10ZM156.30-20.20L156.30-42.30C160.80-34.10 166.20-26.70 172.30-20.20ZM213.50-80.90L213.50-46C213.50-30.80 212.60-10.80 202.40 2.80C205.10 4 210.10 7.30 212.10 9.30C223.20-5.50 224.90-29.30 224.90-46L224.90-69.80L274.10-69.80C274.10-26.90 274.30 9 289 9C295.20 9 297.50 3.40 298.60-8.70C296.50-10.90 293.80-14.80 291.90-18.20C291.80-10.10 291.10-4 290.20-4C285.40-4 285.40-41.40 286-80.90ZM237.40-40L243.80-40L243.80-29.10L237.40-29.10ZM254.20-40L260.80-40L260.80-29.10L254.20-29.10ZM258.30-17C259.40-15 260.40-12.90 261.40-10.70L254.20-10.20L254.20-20L270.50-20L270.50-49.20L254.20-49.20L254.20-56.30C260.90-57.20 267.40-58.30 272.90-59.70L265-68.30C255.50-65.70 239.70-64 225.90-63.20C227-60.90 228.40-56.80 228.80-54.30C233.60-54.50 238.70-54.80 243.80-55.20L243.80-49.20L228.20-49.20L228.20-20L243.80-20L243.80-9.50L223.70-8.40L224.50 2.30L265.20-1C266 1.50 266.60 3.80 267 5.80L276.80 2.50C275.60-3.60 271.50-12.90 267.40-19.80ZM304.50-10.10L304.50 2L395.90 2L395.90-10.10L356.50-10.10L356.50-62L390.30-62L390.30-74.60L310-74.60L310-62L342.80-62L342.80-10.10ZM443.90-34.80L443.90-28.30L405.40-28.30L405.40-17.30L443.90-17.30L443.90-4.20C443.90-2.80 443.40-2.40 441.40-2.40C439.30-2.30 431.80-2.30 425.50-2.60C427.30 0.60 429.60 5.70 430.40 9C438.90 9 445.20 8.90 450 7.20C454.80 5.50 456.20 2.30 456.20-3.90L456.20-17.30L494.90-17.30L494.90-28.30L457-28.30C465.20-33 473-39.50 478.60-45.60L471.10-51.40L468.50-50.80L423.30-50.80L423.30-40.40L457.40-40.40C455-38.40 452.30-36.50 449.60-34.80ZM438.50-81.60C440.90-77.80 443.40-73 444.90-69.10L429.10-69.10L432.70-70.80C431.10-74.60 427.10-80 423.60-84L413.40-79.40C415.80-76.30 418.50-72.40 420.30-69.10L406.70-69.10L406.70-44.60L417.90-44.60L417.90-58.50L482-58.50L482-44.60L493.80-44.60L493.80-69.10L480.50-69.10C483.30-72.60 486.20-76.60 488.90-80.50L475.90-84.30C473.90-79.70 470.60-73.80 467.30-69.10L452.10-69.10L457-71C455.70-75.10 452.30-81.10 449.10-85.50ZM558.10-17.90C561.30-14.90 564.70-11.40 567.90-7.80L537.60-6.70C540.70-12.20 543.90-18.40 546.80-24.30L591.90-24.30L591.90-35.50L508.80-35.50L508.80-24.30L532-24.30C530-18.50 527.20-11.90 524.40-6.30L509.30-5.80L510.80 6C528 5.20 552.90 4.10 576.50 2.90C578 5.10 579.40 7.20 580.40 9.10L591.60 2.30C587-5.30 577.60-15.80 568.60-23.50ZM526.60-51.10L526.60-43.80L573.50-43.80L573.50-51.70C579-48 584.80-44.60 590.40-42C592.50-45.60 595.20-49.90 598.20-52.90C582.30-58.60 566.40-70 555.70-84.80L543.10-84.80C535.70-72.90 519.70-58.70 502.50-51.10C505-48.60 508.20-44 509.60-41.10C515.50-43.90 521.30-47.30 526.60-51.10ZM549.90-73.30C554.50-67 561.40-60.60 569.20-54.80L531.60-54.80C539.20-60.70 545.60-67.20 549.90-73.30ZM658.10-17.90C661.30-14.90 664.70-11.40 667.90-7.80L637.60-6.70C640.70-12.20 643.90-18.40 646.80-24.30L691.90-24.30L691.90-35.50L608.80-35.50L608.80-24.30L632-24.30C630-18.50 627.20-11.90 624.40-6.30L609.30-5.80L610.80 6C628 5.20 652.90 4.10 676.50 2.90C678 5.10 679.40 7.20 680.40 9.10L691.60 2.30C687-5.30 677.60-15.80 668.60-23.50ZM626.60-51.10L626.60-43.80L673.50-43.80L673.50-51.70C679-48 684.80-44.60 690.40-42C692.50-45.60 695.20-49.90 698.20-52.90C682.30-58.60 666.40-70 655.70-84.80L643.10-84.80C635.70-72.90 619.70-58.70 602.50-51.10C605-48.60 608.20-44 609.60-41.10C615.50-43.90 621.30-47.30 626.60-51.10ZM649.90-73.30C654.50-67 661.40-60.60 669.20-54.80L631.60-54.80C639.20-60.70 645.60-67.20 649.90-73.30ZM729.90-72.50L770.50-72.50L770.50-66L729.90-66ZM717.80-81.80L717.80-56.70L783.20-56.70L783.20-81.80ZM725.20-32.90L774.30-32.90L774.30-28.60L725.20-28.60ZM725.20-21L774.30-21L774.30-16.70L725.20-16.70ZM725.20-44.70L774.30-44.70L774.30-40.50L725.20-40.50ZM754.60-2.50C765.30 0.60 779.10 5.60 786.90 9.20L797.50 0.70C790.50-2.10 780-5.70 770.60-8.50L786.80-8.50L786.80-52.90L713.30-52.90L713.30-8.50L728.90-8.50C722.10-5.10 711.80-1.50 703.10 0.40C705.90 2.70 710 6.50 712.20 9C722.30 6.50 735.30 1.60 743.30-3.10L735.70-8.50L763.10-8.50ZM855.40-52.40L878.60-52.40L878.60-44L855.40-44ZM855.40-62.20L855.40-70.20L878.60-70.20L878.60-62.20ZM885.90-33C883.60-30 880.20-26.40 876.90-23.20C875.40-26.50 874.10-30 873.10-33.70L890.50-33.70L890.50-80.50L843.80-80.50L843.80-5.90L833.40-4.20L837.30 7.40C846.90 5.40 859.20 2.70 870.80 0L869.80-10.40L855.40-7.80L855.40-33.70L862.60-33.70C867.10-14.20 874.80 0.90 889.70 8.60C891.30 5.50 894.90 0.90 897.50-1.40C890.90-4.30 885.70-8.90 881.70-14.70C886-18 891-22.30 895.30-26.50ZM807.40-80.60L807.40 9L818.60 9L818.60-70L827.30-70C825.60-63 823.30-53.90 821.10-47.40C827.10-40.60 828.50-34.40 828.50-29.80C828.60-26.90 828-25 826.80-24.10C825.90-23.50 824.90-23.20 823.80-23.20C822.50-23.20 821.10-23.20 819.20-23.30C820.90-20.30 821.70-15.60 821.80-12.60C824.30-12.60 826.80-12.50 828.80-12.80C831-13.20 833.10-13.80 834.70-15C838-17.40 839.40-21.50 839.40-28.20C839.40-34 838.20-40.90 831.60-48.70C834.70-56.60 838.20-67.60 841-76.40L832.80-81.10L831.10-80.60ZM919.80-37.80C918-20.50 913.10-6.60 902.20 1.40C905 3.20 910.10 7.40 912.10 9.60C917.80 4.70 922.20-1.70 925.50-9.50C934.60 4.90 948.40 8 967 8L992.10 8C992.70 4.30 994.60-1.40 996.40-4.30C989.60-4 973-4 967.60-4C963.60-4 959.80-4.20 956.20-4.60L956.20-19.60L983.70-19.60L983.70-30.80L956.20-30.80L956.20-43.30L977.60-43.30L977.60-54.80L922.30-54.80L922.30-43.30L943.70-43.30L943.70-8.10C937.80-10.90 933.10-15.70 930-23.70C931-27.70 931.70-32 932.30-36.50ZM907.10-74.70L907.10-49.60L918.90-49.60L918.90-63.40L980.70-63.40L980.70-49.60L993-49.60L993-74.70L956.30-74.70L956.30-84.80L943.50-84.80L943.50-74.70ZM1010 28.40L1019.60 28.40L1019.60-85.10L1010-85.10ZM1082.50-78L1082.50-66.70L1122.60-66.70L1122.60-78ZM1105.80-23.60C1108.20-18.80 1110.50-13.10 1112.30-7.70L1096.10-6.60C1098.70-15.70 1101.50-27.60 1103.60-38.60L1126.10-38.60L1126.10-49.90L1078.60-49.90L1078.60-38.60L1090.60-38.60C1089.20-27.70 1086.90-15 1084.50-5.80L1076-5.30L1078.20 6.50C1088.50 5.60 1102.10 4.30 1115.40 3C1115.90 5 1116.20 7 1116.50 8.70L1127.60 4.30C1125.90-4.50 1121.30-17.60 1116-27.70ZM1036.30-59.60L1036.30-23.20L1050.50-23.20L1050.50-17.50L1032.70-17.50L1032.70-7L1050.50-7L1050.50 8.90L1061.60 8.90L1061.60-7L1078.50-7L1078.50-17.50L1061.60-17.50L1061.60-23.20L1076.60-23.20L1076.60-59.60L1061.80-59.60L1061.80-65.10L1077.80-65.10L1077.80-75.40L1061.80-75.40L1061.80-84.90L1050.50-84.90L1050.50-75.40L1034.10-75.40L1034.10-65.10L1050.50-65.10L1050.50-59.60ZM1045.50-37.50L1051.70-37.50L1051.70-31.60L1045.50-31.60ZM1060.40-37.50L1067.10-37.50L1067.10-31.60L1060.40-31.60ZM1045.50-51.20L1051.70-51.20L1051.70-45.30L1045.50-45.30ZM1060.40-51.20L1067.10-51.20L1067.10-45.30L1060.40-45.30ZM1202.40-78.70C1206.80-74.40 1212.20-68.30 1214.50-64.30L1223.90-70.80C1221.20-74.70 1215.70-80.50 1211.20-84.60ZM1211.60-49.50C1209.20-41.70 1206.20-34.60 1202.40-28.10C1201.10-35.50 1200.20-44.30 1199.60-53.80L1225.30-53.80L1225.30-63.70L1199.20-63.70C1199-70.50 1198.90-77.60 1199.10-84.80L1187.10-84.80C1187.10-77.70 1187.20-70.60 1187.40-63.70L1166.30-63.70L1166.30-69L1182.30-69L1182.30-78.20L1166.30-78.20L1166.30-84.90L1154.90-84.90L1154.90-78.20L1138.70-78.20L1138.70-69L1154.90-69L1154.90-63.70L1134.20-63.70L1134.20-53.80L1155.10-53.80L1155.10-49.50L1136.90-49.50L1136.90-41L1155.10-41L1155.10-37.20L1138.70-37.20L1138.70-12.40L1155.30-12.40L1155.30-8.60L1135.60-8.60L1135.60 0.10L1155.30 0.10L1155.30 9L1165.80 9L1165.80 0.10L1175.10 0.10C1178 2.50 1181.30 6.20 1183 9.20C1188.30 5.70 1193.20 1.60 1197.60-2.90C1201.20 4.60 1206.10 9 1212.60 9C1221.50 9 1225.20 4.60 1226.80-12.80C1223.80-13.90 1219.80-16.60 1217.30-19.20C1216.80-7.60 1215.80-2.70 1213.70-2.70C1210.80-2.70 1208.10-6.50 1206-13C1212.80-22.50 1218.20-33.60 1222.20-46.20ZM1165.90-53.80L1187.90-53.80C1188.80-39.20 1190.40-25.70 1193.20-15.10C1190.40-11.80 1187.30-8.90 1184-6.20L1184-8.60L1165.80-8.60L1165.80-12.40L1182.80-12.40L1182.80-37.20L1165.90-37.20L1165.90-41L1184.20-41L1184.20-49.50L1165.90-49.50ZM1147.20-22L1156.10-22L1156.10-18.30L1147.20-18.30ZM1164.90-22L1174-22L1174-18.30L1164.90-18.30ZM1147.20-31.30L1156.10-31.30L1156.10-27.60L1147.20-27.60ZM1164.90-31.30L1174-31.30L1174-27.60L1164.90-27.60ZM1294.20-9C1301-4.20 1309.50 2.90 1313.40 7.50L1323.70 1.20C1319.30-3.50 1310.40-10.20 1303.70-14.60ZM1246.60-40.70L1246.60-31L1314-31L1314-40.70ZM1251.10-14.20C1247.20-8.60 1240.10-3 1233 0.50C1235.60 2.20 1240.20 5.90 1242.30 7.90C1249.40 3.60 1257.50-3.40 1262.40-10.60ZM1251.40-85L1251.40-76.30L1236-76.30L1236-66.60L1248.10-66.60C1243.90-60.50 1238-54.70 1232.20-51.40C1234.60-49.50 1237.80-45.80 1239.40-43.30C1243.60-46.20 1247.80-50.50 1251.40-55.40L1251.40-43.50L1262.50-43.50L1262.50-56.60C1265.80-54 1269.30-51.20 1271.30-49.30L1277.50-57.30C1275.10-59 1266.50-64.30 1262.50-66.50L1262.50-66.60L1275.30-66.60L1275.30-76.30L1262.50-76.30L1262.50-85ZM1235.50-26L1235.50-16L1273.90-16L1273.90-2.70C1273.90-1.50 1273.40-1.20 1271.80-1.10C1270.30-1 1264.30-1 1259.40-1.30C1260.90 1.60 1262.70 5.90 1263.30 9.10C1270.80 9.10 1276.40 9 1280.50 7.50C1284.80 5.90 1286 3.20 1286-2.40L1286-16L1324-16L1324-26ZM1295.50-85L1295.50-76.30L1278.80-76.30L1278.80-66.60L1292-66.60C1287.60-60.60 1281.10-55 1274.90-51.80C1277.10-49.90 1280.40-46.10 1282-43.70C1286.80-46.70 1291.50-51.30 1295.50-56.40L1295.50-43.50L1306.80-43.50L1306.80-55.90C1310.80-51 1315.20-46.50 1319.30-43.50C1321-46.10 1324.40-49.80 1326.80-51.70C1320.80-55 1314.10-60.80 1309.30-66.60L1323.30-66.60L1323.30-76.30L1306.80-76.30L1306.80-85ZM1346.50-64.30L1346.50-8.10L1333.70-8.10L1333.70 3.90L1425.50 3.90L1425.50-8.10L1390.10-8.10L1390.10-41.50L1420-41.50L1420-53.60L1390.10-53.60L1390.10-84.90L1377.30-84.90L1377.30-8.10L1359-8.10L1359-64.30Z";
const WATERMARK_NOTICE_PATH_BOUNDS = { x1: 15.4, x2: 1425.5 };
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

    if (request.method === "GET" && requestUrl.pathname === "/api/export/full-backup") {
      return handleCreateFullBackupArchive(request, response);
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
  const useAdminPassword = Boolean(payload.useAdminPassword);

  if (!Number.isInteger(cityIndex) || cityIndex < 0 || !isServedUploadedSrc(src)) {
    return writeJson(response, 400, { ok: false, message: "cityIndex または src が不正です" });
  }

  const manifest = await readUploadsManifest();
  const existingEntries = Array.isArray(manifest.cities?.[cityIndex]) ? manifest.cities[cityIndex] : [];
  const matchedEntry = existingEntries.find((entry) => photoEntryMatchesSrc(entry, src));
  if (!matchedEntry) {
    return writeJson(response, 404, { ok: false, message: "削除対象の画像が見つかりませんでした" });
  }

  const deletePassword = String(matchedEntry.deletePassword || "test");
  const passwordMatched = useAdminPassword ? isAdminPassword(password) : deletePassword === password;
  if (!passwordMatched) {
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
    fullBackupDownloadPath: "/api/export/full-backup",
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

async function handleCreateFullBackupArchive(request, response) {
  if (!isAdminDownloadAuthorized(request)) {
    return writeJson(response, 403, {
      ok: false,
      message: "管理者パスワードが必要です。`X-Admin-Password` ヘッダーを付けてください。",
    });
  }

  await ensureDirectory(EXPORTS_DIR);
  const archiveFileName = `full-backup-${formatTimestampForFileName(new Date())}.tar.gz`;
  const archivePath = path.join(EXPORTS_DIR, archiveFileName);

  await createFullBackupArchive(archivePath);

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
  return [conferencePart, eventPart, countryPart, cityPart].join("-").slice(0, 160);
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
    WATERMARK_NOTICE_TEXT,
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
  const measuredTextWidth = measureWatermarkTextWidth(lines, fontSize);
  const watermarkWidth = Math.min(
    Math.max(Math.round(safeWidth * 0.38), Math.ceil(measuredTextWidth + padding * 2.8)),
    Math.round(safeWidth * 0.78),
    720,
  );
  const watermarkHeight = padding * 2 + lineHeight * lines.length;
  const x = safeWidth - watermarkWidth - padding;
  const y = safeHeight - watermarkHeight - padding;
  const textElements = createWatermarkElements(lines, {
    x,
    y,
    width: watermarkWidth,
    padding,
    lineHeight,
    fontSize,
  });

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${safeWidth}" height="${safeHeight}">
      <rect x="${x}" y="${y}" width="${watermarkWidth}" height="${watermarkHeight}" rx="18" ry="18" fill="#0a1b1f" fill-opacity="0.62" />
      <g fill="#ffffff" fill-opacity="0.94">
        ${textElements}
      </g>
    </svg>
  `;
}

function createWatermarkElements(lines, layout) {
  return lines
    .map((line, index) => {
      const baselineY = layout.y + layout.padding + layout.fontSize + index * layout.lineHeight;
      if (line === WATERMARK_NOTICE_TEXT) {
        return createWatermarkNoticePath(layout, baselineY);
      }

      return `<text x="${layout.x + layout.width / 2}" y="${baselineY}" text-anchor="middle" font-family='"Noto Sans JP", "Noto Sans CJK JP", Arial, sans-serif' font-size="${layout.fontSize}" font-weight="700">${escapeXml(line)}</text>`;
    })
    .join("");
}

function createWatermarkNoticePath(layout, baselineY) {
  const scale = layout.fontSize / 100;
  const pathWidth = (WATERMARK_NOTICE_PATH_BOUNDS.x2 - WATERMARK_NOTICE_PATH_BOUNDS.x1) * scale;
  const translateX = layout.x + (layout.width - pathWidth) / 2 - WATERMARK_NOTICE_PATH_BOUNDS.x1 * scale;
  return `<path d="${WATERMARK_NOTICE_PATH_D}" transform="translate(${translateX.toFixed(2)} ${baselineY.toFixed(
    2,
  )}) scale(${scale.toFixed(4)})" />`;
}

function measureWatermarkTextWidth(lines, fontSize) {
  return lines.reduce((maxWidth, line) => {
    const trimmedLine = String(line || "").trim();
    if (!trimmedLine) {
      return maxWidth;
    }

    if (trimmedLine === WATERMARK_NOTICE_TEXT) {
      return Math.max(maxWidth, (WATERMARK_NOTICE_PATH_BOUNDS.x2 - WATERMARK_NOTICE_PATH_BOUNDS.x1) * (fontSize / 100));
    }

    return Math.max(maxWidth, trimmedLine.length * fontSize * 0.62);
  }, 0);
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
  return isAdminPassword(headerPassword);
}

function isAdminPassword(password) {
  if (!ADMIN_DOWNLOAD_PASSWORD) {
    return false;
  }

  return String(password || "").trim() === ADMIN_DOWNLOAD_PASSWORD;
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

async function createFullBackupArchive(outputPath) {
  await new Promise((resolve, reject) => {
    const child = spawn(
      "tar",
      [
        "-czf",
        outputPath,
        "--exclude=src/node_modules",
        "--exclude=src/.git",
        "--exclude=src/data/exports/*.tar.gz",
        "-C",
        path.dirname(ROOT_DIR),
        path.basename(ROOT_DIR),
      ],
      { cwd: path.dirname(ROOT_DIR) },
    );
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
