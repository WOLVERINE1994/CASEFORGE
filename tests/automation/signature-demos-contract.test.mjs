import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync("app/page.tsx", "utf8");
const cssSource = readFileSync("app/globals.css", "utf8");
const motionHookSource = readFileSync(
  "components/signature-demos/useSignatureDemoMotion.ts",
  "utf8",
);
const timelineSource = readFileSync(
  "components/signature-demos/useDemoTimeline.ts",
  "utf8",
);
const lazySlotSource = readFileSync(
  "components/signature-demos/SignatureDemoLazySlot.tsx",
  "utf8",
);
const sectionSource = readFileSync(
  "components/signature-demos/SignatureDemosSection.tsx",
  "utf8",
);
const requirementDemoSource = readFileSync(
  "components/signature-demos/RequirementToCasesDemo.tsx",
  "utf8",
);

test("signature demos require all marketing motion flags and lazy loading", () => {
  assert.match(motionHookSource, /NEXT_PUBLIC_SIGNATURE_DEMOS_ENABLED/);
  assert.match(motionHookSource, /marketingMotion\.enabled && signatureDemosEnabled/);
  assert.match(pageSource, /SignatureDemosSection/);
  assert.match(lazySlotSource, /IntersectionObserver/);
  assert.match(lazySlotSource, /rootMargin: "420px 0px"/);
  assert.match(sectionSource, /import\("\.\/RequirementToCasesDemo"\)/);
});

test("shared demo timeline centralizes cleanup and playback state", () => {
  assert.match(timelineSource, /DemoPlaybackState/);
  assert.match(timelineSource, /"idle"/);
  assert.match(timelineSource, /"playing"/);
  assert.match(timelineSource, /"paused"/);
  assert.match(timelineSource, /"completed"/);
  assert.match(timelineSource, /"replaying"/);
  assert.match(timelineSource, /"reduced-motion"/);
  assert.match(timelineSource, /requestAnimationFrame/);
  assert.match(timelineSource, /cancelAnimationFrame/);
  assert.match(timelineSource, /observer\.disconnect/);
});

test("requirement demo uses mock data and exposes required controls", () => {
  assert.match(requirementDemoSource, /RequirementToCasesDemo/);
  assert.match(requirementDemoSource, /Verify login using valid and invalid credentials/);
  assert.match(requirementDemoSource, /Functional/);
  assert.match(requirementDemoSource, /Negative/);
  assert.match(requirementDemoSource, /Accessibility/);
  assert.match(requirementDemoSource, /coverageScore/);
  assert.match(requirementDemoSource, /qualityScore/);
  assert.match(requirementDemoSource, /missingResolved/);
  assert.match(requirementDemoSource, /duplicateResolved/);
  assert.doesNotMatch(requirementDemoSource, /fetch\(|Prisma|readProjects|automation\/sessions|api\//);
});

test("signature demo css is isolated from authenticated product routes", () => {
  assert.match(cssSource, /\.cf-signature-demo/);
  assert.match(cssSource, /\.cf-req-cases-demo/);
  assert.doesNotMatch(cssSource, /projects\/\*/);
  assert.doesNotMatch(cssSource, /automation\/projects/);
});
