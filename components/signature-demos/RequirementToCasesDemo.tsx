"use client";

import { useMemo } from "react";
import DemoControls from "./DemoControls";
import { after, between, useDemoTimeline } from "./useDemoTimeline";

export default function RequirementToCasesDemo() {
  const demo = useDemoTimeline({ durationMs: 9800 });
  const { progress, setRootElement, state } = demo;
  const data = useMemo(
    () => ({
      categories: ["Functional", "Negative", "Edge", "Security", "Accessibility"],
      entities: ["Login", "Valid credentials", "Invalid credentials", "Validation", "Security"],
      testCases: [
        "Valid user signs in successfully",
        "Invalid password shows a clear error",
        "Locked account remains protected",
        "Keyboard-only login remains operable",
      ],
    }),
    [],
  );

  const entityProgress = between(progress, 0.08, 0.26);
  const categoryProgress = between(progress, 0.24, 0.4);
  const cardsProgress = between(progress, 0.38, 0.66);
  const coverageScore = Math.round(54 + between(progress, 0.56, 0.84) * 38);
  const qualityScore = Math.round(68 + between(progress, 0.6, 0.88) * 24);
  const missingResolved = after(progress, 0.78);
  const duplicateResolved = after(progress, 0.86);

  return (
    <section
      ref={setRootElement}
      className="cf-signature-demo cf-req-cases-demo"
      data-demo-state={state}
      aria-label="Requirement to test cases demo"
    >
      <div className="cf-signature-demo-header">
        <div>
          <p className="cf-marketing-eyebrow">Signature Demo 01</p>
          <h3>Requirement to test cases</h3>
        </div>
        <DemoControls timeline={demo} />
      </div>

      <div className="cf-req-cases-layout">
        <article className="cf-demo-panel cf-requirement-card">
          <p>Requirement</p>
          <h4>Verify login using valid and invalid credentials.</h4>
          <div className="cf-recognized-entities">
            {data.entities.map((entity, index) => (
              <span
                data-visible={entityProgress >= (index + 1) / data.entities.length ? "true" : "false"}
                key={entity}
              >
                {entity}
              </span>
            ))}
          </div>
        </article>

        <article className="cf-demo-panel">
          <p>Generated categories</p>
          <div className="cf-demo-category-grid">
            {data.categories.map((category, index) => (
              <span
                data-visible={categoryProgress >= (index + 1) / data.categories.length ? "true" : "false"}
                key={category}
              >
                {category}
              </span>
            ))}
          </div>
        </article>

        <article className="cf-demo-panel cf-demo-score-panel">
          <p>Coverage signals</p>
          <div className="cf-demo-score-row">
            <span>Coverage</span>
            <strong>{coverageScore}%</strong>
          </div>
          <div className="cf-demo-score-meter">
            <span style={{ transform: `scaleX(${coverageScore / 100})` }} />
          </div>
          <div className="cf-demo-score-row">
            <span>Quality</span>
            <strong>{qualityScore}%</strong>
          </div>
          <div className="cf-demo-score-meter">
            <span style={{ transform: `scaleX(${qualityScore / 100})` }} />
          </div>
          <div className="cf-demo-signal-list">
            <span data-resolved={missingResolved ? "true" : "false"}>
              Missing security case {missingResolved ? "resolved" : "detected"}
            </span>
            <span data-resolved={duplicateResolved ? "true" : "false"}>
              Duplicate login validation {duplicateResolved ? "merged" : "flagged"}
            </span>
          </div>
        </article>

        <article className="cf-demo-panel cf-generated-case-stack">
          <p>Generated cases</p>
          {data.testCases.map((testCase, index) => (
            <div
              className="cf-generated-case-card"
              data-visible={cardsProgress >= (index + 1) / data.testCases.length ? "true" : "false"}
              key={testCase}
            >
              <span>TC0{index + 1}</span>
              <strong>{testCase}</strong>
              <small>Reviewable manual case with expected result.</small>
            </div>
          ))}
        </article>
      </div>
    </section>
  );
}
