import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layoutSource = readFileSync("app/layout.tsx", "utf8");
const shellSource = readFileSync("components/ResponsiveShell.tsx", "utf8");
const globalCss = readFileSync("app/globals.css", "utf8");

test("root layout enables the project-wide 3D UI environment", () => {
  assert.match(layoutSource, /className="cf-3d-app antialiased"/);
  assert.match(globalCss, /\.cf-3d-app\s*\{/);
  assert.match(globalCss, /perspective:\s*1800px/);
  assert.match(globalCss, /\.cf-3d-app::before/);
  assert.match(globalCss, /\.cf-3d-app > header/);
});

test("responsive project shell uses 3D depth layers", () => {
  assert.match(shellSource, /className="cf-3d-stage mx-auto/);
  assert.match(shellSource, /cf-3d-sidebar cf-panel/);
  assert.match(shellSource, /className="cf-3d-sidebar relative"/);
  assert.match(shellSource, /className="cf-3d-content min-w-0"/);
  assert.match(globalCss, /\.cf-3d-stage::before/);
  assert.match(globalCss, /\.cf-3d-sidebar/);
  assert.match(globalCss, /\.cf-3d-content/);
});

test("shared surfaces and controls receive subtle 3D depth safely", () => {
  assert.match(globalCss, /\.cf-panel::before/);
  assert.match(globalCss, /\.cf-panel:hover,\s*\n\.cf-card:hover/);
  assert.match(globalCss, /\.cf-primary-button/);
  assert.match(globalCss, /\.cf-secondary-button/);
  assert.match(globalCss, /--cf-control-shadow/);
  assert.match(globalCss, /\.cf-3d-app :where\(button, \[role="button"\], a\[href\]\[class\*="rounded"\]\)/);
  assert.match(globalCss, /\.cf-3d-app :where\(input, select, textarea\):focus/);
  assert.match(globalCss, /\.cf-table-shell:hover/);
  assert.match(globalCss, /translate3d\(0, -1px, 18px\)/);
  assert.doesNotMatch(globalCss, /\.cf-3d-app :where\(button, \[role="button"\], a\[href\]\[class\*="rounded"\]\)[^{]*\{[^}]*position:\s*relative/s);
  assert.doesNotMatch(globalCss, /\.cf-3d-app :where\(button\[class\*="rounded"\][^}]*::after/s);
  assert.doesNotMatch(globalCss, /\.cf-3d-app :where\(button, \[role="button"\], a\[href\]\[class\*="rounded"\)[^}]*scale\(0\.992\)/s);
  assert.doesNotMatch(globalCss, /background:\s*#f8fafc !important;\s*\n\s*background-image:\s*none !important;\s*\n\s*color:\s*#020617 !important/);
  assert.match(globalCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(globalCss, /transform: none !important/);
});
