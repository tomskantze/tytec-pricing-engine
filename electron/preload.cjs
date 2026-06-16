const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopWindow", {
  close: () => ipcRenderer.send("window:close"),
  debugLog: (message) => ipcRenderer.send("debug:log", message),
  getDocumentPreviewUrl: (payload) => ipcRenderer.invoke("document:preview-url", payload),
  isDesktop: true,
  isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  minimize: () => ipcRenderer.send("window:minimize"),
  readDocument: (payload) => ipcRenderer.invoke("document:read", payload),
  printHtml: (payload) => ipcRenderer.invoke("document:print-html", payload),
  saveAsDocument: (payload) => ipcRenderer.invoke("document:save-as", payload),
  saveDocument: (payload) => ipcRenderer.invoke("document:save", payload),
  savePdfAsFromHtml: (payload) => ipcRenderer.invoke("document:save-pdf-as-from-html", payload),
  savePdfFromHtml: (payload) => ipcRenderer.invoke("document:save-pdf-from-html", payload),
  onMaximizedChange: (callback) => {
    const listener = (_event, value) => callback(Boolean(value));
    ipcRenderer.on("window:maximized", listener);
    return () => ipcRenderer.removeListener("window:maximized", listener);
  },
  toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
});
