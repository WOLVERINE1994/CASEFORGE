 "use client";

import dynamic from "next/dynamic";
import type { ProjectAutomationClientProps } from "./ProjectAutomationClient";

const ProjectAutomationClient = dynamic(() => import("./ProjectAutomationClient"), {
  ssr: false,
  loading: () => (
    <section className="cf-panel rounded-[28px] px-5 py-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
        Automation Workspace
      </p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-50">
        Loading caseForge automation...
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
        Preparing suites, scenarios, playback, reports, and editor panels.
      </p>
    </section>
  ),
});

export default function ProjectAutomationWorkspace(
  props: ProjectAutomationClientProps
) {
  return <ProjectAutomationClient {...props} />;
}
