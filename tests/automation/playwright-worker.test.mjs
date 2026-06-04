import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createPlaywrightWorkerServer,
  recorderScript,
} from "../../workers/playwright-worker/server.mjs";

function createFakeBrowserLauncher(options = {}) {
  const state = {
    clicks: [],
    clickPages: [],
    fills: [],
    inputValues: new Map(),
    typed: [],
    revealed: false,
    page: null,
    pages: [],
    gotos: [],
    waits: [],
  };
  function makeLocator(selectedIndex = null, key = "base", page = null) {
    const locatorOptions = options.elementByKey?.[key] ?? options.element ?? {};
    const attrs = {
      ...(locatorOptions.attributes ?? {}),
      ...(locatorOptions.dataAttributes ?? {}),
    };
    if (locatorOptions.id) attrs.id = locatorOptions.id;
    if (locatorOptions.role) attrs.role = locatorOptions.role;
    if (locatorOptions.ariaLabel) attrs["aria-label"] = locatorOptions.ariaLabel;
    if (locatorOptions.title) attrs.title = locatorOptions.title;
    if (locatorOptions.alt) attrs.alt = locatorOptions.alt;
    if (locatorOptions.name) attrs.name = locatorOptions.name;
    if (locatorOptions.placeholder) attrs.placeholder = locatorOptions.placeholder;
    if (locatorOptions.href) attrs.href = locatorOptions.href;
    if (locatorOptions.src) attrs.src = locatorOptions.src;
    return {
    check: async () => undefined,
    clear: async () => undefined,
    click: async () => {
      if (options.failClickKeys?.includes(key)) {
        throw new Error(`click failed for ${key}`);
      }
      if (options.revealOnClickKeys?.includes(key)) {
        state.revealed = true;
      }
      state.clicks.push(selectedIndex ?? key);
      state.clickPages.push(page?.currentUrl || "");
    },
    count: async () => options.countByKey?.[key] ?? options.matchCount ?? 1,
    dblclick: async () => undefined,
    fill: async (value) => {
      state.fills.push({ key, value });
      if (!options.noopFillKeys?.includes(key)) {
        state.inputValues.set(key, String(value ?? ""));
      }
    },
    first() {
      return this;
    },
    elementHandles: async () => [],
    evaluate: async (callback, arg) => {
      const element = {
        attributes: Object.entries(attrs).map(([name, value]) => ({ name, value })),
        complete: options.imageLoaded ?? true,
        currentSrc: "https://example.com/image.png",
        getAttribute: (name) => attrs[name] ?? "",
        getBoundingClientRect: () => ({
          height: locatorOptions.bounds?.height ?? 32,
          left: locatorOptions.bounds?.x ?? 10,
          top: locatorOptions.bounds?.y ?? 10,
          width: locatorOptions.bounds?.width ?? 96,
        }),
        innerText: locatorOptions.text ?? "Checkout complete",
        naturalHeight: options.imageLoaded === false ? 0 : 240,
        naturalWidth: options.imageLoaded === false ? 0 : 320,
        src: "https://example.com/image.png",
        tagName: locatorOptions.tagName || options.tagName || "BUTTON",
        textContent: locatorOptions.text ?? "Checkout complete",
        value: state.inputValues.get(key) ?? locatorOptions.value ?? "",
      };
      globalThis.window = {
        getComputedStyle: () => ({
          getPropertyValue: (property) =>
            options.css?.[property] ??
            (property === "color"
              ? "rgb(255, 255, 255)"
              : property === "background-color"
                ? "rgb(0, 128, 0)"
                : ""),
        }),
      };
      try {
        return callback(element, arg);
      } finally {
        delete globalThis.window;
      }
    },
    hover: async () => undefined,
    innerText: async () => "Checkout complete",
    nth(index) {
      return makeLocator(index, key, page);
    },
    press: async () => undefined,
    pressSequentially: async (value) => {
      state.typed.push({ key, value });
      state.inputValues.set(key, String(value ?? ""));
    },
    scrollIntoViewIfNeeded: async () => undefined,
    selectOption: async () => undefined,
    uncheck: async () => undefined,
    waitFor: async () => {
      if (options.hiddenUntilRevealedKeys?.includes(key) && !state.revealed) {
        const error = new Error(`Timeout 8000ms exceeded waiting for ${key} to be visible`);
        error.name = "TimeoutError";
        throw error;
      }
      if (options.neverVisibleKeys?.includes(key)) {
        const error = new Error(`Timeout 8000ms exceeded waiting for ${key} to be visible`);
        error.name = "TimeoutError";
        throw error;
      }
    },
  };
  }

  return {
    state,
    async launch() {
      const contextHandlers = new Map();
      function makePage() {
        const handlers = new Map();
        const page = {
        addInitScript: async () => undefined,
        bindings: new Map(),
        currentUrl: "about:blank",
        evaluate: async (callback, arg) => {
          if (!options.domScanElements) return undefined;
          const previousDocument = globalThis.document;
          const previousWindow = globalThis.window;
          const previousCss = globalThis.CSS;
          const elements = options.domScanElements.map((item, index) => {
            const attrs = {
              ...(item.attributes ?? {}),
              ...(item.dataAttributes ?? {}),
            };
            if (item.id) attrs.id = item.id;
            if (item.role) attrs.role = item.role;
            if (item.ariaLabel) attrs["aria-label"] = item.ariaLabel;
            if (item.title) attrs.title = item.title;
            if (item.alt) attrs.alt = item.alt;
            return {
              attributes: Object.entries(attrs).map(([name, value]) => ({ name, value })),
              getAttribute: (name) => attrs[name] ?? "",
              getBoundingClientRect: () => ({
                height: item.bounds?.height ?? 36,
                left: item.bounds?.x ?? 10 + index * 120,
                top: item.bounds?.y ?? 10,
                width: item.bounds?.width ?? 120,
              }),
              id: item.id || "",
              parentElement: {
                innerText: item.parentText || item.text || "",
                textContent: item.parentText || item.text || "",
              },
              scrollIntoView: () => undefined,
              tagName: item.tagName || "BUTTON",
              textContent: item.text || "",
              value: item.value || "",
              click: () => {
                state.clicks.push(item.key || item.id || item.text || `dom-${index}`);
                state.clickPages.push(page.currentUrl || "");
              },
            };
          });
          globalThis.document = {
            querySelectorAll: (selector) => {
              const text = String(selector || "");
              if (text.includes(",")) return elements;
              if (text.startsWith("#")) return elements.filter((element) => element.id === text.slice(1));
              if (text.includes("[data-testid]")) {
                return elements.filter((element) =>
                  element.getAttribute("data-testid") ||
                  element.getAttribute("data-test") ||
                  element.getAttribute("data-qa") ||
                  element.getAttribute("data-cy"),
                );
              }
              return [];
            },
          };
          globalThis.window = {
            getComputedStyle: () => ({
              display: "block",
              visibility: "visible",
            }),
          };
          globalThis.CSS = { escape: (value) => String(value).replace(/"/g, '\\"') };
          try {
            return callback(arg);
          } finally {
            if (previousDocument === undefined) delete globalThis.document;
            else globalThis.document = previousDocument;
            if (previousWindow === undefined) delete globalThis.window;
            else globalThis.window = previousWindow;
            if (previousCss === undefined) delete globalThis.CSS;
            else globalThis.CSS = previousCss;
          }
        },
        exposeBinding: async (name, handler) => {
          page.bindings.set(name, handler);
        },
        bringToFront: async () => {
          state.page = page;
        },
        getByAltText: (value) => makeLocator(null, `alt:${value}`, page),
        getByLabel: (value) => makeLocator(null, `label:${value}`, page),
        getByPlaceholder: (value) => makeLocator(null, `placeholder:${value}`, page),
        getByRole: (role, query) => makeLocator(null, `role:${role}:${query?.name ?? ""}`, page),
        getByTestId: (value) => makeLocator(null, `testid:${value}`, page),
        getByText: (value) => makeLocator(null, `text:${value}`, page),
        getByTitle: (value) => makeLocator(null, `title:${value}`, page),
        goto: async (url) => {
          state.gotos.push(url);
          if (options.failGotoOnceFor?.includes(url)) {
            options.failGotoOnceFor = options.failGotoOnceFor.filter((item) => item !== url);
            throw new Error(`page.goto: net::ERR_CONNECTION_REFUSED at ${url}`);
          }
          page.currentUrl = url;
          for (const handler of handlers.get("framenavigated") ?? []) handler(page);
        },
        dialog: async (message = "Required field", type = "alert") => {
          const dialog = {
            accept: async () => undefined,
            message: () => message,
            type: () => type,
          };
          for (const handler of handlers.get("dialog") ?? []) handler(dialog);
          return dialog;
        },
        locator: (value) =>
          makeLocator(null, String(value || "").startsWith("xpath=") ? `xpath:${String(value).slice(6)}` : `css:${value}`, page),
        mainFrame: () => page,
        mouse: {
          click: async () => undefined,
          wheel: async () => undefined,
        },
        newPage: async () => page,
        on: (eventName, handler) => {
          handlers.set(eventName, [...(handlers.get(eventName) ?? []), handler]);
        },
        popup: async (url = "about:blank") => {
          const popupPage = makePage();
          popupPage.currentUrl = url;
          for (const handler of handlers.get("popup") ?? []) handler(popupPage);
          for (const handler of contextHandlers.get("page") ?? []) handler(popupPage);
          return popupPage;
        },
        reload: async () => undefined,
        screenshot: async () => Buffer.from("fake screenshot"),
        url: () => page.currentUrl,
        waitForTimeout: async (duration) => {
          state.waits.push(Number(duration || 0));
        },
        };
        state.pages.push(page);
        state.page = page;
        return page;
      }

      return {
        close: async () => undefined,
        newContext: async () => ({
          close: async () => undefined,
          newPage: async () => makePage(),
          on: (eventName, handler) => {
            contextHandlers.set(eventName, [...(contextHandlers.get(eventName) ?? []), handler]);
          },
          pages: () => state.pages,
        }),
      };
    },
  };
}

async function withWorker(run, browserLauncher = createFakeBrowserLauncher()) {
  const worker = createPlaywrightWorkerServer({
    baseUrl: "https://worker.example",
    browserLauncher,
    host: "127.0.0.1",
    port: 0,
  });
  const server = await worker.listen(0, "127.0.0.1");
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl, browserLauncher);
  } finally {
    await worker.close();
  }
}

test("recorder injection script emits debug events and uses lightweight hover artifacts", () => {
  const script = recorderScript();
  assert.match(script, /recorder\.injected/);
  assert.match(script, /recorder\.hover_detected/);
  assert.match(script, /sessionStorage\?\.setItem\("__caseforgeRecorderMode", recorderMode\)/);
  assert.match(script, /"mousemove"/);
  assert.match(script, /"mouseover"/);
  assert.match(script, /data-caseforge-recorder-hover/);
  assert.match(script, /pointerEvents = "none"/);
  assert.match(script, /__caseforgeRecorderCleanup/);
  assert.match(script, /function scheduleFill\(element, value\)/);
  assert.match(script, /function scheduleSelect\(element, value\)/);
  assert.match(script, /function isDropdownElement\(element\)/);
  assert.match(script, /\["combobox", "listbox"\]\.includes\(role\)/);
  assert.match(script, /if \(isDropdownElement\(event\.target\)\) \{/);
  assert.match(script, /emitSelect\(event\.target, optionValue\(event\.target\)\)/);
  assert.match(script, /const pendingFillTimers = new Map\(\)/);
  assert.match(script, /const pendingSelectTimers = new Map\(\)/);
  assert.match(script, /function flushAllPendingFills\(\)/);
  assert.match(script, /function flushAllPendingSelects\(\)/);
  assert.match(script, /lastEmittedFill/);
  assert.match(script, /lastEmittedSelect/);
  assert.match(script, /}, 550\)/);
  assert.match(script, /}, 250\)/);
  assert.match(script, /if \(isFormValueElement\(event\.target\)\) return;/);
  assert.match(script, /isDropdownElement\(event\.target\) && \(event\.key === "Tab" \|\| event\.key === "Enter"\)/);
  assert.match(script, /isTextEntryElement\(event\.target\) && \(event\.key === "Tab" \|\| event\.key === "Enter"\)/);
  assert.match(script, /flushPendingFill\(event\.target\)/);
  assert.match(script, /flushPendingSelect\(event\.target\)/);
  assert.match(script, /"blur"/);
  assert.match(script, /"visibilitychange"/);
  assert.match(script, /"pagehide"/);
  assert.match(script, /"invalid"/);
  assert.match(script, /validationMessage/);
  assert.match(script, /function emitValidationMessage\(element, message, source = "native_validation"\)/);
  assert.match(script, /window\.__caseforgeRecorderCleanup = \(\) => \{\s*flushAllPendingSelects\(\);\s*flushAllPendingFills\(\);/);
  assert.match(script, /recentlyEmittedFill\(event\.target, event\.target\?\.value \|\| ""\)/);
  assert.doesNotMatch(script, /0 0 0 9999px rgba\(14, 165, 233/);
});

test("recorder ignores checkbox value changes as fill commands", () => {
  const script = recorderScript();
  assert.match(
    script,
    /listen\(document, "input"[\s\S]*if \(!isTextEntryElement\(event\.target\)\) return;[\s\S]*scheduleFill/,
  );
  assert.match(
    script,
    /listen\(document, "change"[\s\S]*if \(!isTextEntryElement\(event\.target\)\) return;[\s\S]*emitFill/,
  );
  assert.match(
    script,
    /return !\["button", "checkbox", "color", "file", "hidden", "image", "radio"/,
  );
});

test("worker substitutes parameterData before executing run steps", () => {
  const source = readFileSync(new URL("../../workers/playwright-worker/server.mjs", import.meta.url), "utf8");
  assert.match(source, /function normalizeParameterData\(value\)/);
  assert.match(source, /function substituteTemplateValue\(value, parameterData\)/);
  assert.match(source, /payload\.steps\.map\(\(step\) => substituteStepParameters\(step, parameterData\)\)/);
});

test("worker falls back to typing when fill focuses the field but value does not stick", async () => {
  const launcher = createFakeBrowserLauncher({
    elementByKey: {
      "css:#email": {
        id: "email",
        placeholder: "you@example.com",
        tagName: "INPUT",
        text: "",
        value: "",
      },
    },
    noopFillKeys: ["css:#email"],
  });
  await withWorker(async (baseUrl, browserLauncher) => {
    const session = await fetch(`${baseUrl}/sessions`, {
      body: JSON.stringify({ projectId: "project-1" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());

    await fetch(`${baseUrl}/sessions/${session.sessionId}/run`, {
      body: JSON.stringify({
        parameterData: { email: "test@test.com" },
        runId: "run-fill-typing-fallback",
        steps: [
          {
            action: "fill",
            description: "Fill Email Address",
            id: "step-email-fill",
            inputValue: "{{email}}",
            options: { parameterName: "email" },
            target: {
              displayName: "Email Address",
              locatorType: "css",
              type: "smart",
              value: "#email",
            },
          },
        ],
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());

    await new Promise((resolve) => setTimeout(resolve, 20));

    const events = await fetch(`${baseUrl}/sessions/${session.sessionId}/events`).then((response) =>
      response.json(),
    );
    assert.ok(events.events.some((event) => event.type === "run:success"));
    assert.deepEqual(browserLauncher.state.fills.at(-1), { key: "css:#email", value: "test@test.com" });
    assert.deepEqual(browserLauncher.state.typed.at(-1), { key: "css:#email", value: "test@test.com" });
    assert.equal(browserLauncher.state.inputValues.get("css:#email"), "test@test.com");

    await fetch(`${baseUrl}/sessions/${session.sessionId}`, { method: "DELETE" });
  }, launcher);
});

test("self-hosted Playwright worker exposes session lifecycle endpoints", async () => {
  await withWorker(async (baseUrl) => {
    const health = await fetch(`${baseUrl}/health`).then((response) =>
      response.json(),
    );
    assert.equal(health.ok, true);

    const session = await fetch(`${baseUrl}/sessions`, {
      body: JSON.stringify({
        projectId: "project-1",
        targetUrl: "https://example.com",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());

    assert.equal(session.status, "idle");
    assert.match(session.sessionId, /^session_/);
    assert.equal(session.metadata.recorderMode, "off");
    assert.equal(
      session.liveViewUrl,
      `https://worker.example/sessions/${session.sessionId}/live`,
    );
    assert.equal(
      session.eventStreamUrl,
      `https://worker.example/sessions/${session.sessionId}/events`,
    );

    const loaded = await fetch(`${baseUrl}/sessions/${session.sessionId}`).then(
      (response) => response.json(),
    );
    assert.equal(loaded.sessionId, session.sessionId);

    const live = await fetch(`${baseUrl}/sessions/${session.sessionId}/live`);
    assert.equal(live.status, 200);
    assert.match(await live.text(), /Live view placeholder/);

    const run = await fetch(`${baseUrl}/sessions/${session.sessionId}/run`, {
      body: JSON.stringify({
        runId: "run-phase-1",
        suppressRecording: true,
        steps: [
          {
            action: "navigate",
            description: "Open checkout",
            id: "step-1",
            target: { type: "manual", value: "https://example.com/checkout" },
          },
        ],
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());
    assert.equal(run.status, "running");
    assert.equal(run.sessionId, session.sessionId);
    assert.equal(run.runId, "run-phase-1");

    await new Promise((resolve) => setTimeout(resolve, 10));

    const events = await fetch(
      `${baseUrl}/sessions/${session.sessionId}/events`,
    ).then((response) => response.json());
    assert.equal(events.sessionId, session.sessionId);
    assert.ok(events.events.some((event) => event.type === "session:ready"));
    assert.ok(events.events.some((event) => event.type === "run:success"));
    assert.ok(
      events.events.some(
        (event) => event.type === "step:start" && event.data?.runId === "run-phase-1",
      ),
    );
    assert.equal(
      events.events.filter((event) => event.type === "record:command").length,
      0,
    );

    const deleted = await fetch(`${baseUrl}/sessions/${session.sessionId}`, {
      method: "DELETE",
    }).then((response) => response.json());
    assert.equal(deleted.status, "terminated");
  });
});

test("self-hosted Playwright worker prefers localhost for 127 loopback targets", async () => {
  const launcher = createFakeBrowserLauncher();
  await withWorker(async (baseUrl, browserLauncher) => {
    const session = await fetch(`${baseUrl}/sessions`, {
      body: JSON.stringify({
        projectId: "project-1",
        targetUrl: "http://127.0.0.1:5173/",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());

    assert.equal(session.status, "idle");
    assert.equal(browserLauncher.state.gotos[0], "http://localhost:5173/");

    await fetch(`${baseUrl}/sessions/${session.sessionId}`, { method: "DELETE" });
  }, launcher);
});

test("self-hosted Playwright worker retries 127 when localhost loopback is refused", async () => {
  const launcher = createFakeBrowserLauncher({
    failGotoOnceFor: ["http://localhost:5173/"],
  });
  await withWorker(async (baseUrl, browserLauncher) => {
    const session = await fetch(`${baseUrl}/sessions`, {
      body: JSON.stringify({
        projectId: "project-1",
        targetUrl: "http://localhost:5173/",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());

    assert.equal(session.status, "idle");
    assert.deepEqual(browserLauncher.state.gotos.slice(0, 2), [
      "http://localhost:5173/",
      "http://127.0.0.1:5173/",
    ]);

    await fetch(`${baseUrl}/sessions/${session.sessionId}`, { method: "DELETE" });
  }, launcher);
});

test("self-hosted Playwright worker keeps interactive sessions open across action runs", async () => {
  await withWorker(async (baseUrl) => {
    const session = await fetch(`${baseUrl}/sessions`, {
      body: JSON.stringify({
        executionMode: "interactive_persistent",
        projectId: "project-1",
        targetUrl: "https://example.com",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());

    const first = await fetch(`${baseUrl}/sessions/${session.sessionId}/run`, {
      body: JSON.stringify({
        actionId: "action-1",
        keepSessionOpen: true,
        runId: "run-action-1",
        steps: [
          {
            action: "navigate",
            description: "Open action one",
            id: "step-a1",
            target: { type: "manual", value: "https://example.com/action-one" },
          },
        ],
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());
    assert.equal(first.status, "running");

    await new Promise((resolve) => setTimeout(resolve, 10));

    const afterFirst = await fetch(`${baseUrl}/sessions/${session.sessionId}`).then(
      (response) => response.json(),
    );
    assert.equal(afterFirst.status, "completed");
    assert.equal(afterFirst.currentUrl, "https://example.com/action-one");

    const second = await fetch(`${baseUrl}/sessions/${session.sessionId}/run`, {
      body: JSON.stringify({
        actionId: "action-2",
        keepSessionOpen: true,
        runId: "run-action-2",
        steps: [
          {
            action: "navigate",
            description: "Open action two",
            id: "step-a2",
            target: { type: "manual", value: "https://example.com/action-two" },
          },
        ],
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());
    assert.equal(second.sessionId, session.sessionId);

    await new Promise((resolve) => setTimeout(resolve, 10));

    const afterSecond = await fetch(`${baseUrl}/sessions/${session.sessionId}`).then(
      (response) => response.json(),
    );
    assert.equal(afterSecond.status, "completed");
    assert.equal(afterSecond.currentUrl, "https://example.com/action-two");

    await fetch(`${baseUrl}/sessions/${session.sessionId}`, { method: "DELETE" });
  });
});

test("self-hosted Playwright worker waits one second between commands by default", async () => {
  const launcher = createFakeBrowserLauncher();
  await withWorker(async (baseUrl, browserLauncher) => {
    const session = await fetch(`${baseUrl}/sessions`, {
      body: JSON.stringify({ projectId: "project-1" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());

    await fetch(`${baseUrl}/sessions/${session.sessionId}/run`, {
      body: JSON.stringify({
        runId: "run-default-command-delay",
        steps: [
          {
            action: "navigate",
            description: "Open first page",
            id: "step-delay-1",
            inputValue: "https://example.com/first",
            target: { type: "manual", value: "https://example.com/first" },
          },
          {
            action: "navigate",
            description: "Open second page",
            id: "step-delay-2",
            inputValue: "https://example.com/second",
            target: { type: "manual", value: "https://example.com/second" },
          },
        ],
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());

    await new Promise((resolve) => setTimeout(resolve, 20));

    const events = await fetch(`${baseUrl}/sessions/${session.sessionId}/events`).then((response) =>
      response.json(),
    );
    assert.ok(events.events.some((event) => event.type === "run:success"));
    assert.ok(
      events.events.some(
        (event) => event.type === "step:delay" && event.data?.durationMs === 1000,
      ),
    );
    assert.deepEqual(browserLauncher.state.waits, [1000]);

    await fetch(`${baseUrl}/sessions/${session.sessionId}`, { method: "DELETE" });
  }, launcher);
});

test("self-hosted Playwright worker pauses safely on unresolved ambiguous locators", async () => {
  const launcher = createFakeBrowserLauncher({ matchCount: 2 });
  await withWorker(async (baseUrl, browserLauncher) => {
    const session = await fetch(`${baseUrl}/sessions`, {
      body: JSON.stringify({ projectId: "project-1" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());

    await fetch(`${baseUrl}/sessions/${session.sessionId}/run`, {
      body: JSON.stringify({
        runId: "run-ambiguous",
        steps: [
          {
            action: "click",
            description: "Click Save",
            id: "step-ambiguous",
            target: { locatorType: "text", type: "smart", value: "Save" },
          },
        ],
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());

    await new Promise((resolve) => setTimeout(resolve, 10));

    const events = await fetch(`${baseUrl}/sessions/${session.sessionId}/events`).then((response) =>
      response.json(),
    );
    assert.ok(events.events.some((event) => event.type === "step.ambiguity_detected"));
    assert.equal(events.events.some((event) => event.type === "run:failed"), false);
    assert.equal(events.events.some((event) => event.type === "step.heal_attempted"), false);
    assert.equal(events.events.some((event) => event.type === "step.heal_failed"), false);
    assert.deepEqual(browserLauncher.state.clicks, []);

    await fetch(`${baseUrl}/sessions/${session.sessionId}`, { method: "DELETE" });
  }, launcher);
});

test("self-hosted Playwright worker resumes current run after ambiguity choice", async () => {
  const launcher = createFakeBrowserLauncher({ matchCount: 2 });
  await withWorker(async (baseUrl, browserLauncher) => {
    const session = await fetch(`${baseUrl}/sessions`, {
      body: JSON.stringify({ projectId: "project-1" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());

    await fetch(`${baseUrl}/sessions/${session.sessionId}/run`, {
      body: JSON.stringify({
        runId: "run-resume-ambiguity",
        steps: [
          {
            action: "click",
            description: "Click Save",
            id: "step-ambiguous-resume",
            target: { locatorType: "text", type: "smart", value: "Save" },
          },
          {
            action: "navigate",
            description: "Continue after choice",
            id: "step-after-choice",
            target: { type: "manual", value: "https://example.com/after-choice" },
          },
        ],
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());

    await new Promise((resolve) => setTimeout(resolve, 10));
    let events = await fetch(`${baseUrl}/sessions/${session.sessionId}/events`).then((response) =>
      response.json(),
    );
    assert.ok(events.events.some((event) => event.type === "step.ambiguity_detected"));
    assert.deepEqual(browserLauncher.state.clicks, []);

    const resolved = await fetch(`${baseUrl}/sessions/${session.sessionId}/resolve-ambiguity`, {
      body: JSON.stringify({
        runId: "run-resume-ambiguity",
        selectedIndex: 1,
        stepId: "step-ambiguous-resume",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());
    assert.equal(resolved.ok, true);

    await new Promise((resolve) => setTimeout(resolve, 20));
    events = await fetch(`${baseUrl}/sessions/${session.sessionId}/events`).then((response) =>
      response.json(),
    );
    assert.ok(events.events.some((event) => event.type === "step.ambiguity_resolved"));
    assert.ok(events.events.some((event) => event.type === "run:success"));
    assert.deepEqual(browserLauncher.state.clicks, [1]);

    const loaded = await fetch(`${baseUrl}/sessions/${session.sessionId}`).then((response) => response.json());
    assert.equal(loaded.currentUrl, "https://example.com/after-choice");

    await fetch(`${baseUrl}/sessions/${session.sessionId}`, { method: "DELETE" });
  }, launcher);
});

test("self-hosted Playwright worker respects saved ambiguity index", async () => {
  const launcher = createFakeBrowserLauncher({ matchCount: 2 });
  await withWorker(async (baseUrl, browserLauncher) => {
    const session = await fetch(`${baseUrl}/sessions`, {
      body: JSON.stringify({ projectId: "project-1" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());

    await fetch(`${baseUrl}/sessions/${session.sessionId}/run`, {
      body: JSON.stringify({
        runId: "run-indexed",
        steps: [
          {
            action: "click",
            description: "Click second Save",
            id: "step-indexed",
            options: {
              ambiguity: {
                candidate: { strategy: "text", value: "Save" },
                matchCount: 2,
                resolutionMethod: "index",
                selectedIndex: 1,
              },
            },
            target: { locatorType: "text", type: "smart", value: "Save" },
          },
        ],
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());

    await new Promise((resolve) => setTimeout(resolve, 10));

    const events = await fetch(`${baseUrl}/sessions/${session.sessionId}/events`).then((response) =>
      response.json(),
    );
    assert.ok(events.events.some((event) => event.type === "step.ambiguity_resolved"));
    assert.ok(events.events.some((event) => event.type === "run:success"));
    assert.deepEqual(browserLauncher.state.clicks, [1]);

    await fetch(`${baseUrl}/sessions/${session.sessionId}`, { method: "DELETE" });
  }, launcher);
});

test("self-hosted Playwright worker enables and cleans up recorder mode explicitly", async () => {
  await withWorker(async (baseUrl, browserLauncher) => {
    const session = await fetch(`${baseUrl}/sessions`, {
      body: JSON.stringify({ projectId: "project-1", targetUrl: "https://example.com" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());

    assert.equal(session.metadata.recorderMode, "off");

    const recordMode = await fetch(`${baseUrl}/sessions/${session.sessionId}/recorder-mode`, {
      body: JSON.stringify({ mode: "record" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());
    assert.equal(recordMode.metadata.recorderMode, "record");

    const recorderBinding = browserLauncher.state.page?.bindings.get("__caseforgeRecord");
    assert.equal(typeof recorderBinding, "function");
    recorderBinding(
      {},
      {
        action: "__debug",
        bestLocator: { type: "role", value: "button:Save" },
        confidence: 91,
        debugType: "recorder.hover_detected",
        semanticName: "Save button",
        tag: "button",
      },
    );

    const offMode = await fetch(`${baseUrl}/sessions/${session.sessionId}/recorder-mode`, {
      body: JSON.stringify({ mode: "off" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());
    assert.equal(offMode.metadata.recorderMode, "off");

    const events = await fetch(`${baseUrl}/sessions/${session.sessionId}/events`).then((response) =>
      response.json(),
    );
    assert.ok(events.events.some((event) => event.type === "recorder:mode" && event.data?.mode === "record"));
    assert.ok(events.events.some((event) => event.type === "recorder:mode" && event.data?.mode === "off"));
    assert.ok(
      events.events.some(
        (event) =>
          event.type === "recorder.hover_detected" &&
          event.data?.semanticName === "Save button" &&
          event.data?.bestLocator?.type === "role",
      ),
    );

    await fetch(`${baseUrl}/sessions/${session.sessionId}`, { method: "DELETE" });
  });
});

test("self-hosted Playwright worker follows popup tabs during recording", async () => {
  await withWorker(async (baseUrl, browserLauncher) => {
    const session = await fetch(`${baseUrl}/sessions`, {
      body: JSON.stringify({ projectId: "project-1", targetUrl: "https://example.com" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());

    await fetch(`${baseUrl}/sessions/${session.sessionId}/recorder-mode`, {
      body: JSON.stringify({ mode: "record" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());

    const parentPage = browserLauncher.state.page;
    const childPage = await parentPage.popup("https://example.com/child");
    const recorderBinding = childPage.bindings.get("__caseforgeRecord");
    assert.equal(typeof recorderBinding, "function");
    await recorderBinding(
      { page: childPage },
      {
        action: "click",
        element: { elementKind: "button", tag: "button", text: "Child Button" },
        frameUrl: "https://example.com/child",
        locatorCandidates: [],
        pageUrl: "https://example.com/child",
        value: "",
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 10));

    const metadata = await fetch(`${baseUrl}/sessions/${session.sessionId}`).then((response) =>
      response.json(),
    );
    assert.equal(metadata.currentUrl, "https://example.com/child");

    const events = await fetch(`${baseUrl}/sessions/${session.sessionId}/events`).then((response) =>
      response.json(),
    );
    const childRecord = events.events.find(
      (event) =>
        event.type === "record:command" &&
        event.data?.pageUrl === "https://example.com/child" &&
        event.data?.action === "click",
    );
    const childSwitch = events.events.find(
      (event) =>
        event.type === "record:command" &&
        event.data?.pageUrl === "https://example.com/child" &&
        event.data?.action === "switchPage",
    );
    assert.ok(events.events.some((event) => event.type === "browser:page_active" && event.data?.reason === "popup"));
    assert.ok(childSwitch?.data?.pageId);
    assert.match(childSwitch.data.commandLabel, /Switch to window example\.com/);
    assert.ok(childRecord?.data?.pageId);

    const parentBinding = parentPage.bindings.get("__caseforgeRecord");
    await parentBinding({ page: parentPage }, { action: "__debug", debugType: "test.parent_active" });
    await fetch(`${baseUrl}/sessions/${session.sessionId}/run`, {
      body: JSON.stringify({
        runId: "run-child-page",
        suppressRecording: true,
        steps: [
          {
            action: "switchPage",
            description: "Switch to child tab",
            id: "step-child-switch",
            inputValue: "https://example.com/child",
            options: { pageId: childSwitch.data.pageId, pageUrl: "https://example.com/child" },
            target: { locatorType: "page", type: "manual", value: "https://example.com/child" },
          },
          {
            action: "click",
            description: "Click child button",
            id: "step-child-click",
            options: { pageId: childRecord.data.pageId, pageUrl: "https://example.com/child" },
            target: { locatorType: "text", type: "smart", value: "Child Button" },
          },
        ],
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());

    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.equal(browserLauncher.state.clickPages.at(-1), "https://example.com/child");

    await fetch(`${baseUrl}/sessions/${session.sessionId}`, { method: "DELETE" });
  });
});

test("self-hosted Playwright worker records browser alert dialogs", async () => {
  await withWorker(async (baseUrl, browserLauncher) => {
    const session = await fetch(`${baseUrl}/sessions`, {
      body: JSON.stringify({ projectId: "project-1", targetUrl: "https://example.com/form" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());

    await fetch(`${baseUrl}/sessions/${session.sessionId}/recorder-mode`, {
      body: JSON.stringify({ mode: "record" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());

    await browserLauncher.state.page.dialog("Please include an '@' in the email address.", "alert");
    await new Promise((resolve) => setTimeout(resolve, 10));

    const events = await fetch(`${baseUrl}/sessions/${session.sessionId}/events`).then((response) =>
      response.json(),
    );
    const alertRecord = events.events.find(
      (event) =>
        event.type === "record:command" &&
        event.data?.action === "assert" &&
        event.data?.verify?.kind === "browser_dialog",
    );
    assert.equal(alertRecord?.data?.assertionType, "text_contains");
    assert.equal(alertRecord?.data?.expectedValue, "Please include an '@' in the email address.");
    assert.match(alertRecord?.data?.commandLabel, /Capture alert popup/);
    assert.equal(alertRecord?.data?.element?.elementKind, "browser dialog");

    await fetch(`${baseUrl}/sessions/${session.sessionId}`, { method: "DELETE" });
  });
});

test("self-hosted Playwright worker supports verify mode and CSS assertions", async () => {
  await withWorker(async (baseUrl) => {
    const session = await fetch(`${baseUrl}/sessions`, {
      body: JSON.stringify({ projectId: "project-1" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());

    const mode = await fetch(`${baseUrl}/sessions/${session.sessionId}/recorder-mode`, {
      body: JSON.stringify({ mode: "verify" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());
    assert.equal(mode.metadata.recorderMode, "verify");

    await fetch(`${baseUrl}/sessions/${session.sessionId}/run`, {
      body: JSON.stringify({
        runId: "run-css-assert",
        steps: [
          {
            action: "assert",
            assertionType: "css_property",
            description: "Verify button color",
            expectedValue: "rgb(255, 255, 255)",
            id: "step-css",
            options: { operator: "equals", property: "color" },
            target: { locatorType: "text", type: "smart", value: "Checkout" },
          },
        ],
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());

    await new Promise((resolve) => setTimeout(resolve, 10));

    const events = await fetch(`${baseUrl}/sessions/${session.sessionId}/events`).then((response) =>
      response.json(),
    );
    assert.ok(events.events.some((event) => event.type === "recorder:mode" && event.data?.mode === "verify"));
    assert.ok(events.events.some((event) => event.type === "run:success"));

    await fetch(`${baseUrl}/sessions/${session.sessionId}`, { method: "DELETE" });
  });
});

test("self-hosted Playwright worker verifies loaded images", async () => {
  const launcher = createFakeBrowserLauncher({ tagName: "IMG" });
  await withWorker(async (baseUrl) => {
    const session = await fetch(`${baseUrl}/sessions`, {
      body: JSON.stringify({ projectId: "project-1" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());

    await fetch(`${baseUrl}/sessions/${session.sessionId}/run`, {
      body: JSON.stringify({
        runId: "run-image-assert",
        steps: [
          {
            action: "assert",
            assertionType: "image_loaded",
            description: "Verify hero image",
            id: "step-image",
            target: { locatorType: "role", type: "smart", value: "img:Hero" },
          },
        ],
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());

    await new Promise((resolve) => setTimeout(resolve, 10));

    const events = await fetch(`${baseUrl}/sessions/${session.sessionId}/events`).then((response) =>
      response.json(),
    );
    assert.ok(events.events.some((event) => event.type === "run:success"));

    await fetch(`${baseUrl}/sessions/${session.sessionId}`, { method: "DELETE" });
  }, launcher);
});

test("self-hosted Playwright worker self-heals with a confident fallback fingerprint", async () => {
  const launcher = createFakeBrowserLauncher({
    countByKey: {
      "css:#missing-save": 1,
      "testid:save-primary": 1,
    },
    elementByKey: {
      "testid:save-primary": {
        dataAttributes: { "data-testid": "save-primary" },
        role: "button",
        tagName: "BUTTON",
        text: "Save",
      },
    },
    failClickKeys: ["css:#missing-save"],
  });
  await withWorker(async (baseUrl, browserLauncher) => {
    const session = await fetch(`${baseUrl}/sessions`, {
      body: JSON.stringify({ projectId: "project-1" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());

    await fetch(`${baseUrl}/sessions/${session.sessionId}/run`, {
      body: JSON.stringify({
        runId: "run-heal-success",
        steps: [
          {
            action: "click",
            description: "Click Save",
            element: {
              fingerprint: {
                dataAttributes: { "data-testid": "save-primary" },
                role: "button",
                tag: "button",
                text: "Save",
              },
            },
            id: "step-heal-success",
            locatorCandidates: [
              {
                isUnique: true,
                metadata: { quality: { confidence: 95, readability: 95, stability: 95, uniqueness: 100 } },
                score: 115,
                strategy: "testid",
                value: "save-primary",
              },
            ],
            target: { locatorType: "css", type: "smart", value: "#missing-save" },
          },
        ],
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());

    await new Promise((resolve) => setTimeout(resolve, 20));

    const events = await fetch(`${baseUrl}/sessions/${session.sessionId}/events`).then((response) =>
      response.json(),
    );
    const healed = events.events.find((event) => event.type === "step.healed");
    assert.ok(healed);
    assert.equal(healed.data?.healedLocator?.type, "testid");
    assert.equal(healed.data?.fallbackUsed?.value, "save-primary");
    assert.ok(events.events.some((event) => event.type === "run:success"));
    assert.deepEqual(browserLauncher.state.clicks, ["testid:save-primary"]);

    await fetch(`${baseUrl}/sessions/${session.sessionId}`, { method: "DELETE" });
  }, launcher);
});

test("self-hosted Playwright worker scans the visible DOM when click locator fallbacks fail", async () => {
  const launcher = createFakeBrowserLauncher({
    domScanElements: [
      {
        bounds: { height: 40, width: 150, x: 24, y: 48 },
        id: "hero-signup",
        key: "hero-signup",
        role: "button",
        tagName: "BUTTON",
        text: "Create Account",
      },
    ],
    neverVisibleKeys: [
      "css:hero-signup",
      "role:link:hero-signup",
      "role:button:hero-signup",
      "role:link:Create Account button",
      "role:button:Create Account button",
      "role:link:Create Account",
      "role:button:Create Account",
      "text:hero-signup",
      "text:Create Account button",
      "text:Create Account",
    ],
  });
  await withWorker(async (baseUrl, browserLauncher) => {
    const session = await fetch(`${baseUrl}/sessions`, {
      body: JSON.stringify({ projectId: "project-1" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());

    await fetch(`${baseUrl}/sessions/${session.sessionId}/run`, {
      body: JSON.stringify({
        runId: "run-create-dom-heal",
        steps: [
          {
            action: "click",
            commandText: "Click Create Account button",
            description: "Click Create Account button",
            element: {
              bounds: { height: 40, width: 150, x: 24, y: 48 },
              fingerprint: {
                id: "hero-signup",
                role: "button",
                tag: "button",
                text: "Create Account",
              },
              id: "hero-signup",
              role: "button",
              tag: "button",
              text: "Create Account",
            },
            id: "step-create-account",
            locatorCandidates: [
              {
                isUnique: false,
                metadata: { quality: { confidence: 40, readability: 60, stability: 30, uniqueness: 0 } },
                score: 40,
                strategy: "text",
                value: "Create Account",
              },
            ],
            target: {
              displayName: "Create Account button",
              locatorType: "css",
              type: "smart",
              value: "hero-signup",
            },
          },
        ],
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());

    await new Promise((resolve) => setTimeout(resolve, 20));

    const events = await fetch(`${baseUrl}/sessions/${session.sessionId}/events`).then((response) =>
      response.json(),
    );
    const healed = events.events.find((event) => event.type === "step.healed");
    assert.ok(healed);
    assert.ok(["css", "role", "text"].includes(healed.data?.healedLocator?.type));
    assert.ok(events.events.some((event) => event.type === "run:success"));
    assert.deepEqual(browserLauncher.state.clicks, ["hero-signup"]);

    await fetch(`${baseUrl}/sessions/${session.sessionId}`, { method: "DELETE" });
  }, launcher);
});

test("self-hosted Playwright worker fails safely when healing confidence is low", async () => {
  const launcher = createFakeBrowserLauncher({
    countByKey: {
      "css:#missing-save": 1,
      "testid:cancel-primary": 1,
    },
    elementByKey: {
      "testid:cancel-primary": {
        dataAttributes: { "data-testid": "cancel-primary" },
        role: "link",
        tagName: "A",
        text: "Cancel order",
      },
    },
    failClickKeys: ["css:#missing-save"],
  });
  await withWorker(async (baseUrl, browserLauncher) => {
    const session = await fetch(`${baseUrl}/sessions`, {
      body: JSON.stringify({ projectId: "project-1" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());

    await fetch(`${baseUrl}/sessions/${session.sessionId}/run`, {
      body: JSON.stringify({
        runId: "run-heal-low-confidence",
        steps: [
          {
            action: "click",
            description: "Click Save",
            element: {
              fingerprint: {
                dataAttributes: { "data-testid": "save-primary" },
                role: "button",
                tag: "button",
                text: "Save",
              },
            },
            id: "step-heal-low-confidence",
            locatorCandidates: [
              {
                isUnique: true,
                metadata: { quality: { confidence: 74, readability: 70, stability: 70, uniqueness: 100 } },
                score: 90,
                strategy: "testid",
                value: "cancel-primary",
              },
            ],
            target: { locatorType: "css", type: "smart", value: "#missing-save" },
          },
        ],
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());

    await new Promise((resolve) => setTimeout(resolve, 20));

    const events = await fetch(`${baseUrl}/sessions/${session.sessionId}/events`).then((response) =>
      response.json(),
    );
    assert.ok(events.events.some((event) => event.type === "step.heal_failed"));
    assert.equal(events.events.some((event) => event.type === "step.healed"), false);
    assert.ok(events.events.some((event) => event.type === "run:failed"));
    assert.deepEqual(browserLauncher.state.clicks, []);

    await fetch(`${baseUrl}/sessions/${session.sessionId}`, { method: "DELETE" });
  }, launcher);
});

test("self-hosted Playwright worker fails clearly when a fill target needs an unrecorded prerequisite action", async () => {
  const launcher = createFakeBrowserLauncher({
    hiddenUntilRevealedKeys: ["css:#first-name", "label:First Name field", "placeholder:First Name field"],
  });
  await withWorker(async (baseUrl) => {
    const session = await fetch(`${baseUrl}/sessions`, {
      body: JSON.stringify({ projectId: "project-1", targetUrl: "https://example.com/signup" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());

    await fetch(`${baseUrl}/sessions/${session.sessionId}/run`, {
      body: JSON.stringify({
        runId: "run-missing-prerequisite",
        suppressRecording: true,
        steps: [
          {
            action: "navigate",
            description: "Open signup",
            id: "step-open-signup",
            target: { type: "manual", value: "https://example.com/signup" },
          },
          {
            action: "fill",
            description: "Fill First Name",
            id: "step-fill-first-name",
            inputValue: "Ava",
            target: { displayName: "First Name field", locatorType: "css", type: "smart", value: "#first-name" },
          },
        ],
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());

    await new Promise((resolve) => setTimeout(resolve, 20));

    const events = await fetch(`${baseUrl}/sessions/${session.sessionId}/events`).then((response) =>
      response.json(),
    );
    const failedStep = events.events.find((event) => event.type === "step:failed");
    const failedRun = events.events.find((event) => event.type === "run:failed");
    assert.equal(failedStep?.data?.stepId, "step-fill-first-name");
    assert.match(failedStep.data.errorMessage || failedStep.data.error, /not found or not visible/);
    assert.match(failedStep.data.suggestion, /Record the missing click/);
    assert.equal(failedStep.data.result.status, "failed");
    assert.equal(failedStep.data.result.errorType, "ELEMENT_NOT_READY");
    assert.ok(failedStep.data.result.screenshotPath);
    assert.ok(failedRun);
    assert.equal(failedRun.data.stepResults.at(-1).status, "failed");

    const metadata = await fetch(`${baseUrl}/sessions/${session.sessionId}`).then((response) =>
      response.json(),
    );
    assert.equal(metadata.status, "failed");

    await fetch(`${baseUrl}/sessions/${session.sessionId}`, { method: "DELETE" });
  }, launcher);
});

test("self-hosted Playwright worker passes when the prerequisite click is recorded before fill", async () => {
  const launcher = createFakeBrowserLauncher({
    hiddenUntilRevealedKeys: ["css:#first-name", "label:First Name field", "placeholder:First Name field"],
    revealOnClickKeys: ["text:Create Account"],
  });
  await withWorker(async (baseUrl, browserLauncher) => {
    const session = await fetch(`${baseUrl}/sessions`, {
      body: JSON.stringify({ projectId: "project-1", targetUrl: "https://example.com/signup" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());

    await fetch(`${baseUrl}/sessions/${session.sessionId}/run`, {
      body: JSON.stringify({
        runId: "run-with-prerequisite",
        suppressRecording: true,
        parameterData: { firstName: "Ava" },
        steps: [
          {
            action: "navigate",
            description: "Open signup",
            id: "step-open-signup",
            target: { type: "manual", value: "https://example.com/signup" },
          },
          {
            action: "click",
            description: "Click Create Account",
            id: "step-open-form",
            target: { locatorType: "text", type: "smart", value: "Create Account" },
          },
          {
            action: "fill",
            description: "Fill First Name",
            id: "step-fill-first-name",
            inputValue: "{{firstName}}",
            target: { displayName: "First Name field", locatorType: "css", type: "smart", value: "#first-name" },
          },
        ],
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).then((response) => response.json());

    await new Promise((resolve) => setTimeout(resolve, 20));

    const events = await fetch(`${baseUrl}/sessions/${session.sessionId}/events`).then((response) =>
      response.json(),
    );
    assert.ok(events.events.some((event) => event.type === "run:success"));
    assert.equal(events.events.some((event) => event.type === "step:failed"), false);
    assert.deepEqual(browserLauncher.state.fills.at(-1), { key: "css:#first-name", value: "Ava" });

    await fetch(`${baseUrl}/sessions/${session.sessionId}`, { method: "DELETE" });
  }, launcher);
});
