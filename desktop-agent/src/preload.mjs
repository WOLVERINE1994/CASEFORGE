import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("caseforgeAgent", {
  start: () => ipcRenderer.invoke("agent:start"),
  stop: () => ipcRenderer.invoke("agent:stop"),
  status: () => ipcRenderer.invoke("agent:status"),
  openHealth: () => ipcRenderer.invoke("agent:open-health"),
  openCaseForge: () => ipcRenderer.invoke("agent:open-caseforge"),
  onLog: (callback) => {
    ipcRenderer.on("agent:log", (_event, entry) => callback(entry));
  },
  onStatus: (callback) => {
    ipcRenderer.on("agent:status", (_event, status) => callback(status));
  },
});
