const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopWindow", {
  close: () => ipcRenderer.send("window:close"),
  isDesktop: true,
  isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  minimize: () => ipcRenderer.send("window:minimize"),
  onMaximizedChange: (callback) => {
    const listener = (_event, value) => callback(Boolean(value));
    ipcRenderer.on("window:maximized", listener);
    return () => ipcRenderer.removeListener("window:maximized", listener);
  },
  toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
});
