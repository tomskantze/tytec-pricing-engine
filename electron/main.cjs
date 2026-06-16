const { app, BrowserWindow, dialog, ipcMain, net, protocol } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { fileURLToPath, pathToFileURL } = require("node:url");
const isWindows = process.platform === "win32";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
    },
  },
  {
    scheme: "app-doc",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
    },
  },
]);

function registerAppProtocol() {
  protocol.handle("app", (request) => {
    const url = new URL(request.url);
    const requestedPath = decodeURIComponent(url.pathname);
    const relativePath = requestedPath === "/" ? "index.html" : requestedPath.replace(/^\/+/, "");
    const filePath = path.join(__dirname, "../dist", relativePath);
    return net.fetch(pathToFileURL(filePath).toString());
  });
  protocol.handle("app-doc", (request) => {
    const url = new URL(request.url);
    const storedPath = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    return net.fetch(pathToFileURL(storedPath).toString());
  });
}

function normalizeStoredPath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("file://")) {
    try {
      return fileURLToPath(raw);
    }
    catch {
      return "";
    }
  }
  return raw;
}

function activeWindow() {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
}

async function saveBufferToDocuments(documentId, fileName, buffer) {
  if (!buffer || buffer.byteLength === 0) return { previewUrl: "", storedPath: "" };
  const safeDocumentId = String(documentId || Date.now()).replace(/[^a-zA-Z0-9._ -]+/g, "_");
  const safeFileName = path.basename(String(fileName || "document.pdf")).replace(/[^a-zA-Z0-9._ -]+/g, "_");
  const documentsDir = path.join(app.getPath("userData"), "documents");
  await fs.mkdir(documentsDir, { recursive: true });
  const storedPath = path.join(documentsDir, `${safeDocumentId}-${safeFileName}`);
  await fs.writeFile(storedPath, buffer);
  return { previewUrl: pathToFileURL(storedPath).toString(), storedPath };
}

async function createPdfBufferFromHtml(html) {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
    },
  });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return await win.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
      preferCSSPageSize: true,
    });
  }
  finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

async function saveBufferWithDialog(fileName, buffer) {
  if (!buffer || buffer.byteLength === 0) return "";
  const target = await dialog.showSaveDialog(activeWindow() || undefined, {
    defaultPath: String(fileName || "quote.pdf"),
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (target.canceled || !target.filePath) return "";
  await fs.writeFile(target.filePath, buffer);
  return target.filePath;
}

function sendMaximized(win) {
  win.webContents.send("window:maximized", win.isMaximized());
}

function registerWindowControls() {
  ipcMain.on("window:minimize", () => activeWindow()?.minimize());
  ipcMain.on("window:close", () => activeWindow()?.close());
  ipcMain.on("debug:log", async (_event, message) => {
    try {
      const logPath = path.join(app.getPath("userData"), "document-debug.log");
      await fs.appendFile(logPath, `[${new Date().toISOString()}] ${String(message)}\n`);
    }
    catch {}
  });
  ipcMain.handle("document:save", async (_event, payload) => {
    const bytes = payload?.bytes;
    const buffer = Array.isArray(bytes)
      ? Buffer.from(bytes)
      : bytes instanceof ArrayBuffer
        ? Buffer.from(new Uint8Array(bytes))
        : ArrayBuffer.isView(bytes)
          ? Buffer.from(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
          : Buffer.isBuffer(bytes)
            ? bytes
            : null;
    const fileName = String(payload?.fileName || "document.pdf");
    const documentId = String(payload?.id || Date.now());
    try {
      const logPath = path.join(app.getPath("userData"), "document-debug.log");
      await fs.appendFile(logPath, `[${new Date().toISOString()}] document:save ${fileName} buffer=${buffer?.byteLength || 0}\n`);
    }
    catch {}
    return saveBufferToDocuments(documentId, fileName, buffer);
  });
  ipcMain.handle("document:save-pdf-from-html", async (_event, payload) => {
    const html = String(payload?.html || "");
    if (!html.trim()) return { previewUrl: "", storedPath: "" };
    const fileName = String(payload?.fileName || "quote.pdf");
    const documentId = String(payload?.id || Date.now());
    const buffer = await createPdfBufferFromHtml(html);
    return saveBufferToDocuments(documentId, fileName, buffer);
  });
  ipcMain.handle("document:save-pdf-as-from-html", async (_event, payload) => {
    const html = String(payload?.html || "");
    if (!html.trim()) return "";
    const fileName = String(payload?.fileName || "quote.pdf");
    const buffer = await createPdfBufferFromHtml(html);
    return saveBufferWithDialog(fileName, buffer);
  });
  ipcMain.handle("document:print-html", async (_event, payload) => {
    const html = String(payload?.html || "");
    if (!html.trim()) return false;
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
      },
    });
    try {
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      return await new Promise((resolve) => {
        win.webContents.print({ printBackground: true }, (success) => resolve(Boolean(success)));
      });
    }
    finally {
      if (!win.isDestroyed()) win.destroy();
    }
  });
  ipcMain.handle("document:save-as", async (_event, payload) => {
    const storedPath = normalizeStoredPath(payload?.storedPath);
    if (!storedPath) return "";
    try {
      const buffer = await fs.readFile(storedPath);
      return saveBufferWithDialog(String(payload?.fileName || path.basename(storedPath)), buffer);
    }
    catch {
      return "";
    }
  });
  ipcMain.handle("document:preview-url", async (_event, payload) => {
    const storedPath = normalizeStoredPath(payload?.storedPath);
    if (!storedPath) return "";
    try {
      await fs.access(storedPath);
      return pathToFileURL(storedPath).toString();
    }
    catch {
      return "";
    }
  });
  ipcMain.handle("document:read", async (_event, payload) => {
    const storedPath = normalizeStoredPath(payload?.storedPath);
    if (!storedPath) return null;
    try {
      const bytes = await fs.readFile(storedPath);
      return new Uint8Array(bytes);
    }
    catch {
      return null;
    }
  });
  ipcMain.handle("window:is-maximized", () => activeWindow()?.isMaximized() ?? false);
  ipcMain.handle("window:toggle-maximize", () => {
    const win = activeWindow();
    if (!win) return false;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return win.isMaximized();
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1080,
    minHeight: 720,
    frame: !isWindows,
    show: false,
    title: "Tytec Pricing Engine",
    icon: path.join(__dirname, "../build/icon.ico"),
    autoHideMenuBar: true,
    backgroundColor: "#151922",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      plugins: true,
    },
  });
  win.once("ready-to-show", () => win.show());
  win.on("maximize", () => sendMaximized(win));
  win.on("unmaximize", () => sendMaximized(win));

  const devUrl = process.env.ELECTRON_START_URL;
  if (devUrl) {
    win.loadURL(devUrl);
    return;
  }

  win.loadURL("app://tytec/index.html");
}

app.whenReady().then(() => {
  registerAppProtocol();
  registerWindowControls();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
