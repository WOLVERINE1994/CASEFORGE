import dynamic from "next/dynamic";
import Link from "next/link";
import HomeAuthActions from "../components/HomeAuthActions";

const MarketingHeroPreview = dynamic(
  () => import("../components/MarketingHeroPreview"),
  {
    loading: () => <MarketingHeroPreviewFallback />,
  },
);

const MarketingFeatureSections = dynamic(
  () => import("../components/MarketingFeatureSections"),
  {
    loading: () => null,
  },
);

const SignatureDemosSection = dynamic(
  () => import("../components/signature-demos/SignatureDemosSection"),
  {
    loading: () => null,
  },
);

function MarketingHeroPreviewFallback() {
  return (
    <div className="cf-marketing-hero-preview cf-marketing-preview-fallback" data-marketing-motion="static">
      <div className="cf-marketing-workflow-strip" aria-label="CaseForge workflow">
        {["Requirement", "Test Cases", "Automation", "Browser", "Healing", "Report"].map((step) => (
          <div className="cf-marketing-workflow-step" key={step}>
            <span>{step}</span>
          </div>
        ))}
      </div>
      <div className="cf-marketing-preview-stage">
        <section className="cf-marketing-requirement-panel" aria-label="Requirement input">
          <p>Requirement Studio</p>
          <div className="cf-marketing-requirement-text">
            Admin users approve access before the workspace opens.
          </div>
        </section>
        <section className="cf-marketing-report-panel" aria-label="Final report summary">
          <p>Execution Report</p>
          <strong>Coverage ready</strong>
          <span>Reviewable cases, commands and evidence are connected.</span>
        </section>
      </div>
    </div>
  );
}

export default function HomePage() {
  const hasClerkClientConfig = Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  );

  return (
    <main className="cf-marketing-page min-h-[calc(100vh-4.5rem)] overflow-hidden bg-[#07111f] text-slate-50">
      <section className="cf-marketing-hero">
        <div className="cf-marketing-grid" aria-hidden="true" />
        <div className="cf-marketing-spotlight" aria-hidden="true" />
        <div className="cf-marketing-hero-inner">
          <div className="cf-marketing-copy">
            <p className="cf-marketing-badge">
              CaseForge Precision Intelligence
            </p>
            <h1>
              Turn each requirement into cases, automation, execution and proof.
            </h1>
            <p>
              CaseForge helps QA teams review manual cases first, convert approved coverage into
              editable automation, run it in a browser, heal fragile locators and produce a report
              that still points back to the original requirement.
            </p>
            {hasClerkClientConfig ? (
              <HomeAuthActions />
            ) : (
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/sign-up"
                  className="rounded-xl bg-[linear-gradient(135deg,_#06b6d4_0%,_#2563eb_52%,_#7c3aed_100%)] px-5 py-3 text-sm font-extrabold text-white shadow-[0_18px_45px_-25px_rgba(37,99,235,0.9)] transition hover:-translate-y-0.5 hover:brightness-110"
                >
                  Create Account
                </Link>
                <Link
                  href="/sign-in"
                  className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-cyan-200/30 hover:bg-cyan-200/10"
                >
                  Sign In
                </Link>
              </div>
            )}
            <div className="cf-marketing-proof-row" aria-label="CaseForge workflow summary">
              {["Manual review first", "Editable commands", "Browser evidence"].map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>

          <MarketingHeroPreview />
        </div>
      </section>

      <MarketingFeatureSections />
      <SignatureDemosSection />
    </main>
  );
}
