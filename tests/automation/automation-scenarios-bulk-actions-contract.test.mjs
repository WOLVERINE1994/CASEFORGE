import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("components/AutomationScenariosClient.tsx", "utf8");

test("automation scenarios expose selected-row bulk actions near the table", () => {
  assert.match(source, /const \[deletingBulk, setDeletingBulk\] = useState\(false\)/);
  assert.match(source, /const canBulkDelete = selectedScenarios\.length > 0 && !savingBulk && !deletingBulk/);
  assert.match(source, /const handleBulkDelete = async \(\) =>/);
  assert.match(source, /window\.confirm\(/);
  assert.match(source, /method: "DELETE"/);
  assert.match(source, /Bulk update status\/tags or move selected scenarios to the\s+recycle bin\./);
  assert.match(source, /Update selected/);
  assert.match(source, /Delete selected/);
  assert.match(source, /onClick=\{\(\) => setSelectedIds\(new Set\(\)\)\}/);
});
