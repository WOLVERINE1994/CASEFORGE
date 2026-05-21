import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";

const PORT = Number(process.env.CASEFORGE_AGENT_PORT || "4873");
const HOST = process.env.CASEFORGE_AGENT_HOST || "127.0.0.1";

const commandName = {
  navigate: "Navigate",
  click: "Click",
  fill: "Fill",
  select: "Select",
  hover: "Hover",
  press: "Press Key",
  "assert-text": "Verify Text",
  "assert-image": "Verify Image",
  "assert-a11y": "Accessibility Scan",
  "assert-label": "Verify Label / Name",
  "assert-focus": "Verify Keyboard Focus",
  "run-action": "Run Action",
};

const state = {
  browser: null,
  context: null,
  page: null,
  session: null,
};

const isBrowserInstallError = (error) =>
  error instanceof Error &&
  /executable doesn't exist|please run the following command|playwright install/i.test(
    error.message
  );

const browserInstallMessage =
  "CaseForge could not find a browser to open. Install Google Chrome or Microsoft Edge, then try recording again.";

const launchVisibleBrowser = async () => {
  try {
    return await chromium.launch({ headless: false });
  } catch (error) {
    if (!isBrowserInstallError(error)) {
      throw error;
    }
  }

  for (const channel of ["chrome", "msedge"]) {
    try {
      return await chromium.launch({ channel, headless: false });
    } catch {
      // Try the next installed browser.
    }
  }

  throw new Error(browserInstallMessage);
};

const jsonHeaders = (origin = "*") => ({
  "Access-Control-Allow-Origin": origin || "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json; charset=utf-8",
});

const sendJson = (res, status, payload, origin) => {
  res.writeHead(status, jsonHeaders(origin));
  res.end(JSON.stringify(payload));
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error("Request body too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });

const normalizeCommandType = (value) => {
  if (
    value === "click" ||
    value === "fill" ||
    value === "select" ||
    value === "hover" ||
    value === "press" ||
    value === "assert-text" ||
    value === "assert-image" ||
    value === "assert-a11y" ||
    value === "assert-label" ||
    value === "assert-focus"
  ) {
    return value;
  }

  return "navigate";
};

const inferLocator = (type, payload) => {
  if (type === "navigate") return undefined;

  if (type === "assert-a11y") {
    return { strategy: "a11y", value: "page" };
  }

  if (type === "assert-text") {
    return {
      strategy: "text",
      value: payload.value || payload.text || payload.label || "Expected text",
      text: payload.value || payload.text || payload.label,
    };
  }

  if (type === "assert-label") {
    return {
      strategy: "label",
      value: payload.value || payload.label || "Accessible label",
      label: payload.value || payload.label,
    };
  }

  if (type === "assert-image") {
    return {
      strategy: "image",
      value: payload.selector || payload.value || "img",
      cssPath: payload.selector,
      label: payload.label,
    };
  }

  return {
    strategy: "css",
    value: payload.selector || '[data-testid="target"]',
    cssPath: payload.selector,
    label: payload.label,
    role: payload.role,
    tagName: payload.tagName,
    text: payload.text,
  };
};

const pushCommand = (session, payload) => {
  const type = normalizeCommandType(payload.type);
  const eventKey = [
    type,
    payload.selector,
    payload.value,
    payload.key,
    payload.url,
  ].join("|");
  const now = Date.now();

  if (
    eventKey === session.lastEventKey &&
    session.lastEventAt &&
    now - session.lastEventAt < 450
  ) {
    return;
  }

  session.lastEventKey = eventKey;
  session.lastEventAt = now;

  session.commands.push({
    id: randomUUID(),
    scenarioId: session.scenarioId,
    order: session.commands.length,
    type,
    name: commandName[type],
    description: payload.label,
    locator: inferLocator(type, payload),
    inputValue:
      type === "fill" || type === "select" ? payload.value ?? "" : undefined,
    expectedValue: type.startsWith("assert")
      ? payload.value || payload.text || payload.label
      : undefined,
    url: type === "navigate" ? payload.url : undefined,
    key: type === "press" ? payload.key : undefined,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    meta: {
      recordedUrl: payload.url,
      recordedAt: payload.timestamp ?? now,
      source: "caseforge-local-agent",
    },
  });

  session.currentUrl = payload.url || session.currentUrl;
  session.updatedAt = now;
};

const recorderInitScript = () => {
  const win = window;
  if (win.__caseforgeRecorderInstalled) return;
  win.__caseforgeRecorderInstalled = true;

  const cssEscape = (value) =>
    win.CSS?.escape
      ? win.CSS.escape(value)
      : value.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~ ])/g, "\\$1");

  const textOf = (element) =>
    (element?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120);

  const readLabel = (element) => {
    if (!element) return "";
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel?.trim()) return ariaLabel.trim();

    const id = element.getAttribute("id");
    if (id) {
      const label = document.querySelector(`label[for="${cssEscape(id)}"]`);
      const labelText = textOf(label);
      if (labelText) return labelText;
    }

    const wrappingText = textOf(element.closest("label"));
    if (wrappingText) return wrappingText;

    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    ) {
      return (
        element.placeholder ||
        element.name ||
        element.getAttribute("autocomplete") ||
        ""
      );
    }

    return textOf(element);
  };

  const roleOf = (element) => {
    if (!element) return "";
    const explicitRole = element.getAttribute("role");
    if (explicitRole) return explicitRole;
    const tagName = element.tagName.toLowerCase();
    if (tagName === "button") return "button";
    if (tagName === "a") return "link";
    if (tagName === "select") return "combobox";
    if (tagName === "textarea") return "textbox";
    if (tagName === "input") {
      const type = element.type;
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      return "textbox";
    }
    return "";
  };

  const buildSelector = (element) => {
    if (!element) return "body";

    const testId =
      element.getAttribute("data-testid") ||
      element.getAttribute("data-test") ||
      element.getAttribute("data-cy");
    if (testId) return `[data-testid="${testId.replace(/"/g, '\\"')}"]`;

    const id = element.getAttribute("id");
    if (id) return `#${cssEscape(id)}`;

    const name = element.getAttribute("name");
    if (name) {
      return `${element.tagName.toLowerCase()}[name="${name.replace(/"/g, '\\"')}"]`;
    }

    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel) {
      return `${element.tagName.toLowerCase()}[aria-label="${ariaLabel.replace(/"/g, '\\"')}"]`;
    }

    const path = [];
    let current = element;
    while (current && current !== document.body && path.length < 5) {
      const tagName = current.tagName.toLowerCase();
      const parent = current.parentElement;
      if (!parent) {
        path.unshift(tagName);
        break;
      }
      const currentTagName = current.tagName;
      const siblings = Array.from(parent.children).filter(
        (child) => child.tagName === currentTagName
      );
      const index = siblings.indexOf(current) + 1;
      path.unshift(siblings.length > 1 ? `${tagName}:nth-of-type(${index})` : tagName);
      current = parent;
    }

    return path.length ? path.join(" > ") : element.tagName.toLowerCase();
  };

  const invoke = (payload) => {
    try {
      win.__caseforgeRecord?.({
        ...payload,
        url: location.href,
        timestamp: Date.now(),
      });
    } catch {
      // Keep the target app unaffected by recorder errors.
    }
  };

  let lastPointerTarget = null;
  document.addEventListener(
    "pointermove",
    (event) => {
      lastPointerTarget =
        event.target instanceof Element ? event.target : lastPointerTarget;
    },
    true
  );

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      invoke({
        type: "click",
        selector: buildSelector(target),
        label: readLabel(target),
        role: roleOf(target),
        tagName: target.tagName.toLowerCase(),
        text: textOf(target),
      });
    },
    true
  );

  document.addEventListener(
    "change",
    (event) => {
      const target = event.target;
      if (
        !(target instanceof HTMLInputElement) &&
        !(target instanceof HTMLTextAreaElement) &&
        !(target instanceof HTMLSelectElement)
      ) {
        return;
      }

      if (
        target instanceof HTMLInputElement &&
        ["file", "password"].includes(target.type)
      ) {
        return;
      }

      invoke({
        type: target instanceof HTMLSelectElement ? "select" : "fill",
        selector: buildSelector(target),
        value: target.value,
        label: readLabel(target),
        role: roleOf(target),
        tagName: target.tagName.toLowerCase(),
      });
    },
    true
  );

  document.addEventListener(
    "keydown",
    (event) => {
      const target =
        event.target instanceof Element
          ? event.target
          : lastPointerTarget || document.body;

      if (event.ctrlKey && event.altKey) {
        const selectedText = win.getSelection()?.toString().trim() || "";
        const label = readLabel(target);
        const text = selectedText || textOf(target) || label;
        const shortcutMap = {
          t: "assert-text",
          i: "assert-image",
          a: "assert-a11y",
          l: "assert-label",
          f: "assert-focus",
        };
        const type = shortcutMap[event.key.toLowerCase()];
        if (type) {
          event.preventDefault();
          event.stopPropagation();
          invoke({
            type,
            selector: buildSelector(target),
            value: type === "assert-a11y" ? "page" : text || label,
            label,
            role: roleOf(target),
            tagName: target.tagName.toLowerCase(),
            text,
          });
          return;
        }
      }

      if (["Enter", "Escape", "Tab"].includes(event.key)) {
        invoke({
          type: "press",
          selector: buildSelector(target),
          key: event.key,
          label: readLabel(target),
          role: roleOf(target),
          tagName: target.tagName.toLowerCase(),
        });
      }
    },
    true
  );
};

const attachRecorder = async (page, session) => {
  await page.exposeBinding("__caseforgeRecord", (_source, payload) => {
    pushCommand(session, payload);
  });
  await page.addInitScript(recorderInitScript);
  await page.evaluate(recorderInitScript).catch(() => undefined);

  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    const url = frame.url();
    if (!url || url.startsWith("about:blank")) return;
    pushCommand(session, {
      type: "navigate",
      url,
      label: "Browser navigation",
      timestamp: Date.now(),
    });
  });

  page.on("console", (message) => {
    session.logs = [
      `[browser:${message.type()}] ${message.text()}`,
      ...session.logs,
    ].slice(0, 40);
    session.updatedAt = Date.now();
  });
};

const closeRuntime = async () => {
  const session = state.session;
  if (session && session.status !== "failed") {
    session.status = "stopped";
    session.updatedAt = Date.now();
    session.logs = ["Recording stopped.", ...session.logs];
  }

  await state.browser?.close().catch(() => undefined);
  state.browser = null;
  state.context = null;
  state.page = null;
};

const getRecorderSnapshot = (session, cursor = 0) => ({
  sessionId: session.id,
  status: session.status,
  cursor: session.commands.length,
  url: session.currentUrl,
  commands: session.commands.slice(Number.isFinite(cursor) ? cursor : 0),
  logs: session.logs,
  agent: {
    name: "CaseForge Companion",
    version: "0.1.3",
  },
});

const startRecorder = async (body) => {
  const scenarioId =
    typeof body?.scenarioId === "string" && body.scenarioId.trim()
      ? body.scenarioId.trim()
      : "";
  const startUrl =
    typeof body?.startUrl === "string" && body.startUrl.trim()
      ? body.startUrl.trim()
      : "https://example.com";

  if (!scenarioId) {
    return { status: 400, payload: { error: "A valid scenario id is required." } };
  }

  await closeRuntime();

  const browser = await launchVisibleBrowser();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const session = {
    id: randomUUID(),
    scenarioId,
    status: "starting",
    startedAt: Date.now(),
    updatedAt: Date.now(),
    startUrl,
    currentUrl: startUrl,
    commands: [],
    logs: [
      "CaseForge Companion connected.",
      "Use the browser normally. Click, type, select, navigate, and add checkpoints when needed.",
    ],
  };

  state.browser = browser;
  state.context = context;
  state.page = page;
  state.session = session;

  await attachRecorder(page, session);
  await page.goto(startUrl, {
    waitUntil: "domcontentloaded",
    timeout: 20000,
  });

  session.status = "recording";
  session.updatedAt = Date.now();
  session.logs = [`Browser opened at ${startUrl}.`, ...session.logs];

  browser.on("disconnected", () => {
    session.status = "stopped";
    session.updatedAt = Date.now();
    session.logs = ["Browser closed.", ...session.logs];
  });

  return {
    status: 200,
    payload: {
      started: true,
      ...getRecorderSnapshot(session, 0),
    },
  };
};

const server = createServer(async (req, res) => {
  const origin = req.headers.origin || "*";

  if (req.method === "OPTIONS") {
    res.writeHead(204, jsonHeaders(origin));
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);

  try {
    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(
        res,
        200,
        {
          ok: true,
          name: "CaseForge Companion",
          version: "0.1.3",
          activeSessionId: state.session?.id ?? null,
          status: state.session?.status ?? "idle",
        },
        origin
      );
      return;
    }

    if (req.method === "GET" && url.pathname === "/automation/browser") {
      const sessionId = url.searchParams.get("sessionId") || "";
      const cursor = Number(url.searchParams.get("cursor") || "0");
      if (!state.session || state.session.id !== sessionId) {
        sendJson(
          res,
          404,
          { error: "Browser session is not active." },
          origin
        );
        return;
      }
      sendJson(res, 200, getRecorderSnapshot(state.session, cursor), origin);
      return;
    }

    if (req.method === "POST" && url.pathname === "/automation/browser") {
      const body = await readBody(req);
      const action = body?.action === "stop" ? "stop" : "start";

      if (action === "stop") {
        const session = state.session;
        await closeRuntime();
        sendJson(
          res,
          200,
          {
            stopped: true,
            sessionId: session?.id,
            status: "stopped",
            cursor: session?.commands.length ?? 0,
            commands: session?.commands ?? [],
            logs: session?.logs ?? ["Recording stopped."],
          },
          origin
        );
        return;
      }

      const result = await startRecorder(body);
      sendJson(res, result.status, result.payload, origin);
      return;
    }

    sendJson(res, 404, { error: "Unknown CaseForge agent route." }, origin);
  } catch (error) {
    const message = isBrowserInstallError(error)
      ? browserInstallMessage
      : error instanceof Error && error.message.trim()
        ? error.message
        : "CaseForge Companion could not complete the request.";
    if (state.session) {
      state.session.status = "failed";
      state.session.logs = [message, ...state.session.logs];
      state.session.updatedAt = Date.now();
    }
    sendJson(res, 500, { error: message }, origin);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`CaseForge Companion ready at http://${HOST}:${PORT}`);
  console.log("Keep this window open while recording or replaying scenarios.");
});

const shutdown = async () => {
  await closeRuntime();
  server.close(() => process.exit(0));
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
