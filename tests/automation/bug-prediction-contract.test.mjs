import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const fillBugPredictionSource = readFileSync(
  new URL("../../app/api/fill-bug-prediction/route.ts", import.meta.url),
  "utf8",
);

const bugPredictionSource = readFileSync(
  new URL("../../utils/bug-prediction.ts", import.meta.url),
  "utf8",
);

test("bug prediction auto-cover falls back to parseable targeted rows", () => {
  assert.match(fillBugPredictionSource, /function countGeneratedRows\(result: string\)/);
  assert.match(fillBugPredictionSource, /function buildFallbackPredictionRows\(predictionId: string, requirement: string\)/);
  assert.match(fillBugPredictionSource, /countGeneratedRows\(result\) === 0/);
  assert.match(fillBugPredictionSource, /genericSubject = signup \? "signup" : "target"/);
  assert.match(fillBugPredictionSource, /missing mandatory input is rejected/);
  assert.match(fillBugPredictionSource, /success feedback updates visible state/);
});

test("bug prediction prompts avoid unrelated billing dashboard cases", () => {
  assert.match(fillBugPredictionSource, /Do not introduce unrelated billing, invoice, payment, dashboard, or admin behavior/);
  assert.match(bugPredictionSource, /Verify visible state refreshes after changes/);
  assert.match(bugPredictionSource, /hasExplicitSyncSurface/);
  assert.doesNotMatch(bugPredictionSource, /invalid card details/);
});
