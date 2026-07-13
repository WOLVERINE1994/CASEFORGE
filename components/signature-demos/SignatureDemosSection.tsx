"use client";

import SignatureDemoLazySlot from "./SignatureDemoLazySlot";
import SignatureDemoStaticPreview from "./SignatureDemoStaticPreview";

const requirementLoader = () => import("./RequirementToCasesDemo");
const caseToAutomationLoader = () => import("./CaseToAutomationDemo");
const browserExecutionLoader = () => import("./BrowserExecutionDemo");
const selfHealingLoader = () => import("./SelfHealingDemo");
const runReportLoader = () => import("./RunReportDemo");

export default function SignatureDemosSection() {
  return (
    <section className="cf-signature-demo-section" aria-label="CaseForge signature demos">
      <div className="cf-marketing-section-heading">
        <p className="cf-marketing-eyebrow">Signature Product Demos</p>
        <h2>Visual simulations, isolated from production automation.</h2>
        <p>
          These demos show how CaseForge thinks through QA work without touching real
          projects, browser sessions, APIs or automation execution.
        </p>
      </div>
      <div className="cf-signature-demo-stack">
        <SignatureDemoLazySlot
          loader={requirementLoader}
          fallback={
            <SignatureDemoStaticPreview
              eyebrow="Signature Demo 01"
              title="Requirement to test cases"
              summary="Recognised login requirement signals become reviewable cases, coverage scores and quality indicators."
            />
          }
        />
        <SignatureDemoLazySlot
          loader={caseToAutomationLoader}
          fallback={
            <SignatureDemoStaticPreview
              eyebrow="Signature Demo 02"
              title="Manual case to automation draft"
              summary="A reviewed manual case becomes a draft command timeline with locator hints, captured variables and validation checks."
            />
          }
        />
        <SignatureDemoLazySlot
          loader={browserExecutionLoader}
          fallback={
            <SignatureDemoStaticPreview
              eyebrow="Signature Demo 03"
              title="Execute the draft in a browser"
              summary="The automation draft runs through a simulated browser with progress, captured variables, assertions and evidence."
            />
          }
        />
        <SignatureDemoLazySlot
          loader={selfHealingLoader}
          fallback={
            <SignatureDemoStaticPreview
              eyebrow="Signature Demo 04"
              title="Heal a broken locator"
              summary="A failed locator becomes a reviewed repair suggestion with candidate scores, audit trail and resumed run state."
            />
          }
        />
        <SignatureDemoLazySlot
          loader={runReportLoader}
          fallback={
            <SignatureDemoStaticPreview
              eyebrow="Signature Demo 05"
              title="Generate the release report"
              summary="Completed run data becomes a shareable QA report with coverage, evidence, review notes and export status."
            />
          }
        />
      </div>
    </section>
  );
}
