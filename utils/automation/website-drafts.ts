import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { generateCaseForgeAiText } from "../ai/caseforge-ai";
import type {
  AutomationLocatorCandidate,
  AutomationLocatorStrategy,
  AutomationStep,
} from "./types";

type WebsiteCoverageDepth = "basic" | "standard" | "thorough";
type WebsiteGenerationMode =
  | "functional"
  | "negative"
  | "edge"
  | "ui"
  | "api"
  | "regression"
  | "security"
  | "accessibility"
  | "salesforce";

type WebsiteElementSnapshot = {
  id: string;
  kind: string;
  tag: string;
  role: string;
  name: string;
  text: string;
  href: string;
  inputType: string;
  placeholder: string;
  required: boolean;
  disabled: boolean;
  locatorCandidates: AutomationLocatorCandidate[];
  attributes: Record<string, string>;
};

type WebsiteFormSnapshot = {
  id: string;
  name: string;
  fields: WebsiteElementSnapshot[];
  buttons: WebsiteElementSnapshot[];
};

export type WebsiteInspectionSnapshot = {
  requestedUrl: string;
  finalUrl: string;
  title: string;
  component: string;
  rootSelector: string;
  rootDescription: string;
  headings: string[];
  visibleText: string;
  elements: WebsiteElementSnapshot[];
  forms: WebsiteFormSnapshot[];
  stats: {
    buttons: number;
    links: number;
    fields: number;
    images: number;
    forms: number;
  };
};

export type GeneratedWebsiteAutomationDraft = {
  name: string;
  description: string;
  confidence: number;
  warnings: string[];
  tags: string[];
  steps: AutomationStep[];
};

type AiWebsiteStep = {
  action?: string;
  description?: string;
  commandText?: string;
  elementId?: string;
  locator?: string;
  locatorType?: string;
  text?: string;
  value?: string;
  expectedText?: string;
  expectedValue?: string;
  matchType?: string;
  durationMs?: number;
};

type AiWebsiteScenario = {
  name?: string;
  description?: string;
  confidence?: number;
  warnings?: string[];
  tags?: string[];
  steps?: AiWebsiteStep[];
};

type AiWebsiteResponse = {
  scenarios?: AiWebsiteScenario[];
};

const SUPPORTED_ACTIONS = new Set([
  "navigate",
  "click",
  "fill",
  "type",
  "select",
  "assert",
  "assertText",
  "verifyPageText",
  "getText",
  "getElementCount",
  "compareValues",
  "wait",
  "logMessage",
]);

const LOCATOR_STRATEGIES = new Set<AutomationLocatorStrategy>([
  "role",
  "label",
  "text",
  "alt",
  "title",
  "testid",
  "placeholder",
  "css",
  "xpath",
]);

const PRIVATE_HOSTS = new Set(["localhost", "localhost.localdomain"]);

const cleanText = (value: unknown, fallback = "") =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : fallback;

const cleanCaseCell = (value: unknown, fallback = "") =>
  cleanText(value, fallback).replace(/\|/g, "/");

const clampConfidence = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 55;
  return Math.max(0, Math.min(100, Math.round(numeric)));
};

const normalizeCoverage = (value: unknown): WebsiteCoverageDepth => {
  if (value === "basic" || value === "thorough") return value;
  return "standard";
};

const normalizeLocatorStrategy = (value: unknown): AutomationLocatorStrategy => {
  const normalized = cleanText(value, "css").toLowerCase() as AutomationLocatorStrategy;
  return LOCATOR_STRATEGIES.has(normalized) ? normalized : "css";
};

const normalizeUrlText = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Website URL is required.");

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error("Enter a valid http or https website URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https website URLs are supported.");
  }

  url.hash = "";
  return url.toString();
};

const isPrivateIp = (address: string) => {
  if (address === "::1") return true;
  const family = isIP(address);
  if (family === 4) {
    const [first = 0, second = 0] = address.split(".").map((part) => Number(part));
    return (
      first === 10 ||
      first === 127 ||
      first === 0 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    );
  }
  if (family === 6) {
    const normalized = address.toLowerCase();
    return (
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:")
    );
  }
  return false;
};

async function assertUrlIsAllowed(urlText: string) {
  const url = new URL(urlText);
  const hostname = url.hostname.toLowerCase();
  const allowPrivate =
    process.env.CASEFORGE_ALLOW_PRIVATE_URL_INSPECTION === "true" ||
    process.env.NODE_ENV !== "production";

  if (allowPrivate) return;
  if (PRIVATE_HOSTS.has(hostname) || isPrivateIp(hostname)) {
    throw new Error(
      "Private network URLs are blocked in production. Set CASEFORGE_ALLOW_PRIVATE_URL_INSPECTION=true only for trusted internal deployments.",
    );
  }

  try {
    const addresses = await lookup(hostname, { all: true });
    if (addresses.some((address) => isPrivateIp(address.address))) {
      throw new Error(
        "This website resolves to a private network address, so CaseForge blocked the inspection.",
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("private network")) {
      throw error;
    }
    throw new Error("Could not resolve the website host for inspection.");
  }
}

const bestLocator = (element?: WebsiteElementSnapshot) =>
  element?.locatorCandidates[0] ?? null;

const targetFor = (input: {
  displayName: string;
  elementKind?: string;
  locatorType?: string;
  type?: "smart" | "manual";
  value: string;
}) => ({
  displayName: input.displayName,
  elementKind: input.elementKind ?? "web element",
  locatorType: input.locatorType ?? "css",
  operator: "equals",
  type: input.type ?? "manual",
  value: input.value,
});

const makeNavigateStep = (url: string): AutomationStep => ({
  action: "navigate",
  commandText: `Navigate to ${url}`,
  description: `Navigate to ${url}`,
  inputValue: url,
  locatorCandidates: [],
  options: { url },
  target: targetFor({
    displayName: url,
    elementKind: "browser",
    locatorType: "url",
    value: url,
  }),
});

const makeVerifyTextStep = (text: string, description?: string): AutomationStep => ({
  action: "verifyPageText",
  commandText: description || `Verify page contains ${text}`,
  description: description || `Verify page contains ${text}`,
  expectedValue: text,
  inputValue: text,
  locatorCandidates: [],
  options: { expectedText: text, matchType: "contains" },
  target: targetFor({
    displayName: text || "page text",
    elementKind: "page",
    locatorType: "text",
    value: text,
  }),
});

const makeElementStep = (
  action: string,
  element: WebsiteElementSnapshot,
  description: string,
  inputValue = "",
  expectedValue = "",
): AutomationStep => {
  const locator = bestLocator(element);
  const locatorType = locator?.strategy ?? "text";
  const locatorValue = locator?.value || element.name || element.text;

  return {
    action,
    commandText: description,
    description,
    element: {
      attributes: element.attributes,
      disabled: element.disabled,
      href: element.href,
      inputType: element.inputType,
      required: element.required,
      role: element.role,
      tag: element.tag,
      text: element.text,
    },
    expectedValue,
    inputValue,
    locatorCandidates: element.locatorCandidates,
    options: {
      locator: locatorValue,
      ...(inputValue ? { text: inputValue } : {}),
      ...(expectedValue ? { expectedText: expectedValue, matchType: "contains" } : {}),
    },
    target: targetFor({
      displayName: element.name || element.text || description,
      elementKind: element.kind,
      locatorType,
      value: locatorValue,
    }),
  };
};

const extractJson = (text: string) => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("AI response did not include JSON.");
  }
  return JSON.parse(candidate.slice(start, end + 1)) as AiWebsiteResponse;
};

const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");

const stripHtml = (value: string) =>
  decodeHtmlEntities(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );

const htmlAttributes = (value: string) => {
  const attributes: Record<string, string> = {};
  const attributePattern = /([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = attributePattern.exec(value))) {
    attributes[match[1].toLowerCase()] = decodeHtmlEntities(
      match[2] ?? match[3] ?? match[4] ?? "",
    );
  }
  return attributes;
};

const htmlLocatorCandidates = (
  input: {
    attributes: Record<string, string>;
    kind: string;
    name: string;
    tag: string;
  },
  index: number,
): AutomationLocatorCandidate[] => {
  const candidates: AutomationLocatorCandidate[] = [];
  const push = (strategy: AutomationLocatorStrategy, value: string, score: number) => {
    const cleaned = cleanText(value);
    if (!cleaned) return;
    if (candidates.some((candidate) => candidate.strategy === strategy && candidate.value === cleaned)) {
      return;
    }
    candidates.push({
      isUnique: false,
      metadata: { elementIndex: index, extractedFrom: "website-html-fallback" },
      rank: candidates.length,
      score,
      source: "website-html-fallback",
      strategy,
      value: cleaned,
    });
  };

  const testId =
    input.attributes["data-testid"] ||
    input.attributes["data-test"] ||
    input.attributes["data-cy"];
  if (testId) push("testid", testId, 92);
  if (input.attributes.id) push("css", `#${input.attributes.id}`, 82);
  if (input.attributes.name) push("css", `${input.tag}[name="${input.attributes.name}"]`, 76);
  if (input.attributes.placeholder) push("placeholder", input.attributes.placeholder, 74);
  if (input.attributes.alt) push("alt", input.attributes.alt, 72);
  if (input.name && (input.kind === "button" || input.kind === "link")) {
    push("role", `${input.kind}:${input.name}`, 70);
  }
  if (input.name && input.name.length <= 80) push("text", input.name, 58);
  return candidates;
};

const inspectWebsiteFromHtml = async (
  requestedUrl: string,
  component: string,
): Promise<WebsiteInspectionSnapshot> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(requestedUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "CaseForgeWebsiteInspector/1.0",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Website returned HTTP ${response.status} during inspection.`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      throw new Error("Website did not return an HTML page that can be inspected.");
    }

    const html = await response.text();
    const bodyHtml = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || html;
    const title = stripHtml(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
    const headings = Array.from(bodyHtml.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi))
      .map((match) => stripHtml(match[1]))
      .filter(Boolean)
      .slice(0, 12);
    const visibleText = stripHtml(bodyHtml).slice(0, 2500);
    const finalUrl = response.url || requestedUrl;
    const elementMatches = Array.from(
      bodyHtml.matchAll(
        /<(a|button|select|textarea|form|h[1-3])\b([^>]*)>([\s\S]*?)<\/\1>|<(input|img)\b([^>]*)\/?>/gi,
      ),
    ).slice(0, 90);

    const elements: WebsiteElementSnapshot[] = elementMatches.map((match, index) => {
      const tag = (match[1] || match[4] || "").toLowerCase();
      const attributes = htmlAttributes(match[2] || match[5] || "");
      const text = stripHtml(match[3] || "");
      const kind =
        tag === "a"
          ? "link"
          : tag === "button"
            ? "button"
            : ["input", "select", "textarea"].includes(tag)
              ? "field"
              : tag === "form"
                ? "form"
                : tag === "img"
                  ? "image"
                  : /^h[1-3]$/.test(tag)
                    ? "heading"
                    : tag;
      const name = cleanText(
        attributes["aria-label"] ||
          attributes.alt ||
          attributes.title ||
          attributes.placeholder ||
          attributes.value ||
          text,
      ).slice(0, 120);
      const href = attributes.href ? new URL(attributes.href, finalUrl).toString() : "";
      return {
        attributes: {
          "aria-label": attributes["aria-label"] || "",
          "data-testid": attributes["data-testid"] || "",
          href: attributes.href || "",
          id: attributes.id || "",
          name: attributes.name || "",
          title: attributes.title || "",
        },
        disabled: "disabled" in attributes || attributes["aria-disabled"] === "true",
        href,
        id: `html-${index + 1}`,
        inputType: attributes.type || "",
        kind,
        locatorCandidates: htmlLocatorCandidates({ attributes, kind, name, tag }, index),
        name,
        placeholder: attributes.placeholder || "",
        required: "required" in attributes || attributes["aria-required"] === "true",
        role: attributes.role || "",
        tag,
        text: text.slice(0, 160),
      };
    });
    const fields = elements.filter((element) => element.kind === "field");
    const buttons = elements.filter((element) => element.kind === "button");
    const forms = elements.some((element) => element.kind === "form") || fields.length
      ? [
          {
            buttons,
            fields,
            id: "html-form-1",
            name: fields.length ? "Observed form fields" : "Observed form",
          },
        ]
      : [];

    return {
      component: cleanText(component, "homepage"),
      elements,
      finalUrl,
      forms,
      headings,
      requestedUrl,
      rootDescription: "body html fallback",
      rootSelector: "body",
      stats: {
        buttons: buttons.length,
        fields: fields.length,
        forms: forms.length,
        images: elements.filter((element) => element.kind === "image").length,
        links: elements.filter((element) => element.kind === "link").length,
      },
      title,
      visibleText,
    };
  } finally {
    clearTimeout(timeout);
  }
};

const inspectWebsiteWithBrowser = async (
  requestedUrl: string,
  component: string,
): Promise<WebsiteInspectionSnapshot> => {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { height: 1000, width: 1440 } });
    page.setDefaultTimeout(12000);
    page.setDefaultNavigationTimeout(25000);
    await page.goto(requestedUrl, { timeout: 25000, waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);

    const snapshot = await page.evaluate(
      ({ componentHint, requestedUrl: url }) => {
        const normalize = (value: unknown) =>
          String(value ?? "")
            .replace(/\s+/g, " ")
            .trim();
        const lowerHint = normalize(componentHint).toLowerCase();
        const compactHint = lowerHint.replace(/[^a-z0-9]+/g, " ").trim();
        const truncate = (value: string, max = 280) =>
          value.length > max ? `${value.slice(0, max - 1).trim()}...` : value;
        const escapeCss = (value: string) =>
          typeof CSS !== "undefined" && "escape" in CSS
            ? CSS.escape(value)
            : value.replace(/["\\#.:,[\]>+~*^$|=]/g, "\\$&");
        const isVisible = (element: Element) => {
          const htmlElement = element as HTMLElement;
          const style = window.getComputedStyle(htmlElement);
          const rect = htmlElement.getBoundingClientRect();
          return (
            style.visibility !== "hidden" &&
            style.display !== "none" &&
            rect.width > 0 &&
            rect.height > 0
          );
        };
        const selectorFor = (element: Element) => {
          const htmlElement = element as HTMLElement;
          const testId =
            htmlElement.getAttribute("data-testid") ||
            htmlElement.getAttribute("data-test") ||
            htmlElement.getAttribute("data-cy");
          if (testId) return `[data-testid="${escapeCss(testId)}"]`;
          if (htmlElement.id) return `#${escapeCss(htmlElement.id)}`;
          const tag = element.tagName.toLowerCase();
          const href = htmlElement.getAttribute("href");
          if (tag === "a" && href) return `a[href="${escapeCss(href)}"]`;
          const name = htmlElement.getAttribute("name");
          if (name) return `${tag}[name="${escapeCss(name)}"]`;
          const placeholder = htmlElement.getAttribute("placeholder");
          if (placeholder) return `${tag}[placeholder="${escapeCss(placeholder)}"]`;
          return tag;
        };
        const accessibleName = (element: Element) => {
          const htmlElement = element as HTMLElement;
          const id = htmlElement.id;
          const aria = htmlElement.getAttribute("aria-label");
          const labelledBy = htmlElement.getAttribute("aria-labelledby");
          const labelText =
            id && document.querySelector(`label[for="${escapeCss(id)}"]`)?.textContent;
          const labelledByText = labelledBy
            ?.split(/\s+/)
            .map((labelId) => document.getElementById(labelId)?.textContent || "")
            .join(" ");
          const alt = htmlElement.getAttribute("alt");
          const title = htmlElement.getAttribute("title");
          const placeholder = htmlElement.getAttribute("placeholder");
          return normalize(
            aria ||
              labelledByText ||
              labelText ||
              alt ||
              title ||
              placeholder ||
              htmlElement.innerText ||
              htmlElement.textContent,
          );
        };
        const inferKind = (element: Element) => {
          const tag = element.tagName.toLowerCase();
          const role = (element as HTMLElement).getAttribute("role") || "";
          if (tag === "a" || role === "link") return "link";
          if (tag === "button" || role === "button") return "button";
          if (["input", "select", "textarea"].includes(tag)) return "field";
          if (tag === "form") return "form";
          if (tag === "img") return "image";
          if (/^h[1-6]$/.test(tag)) return "heading";
          return role || tag;
        };
        const candidatesFor = (element: Element, index: number) => {
          const htmlElement = element as HTMLElement;
          const tag = element.tagName.toLowerCase();
          const kind = inferKind(element);
          const name = accessibleName(element);
          const selector = selectorFor(element);
          const testId =
            htmlElement.getAttribute("data-testid") ||
            htmlElement.getAttribute("data-test") ||
            htmlElement.getAttribute("data-cy");
          const candidates: Array<{
            strategy: string;
            value: string;
            score: number;
            isUnique: boolean;
            rank: number;
            source: string;
            metadata: Record<string, unknown>;
          }> = [];
          const push = (strategy: string, value: string, score: number) => {
            const clean = normalize(value);
            if (!clean) return;
            if (candidates.some((candidate) => candidate.strategy === strategy && candidate.value === clean)) {
              return;
            }
            let isUnique = false;
            try {
              if (strategy === "css") isUnique = document.querySelectorAll(clean).length === 1;
            } catch {
              isUnique = false;
            }
            candidates.push({
              isUnique,
              metadata: { elementIndex: index, extractedFrom: "website-inspection" },
              rank: candidates.length,
              score,
              source: "website-inspection",
              strategy,
              value: clean,
            });
          };
          if (testId) push("testid", testId, 96);
          if (selector) push("css", selector, selector.includes("[") || selector.startsWith("#") ? 88 : 48);
          if (name && (kind === "button" || kind === "link")) {
            push("role", `${kind}:${name}`, 84);
          }
          if (name && kind === "field") {
            push(htmlElement.getAttribute("placeholder") ? "placeholder" : "label", name, 82);
          }
          if (name && name.length <= 80) push("text", name, 64);
          if (tag === "img" && htmlElement.getAttribute("alt")) {
            push("alt", htmlElement.getAttribute("alt") || "", 78);
          }
          return candidates;
        };
        const componentSelectors = (() => {
          if (/(header|nav|navigation|menu)/i.test(compactHint)) {
            return ["header", "[role='banner']", "nav", "[role='navigation']"];
          }
          if (/(footer|contentinfo)/i.test(compactHint)) {
            return ["footer", "[role='contentinfo']"];
          }
          if (/(login|signin|sign in|auth)/i.test(compactHint)) {
            return ["form:has(input[type='password'])", "main", "body"];
          }
          if (/(hero|banner)/i.test(compactHint)) {
            return ["[class*='hero' i]", "main section", "main", "body"];
          }
          if (/(pricing|plans|subscription)/i.test(compactHint)) {
            return ["[class*='pricing' i]", "[id*='pricing' i]", "main", "body"];
          }
          if (/(search)/i.test(compactHint)) {
            return ["form:has(input[type='search'])", "form:has(input[placeholder*='search' i])", "main", "body"];
          }
          if (/(homepage|home|page|main|body)/i.test(compactHint) || !compactHint) {
            return ["main", "[role='main']", "body"];
          }
          return [
            `[data-testid*="${escapeCss(compactHint)}" i]`,
            `[id*="${escapeCss(compactHint)}" i]`,
            `[class*="${escapeCss(compactHint)}" i]`,
            "main",
            "body",
          ];
        })();
        const root =
          componentSelectors
            .map((selector) => {
              try {
                return document.querySelector(selector);
              } catch {
                return null;
              }
            })
            .find((element) => element && isVisible(element)) || document.body;
        const rootElement = root as HTMLElement;
        const controls = Array.from(
          root.querySelectorAll(
            "a[href], button, input, select, textarea, img, form, [role='button'], [role='link'], [role='menuitem'], h1, h2, h3",
          ),
        )
          .filter(isVisible)
          .slice(0, 90);
        const elements = controls.map((element, index) => {
          const htmlElement = element as HTMLElement;
          const tag = element.tagName.toLowerCase();
          const kind = inferKind(element);
          const name = accessibleName(element);
          return {
            attributes: {
              "aria-label": htmlElement.getAttribute("aria-label") || "",
              "data-testid": htmlElement.getAttribute("data-testid") || "",
              href: htmlElement.getAttribute("href") || "",
              id: htmlElement.id || "",
              name: htmlElement.getAttribute("name") || "",
              title: htmlElement.getAttribute("title") || "",
            },
            disabled:
              htmlElement.hasAttribute("disabled") ||
              htmlElement.getAttribute("aria-disabled") === "true",
            href: htmlElement instanceof HTMLAnchorElement ? htmlElement.href : "",
            id: `el-${index + 1}`,
            inputType: htmlElement.getAttribute("type") || "",
            kind,
            locatorCandidates: candidatesFor(element, index),
            name: truncate(name, 120),
            placeholder: htmlElement.getAttribute("placeholder") || "",
            required:
              htmlElement.hasAttribute("required") ||
              htmlElement.getAttribute("aria-required") === "true",
            role: htmlElement.getAttribute("role") || "",
            tag,
            text: truncate(normalize(htmlElement.innerText || htmlElement.textContent), 160),
          };
        });
        const formElements = Array.from(root.querySelectorAll("form")).filter(isVisible).slice(0, 8);
        const forms = formElements.map((form, index) => {
          const fields = elements.filter((element) =>
            Boolean(form.contains(controls[Number(element.id.replace("el-", "")) - 1])) &&
            element.kind === "field",
          );
          const buttons = elements.filter((element) =>
            Boolean(form.contains(controls[Number(element.id.replace("el-", "")) - 1])) &&
            (element.kind === "button" || element.kind === "link"),
          );
          return {
            buttons,
            fields,
            id: `form-${index + 1}`,
            name: truncate(accessibleName(form) || `Form ${index + 1}`, 100),
          };
        });
        const headings = elements
          .filter((element) => element.kind === "heading")
          .map((element) => element.name || element.text)
          .filter(Boolean)
          .slice(0, 12);
        const visibleText = truncate(normalize(rootElement.innerText || rootElement.textContent), 2500);
        const selectorDescription =
          root === document.body ? "body" : `${root.tagName.toLowerCase()}${rootElement.id ? `#${rootElement.id}` : ""}`;

        return {
          component: normalize(componentHint),
          elements,
          finalUrl: window.location.href,
          forms,
          headings,
          requestedUrl: url,
          rootDescription: selectorDescription,
          rootSelector: selectorFor(root),
          stats: {
            buttons: elements.filter((element) => element.kind === "button").length,
            fields: elements.filter((element) => element.kind === "field").length,
            forms: forms.length,
            images: elements.filter((element) => element.kind === "image").length,
            links: elements.filter((element) => element.kind === "link").length,
          },
          title: document.title || "",
          visibleText,
        };
      },
      { componentHint: component, requestedUrl },
    );
    return snapshot as WebsiteInspectionSnapshot;
  } finally {
    await browser.close();
  }
};

const inspectWebsite = async (
  requestedUrl: string,
  component: string,
): Promise<WebsiteInspectionSnapshot> => {
  try {
    return await inspectWebsiteWithBrowser(requestedUrl, component);
  } catch (error) {
    console.error("Browser website inspection failed; using HTML fallback:", error);
    return inspectWebsiteFromHtml(requestedUrl, component);
  }
};

const normalizeAiStep = (
  raw: AiWebsiteStep,
  index: number,
  snapshot: WebsiteInspectionSnapshot,
): AutomationStep | null => {
  const action = cleanText(raw.action, "click");
  if (!SUPPORTED_ACTIONS.has(action)) return null;
  const element = snapshot.elements.find((candidate) => candidate.id === cleanText(raw.elementId));

  if (action === "navigate") {
    return makeNavigateStep(snapshot.finalUrl || snapshot.requestedUrl);
  }

  if (action === "verifyPageText") {
    const expectedText = cleanText(raw.expectedText || raw.expectedValue || raw.text || raw.value);
    return makeVerifyTextStep(
      expectedText || snapshot.headings[0] || snapshot.title,
      cleanText(raw.description, `Verify ${snapshot.component} text is visible`),
    );
  }

  if (action === "wait") {
    const duration = Math.max(250, Math.min(10000, Number(raw.durationMs) || 1000));
    return {
      action,
      commandText: cleanText(raw.description, `Wait ${duration} ms`),
      description: cleanText(raw.description, `Wait ${duration} ms`),
      inputValue: String(duration),
      locatorCandidates: [],
      options: { duration, waitType: "hard" },
      target: targetFor({ displayName: "Timer", elementKind: "timer", value: "" }),
    };
  }

  if (!element && !cleanText(raw.locator)) {
    return null;
  }

  const fallbackElement: WebsiteElementSnapshot =
    element ??
    ({
      attributes: {},
      disabled: false,
      href: "",
      id: `ai-${index}`,
      inputType: "",
      kind: "web element",
      locatorCandidates: [
        {
          isUnique: false,
          rank: 0,
          score: 45,
          source: "ai-website-draft",
          strategy: normalizeLocatorStrategy(raw.locatorType),
          value: cleanText(raw.locator),
        },
      ],
      name: cleanText(raw.description, "web element"),
      placeholder: "",
      required: false,
      role: "",
      tag: "",
      text: "",
    } satisfies WebsiteElementSnapshot);

  return makeElementStep(
    action,
    fallbackElement,
    cleanText(raw.description || raw.commandText, `${action} ${fallbackElement.name || index + 1}`),
    cleanText(raw.text || raw.value),
    cleanText(raw.expectedText || raw.expectedValue),
  );
};

const fallbackDrafts = (
  snapshot: WebsiteInspectionSnapshot,
  coverage: WebsiteCoverageDepth,
): GeneratedWebsiteAutomationDraft[] => {
  const baseUrl = snapshot.finalUrl || snapshot.requestedUrl;
  const visibleAnchor = snapshot.headings[0] || snapshot.title || snapshot.component;
  const interactive = snapshot.elements.filter((element) =>
    ["button", "link", "field"].includes(element.kind),
  );
  const links = snapshot.elements.filter((element) => element.kind === "link" && element.href);
  const buttons = snapshot.elements.filter((element) => element.kind === "button");
  const fields = snapshot.elements.filter((element) => element.kind === "field");
  const maxInteractive = coverage === "basic" ? 3 : coverage === "thorough" ? 10 : 6;
  const drafts: GeneratedWebsiteAutomationDraft[] = [
    {
      confidence: 68,
      description: `Grounded smoke coverage for the ${snapshot.component} component inspected from the live page.`,
      name: `${snapshot.component} renders core visible content`,
      steps: [
        makeNavigateStep(baseUrl),
        makeVerifyTextStep(visibleAnchor, `Verify ${snapshot.component} visible content is present`),
      ],
      tags: ["AI website", snapshot.component, "smoke"],
      warnings: ["Fallback generation used observed page structure without AI expansion."],
    },
  ];

  for (const element of interactive.slice(0, maxInteractive)) {
    if (element.kind === "field") {
      drafts.push({
        confidence: 62,
        description: `Validates that the observed ${element.name || element.placeholder || "field"} field can receive reviewable test data.`,
        name: `${element.name || element.placeholder || "Observed field"} accepts input`,
        steps: [
          makeNavigateStep(baseUrl),
          makeElementStep(
            "fill",
            element,
            `Enter sample data in ${element.name || element.placeholder || "the observed field"}`,
            element.inputType === "email" ? "qa.user@example.com" : "Sample test value",
          ),
        ],
        tags: ["AI website", snapshot.component, "field"],
        warnings: ["Review sample input before running against production data."],
      });
      continue;
    }

    drafts.push({
      confidence: 64,
      description: `Validates the observed ${element.kind} "${element.name || element.text}".`,
      name: `${element.name || element.text || element.kind} is actionable`,
      steps: [
        makeNavigateStep(baseUrl),
        makeElementStep("click", element, `Click ${element.name || element.text || element.kind}`),
        ...(element.href
          ? [
              {
                action: "assert",
                commandText: `Assert navigation target includes ${element.href}`,
                description: `Assert navigation target includes ${element.href}`,
                expectedValue: element.href,
                inputValue: element.href,
                locatorCandidates: [],
                options: { expectedUrl: element.href, matchType: "contains" },
                target: targetFor({
                  displayName: "Current URL",
                  elementKind: "browser",
                  locatorType: "url",
                  value: element.href,
                }),
              } satisfies AutomationStep,
            ]
          : []),
      ],
      tags: ["AI website", snapshot.component, element.kind],
      warnings: element.disabled ? ["Element was disabled during inspection."] : [],
    });
  }

  if (fields.some((field) => field.required) || snapshot.forms.length) {
    drafts.push({
      confidence: 66,
      description: `Checks visible form validation boundaries in the inspected ${snapshot.component} component.`,
      name: `${snapshot.component} required fields block incomplete submission`,
      steps: [
        makeNavigateStep(baseUrl),
        ...(buttons[0]
          ? [makeElementStep("click", buttons[0], `Submit ${snapshot.component} form without required data`)]
          : [makeVerifyTextStep(visibleAnchor)]),
        makeVerifyTextStep("required", "Verify validation feedback appears for missing required data"),
      ],
      tags: ["AI website", snapshot.component, "negative"],
      warnings: ["Confirm the exact validation message after the first run."],
    });
  }

  if (coverage !== "basic") {
    drafts.push({
      confidence: 58,
      description: `Reviewable accessibility-oriented coverage based on observed names, links, buttons, and form controls.`,
      name: `${snapshot.component} keyboard and accessible names are usable`,
      steps: [
        makeNavigateStep(baseUrl),
        makeVerifyTextStep(visibleAnchor, `Verify ${snapshot.component} is visible before keyboard review`),
        {
          action: "logMessage",
          commandText: `Review keyboard focus order across ${links.length} links, ${buttons.length} buttons, and ${fields.length} fields`,
          description: `Review keyboard focus order across ${links.length} links, ${buttons.length} buttons, and ${fields.length} fields`,
          inputValue: `${links.length} links; ${buttons.length} buttons; ${fields.length} fields`,
          locatorCandidates: [],
          options: {
            message: "Confirm visible focus, accessible names, and keyboard operability for observed controls.",
          },
          target: targetFor({ displayName: "Accessibility review note", elementKind: "review", value: "" }),
        },
      ],
      tags: ["AI website", snapshot.component, "accessibility"],
      warnings: ["Accessibility checks require human or axe-assisted review for final confidence."],
    });
  }

  return drafts.slice(0, coverage === "thorough" ? 12 : coverage === "basic" ? 5 : 8);
};

const promptForWebsite = (
  snapshot: WebsiteInspectionSnapshot,
  coverage: WebsiteCoverageDepth,
) => `Create CaseForge automation draft scenarios for a website component.

Return JSON only. Do not use markdown.

You must only create scenarios grounded in the inspected component evidence below.
Do not invent hidden flows, labels, pages, credentials, business rules, or elements that are not present in the evidence.
Use elementId from observedElements when interacting with a real element.
Prefer scenario names that are specific and automation-ready.
Include functional, negative, responsive/accessibility, link/navigation, form, and regression coverage only where supported by observed evidence.
For footer/header/homepage components, cover actual links/buttons/content that exists in observedElements.
For forms, cover required fields, validation, successful input readiness, and submit controls where observed.
Target ${coverage === "basic" ? "4 to 6" : coverage === "thorough" ? "9 to 12" : "6 to 9"} useful scenarios.

Allowed step actions:
navigate, click, fill, type, select, assert, assertText, verifyPageText, wait, logMessage.

JSON shape:
{
  "scenarios": [
    {
      "name": "Scenario name",
      "description": "Short reason this scenario matters",
      "confidence": 0,
      "warnings": ["Review note"],
      "tags": ["tag"],
      "steps": [
        {
          "action": "navigate",
          "description": "Navigate to inspected page"
        },
        {
          "action": "click",
          "elementId": "el-1",
          "description": "Click observed control"
        },
        {
          "action": "verifyPageText",
          "expectedText": "Observed text"
        }
      ]
    }
  ]
}

Inspected component:
${JSON.stringify(
  {
    component: snapshot.component,
    finalUrl: snapshot.finalUrl,
    forms: snapshot.forms.map((form) => ({
      buttons: form.buttons.map((button) => ({ id: button.id, name: button.name, text: button.text })),
      fields: form.fields.map((field) => ({
        id: field.id,
        inputType: field.inputType,
        name: field.name,
        placeholder: field.placeholder,
        required: field.required,
      })),
      id: form.id,
      name: form.name,
    })),
    headings: snapshot.headings,
    observedElements: snapshot.elements.map((element) => ({
      disabled: element.disabled,
      href: element.href,
      id: element.id,
      inputType: element.inputType,
      kind: element.kind,
      locatorCandidates: element.locatorCandidates.slice(0, 3),
      name: element.name,
      placeholder: element.placeholder,
      required: element.required,
      tag: element.tag,
      text: element.text,
    })),
    root: snapshot.rootDescription,
    stats: snapshot.stats,
    title: snapshot.title,
    visibleText: snapshot.visibleText.slice(0, 1800),
  },
  null,
  2,
)}`;

const targetManualCaseCount = (coverage: WebsiteCoverageDepth) =>
  coverage === "basic" ? "5 to 7" : coverage === "thorough" ? "12 to 16" : "8 to 12";

const manualModeGuidance = (mode: WebsiteGenerationMode) => {
  switch (mode) {
    case "negative":
      return "Emphasize invalid actions, blocked submissions, missing fields, and error messaging supported by observed controls.";
    case "edge":
      return "Emphasize boundary UI states, empty states, unusual but realistic inputs, and layout stability.";
    case "ui":
      return "Emphasize visible UI behavior, content, labels, field states, interaction feedback, and usability.";
    case "api":
      return "Only include API-oriented cases if the inspected page visibly exposes API behavior. Otherwise keep cases manual UI-focused.";
    case "security":
      return "Keep security validation defensive and release-readiness focused, such as access boundaries, safe errors, and sensitive data exposure checks.";
    case "accessibility":
      return "Emphasize manual WCAG-oriented checks: keyboard flow, visible focus, accessible names, semantics, form labels, contrast, zoom/reflow, and screen reader announcements.";
    case "regression":
      return "Emphasize stable existing behavior for visible content, navigation, forms, and critical interactions.";
    case "salesforce":
      return "Only include Salesforce-specific language if the inspected page evidence supports it. Otherwise keep cases grounded in the website component.";
    case "functional":
    default:
      return "Emphasize primary user-visible behavior, successful paths, validation, and meaningful alternate paths.";
  }
};

const promptForManualWebsiteCases = (input: {
  coverage: WebsiteCoverageDepth;
  mode: WebsiteGenerationMode;
  orchestration?: string;
  persona?: string;
  snapshot: WebsiteInspectionSnapshot;
}) => `Generate manual QA test cases for the inspected website component.

Return plain text only. Do not use markdown.
Return exactly one test case per line.
Use | as the column separator.
Keep each row strictly in 7 columns only.
Column order: ID | Type | Title | Preconditions | Steps | Expected Result | Test Data
Use only these Type values: Functional, Regression, API, UI, Negative, Edge, Integration, Security, Performance.

Rules:
- This is manual test case generation only.
- Do not create automation scripts, browser commands, locators, code, selectors, Playwright, Cypress, Selenium, or step implementations.
- Ground every case in the inspected website evidence below.
- Do not invent hidden flows, credentials, business rules, or elements that are not present in the evidence.
- Steps must be human-executable manual QA actions separated with semicolons.
- Preconditions should describe starting state, page availability, access, or setup only.
- Expected Result must be observable and concise.
- Test Data is only for values a tester must enter, select, upload, or prepare before execution.
- For click-only, link-only, navigation-only, content review, layout, keyboard, and visual checks, Test Data must be "None".
- Do not put button names, link labels, hrefs, locators, selectors, or page URLs in Test Data for click/navigation cases; keep those details in Steps or Expected Result.
- Include functional, negative, UI/accessibility, link/navigation, form, and regression coverage only where supported by observed evidence.
- Target ${targetManualCaseCount(input.coverage)} useful manual cases.
- Persona: ${cleanText(input.persona, "all users")}
- Mode guidance: ${manualModeGuidance(input.mode)}
- Orchestration guidance: ${
  cleanText(input.orchestration) ||
  "No orchestration override was provided. Infer the best QA mix from the inspected component."
}

Format example:
TC001 | Functional | Homepage hero content appears correctly | Website is reachable; Homepage component is open | Open the homepage URL; Review the hero heading; Review primary call to action | The hero content and primary action are visible and understandable | URL=https://example.com; Heading=Observed heading

Inspected component evidence:
${JSON.stringify(
  {
    component: input.snapshot.component,
    finalUrl: input.snapshot.finalUrl,
    forms: input.snapshot.forms.map((form) => ({
      buttons: form.buttons.map((button) => ({ name: button.name, text: button.text })),
      fields: form.fields.map((field) => ({
        inputType: field.inputType,
        name: field.name,
        placeholder: field.placeholder,
        required: field.required,
      })),
      name: form.name,
    })),
    headings: input.snapshot.headings,
    observedElements: input.snapshot.elements.map((element) => ({
      disabled: element.disabled,
      href: element.href,
      inputType: element.inputType,
      kind: element.kind,
      name: element.name,
      placeholder: element.placeholder,
      required: element.required,
      tag: element.tag,
      text: element.text,
    })),
    root: input.snapshot.rootDescription,
    stats: input.snapshot.stats,
    title: input.snapshot.title,
    visibleText: input.snapshot.visibleText.slice(0, 2200),
  },
  null,
  2,
)}`;

const caseLine = (
  id: string,
  type: string,
  title: string,
  preconditions: string,
  steps: string,
  expectedResult: string,
  testData = "None",
) =>
  [id, type, title, preconditions, steps, expectedResult, testData]
    .map((cell) => cleanCaseCell(cell))
    .join(" | ");

const fallbackManualWebsiteCases = (
  snapshot: WebsiteInspectionSnapshot,
  coverage: WebsiteCoverageDepth,
) => {
  const component = snapshot.component || "website component";
  const url = snapshot.finalUrl || snapshot.requestedUrl;
  const heading = snapshot.headings[0] || snapshot.title || component;
  const links = snapshot.elements.filter((element) => element.kind === "link" && element.href);
  const buttons = snapshot.elements.filter((element) => element.kind === "button");
  const fields = snapshot.elements.filter((element) => element.kind === "field");
  const images = snapshot.elements.filter((element) => element.kind === "image");
  const rows: string[] = [
    caseLine(
      "TC001",
      "Functional",
      `${component} renders expected visible content`,
      `${component} page is reachable`,
      `Open ${url}; Review the page title and main heading; Scan the visible ${component} content`,
      `The ${component} content is visible and matches the inspected page structure.`,
      `URL=${url}; Heading=${heading}`,
    ),
    caseLine(
      "TC002",
      "UI",
      `${component} layout remains readable on desktop`,
      `${component} page is open in a desktop browser`,
      "Set the browser to a desktop viewport; Review headings, text, buttons, links, and images; Check for clipped or overlapping content",
      "All visible content remains readable, aligned, and free of obvious overlap.",
      `Buttons=${buttons.length}; Links=${links.length}; Fields=${fields.length}`,
    ),
  ];

  links.slice(0, coverage === "basic" ? 2 : 4).forEach((link) => {
    rows.push(
      caseLine(
        `TC${String(rows.length + 1).padStart(3, "0")}`,
        "Functional",
        `${link.name || link.text || "Observed link"} navigates to expected destination`,
        `${component} page is open; Link is visible`,
        `Locate ${link.name || link.text || "the observed link"}; Open the link; Review the destination page or URL`,
        "The link opens the expected destination without a broken page or unexpected error.",
        "None",
      ),
    );
  });

  buttons.slice(0, coverage === "basic" ? 2 : 4).forEach((button) => {
    rows.push(
      caseLine(
        `TC${String(rows.length + 1).padStart(3, "0")}`,
        "Functional",
        `${button.name || button.text || "Observed button"} action gives clear feedback`,
        `${component} page is open; Button is visible`,
        `Locate ${button.name || button.text || "the observed button"}; Activate the button; Review the visible response`,
        "The button responds with a clear state change, navigation, or feedback appropriate to the visible UI.",
        "None",
      ),
    );
  });

  fields.slice(0, coverage === "basic" ? 2 : 5).forEach((field, index) => {
    const sampleValue = field.inputType === "email" ? "qa.user@example.com" : "Sample test value";
    rows.push(
      caseLine(
        `TC${String(rows.length + 1).padStart(3, "0")}`,
        field.required ? "Negative" : "Functional",
        `${field.name || field.placeholder || "Observed field"} accepts reviewable input`,
        `${component} page is open; Field is visible`,
        `Locate ${field.name || field.placeholder || "the observed field"}; Enter sample data; Move focus away from the field`,
        "The field accepts the value or shows clear validation feedback if the value is not allowed.",
        `Field=${field.name || field.placeholder || `Field ${index + 1}`}; Value=${sampleValue}; Required=${field.required}`,
      ),
    );
  });

  if (fields.some((field) => field.required) || snapshot.forms.length) {
    rows.push(
      caseLine(
        `TC${String(rows.length + 1).padStart(3, "0")}`,
        "Negative",
        `${component} required fields block incomplete submission`,
        `${component} form is available`,
        "Leave required fields empty; Submit or continue the form; Review validation feedback",
        "Submission is blocked and each missing required value has understandable feedback.",
        `Required fields=${fields.filter((field) => field.required).map((field) => field.name || field.placeholder || field.id).join(", ") || "Observed form fields"}`,
      ),
    );
  }

  if (coverage !== "basic") {
    rows.push(
      caseLine(
        `TC${String(rows.length + 1).padStart(3, "0")}`,
        "UI",
        `${component} keyboard flow reaches interactive controls`,
        `${component} page is open; Keyboard is available`,
        "Start at the browser address bar; Use Tab to move through links, buttons, and fields; Activate reachable controls with keyboard only",
        "Focus order is logical, focus is visible, and interactive controls can be reached without a mouse.",
        "None",
      ),
    );
  }

  if (coverage === "thorough" && images.length) {
    rows.push(
      caseLine(
        `TC${String(rows.length + 1).padStart(3, "0")}`,
        "UI",
        `${component} images have meaningful alternatives`,
        `${component} page is open; Images are visible`,
        "Review visible images; Check whether each informative image has meaningful alternative text or surrounding context; Check decorative images do not distract assistive review",
        "Images have appropriate alt text or surrounding accessible context based on their purpose.",
        "None",
      ),
    );
  }

  return rows.slice(0, coverage === "thorough" ? 16 : coverage === "basic" ? 7 : 12).join("\n");
};

const normalizeManualCaseResult = (text: string) =>
  text
    .replace(/```(?:plaintext|text)?/gi, "")
    .replace(/```/g, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes("|"))
    .map((line) => cleanManualWebsiteCaseLine(line))
    .join("\n")
    .trim();

const clickOnlyTestDataPattern =
  /(?:^|[;\n]\s*)(?:button|link(?:\s*text)?|href|url|page|route|destination|selector|locator)\s*=/i;

const hasManualInputDataNeed = (value: string) =>
  /\b(?:enter|type|input|fill|select|choose|upload|provide|sample data|valid value|invalid value|email|password|field|form|required field|csv|payload)\b/i.test(
    value,
  );

const cleanManualWebsiteCaseLine = (line: string) => {
  const columns = line.split("|").map((cell) => cleanCaseCell(cell));
  if (columns.length !== 7) return line;

  const [id, type, title, preconditions, steps, expectedResult, testData] = columns;
  const rowText = `${title} ${preconditions} ${steps} ${expectedResult}`;
  if (
    clickOnlyTestDataPattern.test(testData) &&
    !hasManualInputDataNeed(rowText)
  ) {
    return [id, type, title, preconditions, steps, expectedResult, "None"].join(" | ");
  }

  return columns.join(" | ");
};

const normalizeWebsiteMode = (value: unknown): WebsiteGenerationMode => {
  const allowed = new Set<WebsiteGenerationMode>([
    "functional",
    "negative",
    "edge",
    "ui",
    "api",
    "regression",
    "security",
    "accessibility",
    "salesforce",
  ]);
  const normalized = cleanText(value, "functional").toLowerCase() as WebsiteGenerationMode;
  return allowed.has(normalized) ? normalized : "functional";
};

export async function generateWebsiteAutomationDrafts(input: {
  component: string;
  coverage?: unknown;
  url: string;
}): Promise<{
  coverage: WebsiteCoverageDepth;
  drafts: GeneratedWebsiteAutomationDraft[];
  model: string;
  provider: string;
  snapshot: WebsiteInspectionSnapshot;
  usedFallback: boolean;
}> {
  const targetUrl = normalizeUrlText(input.url);
  await assertUrlIsAllowed(targetUrl);

  const component = cleanText(input.component, "homepage");
  const coverage = normalizeCoverage(input.coverage);
  const snapshot = await inspectWebsite(targetUrl, component);
  let model = "";
  let provider = "";
  let usedFallback = false;
  let parsed: AiWebsiteResponse | null = null;

  try {
    const response = await generateCaseForgeAiText({
      messages: [
        {
          role: "system",
          content:
            "You are CaseForge's website automation designer. Create structured browser automation scenarios only from observed page evidence.",
        },
        {
          role: "user",
          content: promptForWebsite(snapshot, coverage),
        },
      ],
      temperature: 0.12,
    });
    model = response.model;
    provider = response.provider;
    parsed = extractJson(response.text);
  } catch (error) {
    usedFallback = true;
    model = model || "fallback";
    provider = provider || "caseforge";
    console.error("AI website automation generation failed:", error);
  }

  const aiScenarios = Array.isArray(parsed?.scenarios) ? parsed?.scenarios ?? [] : [];
  const drafts = aiScenarios.flatMap((scenario, scenarioIndex): GeneratedWebsiteAutomationDraft[] => {
    const steps = Array.isArray(scenario.steps)
      ? scenario.steps
          .map((step, index) => normalizeAiStep(step, index, snapshot))
          .filter((step): step is AutomationStep => Boolean(step))
      : [];
    if (!steps.some((step) => step.action === "navigate")) {
      steps.unshift(makeNavigateStep(snapshot.finalUrl || snapshot.requestedUrl));
    }
    if (!steps.some((step) => step.action === "verifyPageText" || step.action === "assertText")) {
      steps.push(makeVerifyTextStep(snapshot.headings[0] || snapshot.title || snapshot.component));
    }
    if (!steps.length) return [];

    return [
      {
        confidence: clampConfidence(scenario.confidence),
        description:
          cleanText(scenario.description) ||
          `Website-grounded automation draft for ${snapshot.component}.`,
        name:
          cleanText(scenario.name) ||
          `${snapshot.component} website scenario ${scenarioIndex + 1}`,
        steps,
        tags: Array.isArray(scenario.tags)
          ? scenario.tags.map((tag) => cleanText(tag)).filter(Boolean)
          : [],
        warnings: Array.isArray(scenario.warnings)
          ? scenario.warnings.map((warning) => cleanText(warning)).filter(Boolean)
          : [],
      },
    ];
  });

  if (!drafts.length) {
    usedFallback = true;
    return {
      coverage,
      drafts: fallbackDrafts(snapshot, coverage),
      model: model || "fallback",
      provider: provider || "caseforge",
      snapshot,
      usedFallback,
    };
  }

  return {
    coverage,
    drafts: drafts.slice(0, coverage === "thorough" ? 12 : coverage === "basic" ? 6 : 9),
    model,
    provider,
    snapshot,
    usedFallback,
  };
}

export async function generateWebsiteManualTestCases(input: {
  component: string;
  coverage?: unknown;
  mode?: unknown;
  orchestration?: unknown;
  persona?: unknown;
  url: string;
}): Promise<{
  coverage: WebsiteCoverageDepth;
  model: string;
  provider: string;
  result: string;
  snapshot: WebsiteInspectionSnapshot;
  usedFallback: boolean;
}> {
  const targetUrl = normalizeUrlText(input.url);
  await assertUrlIsAllowed(targetUrl);

  const component = cleanText(input.component, "homepage");
  const coverage = normalizeCoverage(input.coverage);
  const mode = normalizeWebsiteMode(input.mode);
  const snapshot = await inspectWebsite(targetUrl, component);
  let model = "";
  let provider = "";
  let usedFallback = false;

  try {
    const response = await generateCaseForgeAiText({
      messages: [
        {
          role: "system",
          content:
            "You are CaseForge's senior QA engineer. Generate manual test cases only from observed website evidence.",
        },
        {
          role: "user",
          content: promptForManualWebsiteCases({
            coverage,
            mode,
            orchestration: cleanText(input.orchestration),
            persona: cleanText(input.persona, "all"),
            snapshot,
          }),
        },
      ],
      temperature: 0.16,
    });
    model = response.model;
    provider = response.provider;
    const normalized = normalizeManualCaseResult(response.text);
    if (normalized.split(/\r?\n/).filter(Boolean).length >= 3) {
      return {
        coverage,
        model,
        provider,
        result: normalized,
        snapshot,
        usedFallback,
      };
    }
    usedFallback = true;
  } catch (error) {
    usedFallback = true;
    console.error("AI website manual case generation failed:", error);
  }

  return {
    coverage,
    model: model || "fallback",
    provider: provider || "caseforge",
    result: fallbackManualWebsiteCases(snapshot, coverage),
    snapshot,
    usedFallback,
  };
}
