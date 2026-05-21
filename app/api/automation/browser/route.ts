import { randomUUID } from "node:crypto";
import type { Browser, BrowserContext, Page } from "playwright";
import type {
  AutomationV2Command,
  AutomationV2CommandType,
  AutomationV2Locator,
} from "../../../../utils/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RecorderPayload = {
  type?: string;
  selector?: string;
  value?: string;
  key?: string;
  label?: string;
  role?: string;
  tagName?: string;
  text?: string;
  url?: string;
  timestamp?: number;
};

type BrowserRecorderSession = {
  id: string;
  scenarioId: string;
  status: "starting" | "recording" | "stopping" | "stopped" | "failed";
  startedAt: number;
  updatedAt: number;
  startUrl?: string;
  currentUrl?: string;
  commands: AutomationV2Command[];
  logs: string[];
  lastEventKey?: string;
  lastEventAt?: number;
};

type BrowserRecorderRuntime = {
  browser?: Browser;
  context?: BrowserContext;
  page?: Page;
  session?: BrowserRecorderSession;
};

const globalForRecorder = globalThis as unknown as {
  caseforgeAutomationBrowserRecorder?: BrowserRecorderRuntime;
};

const getRuntime = () => {
  globalForRecorder.caseforgeAutomationBrowserRecorder ??= {};
  return globalForRecorder.caseforgeAutomationBrowserRecorder;
};

const isHostedRuntime = () =>
  Boolean(process.env.VERCEL || process.env.NEXT_RUNTIME === "edge");

const isBrowserInstallError = (error: unknown) =>
  error instanceof Error &&
  /executable doesn't exist|please run the following command|playwright install/i.test(
    error.message
  );

const browserInstallMessage =
  "CaseForge could not find a browser to open. Install Google Chrome or Microsoft Edge, then try recording again.";

const launchVisibleBrowser = async (): Promise<Browser> => {
  const { chromium } = await import("playwright");

  try {
    return await chromium.launch({ headless: false });
  } catch (error) {
    if (!isBrowserInstallError(error)) {
      throw error;
    }
  }

  for (const channel of ["chrome", "msedge"] as const) {
    try {
      return await chromium.launch({ channel, headless: false });
    } catch {
      // Try the next installed browser.
    }
  }

  throw new Error(browserInstallMessage);
};

const normalizeCommandType = (value: string | undefined): AutomationV2CommandType => {
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

const commandName: Record<AutomationV2CommandType, string> = {
  navigate: "Navigate",
  click: "Click",
  fill: "Fill",
  select: "Select",
  hover: "Hover",
  press: "Key Press",
  "assert-text": "Assert Text",
  "assert-image": "Assert Image",
  "assert-a11y": "Accessibility Scan",
  "assert-label": "Label / Name Assert",
  "assert-focus": "Keyboard Focus Assert",
  "run-action": "Run Action",
};

const inferLocator = (
  type: AutomationV2CommandType,
  payload: RecorderPayload
): AutomationV2Locator | undefined => {
  if (type === "navigate") {
    return undefined;
  }

  if (type === "assert-a11y") {
    return {
      strategy: "a11y",
      value: "page",
    };
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
    value: payload.selector || "[data-testid=\"target\"]",
    cssPath: payload.selector,
    label: payload.label,
    role: payload.role,
    tagName: payload.tagName,
    text: payload.text,
  };
};

const pushCommand = (
  session: BrowserRecorderSession,
  payload: RecorderPayload
) => {
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

  const command: AutomationV2Command = {
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
    },
  };

  session.commands.push(command);
  session.currentUrl = payload.url || session.currentUrl;
  session.updatedAt = now;
};

const recorderInitScript = () => {
  const win = window as typeof window & {
    __caseforgeRecorderInstalled?: boolean;
    __caseforgeRecord?: (payload: unknown) => void;
  };

  if (win.__caseforgeRecorderInstalled) {
    return;
  }

  win.__caseforgeRecorderInstalled = true;

  const cssEscape = (value: string) => {
    if (win.CSS?.escape) {
      return win.CSS.escape(value);
    }
    return value.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~ ])/g, "\\$1");
  };

  const textOf = (element: Element | null) =>
    (element?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120);

  const recorderUiRoot = document.createElement("div");
  recorderUiRoot.setAttribute("data-caseforge-recorder-ui", "true");
  recorderUiRoot.innerHTML = `
    <style>
      [data-caseforge-recorder-ui] {
        all: initial;
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      [data-caseforge-recorder-badge] {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        gap: 8px;
        border-radius: 999px;
        background: rgba(10, 15, 28, 0.94);
        color: #ffffff;
        box-shadow: 0 16px 40px rgba(15, 23, 42, 0.24);
        padding: 10px 14px;
        font: 700 13px/1.2 Inter, ui-sans-serif, system-ui, sans-serif;
        pointer-events: none;
      }
      [data-caseforge-recorder-badge]::before {
        content: "";
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: #22c55e;
        box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.65);
        animation: caseforge-recorder-pulse 1.3s infinite;
      }
      [data-caseforge-hover-box] {
        position: fixed;
        z-index: 2147483646;
        border: 2px solid #10b981;
        border-radius: 8px;
        box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.18);
        pointer-events: none;
        display: none;
        transition: transform 80ms ease, width 80ms ease, height 80ms ease;
      }
      [data-caseforge-hover-label] {
        position: absolute;
        left: -2px;
        top: -30px;
        max-width: 260px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        border-radius: 8px;
        background: #047857;
        color: #ffffff;
        padding: 5px 8px;
        font: 700 12px/1.2 Inter, ui-sans-serif, system-ui, sans-serif;
      }
      [data-caseforge-capture-toast] {
        position: fixed;
        right: 18px;
        bottom: 68px;
        z-index: 2147483647;
        border-radius: 12px;
        background: #ecfdf5;
        color: #065f46;
        border: 1px solid #a7f3d0;
        box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18);
        padding: 9px 12px;
        font: 800 12px/1.2 Inter, ui-sans-serif, system-ui, sans-serif;
        pointer-events: none;
        opacity: 0;
        transform: translateY(8px);
        transition: opacity 150ms ease, transform 150ms ease;
      }
      [data-caseforge-capture-toast].is-visible {
        opacity: 1;
        transform: translateY(0);
      }
      @keyframes caseforge-recorder-pulse {
        70% { box-shadow: 0 0 0 8px rgba(34, 197, 94, 0); }
        100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
      }
    </style>
    <div data-caseforge-hover-box><div data-caseforge-hover-label></div></div>
    <div data-caseforge-capture-toast>Captured step</div>
    <div data-caseforge-recorder-badge>CaseForge recording</div>
  `;
  document.documentElement.appendChild(recorderUiRoot);

  const hoverBox = recorderUiRoot.querySelector<HTMLElement>(
    "[data-caseforge-hover-box]"
  );
  const hoverLabel = recorderUiRoot.querySelector<HTMLElement>(
    "[data-caseforge-hover-label]"
  );
  const captureToast = recorderUiRoot.querySelector<HTMLElement>(
    "[data-caseforge-capture-toast]"
  );
  let captureToastTimer = 0;

  const stepLabel: Record<string, string> = {
    click: "Captured click",
    fill: "Captured fill",
    select: "Captured select",
    hover: "Captured hover",
    press: "Captured key",
    "assert-text": "Captured text check",
    "assert-image": "Captured image check",
    "assert-a11y": "Captured accessibility scan",
    "assert-label": "Captured label check",
    "assert-focus": "Captured focus check",
    navigate: "Captured navigation",
  };

  const showCaptured = (type: unknown) => {
    if (!captureToast) {
      return;
    }
    captureToast.textContent =
      typeof type === "string" ? stepLabel[type] || "Captured step" : "Captured step";
    captureToast.classList.add("is-visible");
    win.clearTimeout(captureToastTimer);
    captureToastTimer = win.setTimeout(() => {
      captureToast.classList.remove("is-visible");
    }, 900);
  };

  const updateHover = (element: Element) => {
    if (!hoverBox || !hoverLabel || recorderUiRoot.contains(element)) {
      return;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) {
      hoverBox.style.display = "none";
      return;
    }
    hoverBox.style.display = "block";
    hoverBox.style.left = `${Math.max(0, rect.left)}px`;
    hoverBox.style.top = `${Math.max(0, rect.top)}px`;
    hoverBox.style.width = `${rect.width}px`;
    hoverBox.style.height = `${rect.height}px`;
    hoverLabel.textContent = readLabel(element) || element.tagName.toLowerCase();
  };

  const readLabel = (element: Element | null) => {
    if (!element) {
      return "";
    }

    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel?.trim()) {
      return ariaLabel.trim();
    }

    const id = element.getAttribute("id");
    if (id) {
      const label = document.querySelector(`label[for="${cssEscape(id)}"]`);
      const labelText = textOf(label);
      if (labelText) {
        return labelText;
      }
    }

    const wrappingLabel = element.closest("label");
    const wrappingText = textOf(wrappingLabel);
    if (wrappingText) {
      return wrappingText;
    }

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

  const roleOf = (element: Element | null) => {
    if (!element) {
      return "";
    }
    const explicitRole = element.getAttribute("role");
    if (explicitRole) {
      return explicitRole;
    }
    const tagName = element.tagName.toLowerCase();
    if (tagName === "button") return "button";
    if (tagName === "a") return "link";
    if (tagName === "select") return "combobox";
    if (tagName === "textarea") return "textbox";
    if (tagName === "input") {
      const type = (element as HTMLInputElement).type;
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      return "textbox";
    }
    return "";
  };

  const buildSelector = (element: Element | null): string => {
    if (!element) {
      return "body";
    }

    const testId =
      element.getAttribute("data-testid") ||
      element.getAttribute("data-test") ||
      element.getAttribute("data-cy");
    if (testId) {
      return `[data-testid="${testId.replace(/"/g, '\\"')}"]`;
    }

    const id = element.getAttribute("id");
    if (id) {
      return `#${cssEscape(id)}`;
    }

    const name = element.getAttribute("name");
    if (name) {
      return `${element.tagName.toLowerCase()}[name="${name.replace(/"/g, '\\"')}"]`;
    }

    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel) {
      return `${element.tagName.toLowerCase()}[aria-label="${ariaLabel.replace(/"/g, '\\"')}"]`;
    }

    const path: string[] = [];
    let current: Element | null = element;
    while (current && current !== document.body && path.length < 5) {
      const tagName = current.tagName.toLowerCase();
      const parent: Element | null = current.parentElement;
      if (!parent) {
        path.unshift(tagName);
        break;
      }
      const currentTagName = current.tagName;
      const siblings = Array.from(parent.children).filter(
        (child: Element) => child.tagName === currentTagName
      );
      const index = siblings.indexOf(current) + 1;
      path.unshift(siblings.length > 1 ? `${tagName}:nth-of-type(${index})` : tagName);
      current = parent;
    }

    return path.length ? path.join(" > ") : element.tagName.toLowerCase();
  };

  const invoke = (payload: Record<string, unknown>) => {
    try {
      showCaptured(payload.type);
      win.__caseforgeRecord?.({
        ...payload,
        url: location.href,
        timestamp: Date.now(),
      });
    } catch {
      // The recorder should never break the target application.
    }
  };

  let lastPointerTarget: Element | null = null;
  document.addEventListener(
    "pointermove",
    (event) => {
      lastPointerTarget =
        event.target instanceof Element ? event.target : lastPointerTarget;
      if (lastPointerTarget) {
        updateHover(lastPointerTarget);
      }
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
        const shortcutMap: Record<string, string> = {
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

const attachRecorder = async (page: Page, session: BrowserRecorderSession) => {
  await page.exposeBinding("__caseforgeRecord", (_source, payload) => {
    pushCommand(session, payload as RecorderPayload);
  });
  await page.addInitScript(recorderInitScript);
  await page.evaluate(recorderInitScript).catch(() => undefined);

  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) {
      return;
    }
    const url = frame.url();
    if (!url || url.startsWith("about:blank")) {
      return;
    }
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
  const runtime = getRuntime();
  const session = runtime.session;
  if (session && session.status !== "failed") {
    session.status = "stopped";
    session.updatedAt = Date.now();
    session.logs = ["Recording stopped.", ...session.logs];
  }

  await runtime.browser?.close().catch(() => undefined);
  runtime.browser = undefined;
  runtime.context = undefined;
  runtime.page = undefined;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId") ?? "";
  const cursor = Number(searchParams.get("cursor") ?? "0");
  const session = getRuntime().session;

  if (!session || session.id !== sessionId) {
    return Response.json(
      { error: "Browser session is not active." },
      { status: 404 }
    );
  }

  return Response.json({
    sessionId: session.id,
    status: session.status,
    cursor: session.commands.length,
    url: session.currentUrl,
    commands: session.commands.slice(Number.isFinite(cursor) ? cursor : 0),
    logs: session.logs,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = body?.action === "stop" ? "stop" : "start";

    if (action === "stop") {
      const session = getRuntime().session;
      await closeRuntime();
      return Response.json({
        stopped: true,
        sessionId: session?.id,
        status: "stopped",
        cursor: session?.commands.length ?? 0,
        commands: session?.commands ?? [],
        logs: session?.logs ?? ["Recording stopped."],
      });
    }

    if (isHostedRuntime()) {
      return Response.json(
        {
          error:
            "Visible recording needs the CaseForge desktop companion on this computer. Open the companion, then try again.",
        },
        { status: 400 }
      );
    }

    const scenarioId =
      typeof body?.scenarioId === "string" && body.scenarioId.trim()
        ? body.scenarioId.trim()
        : "";
    const startUrl =
      typeof body?.startUrl === "string" && body.startUrl.trim()
        ? body.startUrl.trim()
        : "https://example.com";

    if (!scenarioId) {
      return Response.json(
        { error: "A valid scenario id is required." },
        { status: 400 }
      );
    }

    await closeRuntime();

    const browser = await launchVisibleBrowser();
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    const session: BrowserRecorderSession = {
      id: randomUUID(),
      scenarioId,
      status: "starting",
      startedAt: Date.now(),
      updatedAt: Date.now(),
      startUrl,
      currentUrl: startUrl,
      commands: [],
      logs: [
        "Opening browser session.",
        "Use the browser normally. Click, type, select, navigate, and add checkpoints when needed.",
      ],
    };

    const runtime = getRuntime();
    runtime.browser = browser;
    runtime.context = context;
    runtime.page = page;
    runtime.session = session;

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

    return Response.json({
      started: true,
      sessionId: session.id,
      status: session.status,
      cursor: 0,
      commands: [],
      logs: session.logs,
      url: session.currentUrl,
    });
  } catch (error) {
    const message = isBrowserInstallError(error)
      ? browserInstallMessage
      : error instanceof Error && error.message.trim()
        ? error.message
        : "Could not open the browser session.";
    const session = getRuntime().session;
    if (session) {
      session.status = "failed";
      session.logs = [message, ...session.logs];
      session.updatedAt = Date.now();
    }
    return Response.json({ error: message }, { status: 500 });
  }
}
