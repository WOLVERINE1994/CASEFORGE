/* global chrome */

(() => {
  if (window.__caseforgeRecorderInstalled) return;
  window.__caseforgeRecorderInstalled = true;

  function locatorCandidates(element) {
    const candidates = [];
    const role = element.getAttribute("role");
    const label = element.getAttribute("aria-label");
    const testId =
      element.getAttribute("data-testid") ||
      element.getAttribute("data-test") ||
      element.getAttribute("data-qa");
    const placeholder = element.getAttribute("placeholder");
    const alt = element.getAttribute("alt");
    const title = element.getAttribute("title");
    const text = (element.innerText || element.textContent || "").trim().slice(0, 120);

    if (role) candidates.push({ strategy: "role", value: role, score: 95 });
    if (label) candidates.push({ strategy: "label", value: label, score: 92 });
    if (text) candidates.push({ strategy: "text", value: text, score: 84 });
    if (placeholder) candidates.push({ strategy: "placeholder", value: placeholder, score: 82 });
    if (alt) candidates.push({ strategy: "alt", value: alt, score: 80 });
    if (title) candidates.push({ strategy: "title", value: title, score: 78 });
    if (testId) candidates.push({ strategy: "testid", value: testId, score: 76 });
    if (element.id) candidates.push({ strategy: "css", value: `#${CSS.escape(element.id)}`, score: 45 });

    return candidates;
  }

  function emit(action, element, value) {
    chrome.runtime.sendMessage({
      action,
      frameUrl: window.location.href,
      locatorCandidates: element ? locatorCandidates(element) : [],
      pageUrl: window.location.href,
      source: "caseforge-content-recorder",
      type: "caseforge:command",
      value,
    });
  }

  emit("navigate", document.documentElement, window.location.href);

  document.addEventListener("click", (event) => {
    emit("click", event.target);
  }, true);

  document.addEventListener("input", (event) => {
    emit("fill", event.target, event.target?.value || "");
  }, true);

  document.addEventListener("change", (event) => {
    emit(event.target?.tagName === "SELECT" ? "select" : "fill", event.target, event.target?.value || "");
  }, true);

  document.addEventListener("mouseover", (event) => {
    emit("hover", event.target);
  }, true);
})();
