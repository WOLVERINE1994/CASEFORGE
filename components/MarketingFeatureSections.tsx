"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import useMarketingMotion from "./useMarketingMotion";

const features = [
  {
    eyebrow: "Requirement Intelligence",
    title: "From story to reviewable coverage",
    body: "CaseForge turns a requirement into manual test cases first, so reviewers can inspect intent before automation begins.",
  },
  {
    eyebrow: "Automation Authoring",
    title: "Editable commands, not black boxes",
    body: "Selected cases expand into a command timeline with locators, variables, validations and browser-ready execution steps.",
  },
  {
    eyebrow: "Execution Confidence",
    title: "Runs explain what changed",
    body: "Execution status, healed locator trace and report summaries stay connected to the original test case.",
  },
];

const metrics = [
  { label: "Workflow stages", value: 6 },
  { label: "Review checkpoints", value: 4 },
  { label: "Automation handoff", value: 1 },
];

export default function MarketingFeatureSections() {
  const motion = useMarketingMotion();
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const metricRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const counterFrameRef = useRef(0);
  const [visibleSections, setVisibleSections] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!motion.enabled) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const nextVisible = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => entry.target.getAttribute("data-marketing-section"))
          .filter(Boolean) as string[];

        if (!nextVisible.length) return;

        setVisibleSections((current) => {
          let changed = false;
          const next = new Set(current);
          nextVisible.forEach((id) => {
            if (!next.has(id)) {
              next.add(id);
              changed = true;
            }
          });
          return changed ? next : current;
        });
      },
      { rootMargin: "0px 0px -18% 0px", threshold: 0.22 },
    );

    Object.values(sectionRefs.current).forEach((node) => {
      if (node) observer.observe(node);
    });

    return () => {
      observer.disconnect();
    };
  }, [motion.enabled]);

  useEffect(() => {
    if (!motion.enabled || !visibleSections.has("metrics")) return;

    const startedAt = performance.now();
    const duration = 900;

    const updateCounters = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);

      metrics.forEach((metric, index) => {
        const node = metricRefs.current[index];
        if (node) node.textContent = `${Math.round(metric.value * eased)}`;
      });

      if (progress < 1) {
        counterFrameRef.current = window.requestAnimationFrame(updateCounters);
      }
    };

    counterFrameRef.current = window.requestAnimationFrame(updateCounters);

    return () => {
      if (counterFrameRef.current) {
        window.cancelAnimationFrame(counterFrameRef.current);
        counterFrameRef.current = 0;
      }
    };
  }, [motion.enabled, visibleSections]);

  const cardPointerProps =
    motion.enabled && motion.hasFinePointer && !motion.isTouchLike
      ? {
          onPointerMove: (event: PointerEvent<HTMLElement>) => {
            const target = event.currentTarget;
            const rect = target.getBoundingClientRect();
            target.style.setProperty("--cf-card-x", `${event.clientX - rect.left}px`);
            target.style.setProperty("--cf-card-y", `${event.clientY - rect.top}px`);
          },
          onPointerLeave: (event: PointerEvent<HTMLElement>) => {
            event.currentTarget.style.removeProperty("--cf-card-x");
            event.currentTarget.style.removeProperty("--cf-card-y");
          },
        }
      : {};

  return (
    <div
      className="cf-marketing-sections"
      data-marketing-motion={motion.enabled ? "enabled" : "static"}
    >
      <section
        ref={(node) => {
          sectionRefs.current.workflow = node;
        }}
        className="cf-marketing-section cf-marketing-workflow-section"
        data-marketing-section="workflow"
        data-visible={visibleSections.has("workflow") ? "true" : "false"}
      >
        <div>
          <p className="cf-marketing-eyebrow">Precision Intelligence</p>
          <h2>Every handoff remains inspectable.</h2>
          <p>
            Manual cases, generated automation, execution results and healed locator evidence are
            presented as one connected QA workflow.
          </p>
        </div>
        <div className="cf-marketing-connector-map" aria-hidden="true">
          {["Requirement", "Review", "Automate", "Run", "Heal", "Report"].map((item, index) => (
            <span key={item} style={{ "--cf-step-index": index } as CSSProperties}>
              {item}
            </span>
          ))}
        </div>
      </section>

      <section
        ref={(node) => {
          sectionRefs.current.features = node;
        }}
        className="cf-marketing-section"
        data-marketing-section="features"
        data-visible={visibleSections.has("features") ? "true" : "false"}
      >
        <div className="cf-marketing-section-heading">
          <p className="cf-marketing-eyebrow">Product Surface</p>
          <h2>Calm motion for serious QA work.</h2>
        </div>
        <div className="cf-marketing-feature-grid">
          {features.map((feature, index) => (
            <article
              className="cf-marketing-feature-card"
              data-feature-index={index}
              key={feature.title}
              {...cardPointerProps}
            >
              <p>{feature.eyebrow}</p>
              <h3>{feature.title}</h3>
              <span />
              <small>{feature.body}</small>
            </article>
          ))}
        </div>
      </section>

      <section
        ref={(node) => {
          sectionRefs.current.metrics = node;
        }}
        className="cf-marketing-section cf-marketing-metrics-section"
        data-marketing-section="metrics"
        data-visible={visibleSections.has("metrics") ? "true" : "false"}
      >
        <div className="cf-marketing-section-heading">
          <p className="cf-marketing-eyebrow">Controlled Output</p>
          <h2>Designed to move from idea to evidence.</h2>
        </div>
        <div className="cf-marketing-metric-grid">
          {metrics.map((metric, index) => (
            <article className="cf-marketing-metric-card" key={metric.label}>
              <strong
                ref={(node) => {
                  metricRefs.current[index] = node;
                }}
              >
                {motion.enabled ? "0" : metric.value}
              </strong>
              <span>{metric.label}</span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
