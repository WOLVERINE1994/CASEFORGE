import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("utils/automation/website-drafts.ts", "utf8");
const testDataSource = readFileSync("utils/test-data.ts", "utf8");

test("website manual case generation keeps non-input checks out of test data", () => {
  assert.match(source, /Test Data is only for values a tester must enter, select, upload, or prepare before execution\./);
  assert.match(source, /If the tester only opens, clicks, reviews, verifies, scans, checks, navigates, or observes existing content, Test Data must be "None"\./);
  assert.match(source, /Do not create generic valid\/invalid\/boundary text values unless a visible field or form requires typed input\./);
  assert.match(source, /For click-only, link-only, navigation-only, content review, layout, keyboard, and visual checks, Test Data must be "None"\./);
  assert.match(source, /Do not put button names, link labels, hrefs, locators, selectors, or page URLs in Test Data/);
  assert.match(source, /const hasMeaningfulTestData = \(value: string\) =>/);
  assert.match(source, /const cleanManualWebsiteCaseLine = \(line: string\) =>/);
  assert.match(source, /hasMeaningfulTestData\(testData\)/);
  assert.match(source, /!hasManualInputDataNeed\(rowText\)/);
  assert.match(source, /return \[id, type, title, preconditions, steps, expectedResult, "None"\]\.join\(" \| "\)/);
  assert.match(source, /Homepage hero content appears correctly[\s\S]{0,260}The hero content and primary action are visible and understandable \| None/);
  assert.match(source, /Scan the visible \$\{component\} content[\s\S]{0,180}"None"/);
  assert.match(source, /Check for clipped or overlapping content[\s\S]{0,180}"None"/);
  assert.match(source, /The link opens the expected destination[\s\S]{0,180}"None"/);
  assert.match(source, /The button responds with a clear state change[\s\S]{0,180}"None"/);
});

test("website manual case generation still keeps field input values as test data", () => {
  assert.match(source, /Value=\$\{sampleValue\}/);
  assert.match(source, /Required fields=\$\{fields\.filter/);
  assert.match(source, /hasManualInputDataNeed/);
});

test("workspace test data helper returns none for read-only review cases", () => {
  assert.match(testDataSource, /const requiresManualInputData = \(content: string\) =>/);
  assert.match(testDataSource, /if \(!requiresManualInputData\(content\)\) \{\s*return "None";\s*\}/);
  assert.match(testDataSource, /Valid text: "Sincara QA"/);
});
