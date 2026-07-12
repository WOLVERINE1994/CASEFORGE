"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useMarketingMotion from "./useMarketingMotion";

const workflowSteps = [
  "Requirement",
  "Test Cases",
  "Editable Automation",
  "Browser Execution",
  "Self-Healing",
  "Report",
];

const commandRows = [
  "Open login page",
  "Capture hero heading",
  "Verify access request CTA",
  "Run browser check",
];

export default function MarketingHeroPreview() {
  const motion = useMarketingMotion();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const runTimerRef = useRef<number | null>(null);
  const hasAutoPlayedRef = useRef(false);
  const [interactive, setInteractive] = useState(false);
  const [inView, setInView] = useState(false);
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState(0);

  const canAnimate = motion.enabled;

  const clearRunTimer = useCallback(() => {
    if (runTimerRef.current) {
      window.clearTimeout(runTimerRef.current);
      runTimerRef.current = null;
    }
  }, []);

  const startRun = useCallback(() => {
    clearRunTimer();
    setRunId((current) => current + 1);
    setRunning(true);
    runTimerRef.current = window.setTimeout(() => {
      setRunning(false);
      runTimerRef.current = null;
    }, 16000);
  }, [clearRunTimer]);

  useEffect(() => {
    if (!canAnimate) return;

    const frame = window.requestAnimationFrame(() => {
      setInteractive(true);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [canAnimate]);

  useEffect(() => {
    if (!canAnimate) {
      clearRunTimer();
      return;
    }

    const node = rootRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const isIntersecting = Boolean(entry?.isIntersecting);
        setInView(isIntersecting);
        if (!isIntersecting) {
          clearRunTimer();
          setRunning(false);
        }
      },
      { threshold: 0.42 },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [canAnimate, clearRunTimer]);

  useEffect(() => {
    if (!canAnimate || !interactive || !inView) {
      clearRunTimer();
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      if (!hasAutoPlayedRef.current) {
        hasAutoPlayedRef.current = true;
        startRun();
      }
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [canAnimate, clearRunTimer, inView, interactive, startRun]);

  useEffect(() => {
    if (!canAnimate || !inView || !motion.hasFinePointer || motion.isTouchLike) {
      return;
    }

    const node = rootRef.current;
    if (!node) return;

    let animationFrame = 0;
    let latestX = 0;
    let latestY = 0;

    const applyDepth = () => {
      const rect = node.getBoundingClientRect();
      const x = ((latestX - rect.left) / rect.width - 0.5) * 12;
      const y = ((latestY - rect.top) / rect.height - 0.5) * 12;
      node.style.setProperty("--cf-hero-depth-x", `${Math.max(-6, Math.min(6, x)).toFixed(2)}px`);
      node.style.setProperty("--cf-hero-depth-y", `${Math.max(-6, Math.min(6, y)).toFixed(2)}px`);
      animationFrame = 0;
    };

    const handlePointerMove = (event: PointerEvent) => {
      latestX = event.clientX;
      latestY = event.clientY;
      if (!animationFrame) {
        animationFrame = window.requestAnimationFrame(applyDepth);
      }
    };

    const resetDepth = () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }
      node.style.setProperty("--cf-hero-depth-x", "0px");
      node.style.setProperty("--cf-hero-depth-y", "0px");
    };

    node.addEventListener("pointermove", handlePointerMove);
    node.addEventListener("pointerleave", resetDepth);

    return () => {
      node.removeEventListener("pointermove", handlePointerMove);
      node.removeEventListener("pointerleave", resetDepth);
      resetDepth();
    };
  }, [canAnimate, inView, motion.hasFinePointer, motion.isTouchLike]);

  useEffect(() => {
    return () => {
      clearRunTimer();
    };
  }, [clearRunTimer]);

  return (
    <div
      ref={rootRef}
      className="cf-marketing-hero-preview"
      data-marketing-motion={canAnimate ? "enabled" : "static"}
      data-running={canAnimate && inView && running ? "true" : "false"}
    >
      <div className="cf-marketing-preview-ambient" aria-hidden="true" />
      <div className="cf-marketing-workflow-strip" aria-label="CaseForge workflow">
        {workflowSteps.map((step, index) => (
          <div className="cf-marketing-workflow-step" key={step}>
            <span>{step}</span>
            {index < workflowSteps.length - 1 ? (
              <svg viewBox="0 0 56 8" aria-hidden="true">
                <path d="M1 4H50" />
                <path d="M48 1L53 4L48 7" />
              </svg>
            ) : null}
          </div>
        ))}
      </div>

      <div className="cf-marketing-preview-stage" key={runId}>
        <section className="cf-marketing-requirement-panel" aria-label="Requirement input">
          <p>Requirement Studio</p>
          <div className="cf-marketing-requirement-text">
            Admin users must approve access requests before a workspace opens.
          </div>
          <div className="cf-marketing-entity-row" aria-hidden="true">
            <span>Admin users</span>
            <span>access requests</span>
            <span>workspace</span>
          </div>
        </section>

        <section className="cf-marketing-case-stack" aria-label="Generated test cases">
          {[
            "Pending user sees approval state",
            "Approved user opens workspace",
            "Rejected user stays blocked",
          ].map((title, index) => (
            <article
              className="cf-marketing-case-card"
              data-selected={index === 1 ? "true" : undefined}
              key={title}
            >
              <span>TC0{index + 1}</span>
              <strong>{title}</strong>
              <p>Expected result captured with review-ready steps.</p>
            </article>
          ))}
        </section>

        <section className="cf-marketing-command-timeline" aria-label="Automation command timeline">
          {commandRows.map((command, index) => (
            <div className="cf-marketing-command-row" key={command}>
              <span>{index + 1}</span>
              <p>{command}</p>
            </div>
          ))}
        </section>

        <section className="cf-marketing-browser-preview" aria-label="Browser execution preview">
          <div className="cf-marketing-browser-topbar">
            <span />
            <span />
            <span />
            <p>caseforge.app/workspace</p>
          </div>
          <div className="cf-marketing-browser-body">
            <div className="cf-marketing-page-line wide" />
            <div className="cf-marketing-page-line" />
            <button type="button">Request Access</button>
          </div>
          <div className="cf-marketing-execution-status">
            <span>Running browser execution</span>
            <strong>Locator retry detected</strong>
          </div>
        </section>

        <section className="cf-marketing-healing-panel" aria-label="Self healing locator">
          <p>Self-Healing</p>
          <strong>Button locator updated</strong>
          <code>{"role=button[name=\"Request Access\"]"}</code>
        </section>

        <section className="cf-marketing-report-panel" aria-label="Final report summary">
          <p>Execution Report</p>
          <strong>6 checks passed</strong>
          <span>Coverage, evidence and healed locator trace ready.</span>
        </section>
      </div>

      <div className="cf-marketing-hero-actions">
        <button
          type="button"
          onClick={startRun}
          disabled={!canAnimate || !inView}
          aria-label="Replay CaseForge workflow animation"
        >
          Replay workflow
        </button>
        <span>{canAnimate ? "Lightweight timeline" : "Static preview"}</span>
      </div>
    </div>
  );
}
