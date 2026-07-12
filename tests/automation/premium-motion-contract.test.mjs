import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const globalCss = readFileSync("app/globals.css", "utf8");
const layoutSource = readFileSync("app/layout.tsx", "utf8");
const providerSource = readFileSync("components/PremiumMotionProvider.tsx", "utf8");
const hookSource = readFileSync("components/usePremiumMotion.ts", "utf8");
const responsiveShellSource = readFileSync("components/ResponsiveShell.tsx", "utf8");
const safeLayoutSource = readFileSync("components/SafeLayout.tsx", "utf8");

test("premium motion is centrally feature flagged and wired once", () => {
  assert.match(
    hookSource,
    /process\.env\.NEXT_PUBLIC_PREMIUM_MOTION_ENABLED === "true"/,
  );
  assert.match(hookSource, /prefers-reduced-motion: reduce/);
  assert.match(hookSource, /visibilitychange/);
  assert.match(hookSource, /pointer: fine/);
  assert.match(hookSource, /pointer: coarse/);
  assert.match(providerSource, /body\.dataset\.premiumMotion = "enabled"/);
  assert.match(providerSource, /delete body\.dataset\.premiumMotion/);
  assert.match(layoutSource, /<PremiumMotionProvider>\{shell\}<\/PremiumMotionProvider>/);
});

test("button premium motion is gated and avoids unsafe global animation", () => {
  assert.match(globalCss, /body\[data-premium-motion="enabled"\] :where\(button/);
  assert.match(globalCss, /transition-property: background-color, border-color, color, opacity, transform/);
  assert.match(globalCss, /transition-duration: 180ms/);
  assert.match(globalCss, /transform: translateY\(-1px\)/);
  assert.match(globalCss, /scale\(0\.985\)/);
  assert.doesNotMatch(globalCss, /data-premium-motion[^}]+box-shadow/s);
  assert.doesNotMatch(globalCss, /data-premium-motion[^}]+filter/s);
  assert.doesNotMatch(globalCss, /mousemove|scroll hijack|requestAnimationFrame/);
});

test("sidebar and tab motion is gated to lightweight active states", () => {
  assert.match(safeLayoutSource, /data-active=\{active \? "true" : undefined\}/);
  assert.match(globalCss, /body\[data-premium-motion="enabled"\] \.cf-safe-nav-item/);
  assert.match(globalCss, /\.cf-safe-nav-item\[data-active="true"\]/);
  assert.match(globalCss, /:where\(\[role="tab"\]\)/);
  assert.match(globalCss, /\[role="tab"\]\[aria-selected="true"\]/);
  assert.doesNotMatch(globalCss, /data-premium-motion[^}]+(?:width|height|top|left):/s);
});

test("overlay and dropdown motion stays CSS-gated and lightweight", () => {
  assert.match(responsiveShellSource, /cf-motion-scrim/);
  assert.match(responsiveShellSource, /cf-motion-drawer-panel/);
  assert.match(globalCss, /body\[data-premium-motion="enabled"\] :where\(select, \[role="combobox"\]\)/);
  assert.match(globalCss, /\.cf-motion-drawer-panel/);
  assert.match(globalCss, /\.cf-modal-detail\[open\] > \.cf-modal-panel/);
  assert.match(globalCss, /:where\(\[role="tooltip"\]\)/);
  assert.match(globalCss, /@keyframes cf-premium-panel-in/);
  assert.doesNotMatch(globalCss, /data-premium-motion[^}]+(?:backdrop-filter|box-shadow|filter):/s);
});
