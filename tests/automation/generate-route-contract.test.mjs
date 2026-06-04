import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const generateRouteSource = readFileSync(
  new URL("../../app/api/generate/route.ts", import.meta.url),
  "utf8",
);

test("test generation expands detailed acceptance criteria into broader suites", () => {
  assert.match(generateRouteSource, /function generationCaseTarget\(requirement: string, coverage: string\)/);
  assert.match(generateRouteSource, /function countAcceptanceCriteria\(requirement: string\)/);
  assert.match(generateRouteSource, /function countFormFields\(requirement: string\)/);
  assert.match(generateRouteSource, /function countValidationRules\(requirement: string\)/);
  assert.match(generateRouteSource, /Target total test cases for this requirement: \$\{caseTarget\.target\}/);
  assert.match(generateRouteSource, /Minimum acceptable test cases for this requirement: \$\{caseTarget\.minimum\}/);
  assert.match(generateRouteSource, /do not collapse distinct field presence, validation, consent, dropdown, navigation, visibility-toggle, and success behaviors/);
  assert.match(generateRouteSource, /aim for exactly \$\{caseTarget\.target\} rows/);
});

test("test generation retries when model returns fewer rows than minimum", () => {
  assert.match(generateRouteSource, /function countGeneratedRows\(result: string\)/);
  assert.match(generateRouteSource, /generatedRows < caseTarget\.minimum/);
  assert.match(generateRouteSource, /Regenerate the full suite for this requirement with exactly \$\{caseTarget\.target\} meaningful rows/);
  assert.match(generateRouteSource, /Cover the form opening, all required and optional field presence, mandatory validation, invalid email, password mismatch, phone length, terms checkbox/);
});

test("test generation has deterministic signup fallback when AI under-covers", () => {
  assert.match(generateRouteSource, /function buildFallbackRows\(requirement: string, mode: string, target: number\)/);
  assert.match(generateRouteSource, /countGeneratedRows\(result\) < caseTarget\.minimum/);
  assert.match(generateRouteSource, /Create account opens complete signup form/);
  assert.match(generateRouteSource, /Invalid email address is rejected/);
  assert.match(generateRouteSource, /Terms consent is required before signup/);
  assert.match(generateRouteSource, /Missing date of birth blocks signup/);
  assert.match(generateRouteSource, /Newsletter opt in is saved during signup/);
  assert.match(generateRouteSource, /Valid signup creates account successfully/);
});

test("test generation returns server fallback when AI request fails", () => {
  assert.match(generateRouteSource, /let requirement = ""/);
  assert.match(generateRouteSource, /AI request failed; returned deterministic fallback coverage/);
  assert.match(generateRouteSource, /Check GROQ_API_KEY in the server environment/);
  assert.match(generateRouteSource, /buildFallbackRows\(requirement, mode, fallbackTarget\)/);
});
