import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const PORT = Number(process.env.CASEFORGE_AGENT_PORT || "4873");
const HOST = process.env.CASEFORGE_AGENT_HOST || "127.0.0.1";
const AGENT_VERSION = "0.1.27";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const glowCartDistRoot = path.resolve(SCRIPT_DIR, "../glowcart-demo-dist");

const commandName = {
  navigate: "Navigate",
  click: "Click",
  fill: "Fill",
  select: "Select",
  check: "Check",
  uncheck: "Uncheck",
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
  demo: null,
  livePreviewClients: new Set(),
  pages: new Map(),
  page: null,
  activeTabId: null,
  session: null,
};

const pageRecordFor = (page) => state.pages.get(page) || null;

const orderedPageRecords = () =>
  Array.from(state.pages.values()).sort((left, right) => left.createdAt - right.createdAt);

const livePreviewTabs = () =>
  orderedPageRecords().map((record, index) => ({
    active: record.id === state.activeTabId,
    id: record.id,
    openerId: record.openerId || null,
    title: record.title || record.url || `Tab ${index + 1}`,
    url: record.url || "",
  }));

const snapshotPayload = () => ({
  activeTabId: state.activeTabId,
  tabs: livePreviewTabs(),
  url: state.page?.url() || state.session?.currentUrl || "",
});

const broadcastLivePreviewState = () => {
  const payload = {
    type: "state",
    ...snapshotPayload(),
  };
  for (const client of state.livePreviewClients) {
    sendWebSocketJson(client, payload);
  }
};

async function refreshPageRecord(page) {
  const record = pageRecordFor(page);
  if (!record) return null;
  record.url = page.url() || record.url || "";
  record.title = (await page.title().catch(() => "")) || record.title || record.url || "";
  return record;
}

function setActivePage(page, options = {}) {
  const record = pageRecordFor(page);
  if (!record) return;
  state.page = page;
  state.activeTabId = record.id;
  if (state.session) {
    state.session.currentUrl = page.url() || record.url || state.session.currentUrl;
    state.session.updatedAt = Date.now();
    if (options.logMessage) {
      state.session.logs = [options.logMessage, ...state.session.logs].slice(0, 60);
    }
  }
  void refreshPageRecord(page).then(() => {
    if (state.page === page) {
      broadcastLivePreviewState();
    }
  });
}

function handlePageClosed(page) {
  const closingRecord = pageRecordFor(page);
  if (!closingRecord) return;
  state.pages.delete(page);
  if (state.page === page) {
    const fallbackRecord = orderedPageRecords().at(-1) || null;
    if (fallbackRecord) {
      setActivePage(fallbackRecord.page, {
        logMessage: `Returned to ${fallbackRecord.title || fallbackRecord.url || "the previous tab"}.`,
      });
    } else {
      state.page = null;
      state.activeTabId = null;
      if (state.session) {
        state.session.updatedAt = Date.now();
      }
      broadcastLivePreviewState();
    }
  } else {
    broadcastLivePreviewState();
  }
}

const glowCartDemoHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>GlowCart Demo</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f8fbf7; color: #172117; }
    header { position: sticky; top: 0; z-index: 2; border-bottom: 1px solid #dbe8d6; background: rgba(248,251,247,.96); backdrop-filter: blur(12px); }
    .bar, .layout { max-width: 1120px; margin: 0 auto; padding: 16px 20px; }
    .bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .eyebrow { margin: 0; color: #4d7c62; font-size: 11px; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; }
    h1 { margin: 4px 0 0; font-size: 24px; line-height: 1.15; }
    button, input, select, textarea { font: inherit; }
    button { cursor: pointer; }
    .primary { border: 0; border-radius: 8px; background: #0f7b5f; color: white; padding: 10px 15px; font-weight: 800; }
    .primary:hover { background: #0a644e; }
    .secondary { border: 1px solid #0f7b5f; border-radius: 8px; background: white; color: #0f7b5f; padding: 10px 15px; font-weight: 800; }
    .layout { display: grid; grid-template-columns: minmax(0,1fr) 320px; gap: 24px; }
    .products { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 16px; }
    article, aside { border: 1px solid #dbe8d6; border-radius: 8px; background: white; box-shadow: 0 8px 24px rgba(15, 23, 42, .05); }
    article { padding: 16px; }
    aside { padding: 18px; align-self: start; }
    .swatch { display: flex; align-items: end; height: 150px; border-radius: 8px; padding: 16px; background: linear-gradient(135deg,#ffe2e7,#f5f2c8 52%,#d2efe1); }
    .pill { border-radius: 999px; background: rgba(255,255,255,.86); color: #174235; padding: 5px 10px; font-size: 12px; font-weight: 800; }
    .product-row { display: flex; align-items: start; justify-content: space-between; gap: 12px; margin-top: 12px; }
    h2, h3 { margin: 0; }
    .muted { color: #5f7165; }
    .success { margin-top: 12px; border: 1px solid #91d2b4; border-radius: 8px; background: #e9f8ef; color: #14553f; padding: 12px; font-weight: 800; }
    .modal { position: fixed; inset: 0; z-index: 10; display: none; overflow: auto; background: rgba(0,0,0,.45); padding: 28px 16px; }
    .modal.is-open { display: block; }
    .panel { max-width: 760px; margin: 0 auto; border-radius: 10px; background: white; box-shadow: 0 24px 80px rgba(15,23,42,.28); }
    .panel-head { display: flex; justify-content: space-between; gap: 16px; border-bottom: 1px solid #e1eadc; padding: 18px 20px; }
    form { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 16px; padding: 20px; }
    label { display: block; font-size: 14px; font-weight: 800; }
    .field { width: 100%; margin-top: 6px; border: 1px solid #bed0b7; border-radius: 8px; background: white; padding: 10px 12px; outline: none; }
    .field:focus { border-color: #0f7b5f; box-shadow: 0 0 0 3px rgba(15,123,95,.16); }
    .password-row { display: flex; margin-top: 6px; border: 1px solid #bed0b7; border-radius: 8px; overflow: hidden; }
    .password-row input { min-width: 0; flex: 1; border: 0; padding: 10px 12px; outline: none; }
    .password-row button { border: 0; background: white; color: #0f7b5f; padding: 0 12px; font-weight: 800; }
    .check { display: flex; align-items: start; gap: 10px; border: 1px solid #dbe8d6; border-radius: 8px; padding: 12px; }
    .check input { width: 16px; height: 16px; margin-top: 2px; accent-color: #0f7b5f; }
    .span-2 { grid-column: 1 / -1; }
    .actions { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; border-top: 1px solid #e1eadc; padding-top: 16px; }
    .link-button { border: 0; background: transparent; color: #0f7b5f; padding: 0; font-weight: 800; }
    .error { display: block; margin-top: 5px; color: #b42318; font-size: 12px; font-weight: 800; }
    .banner-error { border-radius: 8px; background: #fff1f0; color: #b42318; padding: 12px; font-weight: 800; }
    .signin { padding: 20px; }
    @media (max-width: 760px) { .layout, .products, form { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <div class="bar">
      <div>
        <p class="eyebrow">GlowCart</p>
        <h1>Makeup essentials for everyday glow</h1>
      </div>
      <button class="primary" type="button" data-open-signup>Create Account</button>
    </div>
  </header>
  <main class="layout">
    <section class="products" aria-label="Featured products">
      <article><div class="swatch"><span class="pill">Petal red</span></div><div class="product-row"><div><h2>Rose Beam Lip Tint</h2><p class="muted">Dermatologist tested, vegan friendly.</p></div><strong>$18</strong></div></article>
      <article><div class="swatch"><span class="pill">Soft matte</span></div><div class="product-row"><div><h2>Cloud Skin Primer</h2><p class="muted">Dermatologist tested, vegan friendly.</p></div><strong>$24</strong></div></article>
      <article><div class="swatch"><span class="pill">Champagne</span></div><div class="product-row"><div><h2>Lumen Highlighter</h2><p class="muted">Dermatologist tested, vegan friendly.</p></div><strong>$21</strong></div></article>
      <article><div class="swatch"><span class="pill">Midnight</span></div><div class="product-row"><div><h2>Velvet Kajal Stick</h2><p class="muted">Dermatologist tested, vegan friendly.</p></div><strong>$15</strong></div></article>
    </section>
    <aside>
      <h2>Member perks</h2>
      <p class="muted">Save shade matches, order faster, and receive skin-profile recommendations.</p>
      <div id="success" role="status"></div>
      <button class="secondary" type="button" data-open-signup>Join GlowCart</button>
    </aside>
  </main>
  <div class="modal" id="modal">
    <div class="panel">
      <div class="panel-head">
        <div><p class="eyebrow" id="modeLabel">Create Account</p><h2 id="panelTitle">GlowCart signup form</h2></div>
        <button class="link-button" type="button" id="closeModal">Close</button>
      </div>
      <div id="signin" class="signin" hidden>
        <label>Email Address<input class="field" type="email" name="signinEmail"></label>
        <label style="margin-top:14px">Password<input class="field" type="password" name="signinPassword"></label>
        <button class="primary" style="margin-top:18px" type="button">Sign In</button>
      </div>
      <form id="signup" novalidate>
        <label>First Name <span class="error-marker">*</span><input class="field" name="firstName" autocomplete="given-name"></label>
        <label>Last Name <span class="error-marker">*</span><input class="field" name="lastName" autocomplete="family-name"></label>
        <label>Email Address <span class="error-marker">*</span><input class="field" name="email" type="email" autocomplete="email"></label>
        <label>Mobile Number <span class="error-marker">*</span><input class="field" name="mobile" inputmode="numeric" autocomplete="tel"></label>
        <label>Password <span class="error-marker">*</span><span class="password-row"><input name="password" type="password" autocomplete="new-password"><button type="button" data-toggle-password="password">Show</button></span></label>
        <label>Confirm Password <span class="error-marker">*</span><span class="password-row"><input name="confirmPassword" type="password" autocomplete="new-password"><button type="button" data-toggle-password="confirmPassword">Show</button></span></label>
        <label>Date of Birth <span class="error-marker">*</span><input class="field" name="dateOfBirth" type="date"></label>
        <label>Gender <span class="error-marker">*</span><select class="field" name="gender"><option value="">Select gender</option><option>Female</option><option>Male</option><option>Non-binary</option><option>Prefer not to say</option></select></label>
        <label>Skin Profile <span class="error-marker">*</span><select class="field" name="skinProfile"><option value="">Select skin profile</option><option>Oily</option><option>Dry</option><option>Combination</option><option>Sensitive</option></select></label>
        <label>Beauty Interest<select class="field" name="beautyInterest"><option value="">Select interest</option><option>Skincare</option><option>Makeup</option><option>Fragrance</option><option>Hair care</option></select></label>
        <label>Referral Code<input class="field" name="referralCode"></label>
        <label>Address<textarea class="field" name="address" rows="3"></textarea></label>
        <label class="check"><input name="newsletter" type="checkbox">Newsletter checkbox</label>
        <label class="check"><input name="terms" type="checkbox">Terms and Privacy Policy checkbox *</label>
        <p class="span-2 banner-error" id="formError" role="alert" hidden>Please fix the highlighted fields before creating your account.</p>
        <div class="span-2 actions">
          <button class="link-button" type="button" id="showSignin">Already have account? Sign in</button>
          <button class="primary" type="submit">Create Account</button>
        </div>
      </form>
    </div>
  </div>
  <script>
    const modal = document.getElementById("modal");
    const signup = document.getElementById("signup");
    const signin = document.getElementById("signin");
    const formError = document.getElementById("formError");
    const success = document.getElementById("success");
    const modeLabel = document.getElementById("modeLabel");
    const panelTitle = document.getElementById("panelTitle");
    const required = ["firstName","lastName","email","mobile","password","confirmPassword","dateOfBirth","gender","skinProfile"];
    const clearErrors = () => document.querySelectorAll(".error").forEach((node) => node.remove());
    const showSignup = () => { modal.classList.add("is-open"); signup.hidden = false; signin.hidden = true; modeLabel.textContent = "Create Account"; panelTitle.textContent = "GlowCart signup form"; };
    document.querySelectorAll("[data-open-signup]").forEach((button) => button.addEventListener("click", showSignup));
    document.getElementById("closeModal").addEventListener("click", () => modal.classList.remove("is-open"));
    document.getElementById("showSignin").addEventListener("click", () => { signup.hidden = true; signin.hidden = false; modeLabel.textContent = "Sign In"; panelTitle.textContent = "Welcome back"; });
    document.querySelectorAll("[data-toggle-password]").forEach((button) => button.addEventListener("click", () => {
      const input = signup.elements[button.dataset.togglePassword];
      input.type = input.type === "password" ? "text" : "password";
      button.textContent = input.type === "password" ? "Show" : "Hide";
    }));
    const addError = (field, message) => {
      const input = signup.elements[field];
      const label = input.closest("label");
      const error = document.createElement("span");
      error.className = "error";
      error.setAttribute("role", "alert");
      error.textContent = message;
      label.appendChild(error);
    };
    signup.addEventListener("submit", (event) => {
      event.preventDefault();
      clearErrors();
      let invalid = false;
      required.forEach((field) => {
        if (!String(signup.elements[field].value || "").trim()) {
          invalid = true;
          addError(field, signup.elements[field].closest("label").childNodes[0].textContent.trim() + " is required.");
        }
      });
      const email = signup.elements.email.value;
      const mobile = signup.elements.mobile.value.replace(/\\D/g, "");
      if (email && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) { invalid = true; addError("email", "Enter a valid email address."); }
      if (mobile && mobile.length < 10) { invalid = true; addError("mobile", "Mobile number must be at least 10 digits."); }
      if (signup.elements.password.value && signup.elements.confirmPassword.value && signup.elements.password.value !== signup.elements.confirmPassword.value) {
        invalid = true; addError("confirmPassword", "Passwords do not match.");
      }
      if (!signup.elements.terms.checked) { invalid = true; addError("terms", "Accept the terms and privacy policy to continue."); }
      formError.hidden = !invalid;
      if (invalid) return;
      success.className = "success";
      success.textContent = "Account created for " + [signup.elements.firstName.value, signup.elements.lastName.value].filter(Boolean).join(" ") + ".";
      signup.reset();
      modal.classList.remove("is-open");
    });
  </script>
</body>
</html>`;

const isBrowserInstallError = (error) =>
  error instanceof Error &&
  /executable doesn't exist|please run the following command|playwright install/i.test(
    error.message
  );

const browserInstallMessage =
  "CaseForge could not find a browser to open. Install Google Chrome or Microsoft Edge, then try recording again.";

const launchBrowser = async (options = {}) => {
  const headless = options.headless === true;
  const launchOptions = {
    args: !headless && options.maximize ? ["--start-maximized"] : undefined,
    headless,
  };
  try {
    return await chromium.launch(launchOptions);
  } catch (error) {
    if (!isBrowserInstallError(error)) {
      throw error;
    }
  }

  for (const channel of ["chrome", "msedge"]) {
    try {
      return await chromium.launch({ ...launchOptions, channel });
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

const htmlHeaders = (origin = "*") => ({
  "Access-Control-Allow-Origin": origin || "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "text/html; charset=utf-8",
});

const sendHtml = (res, status, html, origin) => {
  res.writeHead(status, htmlHeaders(origin));
  res.end(html);
};

const sendPreviewSvg = (res, status, message, origin) => {
  const escaped = String(message || "Live preview unavailable")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  res.writeHead(status, staticHeaders(origin, "image/svg+xml"));
  res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
    <rect width="1280" height="720" fill="#050816"/>
    <rect x="360" y="286" width="560" height="148" rx="24" fill="#111827" stroke="#334155"/>
    <text x="640" y="344" text-anchor="middle" fill="#e5e7eb" font-family="system-ui,Segoe UI,sans-serif" font-size="28" font-weight="700">Live preview reconnecting</text>
    <text x="640" y="386" text-anchor="middle" fill="#94a3b8" font-family="system-ui,Segoe UI,sans-serif" font-size="18">${escaped}</text>
  </svg>`);
};

const staticHeaders = (origin = "*", contentType = "application/octet-stream") => ({
  "Access-Control-Allow-Origin": origin || "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  "Content-Type": contentType,
});

const mimeTypeForPath = (filePath) => {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".js") return "text/javascript; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".ico") return "image/x-icon";
  return "application/octet-stream";
};

const fileExists = async (filePath) => {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
};

const glowCartDistFilePath = (pathname) => {
  const normalizedPathname =
    pathname === "/" || pathname === "/demo/glowcart"
      ? "/index.html"
      : pathname;
  let relativePath;
  try {
    relativePath = decodeURIComponent(normalizedPathname).replace(/^\/+/, "");
  } catch {
    return null;
  }
  if (!relativePath || relativePath.includes("\0")) return null;
  const filePath = path.resolve(glowCartDistRoot, relativePath);
  const rootWithSeparator = `${glowCartDistRoot}${path.sep}`;
  if (filePath !== glowCartDistRoot && !filePath.startsWith(rootWithSeparator)) {
    return null;
  }
  return filePath;
};

const sendGlowCartDistFile = async (res, pathname, origin) => {
  const filePath = glowCartDistFilePath(pathname);
  if (!filePath || !(await fileExists(filePath))) return false;
  const body = await readFile(filePath);
  res.writeHead(200, staticHeaders(origin, mimeTypeForPath(filePath)));
  res.end(body);
  return true;
};

const startGlowCartDemo = () =>
  new Promise((resolve, reject) => {
    if (state.demo?.server?.listening && state.demo.url) {
      resolve(state.demo);
      return;
    }

    const demoServer = createServer(async (req, res) => {
      const origin = req.headers.origin || "*";

      if (req.method === "OPTIONS") {
        res.writeHead(204, htmlHeaders(origin));
        res.end();
        return;
      }

      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (req.method === "GET" && url.pathname === "/health") {
        sendJson(
          res,
          200,
          {
            name: "GlowCart Demo",
            ok: true,
            servedBy: "CaseForge Companion",
          },
          origin
        );
        return;
      }

      if (
        req.method === "GET" &&
        (await sendGlowCartDistFile(res, url.pathname, origin))
      ) {
        return;
      }

      if (
        req.method === "GET" &&
        (url.pathname === "/" || url.pathname === "/demo/glowcart")
      ) {
        sendHtml(res, 200, glowCartDemoHtml, origin);
        return;
      }

      sendHtml(
        res,
        404,
        "<!doctype html><title>Not found</title><h1>GlowCart route not found</h1>",
        origin
      );
    });

    demoServer.once("error", reject);
    demoServer.listen(0, HOST, () => {
      demoServer.off("error", reject);
      const address = demoServer.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const url = `http://${HOST}:${port}/`;
      state.demo = {
        port,
        server: demoServer,
        startedAt: Date.now(),
        url,
      };
      resolve(state.demo);
    });
  });

const closeGlowCartDemo = () =>
  new Promise((resolve) => {
    if (!state.demo?.server) {
      resolve();
      return;
    }
    const server = state.demo.server;
    state.demo = null;
    server.close(() => resolve());
  });

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
    value === "check" ||
    value === "uncheck" ||
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

const safeUrl = (value) => {
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
};

const cleanUrlAuth = (value) => {
  const url = safeUrl(value);
  if (!url) return value;
  url.username = "";
  url.password = "";
  return url.toString();
};

const authFromUrl = (value) => {
  const url = safeUrl(value);
  if (!url?.username) return null;
  return {
    password: url.password ? decodeURIComponent(url.password) : "",
    username: decodeURIComponent(url.username),
  };
};

const basicAuthHeader = (credentials) => {
  if (!credentials?.username) return null;
  return `Basic ${Buffer.from(`${credentials.username}:${credentials.password || ""}`, "utf8").toString("base64")}`;
};

const credentialsFromBody = (body, startUrl) => {
  const bodyCredentials =
    body?.httpCredentials &&
    typeof body.httpCredentials === "object" &&
    typeof body.httpCredentials.username === "string"
      ? {
          password:
            typeof body.httpCredentials.password === "string"
              ? body.httpCredentials.password
              : "",
          username: body.httpCredentials.username,
        }
      : null;
  return bodyCredentials || authFromUrl(startUrl);
};

const viewportFromBody = (body) =>
  body?.viewport &&
  typeof body.viewport === "object" &&
  Number.isFinite(Number(body.viewport.width)) &&
  Number.isFinite(Number(body.viewport.height))
    ? {
        height: Math.max(320, Number(body.viewport.height)),
        width: Math.max(320, Number(body.viewport.width)),
      }
    : { width: 1440, height: 900 };

const shouldMaximizeWindow = (body) => Boolean(body?.viewport?.maximize);

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
    command: type,
    type,
    name: commandName[type],
    description: payload.description || payload.label,
    locator: inferLocator(type, payload),
    inputValue:
      type === "fill" || type === "select" ? payload.value ?? "" : undefined,
    params: {
      key: type === "press" ? payload.key : undefined,
      rawValue: payload.rawValue ?? payload.value ?? "",
      value: payload.value ?? "",
    },
    rawValue: payload.rawValue ?? undefined,
    value: payload.value ?? undefined,
    domValue: payload.domValue ?? payload.value ?? undefined,
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
      domValue: payload.domValue,
      rawValue: payload.rawValue,
      source: "caseforge-local-agent",
      target: {
        label: payload.label,
        role: payload.role,
        tagName: payload.tagName,
        text: payload.text,
      },
    },
  });

  session.currentUrl = payload.url || session.currentUrl;
  session.updatedAt = now;
};

const isRecordableNavigationUrl = (value) => {
  if (!value || value.startsWith("about:blank") || value.startsWith("data:")) return false;
  try {
    const parsed = new URL(value);
    if (
      parsed.hostname === HOST &&
      String(parsed.port || (parsed.protocol === "https:" ? 443 : 80)) === String(PORT)
    ) {
      return false;
    }
    if (parsed.pathname.startsWith("/automation/browser")) return false;
    return true;
  } catch {
    return false;
  }
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

  const hoverBox = recorderUiRoot.querySelector("[data-caseforge-hover-box]");
  const hoverLabel = recorderUiRoot.querySelector("[data-caseforge-hover-label]");
  const captureToast = recorderUiRoot.querySelector("[data-caseforge-capture-toast]");
  let captureToastTimer = 0;

  const stepLabel = {
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

  const showCaptured = (type) => {
    if (!captureToast) return;
    captureToast.textContent = stepLabel[type] || "Captured step";
    captureToast.classList.add("is-visible");
    win.clearTimeout(captureToastTimer);
    captureToastTimer = win.setTimeout(() => {
      captureToast.classList.remove("is-visible");
    }, 900);
  };

  const updateHover = (element) => {
    if (!hoverBox || !hoverLabel || !element || recorderUiRoot.contains(element)) {
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
      showCaptured(payload.type);
      win.__caseforgeRecord?.({
        ...payload,
        url: location.href,
        timestamp: Date.now(),
      });
    } catch {
      // Keep the target app unaffected by recorder errors.
    }
  };

  const inputTimers = new WeakMap();
  const lastInputValue = new WeakMap();
  const rawInputBuffers = new WeakMap();
  const lastControlEmit = new WeakMap();
  let lastPointerTarget = null;

  const isInternalRecorderElement = (element) =>
    Boolean(element?.closest?.("[data-caseforge-recorder-ui]"));

  const isTextEntryElement = (element) => {
    if (
      element instanceof HTMLTextAreaElement ||
      element?.isContentEditable
    ) {
      return true;
    }
    if (!(element instanceof HTMLInputElement)) return false;
    const type = String(element.type || "text").toLowerCase();
    return ![
      "button",
      "checkbox",
      "color",
      "file",
      "hidden",
      "image",
      "radio",
      "range",
      "reset",
      "submit",
    ].includes(type);
  };

  const fieldValue = (element) =>
    element?.isContentEditable ? textOf(element) : String(element?.value ?? "");

  const selectedOptionLabel = (select) => {
    const selected = select.selectedOptions?.[0];
    return selected?.label || selected?.textContent?.trim() || select.value || "";
  };

  const elementPayload = (element) => ({
    selector: buildSelector(element),
    label: readLabel(element),
    role: roleOf(element),
    tagName: element?.tagName?.toLowerCase?.() || "",
    text: textOf(element),
  });

  const emitControl = (element, type, value, extra = {}) => {
    if (!element || isInternalRecorderElement(element)) return;
    const key = `${type}|${buildSelector(element)}|${value ?? ""}`;
    const previous = lastControlEmit.get(element);
    const now = Date.now();
    if (previous?.key === key && now - previous.at < 700) return;
    lastControlEmit.set(element, { at: now, key });
    invoke({
      ...elementPayload(element),
      description: extra.description,
      domValue: extra.domValue ?? value,
      rawValue: extra.rawValue ?? value,
      type,
      value,
    });
  };

  const updateRawInputBuffer = (element, event) => {
    if (!isTextEntryElement(element)) return;
    const current = rawInputBuffers.get(element) ?? fieldValue(element);
    const inputType = String(event.inputType || "");
    if (inputType.startsWith("delete")) {
      rawInputBuffers.set(element, current.slice(0, Math.max(0, current.length - 1)));
      return;
    }
    if (typeof event.data === "string") {
      rawInputBuffers.set(element, `${current}${event.data}`);
    }
  };

  const flushInput = (element) => {
    const timer = inputTimers.get(element);
    if (timer) {
      win.clearTimeout(timer);
      inputTimers.delete(element);
    }
    if (!isTextEntryElement(element)) return;
    const value = fieldValue(element);
    const previous = lastInputValue.get(element);
    if (previous === value) return;
    lastInputValue.set(element, value);
    const rawValue = rawInputBuffers.get(element) ?? value;
    rawInputBuffers.set(element, value);
    emitControl(element, "fill", value, {
      description: `Type "${rawValue || "value"}" into "${readLabel(element) || "field"}"`,
      domValue: value,
      rawValue,
    });
  };

  const scheduleInput = (element) => {
    if (!isTextEntryElement(element)) return;
    const existing = inputTimers.get(element);
    if (existing) win.clearTimeout(existing);
    inputTimers.set(element, win.setTimeout(() => flushInput(element), 650));
  };

  document.addEventListener(
    "pointermove",
    (event) => {
      lastPointerTarget =
        event.target instanceof Element ? event.target : lastPointerTarget;
      if (lastPointerTarget && !isInternalRecorderElement(lastPointerTarget)) {
        updateHover(lastPointerTarget);
      }
    },
    true
  );

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || isInternalRecorderElement(target)) return;
      if (
        target instanceof HTMLInputElement &&
        ["checkbox", "radio"].includes(String(target.type || "").toLowerCase())
      ) {
        return;
      }
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable
      ) {
        return;
      }
      emitControl(target, "click", "", {
        description: `Click "${readLabel(target) || textOf(target) || target.tagName.toLowerCase()}"`,
      });
    },
    true
  );

  document.addEventListener(
    "beforeinput",
    (event) => {
      updateRawInputBuffer(event.target, event);
    },
    true
  );

  document.addEventListener(
    "input",
    (event) => {
      const target = event.target;
      if (isTextEntryElement(target)) scheduleInput(target);
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

      if (target instanceof HTMLSelectElement) {
        const value = target.value;
        emitControl(target, "select", value, {
          description: `Select "${selectedOptionLabel(target)}" from "${readLabel(target) || "dropdown"}"`,
          domValue: value,
          rawValue: selectedOptionLabel(target),
        });
        return;
      }

      if (target instanceof HTMLInputElement) {
        const inputType = String(target.type || "text").toLowerCase();
        if (inputType === "checkbox") {
          emitControl(target, target.checked ? "check" : "uncheck", target.checked ? "on" : "off", {
            description: `${target.checked ? "Check" : "Uncheck"} "${readLabel(target) || "checkbox"}"`,
            domValue: String(target.checked),
            rawValue: String(target.checked),
          });
          return;
        }
        if (inputType === "radio") {
          if (!target.checked) return;
          emitControl(target, "check", target.value || "on", {
            description: `Select "${readLabel(target) || target.value || "radio option"}"`,
            domValue: target.value || "on",
            rawValue: target.value || "on",
          });
          return;
        }
        if (["file", "password"].includes(inputType)) return;
      }

      flushInput(target);
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
      if (isInternalRecorderElement(target)) return;
      if (isTextEntryElement(target) && ["Enter", "Tab"].includes(event.key)) {
        flushInput(target);
      }
      if (
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        ["Enter", "Escape", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
      ) {
        emitControl(target, "press", event.key, {
          description: `Press ${event.key}${readLabel(target) ? ` on "${readLabel(target)}"` : ""}`,
          domValue: event.key,
          rawValue: event.key,
        });
      }
    },
    true
  );

  win.addEventListener("blur", () => {
    if (lastPointerTarget) flushInput(lastPointerTarget);
  }, true);

  win.addEventListener("pagehide", () => {
    if (lastPointerTarget) flushInput(lastPointerTarget);
  }, true);
};

const attachRecorder = async (page, session) => {
  await page.exposeBinding("__caseforgeRecord", (_source, payload) => {
    if (session.playbackActive) return;
    if (session.status !== "recording") return;
    const pageUrl =
      payload?.pageUrl ||
      payload?.url ||
      (_source?.page && typeof _source.page.url === "function" ? _source.page.url() : "") ||
      page.url();
    if (pageUrl && pageUrl !== session.currentUrl) {
      session.currentUrl = pageUrl;
      session.updatedAt = Date.now();
    }
    setActivePage(page);
    pushCommand(session, payload);
  });
  await page.addInitScript(recorderInitScript);
  await page.evaluate(recorderInitScript).catch(() => undefined);

  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    const url = frame.url();
    if (!isRecordableNavigationUrl(url)) return;
    const record = pageRecordFor(page);
    if (record) record.url = url;
    setActivePage(page);
    if (session.playbackActive) return;
    if (session.status !== "recording") return;
    pushCommand(session, {
      type: "navigate",
      url,
      label: "Browser navigation",
      timestamp: Date.now(),
    });
  });

  page.on("console", (message) => {
    const text = message.text();
    if (/failed to load resource|status of 404|net::err_/i.test(text)) {
      return;
    }

    session.logs = [
      `[browser:${message.type()}] ${text}`,
      ...session.logs,
    ].slice(0, 40);
    session.updatedAt = Date.now();
  });

  page.on("load", () => {
    void refreshPageRecord(page).then(() => {
      if (state.page === page) {
        if (state.session) {
          state.session.currentUrl = page.url() || state.session.currentUrl;
          state.session.updatedAt = Date.now();
        }
        broadcastLivePreviewState();
      }
    });
  });

  page.on("close", () => {
    handlePageClosed(page);
  });
};

async function registerPage(page, session, options = {}) {
  const existing = pageRecordFor(page);
  if (existing) {
    if (options.makeActive) setActivePage(page, options);
    return existing;
  }

  const opener = typeof page.opener === "function" ? page.opener() : null;
  const openerRecord = opener ? pageRecordFor(opener) : null;
  const record = {
    createdAt: Date.now(),
    id: randomUUID(),
    openerId: openerRecord?.id || null,
    page,
    title: "",
    url: page.url() || "",
  };
  state.pages.set(page, record);

  await attachRecorder(page, session);
  await refreshPageRecord(page);

  if (options.makeActive) {
    setActivePage(page, options);
  } else {
    broadcastLivePreviewState();
  }
  return record;
}

const closeRuntime = async () => {
  const session = state.session;
  if (session && session.status !== "failed") {
    session.status = "stopped";
    session.updatedAt = Date.now();
    session.logs = ["Recording stopped.", ...session.logs];
  }

  for (const client of Array.from(state.livePreviewClients)) {
    closeLivePreviewClient(client);
  }
  await state.browser?.close().catch(() => undefined);
  state.browser = null;
  state.context = null;
  state.pages = new Map();
  state.page = null;
  state.activeTabId = null;
  state.session = null;
};

const getRecorderSnapshot = (session, cursor = 0) => ({
  activeTabId: state.activeTabId,
  sessionId: session.id,
  status: session.status,
  cursor: session.commands.length,
  currentUrl: session.currentUrl,
  tabs: livePreviewTabs(),
  url: session.currentUrl,
  commands: session.commands.slice(Number.isFinite(cursor) ? cursor : 0),
  logs: session.logs,
  agent: {
    name: "CaseForge Companion",
    version: AGENT_VERSION,
  },
});

async function sendLiveFrame(res, url, origin) {
  const sessionId = url.searchParams.get("sessionId") || "";
  const page = state.page;
  if (!state.session || state.session.id !== sessionId || !page) {
    sendPreviewSvg(res, 404, "Companion browser session is not active.", origin);
    return;
  }
  try {
    const screenshot = await page.screenshot({
      animations: "disabled",
      fullPage: false,
      type: "png",
    });
    state.session.currentUrl = page.url();
    state.session.updatedAt = Date.now();
    res.writeHead(200, staticHeaders(origin, "image/png"));
    res.end(screenshot);
  } catch (error) {
    sendPreviewSvg(
      res,
      503,
      error instanceof Error ? error.message : "Could not capture browser preview.",
      origin
    );
  }
}

const websocketAcceptKey = (key) =>
  createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`, "binary")
    .digest("base64");

const encodeWebSocketFrame = (payload, opcode = 1) => {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload));
  const length = data.length;
  const header =
    length < 126
      ? Buffer.from([0x80 | opcode, length])
      : length < 65536
        ? Buffer.from([0x80 | opcode, 126, (length >> 8) & 255, length & 255])
        : Buffer.from([
            0x80 | opcode,
            127,
            0,
            0,
            0,
            0,
            (length / 0x1000000) & 255,
            (length >> 16) & 255,
            (length >> 8) & 255,
            length & 255,
          ]);
  return Buffer.concat([header, data]);
};

const sendWebSocketJson = (client, payload) => {
  if (client.socket.destroyed) return;
  client.socket.write(encodeWebSocketFrame(JSON.stringify(payload), 1));
};

const sendWebSocketBinary = (client, payload) => {
  if (client.socket.destroyed) return;
  client.socket.write(encodeWebSocketFrame(payload, 2));
};

const parseWebSocketMessages = (buffer) => {
  const messages = [];
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    const masked = Boolean(second & 0x80);
    let length = second & 0x7f;
    let headerLength = 2;

    if (length === 126) {
      if (offset + 4 > buffer.length) break;
      length = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (length === 127) {
      if (offset + 10 > buffer.length) break;
      const high = buffer.readUInt32BE(offset + 2);
      const low = buffer.readUInt32BE(offset + 6);
      length = high * 0x100000000 + low;
      headerLength = 10;
    }

    const maskLength = masked ? 4 : 0;
    const frameEnd = offset + headerLength + maskLength + length;
    if (frameEnd > buffer.length) break;

    const payloadStart = offset + headerLength + maskLength;
    const payload = Buffer.from(buffer.subarray(payloadStart, frameEnd));
    if (masked) {
      const mask = buffer.subarray(offset + headerLength, offset + headerLength + 4);
      for (let index = 0; index < payload.length; index += 1) {
        payload[index] ^= mask[index % 4];
      }
    }

    if (opcode === 1) {
      messages.push({ opcode, text: payload.toString("utf8") });
    } else if (opcode === 8) {
      messages.push({ opcode, close: true });
    }

    offset = frameEnd;
  }

  return { messages, remaining: buffer.subarray(offset) };
};

const closeLivePreviewClient = (client) => {
  if (client.interval) clearInterval(client.interval);
  state.livePreviewClients.delete(client);
  if (!client.socket.destroyed) client.socket.destroy();
};

const captureLivePreviewFrameForClient = async (client) => {
  if (client.busy || client.socket.destroyed) return;
  const page = state.page;
  if (!state.session || state.session.id !== client.sessionId || !page) {
    sendWebSocketJson(client, {
      type: "error",
      error: "Companion browser session is not active.",
    });
    closeLivePreviewClient(client);
    return;
  }

  client.busy = true;
  try {
    const screenshot = await page.screenshot({
      animations: "disabled",
      fullPage: false,
      quality: 62,
      type: "jpeg",
    });
    state.session.currentUrl = page.url();
    state.session.updatedAt = Date.now();
    sendWebSocketBinary(client, screenshot);
    const scroll = await page.evaluate(() => {
      const root = document.scrollingElement || document.documentElement;
      return {
        maxX: Math.max(0, root.scrollWidth - window.innerWidth),
        maxY: Math.max(0, root.scrollHeight - window.innerHeight),
        x: window.scrollX || root.scrollLeft || 0,
        y: window.scrollY || root.scrollTop || 0,
      };
    }).catch(() => null);
    sendWebSocketJson(client, {
      type: "state",
      activeTabId: state.activeTabId,
      scroll,
      tabs: livePreviewTabs(),
      url: state.session.currentUrl,
    });
  } catch (error) {
    sendWebSocketJson(client, {
      type: "error",
      error: error instanceof Error ? error.message : "Could not capture browser preview.",
    });
  } finally {
    client.busy = false;
  }
};

const captureLivePreviewFramesForSession = (sessionId) => {
  for (const client of Array.from(state.livePreviewClients)) {
    if (client.sessionId === sessionId) {
      void captureLivePreviewFrameForClient(client);
    }
  }
};

const handleLivePreviewSocketMessage = async (client, payload) => {
  if (!payload || typeof payload !== "object") return;
  if (payload.type === "ping") {
    sendWebSocketJson(client, { type: "pong", at: Date.now() });
    return;
  }
  if (payload.type === "scroll" || payload.type === "scrollTo") {
    const result = await scrollLivePreview(
      {
        deltaX: payload.deltaX ?? 0,
        deltaY: payload.deltaY ?? 0,
        targetX: payload.targetX,
        targetY: payload.targetY,
        x: payload.x,
        y: payload.y,
      },
      new URL(`/automation/browser/scroll?sessionId=${encodeURIComponent(client.sessionId)}`, `http://${HOST}:${PORT}`)
    );
    sendWebSocketJson(client, {
      type: "scroll",
      ok: result.status >= 200 && result.status < 300,
      ...result.payload,
    });
    void captureLivePreviewFrameForClient(client);
    return;
  }
  if (payload.type === "browserCommand") {
    const result = await runBrowserControlCommand({
      command: payload.command,
      sessionId: client.sessionId,
      url: payload.url,
    });
    sendWebSocketJson(client, {
      type: "browserCommand",
      ok: result.status >= 200 && result.status < 300,
      ...result.payload,
    });
    void captureLivePreviewFrameForClient(client);
    return;
  }
  if (payload.type === "click" || payload.type === "doubleClick" || payload.type === "rightClick" || payload.type === "key") {
    const result = await interactLivePreview(
      payload,
      new URL(`/automation/browser/interact?sessionId=${encodeURIComponent(client.sessionId)}`, `http://${HOST}:${PORT}`)
    );
    sendWebSocketJson(client, {
      type: "interaction",
      ok: result.status >= 200 && result.status < 300,
      ...result.payload,
    });
    void captureLivePreviewFrameForClient(client);
  }
};

const handleLivePreviewSocketUpgrade = (req, socket, head, url) => {
  const sessionId = url.searchParams.get("sessionId") || "";
  const key = req.headers["sec-websocket-key"];
  if (!key || !state.session || state.session.id !== sessionId || !state.page) {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }

  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${websocketAcceptKey(key)}`,
      "\r\n",
    ].join("\r\n")
  );

  const client = {
    buffer: Buffer.from(head || []),
    busy: false,
    interval: null,
    sessionId,
    socket,
  };
  state.livePreviewClients.add(client);
  sendWebSocketJson(client, {
    type: "ready",
    sessionId,
    ...snapshotPayload(),
  });
  void captureLivePreviewFrameForClient(client);
  client.interval = setInterval(() => {
    void captureLivePreviewFrameForClient(client);
  }, 90);

  socket.on("data", (chunk) => {
    client.buffer = Buffer.concat([client.buffer, chunk]);
    const parsed = parseWebSocketMessages(client.buffer);
    client.buffer = parsed.remaining;
    for (const message of parsed.messages) {
      if (message.close) {
        closeLivePreviewClient(client);
        return;
      }
      if (!message.text) continue;
      try {
        void handleLivePreviewSocketMessage(client, JSON.parse(message.text));
      } catch {
        sendWebSocketJson(client, { type: "error", error: "Invalid live preview message." });
      }
    }
  });
  socket.on("close", () => closeLivePreviewClient(client));
  socket.on("error", () => closeLivePreviewClient(client));
};

async function inspectLivePoint(body, url) {
  const sessionId = url.searchParams.get("sessionId") || "";
  const page = state.page;
  if (!state.session || state.session.id !== sessionId || !page) {
    return { status: 404, payload: { error: "Companion browser session is not active." } };
  }
  const x = Number(body?.x);
  const y = Number(body?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { status: 400, payload: { error: "Inspector requires x and y coordinates." } };
  }

  const result = await page.evaluate(
    ({ x: pointX, y: pointY }) => {
      const cssEscape = (value) =>
        typeof CSS !== "undefined" && CSS.escape
          ? CSS.escape(value)
          : String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
      const textOf = (node) => String(node?.innerText || node?.textContent || "").replace(/\s+/g, " ").trim();
      const labelFor = (node) => {
        if (!(node instanceof HTMLElement)) return "";
        const aria = node.getAttribute("aria-label");
        if (aria) return aria.trim();
        const id = node.getAttribute("id");
        if (id) {
          const label = document.querySelector(`label[for="${cssEscape(id)}"]`);
          if (label) return textOf(label);
        }
        const wrappingLabel = node.closest("label");
        return wrappingLabel ? textOf(wrappingLabel) : "";
      };
      const cssPathFor = (node) => {
        if (!(node instanceof Element)) return "";
        if (node.id) return `#${cssEscape(node.id)}`;
        const parts = [];
        let current = node;
        while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
          const tag = current.tagName.toLowerCase();
          const parent = current.parentElement;
          if (!parent) {
            parts.unshift(tag);
            break;
          }
          const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
          const index = siblings.indexOf(current) + 1;
          parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag);
          current = parent;
        }
        return parts.join(" > ");
      };
      const roleFor = (node) => {
        if (!(node instanceof HTMLElement)) return "";
        const explicit = node.getAttribute("role");
        if (explicit) return explicit;
        const tag = node.tagName.toLowerCase();
        if (tag === "button") return "button";
        if (tag === "a") return "link";
        if (tag === "select") return "combobox";
        if (tag === "textarea") return "textbox";
        if (tag === "input") {
          const type = node.getAttribute("type") || "text";
          if (type === "checkbox") return "checkbox";
          if (type === "radio") return "radio";
          if (type === "submit" || type === "button") return "button";
          return "textbox";
        }
        return "";
      };

      const pointStack = (
        typeof document.elementsFromPoint === "function"
          ? document.elementsFromPoint(pointX, pointY)
          : [document.elementFromPoint(pointX, pointY)]
      ).filter((node) => node instanceof Element);
      if (!pointStack.length) return null;

      const isVisible = (node) => {
        if (!(node instanceof Element)) return false;
        const style = window.getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || 1) === 0) {
          return false;
        }
        const rect = node.getBoundingClientRect();
        return rect.width >= 1 && rect.height >= 1;
      };
      const pointInside = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return pointX >= rect.left && pointX <= rect.right && pointY >= rect.top && pointY <= rect.bottom;
      };
      const isModalContainer = (node) => {
        if (!(node instanceof HTMLElement) || !isVisible(node)) return false;
        const role = String(node.getAttribute("role") || "").toLowerCase();
        const ariaModal = String(node.getAttribute("aria-modal") || "").toLowerCase();
        const tag = node.tagName.toLowerCase();
        const className = String(node.className || "").toLowerCase();
        const style = window.getComputedStyle(node);
        return (
          (tag === "dialog" && node.open) ||
          role === "dialog" ||
          role === "alertdialog" ||
          ariaModal === "true" ||
          (style.position === "fixed" && pointInside(node) && /(modal|dialog|overlay|drawer|popover)/.test(className))
        );
      };
      const zIndexFor = (node) => {
        const value = Number.parseInt(window.getComputedStyle(node).zIndex || "0", 10);
        return Number.isFinite(value) ? value : 0;
      };
      const activeModal = Array.from(document.querySelectorAll("dialog,[role='dialog'],[role='alertdialog'],[aria-modal='true'],.modal,.dialog,.overlay,.drawer,.popover"))
        .filter((node) => isModalContainer(node) && pointInside(node))
        .sort((left, right) => zIndexFor(right) - zIndexFor(left))[0] || null;
      const isControl = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        const tag = node.tagName.toLowerCase();
        const role = roleFor(node);
        return (
          tag === "input" ||
          tag === "textarea" ||
          tag === "select" ||
          tag === "button" ||
          tag === "a" ||
          node.isContentEditable ||
          ["button", "link", "textbox", "combobox", "checkbox", "radio", "switch", "menuitem"].includes(role)
        );
      };
      const controlFromLabel = (node) => {
        const label = node instanceof HTMLLabelElement ? node : node?.closest?.("label");
        if (!(label instanceof HTMLLabelElement)) return null;
        if (label.control && pointInside(label.control)) return label.control;
        return label.control || label.querySelector("input,textarea,select,button,[role='button'],[role='textbox'],[role='combobox'],[role='checkbox'],[role='radio']");
      };
      const scoreCandidate = (node) => {
        if (!(node instanceof HTMLElement) || !isVisible(node)) return -1000;
        if (node.closest("[data-caseforge-recorder-ui]")) return -1000;
        if (activeModal && !activeModal.contains(node)) return -1000;
        const tag = node.tagName.toLowerCase();
        let score = 0;
        if (isControl(node)) score += 100;
        if (["html", "body"].includes(tag)) score -= 100;
        if (/(modal|dialog|overlay|backdrop|panel|container|wrapper)/i.test(String(node.className || ""))) score -= 18;
        if (labelFor(node)) score += 14;
        if (textOf(node)) score += 4;
        const rect = node.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (area > window.innerWidth * window.innerHeight * 0.35) score -= 28;
        if (activeModal && activeModal.contains(node)) score += 25;
        return score;
      };
      const candidateElements = [];
      for (const node of pointStack) {
        if (!(node instanceof HTMLElement)) continue;
        const labeledControl = controlFromLabel(node);
        if (labeledControl) candidateElements.push(labeledControl);
        candidateElements.push(node);
        const nestedControl = node.querySelector?.("input,textarea,select,button,a,[role='button'],[role='textbox'],[role='combobox'],[role='checkbox'],[role='radio']");
        if (nestedControl && pointInside(nestedControl)) candidateElements.push(nestedControl);
      }
      const element = [...new Set(candidateElements)]
        .filter((node) => node instanceof HTMLElement)
        .sort((left, right) => scoreCandidate(right) - scoreCandidate(left))[0];
      if (!element || scoreCandidate(element) < -999) return null;

      const rect = element.getBoundingClientRect();
      const tag = element.tagName.toLowerCase();
      const inputType = element instanceof HTMLInputElement ? element.type : "";
      const role = roleFor(element);
      const label = labelFor(element);
      const text = textOf(element).slice(0, 120);
      const candidates = [];
      const testId = element.getAttribute("data-testid") || element.getAttribute("data-test");
      if (testId) candidates.push({ score: 0.96, source: "companion-live-inspector", type: "testid", value: testId });
      if (role && (label || text)) candidates.push({ score: 0.9, source: "companion-live-inspector", type: "role", value: `${role}:${label || text}` });
      if (label) candidates.push({ score: 0.86, source: "companion-live-inspector", type: "label", value: label });
      const placeholder = element.getAttribute("placeholder");
      if (placeholder) candidates.push({ score: 0.82, source: "companion-live-inspector", type: "placeholder", value: placeholder });
      if (text) candidates.push({ score: 0.72, source: "companion-live-inspector", type: "text", value: text });
      const css = cssPathFor(element);
      if (css) candidates.push({ score: 0.58, source: "companion-live-inspector", type: "css", value: css });

      const suggestedActions =
        tag === "select"
          ? ["select", "assert"]
          : inputType === "checkbox" || role === "checkbox"
            ? ["check", "uncheck", "assert"]
            : inputType === "radio" || role === "radio"
              ? ["check", "assert"]
              : tag === "input" || tag === "textarea" || role === "textbox"
                ? ["fill", "clear", "assert"]
                : role === "button" || role === "link" || tag === "button" || tag === "a"
                  ? ["click", "doubleClick", "assert"]
                  : ["click", "assert"];

      return {
        bounds: {
          height: rect.height,
          width: rect.width,
          x: rect.x,
          y: rect.y,
        },
        element: {
          inputType,
          label,
          modal: Boolean(activeModal),
          role,
          tag,
          text,
        },
        inspectorPoint: { x: pointX, y: pointY },
        locatorCandidates: candidates,
        page: {
          title: document.title,
          url: location.href,
          viewport: {
            height: window.innerHeight,
            width: window.innerWidth,
          },
        },
        recommendedLocator: candidates[0] || null,
        status: "ok",
        suggestedActions,
      };
    },
    { x, y }
  );

  return { status: 200, payload: { result } };
}

async function switchActiveTab(body) {
  const session = state.session;
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  if (!session || session.id !== sessionId) {
    return { status: 404, payload: { error: "Companion browser session is not active." } };
  }
  const tabId = typeof body?.tabId === "string" ? body.tabId.trim() : "";
  if (!tabId) {
    return { status: 400, payload: { error: "Tab id is required." } };
  }
  const record = orderedPageRecords().find((entry) => entry.id === tabId) || null;
  if (!record) {
    return { status: 404, payload: { error: "Requested browser tab was not found." } };
  }
  await record.page.bringToFront().catch(() => undefined);
  setActivePage(record.page, {
    logMessage: `Switched Live Preview to ${record.title || record.url || "the selected tab"}.`,
  });
  return {
    status: 200,
    payload: {
      ok: true,
      ...getRecorderSnapshot(session, body?.cursor ?? session.commands.length),
    },
  };
}

async function runBrowserControlCommand(body) {
  const session = state.session;
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  const page = state.page;
  if (!session || session.id !== sessionId || !page) {
    return { status: 404, payload: { error: "Companion browser session is not active." } };
  }

  const command = String(body?.command || "").trim();
  const timeout = Number(body?.timeout || 12000);
  try {
    if (command === "navigate") {
      const destination = cleanUrlAuth(body?.url || body?.targetUrl || "");
      if (!destination) {
        return { status: 400, payload: { error: "URL is required." } };
      }
      await page.goto(destination, {
        timeout,
        waitUntil: "domcontentloaded",
      });
    } else if (command === "reload") {
      await page.reload({ timeout, waitUntil: "domcontentloaded" });
    } else if (command === "back") {
      await page.goBack({ timeout, waitUntil: "domcontentloaded" }).catch(() => undefined);
    } else if (command === "forward") {
      await page.goForward({ timeout, waitUntil: "domcontentloaded" }).catch(() => undefined);
    } else if (command === "newTab") {
      const destination = cleanUrlAuth(body?.url || session.currentUrl || "about:blank");
      if (!state.context) {
        return { status: 409, payload: { error: "Browser context is not available." } };
      }
      const nextPage = await state.context.newPage();
      await registerPage(nextPage, session, {
        logMessage: "A new browser tab opened from Live Preview controls.",
        makeActive: true,
      });
      if (destination && destination !== "about:blank") {
        await nextPage.goto(destination, {
          timeout,
          waitUntil: "domcontentloaded",
        }).catch(() => undefined);
      }
    } else {
      return { status: 400, payload: { error: `Unsupported browser command: ${command || "empty"}.` } };
    }

    const activePage = state.page || page;
    await refreshPageRecord(activePage);
    setActivePage(activePage, {
      logMessage:
        command === "navigate"
          ? `Navigated Live Preview to ${activePage.url() || "the requested URL"}.`
          : command === "reload"
            ? "Reloaded Live Preview."
            : command === "back"
              ? "Navigated Live Preview back."
              : command === "forward"
                ? "Navigated Live Preview forward."
                : undefined,
    });
    session.currentUrl = activePage.url() || session.currentUrl;
    session.updatedAt = Date.now();
    broadcastLivePreviewState();
    captureLivePreviewFramesForSession(session.id);
    return {
      status: 200,
      payload: {
        ok: true,
        ...getRecorderSnapshot(session, body?.cursor ?? session.commands.length),
      },
    };
  } catch (error) {
    return {
      status: 500,
      payload: {
        error: error instanceof Error ? error.message : "Could not control Live Preview browser.",
      },
    };
  }
}

async function scrollLivePreview(body, url) {
  const sessionId = url.searchParams.get("sessionId") || "";
  const page = state.page;
  if (!state.session || state.session.id !== sessionId || !page) {
    return { status: 404, payload: { error: "Companion browser session is not active." } };
  }
  const deltaX = Number(body?.deltaX ?? 0);
  const deltaY = Number(body?.deltaY ?? 0);
  const targetY = Number(body?.targetY);
  const targetX = Number(body?.targetX);
  if (
    !Number.isFinite(deltaX) ||
    !Number.isFinite(deltaY) ||
    (body?.targetY !== undefined && !Number.isFinite(targetY)) ||
    (body?.targetX !== undefined && !Number.isFinite(targetX))
  ) {
    return { status: 400, payload: { error: "Scroll requires numeric delta values." } };
  }
  const x = Number(body?.x);
  const y = Number(body?.y);
  if (Number.isFinite(x) && Number.isFinite(y)) {
    await page.mouse.move(x, y).catch(() => undefined);
  }
  const shouldSetAbsoluteScroll =
    Number.isFinite(targetY) || Number.isFinite(targetX);
  if (!shouldSetAbsoluteScroll && (Math.abs(deltaX) > 0 || Math.abs(deltaY) > 0)) {
    await page.mouse.wheel(deltaX, deltaY);
  }
  const scroll = await page.evaluate(
    ({ targetX, targetY }) => {
      const root = document.scrollingElement || document.documentElement;
      if (Number.isFinite(targetY) || Number.isFinite(targetX)) {
        root.scrollTo({
          left: Number.isFinite(targetX) ? targetX : root.scrollLeft,
          top: Number.isFinite(targetY) ? targetY : root.scrollTop,
        });
      }
      return {
        maxX: Math.max(0, root.scrollWidth - window.innerWidth),
        maxY: Math.max(0, root.scrollHeight - window.innerHeight),
        x: window.scrollX || root.scrollLeft || 0,
        y: window.scrollY || root.scrollTop || 0,
      };
    },
    {
      targetX: Number.isFinite(targetX) ? targetX : null,
      targetY: Number.isFinite(targetY) ? targetY : null,
    }
  );
  state.session.currentUrl = page.url();
  state.session.updatedAt = Date.now();
  return {
    status: 200,
    payload: {
      activeTabId: state.activeTabId,
      ok: true,
      scroll,
      tabs: livePreviewTabs(),
      url: state.session.currentUrl,
    },
  };
}

async function interactLivePreview(body, url) {
  const sessionId = url.searchParams.get("sessionId") || "";
  const page = state.page;
  if (!state.session || state.session.id !== sessionId || !page) {
    return { status: 404, payload: { error: "Companion browser session is not active." } };
  }

  const type = String(body?.type || "click");
  const x = Number(body?.x);
  const y = Number(body?.y);
  if (Number.isFinite(x) && Number.isFinite(y)) {
    await page.mouse.move(x, y).catch(() => undefined);
  }

  const targetBlankLink =
    (type === "click" || type === "doubleClick") &&
    Number.isFinite(x) &&
    Number.isFinite(y)
      ? await page.evaluate(
          ({ x: pointX, y: pointY }) => {
            const element = document.elementFromPoint(pointX, pointY);
            const link = element instanceof Element ? element.closest("a[href]") : null;
            if (!(link instanceof HTMLAnchorElement)) return null;
            return {
              href: link.href,
              target: link.target || "",
            };
          },
          { x, y }
        ).catch(() => null)
      : null;
  const popupPromise =
    (type === "click" || type === "doubleClick") && state.context
      ? state.context.waitForEvent("page", { timeout: 1600 }).catch(() => null)
      : Promise.resolve(null);

  if (type === "click") {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { status: 400, payload: { error: "Click requires x and y coordinates." } };
    }
    await page.mouse.click(x, y, { button: "left" });
  } else if (type === "doubleClick") {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { status: 400, payload: { error: "Double click requires x and y coordinates." } };
    }
    await page.mouse.dblclick(x, y, { button: "left" });
  } else if (type === "rightClick") {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { status: 400, payload: { error: "Right click requires x and y coordinates." } };
    }
    await page.mouse.click(x, y, { button: "right" });
  } else if (type === "key") {
    const key = String(body?.key || "");
    const text = typeof body?.text === "string" ? body.text : "";
    if (text && text.length === 1 && !body?.ctrlKey && !body?.metaKey && !body?.altKey) {
      await page.keyboard.type(text);
    } else if (key) {
      await page.keyboard.press(key);
    } else {
      return { status: 400, payload: { error: "Key interaction requires key or text." } };
    }
  } else {
    return { status: 400, payload: { error: `Unsupported interaction: ${type}` } };
  }

  const popupPage = await popupPromise;
  if (popupPage) {
    await popupPage.waitForLoadState("domcontentloaded", { timeout: 4000 }).catch(() => undefined);
    await registerPage(popupPage, state.session, {
      logMessage: "A new browser tab opened in Live Preview.",
      makeActive: true,
    });
  } else if (
    state.context &&
    targetBlankLink?.href &&
    String(targetBlankLink.target).toLowerCase() === "_blank"
  ) {
    const managedTab = await state.context.newPage();
    await registerPage(managedTab, state.session, {
      logMessage: "A new browser tab opened in Live Preview.",
      makeActive: true,
    });
    await managedTab.goto(cleanUrlAuth(targetBlankLink.href), {
      timeout: 12000,
      waitUntil: "domcontentloaded",
    }).catch(() => undefined);
    await refreshPageRecord(managedTab);
    setActivePage(managedTab);
  }

  const activePage = state.page || page;
  const scroll = await activePage.evaluate(() => {
    const root = document.scrollingElement || document.documentElement;
    return {
      maxX: Math.max(0, root.scrollWidth - window.innerWidth),
      maxY: Math.max(0, root.scrollHeight - window.innerHeight),
      x: window.scrollX || root.scrollLeft || 0,
      y: window.scrollY || root.scrollTop || 0,
    };
  }).catch(() => null);
  state.session.currentUrl = activePage.url();
  state.session.updatedAt = Date.now();
  return {
    status: 200,
    payload: {
      activeTabId: state.activeTabId,
      ok: true,
      scroll,
      status: state.session.status,
      tabs: livePreviewTabs(),
      url: state.session.currentUrl,
    },
  };
}

function frameScopeFor(page, step) {
  const frameUrl = step.options?.frameUrl || "";
  const frameName = step.options?.frameName || "";
  if (!frameUrl && !frameName) return page;

  const frames = page.frames();
  if (frameName) {
    const namedFrame = frames.find((frame) => frame.name() === frameName);
    if (namedFrame) return namedFrame;
  }
  if (frameUrl) {
    const partialFrame = frames.find((frame) => {
      const url = frame.url();
      return url && (url.includes(frameUrl) || frameUrl.includes(url));
    });
    if (partialFrame) return partialFrame;
  }
  return page;
}

function cssAttributeValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function looksLikeBareLocatorToken(value) {
  return /^[A-Za-z][A-Za-z0-9_-]*$/.test(String(value || "").trim());
}

function normalizedLocatorTypeForStep(step, target, value) {
  const explicitType = target.locatorType || target.strategy || step.locatorType || step.strategy || "";
  if (explicitType) return String(explicitType).toLowerCase();
  const matchingCandidate = (Array.isArray(step.locatorCandidates) ? step.locatorCandidates : []).find((candidate) => {
    const candidateValue = candidate?.value || "";
    return String(candidateValue).trim() === String(value || "").trim();
  });
  if (matchingCandidate?.type || matchingCandidate?.strategy || matchingCandidate?.locatorType) {
    return String(matchingCandidate.type || matchingCandidate.strategy || matchingCandidate.locatorType).toLowerCase();
  }
  return looksLikeBareLocatorToken(value) ? "testid" : "css";
}

function locatorIndexForStep(step) {
  const raw =
    step?.options?.elementIndex ??
    step?.options?.ordinalIndex ??
    step?.options?.index ??
    step?.elementIndex ??
    step?.ordinalIndex ??
    "";
  if (raw === undefined || raw === null || raw === "") return null;
  const number = Number(raw);
  if (!Number.isFinite(number)) throw new Error(`Element Index must be a number. Received "${raw}".`);
  const indexBase = String(step?.options?.indexBase || step?.indexBase || "oneBased").toLowerCase();
  const zeroBasedIndex = indexBase === "zerobased" || indexBase === "zero-based" ? number : number - 1;
  if (!Number.isInteger(zeroBasedIndex) || zeroBasedIndex < 0) {
    throw new Error(`Element Index resolved to ${number}, which is outside the valid range.`);
  }
  return zeroBasedIndex;
}

function applyLocatorIndex(locator, step) {
  const index = locatorIndexForStep(step);
  if (index === null && step?.action === "getElementCount") return locator;
  if (index === null) return typeof locator.first === "function" ? locator.first() : locator;
  if (typeof locator.nth !== "function") return locator;
  return locator.nth(index);
}

function locatorFor(page, step) {
  const scope = frameScopeFor(page, step);
  const target = step.target || {};
  const value = target.value || step.locatorValue || "";
  const locatorType = normalizedLocatorTypeForStep(step, target, value);
  const action = step.action;

  if (
    !value &&
    !["navigate", "goto", "reload", "goBack", "goForward", "wait", "waitForTimeout", "executeScript"].includes(action)
  ) {
    throw new Error(`Step ${step.id || action} is missing a locator.`);
  }

  if (locatorType === "text") return applyLocatorIndex(scope.getByText(value), step);
  if (locatorType === "aria-label" || locatorType === "label") return applyLocatorIndex(scope.getByLabel(value), step);
  if (locatorType === "placeholder") return applyLocatorIndex(scope.getByPlaceholder(value), step);
  if (locatorType === "alt") return applyLocatorIndex(scope.getByAltText(value), step);
  if (locatorType === "title") return applyLocatorIndex(scope.getByTitle(value), step);
  if (locatorType === "testid" || locatorType === "data-testid" || locatorType === "data-test" || locatorType === "data-qa" || locatorType === "data-cy") {
    const escaped = cssAttributeValue(value);
    return applyLocatorIndex(
      scope.locator(`[data-testid="${escaped}"],[data-test="${escaped}"],[data-qa="${escaped}"],[data-cy="${escaped}"]`),
      step,
    );
  }
  if (locatorType === "role") {
    const separator = value.indexOf(":");
    const role = separator >= 0 ? value.slice(0, separator) : value;
    const name = separator >= 0 ? value.slice(separator + 1) : "";
    return applyLocatorIndex(scope.getByRole(role, name ? { name } : undefined), step);
  }
  if (locatorType === "id") return applyLocatorIndex(scope.locator(`#${value}`), step);
  if (locatorType === "xpath") return applyLocatorIndex(scope.locator(`xpath=${value}`), step);
  return applyLocatorIndex(scope.locator(value), step);
}

function numericPointFromStep(step) {
  const explicitX = Number(step?.options?.x ?? step?.x);
  const explicitY = Number(step?.options?.y ?? step?.y);
  if (Number.isFinite(explicitX) && Number.isFinite(explicitY)) {
    return { x: explicitX, y: explicitY };
  }

  const point = step?.inspectorPoint || step?.options?.inspectorPoint || step?.target?.inspectorPoint;
  const pointX = Number(point?.x);
  const pointY = Number(point?.y);
  if (Number.isFinite(pointX) && Number.isFinite(pointY)) {
    return { x: pointX, y: pointY };
  }

  const bounds =
    step?.bounds ||
    step?.boundingBox ||
    step?.element?.bounds ||
    step?.element?.boundingBox ||
    step?.target?.bounds ||
    step?.target?.boundingBox ||
    step?.options?.bounds ||
    step?.options?.boundingBox;
  const x = Number(bounds?.x);
  const y = Number(bounds?.y);
  const width = Number(bounds?.width);
  const height = Number(bounds?.height);
  if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(width) && Number.isFinite(height)) {
    return { x: x + Math.max(1, width) / 2, y: y + Math.max(1, height) / 2 };
  }
  return null;
}

async function clickLocatorWithPointFallback(page, locator, step, clickOptions, fallbackAction = "click") {
  const supportsPopupTracking =
    fallbackAction === "click" || fallbackAction === "doubleClick";
  const targetBlankLink = supportsPopupTracking
    ? await locator
        .evaluate((element) => {
          const link = element instanceof Element ? element.closest("a[href]") : null;
          if (!(link instanceof HTMLAnchorElement)) return null;
          return {
            href: link.href,
            target: link.target || "",
          };
        })
        .catch(() => null)
    : null;
  const popupPromise =
    supportsPopupTracking && state.context
      ? state.context.waitForEvent("page", { timeout: 1600 }).catch(() => null)
      : Promise.resolve(null);
  try {
    if (fallbackAction === "doubleClick") await locator.dblclick(clickOptions);
    else await locator.click(clickOptions);
  } catch (error) {
    const point = numericPointFromStep(step);
    if (!point) throw error;

    await page.mouse.move(point.x, point.y).catch(() => undefined);
    if (fallbackAction === "doubleClick") {
      await page.mouse.dblclick(point.x, point.y, { button: "left" });
    } else {
      const button = clickOptions?.button === "right" ? "right" : "left";
      await page.mouse.click(point.x, point.y, { button });
    }
  }

  const popupPage = await popupPromise;
  if (popupPage) {
    await popupPage.waitForLoadState("domcontentloaded", { timeout: 4000 }).catch(() => undefined);
    await registerPage(popupPage, state.session, {
      logMessage: "A new browser tab opened in Live Preview.",
      makeActive: true,
    });
    return state.page || popupPage;
  }

  if (
    state.context &&
    targetBlankLink?.href &&
    String(targetBlankLink.target).toLowerCase() === "_blank"
  ) {
    const managedTab = await state.context.newPage();
    await registerPage(managedTab, state.session, {
      logMessage: "A new browser tab opened in Live Preview.",
      makeActive: true,
    });
    await managedTab.goto(cleanUrlAuth(targetBlankLink.href), {
      timeout: 12000,
      waitUntil: "domcontentloaded",
    }).catch(() => undefined);
    await refreshPageRecord(managedTab);
    setActivePage(managedTab);
    return state.page || managedTab;
  }

  return state.page || page;
}

function stringifyRuntimeValue(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function parseRuntimePath(path) {
  return String(path || "")
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
}

function getRuntimePathValue(source, path) {
  const parts = parseRuntimePath(path);
  if (!parts.length) return source;
  let current = source;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return current;
}

function runtimeVariableValue(variables, name) {
  const key = String(name || "").trim();
  if (!key) return undefined;
  if (Object.prototype.hasOwnProperty.call(variables, key)) return variables[key];
  return getRuntimePathValue(variables, key);
}

function interpolateRuntimeVariables(value, variables) {
  if (typeof value !== "string") return value;
  return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, name) => {
    const key = String(name || "").trim();
    const variableValue = runtimeVariableValue(variables, key);
    if (!key || variableValue === undefined) return match;
    return stringifyRuntimeValue(variableValue);
  });
}

function stringifyJavaScriptRuntimeValue(value) {
  if (value === undefined) return "undefined";
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify(String(value));
  }
}

function interpolateJavaScriptRuntimeVariables(value, variables) {
  if (typeof value !== "string") return value;
  return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, name) => {
    const key = String(name || "").trim();
    const variableValue = runtimeVariableValue(variables, key);
    if (!key || variableValue === undefined) return match;
    return stringifyJavaScriptRuntimeValue(variableValue);
  });
}

function resolveRuntimeValue(value, variables) {
  if (typeof value === "string") return interpolateRuntimeVariables(value, variables);
  if (Array.isArray(value)) return value.map((item) => resolveRuntimeValue(item, variables));
  if (value && typeof value === "object") {
    if (String(value.action || "") === "runJavaScriptSnippet") {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => {
          if (key === "options" && item && typeof item === "object" && !Array.isArray(item)) {
            return [
              key,
              Object.fromEntries(
                Object.entries(item).map(([optionKey, optionValue]) => [
                  optionKey,
                  optionKey === "script"
                    ? interpolateJavaScriptRuntimeVariables(optionValue, variables)
                    : resolveRuntimeValue(optionValue, variables),
                ]),
              ),
            ];
          }
          if (key === "inputValue" || key === "script") {
            return [key, interpolateJavaScriptRuntimeVariables(item, variables)];
          }
          return [key, resolveRuntimeValue(item, variables)];
        })
      );
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveRuntimeValue(item, variables)])
    );
  }
  return value;
}

function outputVariableNameForStep(step) {
  return String(
    step?.options?.outputVariableName ||
      step?.outputVariableName ||
      step?.options?.variableName ||
      step?.options?.saveAs ||
      ""
  ).trim();
}

function optionalNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function optionBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  return fallback;
}

function parseStructuredRuntimeValue(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  if (Array.isArray(value) || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "object") return value;
  const text = String(value).trim();
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return text.includes(",") ? text.split(",").map((item) => item.trim()).filter(Boolean) : value;
  }
}

function normalizeRuntimeSteps(value) {
  const parsed = parseStructuredRuntimeValue(value, []);
  return Array.isArray(parsed) ? parsed.filter((step) => step && typeof step === "object") : [];
}

function comparableRuntimeValue(value, caseSensitive = false) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") {
    const text = value.replace(/\s+/g, " ").trim();
    return caseSensitive ? text : text.toLowerCase();
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  const text = stringifyRuntimeValue(value);
  return caseSensitive ? text : text.toLowerCase();
}

function evaluateRuntimeComparison(actual, expected, operator = "equals", options = {}) {
  const normalizedOperator = String(operator || "equals");
  const caseSensitive = optionBoolean(options.caseSensitive, false);
  const left = comparableRuntimeValue(actual, caseSensitive);
  const right = comparableRuntimeValue(expected, caseSensitive);
  if (normalizedOperator === "isEmpty") {
    return actual === undefined || actual === null || (typeof actual === "string" && actual.trim() === "") || (Array.isArray(actual) && !actual.length) || (typeof actual === "object" && actual && !Object.keys(actual).length);
  }
  if (normalizedOperator === "isNotEmpty") return !evaluateRuntimeComparison(actual, expected, "isEmpty", options);
  if (normalizedOperator === "notEquals") return left !== right;
  if (normalizedOperator === "contains") return String(left).includes(String(right));
  if (normalizedOperator === "notContains") return !String(left).includes(String(right));
  if (normalizedOperator === "greaterThan") return Number(actual) > Number(expected);
  if (normalizedOperator === "lessThan") return Number(actual) < Number(expected);
  if (normalizedOperator === "greaterOrEqual") return Number(actual) >= Number(expected);
  if (normalizedOperator === "lessOrEqual") return Number(actual) <= Number(expected);
  if (normalizedOperator === "regex") {
    try {
      return new RegExp(String(expected), caseSensitive ? "" : "i").test(String(actual ?? ""));
    } catch {
      return false;
    }
  }
  return left === right;
}

async function runtimeContextSnapshot(page, runtimeVariables = {}) {
  const viewport = page.viewportSize?.() || { height: 0, width: 0 };
  let title = "";
  try {
    title = await page.title();
  } catch {
    title = "";
  }
  const width = Number(viewport?.width || 0);
  const device = width <= 767 ? "phone" : width <= 1023 ? "tablet" : "desktop";
  return {
    baseUrl: (() => {
      try {
        const parsed = new URL(page.url());
        return `${parsed.protocol}//${parsed.host}`;
      } catch {
        return "";
      }
    })(),
    browser: "chromium",
    currentUrl: page.url(),
    device,
    env: runtimeVariables.env || runtimeVariables.environment || runtimeVariables.environmentName || "",
    platform: process.platform,
    title,
    variables: runtimeVariables,
    viewport: {
      height: Number(viewport?.height || 0),
      width,
    },
  };
}

async function evaluateRuntimeExpression(page, expression, runtimeVariables, extraContext = {}) {
  const source = String(expression || "").trim();
  if (!source) return false;
  const context = { ...(await runtimeContextSnapshot(page, runtimeVariables)), ...extraContext };
  return await page.evaluate(async ({ context, source }) => {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const runAsBody = async () => new AsyncFunction("context", "variables", "viewport", "currentUrl", "title", "env", source)(
      context,
      context.variables || {},
      context.viewport || {},
      context.currentUrl || "",
      context.title || "",
      context.env || "",
    );
    const runAsExpression = async () => new AsyncFunction("context", "variables", "viewport", "currentUrl", "title", "env", `return (${source});`)(
      context,
      context.variables || {},
      context.viewport || {},
      context.currentUrl || "",
      context.title || "",
      context.env || "",
    );
    try {
      const bodyValue = await runAsBody();
      if (bodyValue !== undefined || /\breturn\b/.test(source)) return bodyValue;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
    return await runAsExpression();
  }, { context, source });
}

async function evaluateAutomationCondition(page, options = {}, runtimeVariables = {}) {
  const source = String(options.conditionSource || options.source || "variable");
  const operator = String(options.operator || "equals");
  const expected = resolveRuntimeValue(options.expectedValue ?? options.rightValue ?? options.value ?? "", runtimeVariables);
  if (source === "javascript" || source === "expression") {
    return Boolean(await evaluateRuntimeExpression(page, options.expression || options.condition || "", runtimeVariables));
  }
  if (source === "element") {
    const locator = String(options.locator || options.elementLocator || options.target?.value || "").trim();
    if (!locator) return false;
    const visible = await page.locator(locator).first().isVisible({ timeout: optionalNumber(options.timeoutMs || options.timeout) ?? 2000 }).catch(() => false);
    if (operator === "notExists" || operator === "notEquals") return !visible;
    return visible;
  }

  const context = await runtimeContextSnapshot(page, runtimeVariables);
  let actual;
  if (source === "viewport") actual = context.device;
  else if (source === "resolutionWidth") actual = context.viewport.width;
  else if (source === "resolutionHeight") actual = context.viewport.height;
  else if (source === "environment") actual = options.environmentName || context.env;
  else if (source === "baseUrl") actual = context.baseUrl;
  else if (source === "currentUrl") actual = context.currentUrl;
  else if (source === "pageTitle") actual = context.title;
  else if (source === "browser") actual = context.browser;
  else if (source === "platform") actual = context.platform;
  else actual = runtimeVariableValue(runtimeVariables, options.variableName || options.leftValue || options.name);
  return evaluateRuntimeComparison(actual, expected, operator, options);
}

function setLoopVariables(runtimeVariables, loopState, itemVariableName = "item", keyVariableName = "key", valueVariableName = "value") {
  runtimeVariables.loop = loopState;
  runtimeVariables["loop.index"] = loopState.index;
  runtimeVariables["loop.number"] = loopState.number;
  runtimeVariables["loop.count"] = loopState.count;
  runtimeVariables["loop.first"] = loopState.first;
  runtimeVariables["loop.last"] = loopState.last;
  if ("item" in loopState) runtimeVariables[itemVariableName || "item"] = loopState.item;
  if ("key" in loopState) runtimeVariables[keyVariableName || "key"] = loopState.key;
  if ("value" in loopState) runtimeVariables[valueVariableName || "value"] = loopState.value;
  if ("row" in loopState) runtimeVariables.row = loopState.row;
}

function runtimeCollectionSource(options = {}, runtimeVariables = {}) {
  const sourceName = String(options.source || options.actual || options.variableName || "").trim().replace(/^\{\{\s*|\s*\}\}$/g, "");
  const value = sourceName ? runtimeVariableValue(runtimeVariables, sourceName) : options.items ?? options.entries ?? options.value;
  return parseStructuredRuntimeValue(value, value);
}

function normalizeList(value) {
  const parsed = parseStructuredRuntimeValue(value, []);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") return Object.entries(parsed).map(([key, item]) => ({ key, value: item }));
  return parsed === undefined || parsed === null || parsed === "" ? [] : [parsed];
}

function collectionItemValue(item, field) {
  const key = String(field || "").trim();
  return key ? getRuntimePathValue(item, key) : item;
}

async function executeCollectionCommand(page, step, runtimeVariables = {}) {
  const action = step.action;
  const options = step.options || {};
  const source = runtimeCollectionSource(options, runtimeVariables);
  const list = normalizeList(source);
  const sourceType = Array.isArray(source) ? "list" : source && typeof source === "object" ? "map" : typeof source;
  const expression = String(options.expression || "").trim();
  const itemMatches = async (item, index) => {
    if (expression) {
      return Boolean(await evaluateRuntimeExpression(page, expression, runtimeVariables, { index, item }));
    }
    return evaluateRuntimeComparison(
      collectionItemValue(item, options.field),
      options.expectedValue ?? options.matchValue ?? options.value ?? "",
      options.operator || "equals",
      options,
    );
  };
  const mapItem = async (item, index) => {
    if (expression) return await evaluateRuntimeExpression(page, expression, runtimeVariables, { index, item });
    return options.field ? collectionItemValue(item, options.field) : item;
  };

  if (action === "createList") return normalizeList(options.items);
  if (action === "addItemToList") return [...list, parseStructuredRuntimeValue(options.item, options.item)];
  if (action === "removeItemFromList") {
    const index = optionalNumber(options.index);
    if (index !== null) return list.filter((_item, itemIndex) => itemIndex !== index);
    return list.filter((item) => !evaluateRuntimeComparison(collectionItemValue(item, options.matchField), options.matchValue, options.operator || "equals", options));
  }
  if (action === "countListItems") return list.length;
  if (action === "filterList") return Promise.all(list.map(itemMatches)).then((matches) => list.filter((_item, index) => matches[index]));
  if (action === "mapList") return Promise.all(list.map(mapItem));
  if (action === "findItemInList") {
    for (const [index, item] of list.entries()) {
      if (await itemMatches(item, index)) return item;
    }
    return null;
  }
  if (action === "listContains") {
    for (const [index, item] of list.entries()) {
      if (await itemMatches(item, index)) return true;
    }
    return false;
  }
  if (action === "sortList") {
    const order = String(options.sortOrder || "asc") === "desc" ? -1 : 1;
    const type = String(options.dataType || "string");
    const convert = (value) => type === "number" ? Number(String(value).replace(/[^0-9.-]/g, "")) : type === "date" ? Date.parse(String(value)) : String(value ?? "").toLowerCase();
    return [...list].sort((a, b) => (convert(collectionItemValue(a, options.field)) > convert(collectionItemValue(b, options.field)) ? order : -order));
  }
  if (action === "getListItem") {
    const index = optionalNumber(options.index) ?? 0;
    return index < 0 ? list[list.length + index] : list[index];
  }
  if (action === "joinList") return list.map((item) => stringifyRuntimeValue(item)).join(String(options.separator ?? ","));
  if (action === "splitTextToList") return String(options.text || "").split(String(options.separator ?? ",")).map((item) => item.trim());
  if (action === "uniqueList") {
    const seen = new Set();
    return list.filter((item) => {
      const key = stringifyRuntimeValue(collectionItemValue(item, options.field));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  if (action === "compareLists") {
    const expected = normalizeList(options.expected);
    const actualText = list.map((item) => stringifyRuntimeValue(item));
    const expectedText = expected.map((item) => stringifyRuntimeValue(item));
    const mode = String(options.compareMode || "exact");
    const passed = mode === "containsExpected"
      ? expectedText.every((item) => actualText.includes(item))
      : mode === "ignoreOrder"
        ? actualText.length === expectedText.length && expectedText.every((item) => actualText.includes(item))
        : stringifyRuntimeValue(list) === stringifyRuntimeValue(expected);
    const output = { actual: list, expected, missingItems: expected.filter((item) => !actualText.includes(stringifyRuntimeValue(item))), passed };
    if (!passed) {
      const error = new Error("List comparison failed.");
      error.output = output;
      throw error;
    }
    return output;
  }
  if (action === "createMap") return parseStructuredRuntimeValue(options.entries, {});
  if (action === "setMapValue") return { ...(source && typeof source === "object" && !Array.isArray(source) ? source : {}), [options.key]: parseStructuredRuntimeValue(options.value, options.value) };
  if (action === "getMapValue") return getRuntimePathValue(source, options.key);
  if (action === "mapKeys") return source && typeof source === "object" ? Object.keys(source) : [];
  if (action === "mapValues") return source && typeof source === "object" ? Object.values(source) : [];
  if (action === "mergeMaps") return {
    ...(source && typeof source === "object" && !Array.isArray(source) ? source : {}),
    ...(parseStructuredRuntimeValue(options.other, {}) || {}),
  };
  throw new Error(`Unsupported collection action: ${action}`);
}

async function extractWebElements(page, step) {
  const options = step.options || {};
  const locator = locatorFor(page, step);
  const includeHidden = optionBoolean(options.includeHidden, false);
  const trimWhitespace = optionBoolean(options.trimWhitespace, true);
  const attributeName = String(options.attributeName || "").trim();
  const maxItems = Math.max(1, optionalNumber(options.maxItems) ?? 500);
  return await locator.evaluateAll((elements, config) => {
    const clean = (value) => {
      const text = String(value ?? "");
      return config.trimWhitespace ? text.replace(/\s+/g, " ").trim() : text;
    };
    const visible = (element) => {
      if (config.includeHidden) return true;
      if (!element || !element.isConnected || element.closest("[hidden],[aria-hidden='true']")) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const cssEscape = (value) =>
      window.CSS?.escape ? window.CSS.escape(String(value)) : String(value).replace(/"/g, '\\"');
    const roleOf = (element) => {
      const role = element.getAttribute("role");
      if (role) return role;
      const tag = element.tagName.toLowerCase();
      if (tag === "button") return "button";
      if (tag === "a") return "link";
      if (tag === "select") return "combobox";
      if (tag === "textarea") return "textbox";
      if (tag === "input") {
        const type = String(element.getAttribute("type") || "text").toLowerCase();
        if (type === "checkbox") return "checkbox";
        if (type === "radio") return "radio";
        if (type === "submit" || type === "button") return "button";
        return "textbox";
      }
      return "";
    };
    const locatorHint = (element, text) => {
      const testId =
        element.getAttribute("data-testid") ||
        element.getAttribute("data-test") ||
        element.getAttribute("data-qa") ||
        element.getAttribute("data-cy");
      if (testId) return { type: "testid", value: testId };
      const id = element.getAttribute("id");
      if (id) return { type: "css", value: `#${cssEscape(id)}` };
      const aria = element.getAttribute("aria-label");
      const role = roleOf(element);
      if (aria && role) return { type: "role", value: `${role}:${aria}` };
      if (text) return { type: "text", value: text.slice(0, 120) };
      return { type: "css", value: element.tagName.toLowerCase() };
    };
    return elements
      .filter(visible)
      .slice(0, config.maxItems)
      .map((element, index) => {
        const text = clean(element.innerText || element.textContent || "");
        const attributeValue = config.attributeName ? clean(element.getAttribute(config.attributeName) || "") : "";
        const rect = element.getBoundingClientRect();
        return {
          attributeName: config.attributeName,
          attributeValue,
          index,
          locator: locatorHint(element, text),
          role: roleOf(element),
          tag: element.tagName.toLowerCase(),
          text,
          visible: visible(element),
          x: Math.round(rect.left),
          y: Math.round(rect.top),
        };
      });
  }, { attributeName, includeHidden, maxItems, trimWhitespace });
}

const collectionActionNames = new Set([
  "addItemToList",
  "compareLists",
  "countListItems",
  "createList",
  "createMap",
  "filterList",
  "findItemInList",
  "getListItem",
  "getMapValue",
  "joinList",
  "listContains",
  "mapKeys",
  "mapList",
  "mapValues",
  "mergeMaps",
  "removeItemFromList",
  "setMapValue",
  "sortList",
  "splitTextToList",
  "uniqueList",
]);

class LoopControlSignal extends Error {
  constructor(type) {
    super(type === "break" ? "Break loop" : "Continue loop");
    this.type = type;
  }
}

function dslVariableName(raw) {
  return String(raw || "").trim().replace(/^\$/, "");
}

function dslExpressionSource(expression = "") {
  return String(expression || "").replace(/\{\{\$([^}]+)\}\}/g, (_match, name) => `__get(${JSON.stringify(dslVariableName(name))})`);
}

async function evaluateDslExpression(page, expression, runtimeVariables = {}) {
  const context = await runtimeContextSnapshot(page, runtimeVariables);
  const vars = {
    ...runtimeVariables,
    browser: context.browser,
    currentUrl: context.currentUrl,
    env: context.env,
    height: context.viewport.height,
    platform: context.platform,
    title: context.title,
    viewport: context.device,
    width: context.viewport.width,
  };
  const source = dslExpressionSource(expression);
  const getValue = (name) => runtimeVariableValue(vars, name);
  try {
    return Function(
      "__vars",
      "__get",
      `"use strict"; const { item, row, key, value, loop, env, viewport, width, height, currentUrl, title, browser, platform } = __vars; return (${source});`,
    )(vars, getValue);
  } catch (error) {
    throw new Error(`Could not evaluate logic expression "${expression}": ${error instanceof Error ? error.message : "invalid expression"}`);
  }
}

function dslStringValue(raw = "") {
  const text = String(raw || "").trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1);
  }
  return text;
}

function dslExpressionValue(raw = "") {
  const text = String(raw || "").trim();
  if (!text) return "\"\"";
  return text;
}

function parseDslLocator(raw = "") {
  const source = String(raw || "").trim();
  const match = source.match(/^(css|xpath|text|role|testid|label)\((.*)\)$/);
  if (!match) return { type: "css", value: source };
  const kind = match[1];
  const args = [];
  const argPattern = /"([^"]*)"|'([^']*)'|([^,\s][^,]*)/g;
  let argMatch;
  while ((argMatch = argPattern.exec(match[2]))) {
    args.push((argMatch[1] ?? argMatch[2] ?? argMatch[3] ?? "").trim());
  }
  if (kind === "xpath") return { type: "xpath", value: args[0] || "" };
  if (kind === "text") return { type: "text", value: args[0] || "" };
  if (kind === "role") return { type: "role", value: args[1] || args[0] || "", role: args[0] || "button" };
  if (kind === "testid") return { type: "testid", value: args[0] || "" };
  if (kind === "label") return { type: "label", value: args[0] || "" };
  return { type: "css", value: args[0] || "" };
}

function splitDslTrailingElementIndex(raw = "") {
  const source = String(raw || "").trim();
  const match = source.match(/\s+at\s+(.+)$/i);
  if (!match) return { elementIndexExpression: "", source };
  return {
    elementIndexExpression: match[1].trim(),
    source: source.slice(0, match.index).trim(),
  };
}

async function evaluateDslElementIndex(page, expression, runtimeVariables) {
  const source = String(expression || "").trim();
  if (!source) return "";
  if (/^current\s+index$/i.test(source) || /^currentIndex$/i.test(source)) {
    return runtimeVariableValue(runtimeVariables, "loop.number") ?? runtimeVariableValue(runtimeVariables, "loop.index") ?? "";
  }
  return await evaluateDslExpression(page, dslExpressionValue(source), runtimeVariables);
}

async function dslStepForLocatorCommand(page, command, rest, runtimeVariables) {
  const indexSplit = splitDslTrailingElementIndex(rest);
  const locatorMatch = indexSplit.source.match(/^(css|xpath|text|role|testid|label)\((?:"[^"]*"|'[^']*'|[^)])*\)(?:\s+(.+))?$/);
  const locatorSource = locatorMatch ? locatorMatch[0].slice(0, locatorMatch[0].length - String(locatorMatch[2] || "").length).trim() : indexSplit.source;
  const locator = parseDslLocator(locatorSource);
  const value = locatorMatch?.[2] ? await evaluateDslExpression(page, dslExpressionValue(locatorMatch[2]), runtimeVariables) : "";
  const elementIndex = indexSplit.elementIndexExpression
    ? await evaluateDslElementIndex(page, indexSplit.elementIndexExpression, runtimeVariables)
    : "";
  const indexOptions = elementIndex === "" || elementIndex === undefined || elementIndex === null
    ? {}
    : { elementIndex: String(elementIndex), indexBase: "oneBased" };
  const target = {
    displayName: locator.value || locator.type,
    elementKind: "web element",
    type: "manual",
    value: locator.value,
  };
  const base = {
    action: command,
    description: `${command} ${locator.value || locator.type}`,
    options: indexOptions,
    target,
  };
  if (locator.type === "role") {
    return {
      ...base,
      options: { ...indexOptions, locatorRole: locator.role, locatorText: locator.value },
      target: { ...target, type: "role", value: `${locator.role || "button"}:${locator.value || ""}` },
    };
  }
  if (locator.type === "text") {
    return { ...base, target: { ...target, type: "text" } };
  }
  if (locator.type === "label") {
    return { ...base, target: { ...target, type: "label" } };
  }
  if (locator.type === "testid") {
    return { ...base, target: { ...target, type: "testid" } };
  }
  if (command === "type" || command === "fill") return { ...base, action: "fill", inputValue: String(value ?? "") };
  return base;
}

function tokenizeDsl(source = "") {
  const tokens = [];
  let current = "";
  let quote = "";
  for (const char of String(source || "")) {
    if (quote) {
      current += char;
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "{" || char === "}") {
      if (current.trim()) tokens.push(current.trim());
      tokens.push(char);
      current = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (current.trim()) tokens.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) tokens.push(current.trim());
  return tokens.filter((token) => token && !token.startsWith("//"));
}

function parseDslBlock(tokens, startIndex = 0, stopOnElse = false) {
  const nodes = [];
  let index = startIndex;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === "}") return { index: index + 1, nodes };
    if (stopOnElse && /^else\b/.test(token)) return { index, nodes };
    if (/^if\b/.test(token)) {
      const condition = token.replace(/^if\s+/, "").replace(/\s*\{$/, "").trim();
      if (tokens[index + 1] !== "{") throw new Error(`Expected "{" after ${token}`);
      const thenParsed = parseDslBlock(tokens, index + 2, true);
      index = thenParsed.index;
      const branches = [{ condition, nodes: thenParsed.nodes }];
      let elseNodes = [];
      while (index < tokens.length && /^else\b/.test(tokens[index])) {
        const elseToken = tokens[index];
        if (/^else\s+if\b/.test(elseToken)) {
          const elseCondition = elseToken.replace(/^else\s+if\s+/, "").replace(/\s*\{$/, "").trim();
          if (tokens[index + 1] !== "{") throw new Error(`Expected "{" after ${elseToken}`);
          const elseIfParsed = parseDslBlock(tokens, index + 2, true);
          branches.push({ condition: elseCondition, nodes: elseIfParsed.nodes });
          index = elseIfParsed.index;
        } else {
          if (tokens[index + 1] !== "{") throw new Error('Expected "{" after else');
          const elseParsed = parseDslBlock(tokens, index + 2, false);
          elseNodes = elseParsed.nodes;
          index = elseParsed.index;
          break;
        }
      }
      nodes.push({ branches, elseNodes, type: "if" });
      continue;
    }
    if (/^for\b/.test(token)) {
      const match = token.match(/^for\s+([a-zA-Z_][\w]*)\s+in\s+(.+?)(?:\s*\{)?$/);
      if (!match) throw new Error(`Invalid for loop: ${token}`);
      if (tokens[index + 1] !== "{") throw new Error(`Expected "{" after ${token}`);
      const parsed = parseDslBlock(tokens, index + 2, false);
      nodes.push({ itemName: match[1], source: match[2].trim(), nodes: parsed.nodes, type: "for" });
      index = parsed.index;
      continue;
    }
    if (/^repeat\b/.test(token)) {
      const count = token.replace(/^repeat\s+/, "").replace(/\s*\{$/, "").trim();
      if (tokens[index + 1] !== "{") throw new Error(`Expected "{" after ${token}`);
      const parsed = parseDslBlock(tokens, index + 2, false);
      nodes.push({ count, nodes: parsed.nodes, type: "repeat" });
      index = parsed.index;
      continue;
    }
    nodes.push({ source: token, type: "command" });
    index += 1;
  }
  return { index, nodes };
}

function parseCaseForgeDsl(source = "") {
  const tokens = tokenizeDsl(source);
  return parseDslBlock(tokens, 0, false).nodes;
}

async function executeDslNodes(page, nodes, runtimeVariables, context = {}) {
  const results = [];
  for (const [index, node] of nodes.entries()) {
    if (node.type === "if") {
      let matched = false;
      const skippedBranches = [];
      for (const [branchIndex, branch] of node.branches.entries()) {
        if (await evaluateDslExpression(page, branch.condition, runtimeVariables)) {
          const branchResults = await executeDslNodes(page, branch.nodes, runtimeVariables, context);
          results.push({ branch: branchIndex === 0 ? "if" : `else if ${branchIndex}`, condition: branch.condition, results: branchResults, status: "passed", type: "if" });
          matched = true;
          break;
        }
        skippedBranches.push(branch.condition);
      }
      if (!matched && node.elseNodes.length) {
        results.push({ branch: "else", results: await executeDslNodes(page, node.elseNodes, runtimeVariables, context), skippedBranches, status: "passed", type: "if" });
      } else if (!matched) {
        results.push({ skippedBranches, status: "skipped", type: "if" });
      }
      continue;
    }
    if (node.type === "for") {
      const source = await evaluateDslExpression(page, node.source, runtimeVariables);
      const items = normalizeList(source);
      const loopResults = [];
      for (const [itemIndex, item] of items.entries()) {
        setLoopVariables(runtimeVariables, {
          count: items.length,
          first: itemIndex === 0,
          index: itemIndex,
          item,
          last: itemIndex === items.length - 1,
          number: itemIndex + 1,
        }, node.itemName);
        try {
          loopResults.push({ index: itemIndex, item, results: await executeDslNodes(page, node.nodes, runtimeVariables, context), status: "passed" });
        } catch (error) {
          if (error instanceof LoopControlSignal && error.type === "break") {
            loopResults.push({ index: itemIndex, item, results: [], status: "broken" });
            break;
          }
          if (error instanceof LoopControlSignal && error.type === "continue") {
            loopResults.push({ index: itemIndex, item, results: [], status: "continued" });
            continue;
          }
          throw error;
        }
      }
      results.push({ iterations: loopResults.length, results: loopResults, status: "passed", type: "for" });
      continue;
    }
    if (node.type === "repeat") {
      const count = Math.max(0, Math.floor(Number(await evaluateDslExpression(page, node.count, runtimeVariables) || 0)));
      const loopResults = [];
      for (let itemIndex = 0; itemIndex < count; itemIndex += 1) {
        setLoopVariables(runtimeVariables, {
          count,
          first: itemIndex === 0,
          index: itemIndex,
          item: itemIndex,
          last: itemIndex === count - 1,
          number: itemIndex + 1,
        });
        try {
          loopResults.push({ index: itemIndex, results: await executeDslNodes(page, node.nodes, runtimeVariables, context), status: "passed" });
        } catch (error) {
          if (error instanceof LoopControlSignal && error.type === "break") {
            loopResults.push({ index: itemIndex, results: [], status: "broken" });
            break;
          }
          if (error instanceof LoopControlSignal && error.type === "continue") {
            loopResults.push({ index: itemIndex, results: [], status: "continued" });
            continue;
          }
          throw error;
        }
      }
      results.push({ iterations: loopResults.length, results: loopResults, status: "passed", type: "repeat" });
      continue;
    }
    const source = String(node.source || "");
    const commandMatch = source.match(/^(\w+)\s*(.*)$/);
    const command = commandMatch?.[1] || "";
    const rest = commandMatch?.[2] || "";
    if (command === "log") {
      const value = await evaluateDslExpression(page, rest, runtimeVariables);
      if (state.session) state.session.logs = [`Debug: ${stringifyRuntimeValue(value)}`, ...state.session.logs].slice(0, 80);
      results.push({ command: "log", output: value, status: "passed", type: "command" });
      continue;
    }
    if (command === "wait") {
      const duration = Number(await evaluateDslExpression(page, rest, runtimeVariables) || 0);
      await page.waitForTimeout(duration);
      results.push({ command: "wait", duration, status: "passed", type: "command" });
      continue;
    }
    if (command === "set") {
      const setMatch = rest.match(/^([a-zA-Z_][\w.]*)\s*=\s*(.+)$/);
      if (!setMatch) throw new Error(`Invalid set command: ${source}`);
      const output = await evaluateDslExpression(page, setMatch[2], runtimeVariables);
      runtimeVariables[setMatch[1]] = output;
      if (state.session) state.session.runtimeVariables = runtimeVariables;
      results.push({ command: "set", output, status: "passed", target: setMatch[1], type: "command" });
      continue;
    }
    if (command === "assert") {
      const passed = Boolean(await evaluateDslExpression(page, rest, runtimeVariables));
      if (!passed) throw new Error(`Logic assertion failed: ${rest}`);
      results.push({ command: "assert", output: true, status: "passed", type: "command" });
      continue;
    }
    if (command === "break") {
      throw new LoopControlSignal("break");
    }
    if (command === "continue") {
      throw new LoopControlSignal("continue");
    }
    if (command === "getText") {
      const asMatch = rest.match(/^(.*)\s+as\s+([a-zA-Z_][\w.]*)$/);
      const locatorRest = asMatch ? asMatch[1] : rest;
      const step = await dslStepForLocatorCommand(page, "getText", locatorRest, runtimeVariables);
      const output = await executeStepWithRuntimeVariables(page, step, runtimeVariables, context);
      if (asMatch?.[2]) {
        runtimeVariables[asMatch[2]] = output;
        if (state.session) state.session.runtimeVariables = runtimeVariables;
      }
      results.push({ command, output, status: "passed", target: asMatch?.[2] || "", type: "command" });
      continue;
    }
    if (["click", "type", "fill"].includes(command)) {
      const step = await dslStepForLocatorCommand(page, command, rest, runtimeVariables);
      const output = await executeStepWithRuntimeVariables(page, step, runtimeVariables, context);
      results.push({ command, output, status: "passed", type: "command" });
      continue;
    }
    throw new Error(`Unsupported logic command: ${source}`);
  }
  return results;
}

async function executeLogicDsl(page, step, runtimeVariables, context = {}) {
  const dsl = String(step.options?.dsl || step.inputValue || "").trim();
  if (!dsl) throw new Error("Logic IDE command needs a script.");
  const nodes = parseCaseForgeDsl(dsl);
  const results = await executeDslNodes(page, nodes, runtimeVariables, context);
  return {
    dsl,
    nodeCount: nodes.length,
    results,
    status: "passed",
  };
}

function isEmptySnippetOutput(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

function coerceSnippetOutput(value, outputFormat) {
  const format = String(outputFormat || "auto").toLowerCase();
  if (format === "text") {
    return typeof value === "string" ? value : stringifyRuntimeValue(value);
  }
  if (format === "boolean") return Boolean(value);
  if (format === "number") {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  if (format === "json") {
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  }
  return value;
}

function snippetOutputPreview(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return value || "(empty string)";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return stringifyRuntimeValue(value);
}

async function runJavaScriptSnippet(page, step) {
  const options = step.options || {};
  const script = String(
    options.script ||
      step.script ||
      step.inputValue ||
      step.target?.value ||
      ""
  ).trim();
  if (!script) throw new Error("Run JavaScript Snippet requires a script.");

  const timeoutMs = Math.max(1000, optionalNumber(options.timeoutMs || options.timeout) ?? 5000);
  const rawOutput = await Promise.race([
    page.evaluate(async (source) => {
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      const serialize = (value, depth = 0, seen = new WeakSet()) => {
        if (value === undefined || value === null) return value;
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
        if (typeof value === "bigint") return String(value);
        if (typeof value === "function") return `[Function${value.name ? ` ${value.name}` : ""}]`;
        if (depth > 6) return "[MaxDepth]";
        if (typeof value === "object") {
          if (seen.has(value)) return "[Circular]";
          seen.add(value);
          if (value instanceof Date) return value.toISOString();
          if (value instanceof Element) {
            const id = value.id ? `#${value.id}` : "";
            const classes = typeof value.className === "string" && value.className.trim()
              ? `.${value.className.trim().replace(/\s+/g, ".")}`
              : "";
            return `<${value.tagName.toLowerCase()}${id}${classes}>`;
          }
          if (Array.isArray(value)) return value.slice(0, 500).map((item) => serialize(item, depth + 1, seen));
          const entries = Object.entries(value).slice(0, 200);
          return Object.fromEntries(entries.map(([key, item]) => [key, serialize(item, depth + 1, seen)]));
        }
        return String(value);
      };
      const runAsBody = async () => new AsyncFunction(source).call(window);
      const runAsExpression = async () => new AsyncFunction(`return (${source});`).call(window);
      let bodyReturned = false;
      try {
        const bodyResult = await runAsBody();
        bodyReturned = true;
        if (bodyResult !== undefined || /\breturn\b/.test(source)) return serialize(bodyResult);
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
      }
      try {
        return serialize(await runAsExpression());
      } catch (error) {
        if (bodyReturned) return undefined;
        throw error;
      }
    }, script),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`JavaScript snippet timed out after ${timeoutMs} ms.`)), timeoutMs)
    ),
  ]);
  const output = coerceSnippetOutput(rawOutput, options.outputFormat);
  if (optionBoolean(options.failIfEmpty, false) && isEmptySnippetOutput(output)) {
    const error = new Error("JavaScript snippet returned an empty value.");
    error.output = output;
    throw error;
  }
  if (state.session && optionBoolean(options.logOutputToConsole, true)) {
    const preview = snippetOutputPreview(output);
    state.session.logs = [`JavaScript Snippet Output: ${preview}`, ...state.session.logs].slice(0, 80);
  }
  return output;
}

async function validateAccordionSections(page, step) {
  const options = step.options || {};
  const timeoutMs = Math.max(1000, optionalNumber(options.timeoutMs || options.timeout) ?? 30000);
  const config = {
    answerLocator: String(options.answerLocator || "").trim(),
    collapseAfterValidate: optionBoolean(options.collapseAfterValidate, true),
    containerLocator: String(options.containerLocator || "").trim(),
    expectedCount: optionalNumber(options.expectedCount),
    expandMode: String(options.expandMode || "auto"),
    failOnEmptyAnswer: optionBoolean(options.failOnEmptyAnswer, true),
    headerLocator: String(options.headerLocator || "").trim(),
    maxExpectedItems: optionalNumber(options.maxExpectedItems),
    minExpectedItems: optionalNumber(options.minExpectedItems),
    timeoutMs,
    validateAnswerNotEmpty: optionBoolean(options.validateAnswerNotEmpty, true),
    validateAnswerVisible: optionBoolean(options.validateAnswerVisible, true),
    validateCollapse: optionBoolean(options.validateCollapse, true),
  };

  const output = await page.evaluate(async (config) => {
    const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const now = () => Date.now();

    function safeQueryAll(root, selector) {
      if (!selector) return [];
      try {
        return Array.from(root.querySelectorAll(selector));
      } catch {
        return [];
      }
    }

    function normalizedText(value) {
      return String(value || "").replace(/\s+/g, " ").trim();
    }

    function classLike(element) {
      return String(element?.className || "").toLowerCase();
    }

    function hasPatternClass(element) {
      return /\b(accordion|collapse|collapsible|faq|question|answer|panel|expander|toggle)\b/i.test(
        `${classLike(element)} ${String(element?.id || "")}`,
      );
    }

    function styleVisible(element) {
      if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
      if (!element.isConnected) return false;
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
      if (element.closest("[hidden],[aria-hidden='true']")) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      return true;
    }

    function visiblyHidden(element) {
      return !styleVisible(element);
    }

    function visibleText(element, excludeElement = null) {
      if (!element || !styleVisible(element)) return "";
      const pieces = [];
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (excludeElement && (parent === excludeElement || excludeElement.contains(parent))) {
            return NodeFilter.FILTER_REJECT;
          }
          if (!normalizedText(node.nodeValue)) return NodeFilter.FILTER_REJECT;
          return styleVisible(parent) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
      });
      while (walker.nextNode()) pieces.push(walker.currentNode.nodeValue || "");
      return normalizedText(pieces.join(" "));
    }

    function cssId(id) {
      if (!id) return "";
      if (window.CSS?.escape) return window.CSS.escape(id);
      return String(id).replace(/([ #.;?%&,.+*~':"!^$[\]()=>|/@])/g, "\\$1");
    }

    function targetFromSelector(value) {
      const raw = String(value || "").trim();
      if (!raw) return null;
      const selector = raw.startsWith("#") ? raw : raw.startsWith(".") ? raw : raw;
      try {
        return document.querySelector(selector);
      } catch {
        return null;
      }
    }

    function controlledPanel(header) {
      const controls = header.getAttribute("aria-controls");
      if (controls) {
        const firstId = controls.split(/\s+/).find(Boolean);
        const byId = firstId ? document.getElementById(firstId) : null;
        if (byId) return byId;
      }
      const target =
        header.getAttribute("data-target") ||
        header.getAttribute("data-bs-target") ||
        header.getAttribute("href");
      if (target && target.startsWith("#")) {
        const byTarget = document.querySelector(`#${cssId(target.slice(1))}`);
        if (byTarget) return byTarget;
      }
      return null;
    }

    function nearestItem(header) {
      return header.closest(
        [
          "[data-accordion-item]",
          ".accordion-item",
          ".accordion",
          ".faq-item",
          ".faq",
          ".collapse-item",
          ".collapsible",
          ".panel",
          "li",
          "section",
          "article",
          "details",
        ].join(","),
      );
    }

    function panelFromItem(header) {
      const item = nearestItem(header);
      if (!item) return null;
      if (item.tagName === "DETAILS") return item;
      const selectors = [
        "[role='region']",
        ".accordion-body",
        ".accordion-content",
        ".accordion-panel",
        ".collapse",
        ".panel-collapse",
        ".panel-body",
        ".faq-answer",
        ".answer",
        ".content",
        "[data-accordion-panel]",
      ];
      for (const selector of selectors) {
        const panel = Array.from(item.querySelectorAll(selector)).find((candidate) => candidate !== header && !header.contains(candidate));
        if (panel) return panel;
      }
      return null;
    }

    function followingPanel(header) {
      let current = header.nextElementSibling;
      for (let depth = 0; current && depth < 4; depth += 1) {
        if (current.matches?.("[role='region'],.accordion-body,.accordion-content,.accordion-panel,.collapse,.panel-collapse,.panel-body,.faq-answer,.answer,.content,[data-accordion-panel]")) {
          return current;
        }
        if (hasPatternClass(current) || visiblyHidden(current)) return current;
        current = current.nextElementSibling;
      }
      const parent = header.parentElement;
      if (parent && parent !== document.body) {
        current = parent.nextElementSibling;
        if (current && (hasPatternClass(current) || visiblyHidden(current) || current.matches?.("[role='region']"))) {
          return current;
        }
      }
      return null;
    }

    function answerFor(header, indexedAnswer) {
      if (indexedAnswer) return indexedAnswer;
      if (header.tagName === "SUMMARY") return header.closest("details");
      return controlledPanel(header) || panelFromItem(header) || followingPanel(header);
    }

    function isExpanded(header, panel) {
      if (header.tagName === "SUMMARY") return Boolean(header.closest("details")?.open);
      const ariaExpanded = header.getAttribute("aria-expanded");
      if (ariaExpanded === "true") return true;
      if (ariaExpanded === "false") return false;
      if (panel) return styleVisible(panel);
      return false;
    }

    function clickTargetFor(header) {
      if (config.expandMode === "click-header") return header;
      if (config.expandMode === "click-icon") {
        return (
          header.querySelector("button,[role='button'],svg,i,.icon,.chevron,.arrow,[data-icon]") ||
          header.closest("button,[role='button']") ||
          header
        );
      }
      return header.closest("button,[role='button'],summary") || header;
    }

    function unique(elements) {
      const seen = new Set();
      return elements.filter((element) => {
        if (!element || seen.has(element)) return false;
        seen.add(element);
        return true;
      });
    }

    function autoHeaders(root) {
      const selectors = [
        "summary",
        "button[aria-expanded]",
        "[role='button'][aria-expanded]",
        "[aria-controls]",
        "[data-target]",
        "[data-bs-target]",
        "[data-toggle='collapse']",
        "[data-bs-toggle='collapse']",
        "[class*='accordion'] button",
        "[class*='accordion'] [role='button']",
        "[class*='faq'] button",
        "[class*='faq'] [role='button']",
        "[class*='question'] button",
        "[class*='question'] [role='button']",
        "h1[class*='question'],h2[class*='question'],h3[class*='question'],h4[class*='question'],h5[class*='question'],h6[class*='question']",
        "h1[class*='accordion'],h2[class*='accordion'],h3[class*='accordion'],h4[class*='accordion'],h5[class*='accordion'],h6[class*='accordion']",
        "h1[class*='faq'],h2[class*='faq'],h3[class*='faq'],h4[class*='faq'],h5[class*='faq'],h6[class*='faq']",
      ];
      const candidates = unique(selectors.flatMap((selector) => safeQueryAll(root, selector)));
      const headingCandidates = safeQueryAll(root, "h2,h3,h4,h5,h6,button,[role='button']").filter((element) => {
        if (!styleVisible(element)) return false;
        if (candidates.includes(element)) return false;
        const panel = followingPanel(element);
        return Boolean(panel && (hasPatternClass(panel) || visiblyHidden(panel)));
      });
      return unique([...candidates, ...headingCandidates]).filter((element) => {
        if (!styleVisible(element)) return false;
        const text = visibleText(element);
        if (!text && element.tagName !== "SUMMARY") return false;
        return Boolean(answerFor(element, null));
      });
    }

    async function waitForCondition(predicate, timeoutMs) {
      const deadline = now() + timeoutMs;
      let lastValue = false;
      while (now() <= deadline) {
        lastValue = Boolean(predicate());
        if (lastValue) return true;
        await sleep(100);
      }
      return Boolean(predicate());
    }

    const roots = config.containerLocator
      ? safeQueryAll(document, config.containerLocator).filter(styleVisible)
      : [document.body];
    const root = roots[0] || document.body;
    const indexedAnswers = config.answerLocator ? safeQueryAll(root, config.answerLocator) : [];
    const headers = unique(
      config.headerLocator
        ? safeQueryAll(root, config.headerLocator)
        : autoHeaders(root),
    ).filter(styleVisible);

    const results = [];
    const countErrors = [];
    if (config.expectedCount !== null && headers.length !== config.expectedCount) {
      countErrors.push(`Expected ${config.expectedCount} accordion item(s), found ${headers.length}.`);
    }
    if (config.minExpectedItems !== null && headers.length < config.minExpectedItems) {
      countErrors.push(`Expected at least ${config.minExpectedItems} accordion item(s), found ${headers.length}.`);
    }
    if (config.maxExpectedItems !== null && headers.length > config.maxExpectedItems) {
      countErrors.push(`Expected at most ${config.maxExpectedItems} accordion item(s), found ${headers.length}.`);
    }
    if (!headers.length) {
      countErrors.push("No visible accordion headers were found.");
    }

    for (const [index, header] of headers.entries()) {
      const row = {
        answerTextLength: 0,
        answerVisible: false,
        collapsed: false,
        errorReason: "",
        expandedSuccessfully: false,
        index: index + 1,
        question: visibleText(header).slice(0, 240) || `Accordion item ${index + 1}`,
        status: "passed",
      };
      const errors = [];
      const answer = answerFor(header, indexedAnswers[index] || null);

      try {
        header.scrollIntoView({ block: "center", inline: "nearest" });
        await sleep(120);

        if (!answer) {
          errors.push("Could not determine answer panel.");
        }

        if (!isExpanded(header, answer)) {
          clickTargetFor(header).click();
        }

        row.expandedSuccessfully = await waitForCondition(() => isExpanded(header, answer), config.timeoutMs);
        if (!row.expandedSuccessfully) errors.push("Section did not expand.");

        row.answerVisible = answer ? styleVisible(answer) : false;
        if (config.validateAnswerVisible && !row.answerVisible) {
          errors.push("Answer panel is not visible after expansion.");
        }

        const answerText = answer ? visibleText(answer, header) : "";
        row.answerTextLength = answerText.length;
        if (config.validateAnswerNotEmpty && !answerText.length && config.failOnEmptyAnswer) {
          errors.push("Answer text is empty.");
        }

        if (config.collapseAfterValidate) {
          clickTargetFor(header).click();
          if (config.validateCollapse) {
            row.collapsed = await waitForCondition(() => !isExpanded(header, answer), config.timeoutMs);
            if (!row.collapsed) errors.push("Section did not collapse.");
          } else {
            row.collapsed = true;
          }
        } else {
          row.collapsed = !isExpanded(header, answer);
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "Accordion validation failed.");
      }

      if (errors.length) {
        row.status = "failed";
        row.errorReason = errors.join(" ");
      }
      results.push(row);
    }

    const failedAccordionItems = results.filter((item) => item.status === "failed");
    const output = {
      accordionCount: headers.length,
      countErrors,
      failed: failedAccordionItems.length + countErrors.length,
      failedAccordionItems,
      passed: results.filter((item) => item.status === "passed").length,
      results,
    };
    return output;
  }, config);

  const summary = `Accordion validation: ${output.accordionCount} item(s), ${output.passed} passed, ${output.failed} failed.`;
  if (state.session) {
    const failureLines = (output.failedAccordionItems || [])
      .slice(0, 8)
      .map((item) => `Accordion ${item.index} failed: ${item.question || "Untitled"} - ${item.errorReason || "Validation failed."}`);
    state.session.logs = [summary, ...failureLines, ...state.session.logs].slice(0, 80);
    captureLivePreviewFramesForSession(state.session.id);
  }

  if (output.failed > 0) {
    const firstFailure =
      output.countErrors?.[0] ||
      output.failedAccordionItems?.[0]?.errorReason ||
      "One or more accordion sections failed validation.";
    const error = new Error(`${summary} ${firstFailure}`);
    error.output = output;
    throw error;
  }

  return output;
}

function parseStructuredOption(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (Array.isArray(value) || (typeof value === "object" && value !== null)) return value;
  const text = String(value).trim();
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    if (text.includes(",")) return text.split(",").map((item) => item.trim()).filter(Boolean);
    return fallback;
  }
}

function parseCsvText(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const source = String(text || "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => String(value).trim())) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  row.push(cell);
  if (row.some((value) => String(value).trim())) rows.push(row);
  return rows;
}

function rowsToObjects(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const headers = rows[0].map((header, index) => String(header || `Column ${index + 1}`).trim() || `Column ${index + 1}`);
  return rows.slice(1).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]))
  );
}

function normalizeCellValue(value, options = {}) {
  let text = value === undefined || value === null ? "" : String(value);
  if (optionBoolean(options.trimWhitespace, true)) text = text.replace(/\s+/g, " ").trim();
  if (!optionBoolean(options.caseSensitive, false)) text = text.toLowerCase();
  return text;
}

function rowObjectsFromData(data, headers = []) {
  if (!Array.isArray(data)) return [];
  if (!data.length) return [];
  if (Array.isArray(data[0])) {
    const effectiveHeaders = headers.length
      ? headers
      : data[0].map((header, index) => String(header || `Column ${index + 1}`).trim() || `Column ${index + 1}`);
    const rowStart = headers.length ? 0 : 1;
    return data.slice(rowStart).map((row) =>
      Object.fromEntries(effectiveHeaders.map((header, index) => [header, row[index] ?? ""]))
    );
  }
  if (typeof data[0] === "object" && data[0] !== null) return data;
  return [];
}

function tableCsv(headers, rows) {
  const quote = (value) => {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers, ...rows].map((row) => row.map(quote).join(",")).join("\n");
}

async function expectedTableDataFromOptions(options) {
  const source = String(options.expectedDataSource || "manual");
  const expectedData = options.expectedData;
  const filePath = String(options.filePath || "").trim();

  if ((source === "csv" || filePath.toLowerCase().endsWith(".csv")) && filePath) {
    return rowsToObjects(parseCsvText(await readFile(filePath, "utf8")));
  }

  if ((source === "excel" || /\.(xlsx|xlsm|xls)$/i.test(filePath)) && filePath) {
    const ExcelModule = await import("exceljs");
    const ExcelJS = ExcelModule.default || ExcelModule;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = options.sheetName
      ? workbook.getWorksheet(String(options.sheetName))
      : workbook.worksheets[0];
    if (!worksheet) throw new Error(`Excel sheet "${options.sheetName || "first sheet"}" was not found.`);
    const rows = [];
    worksheet.eachRow((row) => {
      rows.push(row.values.slice(1).map((value) => value == null ? "" : String(value)));
    });
    return rowsToObjects(rows);
  }

  const variableValue = options.variableName;
  const raw = source === "variable" && variableValue ? variableValue : expectedData;
  const parsed = parseStructuredOption(raw, raw);
  if (typeof parsed === "string") {
    const text = parsed.trim();
    if (!text) return [];
    if (text.includes("\n") && text.includes(",")) return rowsToObjects(parseCsvText(text));
    return parseStructuredOption(text, []);
  }
  if (Array.isArray(parsed)) return rowObjectsFromData(parsed);
  if (parsed && typeof parsed === "object") {
    if (Array.isArray(parsed.tableData)) return rowObjectsFromData(parsed.tableData, parsed.headers || []);
    if (Array.isArray(parsed.rows)) return rowObjectsFromData(parsed.rows, parsed.headers || []);
    if (Array.isArray(parsed.data)) return rowObjectsFromData(parsed.data, parsed.headers || []);
  }
  return [];
}

async function extractWebTable(page, options) {
  const tableLocator = String(options.tableLocator || options.locator || "").trim();
  if (!tableLocator) throw new Error("Table locator is required.");
  const timeout = Math.max(1000, optionalNumber(options.timeoutMs || options.timeout) ?? 30000);
  await page.locator(tableLocator).first().waitFor({ state: "visible", timeout });
  return await page.evaluate((config) => {
    function safeQueryAll(root, selector) {
      if (!selector) return [];
      try {
        return Array.from(root.querySelectorAll(selector));
      } catch {
        return [];
      }
    }
    function isVisible(element, includeHidden = false) {
      if (includeHidden) return Boolean(element);
      if (!element || element.nodeType !== Node.ELEMENT_NODE || !element.isConnected) return false;
      if (element.closest("[hidden],[aria-hidden='true']")) return false;
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }
    function textOf(element, includeHidden = false) {
      if (!element) return "";
      if (!includeHidden && !isVisible(element)) return "";
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (!String(node.nodeValue || "").trim()) return NodeFilter.FILTER_REJECT;
          return includeHidden || isVisible(parent) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
      });
      const pieces = [];
      while (walker.nextNode()) pieces.push(walker.currentNode.nodeValue || "");
      return pieces.join(" ").replace(/\s+/g, " ").trim();
    }
    function directCells(row) {
      const direct = Array.from(row.children || []).filter((child) =>
        child.matches?.("th,td,[role='cell'],[role='gridcell'],[role='columnheader'],[role='rowheader']")
      );
      if (direct.length) return direct;
      return safeQueryAll(row, "th,td,[role='cell'],[role='gridcell'],[role='columnheader'],[role='rowheader']");
    }
    const table = document.querySelector(config.tableLocator);
    if (!table) return { error: `Table not found for locator: ${config.tableLocator}` };
    const includeHiddenRows = Boolean(config.includeHiddenRows);
    const includeHiddenColumns = Boolean(config.includeHiddenColumns);
    const headerElements = config.headerLocator
      ? safeQueryAll(table, config.headerLocator)
      : [
          ...safeQueryAll(table, "thead th, thead [role='columnheader'], [role='columnheader']"),
          ...safeQueryAll(table, "tr:first-child th"),
        ];
    let headers = headerElements
      .filter((element) => isVisible(element, includeHiddenColumns))
      .map((element) => textOf(element, includeHiddenColumns));

    let rowElements = config.rowLocator
      ? safeQueryAll(table, config.rowLocator)
      : [
          ...safeQueryAll(table, "tbody tr"),
          ...safeQueryAll(table, "[role='rowgroup'] [role='row'], [role='table'] [role='row'], [role='grid'] [role='row']"),
        ];
    if (!rowElements.length) {
      rowElements = safeQueryAll(table, "tr,[role='row']");
    }
    rowElements = Array.from(new Set(rowElements)).filter((row) => {
      if (!isVisible(row, includeHiddenRows)) return false;
      if (row.closest("thead")) return false;
      const cells = config.cellLocator ? safeQueryAll(row, config.cellLocator) : directCells(row);
      if (!cells.length) return false;
      const onlyHeaders = cells.every((cell) => cell.matches?.("th,[role='columnheader']"));
      if (onlyHeaders && headers.length) return false;
      return true;
    });

    const rows = rowElements.map((row, rowIndex) => {
      const cells = (config.cellLocator ? safeQueryAll(row, config.cellLocator) : directCells(row))
        .filter((cell) => isVisible(cell, includeHiddenColumns));
      return {
        ariaRowIndex: row.getAttribute("aria-rowindex") || "",
        index: rowIndex + 1,
        values: cells.map((cell, columnIndex) => ({
          ariaColIndex: cell.getAttribute("aria-colindex") || "",
          columnIndex: columnIndex + 1,
          text: textOf(cell, includeHiddenColumns),
        })),
      };
    });

    if (!headers.length && rows.length) {
      const firstRow = rowElements[0];
      const firstCells = config.cellLocator ? safeQueryAll(firstRow, config.cellLocator) : directCells(firstRow);
      const headerLike = firstCells.length && firstCells.every((cell) => cell.matches?.("th,[role='columnheader']"));
      if (headerLike) {
        headers = firstCells.filter((cell) => isVisible(cell, includeHiddenColumns)).map((cell) => textOf(cell, includeHiddenColumns));
        rows.shift();
      }
    }

    const maxColumns = Math.max(headers.length, ...rows.map((row) => row.values.length), 0);
    if (!headers.length) {
      headers = Array.from({ length: maxColumns }, (_item, index) => `Column ${index + 1}`);
    } else if (headers.length < maxColumns) {
      headers = [...headers, ...Array.from({ length: maxColumns - headers.length }, (_item, index) => `Column ${headers.length + index + 1}`)];
    }

    const tableData = rows.map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, row.values[index]?.text ?? ""]))
    );
    const warnings = [];
    const ariaRowCount = Number(table.getAttribute("aria-rowcount") || 0);
    if (ariaRowCount && ariaRowCount > rows.length) {
      warnings.push("Table appears virtualized. Only visible rows were validated.");
    }
    const ariaIndexes = rows.map((row) => Number(row.ariaRowIndex || 0)).filter(Boolean);
    if (ariaIndexes.length > 1 && Math.max(...ariaIndexes) - Math.min(...ariaIndexes) + 1 > rows.length) {
      warnings.push("Table appears virtualized. Only visible rows were validated.");
    }
    if (table.scrollHeight > table.clientHeight * 2 && rows.length < 100 && (table.getAttribute("role") === "grid" || table.getAttribute("role") === "table")) {
      warnings.push("Table may be scroll-virtualized. Only currently loaded rows were validated.");
    }
    return {
      columnCount: headers.length,
      headers,
      rowCount: tableData.length,
      rows: rows.map((row) => row.values.map((cell) => cell.text)),
      tableData,
      warnings: Array.from(new Set(warnings)),
    };
  }, {
    cellLocator: String(options.cellLocator || "").trim(),
    headerLocator: String(options.headerLocator || "").trim(),
    includeHiddenColumns: optionBoolean(options.includeHiddenColumns, false),
    includeHiddenRows: optionBoolean(options.includeHiddenRows, false),
    rowLocator: String(options.rowLocator || "").trim(),
    tableLocator,
  });
}

function ensureTableExtracted(table) {
  if (table?.error) throw new Error(table.error);
  if (!table || !Array.isArray(table.headers)) throw new Error("Could not extract web table data.");
}

function headerIndex(headers, name, options) {
  const wanted = normalizeCellValue(name, options);
  return headers.findIndex((header) => normalizeCellValue(header, options) === wanted);
}

function matchText(actual, expected, matchType, options) {
  const normalizedActual = normalizeCellValue(actual, options);
  const normalizedExpected = normalizeCellValue(expected, options);
  if (matchType === "contains") return normalizedActual.includes(normalizedExpected);
  if (matchType === "startsWith") return normalizedActual.startsWith(normalizedExpected);
  if (matchType === "endsWith") return normalizedActual.endsWith(normalizedExpected);
  if (matchType === "regex") {
    const flags = optionBoolean(options.caseSensitive, false) ? "" : "i";
    return new RegExp(String(expected), flags).test(String(actual ?? ""));
  }
  return normalizedActual === normalizedExpected;
}

function validateTable(table, options) {
  const failedRows = [];
  const failedCells = [];
  const failedColumns = [];
  const expectedHeaders = parseStructuredOption(options.expectedHeaders, []);
  const requiredColumns = parseStructuredOption(options.requiredColumns, []);
  const uniqueColumns = parseStructuredOption(options.uniqueColumns, []);
  const notEmptyColumns = parseStructuredOption(options.notEmptyColumns, []);
  const expectedRowCount = optionalNumber(options.expectedRowCount);
  const minRowCount = optionalNumber(options.minRowCount);
  const maxRowCount = optionalNumber(options.maxRowCount);
  const expectedColumnCount = optionalNumber(options.expectedColumnCount);

  if (expectedRowCount !== null && table.rowCount !== expectedRowCount) {
    failedRows.push({ reason: `Expected ${expectedRowCount} rows, found ${table.rowCount}.` });
  }
  if (minRowCount !== null && table.rowCount < minRowCount) {
    failedRows.push({ reason: `Expected at least ${minRowCount} rows, found ${table.rowCount}.` });
  }
  if (maxRowCount !== null && table.rowCount > maxRowCount) {
    failedRows.push({ reason: `Expected at most ${maxRowCount} rows, found ${table.rowCount}.` });
  }
  if (expectedColumnCount !== null && table.columnCount !== expectedColumnCount) {
    failedColumns.push({ reason: `Expected ${expectedColumnCount} columns, found ${table.columnCount}.` });
  }

  for (const header of expectedHeaders) {
    if (headerIndex(table.headers, header, options) < 0) {
      failedColumns.push({ column: header, reason: "Expected header is missing." });
    }
  }
  for (const column of requiredColumns) {
    if (headerIndex(table.headers, column, options) < 0) {
      failedColumns.push({ column, reason: "Required column is missing." });
    }
  }
  for (const column of notEmptyColumns) {
    const index = headerIndex(table.headers, column, options);
    if (index < 0) {
      failedColumns.push({ column, reason: "Not-empty column is missing." });
      continue;
    }
    table.rows.forEach((row, rowIndex) => {
      if (!normalizeCellValue(row[index], options)) {
        failedCells.push({ column, rowIndex: rowIndex + 1, reason: "Cell is empty." });
      }
    });
  }
  for (const column of uniqueColumns) {
    const index = headerIndex(table.headers, column, options);
    if (index < 0) {
      failedColumns.push({ column, reason: "Unique column is missing." });
      continue;
    }
    const seen = new Map();
    table.rows.forEach((row, rowIndex) => {
      const key = normalizeCellValue(row[index], options);
      if (!key) return;
      if (seen.has(key)) {
        failedCells.push({ column, firstRowIndex: seen.get(key), rowIndex: rowIndex + 1, reason: "Duplicate value." });
      } else {
        seen.set(key, rowIndex + 1);
      }
    });
  }
  if (optionBoolean(options.validateNoBlankRows, true)) {
    table.rows.forEach((row, rowIndex) => {
      if (!row.some((cell) => normalizeCellValue(cell, options))) {
        failedRows.push({ rowIndex: rowIndex + 1, reason: "Row is blank." });
      }
    });
  }
  if (optionBoolean(options.validateNoDuplicateRows, false)) {
    const seenRows = new Map();
    table.rows.forEach((row, rowIndex) => {
      const key = row.map((cell) => normalizeCellValue(cell, options)).join("\u0001");
      if (!key) return;
      if (seenRows.has(key)) {
        failedRows.push({ firstRowIndex: seenRows.get(key), rowIndex: rowIndex + 1, reason: "Duplicate row." });
      } else {
        seenRows.set(key, rowIndex + 1);
      }
    });
  }
  return {
    ...table,
    failedCells,
    failedColumns,
    failedRows,
    failed: failedCells.length + failedColumns.length + failedRows.length,
    passed: failedCells.length + failedColumns.length + failedRows.length === 0,
  };
}

function compareTableData(actualTable, expectedRows, options) {
  const keyColumns = parseStructuredOption(options.keyColumns, []);
  const columnMapping = parseStructuredOption(options.columnMapping, {});
  const compareMode = String(options.compareMode || "exactTableMatch");
  const expected = rowObjectsFromData(expectedRows);
  const actual = actualTable.tableData || [];
  const expectedHeaders = Array.from(new Set(expected.flatMap((row) => Object.keys(row))));
  const missingColumns = [];
  const extraColumns = [];
  const missingRows = [];
  const extraRows = [];
  const mismatchedCells = [];
  const actualHeaderFor = (expectedHeader) => columnMapping?.[expectedHeader] || expectedHeader;

  for (const expectedHeader of expectedHeaders) {
    if (headerIndex(actualTable.headers, actualHeaderFor(expectedHeader), options) < 0) {
      missingColumns.push(expectedHeader);
    }
  }
  if (!["containsExpectedColumns", "ignoreExtraColumns"].includes(compareMode)) {
    for (const actualHeader of actualTable.headers) {
      const mapped = Object.entries(columnMapping || {}).find(([, value]) => normalizeCellValue(value, options) === normalizeCellValue(actualHeader, options))?.[0] || actualHeader;
      if (!expectedHeaders.some((header) => normalizeCellValue(header, options) === normalizeCellValue(mapped, options))) {
        extraColumns.push(actualHeader);
      }
    }
  }

  const rowKey = (row) =>
    keyColumns.length
      ? keyColumns.map((column) => normalizeCellValue(row[column] ?? row[actualHeaderFor(column)], options)).join("\u0001")
      : "";
  const actualByKey = new Map();
  if (keyColumns.length) {
    actual.forEach((row, index) => actualByKey.set(rowKey(row), { index, row }));
  }

  expected.forEach((expectedRow, expectedIndex) => {
    const actualMatch = keyColumns.length
      ? actualByKey.get(rowKey(expectedRow))
      : { index: expectedIndex, row: actual[expectedIndex] };
    if (!actualMatch?.row) {
      missingRows.push({ expectedIndex: expectedIndex + 1, row: expectedRow });
      return;
    }
    for (const expectedHeader of expectedHeaders) {
      const actualHeader = actualHeaderFor(expectedHeader);
      if (headerIndex(actualTable.headers, actualHeader, options) < 0) continue;
      const actualValue = actualMatch.row[actualHeader] ?? "";
      const expectedValue = expectedRow[expectedHeader] ?? "";
      const tolerance = optionalNumber(options.numericTolerance);
      const bothNumeric = tolerance !== null && actualValue !== "" && expectedValue !== "" && Number.isFinite(Number(actualValue)) && Number.isFinite(Number(expectedValue));
      const matches = bothNumeric
        ? Math.abs(Number(actualValue) - Number(expectedValue)) <= tolerance
        : matchText(actualValue, expectedValue, "equals", options);
      if (!matches) {
        mismatchedCells.push({
          actual: actualValue,
          column: actualHeader,
          expected: expectedValue,
          expectedColumn: expectedHeader,
          rowIndex: actualMatch.index + 1,
        });
      }
    }
  });

  if (!["containsExpectedRows", "ignoreExtraRows"].includes(compareMode) && actual.length > expected.length && !keyColumns.length) {
    actual.slice(expected.length).forEach((row, index) => extraRows.push({ row, rowIndex: expected.length + index + 1 }));
  }
  if (keyColumns.length && !["containsExpectedRows", "ignoreExtraRows"].includes(compareMode)) {
    const expectedKeys = new Set(expected.map(rowKey));
    actual.forEach((row, index) => {
      if (!expectedKeys.has(rowKey(row))) extraRows.push({ row, rowIndex: index + 1 });
    });
  }

  const failedCount = missingColumns.length + extraColumns.length + missingRows.length + extraRows.length + mismatchedCells.length;
  return {
    actual: actualTable,
    extraColumns,
    extraRows,
    failedCount,
    mismatchedCells,
    missingColumns,
    missingRows,
    passed: failedCount === 0,
    passedCount: Math.max(0, expected.length * Math.max(1, expectedHeaders.length) - mismatchedCells.length),
    warnings: actualTable.warnings || [],
  };
}

function failWithOutput(message, output) {
  const error = new Error(message);
  error.output = output;
  throw error;
}

async function executeTableCommand(page, step) {
  const action = step.action;
  const options = step.options || {};
  const table = await extractWebTable(page, options);
  ensureTableExtracted(table);

  if (action === "getWebTableData") {
    const outputFormat = String(options.outputFormat || "arrayOfObjects");
    const tableData =
      outputFormat === "arrayOfArrays"
        ? table.rows
        : outputFormat === "csv"
          ? tableCsv(table.headers, table.rows)
          : outputFormat === "json"
            ? JSON.stringify(table.tableData)
            : table.tableData;
    return { ...table, tableData };
  }

  if (action === "validateWebTable") {
    const output = validateTable(table, options);
    if (!output.passed) failWithOutput(`Table validation failed with ${output.failed} issue(s).`, output);
    return output;
  }

  if (action === "verifyWebTableRowCount") {
    const expected = optionalNumber(options.expectedRowCount);
    const output = { actual: table.rowCount, expected, rowCount: table.rowCount, passed: table.rowCount === expected, ...table };
    if (!output.passed) failWithOutput(`Expected ${expected} table rows, found ${table.rowCount}.`, output);
    return table.rowCount;
  }

  if (action === "verifyWebTableColumnCount") {
    const expected = optionalNumber(options.expectedColumnCount);
    const output = { actual: table.columnCount, columnCount: table.columnCount, expected, passed: table.columnCount === expected, ...table };
    if (!output.passed) failWithOutput(`Expected ${expected} table columns, found ${table.columnCount}.`, output);
    return table.columnCount;
  }

  if (action === "verifyWebTableHeaders") {
    const output = validateTable(table, { ...options, requiredColumns: options.expectedHeaders });
    const expectedHeaders = parseStructuredOption(options.expectedHeaders, []);
    if (String(options.compareMode || "") === "exactTableMatch" && expectedHeaders.length) {
      const actual = table.headers.map((header) => normalizeCellValue(header, options));
      const expected = expectedHeaders.map((header) => normalizeCellValue(header, options));
      if (actual.length !== expected.length || actual.some((header, index) => header !== expected[index])) {
        output.failedColumns.push({ reason: "Headers do not match exactly.", actual: table.headers, expected: expectedHeaders });
        output.failed += 1;
        output.passed = false;
      }
    }
    if (!output.passed) failWithOutput("Table header verification failed.", output);
    return output;
  }

  if (action === "verifyWebTableColumnExists") {
    const index = headerIndex(table.headers, options.columnName, options);
    const output = { columnIndex: index + 1, columnName: options.columnName, headers: table.headers, passed: index >= 0 };
    if (index < 0) failWithOutput(`Column "${options.columnName}" was not found.`, output);
    return output;
  }

  if (action === "verifyWebTableRowExists") {
    const criteria = parseStructuredOption(options.matchCriteria, {});
    const entries = Object.entries(criteria || {});
    const mode = String(options.matchMode || "allColumns");
    const matchedIndex = table.tableData.findIndex((row) => {
      const checks = entries.map(([column, expected]) => {
        const actual = row[column] ?? "";
        return mode === "contains"
          ? matchText(actual, expected, "contains", options)
          : matchText(actual, expected, "equals", options);
      });
      return mode === "anyColumn" ? checks.some(Boolean) : checks.every(Boolean);
    });
    const output = {
      matchedRowData: matchedIndex >= 0 ? table.tableData[matchedIndex] : null,
      matchedRowIndex: matchedIndex + 1,
      passed: matchedIndex >= 0,
    };
    if (matchedIndex < 0) failWithOutput("No table row matched the provided criteria.", output);
    return output;
  }

  if (action === "verifyWebTableCellValue") {
    let rowIndex = -1;
    if (String(options.rowSelectorType || "rowIndex") === "rowIndex") {
      rowIndex = Math.max(0, (optionalNumber(options.rowIndex) ?? 1) - 1);
    } else if (String(options.rowSelectorType) === "rowText") {
      rowIndex = table.rows.findIndex((row) => row.some((cell) => matchText(cell, options.rowText, "contains", options)));
    } else {
      rowIndex = table.tableData.findIndex((row) => matchText(row[options.keyColumn] ?? "", options.keyValue, "equals", options));
    }
    const columnIndex = String(options.columnSelectorType || "columnName") === "columnIndex"
      ? Math.max(0, (optionalNumber(options.columnIndex) ?? 1) - 1)
      : headerIndex(table.headers, options.columnName, options);
    const actual = rowIndex >= 0 && columnIndex >= 0 ? table.rows[rowIndex]?.[columnIndex] ?? "" : "";
    const passed = rowIndex >= 0 && columnIndex >= 0 && matchText(actual, options.expectedValue, options.matchType || "equals", options);
    const output = {
      actual,
      columnIndex: columnIndex + 1,
      columnName: table.headers[columnIndex] || options.columnName || "",
      expected: options.expectedValue,
      passed,
      rowIndex: rowIndex + 1,
    };
    if (!passed) failWithOutput(`Expected table cell to match "${options.expectedValue}", got "${actual}".`, output);
    return output;
  }

  if (action === "verifyWebTableSortOrder") {
    const index = headerIndex(table.headers, options.columnName, options);
    if (index < 0) failWithOutput(`Column "${options.columnName}" was not found.`, { headers: table.headers, passed: false });
    const values = table.rows.map((row, rowIndex) => ({ rowIndex: rowIndex + 1, value: row[index] ?? "" }))
      .filter((item) => !optionBoolean(options.ignoreBlankValues, true) || normalizeCellValue(item.value, options));
    const convert = (value) => {
      if (options.dataType === "number") return Number(String(value).replace(/[^0-9.-]/g, ""));
      if (options.dataType === "date") return Date.parse(String(value));
      return normalizeCellValue(value, options);
    };
    let firstMismatch = null;
    for (let index = 1; index < values.length; index += 1) {
      const previous = convert(values[index - 1].value);
      const current = convert(values[index].value);
      const ok = options.sortOrder === "desc" ? previous >= current : previous <= current;
      if (!ok) {
        firstMismatch = { previous: values[index - 1], current: values[index] };
        break;
      }
    }
    const output = { columnName: options.columnName, firstMismatch, passed: !firstMismatch, sortOrder: options.sortOrder || "asc", values };
    if (firstMismatch) failWithOutput(`Table column "${options.columnName}" is not sorted ${options.sortOrder || "asc"}.`, output);
    return output;
  }

  if (action === "compareWebTableWithExpectedData" || action === "compareWebTableWithExternalData") {
    const expectedRows = await expectedTableDataFromOptions(options);
    const output = compareTableData(table, expectedRows, options);
    if (!output.passed) failWithOutput(`Table comparison failed with ${output.failedCount} mismatch(es).`, output);
    return output;
  }

  throw new Error(`Unsupported table action: ${action}`);
}

async function executePlaybackStep(page, step) {
  const action = step.action === "goto" ? "navigate" : step.action;
  const options = step.options || {};
  const timeout = Number(options.timeout || options.timeoutMs || 10000);
  const inputValue = step.inputValue ?? "";
  const expectedValue = step.expectedValue ?? "";

  if (action === "navigate") {
    await page.goto(cleanUrlAuth(inputValue || step.target?.value), {
      timeout,
      waitUntil: "domcontentloaded",
    });
    return;
  }
  if (action === "reload") {
    await page.reload({ timeout, waitUntil: "domcontentloaded" });
    return;
  }
  if (action === "goBack") {
    await page.goBack({ timeout, waitUntil: "domcontentloaded" });
    return;
  }
  if (action === "goForward") {
    await page.goForward({ timeout, waitUntil: "domcontentloaded" });
    return;
  }
  if (action === "switchPage") {
    const result = await switchPageByTarget({
      targetType: options.targetType || step.targetType || step.params?.targetType || inputValue || "latest",
      targetValue: options.targetValue || step.targetValue || step.params?.targetValue || step.target?.value || "",
    });
    if (result.status >= 400) throw new Error(result.payload?.error || "Could not switch browser tab or window.");
    return result.payload;
  }
  if (action === "closePage") {
    const result = await closeActiveTab();
    if (result.status >= 400) throw new Error(result.payload?.error || "Could not close browser tab or window.");
    return result.payload;
  }
  if (action === "closeBrowser") {
    await closeRuntime();
    return { closed: true, status: "stopped" };
  }
  if (action === "wait" || action === "waitForTimeout") {
    await page.waitForTimeout(Number(options.duration || inputValue || 1000));
    return;
  }
  if (action === "waitForNavigation") {
    await page.waitForLoadState("domcontentloaded", { timeout });
    return;
  }
  if (action === "executeScript") {
    return await page.evaluate(String(inputValue || ""));
  }
  if (action === "runJavaScriptSnippet") {
    return await runJavaScriptSnippet(page, step);
  }
  if (action === "logMessage") {
    const message = String(inputValue || options.message || step.message || step.target?.value || "");
    const logLine = message || "(empty message)";
    if (state.session) {
      state.session.logs = [`Debug: ${logLine}`, ...state.session.logs].slice(0, 80);
    }
    return logLine;
  }
  if (action === "breakLoop") {
    throw new LoopControlSignal("break");
  }
  if (action === "continueLoop") {
    throw new LoopControlSignal("continue");
  }
  if (collectionActionNames.has(action)) {
    return await executeCollectionCommand(page, step, options.runtimeVariables || {});
  }
  if (action === "validateAccordionSections") {
    return await validateAccordionSections(page, step);
  }
  if (
    [
      "compareWebTableWithExpectedData",
      "compareWebTableWithExternalData",
      "getWebTableData",
      "validateWebTable",
      "verifyWebTableCellValue",
      "verifyWebTableColumnCount",
      "verifyWebTableColumnExists",
      "verifyWebTableHeaders",
      "verifyWebTableRowCount",
      "verifyWebTableRowExists",
      "verifyWebTableSortOrder",
    ].includes(action)
  ) {
    return await executeTableCommand(page, step);
  }
  if (action === "getCurrentUrl") {
    return page.url();
  }
  if (action === "getTitle") {
    return await page.title();
  }
  if (action === "scroll") {
    await page.mouse.wheel(0, Number(inputValue || options.deltaY || 600));
    return;
  }
  if (action === "coordinateClick") {
    await page.mouse.click(Number(options.x || 0), Number(options.y || 0));
    return;
  }

  const locator = locatorFor(page, { ...step, action });

  if (action === "click") await clickLocatorWithPointFallback(page, locator, step, { force: Boolean(options.force), timeout });
  else if (action === "doubleClick") await clickLocatorWithPointFallback(page, locator, step, { force: Boolean(options.force), timeout }, "doubleClick");
  else if (action === "rightClick") await clickLocatorWithPointFallback(page, locator, step, { button: "right", force: Boolean(options.force), timeout });
  else if (action === "hover") await locator.hover({ timeout });
  else if (action === "scrollIntoView") await locator.scrollIntoViewIfNeeded({ timeout });
  else if (action === "focus") await locator.focus({ timeout });
  else if (action === "blur") await locator.evaluate((element) => element.blur());
  else if (action === "fill") await locator.fill(String(inputValue), { timeout });
  else if (action === "clear") await locator.clear({ timeout });
  else if (action === "type") await locator.pressSequentially(String(inputValue), { timeout });
  else if (action === "press") await locator.press(String(inputValue || "Enter"), { timeout });
  else if (action === "select") await locator.selectOption(String(inputValue), { timeout });
  else if (action === "check") await locator.check({ force: Boolean(options.force), timeout });
  else if (action === "uncheck") await locator.uncheck({ force: Boolean(options.force), timeout });
  else if (action === "getInputValue") return await locator.inputValue({ timeout });
  else if (action === "getText") return await locator.innerText({ timeout });
  else if (action === "getWebElementsText") {
    const items = await extractWebElements(page, step);
    return items.map((item) => item.text);
  }
  else if (action === "getWebElementsAttribute") {
    const items = await extractWebElements(page, step);
    return items.map((item) => item.attributeValue);
  }
  else if (action === "getWebElementsList") return await extractWebElements(page, step);
  else if (action === "getProperty") {
    const propertyName = String(options.propertyName || step.propertyName || step.params?.propertyName || inputValue || "");
    if (!propertyName) throw new Error("Get property requires a property name.");
    return await locator.evaluate(
      (element, name) => {
        const record = element;
        const value = record[name];
        if (value === undefined || value === null) return element.getAttribute(name) ?? "";
        return typeof value === "string" ? value : JSON.stringify(value);
      },
      propertyName
    );
  }
  else if (action === "getCssValue") {
    const propertyName = String(options.cssProperty || step.cssProperty || step.params?.cssProperty || inputValue || "");
    if (!propertyName) throw new Error("Get CSS value requires a CSS property.");
    return await locator.evaluate(
      (element, name) => getComputedStyle(element).getPropertyValue(name),
      propertyName
    );
  }
  else if (action === "getElementCount") return await locator.count();
  else if (action === "waitForElement") await locator.waitFor({ state: "visible", timeout });
  else if (action === "assert" || action.startsWith("assert")) {
    const assertion = step.assertionType || action;
    if (assertion.includes("hidden")) await locator.waitFor({ state: "hidden", timeout });
    else if (assertion.includes("checked")) {
      if (!(await locator.isChecked({ timeout }))) throw new Error("Expected element to be checked.");
    }
    else if (assertion.includes("text contains")) {
      const text = await locator.innerText({ timeout });
      if (!text.includes(expectedValue)) throw new Error(`Expected text to contain "${expectedValue}", got "${text}".`);
    }
    else if (assertion.includes("text equals")) {
      const text = (await locator.innerText({ timeout })).trim();
      if (text !== expectedValue) throw new Error(`Expected text "${expectedValue}", got "${text}".`);
    }
    else await locator.waitFor({ state: "visible", timeout });
  } else {
    throw new Error(`Unsupported action: ${action}`);
  }
}

async function executeStepWithRuntimeVariables(page, step, runtimeVariables, context = {}) {
  const action = step.action === "goto" ? "navigate" : step.action;
  if (action === "conditionalBlock") {
    return await executeConditionalBlock(page, step, runtimeVariables, context);
  }
  if (action === "loopBlock") {
    return await executeLoopBlock(page, step, runtimeVariables, context);
  }
  if (collectionActionNames.has(action)) {
    const executableStep = {
      ...resolveRuntimeValue(step, runtimeVariables),
      options: {
        ...resolveRuntimeValue(step.options || {}, runtimeVariables),
        actual: step.options?.actual,
        source: step.options?.source,
      },
    };
    const output = await executeCollectionCommand(page, executableStep, runtimeVariables);
    const outputVariableName = outputVariableNameForStep(step);
    if (outputVariableName) {
      runtimeVariables[outputVariableName] = output;
      if (state.session) state.session.runtimeVariables = runtimeVariables;
    }
    return output;
  }
  const executableStep = resolveRuntimeValue(step, runtimeVariables);
  executableStep.options = { ...(executableStep.options || {}), runtimeVariables };
  const output = await executePlaybackStep(page, executableStep);
  const outputVariableName = outputVariableNameForStep(step);
  if (outputVariableName) {
    runtimeVariables[outputVariableName] = output;
    if (state.session) state.session.runtimeVariables = runtimeVariables;
  }
  return output;
}

async function executeRuntimeStepSequence(page, steps, runtimeVariables, context = {}) {
  const results = [];
  for (const [index, step] of steps.entries()) {
    const activePage = state.page || page;
    try {
      const output = await executeStepWithRuntimeVariables(activePage, step, runtimeVariables, {
        ...context,
        nestedIndex: index,
      });
      results.push({ index, output, status: "passed", stepId: step.id || null });
    } catch (error) {
      if (error instanceof LoopControlSignal) throw error;
      const message = error instanceof Error ? error.message : "Nested command failed.";
      const failedOutput = error && typeof error === "object" && "output" in error ? error.output : undefined;
      const outputVariableName = outputVariableNameForStep(step);
      if (outputVariableName && failedOutput !== undefined) {
        runtimeVariables[outputVariableName] = failedOutput;
        if (state.session) state.session.runtimeVariables = runtimeVariables;
      }
      results.push({
        error: message,
        index,
        output: failedOutput,
        status: "failed",
        stepId: step.id || null,
      });
      const errorToThrow = new Error(message);
      errorToThrow.output = { results };
      throw errorToThrow;
    }
  }
  return results;
}

async function executeConditionalBlock(page, step, runtimeVariables, context = {}) {
  const options = step.options || {};
  if (String(options.dsl || step.inputValue || "").trim()) {
    return await executeLogicDsl(page, step, runtimeVariables, context);
  }
  const thenSteps = normalizeRuntimeSteps(step.thenSteps || options.thenSteps);
  const elseSteps = normalizeRuntimeSteps(step.elseSteps || options.elseSteps);
  const elseIfBranches = normalizeRuntimeSteps(step.elseIfBranches || options.elseIfBranches);
  const skippedBranches = [];
  const branches = [
    { label: "if", options, steps: thenSteps },
    ...elseIfBranches.map((branch, index) => ({
      label: branch.label || `else if ${index + 1}`,
      options: branch,
      steps: normalizeRuntimeSteps(branch.steps || branch.thenSteps),
    })),
  ];

  for (const branch of branches) {
    const passed = await evaluateAutomationCondition(page, branch.options, runtimeVariables);
    if (!passed) {
      skippedBranches.push({ branch: branch.label, reason: "condition_false" });
      continue;
    }
    const results = await executeRuntimeStepSequence(page, branch.steps, runtimeVariables, context);
    const output = {
      branch: branch.label,
      conditionPassed: true,
      executedSteps: branch.steps.length,
      results,
      skippedBranches,
      status: "passed",
    };
    if (state.session) {
      state.session.logs = [`Conditional block ran ${branch.label} branch.`, ...state.session.logs].slice(0, 80);
    }
    return output;
  }

  if (elseSteps.length) {
    const results = await executeRuntimeStepSequence(page, elseSteps, runtimeVariables, context);
    return {
      branch: "else",
      conditionPassed: true,
      executedSteps: elseSteps.length,
      results,
      skippedBranches,
      status: "passed",
    };
  }

  const output = {
    branch: "",
    conditionPassed: false,
    executedSteps: 0,
    results: [],
    skippedBranches,
    status: "skipped",
  };
  if (optionBoolean(options.failIfNoBranchMatched, false)) {
    const error = new Error("Conditional block did not match any branch.");
    error.output = output;
    throw error;
  }
  return output;
}

async function loopItemsForBlock(page, options, runtimeVariables) {
  const loopType = String(options.loopType || "repeatCount");
  if (loopType === "repeatCount") {
    const countValue = options.count || options.repeatCount || options.source || 1;
    const count = Math.max(0, Math.floor(Number(parseStructuredRuntimeValue(resolveRuntimeValue(countValue, runtimeVariables), countValue) || 0)));
    return Array.from({ length: count }, (_item, index) => ({ item: index, type: "count" }));
  }
  if (loopType === "forEachMapEntry") {
    const source = runtimeCollectionSource(options, runtimeVariables);
    return Object.entries(source && typeof source === "object" && !Array.isArray(source) ? source : {}).map(([key, value]) => ({ key, value, item: value, type: "map" }));
  }
  if (loopType === "forEachTableRow") {
    const table = await executeTableCommand(page, { action: "getWebTableData", options });
    return (table.tableData || []).map((row) => ({ item: row, row, type: "row" }));
  }
  if (loopType === "forEachDataRow") {
    const rows = normalizeList(runtimeCollectionSource(options, runtimeVariables));
    return rows.map((row) => ({ item: row, row, type: "row" }));
  }
  const list = normalizeList(runtimeCollectionSource(options, runtimeVariables));
  return list.map((item) => ({ item, type: "list" }));
}

async function executeLoopBlock(page, step, runtimeVariables, context = {}) {
  const options = step.options || {};
  if (String(options.dsl || step.inputValue || "").trim()) {
    return await executeLogicDsl(page, step, runtimeVariables, context);
  }
  const loopType = String(options.loopType || "repeatCount");
  const steps = normalizeRuntimeSteps(step.steps || options.steps);
  const maxIterations = Math.max(1, optionalNumber(options.maxIterations) ?? 100);
  const continueOnFailure = optionBoolean(options.continueOnIterationFailure, false);
  const results = [];
  let items = [];
  if (loopType === "whileCondition" || loopType === "untilCondition") {
    items = Array.from({ length: maxIterations }, (_item, index) => ({ item: index, type: loopType }));
  } else {
    items = await loopItemsForBlock(page, options, runtimeVariables);
    if (items.length > maxIterations) items = items.slice(0, maxIterations);
  }

  for (const [index, loopItem] of items.entries()) {
    if (loopType === "whileCondition") {
      const keepGoing = await evaluateAutomationCondition(page, options, runtimeVariables);
      if (!keepGoing) break;
    }
    if (loopType === "untilCondition") {
      const stopNow = await evaluateAutomationCondition(page, options, runtimeVariables);
      if (stopNow) break;
    }

    const loopState = {
      count: items.length,
      first: index === 0,
      index,
      last: index === items.length - 1,
      number: index + 1,
      ...loopItem,
    };
    setLoopVariables(
      runtimeVariables,
      loopState,
      String(options.itemVariableName || "item"),
      String(options.keyVariableName || "key"),
      String(options.valueVariableName || "value"),
    );
    try {
      const stepResults = await executeRuntimeStepSequence(page, steps, runtimeVariables, context);
      results.push({ index, item: loopItem.item, key: loopItem.key, results: stepResults, status: "passed" });
    } catch (error) {
      if (error instanceof LoopControlSignal && error.type === "break") {
        results.push({ index, item: loopItem.item, key: loopItem.key, status: "broken" });
        break;
      }
      if (error instanceof LoopControlSignal && error.type === "continue") {
        results.push({ index, item: loopItem.item, key: loopItem.key, status: "continued" });
        continue;
      }
      const failedOutput = error && typeof error === "object" && "output" in error ? error.output : undefined;
      results.push({
        error: error instanceof Error ? error.message : "Loop iteration failed.",
        index,
        item: loopItem.item,
        key: loopItem.key,
        output: failedOutput,
        status: "failed",
      });
      if (!continueOnFailure) break;
    }
  }

  const failed = results.filter((result) => result.status === "failed").length;
  const output = {
    failed,
    iterations: results.length,
    loopType,
    passed: results.filter((result) => result.status === "passed" || result.status === "continued" || result.status === "broken").length,
    results,
    status: failed ? "failed" : "passed",
  };
  if (failed && !continueOnFailure) {
    const firstFailure = results.find((result) => result.status === "failed");
    const error = new Error(`Loop block failed in iteration ${firstFailure ? firstFailure.index + 1 : "?"}.`);
    error.output = output;
    throw error;
  }
  if (state.session) {
    state.session.logs = [`Loop block completed ${output.iterations} iteration(s), ${failed} failed.`, ...state.session.logs].slice(0, 80);
  }
  return output;
}

async function runPlaybackInActiveBrowser(body) {
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  const steps = Array.isArray(body?.steps) ? body.steps : [];
  const session = state.session;
  const page = state.page;
  if (!session || session.id !== sessionId || !page) {
    return { status: 404, payload: { error: "Browser session is not active." } };
  }
  if (!steps.length) {
    return { status: 400, payload: { error: "Playback requires at least one command." } };
  }

  session.playbackActive = true;
  const previousStatus = session.status;
  session.status = "playing";
  session.logs = [`Playback started with ${steps.length} command${steps.length === 1 ? "" : "s"}.`, ...session.logs];
  session.updatedAt = Date.now();
  const results = [];
  const runtimeVariables = {
    ...(session.runtimeVariables && typeof session.runtimeVariables === "object" && !Array.isArray(session.runtimeVariables)
      ? session.runtimeVariables
      : {}),
    ...(body?.parameterData && typeof body.parameterData === "object" && !Array.isArray(body.parameterData)
      ? body.parameterData
      : {}),
  };
  let currentIndex = -1;
  let currentStep = null;

  try {
    for (const [index, step] of steps.entries()) {
      currentIndex = index;
      currentStep = step;
      const activePlaybackPage = state.page || page;
      const output = await executeStepWithRuntimeVariables(activePlaybackPage, step, runtimeVariables, {
        index,
        runId: body?.runId || null,
      });
      results.push({ index, output, status: "passed", stepId: step.id || null });
    }
    session.currentUrl = state.page?.url() || session.currentUrl;
    session.status = previousStatus === "previewing" ? "previewing" : "recording";
    session.logs = ["Playback passed.", ...session.logs].slice(0, 80);
    session.updatedAt = Date.now();
    return {
      status: 200,
      payload: {
        ...getRecorderSnapshot(session, body?.cursor ?? session.commands.length),
        results,
        runId: body?.runId || null,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Playback failed.";
    const failedOutput = error && typeof error === "object" && "output" in error ? error.output : undefined;
    if (currentStep && failedOutput !== undefined) {
      const outputVariableName = outputVariableNameForStep(currentStep);
      if (outputVariableName) {
        runtimeVariables[outputVariableName] = failedOutput;
        session.runtimeVariables = runtimeVariables;
      }
    }
    if (currentStep) {
      results.push({
        error: message,
        index: currentIndex,
        output: failedOutput,
        status: "failed",
        stepId: currentStep.id || null,
      });
    }
    session.currentUrl = state.page?.url() || session.currentUrl;
    session.status = previousStatus === "previewing" ? "previewing" : "recording";
    session.logs = [`Playback failed: ${message}`, ...session.logs].slice(0, 80);
    session.updatedAt = Date.now();
    return {
      status: 500,
      payload: {
        ...getRecorderSnapshot(session, body?.cursor ?? session.commands.length),
        error: message,
        results,
        runId: body?.runId || null,
      },
    };
  } finally {
    session.playbackActive = false;
  }
}

const startRecorder = async (body) => {
  const scenarioId =
    typeof body?.scenarioId === "string" && body.scenarioId.trim()
      ? body.scenarioId.trim()
      : "";
  const startUrl =
    typeof body?.startUrl === "string" && body.startUrl.trim()
      ? body.startUrl.trim()
      : "https://example.com";
  const navigationUrl = cleanUrlAuth(startUrl);
  const httpCredentials = credentialsFromBody(body, startUrl);
  const authorizationHeader = basicAuthHeader(httpCredentials);

  if (!scenarioId) {
    return { status: 400, payload: { error: "A valid scenario id is required." } };
  }

  await closeRuntime();

  const headless =
    body?.headless === true || body?.browserMode === "headless";
  const livePreviewOnly =
    body?.livePreviewOnly === true || body?.recorderMode === "off";
  const maximizeWindow = !headless && shouldMaximizeWindow(body);
  const browser = await launchBrowser({ headless, maximize: maximizeWindow });
  const context = await browser.newContext({
    httpCredentials: httpCredentials || undefined,
    viewport: maximizeWindow ? null : viewportFromBody(body),
  });
  if (authorizationHeader) {
    await context.setExtraHTTPHeaders({ Authorization: authorizationHeader });
    await context.route("**/*", async (route) => {
      await route.continue({
        headers: {
          ...route.request().headers(),
          authorization: authorizationHeader,
        },
      });
    });
  }
  const page = await context.newPage();
  const session = {
    id: randomUUID(),
    scenarioId,
    status: "starting",
    startedAt: Date.now(),
    updatedAt: Date.now(),
    startUrl: navigationUrl,
    currentUrl: navigationUrl,
    commands: [],
    logs: livePreviewOnly
      ? [
          "CaseForge Companion connected in Live Preview mode.",
          "Use the CaseForge preview panel to inspect elements and author commands.",
        ]
      : [
          "CaseForge Companion connected.",
          "Use the browser normally. Click, type, select, navigate, and add checkpoints when needed.",
        ],
  };

  state.browser = browser;
  state.context = context;
  state.pages = new Map();
  state.page = null;
  state.activeTabId = null;
  state.session = session;

  context.on("page", (nextPage) => {
    if (nextPage === page && pageRecordFor(nextPage)) return;
    void registerPage(nextPage, session, {
      logMessage: "A new browser tab opened in Live Preview.",
      makeActive: true,
    });
  });

  await registerPage(page, session, { makeActive: true });
  await page.goto(navigationUrl, {
    waitUntil: "domcontentloaded",
    timeout: 20000,
  });
  await refreshPageRecord(page);

  session.status = livePreviewOnly ? "previewing" : "recording";
  session.updatedAt = Date.now();
  session.logs = [
    `${headless ? "Hidden browser" : "Browser"} opened at ${navigationUrl}.`,
    ...session.logs,
  ];

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

const setRecorderMode = async (body) => {
  const session = state.session;
  const page = state.page;
  if (!session || !page) {
    return { status: 404, payload: { error: "Companion browser session is not active." } };
  }
  if (body?.sessionId && body.sessionId !== session.id) {
    return { status: 404, payload: { error: "Companion browser session is not active." } };
  }

  const mode = body?.mode === "off" ? "off" : "record";
  session.status = mode === "record" ? "recording" : "previewing";
  session.currentUrl = page.url() || session.currentUrl;
  session.updatedAt = Date.now();
  session.logs = [
    mode === "record"
      ? "Live Preview promoted to recording mode."
      : "Recording mode turned off; Live Preview remains active.",
    ...session.logs,
  ].slice(0, 40);

  return {
    status: 200,
    payload: {
      mode,
      updated: true,
      ...getRecorderSnapshot(session, session.commands.length),
    },
  };
};

const findPageRecordForSwitch = (body = {}) => {
  const records = orderedPageRecords();
  if (!records.length) return null;

  const targetType = String(body.targetType || body.type || "latest").toLowerCase();
  const targetValue = String(body.targetValue ?? body.value ?? "").trim();

  if (targetType === "current" || targetType === "active") {
    return pageRecordFor(state.page) || records.find((record) => record.id === state.activeTabId) || records[0];
  }
  if (targetType === "main" || targetType === "parent" || targetType === "first") {
    return records.find((record) => !record.openerId) || records[0];
  }
  if (targetType === "latest" || targetType === "last" || !targetType) {
    return records[records.length - 1];
  }
  if (targetType === "index") {
    const rawIndex = Number.parseInt(targetValue, 10);
    if (Number.isNaN(rawIndex)) return null;
    const zeroBasedIndex = rawIndex > 0 ? rawIndex - 1 : rawIndex;
    return records[zeroBasedIndex] || null;
  }
  if (targetType === "title") {
    const query = targetValue.toLowerCase();
    return records.find((record) => String(record.title || "").toLowerCase().includes(query)) || null;
  }
  if (targetType === "url") {
    const query = targetValue.toLowerCase();
    return records.find((record) => String(record.url || "").toLowerCase().includes(query)) || null;
  }
  if (targetType === "id" || targetType === "tabid") {
    return records.find((record) => record.id === targetValue) || null;
  }

  return records[records.length - 1];
};

const switchPageByTarget = async (body = {}) => {
  if (!state.session || !state.context) {
    return { status: 404, payload: { error: "Companion browser session is not active." } };
  }
  const record = findPageRecordForSwitch(body);
  if (!record) {
    return { status: 404, payload: { error: "Requested browser tab or window was not found." } };
  }
  await setActivePage(record.page, {
    logMessage: `Switched Live Preview to ${record.title || record.url || "the selected tab"}.`,
  });
  return {
    status: 200,
    payload: {
      ok: true,
      ...getRecorderSnapshot(state.session, body?.cursor ?? state.session.commands.length),
    },
  };
};

const closeActiveTab = async (body = {}) => {
  const session = state.session;
  if (!session || !state.page) {
    return { status: 404, payload: { error: "Companion browser session is not active." } };
  }

  const records = orderedPageRecords();
  const record =
    (typeof body.tabId === "string" && records.find((entry) => entry.id === body.tabId)) ||
    findPageRecordForSwitch({ targetType: "current" });

  if (!record) {
    return { status: 404, payload: { error: "Requested browser tab or window was not found." } };
  }

  if (records.length <= 1) {
    await closeRuntime();
    return {
      status: 200,
      payload: {
        closed: true,
        status: "stopped",
        tabId: record.id,
      },
    };
  }

  const closedLabel = record.title || record.url || "current tab";
  await record.page.close().catch(() => undefined);
  await handlePageClosed(record.page);
  session.logs = [`Closed ${closedLabel}.`, ...session.logs].slice(0, 80);
  session.updatedAt = Date.now();
  broadcastLivePreviewState();
  return {
    status: 200,
    payload: {
      ...getRecorderSnapshot(session, body?.cursor ?? session.commands.length),
      closed: true,
      tabId: record.id,
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
          version: AGENT_VERSION,
          activeSessionId: state.session?.id ?? null,
          glowCartDemoUrl: state.demo?.url ?? null,
          status: state.session?.status ?? "idle",
        },
        origin
      );
      return;
    }

    if (req.method === "POST" && url.pathname === "/demo/glowcart/start") {
      const demo = await startGlowCartDemo();
      sendJson(
        res,
        200,
        {
          ok: true,
          port: demo.port,
          url: demo.url,
        },
        origin
      );
      return;
    }

    if (req.method === "GET" && url.pathname === "/demo/glowcart/status") {
      sendJson(
        res,
        200,
        {
          ok: true,
          port: state.demo?.port ?? null,
          running: Boolean(state.demo?.server?.listening),
          url: state.demo?.url ?? null,
        },
        origin
      );
      return;
    }

    if (req.method === "GET" && url.pathname === "/automation/browser") {
      const sessionId = url.searchParams.get("sessionId") || "";
      const cursor = Number(url.searchParams.get("cursor") || "0");
      if (!state.session) {
        sendJson(
          res,
          404,
          { error: "Browser session is not active." },
          origin
        );
        return;
      }
      if (sessionId && state.session.id !== sessionId) {
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

    if (req.method === "GET" && url.pathname === "/automation/browser/live-frame") {
      await sendLiveFrame(res, url, origin);
      return;
    }

    if (req.method === "POST" && url.pathname === "/automation/browser/inspect") {
      const body = await readBody(req);
      const result = await inspectLivePoint(body, url);
      sendJson(res, result.status, result.payload, origin);
      return;
    }

    if (req.method === "POST" && url.pathname === "/automation/browser/scroll") {
      const body = await readBody(req);
      const result = await scrollLivePreview(body, url);
      sendJson(res, result.status, result.payload, origin);
      return;
    }

    if (req.method === "POST" && url.pathname === "/automation/browser/interact") {
      const body = await readBody(req);
      const result = await interactLivePreview(body, url);
      sendJson(res, result.status, result.payload, origin);
      return;
    }

    if (req.method === "POST" && url.pathname === "/automation/browser") {
      const body = await readBody(req);
      let action = "start";
      if (body?.action === "stop") action = "stop";
      else if (body?.action === "run") action = "run";
      else if (body?.action === "browserCommand") action = "browserCommand";
      else if (body?.action === "switchTab") action = "switchTab";
      else if (body?.action === "switchPage") action = "switchPage";
      else if (body?.action === "closeTab" || body?.action === "closePage") action = "closePage";
      else if (body?.action === "mode") action = "mode";

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

      if (action === "run") {
        const result = await runPlaybackInActiveBrowser(body);
        sendJson(res, result.status, result.payload, origin);
        return;
      }

      if (action === "browserCommand") {
        const result = await runBrowserControlCommand(body);
        sendJson(res, result.status, result.payload, origin);
        return;
      }

      if (action === "switchTab") {
        const result = await switchActiveTab(body);
        sendJson(res, result.status, result.payload, origin);
        return;
      }

      if (action === "switchPage") {
        const result = await switchPageByTarget(body);
        sendJson(res, result.status, result.payload, origin);
        return;
      }

      if (action === "closePage") {
        const result = await closeActiveTab(body);
        sendJson(res, result.status, result.payload, origin);
        return;
      }

      if (action === "mode") {
        const result = await setRecorderMode(body);
        sendJson(res, result.status, result.payload, origin);
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

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
  if (url.pathname === "/automation/browser/live-stream") {
    handleLivePreviewSocketUpgrade(req, socket, head, url);
    return;
  }
  socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
  socket.destroy();
});

server.listen(PORT, HOST, () => {
  console.log(`CaseForge Companion ready at http://${HOST}:${PORT}`);
  console.log("Keep this window open while recording or replaying scenarios.");
});

const shutdown = async () => {
  await closeRuntime();
  await closeGlowCartDemo();
  server.close(() => process.exit(0));
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
