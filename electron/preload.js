const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  openFile:    () => ipcRenderer.invoke("dialog:open-file"),
  getFileIcon: (filePath) => ipcRenderer.invoke("shell:get-file-icon", filePath),

  onUpdateAvailable:  (cb) => ipcRenderer.on("update:available",  (_, info) => cb(info)),
  onUpdateDownloaded: (cb) => ipcRenderer.on("update:downloaded", (_, info) => cb(info)),
  installUpdate:      ()   => ipcRenderer.send("update:install"),
});
