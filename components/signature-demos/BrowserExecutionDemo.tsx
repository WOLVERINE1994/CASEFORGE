"use client";

import { useMemo } from "react";
import DemoControls from "./DemoControls";
import { after, between, useDemoTimeline } from "./useDemoTimeline";

export default function BrowserExecutionDemo() {
  const demo = useDemoTimeline({ durationMs: 11200 });
  const { progress, setRootElement, state } = demo;
  const data = useMemo(
    () => ({
      commands: [
        ["Navigate", "Open https://caseforge.example"],
        ["Capture", "Read hero heading into {{heroHeading}}"],
        ["Verify", "Compare {{heroHeading}} with expected copy"],
        ["Click", "Activate primary workspace CTA"],
      ],
      evidence: [
        "Page loaded",
        "Heading captured",
        "Assertion passed",
        "CTA navigation observed",
      ],
      tabs: ["dom", "network", "evidence"],
    }),
    [],
  );

  const activeCommand = Math.min(data.commands.length - 1, Math.floor(between(progress, 0.08, 0.78) * data.commands.length));
  const browserReady = after(progress, 0.12);
  const headingCaptured = after(progress, 0.38);
  const assertionPassed = after(progress, 0.58);
  const ctaClicked = after(progress, 0.76);
  const evidenceProgress = between(progress, 0.2, 0.9);
  const runProgress = Math.round(between(progress, 0.08, 0.92) * 100);
  const activeTab = progress < 0.38 ? "dom" : progress < 0.68 ? "network" : "evidence";

  return (
    <section
      ref={setRootElement}
      className="cf-signature-demo cf-browser-execution-demo"
      data-demo-state={state}
      aria-label="Browser execution demo"
    >
      <div className="cf-signature-demo-header">
        <div>
          <p className="cf-marketing-eyebrow">Signature Demo 03</p>
          <h3>Execute the draft in a browser</h3>
        </div>
        <DemoControls timeline={demo} />
      </div>

      <div className="cf-browser-execution-layout">
        <article className="cf-demo-panel cf-browser-shell-card">
          <p>Live browser preview</p>
          <div className="cf-browser-chrome" data-ready={browserReady ? "true" : "false"}>
            <div className="cf-browser-topbar">
              <span />
              <span />
              <span />
              <strong>caseforge.example</strong>
            </div>
            <div className="cf-browser-stage">
              <div className="cf-browser-hero">
                <span data-active={headingCaptured ? "true" : "false"}>Launch smarter QA</span>
                <small>Manual cases, automation drafts and release evidence in one workspace.</small>
                <span className="cf-browser-cta" data-clicked={ctaClicked ? "true" : "false"}>
                  Open workspace
                </span>
              </div>
              <div className="cf-browser-highlight" data-active={headingCaptured ? "true" : "false"} />
              <div className="cf-browser-cursor" data-clicked={ctaClicked ? "true" : "false"} />
            </div>
          </div>
        </article>

        <article className="cf-demo-panel cf-run-progress-card">
          <p>Run progress</p>
          <div className="cf-demo-score-row">
            <span>Execution</span>
            <strong>{runProgress}%</strong>
          </div>
          <div className="cf-demo-score-meter">
            <span style={{ transform: `scaleX(${runProgress / 100})` }} />
          </div>
          <div className="cf-run-command-stack">
            {data.commands.map(([label, detail], index) => (
              <div
                className="cf-run-command-card"
                data-active={activeCommand === index ? "true" : "false"}
                data-complete={activeCommand > index || runProgress === 100 ? "true" : "false"}
                key={label}
              >
                <span>{index + 1}</span>
                <div>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="cf-demo-panel cf-run-inspector-card">
          <p>Execution inspector</p>
          <div className="cf-run-inspector-tabs">
            {data.tabs.map((tab) => (
              <span data-active={activeTab === tab ? "true" : "false"} key={tab}>
                {tab}
              </span>
            ))}
          </div>
          <div className="cf-run-inspector-output">
            <span data-visible={headingCaptured ? "true" : "false"}>heroHeading = &quot;Launch smarter QA&quot;</span>
            <span data-visible={assertionPassed ? "true" : "false"}>expectedHeading comparison passed</span>
            <span data-visible={ctaClicked ? "true" : "false"}>workspace CTA click recorded</span>
          </div>
        </article>

        <article className="cf-demo-panel cf-run-evidence-card">
          <p>Run evidence</p>
          {data.evidence.map((item, index) => (
            <span
              data-visible={evidenceProgress >= (index + 1) / data.evidence.length ? "true" : "false"}
              key={item}
            >
              {item}
            </span>
          ))}
        </article>
      </div>
    </section>
  );
}
