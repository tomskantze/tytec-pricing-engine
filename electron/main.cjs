const { app, BrowserWindow, ipcMain, net, protocol } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
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
]);

function registerAppProtocol() {
  protocol.handle("app", (request) => {
    const url = new URL(request.url);
    const requestedPath = decodeURIComponent(url.pathname);
    const relativePath = requestedPath === "/" ? "index.html" : requestedPath.replace(/^\/+/, "");
    const filePath = path.join(__dirname, "../dist", relativePath);
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function activeWindow() {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
}

function sendMaximized(win) {
  win.webContents.send("window:maximized", win.isMaximized());
}

function registerWindowControls() {
  ipcMain.on("window:minimize", () => activeWindow()?.minimize());
  ipcMain.on("window:close", () => activeWindow()?.close());
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
