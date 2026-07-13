"use client";

import { useMemo } from "react";
import DemoControls from "./DemoControls";
import { after, between, useDemoTimeline } from "./useDemoTimeline";

export default function RunReportDemo() {
  const demo = useDemoTimeline({ durationMs: 11800 });
  const { progress, setRootElement, state } = demo;
  const data = useMemo(
    () => ({
      metrics: [
        ["Passed", "18"],
        ["Needs review", "2"],
        ["Healed", "1"],
        ["Coverage", "94%"],
      ],
      coverage: [
        ["Manual cases", 92],
        ["Automation", 88],
        ["Release risk", 76],
      ],
      artifacts: [
        "Execution timeline",
        "Screenshots and locator evidence",
        "Coverage matrix",
        "Release summary PDF",
      ],
      insights: [
        "Checkout CTA was healed and requires owner approval.",
        "Password reset keeps full manual and automation coverage.",
        "Release confidence is high after one reviewed locator repair.",
      ],
    }),
    [],
  );

  const metricProgress = between(progress, 0.08, 0.28);
  const coverageProgress = between(progress, 0.24, 0.52);
  const artifactProgress = between(progress, 0.48, 0.76);
  const insightProgress = between(progress, 0.62, 0.9);
  const recommendationReady = after(progress, 0.82);
  const exportReady = after(progress, 0.92);
  const confidence = Math.round(71 + between(progress, 0.42, 0.88) * 21);

  return (
    <section
      ref={setRootElement}
      className="cf-signature-demo cf-run-report-demo"
      data-demo-state={state}
      aria-label="Run report demo"
    >
      <div className="cf-signature-demo-header">
        <div>
          <p className="cf-marketing-eyebrow">Signature Demo 05</p>
          <h3>Generate the release report</h3>
        </div>
        <DemoControls timeline={demo} />
      </div>

      <div className="cf-run-report-layout">
        <article className="cf-demo-panel cf-report-summary-card">
          <p>Report summary</p>
          <div className="cf-report-metric-grid">
            {data.metrics.map(([label, value], index) => (
              <span
                data-visible={metricProgress >= (index + 1) / data.metrics.length ? "true" : "false"}
                key={label}
              >
                <strong>{value}</strong>
                <small>{label}</small>
              </span>
            ))}
          </div>
        </article>

        <article className="cf-demo-panel cf-report-coverage-card">
          <p>Coverage matrix</p>
          <div className="cf-report-coverage-stack">
            {data.coverage.map(([label, value], index) => {
              const score = Number(value);
              const visible = coverageProgress >= (index + 1) / data.coverage.length;
              return (
                <div className="cf-report-coverage-row" data-visible={visible ? "true" : "false"} key={label}>
                  <div>
                    <span>{label}</span>
                    <strong>{score}%</strong>
                  </div>
                  <div className="cf-demo-score-meter">
                    <span style={{ transform: `scaleX(${visible ? score / 100 : 0})` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <article className="cf-demo-panel cf-report-recommendation-card">
          <p>Release recommendation</p>
          <div className="cf-report-confidence">
            <span>Confidence</span>
            <strong>{confidence}%</strong>
          </div>
          <div className="cf-report-badge" data-ready={recommendationReady ? "true" : "false"}>
            Ship with reviewed locator repair
          </div>
          <div className="cf-report-export-status">
            <span data-active={exportReady ? "true" : "false"}>PDF ready</span>
            <span data-active={exportReady ? "true" : "false"}>CSV ready</span>
          </div>
        </article>

        <article className="cf-demo-panel cf-report-artifacts-card">
          <p>Evidence package</p>
          <div className="cf-report-artifact-stack">
            {data.artifacts.map((artifact, index) => (
              <span
                data-visible={artifactProgress >= (index + 1) / data.artifacts.length ? "true" : "false"}
                key={artifact}
              >
                {artifact}
              </span>
            ))}
          </div>
        </article>

        <article className="cf-demo-panel cf-report-insights-card">
          <p>Review notes</p>
          <div className="cf-report-insight-stack">
            {data.insights.map((insight, index) => (
              <span
                data-visible={insightProgress >= (index + 1) / data.insights.length ? "true" : "false"}
                key={insight}
              >
                {insight}
              </span>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
