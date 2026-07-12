import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const homeSource = readFileSync("app/page.tsx", "utf8");
const globalCss = readFileSync("app/globals.css", "utf8");
const heroSource = readFileSync("components/MarketingHeroPreview.tsx", "utf8");
const sectionsSource = readFileSync("components/MarketingFeatureSections.tsx", "utf8");
const hookSource = readFileSync("components/useMarketingMotion.ts", "utf8");

function keyframeBlock(css, name) {
  const start = css.indexOf(`@keyframes ${name}`);
  assert.notEqual(start, -1, `${name} keyframes should exist`);

  const firstBrace = css.indexOf("{", start);
  let depth = 0;
  for (let index = firstBrace; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") depth -= 1;
    if (depth === 0) return css.slice(start, index + 1);
  }

  throw new Error(`${name} keyframes were not closed`);
}

test("marketing motion is gated behind both public flags", () => {
  assert.match(hookSource, /NEXT_PUBLIC_PREMIUM_MOTION_ENABLED/);
  assert.match(hookSource, /NEXT_PUBLIC_MARKETING_MOTION_ENABLED/);
  assert.match(hookSource, /prefers-reduced-motion: reduce/);
  assert.match(hookSource, /visibilitychange/);
  assert.match(hookSource, /pointer: fine/);
  assert.match(hookSource, /pointer: coarse/);
  assert.match(heroSource, /data-marketing-motion=\{canAnimate \? "enabled" : "static"\}/);
  assert.match(sectionsSource, /data-marketing-motion=\{motion\.enabled \? "enabled" : "static"\}/);
});

test("homepage lazy-loads marketing enhancements and leaves app routes untouched", () => {
  assert.match(homeSource, /dynamic\(/);
  assert.match(homeSource, /MarketingHeroPreviewFallback/);
  assert.match(homeSource, /MarketingHeroPreview/);
  assert.match(homeSource, /MarketingFeatureSections/);
  assert.doesNotMatch(homeSource, /projects\/\*/);
  assert.doesNotMatch(heroSource + sectionsSource, /\/api\/|readProjects|Prisma|automation\/projects/);
});

test("hero timeline uses lightweight cleaned-up browser primitives", () => {
  assert.match(heroSource, /IntersectionObserver/);
  assert.match(heroSource, /requestAnimationFrame/);
  assert.match(heroSource, /cancelAnimationFrame/);
  assert.match(heroSource, /addEventListener\("pointermove"/);
  assert.match(heroSource, /removeEventListener\("pointermove"/);
  assert.match(heroSource, /clearTimeout/);
  assert.match(heroSource, /Replay workflow/);
  assert.doesNotMatch(heroSource + globalCss, /three|canvas|particles|ScrollTrigger|gsap|mousemove/);
});

test("marketing css is scoped and transform opacity based", () => {
  assert.match(globalCss, /\.cf-marketing-hero-preview/);
  assert.match(globalCss, /\.cf-marketing-sections/);
  assert.match(globalCss, /@keyframes cf-marketing-reveal/);
  assert.match(globalCss, /@keyframes cf-marketing-path-draw/);
  assert.match(globalCss, /transform: translateY/);
  assert.match(globalCss, /opacity:/);
  [
    "cf-marketing-reveal",
    "cf-marketing-entity",
    "cf-marketing-command-dock",
    "cf-marketing-selected-case",
    "cf-marketing-report-in",
    "cf-marketing-path-draw",
    "cf-marketing-ambient",
  ].forEach((name) => {
    assert.doesNotMatch(keyframeBlock(globalCss, name), /(?:width|height|top|left|filter):/);
  });
});
