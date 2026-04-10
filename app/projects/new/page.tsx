import { Suspense } from "react";
import AppSidebar from "../../../components/AppSidebar";
import ProjectWorkspace from "../../../components/ProjectWorkspace";
import ResponsiveShell from "../../../components/ResponsiveShell";

export default function NewProjectWorkspacePage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f6faf8_0%,_#eef4f1_100%)] px-6 py-8 text-zinc-950 dark:bg-[linear-gradient(180deg,_#09090b_0%,_#111827_100%)] dark:text-zinc-50">
      <ResponsiveShell
        mobileTitle="New Workspace"
        mobileSubtitle="Paste one requirement and get a draft fast"
        desktopSidebar={<AppSidebar />}
        mobileSidebar={<AppSidebar />}
        storageKey="caseforge:drawer:new-workspace"
      >
        <Suspense
          fallback={
            <div className="rounded-[24px] border border-dashed border-zinc-300 bg-white/80 px-6 py-10 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-300">
              Loading the requirement workspace...
            </div>
          }
        >
          <ProjectWorkspace />
        </Suspense>
      </ResponsiveShell>
    </main>
  );
}
