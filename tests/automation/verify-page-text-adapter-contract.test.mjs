import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const localAgentSource = readFileSync(
  new URL("../../scripts/caseforge-local-agent.mjs", import.meta.url),
  "utf8",
);
const playwrightWorkerSource = readFileSync(
  new URL("../../workers/playwright-worker/server.mjs", import.meta.url),
  "utf8",
);

test("Verify Page Contains Text has executable adapters in local and worker runners", () => {
  for (const source of [localAgentSource, playwrightWorkerSource]) {
    assert.match(source, /action === "verifyPageText"/);
    assert.match(source, /Verify Page Contains Text requires expected text/);
    assert.match(source, /page\.locator\("body"\)\.innerText/);
    assert.match(source, /Expected page text to \$\{matchType\}/);
    assert.match(source, /passed: true/);
  }
});
