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
        <ProjectWorkspace />
      </ResponsiveShell>
    </main>
  );
}
