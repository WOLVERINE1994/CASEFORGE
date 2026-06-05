import { app, BrowserWindow, ipcMain, shell } from "electron";
import { spawn } from "node:child_process";
import path from "node:path";

const AGENT_HOST = process.env.CASEFORGE_AGENT_HOST || "127.0.0.1";
const AGENT_PORT = process.env.CASEFORGE_AGENT_PORT || "4873";
const HEALTH_URL = `http://${AGENT_HOST}:${AGENT_PORT}/health`;
const CASEFORGE_URL = process.env.CASEFORGE_APP_URL || "https://caseforge-nine.vercel.app";

let mainWindow;
let agentProcess;
let externalAgentDetected = false;
const logBuffer = [];

const pushLog = (level, message) => {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    at: new Date().toLocaleTimeString(),
    level,
    message: String(message || "").trim(),
  };

  if (!entry.message) {
    return;
  }

  logBuffer.push(entry);
  if (logBuffer.length > 250) {
    logBuffer.shift();
  }

  mainWindow?.webContents.send("agent:log", entry);
};

const getAgentScriptPath = () => {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app.asar.unpacked", "scripts", "caseforge-local-agent.mjs");
  }

  return path.resolve(app.getAppPath(), "..", "scripts", "caseforge-local-agent.mjs");
};

const checkHealth = async () => {
  try {
    const response = await fetch(HEALTH_URL, { cache: "no-store" });
    if (!response.ok) {
      return { ok: false, message: `Health check returned ${response.status}.` };
    }

    const payload = await response.json();
    return { ok: true, payload };
  } catch (error) {
    return {
      ok: false,
      message: "Companion is stopped. Click Start when you are ready to record.",
      rawMessage: error instanceof Error ? error.message : "Agent is not reachable.",
    };
  }
};

const getStatus = async () => {
  const health = await checkHealth();

  return {
    running: Boolean(agentProcess && !agentProcess.killed) || health.ok,
    managedByApp: Boolean(agentProcess && !agentProcess.killed),
    externalAgentDetected: health.ok && !agentProcess,
    host: AGENT_HOST,
    port: AGENT_PORT,
    healthUrl: HEALTH_URL,
    caseforgeUrl: CASEFORGE_URL,
    health,
    logs: logBuffer,
  };
};

const startAgent = async () => {
  if (agentProcess && !agentProcess.killed) {
    return getStatus();
  }

  const existingHealth = await checkHealth();
  if (existingHealth.ok) {
    externalAgentDetected = true;
    pushLog("info", `Existing CaseForge Agent detected at ${HEALTH_URL}.`);
    return getStatus();
  }

  externalAgentDetected = false;
  const scriptPath = getAgentScriptPath();

  pushLog("info", `Starting CaseForge Agent on ${AGENT_HOST}:${AGENT_PORT}.`);

  agentProcess = spawn(process.execPath, [scriptPath], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      CASEFORGE_AGENT_HOST: AGENT_HOST,
      CASEFORGE_AGENT_PORT: AGENT_PORT,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  agentProcess.stdout?.on("data", (chunk) => pushLog("info", chunk.toString()));
  agentProcess.stderr?.on("data", (chunk) => pushLog("error", chunk.toString()));
  agentProcess.on("error", (error) => pushLog("error", error.message));
  agentProcess.on("exit", (code, signal) => {
    pushLog("info", `Agent stopped${code === null ? "" : ` with code ${code}`}${signal ? ` (${signal})` : ""}.`);
    agentProcess = undefined;
    mainWindow?.webContents.send("agent:status", {
      running: false,
      managedByApp: false,
      externalAgentDetected,
      host: AGENT_HOST,
      port: AGENT_PORT,
      healthUrl: HEALTH_URL,
      caseforgeUrl: CASEFORGE_URL,
    });
  });

  await new Promise((resolve) => setTimeout(resolve, 1200));
  return getStatus();
};

const stopAgent = async () => {
  if (!agentProcess) {
    pushLog("info", externalAgentDetected ? "Agent is running outside this app; leaving it untouched." : "Agent is already stopped.");
    return getStatus();
  }

  pushLog("info", "Stopping CaseForge Agent.");
  agentProcess.kill();
  agentProcess = undefined;
  await new Promise((resolve) => setTimeout(resolve, 500));
  return getStatus();
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 700,
    minWidth: 860,
    minHeight: 620,
    title: "CaseForge Agent",
    backgroundColor: "#f6f8fb",
    webPreferences: {
      preload: path.join(app.getAppPath(), "src", "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(app.getAppPath(), "src", "index.html"));
};

app.whenReady().then(async () => {
  createWindow();
  await startAgent();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  if (agentProcess && !agentProcess.killed) {
    agentProcess.kill();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("agent:start", startAgent);
ipcMain.handle("agent:stop", stopAgent);
ipcMain.handle("agent:status", getStatus);
ipcMain.handle("agent:open-health", () => shell.openExternal(HEALTH_URL));
ipcMain.handle("agent:open-caseforge", () => shell.openExternal(CASEFORGE_URL));
