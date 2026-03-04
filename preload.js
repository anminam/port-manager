const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("portManager", {
  getPorts: () => ipcRenderer.invoke("get-ports"),
  killProcess: (pid) => ipcRenderer.invoke("kill-process", pid),
});
