/* global chrome, WebSocket */

let socket = null;

function sendToCloud(message) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  socket.send(JSON.stringify(message));
}

async function getRecorderConfig() {
  const values = await chrome.storage.local.get(["caseforgeSessionId", "caseforgeWsUrl"]);
  return {
    sessionId: values.caseforgeSessionId || null,
    wsUrl: values.caseforgeWsUrl || null,
  };
}

async function connectCloudStream(wsUrl) {
  if (!wsUrl) return null;
  if (socket && socket.readyState === WebSocket.OPEN) return socket;
  socket = new WebSocket(wsUrl);
  return socket;
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  const config = await getRecorderConfig();
  await connectCloudStream(config.wsUrl);
  await chrome.scripting.executeScript({
    files: ["content-recorder.js"],
    target: { tabId: tab.id },
  });
  await chrome.tabs.sendMessage(tab.id, {
    source: "caseforge-extension",
    type: "caseforge:start-recording",
    sessionId: config.sessionId,
  });
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.source !== "caseforge-content-recorder") return;
  sendToCloud({
    ...message,
    tabId: sender.tab?.id ?? message.tabId,
    timestamp: new Date().toISOString(),
  });
});
