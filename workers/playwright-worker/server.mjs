import http from "node:http";
import { randomUUID } from "node:crypto";

const defaultHost = process.env.AUTOMATION_WORKER_HOST || "0.0.0.0";
const defaultPort = Number(process.env.AUTOMATION_WORKER_PORT || 4890);
const defaultIdleTimeoutMs = Number(process.env.AUTOMATION_WORKER_IDLE_TIMEOUT_MS || 30 * 60 * 1000);
const defaultHardTimeoutMs = Number(process.env.AUTOMATION_WORKER_HARD_TIMEOUT_MS || 4 * 60 * 60 * 1000);

function now() {
  return new Date().toISOString();
}

function json(response, status, payload) {
  response.writeHead(status, {
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "DELETE, GET, OPTIONS, POST",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
  });
  response.end(JSON.stringify(payload));
}

function html(response, status, body) {
  response.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Content-Type": "text/html; charset=utf-8",
  });
  response.end(body);
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function normalizeUrl(value) {
  if (!value || typeof value !== "string") return "";
  if (value === "about:blank") return value;
  if (/^(data|blob):/i.test(value)) return value;
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function comparableUrl(value) {
  const normalized = normalizeUrl(value);
  if (!normalized || normalized === "about:blank") return normalized;
  try {
    const url = new URL(normalized);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return normalized.replace(/\/$/, "");
  }
}

function loopbackNavigationCandidates(value) {
  const normalized = normalizeUrl(value);
  if (!normalized || normalized === "about:blank") return [value];
  try {
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase();
    if (host === "127.0.0.1") {
      const original = url.toString();
      url.hostname = "localhost";
      return [url.toString(), original];
    }
    if (host === "localhost") {
      const original = url.toString();
      url.hostname = "127.0.0.1";
      return [original, url.toString()];
    }
  } catch {
    return [value];
  }
  return [normalized];
}

function isConnectionRefusedError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /ERR_CONNECTION_REFUSED|ECONNREFUSED|net::ERR_CONNECTION_REFUSED/i.test(message);
}

async function gotoWithLoopbackFallback(page, destination, options = {}) {
  const candidates = loopbackNavigationCandidates(destination);
  let lastError = null;
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    try {
      return await page.goto(candidate, options);
    } catch (error) {
      lastError = error;
      const canTryNext = index < candidates.length - 1;
      if (!canTryNext || !isConnectionRefusedError(error)) {
        throw error;
      }
    }
  }
  if (lastError) throw lastError;
  return page.goto(destination, options);
}

function createId(prefix) {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

function trimEvents(events) {
  if (events.length > 1000) {
    events.splice(0, events.length - 1000);
  }
}

function pushEvent(session, type, data = {}) {
  const event = {
    data,
    id: createId("event"),
    sessionId: session.id,
    timestamp: now(),
    type,
  };
  session.events.push(event);
  session.updatedAt = event.timestamp;
  trimEvents(session.events);
  return event;
}

export function recorderScript() {
  return `
(() => {
  if (typeof window.__caseforgeRecorderCleanup === "function") {
    window.__caseforgeRecorderCleanup();
  }
  window.__caseforgeRecorderInstalled = true;
  const listeners = [];

  function listen(target, eventName, handler, options) {
    target.addEventListener(eventName, handler, options);
    listeners.push([target, eventName, handler, options]);
  }

  function textOf(element) {
    return String(element?.innerText || element?.textContent || element?.value || "").trim().slice(0, 120);
  }

  function normalized(value) {
    return String(value || "").replace(/\\s+/g, " ").trim().toLowerCase();
  }

  function elementRole(element) {
    return element.getAttribute("role") ||
      (element.tagName === "BUTTON"
        ? "button"
        : element.tagName === "A"
          ? "link"
          : element.tagName === "IMG"
            ? "img"
          : element.tagName === "INPUT"
            ? "textbox"
            : "");
  }

  function accessibleName(element) {
    return String(
      element.getAttribute("aria-label") ||
        labelTextFor(element) ||
        element.getAttribute("alt") ||
        element.getAttribute("title") ||
        element.getAttribute("placeholder") ||
        textOf(element) ||
        ""
    ).trim();
  }

  function dataAttributesOf(element) {
    const dataAttributes = {};
    for (const attribute of Array.from(element?.attributes || [])) {
      if (attribute.name.startsWith("data-")) dataAttributes[attribute.name] = attribute.value;
    }
    return dataAttributes;
  }

  function labelTextFor(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return "";
    const id = element.getAttribute("id");
    if (id) {
      const explicit = document.querySelector("label[for='" + cssStringEscape(id) + "']");
      if (explicit) return textOf(explicit);
    }
    const wrappingLabel = element.closest?.("label");
    if (wrappingLabel) return textOf(wrappingLabel);
    const ariaLabelledBy = element.getAttribute("aria-labelledby");
    if (ariaLabelledBy) {
      return ariaLabelledBy
        .split(/\\s+/)
        .map((part) => textOf(document.getElementById(part)))
        .filter(Boolean)
        .join(" ");
    }
    return "";
  }

  function cssStringEscape(value) {
    return String(value || "").replace(/\\\\/g, "\\\\\\\\").replace(/'/g, "\\\\'");
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return window.CSS.escape(value);
    return String(value || "").replace(/([ #.;?%&,.+*~\\':"!^$[\\]()=>|/@])/g, "\\\\$1");
  }

  function visibilityState(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return "missing";
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    if (style.display === "none") return "display-none";
    if (style.visibility === "hidden") return "hidden";
    if (rect.width <= 0 || rect.height <= 0) return "zero-size";
    return "visible";
  }

  function nearestHeadingText(element) {
    const container = element?.closest?.("section,main,article,form,dialog,[role='dialog'],[role='banner'],header,nav") || element?.parentElement;
    const heading = container?.querySelector?.("h1,h2,h3,h4,h5,h6,[role='heading'],legend,label");
    return heading ? textOf(heading).slice(0, 140) : "";
  }

  function nearestSectionText(element) {
    const container = element?.closest?.("section,main,article,form,dialog,[role='dialog'],[role='banner'],header,nav") || element?.parentElement;
    return container ? textOf(container).slice(0, 220) : "";
  }

  function elementPreview(element, index, clickedElement) {
    const rect = element.getBoundingClientRect();
    const parent = element.parentElement;
    return {
      alt: element.getAttribute("alt") || "",
      ariaLabel: element.getAttribute("aria-label") || "",
      bounds: {
        height: Math.round(rect.height),
        width: Math.round(rect.width),
        x: Math.round(rect.left),
        y: Math.round(rect.top),
      },
      className: element.getAttribute("class") || "",
      dataAttributes: dataAttributesOf(element),
      headingText: nearestHeadingText(element),
      index,
      isClickedElement: element === clickedElement,
      parentSnippet: parent ? textOf(parent).slice(0, 180) : "",
      role: elementRole(element),
      sectionText: nearestSectionText(element),
      tag: element.tagName ? element.tagName.toLowerCase() : "",
      text: textOf(element),
      visibility: visibilityState(element),
    };
  }

  function queryLocatorElements(strategy, value) {
    const text = String(value || "").trim();
    if (!text) return [];
    if (strategy === "css") {
      try {
        return Array.from(document.querySelectorAll(text));
      } catch {
        return [];
      }
    }
    if (strategy === "xpath") {
      try {
        const result = document.evaluate(text, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        return Array.from({ length: result.snapshotLength }, (_, index) => result.snapshotItem(index)).filter(Boolean);
      } catch {
        return [];
      }
    }
    if (strategy === "testid") {
      return Array.from(document.querySelectorAll("[data-testid],[data-test],[data-qa],[data-cy]"))
        .filter((element) =>
          element.getAttribute("data-testid") === text ||
          element.getAttribute("data-test") === text ||
          element.getAttribute("data-qa") === text ||
          element.getAttribute("data-cy") === text
        );
    }
    if (strategy === "role") {
      const separator = text.indexOf(":");
      const role = separator >= 0 ? text.slice(0, separator) : text;
      const name = separator >= 0 ? normalized(text.slice(separator + 1)) : "";
      return Array.from(document.querySelectorAll("*")).filter((element) => {
        if (elementRole(element) !== role) return false;
        if (!name) return true;
        const elementName = normalized(accessibleName(element));
        return elementName === name || elementName.includes(name);
      });
    }
    if (strategy === "aria-label") {
      return Array.from(document.querySelectorAll("[aria-label]"))
        .filter((element) => element.getAttribute("aria-label") === text);
    }
    if (strategy === "label" || strategy === "text") {
      const wanted = normalized(text);
      return Array.from(document.querySelectorAll("a,button,label,input,textarea,select,summary,[role],[onclick],[tabindex]"))
        .filter((element) => {
          const elementText = normalized(
            accessibleName(element)
          );
          return elementText === wanted || elementText.includes(wanted);
        });
    }
    if (strategy === "placeholder") {
      return Array.from(document.querySelectorAll("[placeholder]"))
        .filter((element) => element.getAttribute("placeholder") === text);
    }
    if (strategy === "alt") {
      return Array.from(document.querySelectorAll("[alt]"))
        .filter((element) => element.getAttribute("alt") === text);
    }
    if (strategy === "title") {
      return Array.from(document.querySelectorAll("[title]"))
        .filter((element) => element.getAttribute("title") === text);
    }
    return [];
  }

  function locatorQuality(strategy, value, matches) {
    const matchCount = matches.length;
    const unique = matchCount === 1;
    const stable = strategy === "testid" ? 95 : strategy === "role" ? 86 : strategy === "label" ? 82 : strategy === "placeholder" ? 80 : strategy === "text" ? 70 : strategy === "css" ? 45 : 35;
    const readability = (strategy === "css" || strategy === "xpath") && String(value).includes("nth-of-type") ? 35 : strategy === "testid" || strategy === "role" || strategy === "label" || strategy === "text" ? 90 : 70;
    const uniqueness = unique ? 100 : Math.max(10, 70 - matchCount * 12);
    const confidence = Math.round(uniqueness * 0.42 + stable * 0.36 + readability * 0.22);
    return { confidence, readability, stability: stable, uniqueness };
  }

  function candidate(strategy, value, score, clickedElement) {
    if (!value) return null;
    const text = String(value);
    const matches = queryLocatorElements(strategy, text);
    const clickedIndex = matches.findIndex((element) => element === clickedElement);
    const quality = locatorQuality(strategy, text, matches);
    return {
      isUnique: matches.length === 1,
      metadata: {
        ambiguous: matches.length > 1,
        clickedIndex,
        matchCount: matches.length,
        previews: matches.slice(0, 8).map((element, index) => elementPreview(element, index, clickedElement)),
        quality,
      },
      score: score + (matches.length === 1 ? 20 : Math.max(0, 12 - matches.length * 3)) + Math.round(quality.stability / 20),
      strategy,
      value: text,
    };
  }

  function cssPath(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return "";
    if (element.id) {
      return "#" + cssEscape(element.id);
    }
    const parts = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
      const tag = current.tagName ? current.tagName.toLowerCase() : "";
      if (!tag) break;
      let index = 1;
      let sibling = current;
      while ((sibling = sibling.previousElementSibling)) {
        if (sibling.tagName && sibling.tagName.toLowerCase() === tag) index += 1;
      }
      parts.unshift(tag + ":nth-of-type(" + index + ")");
      current = current.parentElement;
      if (parts.length >= 5) break;
    }
    return parts.length ? parts.join(" > ") : "";
  }

  function xpathPath(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return "";
    if (element.id) return "//*[@id='" + String(element.id).replace(/'/g, "\\\\'") + "']";
    const parts = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
      const tag = current.tagName ? current.tagName.toLowerCase() : "";
      if (!tag) break;
      let index = 1;
      let sibling = current;
      while ((sibling = sibling.previousElementSibling)) {
        if (sibling.tagName && sibling.tagName.toLowerCase() === tag) index += 1;
      }
      parts.unshift(tag + "[" + index + "]");
      current = current.parentElement;
      if (parts.length >= 5) break;
    }
    return parts.length ? "//" + parts.join("/") : "";
  }

  function elementFingerprint(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return {};
    const rect = element.getBoundingClientRect();
    return {
      accessibleName: accessibleName(element).slice(0, 180),
      ariaLabel: element.getAttribute("aria-label") || "",
      dataAttributes: dataAttributesOf(element),
      href: element.getAttribute("href") || "",
      id: element.getAttribute("id") || "",
      label: labelTextFor(element),
      name: element.getAttribute("name") || "",
      placeholder: element.getAttribute("placeholder") || "",
      role: elementRole(element),
      sectionText: nearestSectionText(element),
      src: element.getAttribute("src") || element.currentSrc || "",
      tag: element.tagName ? element.tagName.toLowerCase() : "",
      text: textOf(element).slice(0, 180),
      title: element.getAttribute("title") || "",
      bounds: {
        height: Math.round(rect.height),
        width: Math.round(rect.width),
        x: Math.round(rect.left),
        y: Math.round(rect.top),
      },
    };
  }

  function locatorCandidates(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return [];
    const testId =
      element.getAttribute("data-testid") ||
      element.getAttribute("data-test") ||
      element.getAttribute("data-qa") ||
      element.getAttribute("data-cy");
    const explicitRole = element.getAttribute("role") || "";
    const inferredRole =
      explicitRole ||
      (element.tagName === "BUTTON"
        ? "button"
        : element.tagName === "A"
          ? "link"
          : "");
    const name = accessibleName(element);
    return [
      candidate("testid", testId, 98, element),
      candidate("role", inferredRole && name ? inferredRole + ":" + name : "", 95, element),
      candidate("label", labelTextFor(element), 93, element),
      candidate("label", element.getAttribute("aria-label"), 92, element),
      candidate("placeholder", element.getAttribute("placeholder"), 82, element),
      candidate("aria-label", element.getAttribute("aria-label"), 81, element),
      candidate("alt", element.getAttribute("alt"), 80, element),
      candidate("title", element.getAttribute("title"), 78, element),
      candidate("css", element.id ? "#" + cssEscape(element.id) : "", 76, element),
      candidate("text", textOf(element), 72, element),
      candidate("css", cssPath(element), 45, element),
      candidate("xpath", xpathPath(element), 30, element),
    ].filter(Boolean).sort((left, right) => right.score - left.score);
  }

  function highlightAmbiguity(candidates) {
    const ambiguous = candidates.find((candidate) => candidate.metadata?.ambiguous);
    const previews = ambiguous?.metadata?.previews || [];
    document.querySelectorAll("[data-caseforge-ambiguity-highlight]").forEach((node) => node.remove());
    if (!previews.length) return null;
    const matches = queryLocatorElements(ambiguous.strategy, ambiguous.value);
    for (const [index, element] of matches.entries()) {
      const rect = element.getBoundingClientRect();
      const overlay = document.createElement("div");
      overlay.setAttribute("data-caseforge-ambiguity-highlight", "true");
      overlay.style.position = "fixed";
      overlay.style.left = rect.left + "px";
      overlay.style.top = rect.top + "px";
      overlay.style.width = rect.width + "px";
      overlay.style.height = rect.height + "px";
      overlay.style.border = index === ambiguous.metadata.clickedIndex ? "3px solid #059669" : "2px solid #f59e0b";
      overlay.style.boxShadow = "0 0 0 9999px rgba(245, 158, 11, 0.03)";
      overlay.style.pointerEvents = "none";
      overlay.style.zIndex = "2147483647";
      document.documentElement.appendChild(overlay);
    }
    window.setTimeout(() => {
      document.querySelectorAll("[data-caseforge-ambiguity-highlight]").forEach((node) => node.remove());
    }, 5000);
    return {
      candidate: {
        strategy: ambiguous.strategy,
        value: ambiguous.value,
      },
      matchCount: ambiguous.metadata.matchCount,
      previews,
      recordedIndex: ambiguous.metadata.clickedIndex,
      selectedIndex: undefined,
    };
  }

  function storedRecorderMode() {
    try {
      const stored = window.sessionStorage?.getItem("__caseforgeRecorderMode") || "";
      return stored === "record" || stored === "verify" ? stored : "";
    } catch {
      return "";
    }
  }

  let recorderMode = window.__caseforgeRecorderMode || storedRecorderMode() || "off";
  let suppressClickUntil = 0;
  let hoverFrame = 0;
  let lastHoverTarget = null;
  let lastHoverDebugKey = "";
  const ignoredHoverTags = new Set(["HTML", "BODY", "HEAD", "SCRIPT", "STYLE", "META", "LINK"]);

  function emitDebug(type, data = {}) {
    try {
      window.__caseforgeRecord?.({
        action: "__debug",
        debugType: type,
        ...data,
      });
    } catch {
      // Debug events should never affect the page being recorded.
    }
  }

  function isInternalRecorderElement(element) {
    return Boolean(
      element?.closest?.(
        "[data-caseforge-recorder-hover],[data-caseforge-verify-highlight],[data-caseforge-ambiguity-highlight]"
      )
    );
  }

  function hoverElementFrom(target) {
    if (!target || target.nodeType !== Node.ELEMENT_NODE) return null;
    if (ignoredHoverTags.has(target.tagName)) return null;
    if (isInternalRecorderElement(target)) return null;
    return target;
  }

  function removeVerifyHighlight() {
    document.querySelectorAll("[data-caseforge-verify-highlight]").forEach((node) => node.remove());
  }

  function removeRecorderHover() {
    document.querySelectorAll("[data-caseforge-recorder-hover]").forEach((node) => node.remove());
  }

  function showRecorderHover(target) {
    const element = hoverElementFrom(target);
    if (!element) {
      removeRecorderHover();
      return;
    }
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      removeRecorderHover();
      return;
    }
    removeRecorderHover();
    const candidates = locatorCandidates(element);
    const best = candidates[0];
    const confidence = best?.metadata?.quality?.confidence;
    const labelText = accessibleName(element) || textOf(element) || element.tagName.toLowerCase();
    const overlay = document.createElement("div");
    overlay.setAttribute("data-caseforge-recorder-hover", "box");
    overlay.style.position = "fixed";
    overlay.style.left = rect.left + "px";
    overlay.style.top = rect.top + "px";
    overlay.style.width = rect.width + "px";
    overlay.style.height = rect.height + "px";
    overlay.style.border = "2px solid #0ea5e9";
    overlay.style.boxShadow = "0 0 0 2px rgba(14, 165, 233, 0.14)";
    overlay.style.pointerEvents = "none";
    overlay.style.zIndex = "2147483646";
    const tooltip = document.createElement("div");
    tooltip.setAttribute("data-caseforge-recorder-hover", "tooltip");
    tooltip.textContent = [
      labelText.slice(0, 60),
      "tag " + (element.tagName ? element.tagName.toLowerCase() : "node"),
      best ? best.strategy + ": " + String(best.value).slice(0, 70) : "",
      Number.isFinite(confidence) ? "confidence " + confidence : "",
    ].filter(Boolean).join(" | ");
    tooltip.style.position = "fixed";
    tooltip.style.left = Math.min(window.innerWidth - 24, Math.max(8, rect.left)) + "px";
    tooltip.style.top = Math.max(8, rect.top - 34) + "px";
    tooltip.style.maxWidth = "min(520px, calc(100vw - 16px))";
    tooltip.style.overflow = "hidden";
    tooltip.style.textOverflow = "ellipsis";
    tooltip.style.whiteSpace = "nowrap";
    tooltip.style.border = "1px solid rgba(15, 23, 42, 0.16)";
    tooltip.style.borderRadius = "8px";
    tooltip.style.background = "#0f172a";
    tooltip.style.color = "#fff";
    tooltip.style.font = "600 12px/1.3 system-ui, -apple-system, Segoe UI, sans-serif";
    tooltip.style.padding = "6px 8px";
    tooltip.style.pointerEvents = "none";
    tooltip.style.zIndex = "2147483647";
    document.documentElement.appendChild(overlay);
    document.documentElement.appendChild(tooltip);

    const hoverKey = [
      element.tagName,
      labelText,
      best?.strategy || "",
      best?.value || "",
      Math.round(rect.left),
      Math.round(rect.top),
    ].join("|");
    if (hoverKey !== lastHoverDebugKey) {
      lastHoverDebugKey = hoverKey;
      emitDebug("recorder.hover_detected", {
        bestLocator: best ? { type: best.strategy, value: best.value } : null,
        confidence: Number.isFinite(confidence) ? confidence : null,
        semanticName: labelText.slice(0, 120),
        tag: element.tagName ? element.tagName.toLowerCase() : "",
      });
    }
  }

  function scheduleRecorderHover(element) {
    lastHoverTarget = element;
    if (hoverFrame) return;
    hoverFrame = window.requestAnimationFrame(() => {
      hoverFrame = 0;
      if (recorderMode === "record") showRecorderHover(lastHoverTarget);
    });
  }

  function cssSnapshot(element) {
    const style = window.getComputedStyle(element);
    return {
      "background-color": style.getPropertyValue("background-color"),
      "background-image": style.getPropertyValue("background-image"),
      color: style.getPropertyValue("color"),
      "font-family": style.getPropertyValue("font-family"),
      "font-size": style.getPropertyValue("font-size"),
      "font-weight": style.getPropertyValue("font-weight"),
    };
  }

  function verifyKind(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return "element";
    const tag = element.tagName ? element.tagName.toLowerCase() : "";
    const style = window.getComputedStyle(element);
    const hasBackgroundImage = style.getPropertyValue("background-image") && style.getPropertyValue("background-image") !== "none";
    if (tag === "img" || tag === "image" || elementRole(element) === "img" || hasBackgroundImage) return "image";
    if (accessibleName(element) || textOf(element)) return "text";
    return "element";
  }

  function verifyAssertionsFor(element) {
    const kind = verifyKind(element);
    if (kind === "image") {
      return ["image_loaded", "visible", "css_property"];
    }
    if (kind === "text") {
      return ["text_contains", "text_equals", "visible", "css_property"];
    }
    return ["visible", "css_property"];
  }

  function defaultAssertionFor(element) {
    const kind = verifyKind(element);
    if (kind === "image") return "image_loaded";
    if (kind === "text") return "text_contains";
    return "visible";
  }

  function defaultExpectedValueFor(element, assertionType) {
    if (assertionType === "text_contains" || assertionType === "text_equals") {
      return accessibleName(element) || textOf(element);
    }
    if (assertionType === "css_property") {
      return cssSnapshot(element).color || "";
    }
    return "";
  }

  function verifySnapshot(element) {
    const tag = element?.tagName ? element.tagName.toLowerCase() : "";
    const kind = verifyKind(element);
    const cssProperties = cssSnapshot(element);
    const assertionType = defaultAssertionFor(element);
    const imageState =
      tag === "img"
        ? {
            alt: element.getAttribute("alt") || "",
            complete: Boolean(element.complete),
            naturalHeight: Number(element.naturalHeight || 0),
            naturalWidth: Number(element.naturalWidth || 0),
            src: element.currentSrc || element.src || "",
          }
        : {
            backgroundImage: cssProperties["background-image"] || "",
          };
    return {
      assertionType,
      cssProperties,
      expectedValue: defaultExpectedValueFor(element, assertionType),
      imageState,
      kind,
      suggestedAssertions: verifyAssertionsFor(element),
      summary: kind === "image"
        ? "image"
        : accessibleName(element) || textOf(element) || tag || "element",
    };
  }

  function highlightVerifyTarget(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return;
    if (element.closest("[data-caseforge-verify-highlight]")) return;
    removeVerifyHighlight();
    const rect = element.getBoundingClientRect();
    const overlay = document.createElement("div");
    overlay.setAttribute("data-caseforge-verify-highlight", "box");
    overlay.style.position = "fixed";
    overlay.style.left = rect.left + "px";
    overlay.style.top = rect.top + "px";
    overlay.style.width = rect.width + "px";
    overlay.style.height = rect.height + "px";
    overlay.style.border = "2px solid #2563eb";
    overlay.style.boxShadow = "0 0 0 3px rgba(37, 99, 235, 0.18)";
    overlay.style.pointerEvents = "none";
    overlay.style.zIndex = "2147483647";
    const label = document.createElement("div");
    label.setAttribute("data-caseforge-verify-highlight", "label");
    label.textContent = "Verify " + verifyKind(element);
    label.style.position = "fixed";
    label.style.left = rect.left + "px";
    label.style.top = Math.max(0, rect.top - 28) + "px";
    label.style.borderRadius = "999px";
    label.style.background = "#2563eb";
    label.style.color = "#fff";
    label.style.font = "600 12px/1.2 system-ui, -apple-system, Segoe UI, sans-serif";
    label.style.padding = "6px 9px";
    label.style.pointerEvents = "none";
    label.style.zIndex = "2147483647";
    document.documentElement.appendChild(overlay);
    document.documentElement.appendChild(label);
  }

  window.__caseforgeSetRecorderMode = (mode) => {
    recorderMode = mode === "verify" ? "verify" : mode === "off" ? "off" : "record";
    window.__caseforgeRecorderMode = recorderMode;
    try {
      if (recorderMode === "off") {
        window.sessionStorage?.removeItem("__caseforgeRecorderMode");
      } else {
        window.sessionStorage?.setItem("__caseforgeRecorderMode", recorderMode);
      }
    } catch {
      // Some pages block storage access; the worker will still reapply mode after navigation.
    }
    suppressClickUntil = 0;
    if (recorderMode !== "verify") removeVerifyHighlight();
    if (recorderMode !== "record") removeRecorderHover();
    return recorderMode;
  };

  function elementSnapshot(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return {};
    const rect = element.getBoundingClientRect();
    const dataAttributes = {};
    for (const attribute of Array.from(element.attributes || [])) {
      if (attribute.name.startsWith("data-")) dataAttributes[attribute.name] = attribute.value;
    }
    const parent = element.parentElement;
    return {
      ariaLabel: element.getAttribute("aria-label") || "",
      bounds: {
        height: Math.round(rect.height),
        width: Math.round(rect.width),
        x: Math.round(rect.left),
        y: Math.round(rect.top),
      },
      className: element.getAttribute("class") || "",
      dataAttributes,
      elementKind: element.tagName ? element.tagName.toLowerCase() : "element",
      fingerprint: elementFingerprint(element),
      headingText: nearestHeadingText(element),
      id: element.getAttribute("id") || "",
      inputType: element.getAttribute("type") || "",
      labelText: labelTextFor(element) || element.getAttribute("aria-label") || element.getAttribute("placeholder") || "",
      nearbyText: parent ? textOf(parent).slice(0, 180) : "",
      name: element.getAttribute("name") || "",
      pageTitle: document.title || "",
      pageUrl: window.location.href,
      parentTag: parent?.tagName ? parent.tagName.toLowerCase() : "",
      placeholder: element.getAttribute("placeholder") || "",
      role: element.getAttribute("role") || "",
      sectionText: nearestSectionText(element),
      tag: element.tagName ? element.tagName.toLowerCase() : "",
      text: textOf(element),
      title: element.getAttribute("title") || "",
    };
  }

  function emit(action, element, value) {
    const candidates = locatorCandidates(element);
    const ambiguity = highlightAmbiguity(candidates);
    window.__caseforgeRecord?.({
      action,
      element: elementSnapshot(element),
      frameUrl: window.location.href,
      ambiguity,
      locatorCandidates: candidates,
      pageUrl: window.location.href,
      value: value == null ? "" : String(value),
    });
  }

  function emitValidationMessage(element, message, source = "native_validation") {
    const text = String(message || "").trim();
    if (!text || !element || element.nodeType !== Node.ELEMENT_NODE) return false;
    const snapshot = elementSnapshot(element);
    const targetName =
      snapshot.labelText ||
      snapshot.ariaLabel ||
      snapshot.placeholder ||
      snapshot.name ||
      snapshot.text ||
      "field";
    const candidates = locatorCandidates(element);
    const ambiguity = highlightAmbiguity(candidates);
    window.__caseforgeRecord?.({
      action: "assert",
      assertionType: "text_contains",
      commandLabel: "Capture validation error: " + text,
      element: {
        ...snapshot,
        elementKind: "validation message",
      },
      expectedValue: text,
      frameUrl: window.location.href,
      ambiguity,
      locatorCandidates: candidates,
      pageUrl: window.location.href,
      value: text,
      verify: {
        assertionType: "text_contains",
        expectedValue: text,
        kind: "validation_message",
        source,
        summary: targetName + " validation: " + text,
        suggestedAssertions: ["text_contains", "visible"],
      },
    });
    return true;
  }

  const pendingFillTimers = new Map();
  const pendingFillTimerIds = new Set();
  const lastEmittedFill = new WeakMap();
  const pendingSelectTimers = new Map();
  const pendingSelectTimerIds = new Set();
  const lastEmittedSelect = new WeakMap();

  function elementRoleName(element) {
    return String(element?.getAttribute?.("role") || "").trim().toLowerCase();
  }

  function isDropdownElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
    if (element.tagName === "SELECT") return true;
    const role = elementRoleName(element);
    if (["combobox", "listbox"].includes(role)) return true;
    const popup = String(element.getAttribute("aria-haspopup") || "").trim().toLowerCase();
    if (["listbox", "menu", "tree", "grid", "true"].includes(popup)) return true;
    const expandedOwner = element.closest?.("[role='combobox'],[aria-haspopup='listbox'],[aria-haspopup='menu']");
    return Boolean(expandedOwner);
  }

  function isDropdownOptionElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
    const role = elementRoleName(element);
    if (role === "option" || role === "menuitem") return true;
    return Boolean(element.closest?.("[role='option'],[role='menuitem']"));
  }

  function optionValue(element) {
    return String(
      element?.getAttribute?.("data-value") ||
        element?.getAttribute?.("value") ||
        element?.getAttribute?.("aria-label") ||
        textOf(element) ||
        element?.value ||
        ""
    ).trim();
  }

  function isTextEntryElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
    if (isDropdownElement(element)) return false;
    if (element.isContentEditable) return true;
    const tag = element.tagName;
    if (tag === "TEXTAREA") return true;
    if (tag !== "INPUT") return false;
    const type = String(element.getAttribute("type") || "text").toLowerCase();
    return !["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"].includes(type);
  }

  function isFormValueElement(element) {
    return isTextEntryElement(element) || isDropdownElement(element);
  }

  function flushPendingFill(element) {
    const pending = pendingFillTimers.get(element);
    if (!pending) return false;
    window.clearTimeout(pending.timerId);
    pendingFillTimerIds.delete(pending.timerId);
    pendingFillTimers.delete(element);
    emitFill(element, pending.value);
    return true;
  }

  function flushPendingSelect(element) {
    const pending = pendingSelectTimers.get(element);
    if (!pending) return false;
    window.clearTimeout(pending.timerId);
    pendingSelectTimerIds.delete(pending.timerId);
    pendingSelectTimers.delete(element);
    emitSelect(element, pending.value);
    return true;
  }

  function flushAllPendingFills() {
    for (const [element, pending] of Array.from(pendingFillTimers.entries())) {
      window.clearTimeout(pending.timerId);
      pendingFillTimerIds.delete(pending.timerId);
      pendingFillTimers.delete(element);
      emitFill(element, pending.value);
    }
  }

  function flushAllPendingSelects() {
    for (const [element, pending] of Array.from(pendingSelectTimers.entries())) {
      window.clearTimeout(pending.timerId);
      pendingSelectTimerIds.delete(pending.timerId);
      pendingSelectTimers.delete(element);
      emitSelect(element, pending.value);
    }
  }

  function recentlyEmittedFill(element, value) {
    const emitted = lastEmittedFill.get(element);
    if (!emitted) return false;
    return emitted.value === String(value == null ? "" : value) && Date.now() - emitted.timestamp < 1200;
  }

  function recentlyEmittedSelect(element, value) {
    const emitted = lastEmittedSelect.get(element);
    if (!emitted) return false;
    return emitted.value === String(value == null ? "" : value) && Date.now() - emitted.timestamp < 1200;
  }

  function emitFill(element, value) {
    const normalizedValue = value == null ? "" : String(value);
    lastEmittedFill.set(element, { value: normalizedValue, timestamp: Date.now() });
    emit("fill", element, normalizedValue);
  }

  function emitSelect(element, value) {
    const normalizedValue = value == null ? "" : String(value);
    lastEmittedSelect.set(element, { value: normalizedValue, timestamp: Date.now() });
    emit("select", element, normalizedValue);
  }

  function scheduleFill(element, value) {
    if (!isTextEntryElement(element)) {
      emitFill(element, value);
      return;
    }
    const pending = pendingFillTimers.get(element);
    if (pending) {
      window.clearTimeout(pending.timerId);
      pendingFillTimerIds.delete(pending.timerId);
    }
    const normalizedValue = value == null ? "" : String(value);
    const timerId = window.setTimeout(() => {
      pendingFillTimers.delete(element);
      pendingFillTimerIds.delete(timerId);
      emitFill(element, normalizedValue);
    }, 550);
    pendingFillTimerIds.add(timerId);
    pendingFillTimers.set(element, { timerId, value: normalizedValue });
  }

  function scheduleSelect(element, value) {
    const pending = pendingSelectTimers.get(element);
    if (pending) {
      window.clearTimeout(pending.timerId);
      pendingSelectTimerIds.delete(pending.timerId);
    }
    const normalizedValue = value == null ? "" : String(value);
    const timerId = window.setTimeout(() => {
      pendingSelectTimers.delete(element);
      pendingSelectTimerIds.delete(timerId);
      emitSelect(element, normalizedValue);
    }, 250);
    pendingSelectTimerIds.add(timerId);
    pendingSelectTimers.set(element, { timerId, value: normalizedValue });
  }

  function emitVerify(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
    const verify = verifySnapshot(element);
    const candidates = locatorCandidates(element);
    const ambiguity = highlightAmbiguity(candidates);
    const snapshot = elementSnapshot(element);
    const targetName =
      snapshot.alt ||
      snapshot.ariaLabel ||
      snapshot.labelText ||
      snapshot.text ||
      snapshot.headingText ||
      verify.summary ||
      "element";
    window.__caseforgeRecord?.({
      action: "assert",
      assertionType: verify.assertionType,
      commandLabel:
        verify.assertionType === "image_loaded"
          ? "Verify " + targetName + " image is loaded"
          : verify.assertionType === "text_contains"
            ? "Verify " + targetName + " text is present"
            : "Verify " + targetName + " is visible",
      element: {
        ...snapshot,
        elementKind: verify.kind,
      },
      expectedValue: verify.expectedValue,
      frameUrl: window.location.href,
      ambiguity,
      locatorCandidates: candidates,
      pageUrl: window.location.href,
      value: verify.expectedValue,
      verify,
    });
    return true;
  }

  function captureVerifySelection(event) {
    if (recorderMode !== "verify") return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    const captured = emitVerify(event.target);
    if (captured) {
      window.__caseforgeSetRecorderMode("record");
      suppressClickUntil = Date.now() + 750;
    }
    return captured;
  }

  function handleRecorderHover(event) {
    if (recorderMode === "verify") {
      highlightVerifyTarget(event.target);
      return;
    }
    if (recorderMode === "record") removeRecorderHover();
  }

  listen(document, "mousemove", handleRecorderHover, true);
  listen(document, "mouseover", handleRecorderHover, true);

  listen(document, "keydown", (event) => {
    if (recorderMode === "record" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (isDropdownElement(event.target) && (event.key === "Tab" || event.key === "Enter")) {
        flushPendingSelect(event.target);
        return;
      }
      if (isTextEntryElement(event.target) && (event.key === "Tab" || event.key === "Enter")) {
        flushPendingFill(event.target);
        return;
      }
      const recordableKeys = ["Enter", "Tab", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
      if (recordableKeys.includes(event.key)) emit("press", event.target, event.key);
      return;
    }
    if (recorderMode !== "verify" || event.key !== "Escape") return;
    window.__caseforgeSetRecorderMode("record");
  }, true);

  listen(document, "pointerdown", (event) => {
    if (Date.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    captureVerifySelection(event);
  }, true);

  listen(document, "mousedown", (event) => {
    if (Date.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    captureVerifySelection(event);
  }, true);

  listen(document, "pointerup", (event) => {
    if (Date.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  listen(document, "mouseup", (event) => {
    if (Date.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  listen(document, "click", (event) => {
    if (Date.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (recorderMode === "verify") {
      captureVerifySelection(event);
      return;
    }
    if (recorderMode !== "record") return;
    if (isDropdownOptionElement(event.target)) {
      emitSelect(event.target, optionValue(event.target));
      return;
    }
    if (isFormValueElement(event.target)) return;
    emit("click", event.target, "");
  }, true);

  listen(document, "dblclick", (event) => {
    if (Date.now() < suppressClickUntil || recorderMode === "verify") {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (recorderMode === "verify") captureVerifySelection(event);
    }
  }, true);

  listen(document, "input", (event) => {
    if (recorderMode !== "record") return;
    if (isDropdownElement(event.target)) {
      scheduleSelect(event.target, event.target?.value || textOf(event.target));
      return;
    }
    if (!isTextEntryElement(event.target)) return;
    scheduleFill(event.target, event.target?.value || "");
  }, true);

  listen(document, "change", (event) => {
    if (recorderMode !== "record") return;
    if (isDropdownElement(event.target)) {
      if (flushPendingSelect(event.target)) return;
      if (recentlyEmittedSelect(event.target, event.target?.value || textOf(event.target))) return;
      emitSelect(event.target, event.target?.value || textOf(event.target));
      return;
    }
    if (!isTextEntryElement(event.target)) return;
    if (flushPendingFill(event.target)) return;
    if (recentlyEmittedFill(event.target, event.target?.value || "")) return;
    emitFill(event.target, event.target?.value || "");
  }, true);

  listen(document, "invalid", (event) => {
    if (recorderMode !== "record") return;
    flushPendingFill(event.target);
    const message =
      typeof event.target?.validationMessage === "string"
        ? event.target.validationMessage
        : "";
    emitValidationMessage(event.target, message, "native_validation");
  }, true);

  listen(window, "blur", () => {
    if (recorderMode === "record") {
      flushAllPendingSelects();
      flushAllPendingFills();
    }
  }, true);

  listen(window, "pagehide", () => {
    if (recorderMode === "record") {
      flushAllPendingSelects();
      flushAllPendingFills();
    }
  }, true);

  listen(document, "visibilitychange", () => {
    if (recorderMode === "record" && document.visibilityState === "hidden") {
      flushAllPendingSelects();
      flushAllPendingFills();
    }
  }, true);

  window.__caseforgeRecorderCleanup = () => {
    flushAllPendingSelects();
    flushAllPendingFills();
    for (const [target, eventName, handler, options] of listeners.splice(0)) {
      target.removeEventListener(eventName, handler, options);
    }
    if (hoverFrame) window.cancelAnimationFrame(hoverFrame);
    for (const timerId of Array.from(pendingFillTimerIds)) {
      window.clearTimeout(timerId);
      pendingFillTimerIds.delete(timerId);
    }
    for (const timerId of Array.from(pendingSelectTimerIds)) {
      window.clearTimeout(timerId);
      pendingSelectTimerIds.delete(timerId);
    }
    hoverFrame = 0;
    lastHoverTarget = null;
    lastHoverDebugKey = "";
    removeVerifyHighlight();
    removeRecorderHover();
    document.querySelectorAll("[data-caseforge-ambiguity-highlight]").forEach((node) => node.remove());
    window.__caseforgeRecorderInstalled = false;
    window.__caseforgeRecorderMode = "off";
    try {
      window.sessionStorage?.removeItem("__caseforgeRecorderMode");
    } catch {
      // Cleanup should remain best effort on locked-down pages.
    }
  };
  emitDebug("recorder.injected", {
    listeners: ["mousemove", "mouseover", "click", "input", "change", "invalid"],
    mode: recorderMode,
  });
})();`;
}

async function installRecorder(session) {
  const page = session.page;
  if (!page) return;
  if (!session.recorderBindings) session.recorderBindings = new WeakSet();
  if (!session.recorderInitScripts) session.recorderInitScripts = new WeakSet();
  if (!session.recorderNavigationPages) session.recorderNavigationPages = new WeakSet();
  if (!session.recorderBindings.has(page) && typeof page.exposeBinding === "function") {
    await page.exposeBinding("__caseforgeRecord", async (source, event) => {
      const sourcePage = source?.page || page;
      if (sourcePage && session.page !== sourcePage) {
        await activateSessionPage(session, sourcePage, "recorder_event");
      }
      if (session.suppressRecording) return;
      if (session.recorderMode === "off") return;
      const pageId = sourcePage ? pageIdForSessionPage(session, sourcePage) : "";
      const pageUrl = sourcePage?.url?.() || event?.pageUrl || event?.frameUrl || "";
      if (event?.action === "__debug") {
        const { debugType, ...debugData } = event || {};
        delete debugData.action;
        pushEvent(session, debugType || "recorder:debug", { ...debugData, pageId, pageUrl });
        return;
      }
      if (session.recorderMode !== "record" && event?.action !== "assert") return;
      if (event?.action === "assert" && event?.verify) {
        session.recorderMode = "record";
        pushEvent(session, "recorder:mode", { mode: "record", reason: "verify_captured" });
      }
      pushEvent(session, "record:command", {
        ...event,
        element:
          event?.element && typeof event.element === "object"
            ? { ...event.element, pageId, pageUrl: event.element.pageUrl || pageUrl }
            : event?.element,
        pageId,
        pageUrl: event?.pageUrl || pageUrl,
      });
    }).catch(() => undefined);
    session.recorderBindings.add(page);
  }
  if (!session.recorderInitScripts.has(page) && typeof page.addInitScript === "function") {
    await page.addInitScript(recorderScript()).catch(() => undefined);
    session.recorderInitScripts.add(page);
  }
  await applyRecorderModeToActivePage(session, "install");
  if (session.recorderNavigationPages.has(page)) return;
  session.recorderNavigationPages.add(page);
  page.on("framenavigated", (frame) => {
    if (session.suppressRecording) return;
    if (typeof page.mainFrame === "function" && frame !== page.mainFrame()) return;
    activatePageReference(session, page);
    if (session.recorderMode === "record" || session.recorderMode === "verify") {
      void applyRecorderModeToActivePage(session, "navigation");
    }
    if (session.recorderMode !== "record") return;
    const url = frame.url();
    if (!url || url === "about:blank" || url === session.lastRecordedUrl) return;
    session.lastRecordedUrl = url;
    pushEvent(session, "record:command", {
      action: "navigate",
      element: { elementKind: "browser", tag: "browser", text: url },
      frameUrl: url,
      locatorCandidates: [],
      pageId: pageIdForSessionPage(session, page),
      pageUrl: url,
      value: url,
    });
  });
}

function pageIdForSessionPage(session, page) {
  if (!page) return "";
  if (!session.pageIds) session.pageIds = new WeakMap();
  if (!session.pagesById) session.pagesById = new Map();
  if (!session.pageMetadata) session.pageMetadata = new Map();
  let pageId = session.pageIds.get(page);
  if (!pageId) {
    pageId = createId("page");
    session.pageIds.set(page, pageId);
  }
  session.pagesById.set(pageId, page);
  session.pageMetadata.set(pageId, {
    id: pageId,
    isActive: session.page === page,
    isClosed: Boolean(page.isClosed?.()),
    url: typeof page.url === "function" ? page.url() : "",
  });
  return pageId;
}

function activatePageReference(session, page) {
  if (!page) return "";
  const pageId = pageIdForSessionPage(session, page);
  session.page = page;
  session.activePageId = pageId;
  session.activePageUrl = typeof page.url === "function" ? page.url() : "";
  if (session.pageMetadata?.has(pageId)) {
    session.pageMetadata.set(pageId, {
      ...session.pageMetadata.get(pageId),
      isActive: true,
      isClosed: Boolean(page.isClosed?.()),
      url: session.activePageUrl,
    });
  }
  return pageId;
}

function pageSwitchLabel(url, reason = "page") {
  if (reason === "popup" || reason === "new_page") {
    try {
      const parsed = new URL(url);
      return `Switch to window ${parsed.hostname}`;
    } catch {
      return "Switch to new window";
    }
  }
  try {
    const parsed = new URL(url);
    return `Switch to tab ${parsed.hostname}`;
  } catch {
    return "Switch tab";
  }
}

function recordPageSwitch(session, page, pageId, reason) {
  if (session.suppressRecording || session.recorderMode !== "record") return;
  if (!pageId || session.lastRecordedPageSwitchId === pageId) return;
  const pageUrl = typeof page.url === "function" ? page.url() : "";
  session.lastRecordedPageSwitchId = pageId;
  pushEvent(session, "record:command", {
    action: "switchPage",
    commandLabel: pageSwitchLabel(pageUrl, reason),
    element: {
      elementKind: reason === "popup" || reason === "new_page" ? "browser window" : "browser tab",
      pageId,
      pageUrl,
      tag: "browser",
      text: pageUrl,
    },
    frameUrl: pageUrl,
    locatorCandidates: [],
    pageId,
    pageUrl,
    value: pageUrl,
  });
}

async function activateSessionPage(session, page, reason = "page") {
  if (!page) return;
  const previousPageId = session.activePageId || "";
  const pageId = activatePageReference(session, page);
  if (previousPageId && previousPageId !== pageId) {
    recordPageSwitch(session, page, pageId, reason);
  }
  if (!session.instrumentedPages) session.instrumentedPages = new WeakSet();
  if (!session.instrumentedPages.has(page)) {
    session.instrumentedPages.add(page);
    page.on?.("console", (message) => {
      if (session.page !== page) activatePageReference(session, page);
      pushEvent(session, "console", {
        text: message.text(),
        type: message.type(),
      });
    });
    page.on?.("pageerror", (error) => {
      if (session.page !== page) activatePageReference(session, page);
      pushEvent(session, "pageerror", { message: error.message });
    });
    page.on?.("requestfailed", (request) => {
      if (session.page !== page) activatePageReference(session, page);
      pushEvent(session, "network:requestfailed", {
        errorText: request.failure()?.errorText || "",
        method: request.method(),
        url: request.url(),
      });
    });
    page.on?.("response", (response) => {
      if (session.page !== page) activatePageReference(session, page);
      const status = response.status();
      if (status >= 400) {
        pushEvent(session, "network:response", {
          status,
          url: response.url(),
        });
      }
    });
    page.on?.("dialog", (dialog) => {
      if (session.page !== page) activatePageReference(session, page);
      if (!session.suppressRecording && session.recorderMode === "record") {
        const message = typeof dialog.message === "function" ? dialog.message() : "";
        const type = typeof dialog.type === "function" ? dialog.type() : "alert";
        const pageId = pageIdForSessionPage(session, page);
        const pageUrl = typeof page.url === "function" ? page.url() : "";
        pushEvent(session, "record:command", {
          action: "assert",
          assertionType: "text_contains",
          commandLabel: `Capture ${type || "alert"} popup: ${message || "message"}`,
          element: {
            elementKind: "browser dialog",
            pageId,
            pageUrl,
            tag: "browser",
            text: message || "",
          },
          expectedValue: message || "",
          frameUrl: pageUrl,
          locatorCandidates: [],
          pageId,
          pageUrl,
          value: message || "",
          verify: {
            assertionType: "text_contains",
            expectedValue: message || "",
            kind: "browser_dialog",
            source: type || "alert",
            summary: message || `${type || "Alert"} popup`,
            suggestedAssertions: ["text_contains", "visible"],
          },
        });
      }
      void dialog.accept?.().catch(() => undefined);
    });
    page.on?.("popup", (popup) => {
      void activateSessionPage(session, popup, "popup");
    });
    page.on?.("close", () => {
      const closedPageId = pageIdForSessionPage(session, page);
      if (session.pageMetadata?.has(closedPageId)) {
        session.pageMetadata.set(closedPageId, {
          ...session.pageMetadata.get(closedPageId),
          isActive: false,
          isClosed: true,
          url: typeof page.url === "function" ? page.url() : "",
        });
      }
      if (session.page === page) {
        const openPages = typeof session.context?.pages === "function" ? session.context.pages() : [];
        const nextPage = openPages.find((candidate) => candidate !== page && !candidate.isClosed?.());
        if (nextPage) void activateSessionPage(session, nextPage, "page_closed");
      }
    });
  }
  await installRecorder(session);
  pushEvent(session, "browser:page_active", {
    pageId,
    reason,
    url: typeof page.url === "function" ? page.url() : "",
  });
}

async function applyRecorderModeToActivePage(session, reason = "mode_change") {
  const page = session.page;
  if (!page || typeof page.evaluate !== "function") return false;
  const mode = session.recorderMode === "verify" ? "verify" : session.recorderMode === "record" ? "record" : "off";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      if (mode === "off") {
        await page.evaluate(() => {
          window.__caseforgeRecorderCleanup?.();
          return "off";
        });
      } else {
        await page.evaluate(recorderScript());
        await page.evaluate((value) => window.__caseforgeSetRecorderMode?.(value), mode);
      }
      pushEvent(session, "recorder:injection_applied", { attempt, mode, reason });
      return true;
    } catch (error) {
      if (attempt === 3) {
        pushEvent(session, "recorder:injection_failed", {
          error: error instanceof Error ? error.message : "Could not inject recorder.",
          mode,
          reason,
        });
        return false;
      }
      await page.waitForTimeout?.(150).catch(() => undefined);
    }
  }
  return false;
}

function makeSessionUrls(baseUrl, sessionId) {
  return {
    eventStreamUrl: `${baseUrl}/sessions/${encodeURIComponent(sessionId)}/events`,
    liveViewUrl: `${baseUrl}/sessions/${encodeURIComponent(sessionId)}/live`,
  };
}

function requestBaseUrl(request, fallbackBaseUrl) {
  if (fallbackBaseUrl) return fallbackBaseUrl;
  if (process.env.AUTOMATION_WORKER_PUBLIC_URL) {
    return process.env.AUTOMATION_WORKER_PUBLIC_URL.replace(/\/$/, "");
  }
  const host = request.headers.host || `127.0.0.1:${defaultPort}`;
  const protocol = process.env.AUTOMATION_WORKER_PUBLIC_PROTOCOL || "http";
  return `${protocol}://${host}`;
}

function isGenericElementLabel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return !normalized || normalized === "target" || normalized === "element" || /^element\s+\d+$/.test(normalized);
}

function stableLabel(value) {
  const text = String(value || "").trim();
  if (/^(#|\.|\[|\/|xpath=|css=|https?:\/\/)/i.test(text)) return "";
  return isGenericElementLabel(text) ? "" : text;
}

function publicSession(session, baseUrl) {
  const urls = makeSessionUrls(baseUrl, session.id);
  const currentUrl = session.page?.url?.() || session.activePageUrl || session.targetUrl || "";
  const pages = Array.from(session.pageMetadata?.values?.() || []).map((page) => ({
    ...page,
    isActive: page.id === session.activePageId,
  }));
  return {
    capabilities: session.capabilities,
    createdAt: session.createdAt,
    eventStreamUrl: urls.eventStreamUrl,
    eventsUrl: urls.eventStreamUrl,
    expiresAt: session.hardExpiresAt,
    id: session.id,
    idleExpiresAt: session.idleExpiresAt,
    lastActivityAt: session.lastActivityAt,
    lastRunId: session.lastRunId || null,
    liveViewUrl: urls.liveViewUrl,
    metadata: {
      ...session.metadata,
      currentUrl,
      executionMode: session.executionMode,
      idleExpiresAt: session.idleExpiresAt,
      lastActivityAt: session.lastActivityAt,
      lastRunId: session.lastRunId || null,
      activePageId: session.activePageId || null,
      pages,
      pendingAmbiguity: session.pendingAmbiguity
        ? {
            action: session.pendingAmbiguity.action,
            actionId: session.pendingAmbiguity.actionId || null,
            description: session.pendingAmbiguity.description || "",
            index: session.pendingAmbiguity.index,
            locator: session.pendingAmbiguity.locator,
            matchCount: session.pendingAmbiguity.matchCount,
            message: session.pendingAmbiguity.message || "",
            previews: session.pendingAmbiguity.previews || [],
            runId: session.pendingAmbiguity.runId || null,
            stepId: session.pendingAmbiguity.stepId || null,
          }
        : null,
      recorderMode: session.recorderMode || "off",
    },
    providerSessionId: session.id,
    sessionId: session.id,
    status: session.status,
    targetUrl: session.targetUrl,
    updatedAt: session.updatedAt,
    currentUrl,
  };
}

async function knownSessionPages(session) {
  const pages = [];
  for (const page of session.pagesById?.values?.() || []) {
    if (page && !page.isClosed?.()) pages.push(page);
  }
  if (typeof session.context?.pages === "function") {
    for (const page of session.context.pages()) {
      if (page && !page.isClosed?.() && !pages.includes(page)) pages.push(page);
    }
  }
  return pages;
}

function stepPageHints(step) {
  const options = step.options && typeof step.options === "object" ? step.options : {};
  const element = step.element && typeof step.element === "object" ? step.element : {};
  return {
    pageId:
      (typeof options.pageId === "string" && options.pageId) ||
      (typeof element.pageId === "string" && element.pageId) ||
      "",
    pageUrl:
      (typeof options.pageUrl === "string" && options.pageUrl) ||
      (typeof element.pageUrl === "string" && element.pageUrl) ||
      (typeof step.pageUrl === "string" && step.pageUrl) ||
      "",
  };
}

async function pageForStep(session, step) {
  const hints = stepPageHints(step);
  if (hints.pageId) {
    const page = session.pagesById?.get?.(hints.pageId);
    if (page && !page.isClosed?.()) return page;
  }
  const wantedUrl = comparableUrl(hints.pageUrl);
  if (wantedUrl) {
    const pages = await knownSessionPages(session);
    const exact = pages.find((page) => comparableUrl(page.url?.() || "") === wantedUrl);
    if (exact) return exact;
  }
  return session.page;
}

async function activatePageForStep(session, step, reason = "step") {
  const page = await pageForStep(session, step);
  if (!page) return session.page;
  const wasActive = session.page === page;
  activatePageReference(session, page);
  if (typeof page.bringToFront === "function") {
    await page.bringToFront().catch(() => undefined);
  }
  if (!wasActive) {
    pushEvent(session, "browser:page_active", {
      pageId: pageIdForSessionPage(session, page),
      reason,
      url: page.url?.() || "",
    });
  }
  return page;
}

function locatorForValue(page, locatorType, value) {
  if (locatorType === "role") {
    const separator = value.indexOf(":");
    const role = separator >= 0 ? value.slice(0, separator) : value;
    const name = separator >= 0 ? value.slice(separator + 1) : "";
    return page.getByRole(role, name ? { name } : undefined);
  }
  if (locatorType === "label" || locatorType === "aria-label") {
    return page.getByLabel(value);
  }
  if (locatorType === "placeholder") return page.getByPlaceholder(value);
  if (locatorType === "text") return page.getByText(value);
  if (locatorType === "alt") return page.getByAltText(value);
  if (locatorType === "title") return page.getByTitle(value);
  if (locatorType === "testid" || locatorType === "data-testid") {
    return page.getByTestId(value);
  }
  if (locatorType === "xpath") return page.locator(`xpath=${value}`);
  return page.locator(value);
}

async function testLocatorForSession(session, input) {
  if (!session?.page) {
    const error = new Error("Session page is not available.");
    error.code = "SESSION_BROKEN";
    throw error;
  }
  const locatorType = String(input.locatorType || input.type || "css").toLowerCase();
  const value = String(input.value || "").trim();
  if (!value) {
    const error = new Error("Locator value is required.");
    error.code = "LOCATOR_REQUIRED";
    throw error;
  }
  const locator = locatorForValue(session.page, locatorType, value);
  const count = await locator.count();
  const previews = [];
  for (let index = 0; index < Math.min(count, 6); index += 1) {
    previews.push(
      await locator.nth(index).evaluate((element, previewIndex) => {
        const rect = element.getBoundingClientRect();
        const dataAttributes = {};
        for (const attribute of Array.from(element.attributes || [])) {
          if (attribute.name.startsWith("data-")) dataAttributes[attribute.name] = attribute.value;
        }
        const text = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
        return {
          ariaLabel: element.getAttribute("aria-label") || "",
          bounds: {
            height: Math.round(rect.height),
            width: Math.round(rect.width),
            x: Math.round(rect.left),
            y: Math.round(rect.top),
          },
          dataAttributes,
          index: previewIndex,
          role: element.getAttribute("role") || "",
          tag: element.tagName ? element.tagName.toLowerCase() : "",
          text: text.slice(0, 180),
          visibility:
            rect.width > 0 && rect.height > 0 && window.getComputedStyle(element).visibility !== "hidden"
              ? "visible"
              : "hidden",
        };
      }, index),
    );
  }
  return { count, locatorType, previews, sessionId: session.id, value };
}

function locatorAttemptsFor(page, step) {
  const target = step.target || {};
  const attempts = [];
  const seen = new Set();

  function add(locatorType, value, source) {
    const type = String(locatorType || "css");
    const text = String(value || "").trim();
    if ((type === "text" || type === "role" || type === "label") && isGenericElementLabel(text.replace(/^(link|button):/i, ""))) {
      return;
    }
    if (!text) return;
    const key = `${type}:${text}`;
    if (seen.has(key)) return attempts.find((attempt) => `${attempt.type}:${attempt.value}` === key);
    seen.add(key);
    const attempt = {
      locator: locatorForValue(page, type, text),
      metadata: {},
      source,
      type,
      value: text,
    };
    attempts.push(attempt);
    return attempt;
  }

  add(target.locatorType || target.strategy || step.locatorType || "css", target.value || step.locatorValue || "", "target");
  for (const candidate of (Array.isArray(step.locatorCandidates) ? step.locatorCandidates : []).slice(0, 6)) {
    const attempt = add(candidate.strategy || candidate.type, candidate.value, "candidate");
    if (attempt) {
      attempt.metadata =
        candidate.metadata && typeof candidate.metadata === "object"
          ? { ...attempt.metadata, ...candidate.metadata }
          : attempt.metadata;
    }
  }

  const textFallbacks = [
    target.displayName,
    target.value,
    step.element?.text,
    step.element?.ariaLabel,
    step.element?.labelText,
  ].map(stableLabel).filter(Boolean);
  const formAction = ["fill", "type", "select", "clear"].includes(String(step.action || ""));
  for (const text of textFallbacks) {
    if (formAction) {
      add("label", text, "form-fallback");
      add("placeholder", text, "form-fallback");
    } else {
      add("role", `link:${text}`, "text-fallback");
      add("role", `button:${text}`, "text-fallback");
      add("text", text, "text-fallback");
    }
  }

  if (!attempts.length) {
    throw new Error(`Step ${step.id || step.action} is missing a target.`);
  }
  return attempts;
}

function originalLocatorForStep(step) {
  const target = step.target || {};
  return {
    source: "primary",
    type: target.locatorType || target.strategy || step.locatorType || "css",
    value: target.value || step.locatorValue || "",
  };
}

function eventLocator(attempt) {
  if (!attempt) return null;
  return {
    source: attempt.source || "candidate",
    type: attempt.type || "css",
    value: attempt.value || "",
  };
}

function ambiguityError(message, details = {}) {
  const error = new Error(message);
  error.code = "LOCATOR_AMBIGUOUS";
  error.details = details;
  return error;
}

function isAmbiguityError(error) {
  return Boolean(error && typeof error === "object" && error.code === "LOCATOR_AMBIGUOUS");
}

function commandTimeoutMs(step, fallback = 8000) {
  const configured = Number(step?.options?.timeout || process.env.AUTOMATION_WORKER_COMMAND_TIMEOUT_MS || fallback);
  return Number.isFinite(configured) && configured > 0 ? configured : fallback;
}

function interCommandDelayMs(payload, fallback = 1000) {
  const configured = Number(
    payload?.interCommandDelayMs ??
      process.env.AUTOMATION_WORKER_INTER_COMMAND_DELAY_MS ??
      fallback,
  );
  return Number.isFinite(configured) && configured >= 0 ? configured : fallback;
}

function isLocatorTimeoutError(error) {
  const text = `${error?.name || ""} ${error?.message || ""}`.toLowerCase();
  return /timeout|timed out|not visible|not found|waiting for|strict mode violation|element is not attached|element is not enabled|element is not editable/.test(text);
}

function missingPrerequisiteSuggestion(action) {
  if (["fill", "type", "select"].includes(action)) {
    return "The input may be opened by a button/dropdown/modal. Record the missing click before this step. Try re-recording from the point where the field becomes visible.";
  }
  return "This element may require a previous click/action that was not recorded. Try re-recording from the point where the element becomes visible.";
}

function humanStepFailureMessage(step, index, cause) {
  const label = step?.target?.displayName || step?.commandText || step?.description || "Element";
  if (isLocatorTimeoutError(cause)) {
    return `Step ${index + 1} failed: ${label} was not found or not visible. This step may require a previous click/action that was not recorded.`;
  }
  return `Step ${index + 1} failed: ${cause instanceof Error ? cause.message : "Command failed."}`;
}

function structuredStepError(step, index, cause, actionName) {
  const error = new Error(humanStepFailureMessage(step, index, cause));
  error.code = isLocatorTimeoutError(cause) ? "ELEMENT_NOT_READY" : "COMMAND_FAILED";
  error.cause = cause;
  error.errorType = error.code;
  error.suggestion = isLocatorTimeoutError(cause)
    ? missingPrerequisiteSuggestion(step?.action || actionName)
    : "Review the failed command details and retry after the page is in the expected state.";
  return error;
}

async function withCommandTimeout(promise, timeout, step, index, actionName) {
  let timerId;
  const timeoutPromise = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      reject(structuredStepError(step, index, new Error(`${actionName} timed out after ${timeout} ms.`), actionName));
    }, timeout);
    timerId.unref?.();
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } catch (error) {
    if (error?.code === "ELEMENT_NOT_READY" || error?.code === "COMMAND_FAILED") throw error;
    throw structuredStepError(step, index, error, actionName);
  } finally {
    clearTimeout(timerId);
  }
}

async function waitForLocatorReady(locator, step, index, timeout, actionName, state = "visible") {
  if (!locator || typeof locator.waitFor !== "function") return;
  await withCommandTimeout(
    locator.waitFor({ state, timeout }),
    timeout + 500,
    step,
    index,
    `${actionName} target`,
  );
}

function locatorIdentity(locator) {
  if (!locator) return "";
  const type = String(locator.type || locator.strategy || locator.locatorType || "css").toLowerCase();
  const value = String(locator.value || "").trim();
  return `${type}:${value}`;
}

function ambiguityForAttempt(step, attempt) {
  const optionAmbiguity =
    step.options?.ambiguity && typeof step.options.ambiguity === "object"
      ? step.options.ambiguity
      : null;
  const metadata = attempt.metadata && typeof attempt.metadata === "object" ? attempt.metadata : {};
  const optionCandidate =
    optionAmbiguity?.candidate && typeof optionAmbiguity.candidate === "object"
      ? optionAmbiguity.candidate
      : null;
  const matchesOptionCandidate =
    optionCandidate &&
    locatorIdentity(optionCandidate) === locatorIdentity({ type: attempt.type, value: attempt.value });
  const selectedIndex =
    matchesOptionCandidate && Number.isInteger(optionAmbiguity?.selectedIndex)
      ? Number(optionAmbiguity.selectedIndex)
      : undefined;
  const matchCount =
    matchesOptionCandidate && Number.isFinite(Number(optionAmbiguity?.matchCount))
      ? Number(optionAmbiguity.matchCount)
      : Number.isFinite(Number(metadata.matchCount))
        ? Number(metadata.matchCount)
        : 0;
  const previews =
    matchesOptionCandidate && Array.isArray(optionAmbiguity?.previews)
      ? optionAmbiguity.previews
      : Array.isArray(metadata.previews)
        ? metadata.previews
        : [];
  const resolutionMethod =
    matchesOptionCandidate && typeof optionAmbiguity?.resolutionMethod === "string"
      ? optionAmbiguity.resolutionMethod
      : "";
  return {
    candidate: optionCandidate || { strategy: attempt.type, type: attempt.type, value: attempt.value },
    matchCount,
    previews,
    resolutionMethod,
    selectedIndex,
  };
}

function previewFromElementHandle(element, index, selectedIndex) {
  return element.evaluate((node, input) => {
    const rect = node.getBoundingClientRect();
    const dataAttributes = {};
    for (const attribute of Array.from(node.attributes || [])) {
      if (attribute.name.startsWith("data-")) dataAttributes[attribute.name] = attribute.value;
    }
    const parent = node.parentElement;
    const text = String(node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
    const style = window.getComputedStyle(node);
    return {
      ariaLabel: node.getAttribute("aria-label") || "",
      bounds: {
        height: Math.round(rect.height),
        width: Math.round(rect.width),
        x: Math.round(rect.left),
        y: Math.round(rect.top),
      },
      className: node.getAttribute("class") || "",
      dataAttributes,
      index: input.index,
      isSelected: input.index === input.selectedIndex,
      parentSnippet: parent
        ? String(parent.innerText || parent.textContent || "").replace(/\s+/g, " ").trim().slice(0, 180)
        : "",
      role: node.getAttribute("role") || (node.tagName === "A" ? "link" : node.tagName === "BUTTON" ? "button" : ""),
      tag: node.tagName ? node.tagName.toLowerCase() : "",
      text: text.slice(0, 160),
      visibility:
        style.display === "none"
          ? "display-none"
          : style.visibility === "hidden"
            ? "hidden"
            : rect.width > 0 && rect.height > 0
              ? "visible"
              : "zero-size",
    };
  }, { index, selectedIndex });
}

async function locatorMatchPreviews(locator, selectedIndex, limit = 5) {
  if (!locator || typeof locator.elementHandles !== "function") return [];
  try {
    const handles = await locator.elementHandles();
    const previews = [];
    for (const [index, handle] of handles.slice(0, limit).entries()) {
      previews.push(await previewFromElementHandle(handle, index, selectedIndex).catch(() => null));
    }
    return previews.filter(Boolean);
  } catch {
    return [];
  }
}

function waitForAmbiguityResolution(session, payload) {
  const timeoutMs = Number(process.env.AUTOMATION_WORKER_AMBIGUITY_TIMEOUT_MS || 10 * 60 * 1000);
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      if (session.pendingAmbiguity?.runId === payload.runId && session.pendingAmbiguity?.stepId === payload.stepId) {
        session.pendingAmbiguity = null;
      }
      reject(ambiguityError(`${payload.description || "Command"} still needs a locator choice.`, payload));
    }, timeoutMs);
    timeoutId.unref?.();
    session.pendingAmbiguity = {
      ...payload,
      reject: (error) => {
        clearTimeout(timeoutId);
        session.pendingAmbiguity = null;
        reject(error);
      },
      resolve: (resolution) => {
        clearTimeout(timeoutId);
        session.pendingAmbiguity = null;
        resolve(resolution);
      },
    };
  });
}

async function resolveLocatorForAttempt(session, page, step, index, context, attempt) {
  const locator = attempt.locator;
  if (!locator || typeof locator.count !== "function") {
    return typeof locator?.first === "function" ? locator.first() : locator;
  }

  let matchCount = 0;
  try {
    matchCount = await locator.count();
  } catch {
    return typeof locator.first === "function" ? locator.first() : locator;
  }

  if (matchCount <= 1) {
    return typeof locator.first === "function" ? locator.first() : locator;
  }

  const ambiguity = ambiguityForAttempt(step, attempt);
  const selectedIndex =
    Number.isInteger(ambiguity.selectedIndex) && ambiguity.selectedIndex >= 0
      ? ambiguity.selectedIndex
      : undefined;
  const previews = ambiguity.previews.length
    ? ambiguity.previews
    : await locatorMatchPreviews(locator, selectedIndex, 6);
  const payload = {
    action: step.action,
    actionId: context.actionId || (typeof step.options?.sourceActionId === "string" ? step.options.sourceActionId : null),
    commandId: step.id || null,
    description: step.description || step.commandText || step.action,
    index,
    locator: eventLocator(attempt),
    matchCount,
    previews,
    resolutionMethod: selectedIndex !== undefined ? ambiguity.resolutionMethod || "index" : "needs_review",
    runId: context.runId || null,
    selectedIndex,
    sessionId: session.id,
    stepId: step.id || null,
    timestamp: now(),
  };

  if (selectedIndex !== undefined && selectedIndex < matchCount && typeof locator.nth === "function") {
    pushEvent(session, "step.ambiguity_resolved", payload);
    return locator.nth(selectedIndex);
  }

  pushEvent(session, "step.ambiguity_detected", payload);
  const stepLabel = step.description || step.commandText || attempt.value || step.action;
  const resolution = await waitForAmbiguityResolution(session, {
    ...payload,
    message: `${stepLabel} needs a locator choice: ${attempt.type}=${attempt.value} matched ${matchCount} elements.`,
  });
  const resolvedIndex = Number(resolution?.selectedIndex);
  if (Number.isInteger(resolvedIndex) && resolvedIndex >= 0 && resolvedIndex < matchCount && typeof locator.nth === "function") {
    const resolvedPayload = {
      ...payload,
      resolutionMethod: resolution.resolutionMethod || "index",
      selectedIndex: resolvedIndex,
    };
    pushEvent(session, "step.ambiguity_resolved", resolvedPayload);
    return locator.nth(resolvedIndex);
  }
  throw ambiguityError(
    `${stepLabel} needs a locator choice: ${attempt.type}=${attempt.value} matched ${matchCount} elements.`,
    payload,
  );
}

async function primaryResolvedLocator(session, page, step, index, context) {
  const attempt = locatorAttemptsFor(page, step)[0];
  return resolveLocatorForAttempt(session, page, step, index, context, attempt);
}

function isAutoHealingAction(action) {
  return ["click", "fill", "type", "select", "hover", "press"].includes(action);
}

function isHighRiskStep(step) {
  if (step.options?.allowHealing === true) return false;
  if (step.options?.highRisk === true || step.options?.destructive === true) return true;
  const text = `${step.description || ""} ${step.commandText || ""} ${step.target?.displayName || ""}`.toLowerCase();
  return /\b(delete|remove|destroy|submit payment|purchase|place order|cancel subscription|confirm delete)\b/.test(text);
}

function healingEventPayload(session, step, index, context, extra = {}) {
  return {
    action: step.action,
    actionId: context.actionId || null,
    commandId: step.id || null,
    healReason: extra.healReason || "",
    index,
    originalLocator: extra.originalLocator || originalLocatorForStep(step),
    runId: context.runId || null,
    sessionId: session.id,
    stepId: step.id || null,
    timestamp: now(),
    ...extra,
  };
}

function normalizedText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function tokenSimilarity(left, right) {
  const leftTokens = new Set(normalizedText(left).split(" ").filter((token) => token.length > 2));
  const rightTokens = new Set(normalizedText(right).split(" ").filter((token) => token.length > 2));
  if (!leftTokens.size || !rightTokens.size) return 0;
  let matches = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) matches += 1;
  return matches / Math.max(leftTokens.size, rightTokens.size);
}

function expectedFingerprintForStep(step) {
  const element = step.element && typeof step.element === "object" ? step.element : {};
  const optionsFingerprint =
    step.options?.elementFingerprint && typeof step.options.elementFingerprint === "object"
      ? step.options.elementFingerprint
      : {};
  const nestedFingerprint =
    element.fingerprint && typeof element.fingerprint === "object"
      ? element.fingerprint
      : {};
  return {
    ...element,
    ...nestedFingerprint,
    ...optionsFingerprint,
  };
}

async function fingerprintForLocator(locator) {
  if (!locator || typeof locator.evaluate !== "function") return {};
  return locator.evaluate((element) => {
    function textOf(node) {
      return String(
        node.getAttribute("aria-label") ||
          node.getAttribute("title") ||
          node.getAttribute("alt") ||
          node.innerText ||
          node.textContent ||
          node.value ||
          "",
      ).replace(/\s+/g, " ").trim().slice(0, 180);
    }
    function dataAttributesOf(node) {
      const dataAttributes = {};
      for (const attribute of Array.from(node.attributes || [])) {
        if (attribute.name.startsWith("data-")) dataAttributes[attribute.name] = attribute.value;
      }
      return dataAttributes;
    }
    const rect = element.getBoundingClientRect();
    return {
      accessibleName: textOf(element),
      ariaLabel: element.getAttribute("aria-label") || "",
      dataAttributes: dataAttributesOf(element),
      href: element.getAttribute("href") || "",
      id: element.getAttribute("id") || "",
      label: element.getAttribute("aria-label") || "",
      name: element.getAttribute("name") || "",
      placeholder: element.getAttribute("placeholder") || "",
      role: element.getAttribute("role") || (element.tagName === "A" ? "link" : element.tagName === "BUTTON" ? "button" : ""),
      src: element.getAttribute("src") || element.currentSrc || "",
      tag: element.tagName ? element.tagName.toLowerCase() : "",
      text: textOf(element),
      title: element.getAttribute("title") || "",
      bounds: {
        height: Math.round(rect.height),
        width: Math.round(rect.width),
        x: Math.round(rect.left),
        y: Math.round(rect.top),
      },
    };
  }).catch(() => ({}));
}

function fingerprintConfidence(expected, actual, baseConfidence = 70) {
  const expectedSignals = [
    expected.tag,
    expected.role,
    expected.text,
    expected.accessibleName,
    expected.ariaLabel,
    expected.label,
    expected.labelText,
    expected.placeholder,
    expected.id,
    expected.name,
  ].filter(Boolean);
  if (!expectedSignals.length) return Math.max(55, Math.min(90, Math.round(baseConfidence)));

  let score = 35;
  if (expected.tag && actual.tag) score += normalizedText(expected.tag) === normalizedText(actual.tag) ? 12 : -16;
  if (expected.role && actual.role) score += normalizedText(expected.role) === normalizedText(actual.role) ? 10 : -8;
  if (expected.id && actual.id) score += expected.id === actual.id ? 18 : -10;
  if (expected.name && actual.name) score += expected.name === actual.name ? 12 : -6;
  if (expected.placeholder && actual.placeholder) score += normalizedText(expected.placeholder) === normalizedText(actual.placeholder) ? 12 : -6;
  if (expected.href && actual.href) score += expected.href === actual.href ? 12 : -8;
  if (expected.src && actual.src) score += expected.src === actual.src ? 12 : -8;

  const expectedLabel = expected.accessibleName || expected.ariaLabel || expected.label || expected.labelText || expected.text || "";
  const actualLabel = actual.accessibleName || actual.ariaLabel || actual.label || actual.text || "";
  if (expectedLabel && actualLabel) {
    const left = normalizedText(expectedLabel);
    const right = normalizedText(actualLabel);
    if (left === right) score += 28;
    else if (left.includes(right) || right.includes(left)) score += 18;
    else score += Math.round(tokenSimilarity(left, right) * 20);
  }

  const expectedData = expected.dataAttributes && typeof expected.dataAttributes === "object" ? expected.dataAttributes : {};
  const actualData = actual.dataAttributes && typeof actual.dataAttributes === "object" ? actual.dataAttributes : {};
  for (const [name, value] of Object.entries(expectedData)) {
    if (value && actualData[name] === value) score += 10;
  }

  const expectedBounds = expected.bounds && typeof expected.bounds === "object" ? expected.bounds : null;
  const actualBounds = actual.bounds && typeof actual.bounds === "object" ? actual.bounds : null;
  if (expectedBounds && actualBounds && Number.isFinite(Number(expectedBounds.x)) && Number.isFinite(Number(expectedBounds.y))) {
    const dx = Number(actualBounds.x) - Number(expectedBounds.x);
    const dy = Number(actualBounds.y) - Number(expectedBounds.y);
    const distance = Math.sqrt(dx * dx + dy * dy);
    score += Math.max(0, 14 - Math.round(distance / 20));
  }

  return Math.max(0, Math.min(100, Math.round(score * 0.72 + Number(baseConfidence || 0) * 0.28)));
}

async function healingConfidenceForAttempt(step, attempt, locator) {
  const candidateConfidence =
    attempt.metadata?.quality && typeof attempt.metadata.quality === "object"
      ? Number(attempt.metadata.quality.confidence ?? 0)
      : 0;
  const baseConfidence = candidateConfidence || (attempt.source === "candidate" ? 82 : 76);
  const expected = expectedFingerprintForStep(step);
  const actual = await fingerprintForLocator(locator);
  return {
    confidenceScore: fingerprintConfidence(expected, actual, baseConfidence),
    elementFingerprint: actual,
  };
}

async function withLocatorFallback(session, page, step, index, context, timeout, actionName, run, options = {}) {
  const attempts = locatorAttemptsFor(page, step);
  const perAttemptTimeout = Math.max(1000, Math.min(timeout, 3000));
  const errors = [];
  let attemptedHealing = false;
  const originalLocator = eventLocator(attempts[0]) || originalLocatorForStep(step);
  const autoHeal = options.autoHeal ?? isAutoHealingAction(step.action);
  const waitState = options.waitState || "visible";
  const healingThreshold = Number(process.env.AUTOMATION_WORKER_HEALING_CONFIDENCE_THRESHOLD || 70);
  if (!autoHeal || isHighRiskStep(step)) {
    try {
      const locator = await resolveLocatorForAttempt(session, page, step, index, context, attempts[0]);
      await waitForLocatorReady(locator, step, index, timeout, actionName, waitState);
      await withCommandTimeout(run(locator, timeout, attempts[0]), timeout, step, index, actionName);
      return { ...attempts[0], healed: false };
    } catch (error) {
      if (!isAmbiguityError(error)) {
        pushEvent(session, "step.heal_not_applicable", healingEventPayload(session, step, index, context, {
          healReason: isHighRiskStep(step)
            ? "high-risk step requires explicit healing approval"
            : "action is not eligible for auto-healing",
          originalLocator,
        }));
      }
      throw error;
    }
  }
  for (const [attemptIndex, attempt] of attempts.entries()) {
    try {
      const locator = await resolveLocatorForAttempt(session, page, step, index, context, attempt);
      await waitForLocatorReady(locator, step, index, perAttemptTimeout, actionName, waitState);
      if (attemptIndex > 0) {
        const { confidenceScore, elementFingerprint } = await healingConfidenceForAttempt(step, attempt, locator);
        if (confidenceScore < healingThreshold) {
          errors.push(`${attempt.type}=${attempt.value}: low healing confidence ${confidenceScore}`);
          continue;
        }
        await withCommandTimeout(run(locator, perAttemptTimeout, attempt), perAttemptTimeout, step, index, actionName);
        if (!attemptedHealing) {
          pushEvent(session, "step.heal_attempted", healingEventPayload(session, step, index, context, {
            confidenceScore,
            healReason: "primary locator failed; trying ranked fallback locators",
            originalLocator,
          }));
        }
        const payload = healingEventPayload(session, step, index, context, {
          confidenceScore,
          elementFingerprint,
          fallbackUsed: eventLocator(attempt),
          healed: true,
          healedLocator: eventLocator(attempt),
          healReason: `${attempt.source || "fallback"} locator matched`,
          originalLocator,
          status: "not_reviewed",
        });
        pushEvent(session, "step.healed", payload);
        pushEvent(session, "step:self_healed", payload);
        return { ...attempt, healed: true, healing: payload };
      }
      await withCommandTimeout(run(locator, perAttemptTimeout, attempt), perAttemptTimeout, step, index, actionName);
      return { ...attempt, healed: false };
    } catch (error) {
      if (isAmbiguityError(error)) {
        throw error;
      }
      if (attemptIndex === 0 && attempts.length > 1) {
        attemptedHealing = true;
        pushEvent(session, "step.heal_attempted", healingEventPayload(session, step, index, context, {
          confidenceScore: null,
          healReason: "primary locator failed; trying ranked fallback locators",
          originalLocator,
        }));
      }
      errors.push(
        `${attempt.type}=${attempt.value}: ${
          error instanceof Error ? error.message.split("\n")[0] : "failed"
        }`,
      );
    }
  }
  if (options.emitFailure !== false) {
    pushEvent(session, "step.heal_failed", healingEventPayload(session, step, index, context, {
      confidenceScore: 0,
      healReason: `fallback locators failed: ${errors.join(" | ")}`,
      originalLocator,
      suggestedCandidates: attempts.slice(1, 6).map(eventLocator).filter(Boolean),
    }));
  }
  throw structuredStepError(step, index, new Error(`${actionName} failed. Tried ${errors.join(" | ")}`), actionName);
}

async function selfHealClick(page, step) {
  const healingThreshold = Number(process.env.AUTOMATION_WORKER_HEALING_CONFIDENCE_THRESHOLD || 70);
  const result = await page.evaluate((input) => {
    function normalized(value) {
      return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
    }

    function tokenScore(left, right) {
      const leftTokens = new Set(normalized(left).split(" ").filter((token) => token.length > 2));
      const rightTokens = new Set(normalized(right).split(" ").filter((token) => token.length > 2));
      if (!leftTokens.size || !rightTokens.size) return 0;
      let matches = 0;
      for (const token of leftTokens) if (rightTokens.has(token)) matches += 1;
      return Math.round((matches / Math.max(leftTokens.size, rightTokens.size)) * 40);
    }

    function visible(element) {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        rect.width > 0 &&
        rect.height > 0
      );
    }

    function textOf(element) {
      return String(
        element.getAttribute("aria-label") ||
          element.getAttribute("title") ||
          element.getAttribute("alt") ||
          element.textContent ||
          element.value ||
          "",
      ).trim();
    }

    function roleOf(element) {
      return element.getAttribute("role") || (element.tagName === "A" ? "link" : element.tagName === "BUTTON" ? "button" : "");
    }

    function locatorForElement(element, text) {
      const testId =
        element.getAttribute("data-testid") ||
        element.getAttribute("data-test") ||
        element.getAttribute("data-qa") ||
        element.getAttribute("data-cy");
      if (testId) return { type: "testid", value: testId };
      const ariaLabel = element.getAttribute("aria-label");
      if (ariaLabel) return { type: "role", value: `${roleOf(element) || "button"}:${ariaLabel}` };
      if (element.id) return { type: "css", value: `#${CSS.escape(element.id)}` };
      if (text) return { type: "text", value: text };
      return { type: "css", value: element.tagName.toLowerCase() };
    }

    function locatorMatchCount(locator) {
      if (!locator?.value) return 0;
      if (locator.type === "testid") {
        return Array.from(document.querySelectorAll("[data-testid],[data-test],[data-qa],[data-cy]"))
          .filter((element) =>
            element.getAttribute("data-testid") === locator.value ||
            element.getAttribute("data-test") === locator.value ||
            element.getAttribute("data-qa") === locator.value ||
            element.getAttribute("data-cy") === locator.value
          ).length;
      }
      if (locator.type === "css") {
        try {
          return document.querySelectorAll(locator.value).length;
        } catch {
          return 0;
        }
      }
      if (locator.type === "role") {
        const separator = locator.value.indexOf(":");
        const role = separator >= 0 ? normalized(locator.value.slice(0, separator)) : normalized(locator.value);
        const name = separator >= 0 ? normalized(locator.value.slice(separator + 1)) : "";
        return Array.from(document.querySelectorAll("*")).filter((element) => {
          if (normalized(roleOf(element)) !== role) return false;
          if (!name) return true;
          return normalized(textOf(element)) === name || normalized(textOf(element)).includes(name);
        }).length;
      }
      if (locator.type === "text") {
        const wanted = normalized(locator.value);
        return Array.from(document.querySelectorAll("a,button,input,textarea,select,summary,[role],[onclick],[tabindex]"))
          .filter((element) => normalized(textOf(element)) === wanted || normalized(textOf(element)).includes(wanted)).length;
      }
      return 0;
    }

    function candidatePreview(element, index, score) {
      const rect = element.getBoundingClientRect();
      const dataAttributes = {};
      for (const attribute of Array.from(element.attributes || [])) {
        if (attribute.name.startsWith("data-")) dataAttributes[attribute.name] = attribute.value;
      }
      const parent = element.parentElement;
      return {
        ariaLabel: element.getAttribute("aria-label") || "",
        bounds: {
          height: Math.round(rect.height),
          width: Math.round(rect.width),
          x: Math.round(rect.left),
          y: Math.round(rect.top),
        },
        className: element.getAttribute("class") || "",
        dataAttributes,
        index,
        parentSnippet: parent ? String(parent.innerText || parent.textContent || "").replace(/\s+/g, " ").trim().slice(0, 180) : "",
        role: roleOf(element),
        score,
        tag: element.tagName.toLowerCase(),
        text: textOf(element),
        visibility: visible(element) ? "visible" : "hidden",
      };
    }

    const labels = input.labels.map(normalized).filter(Boolean);
    const snapshot = input.snapshot || {};
    const snapshotText = normalized(snapshot.text || snapshot.ariaLabel || snapshot.labelText || "");
    const snapshotTag = normalized(snapshot.tag || snapshot.elementKind || "");
    const snapshotRole = normalized(snapshot.role || "");
    const snapshotData = snapshot.dataAttributes && typeof snapshot.dataAttributes === "object" ? snapshot.dataAttributes : {};
    const bounds = snapshot.bounds && typeof snapshot.bounds === "object" ? snapshot.bounds : null;
    const elements = Array.from(
      document.querySelectorAll("a,button,[role='button'],[role='link'],input[type='button'],input[type='submit'],summary,[onclick],[tabindex]"),
    ).filter(visible);

    const candidates = elements
      .map((element, index) => {
        const text = textOf(element);
        const normalizedText = normalized(text);
        const tag = normalized(element.tagName);
        const role = normalized(roleOf(element));
        const rect = element.getBoundingClientRect();
        let score = 0;
        let dataMatches = 0;

        for (const label of labels) {
          if (normalizedText === label) score += 100;
          else if (normalizedText.includes(label) || label.includes(normalizedText)) score += 60;
          else score += tokenScore(normalizedText, label);
        }

        if (snapshotText) {
          if (normalizedText === snapshotText) score += 80;
          else if (normalizedText.includes(snapshotText) || snapshotText.includes(normalizedText)) score += 45;
          else score += tokenScore(normalizedText, snapshotText);
        }
        if (snapshotTag && tag === snapshotTag) score += 18;
        if (snapshotRole && role === snapshotRole) score += 20;
        for (const [name, value] of Object.entries(snapshotData)) {
          if (value && element.getAttribute(name) === value) dataMatches += 1;
        }
        score += Math.min(30, dataMatches * 15);
        if (bounds && Number.isFinite(bounds.x) && Number.isFinite(bounds.y)) {
          const dx = rect.left - bounds.x;
          const dy = rect.top - bounds.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          score += Math.max(0, 45 - Math.round(distance / 8));
        }

        return {
          ...candidatePreview(element, index, score),
          index,
          label: text || `${element.tagName.toLowerCase()} ${index + 1}`,
          score,
        };
      })
      .sort((left, right) => right.score - left.score);

    const best = candidates[0];
    if (!best || best.score < input.healingThreshold) {
      return {
        candidates: candidates.slice(0, 5),
        clicked: false,
        reason: labels.length || snapshotText || bounds ? "no confident visible match" : "no stable locator signal",
      };
    }

    const runnerUp = candidates[1];
    if (runnerUp && runnerUp.score >= input.healingThreshold && runnerUp.score >= best.score - 15) {
      return {
        ambiguous: true,
        candidates: candidates.slice(0, 5),
        clicked: false,
        reason: "ambiguous healing candidates",
      };
    }

    const element = elements[best.index];
    const healedLocator = locatorForElement(element, best.label);
    const locatorMatches = locatorMatchCount(healedLocator);
    const adjustedScore = locatorMatches > 1 ? best.score - 30 : best.score;
    if (adjustedScore < input.healingThreshold || (locatorMatches > 1 && adjustedScore < 90)) {
      return {
        ambiguous: true,
        candidates: candidates.slice(0, 5),
        clicked: false,
        healedLocator,
        locatorMatches,
        reason: "healed locator is still ambiguous",
        score: adjustedScore,
      };
    }
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return {
      ambiguous: locatorMatches > 1,
      candidates: candidates.slice(0, 5),
      clicked: true,
      healedLocator,
      label: best.label,
      locatorMatches,
      reason: `matched ${best.tag}${best.role ? `/${best.role}` : ""}`,
      score: adjustedScore,
    };
  }, {
    healingThreshold,
    labels: [
      stableLabel(step.target?.displayName),
      stableLabel(step.target?.value),
      stableLabel(step.commandText),
      stableLabel(step.description),
      stableLabel(step.element?.text),
      stableLabel(step.element?.ariaLabel),
      stableLabel(step.element?.labelText),
    ].filter(Boolean),
    snapshot: step.element || {},
  }).catch((error) => ({
    clicked: false,
    reason: error instanceof Error ? error.message : "self-heal scan failed",
  }));

  return result && typeof result === "object" ? result : { clicked: false, reason: "self-heal scan failed" };
}

async function locatorInputValue(locator) {
  if (!locator || typeof locator.evaluate !== "function") return null;
  return locator.evaluate((element) => {
    const tag = String(element.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") {
      return String(element.value ?? "");
    }
    if (element.isContentEditable) return String(element.textContent || "");
    return null;
  }).catch(() => null);
}

async function fillLocatorWithTypingFallback(locator, value, timeout) {
  const text = String(value ?? "");
  await locator.fill(text, { timeout });
  const actual = await locatorInputValue(locator);
  if (actual === null || actual === text || text === "") return;
  if (typeof locator.click === "function") {
    await locator.click({ timeout }).catch(() => undefined);
  }
  if (typeof locator.pressSequentially === "function") {
    await locator.pressSequentially(text, { timeout });
  } else {
    throw new Error("Fill did not update the field and typing fallback is unavailable.");
  }
  const typedActual = await locatorInputValue(locator);
  if (typedActual !== null && typedActual !== text) {
    throw new Error(`Fill did not update the field. Expected "${text}", found "${typedActual}".`);
  }
}

async function executeStep(session, step, index, context = {}) {
  const startedAt = now();
  const startedMs = Date.now();
  const page = await activatePageForStep(session, step, "step");
  if (!page) throw new Error("Session has no active page.");
  const action = step.action;
  const options = step.options || {};
  const timeout = commandTimeoutMs(step);
  const inputValue = step.inputValue ?? "";
  const expectedValue = step.expectedValue ?? "";
  let healingDetails = null;

  pushEvent(session, "step:start", {
    action,
    actionId: context.actionId || null,
    description: step.description || action,
    index,
    runId: context.runId || null,
    stepId: step.id || null,
  });

  if (action === "goto") {
    const destination = normalizeUrl(inputValue || step.target?.value);
    if (!destination) throw new Error("Navigate command is missing a URL.");
    if (comparableUrl(page.url()) !== comparableUrl(destination)) {
      await withCommandTimeout(gotoWithLoopbackFallback(page, destination, {
        timeout,
        waitUntil: "domcontentloaded",
      }), timeout + 1000, step, index, "Navigate");
    }
  } else if (action === "navigate") {
    const destination = normalizeUrl(inputValue || step.target?.value);
    if (!destination) throw new Error("Navigate command is missing a URL.");
    if (comparableUrl(page.url()) !== comparableUrl(destination)) {
      await withCommandTimeout(gotoWithLoopbackFallback(page, destination, {
        timeout,
        waitUntil: "domcontentloaded",
      }), timeout + 1000, step, index, "Navigate");
    }
  } else if (action === "switchPage") {
    const hints = stepPageHints(step);
    const expectedUrl = comparableUrl(inputValue || hints.pageUrl || step.target?.value);
    if (expectedUrl && comparableUrl(page.url?.() || "") !== expectedUrl) {
      throw new Error(`Could not switch to the recorded tab/window ${inputValue || hints.pageUrl || step.target?.value}.`);
    }
    if (typeof page.bringToFront === "function") {
      await page.bringToFront().catch(() => undefined);
    }
  } else if (action === "reload") {
    await withCommandTimeout(page.reload({ timeout, waitUntil: "domcontentloaded" }), timeout + 1000, step, index, "Reload");
  } else if (action === "waitForTimeout") {
    await page.waitForTimeout(Number(inputValue || options.duration || 1000));
  } else if (action === "wait") {
    const waitType = String(options.waitType || (step.target?.value ? "soft" : "hard")).toLowerCase();
    if (waitType === "soft" && step.target?.value) {
      const locator = await primaryResolvedLocator(session, page, step, index, context);
      const state = ["attached", "detached", "hidden", "visible"].includes(String(options.waitCondition))
        ? String(options.waitCondition)
        : "visible";
      await locator.waitFor({ state, timeout });
    } else {
      await page.waitForTimeout(Number(inputValue || options.duration || 1000));
    }
  } else if (action === "coordinateClick") {
    await page.mouse.click(Number(options.x || 0), Number(options.y || 0));
  } else if (action === "scroll") {
    await page.mouse.wheel(0, Number(inputValue || options.deltaY || 600));
  } else {
    if (action === "click") {
      try {
        const attempt = await withLocatorFallback(session, page, step, index, context, timeout, "Click", (locator, fallbackTimeout) =>
          locator.click({ timeout: fallbackTimeout, force: Boolean(options.force) }),
          { emitFailure: false },
        );
        if (attempt.healed) healingDetails = attempt.healing;
      } catch (error) {
        if (isAmbiguityError(error)) throw error;
        if (isHighRiskStep(step)) throw error;
        pushEvent(session, "step.heal_attempted", healingEventPayload(session, step, index, context, {
          confidenceScore: null,
          healReason: "ranked locator fallback failed; scanning visible DOM candidates",
          originalLocator: originalLocatorForStep(step),
        }));
        const healing = await selfHealClick(page, step);
        const healingThreshold = Number(process.env.AUTOMATION_WORKER_HEALING_CONFIDENCE_THRESHOLD || 70);
        if (healing.clicked && Number(healing.score || 0) >= healingThreshold) {
          healingDetails = healingEventPayload(session, step, index, context, {
            confidenceScore: Number(healing.score || 0),
            fallbackUsed: { source: "dom-scan", type: healing.healedLocator?.type || "text", value: healing.healedLocator?.value || healing.label || "" },
            healed: true,
            healedLocator: healing.healedLocator || { type: "text", value: healing.label || "" },
            healReason: healing.reason || "dom-scan",
            label: healing.label || "",
            originalLocator: originalLocatorForStep(step),
            status: "not_reviewed",
          });
          pushEvent(session, "step.healed", healingDetails);
          pushEvent(session, "step:self_healed", healingDetails);
          await page.waitForTimeout(250);
        } else {
          const candidates = Array.isArray(healing.candidates)
            ? healing.candidates.map((candidate) => `${candidate.label || candidate.tag || "element"} (${candidate.score ?? 0})`).join(", ")
            : "";
          pushEvent(session, "step.heal_failed", healingEventPayload(session, step, index, context, {
            confidenceScore: 0,
            healReason: healing.reason || "no confident visible match",
            originalLocator: originalLocatorForStep(step),
            suggestedCandidates: healing.candidates || [],
          }));
          throw new Error(
            `${error instanceof Error ? error.message : "Click failed."} Self-healing could not find a confident match${
              healing.reason ? `: ${healing.reason}` : ""
            }${candidates ? `. Closest matches: ${candidates}` : ""}.`,
          );
        }
      }
    } else if (action === "doubleClick") {
      await withLocatorFallback(session, page, step, index, context, timeout, "Double click", (locator, fallbackTimeout) =>
        locator.dblclick({ timeout: fallbackTimeout, force: Boolean(options.force) }),
      );
    } else if (action === "rightClick") {
      await withLocatorFallback(session, page, step, index, context, timeout, "Right click", (locator, fallbackTimeout) =>
        locator.click({ button: "right", timeout: fallbackTimeout, force: Boolean(options.force) }),
      );
    } else if (action === "hover") {
      const attempt = await withLocatorFallback(session, page, step, index, context, timeout, "Hover", (locator, fallbackTimeout) =>
        locator.hover({ timeout: fallbackTimeout }),
      );
      if (attempt.healed) healingDetails = attempt.healing;
    } else if (action === "scrollIntoView") {
      await withLocatorFallback(session, page, step, index, context, timeout, "Scroll into view", (locator, fallbackTimeout) =>
        locator.scrollIntoViewIfNeeded({ timeout: fallbackTimeout }),
      );
    } else if (action === "fill") {
      const fillValue = String(inputValue ?? "");
      if (!fillValue && step.options?.parameterName) {
        throw structuredStepError(
          step,
          index,
          new Error(`Test data parameter "${step.options.parameterName}" resolved to an empty value.`),
          "Fill",
        );
      }
      const attempt = await withLocatorFallback(session, page, step, index, context, timeout, "Fill", (locator, fallbackTimeout) =>
        fillLocatorWithTypingFallback(locator, fillValue, fallbackTimeout),
      );
      if (attempt.healed) healingDetails = attempt.healing;
    } else if (action === "clear") {
      await withLocatorFallback(session, page, step, index, context, timeout, "Clear", (locator, fallbackTimeout) =>
        locator.clear({ timeout: fallbackTimeout }),
      );
    } else if (action === "type") {
      const attempt = await withLocatorFallback(session, page, step, index, context, timeout, "Type", (locator, fallbackTimeout) =>
        locator.pressSequentially(String(inputValue), { timeout: fallbackTimeout }),
      );
      if (attempt.healed) healingDetails = attempt.healing;
    } else if (action === "press") {
      const attempt = await withLocatorFallback(session, page, step, index, context, timeout, "Press", (locator, fallbackTimeout) =>
        locator.press(String(inputValue || "Enter"), { timeout: fallbackTimeout }),
      );
      if (attempt.healed) healingDetails = attempt.healing;
    } else if (action === "select") {
      const attempt = await withLocatorFallback(session, page, step, index, context, timeout, "Select", (locator, fallbackTimeout) =>
        locator.selectOption(String(inputValue), { timeout: fallbackTimeout }),
      );
      if (attempt.healed) healingDetails = attempt.healing;
    } else if (action === "check") {
      await withLocatorFallback(session, page, step, index, context, timeout, "Check", (locator, fallbackTimeout) =>
        locator.check({ timeout: fallbackTimeout, force: Boolean(options.force) }),
      );
    } else if (action === "uncheck") {
      await withLocatorFallback(session, page, step, index, context, timeout, "Uncheck", (locator, fallbackTimeout) =>
        locator.uncheck({ timeout: fallbackTimeout, force: Boolean(options.force) }),
      );
    } else if (action === "waitForElement") {
      const locator = await primaryResolvedLocator(session, page, step, index, context);
      await waitForLocatorReady(locator, step, index, timeout, "Wait for element", "visible");
    }
    else if (action === "assert") {
      const assertion = step.assertionType || "";
      if (assertion === "text_equals") {
        const locator = await primaryResolvedLocator(session, page, step, index, context);
        await waitForLocatorReady(locator, step, index, timeout, "Verify text", "visible");
        const text = (await locator.innerText({ timeout })).replace(/\s+/g, " ").trim();
        if (text !== String(expectedValue).replace(/\s+/g, " ").trim()) {
          throw new Error(`Expected text to equal ${expectedValue}, but found ${text}.`);
        }
      } else if (assertion.includes("text")) {
        const locator = await primaryResolvedLocator(session, page, step, index, context);
        await waitForLocatorReady(locator, step, index, timeout, "Verify text", "visible");
        const text = await locator.innerText({ timeout });
        if (!text.includes(String(expectedValue))) {
          throw new Error(`Expected text to include ${expectedValue}.`);
        }
      } else if (assertion === "image_loaded") {
        const locator = await primaryResolvedLocator(session, page, step, index, context);
        await waitForLocatorReady(locator, step, index, timeout, "Verify image", "visible");
        const imageState = await locator.evaluate((element) => {
          const style = window.getComputedStyle(element);
          const tag = element.tagName ? element.tagName.toLowerCase() : "";
          const backgroundImage = style.getPropertyValue("background-image");
          if (tag === "img") {
            return {
              complete: Boolean(element.complete),
              loaded: Boolean(element.complete && element.naturalWidth > 0 && element.naturalHeight > 0),
              naturalHeight: Number(element.naturalHeight || 0),
              naturalWidth: Number(element.naturalWidth || 0),
              src: element.currentSrc || element.src || "",
            };
          }
          return {
            backgroundImage,
            loaded: Boolean(backgroundImage && backgroundImage !== "none"),
          };
        }, { timeout });
        if (!imageState?.loaded) {
          throw new Error("Expected image to be loaded and visible.");
        }
      } else if (assertion === "css_property") {
        const locator = await primaryResolvedLocator(session, page, step, index, context);
        await waitForLocatorReady(locator, step, index, timeout, "Verify CSS property", "visible");
        const property = String(options.property || options.cssProperty || "").trim();
        const operator = String(options.operator || "equals");
        const expected = String(expectedValue || options.expected || "").trim();
        if (!property) throw new Error("CSS assertion is missing a property.");
        const actual = String(
          await locator.evaluate((element, cssProperty) => {
            return window.getComputedStyle(element).getPropertyValue(cssProperty);
          }, property),
        ).trim();
        const passed = operator === "contains" ? actual.includes(expected) : actual === expected;
        if (!passed) {
          throw new Error(`Expected ${property} ${operator} ${expected}, but found ${actual}.`);
        }
      } else if (assertion.includes("hidden")) {
        const locator = await primaryResolvedLocator(session, page, step, index, context);
        await waitForLocatorReady(locator, step, index, timeout, "Verify hidden", "hidden");
      } else {
        const locator = await primaryResolvedLocator(session, page, step, index, context);
        await waitForLocatorReady(locator, step, index, timeout, "Verify visible", "visible");
      }
    } else {
      throw new Error(`Action ${action} is not supported by the worker.`);
    }
  }

  const endedAt = now();
  const result = {
    durationMs: Date.now() - startedMs,
    endedAt,
    errorMessage: "",
    errorType: "",
    screenshotPath: null,
    startedAt,
    status: "passed",
    stepId: step.id || null,
    suggestion: "",
  };
  pushEvent(session, "step:success", {
    action,
    actionId: context.actionId || null,
    description: step.description || step.commandText || action,
    healed: Boolean(healingDetails),
    healingDetails,
    index,
    runId: context.runId || null,
    result,
    stepId: step.id || null,
    url: page.url(),
  });
  return result;
}

async function closeSession(session) {
  session.status = "terminating";
  session.updatedAt = now();
  if (session.pendingAmbiguity?.reject) {
    session.pendingAmbiguity.reject(ambiguityError("Browser session closed while waiting for locator choice.", session.pendingAmbiguity));
  }
  await session.context?.close?.().catch(() => undefined);
  await session.browser?.close?.().catch(() => undefined);
  session.status = "terminated";
  session.updatedAt = now();
}

async function captureFailureScreenshot(session, runId, step) {
  const page = session.page;
  if (!page || typeof page.screenshot !== "function") return null;
  try {
    await page.screenshot({ fullPage: true, type: "png" });
    return `automation://sessions/${session.id}/runs/${runId}/steps/${step?.id || "unknown"}/failure.png`;
  } catch {
    return null;
  }
}

function failedStepResult(step, startedAt, startedMs, error, screenshotPath = null) {
  const errorType = error?.errorType || error?.code || (isLocatorTimeoutError(error) ? "ELEMENT_NOT_READY" : "COMMAND_FAILED");
  return {
    durationMs: Date.now() - startedMs,
    endedAt: now(),
    errorMessage: error instanceof Error ? error.message : "Step failed.",
    errorType,
    screenshotPath,
    startedAt,
    status: "failed",
    stepId: step?.id || null,
    suggestion:
      error?.suggestion ||
      (errorType === "ELEMENT_NOT_READY"
        ? missingPrerequisiteSuggestion(step?.action || "")
        : "Review the failed command details and retry after the page is in the expected state."),
  };
}

function normalizeParameterData(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, item == null ? "" : String(item)]),
  );
}

function substituteTemplateValue(value, parameterData) {
  if (typeof value !== "string") return value;
  return value.replace(/\{\{\s*([a-zA-Z_][\w.-]*)\s*\}\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(parameterData, name) ? parameterData[name] : match,
  );
}

function substituteParameterValue(value, parameterData) {
  if (typeof value === "string") return substituteTemplateValue(value, parameterData);
  if (Array.isArray(value)) return value.map((item) => substituteParameterValue(item, parameterData));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, substituteParameterValue(item, parameterData)]),
    );
  }
  return value;
}

function substituteStepParameters(step, parameterData) {
  if (!step || typeof step !== "object") return step;
  return substituteParameterValue(step, parameterData);
}

function touchSession(session) {
  session.lastActivityAt = now();
  session.idleExpiresAt = new Date(Date.now() + (session.idleTimeoutMs || defaultIdleTimeoutMs)).toISOString();
  session.updatedAt = session.lastActivityAt;
}

function isSessionUsable(session) {
  return Boolean(session.browser && session.context && session.page && !session.page.isClosed?.());
}

async function setRecorderMode(session, mode) {
  const nextMode = mode === "verify" ? "verify" : mode === "off" ? "off" : "record";
  session.recorderMode = nextMode;
  touchSession(session);
  if (typeof session.page?.evaluate === "function") {
    if (nextMode === "off") {
      await applyRecorderModeToActivePage(session, "mode_change");
    } else {
      await installRecorder(session);
      await applyRecorderModeToActivePage(session, "mode_change");
    }
  }
  pushEvent(session, "recorder:mode", { mode: nextMode });
  return nextMode;
}

export function createPlaywrightWorkerServer({
  baseUrl,
  browserLauncher,
  host = defaultHost,
  port = defaultPort,
} = {}) {
  if (!browserLauncher?.launch) {
    throw new Error("A Playwright browser launcher is required.");
  }

  const sessions = new Map();
  const configuredBaseUrl =
    baseUrl || process.env.AUTOMATION_WORKER_PUBLIC_URL?.replace(/\/$/, "") || "";

  async function createSession(payload) {
    const id = createId("session");
    const createdAt = now();
    const idleTimeoutMs = Number(payload.idleTimeoutMs || defaultIdleTimeoutMs);
    const hardTimeoutMs = Number(payload.hardTimeoutMs || defaultHardTimeoutMs);
    const effectiveHeadless =
      typeof payload.headless === "boolean"
        ? payload.headless
        : process.env.AUTOMATION_WORKER_HEADLESS !== "false";
    const session = {
      browser: null,
      capabilities: {
        eventStream: true,
        liveView: "placeholder",
        networkCapture: true,
        playwright: true,
        trace: true,
        video: true,
      },
      context: null,
      createdAt,
      events: [],
      executionMode: payload.executionMode === "ephemeral_ci" ? "ephemeral_ci" : "interactive_persistent",
      hardExpiresAt: new Date(Date.now() + hardTimeoutMs).toISOString(),
      hardTimeoutMs,
      id,
      idleExpiresAt: new Date(Date.now() + idleTimeoutMs).toISOString(),
      idleTimeoutMs,
      lastActivityAt: createdAt,
      lastRunId: "",
      lockedRunId: "",
      lastRecordedPageSwitchId: "",
      metadata: {
        browserMode: effectiveHeadless ? "headless" : "headed",
        headless: effectiveHeadless,
        projectId: payload.projectId || "",
        scenarioId: payload.scenarioId || "",
      },
      page: null,
      lastRecordedUrl: "",
      pendingAmbiguity: null,
      activePageId: "",
      activePageUrl: "",
      pageIds: new WeakMap(),
      pagesById: new Map(),
      pageMetadata: new Map(),
      instrumentedPages: new WeakSet(),
      recorderBindings: new WeakSet(),
      recorderInitScripts: new WeakSet(),
      recorderNavigationPages: new WeakSet(),
      recorderMode: "off",
      suppressRecording: false,
      status: "creating",
      targetUrl: normalizeUrl(payload.targetUrl),
      updatedAt: createdAt,
    };
    sessions.set(id, session);
    pushEvent(session, "session:starting");

    try {
      session.browser = await browserLauncher.launch({
        channel: process.env.AUTOMATION_WORKER_BROWSER_CHANNEL || undefined,
        headless: effectiveHeadless,
      });
      session.context = await session.browser.newContext({
        acceptDownloads: true,
        viewport: { height: 720, width: 1280 },
      });
      session.context.on?.("page", (page) => {
        void activateSessionPage(session, page, "new_page");
      });
      session.page = await session.context.newPage();
      await activateSessionPage(session, session.page, "initial");

      if (session.targetUrl) {
        await gotoWithLoopbackFallback(session.page, session.targetUrl, {
          timeout: 30000,
          waitUntil: "domcontentloaded",
        });
      }

      touchSession(session);
      session.status = "idle";
      session.updatedAt = now();
      pushEvent(session, "session:ready", { url: session.page.url() });
      return session;
    } catch (error) {
      session.status = "broken";
      session.updatedAt = now();
      pushEvent(session, "session:failed", {
        error: error instanceof Error ? error.message : "Session failed.",
      });
      await closeSession(session);
      session.status = "broken";
      throw error;
    }
  }

  async function runSession(session, payload) {
    if (!session.page) throw new Error("Session has no active page.");
    const parameterData = normalizeParameterData(payload.parameterData);
    const steps = Array.isArray(payload.steps)
      ? payload.steps.map((step) => substituteStepParameters(step, parameterData))
      : [];
    const runId = payload.runId || createId("run");
    const commandDelayMs = interCommandDelayMs(payload);
    const previousSuppressRecording = session.suppressRecording;
    session.lockedRunId = runId;
    session.lastRunId = runId;
    session.status = "running";
    session.suppressRecording = Boolean(payload.suppressRecording);
    touchSession(session);
    pushEvent(session, "run:start", {
      actionId: payload.actionId || null,
      executionMode: payload.executionMode || session.executionMode,
      runId,
      stepCount: steps.length,
    });

    const stepResults = [];
    try {
      for (const [index, step] of steps.entries()) {
        const stepStartedAt = now();
        const stepStartedMs = Date.now();
        try {
          const result = await executeStep(session, step, index, {
            actionId: payload.actionId || (typeof step?.options?.sourceActionId === "string" ? step.options.sourceActionId : null),
            runId,
          });
          stepResults.push(result);
          if (commandDelayMs > 0 && index < steps.length - 1) {
            pushEvent(session, "step:delay", {
              actionId: payload.actionId || (typeof step?.options?.sourceActionId === "string" ? step.options.sourceActionId : null),
              durationMs: commandDelayMs,
              index,
              nextIndex: index + 1,
              runId,
              stepId: step?.id || null,
            });
            await session.page?.waitForTimeout?.(commandDelayMs);
          }
        } catch (error) {
          const structuredError =
            error?.code === "ELEMENT_NOT_READY" || error?.code === "COMMAND_FAILED"
              ? error
              : structuredStepError(step, index, error, step?.action || "Command");
          const screenshotPath = await captureFailureScreenshot(session, runId, step);
          const result = failedStepResult(step, stepStartedAt, stepStartedMs, structuredError, screenshotPath);
          stepResults.push(result);
          pushEvent(session, "step:failed", {
            action: step?.action || "",
            actionId: payload.actionId || (typeof step?.options?.sourceActionId === "string" ? step.options.sourceActionId : null),
            description: step?.description || step?.commandText || step?.action || "",
            error: result.errorMessage,
            errorMessage: result.errorMessage,
            errorType: result.errorType,
            index,
            result,
            runId,
            screenshotPath,
            stepId: step?.id || null,
            suggestion: result.suggestion,
          });
          throw structuredError;
        }
      }
      session.status = "completed";
      touchSession(session);
      pushEvent(session, "run:success", {
        actionId: payload.actionId || null,
        currentUrl: session.page?.url?.() || "",
        runId,
        stepResults,
      });
    } catch (error) {
      session.status = "failed";
      touchSession(session);
      pushEvent(session, "run:failed", {
        actionId: payload.actionId || null,
        error: error instanceof Error ? error.message : "Run failed.",
        errorType: error?.errorType || error?.code || "RUN_FAILED",
        recoverable: isSessionUsable(session),
        runId,
        stepResults,
        suggestion: error?.suggestion || "Fix the failed step, then retry or resume from the previous step.",
      });
    } finally {
      session.lockedRunId = "";
      session.suppressRecording = previousSuppressRecording;
      const shouldClose =
        payload.keepSessionOpen === true
          ? false
          : payload.closeOnComplete === true || payload.executionMode === "ephemeral_ci";
      if (shouldClose) {
        await closeSession(session);
        pushEvent(session, "session:closed", { reason: "run_complete", runId });
      }
    }
  }

  const server = http.createServer((request, response) => {
    void (async () => {
      const currentBaseUrl = requestBaseUrl(request, configuredBaseUrl);
      const url = new URL(request.url || "/", currentBaseUrl);
      const path = url.pathname;

      if (request.method === "OPTIONS") {
        json(response, 204, {});
        return;
      }

      if (request.method === "GET" && path === "/health") {
        json(response, 200, {
          activeSessions: Array.from(sessions.values()).filter(
            (session) => !["terminated", "broken"].includes(session.status),
          ).length,
          ok: true,
          service: "caseforge-playwright-worker",
        });
        return;
      }

      if (request.method === "POST" && path === "/sessions") {
        const session = await createSession(await readJson(request));
        json(response, 201, publicSession(session, currentBaseUrl));
        return;
      }

      const sessionMatch = path.match(/^\/sessions\/([^/]+)$/);
      if (sessionMatch && request.method === "GET") {
        const session = sessions.get(decodeURIComponent(sessionMatch[1]));
        if (!session) {
          json(response, 404, { error: "Session not found." });
          return;
        }
        json(response, 200, publicSession(session, currentBaseUrl));
        return;
      }

      if (sessionMatch && request.method === "DELETE") {
        const session = sessions.get(decodeURIComponent(sessionMatch[1]));
        if (!session) {
          json(response, 404, { error: "Session not found." });
          return;
        }
        await closeSession(session);
        sessions.delete(session.id);
        json(response, 200, { ok: true, sessionId: session.id, status: "terminated" });
        return;
      }

      const keepaliveMatch = path.match(/^\/sessions\/([^/]+)\/keepalive$/);
      if (keepaliveMatch && request.method === "POST") {
        const session = sessions.get(decodeURIComponent(keepaliveMatch[1]));
        if (!session) {
          json(response, 404, { error: "Session not found." });
          return;
        }
        touchSession(session);
        json(response, 200, publicSession(session, currentBaseUrl));
        return;
      }

      const recorderModeMatch = path.match(/^\/sessions\/([^/]+)\/recorder-mode$/);
      if (recorderModeMatch && request.method === "POST") {
        const session = sessions.get(decodeURIComponent(recorderModeMatch[1]));
        if (!session) {
          json(response, 404, { error: "Session not found." });
          return;
        }
        if (!isSessionUsable(session)) {
          session.status = "broken";
          json(response, 409, {
            code: "SESSION_BROKEN",
            error: "SESSION_BROKEN",
            message: "This browser session is no longer usable.",
          });
          return;
        }
        const payload = await readJson(request);
        await setRecorderMode(session, payload.mode);
        json(response, 200, publicSession(session, currentBaseUrl));
        return;
      }

      const testLocatorMatch = path.match(/^\/sessions\/([^/]+)\/test-locator$/);
      if (testLocatorMatch && request.method === "POST") {
        const session = sessions.get(decodeURIComponent(testLocatorMatch[1]));
        if (!session) {
          json(response, 404, { error: "Session not found." });
          return;
        }
        if (!isSessionUsable(session)) {
          session.status = "broken";
          json(response, 409, {
            code: "SESSION_BROKEN",
            error: "SESSION_BROKEN",
            message: "This browser session is no longer usable.",
          });
          return;
        }
        const payload = await readJson(request);
        const result = await testLocatorForSession(session, payload);
        touchSession(session);
        json(response, 200, result);
        return;
      }

      const resolveAmbiguityMatch = path.match(/^\/sessions\/([^/]+)\/resolve-ambiguity$/);
      if (resolveAmbiguityMatch && request.method === "POST") {
        const session = sessions.get(decodeURIComponent(resolveAmbiguityMatch[1]));
        if (!session) {
          json(response, 404, { error: "Session not found." });
          return;
        }
        const pending = session.pendingAmbiguity;
        if (!pending?.resolve) {
          json(response, 409, {
            code: "NO_PENDING_AMBIGUITY",
            error: "NO_PENDING_AMBIGUITY",
            message: "This session is not waiting for a locator choice.",
          });
          return;
        }
        const payload = await readJson(request);
        const selectedIndex = Number(payload.selectedIndex);
        if (!Number.isInteger(selectedIndex) || selectedIndex < 0) {
          json(response, 400, { error: "Select a valid element instance." });
          return;
        }
        if (payload.runId && pending.runId && payload.runId !== pending.runId) {
          json(response, 409, { error: "Locator choice belongs to a different run." });
          return;
        }
        if (payload.stepId && pending.stepId && payload.stepId !== pending.stepId) {
          json(response, 409, { error: "Locator choice belongs to a different command." });
          return;
        }
        pending.resolve({
          resolutionMethod: payload.resolutionMethod || "index",
          selectedIndex,
        });
        touchSession(session);
        pushEvent(session, "step.ambiguity_choice_saved", {
          actionId: pending.actionId || null,
          index: pending.index,
          locator: pending.locator,
          matchCount: pending.matchCount,
          resolutionMethod: payload.resolutionMethod || "index",
          runId: pending.runId || null,
          selectedIndex,
          stepId: pending.stepId || null,
        });
        json(response, 200, {
          ok: true,
          selectedIndex,
          sessionId: session.id,
          status: session.status,
        });
        return;
      }

      const runMatch = path.match(/^\/sessions\/([^/]+)\/run$/);
      if (runMatch && request.method === "POST") {
        const session = sessions.get(decodeURIComponent(runMatch[1]));
        if (!session) {
          json(response, 404, { error: "Session not found." });
          return;
        }
        const payload = await readJson(request);
        if (session.status === "running" || session.lockedRunId) {
          json(response, 409, {
            code: "SESSION_BUSY",
            error: "SESSION_BUSY",
            message: "This browser session is already running an action.",
            runId: session.lockedRunId || null,
          });
          return;
        }
        if (!isSessionUsable(session)) {
          session.status = "broken";
          json(response, 409, {
            code: "SESSION_BROKEN",
            error: "SESSION_BROKEN",
            message: "This browser session is no longer usable.",
          });
          return;
        }
        const acceptedRunId = payload.runId || createId("run");
        payload.runId = acceptedRunId;
        void runSession(session, payload);
        json(response, 202, {
          eventStreamUrl: makeSessionUrls(currentBaseUrl, session.id).eventStreamUrl,
          runId: acceptedRunId,
          sessionId: session.id,
          status: "running",
        });
        return;
      }

      const liveMatch = path.match(/^\/sessions\/([^/]+)\/live$/);
      if (liveMatch && request.method === "GET") {
        const session = sessions.get(decodeURIComponent(liveMatch[1]));
        if (!session) {
          html(response, 404, "<!doctype html><title>Session not found</title>");
          return;
        }
        html(
          response,
          200,
          `<!doctype html><title>CaseForge Live View</title><body style="font-family:system-ui;margin:24px"><h1>Live view placeholder</h1><p>Session ${session.id} is ${session.status}.</p><p>Attach a streaming/VNC/CDP viewer here when the worker is deployed with live browser viewing.</p></body>`,
        );
        return;
      }

      const eventsMatch = path.match(/^\/sessions\/([^/]+)\/events$/);
      if (eventsMatch && request.method === "GET") {
        const session = sessions.get(decodeURIComponent(eventsMatch[1]));
        if (!session) {
          json(response, 404, { error: "Session not found." });
          return;
        }
        json(response, 200, {
          events: session.events,
          sessionId: session.id,
          status: session.status,
        });
        return;
      }

      json(response, 404, { error: "Not found." });
    })().catch((error) => {
      json(response, 500, {
        error:
          error instanceof Error
            ? error.message
            : "Playwright worker request failed.",
      });
    });
  });

  const sweepTimer = setInterval(() => {
    const currentTime = Date.now();
    for (const session of sessions.values()) {
      if (["running", "terminating", "terminated", "broken"].includes(session.status)) continue;
      const idleExpired = session.idleExpiresAt && Date.parse(session.idleExpiresAt) <= currentTime;
      const hardExpired = session.hardExpiresAt && Date.parse(session.hardExpiresAt) <= currentTime;
      if (idleExpired || hardExpired) {
        void closeSession(session).then(() => {
          sessions.delete(session.id);
        });
      }
    }
  }, 15000);
  sweepTimer.unref?.();

  return {
    close: () =>
      Promise.all(
        Array.from(sessions.values()).map((session) => closeSession(session)),
      ).then(
        () => {
          clearInterval(sweepTimer);
          return new Promise((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
          });
        },
      ),
    listen: (listenPort = port, listenHost = host) =>
      new Promise((resolve) => {
        server.listen(listenPort, listenHost, () => resolve(server));
      }),
    server,
    sessions,
  };
}
