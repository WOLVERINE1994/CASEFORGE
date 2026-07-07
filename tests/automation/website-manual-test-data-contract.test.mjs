import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("utils/automation/website-drafts.ts", "utf8");

test("website manual case generation keeps click/navigation hints out of test data", () => {
  assert.match(source, /Test Data is only for values a tester must enter, select, upload, or prepare before execution\./);
  assert.match(source, /For click-only, link-only, navigation-only, content review, layout, keyboard, and visual checks, Test Data must be "None"\./);
  assert.match(source, /Do not put button names, link labels, hrefs, locators, selectors, or page URLs in Test Data/);
  assert.match(source, /const clickOnlyTestDataPattern =/);
  assert.match(source, /const cleanManualWebsiteCaseLine = \(line: string\) =>/);
  assert.match(source, /clickOnlyTestDataPattern\.test\(testData\)/);
  assert.match(source, /return \[id, type, title, preconditions, steps, expectedResult, "None"\]\.join\(" \| "\)/);
  assert.match(source, /The link opens the expected destination[\s\S]{0,180}"None"/);
  assert.match(source, /The button responds with a clear state change[\s\S]{0,180}"None"/);
});

test("website manual case generation still keeps field input values as test data", () => {
  assert.match(source, /Value=\$\{sampleValue\}/);
  assert.match(source, /Required fields=\$\{fields\.filter/);
  assert.match(source, /hasManualInputDataNeed/);
});
