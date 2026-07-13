"use client";

import { useMemo } from "react";
import DemoControls from "./DemoControls";
import { after, between, useDemoTimeline } from "./useDemoTimeline";

export default function CaseToAutomationDemo() {
  const demo = useDemoTimeline({ durationMs: 10400 });
  const { progress, setRootElement, state } = demo;
  const data = useMemo(
    () => ({
      commands: [
        {
          id: "01",
          label: "Open homepage URL",
          status: "Ready",
          detail: "Navigate to the reviewed test environment.",
        },
        {
          id: "02",
          label: "Capture hero heading",
          status: "Mapped",
          detail: "Store heading text in {{heroHeading}}.",
        },
        {
          id: "03",
          label: "Compare expected heading",
          status: "Mapped",
          detail: "Assert {{heroHeading}} equals approved copy.",
        },
        {
          id: "04",
          label: "Click primary action",
          status: "Queued",
          detail: "Use stable role and visible text locator.",
        },
      ],
      fields: [
        ["Target", "hero heading"],
        ["Variable", "{{heroHeading}}"],
        ["Expected", "Launch smarter QA"],
        ["Locator", "role=heading, level=1"],
      ],
      manualSteps: [
        "Open the homepage.",
        "Review the hero heading.",
        "Click the primary call to action.",
      ],
    }),
    [],
  );

  const parsingProgress = between(progress, 0.08, 0.24);
  const mappingProgress = between(progress, 0.24, 0.48);
  const commandProgress = between(progress, 0.42, 0.74);
  const confidence = Math.round(62 + between(progress, 0.5, 0.88) * 31);
  const validationReady = after(progress, 0.68);
  const draftReady = after(progress, 0.9);

  return (
    <section
      ref={setRootElement}
      className="cf-signature-demo cf-case-automation-demo"
      data-demo-state={state}
      aria-label="Manual case to automation demo"
    >
      <div className="cf-signature-demo-header">
        <div>
          <p className="cf-marketing-eyebrow">Signature Demo 02</p>
          <h3>Manual case to automation draft</h3>
        </div>
        <DemoControls timeline={demo} />
      </div>

      <div className="cf-case-automation-layout">
        <article className="cf-demo-panel cf-case-source-card">
          <p>Approved manual case</p>
          <h4>Hero content is visible and the primary action opens the workspace flow.</h4>
          <div className="cf-case-manual-steps">
            {data.manualSteps.map((step, index) => (
              <span
                data-visible={parsingProgress >= (index + 1) / data.manualSteps.length ? "true" : "false"}
                key={step}
              >
                {step}
              </span>
            ))}
          </div>
        </article>

        <article className="cf-demo-panel cf-command-mapping-card">
          <p>Command mapping</p>
          <div className="cf-command-field-grid">
            {data.fields.map(([label, value], index) => (
              <span
                data-visible={mappingProgress >= (index + 1) / data.fields.length ? "true" : "false"}
                key={label}
              >
                <small>{label}</small>
                <strong>{value}</strong>
              </span>
            ))}
          </div>
        </article>

        <article className="cf-demo-panel cf-automation-command-list">
          <p>Automation draft</p>
          {data.commands.map((command, index) => (
            <div
              className="cf-automation-command-card"
              data-visible={commandProgress >= (index + 1) / data.commands.length ? "true" : "false"}
              key={command.id}
            >
              <span>{command.id}</span>
              <div>
                <strong>{command.label}</strong>
                <small>{command.detail}</small>
              </div>
              <em>{command.status}</em>
            </div>
          ))}
        </article>

        <article className="cf-demo-panel cf-automation-readiness-card">
          <p>Draft readiness</p>
          <div className="cf-demo-score-row">
            <span>Mapping confidence</span>
            <strong>{confidence}%</strong>
          </div>
          <div className="cf-demo-score-meter">
            <span style={{ transform: `scaleX(${confidence / 100})` }} />
          </div>
          <div className="cf-demo-signal-list">
            <span data-resolved={validationReady ? "true" : "false"}>
              Variable comparison {validationReady ? "ready" : "being prepared"}
            </span>
            <span data-resolved={draftReady ? "true" : "false"}>
              Automation draft {draftReady ? "ready for review" : "waiting for review"}
            </span>
          </div>
        </article>
      </div>
    </section>
  );
}
