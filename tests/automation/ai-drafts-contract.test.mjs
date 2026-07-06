import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const aiDraftsSource = readFileSync(
  new URL("../../utils/automation/ai-drafts.ts", import.meta.url),
  "utf8",
);

test("review heading manual steps are converted into text capture commands", () => {
  assert.match(aiDraftsSource, /const isTextCaptureIntent =/);
  assert.match(aiDraftsSource, /review\|inspect\|read\|capture\|collect\|note\|observe\|get/);
  assert.match(aiDraftsSource, /heading\|title\|label\|text\|copy\|message\|content\|summary\|hero/);
  assert.match(aiDraftsSource, /normalizedAction === "click" && isTextCaptureIntent\(description\)/);
  assert.match(aiDraftsSource, /captureVariableNameForStep\(description\)/);
  assert.match(aiDraftsSource, /outputVariableName/);
  assert.match(aiDraftsSource, /Compare captured \$\{outputVariableName\} with expected result/);
  assert.match(aiDraftsSource, /value: `\{\{\$\{outputVariableName\}\}\}`/);
  assert.match(aiDraftsSource, /For review\/read\/inspect steps such as "Review the hero heading"/);
  assert.doesNotMatch(aiDraftsSource, /Review the hero heading[\s\S]{0,120}action: "click"/);
});
