"use client";

import { useMemo } from "react";
import DemoControls from "./DemoControls";
import { after, between, useDemoTimeline } from "./useDemoTimeline";

export default function SelfHealingDemo() {
  const demo = useDemoTimeline({ durationMs: 11600 });
  const { progress, setRootElement, state } = demo;
  const data = useMemo(
    () => ({
      candidates: [
        {
          label: "role=button, name=Open workspace",
          score: 94,
          signal: "semantic role + visible text",
        },
        {
          label: "text=Open workspace",
          score: 81,
          signal: "visible copy match",
        },
        {
          label: "[data-testid=hero-cta]",
          score: 58,
          signal: "missing in latest DOM",
        },
      ],
      audit: [
        "Original locator failed",
        "DOM snapshot compared",
        "Semantic candidate selected",
        "Run resumed after review gate",
      ],
      locatorBefore: "#hero button.primary",
      locatorAfter: "role=button, name=Open workspace",
    }),
    [],
  );

  const failureDetected = after(progress, 0.16);
  const snapshotReady = after(progress, 0.32);
  const candidateProgress = between(progress, 0.36, 0.64);
  const selectedCandidate = after(progress, 0.66);
  const reviewReady = after(progress, 0.76);
  const resumed = after(progress, 0.88);
  const confidence = Math.round(44 + between(progress, 0.36, 0.78) * 50);
  const auditProgress = between(progress, 0.18, 0.92);

  return (
    <section
      ref={setRootElement}
      className="cf-signature-demo cf-self-healing-demo"
      data-demo-state={state}
      aria-label="Self healing locator demo"
    >
      <div className="cf-signature-demo-header">
        <div>
          <p className="cf-marketing-eyebrow">Signature Demo 04</p>
          <h3>Heal a broken locator</h3>
        </div>
        <DemoControls timeline={demo} />
      </div>

      <div className="cf-self-healing-layout">
        <article className="cf-demo-panel cf-healing-browser-card">
          <p>Failure moment</p>
          <div className="cf-healing-browser">
            <div className="cf-healing-browser-bar">
              <span />
              <span />
              <span />
              <strong>caseforge.example</strong>
            </div>
            <div className="cf-healing-browser-body">
              <div className="cf-healing-target" data-failed={failureDetected ? "true" : "false"}>
                <strong>Open workspace</strong>
                <small>CTA moved into a new hero action group.</small>
              </div>
              <div className="cf-healing-warning" data-visible={failureDetected ? "true" : "false"}>
                Locator mismatch detected
              </div>
              <div className="cf-healing-snapshot" data-visible={snapshotReady ? "true" : "false"}>
                DOM snapshot ready
              </div>
            </div>
          </div>
        </article>

        <article className="cf-demo-panel cf-healing-locator-card">
          <p>Locator repair</p>
          <div className="cf-healing-locator-row" data-state={failureDetected ? "failed" : "idle"}>
            <small>Before</small>
            <strong>{data.locatorBefore}</strong>
          </div>
          <div className="cf-healing-locator-row" data-state={selectedCandidate ? "healed" : "pending"}>
            <small>After</small>
            <strong>{data.locatorAfter}</strong>
          </div>
          <div className="cf-demo-score-row">
            <span>Repair confidence</span>
            <strong>{confidence}%</strong>
          </div>
          <div className="cf-demo-score-meter">
            <span style={{ transform: `scaleX(${confidence / 100})` }} />
          </div>
        </article>

        <article className="cf-demo-panel cf-healing-candidate-card">
          <p>Candidate locators</p>
          <div className="cf-healing-candidate-stack">
            {data.candidates.map((candidate, index) => (
              <div
                className="cf-healing-candidate"
                data-selected={selectedCandidate && index === 0 ? "true" : "false"}
                data-visible={candidateProgress >= (index + 1) / data.candidates.length ? "true" : "false"}
                key={candidate.label}
              >
                <div>
                  <strong>{candidate.label}</strong>
                  <small>{candidate.signal}</small>
                </div>
                <span>{candidate.score}%</span>
              </div>
            ))}
          </div>
        </article>

        <article className="cf-demo-panel cf-healing-audit-card">
          <p>Review gate</p>
          <div className="cf-healing-review-status">
            <span data-active={reviewReady ? "true" : "false"}>Owner review ready</span>
            <span data-active={resumed ? "true" : "false"}>Run resumed</span>
          </div>
          <div className="cf-healing-audit-stack">
            {data.audit.map((item, index) => (
              <span
                data-visible={auditProgress >= (index + 1) / data.audit.length ? "true" : "false"}
                key={item}
              >
                {item}
              </span>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
