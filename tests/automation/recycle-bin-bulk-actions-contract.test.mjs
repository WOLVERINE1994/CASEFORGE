import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("components/AutomationRecycleBinClient.tsx", "utf8");

test("recycle bin exposes selected-item bulk actions", () => {
  assert.match(source, /const \[selectedItemKeys, setSelectedItemKeys\] = useState<Set<string>>\(new Set\(\)\)/);
  assert.match(source, /const \[restoringBulk, setRestoringBulk\] = useState\(false\)/);
  assert.match(source, /const \[purgingBulk, setPurgingBulk\] = useState\(false\)/);
  assert.match(source, /const restoreSelectedItems = async \(\) =>/);
  assert.match(source, /const purgeSelectedItems = async \(\) =>/);
  assert.match(source, /method: "PATCH"/);
  assert.match(source, /method: "DELETE"/);
  assert.match(source, /Select visible/);
  assert.match(source, /aria-label=\{restoringBulk \? "Restoring selected items" : "Restore selected"\}/);
  assert.match(source, /aria-label=\{purgingBulk \? "Deleting selected items forever" : "Delete selected forever"\}/);
  assert.match(source, /aria-label="Clear selection"/);
  assert.match(source, /<svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4">/);
  assert.match(source, /className="inline-flex h-10 w-10 items-center justify-center rounded-xl/);
  assert.match(source, /Restore selected items or permanently delete them\./);
});
