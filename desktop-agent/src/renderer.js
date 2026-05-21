const state = {
  status: null,
  logs: [],
  busy: false,
};

const statusPill = document.querySelector("[data-status-pill]");
const statusText = document.querySelector("[data-status-text]");
const endpointText = document.querySelector("[data-endpoint]");
const detailText = document.querySelector("[data-detail]");
const logsEl = document.querySelector("[data-logs]");
const startButton = document.querySelector("[data-start]");
const stopButton = document.querySelector("[data-stop]");
const healthButton = document.querySelector("[data-health]");
const caseforgeButton = document.querySelector("[data-caseforge]");

const setBusy = (busy) => {
  state.busy = busy;
  document.body.classList.toggle("is-busy", busy);
  startButton.disabled = busy;
  stopButton.disabled = busy;
};

const renderLogs = () => {
  if (!state.logs.length) {
    logsEl.innerHTML = '<div class="log-empty">Connection activity will appear here.</div>';
    return;
  }

  logsEl.innerHTML = state.logs
    .slice(-120)
    .map(
      (entry) =>
        `<div class="log-line log-${entry.level}"><span>${entry.at}</span><p>${escapeHtml(entry.message)}</p></div>`,
    )
    .join("");
  logsEl.scrollTop = logsEl.scrollHeight;
};

const renderStatus = () => {
  const status = state.status;
  const running = Boolean(status?.running);
  const managedByApp = Boolean(status?.managedByApp);
  const external = Boolean(status?.externalAgentDetected);

  statusPill.className = `status-pill ${running ? "running" : "stopped"}`;
  statusText.textContent = running ? "Companion running" : "Companion stopped";
  endpointText.textContent = running ? "Ready for CaseForge" : "Waiting for CaseForge";

  if (running && managedByApp) {
    detailText.textContent = "Visual recording and playback are ready.";
  } else if (running && external) {
    detailText.textContent = "A CaseForge browser companion is already running.";
  } else if (status?.health?.message) {
    detailText.textContent = status.health.message;
  } else {
    detailText.textContent = "Start the companion before recording or replaying scenarios.";
  }

  startButton.disabled = state.busy || running;
  stopButton.disabled = state.busy || !managedByApp;
};

const refreshStatus = async () => {
  state.status = await window.caseforgeAgent.status();
  state.logs = state.status.logs || state.logs;
  renderStatus();
  renderLogs();
};

const runAction = async (action) => {
  setBusy(true);
  try {
    state.status = await action();
    state.logs = state.status.logs || state.logs;
    renderStatus();
    renderLogs();
  } finally {
    setBusy(false);
  }
};

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

startButton.addEventListener("click", () => runAction(window.caseforgeAgent.start));
stopButton.addEventListener("click", () => runAction(window.caseforgeAgent.stop));
healthButton.addEventListener("click", () => window.caseforgeAgent.openHealth());
caseforgeButton.addEventListener("click", () => window.caseforgeAgent.openCaseForge());

window.caseforgeAgent.onLog((entry) => {
  state.logs.push(entry);
  renderLogs();
});

window.caseforgeAgent.onStatus((status) => {
  state.status = { ...state.status, ...status };
  renderStatus();
});

refreshStatus();
setInterval(refreshStatus, 5000);
