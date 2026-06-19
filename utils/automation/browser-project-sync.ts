import type { Project } from "../workspace";

const BROWSER_PROJECTS_KEY = "tc_projects_v1";

type ProjectLike = Partial<Project> & {
  id?: unknown;
  key?: unknown;
  projectKey?: unknown;
};

function normalizeRef(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function projectMatchesRef(project: ProjectLike, normalizedRef: string) {
  return (
    normalizeRef(project.id) === normalizedRef ||
    normalizeRef(project.key) === normalizedRef ||
    normalizeRef(project.projectKey) === normalizedRef
  );
}

function hydrateBrowserProject(project: ProjectLike): Project {
  return {
    ...project,
    projectKey: typeof project.projectKey === "string" ? project.projectKey : "",
    sprintName: typeof project.sprintName === "string" ? project.sprintName : "",
    releaseName: typeof project.releaseName === "string" ? project.releaseName : "",
    teamName: typeof project.teamName === "string" ? project.teamName : "",
    oldRequirement: typeof project.oldRequirement === "string" ? project.oldRequirement : "",
    latestChangeEntries: Array.isArray(project.latestChangeEntries)
      ? project.latestChangeEntries
      : [],
    persona: project.persona ?? "all",
    sourceArtifacts: Array.isArray(project.sourceArtifacts) ? project.sourceArtifacts : [],
    reviewerName: typeof project.reviewerName === "string" ? project.reviewerName : "",
    reviewerNotes: typeof project.reviewerNotes === "string" ? project.reviewerNotes : "",
    signoffStatus: project.signoffStatus ?? "draft",
    auditTrail: Array.isArray(project.auditTrail) ? project.auditTrail : [],
    caseComments:
      project.caseComments && typeof project.caseComments === "object"
        ? project.caseComments
        : {},
    notifications: Array.isArray(project.notifications) ? project.notifications : [],
    caseVersionHistory:
      project.caseVersionHistory && typeof project.caseVersionHistory === "object"
        ? project.caseVersionHistory
        : {},
    caseReviewHistory:
      project.caseReviewHistory && typeof project.caseReviewHistory === "object"
        ? project.caseReviewHistory
        : {},
    testDataSets: Array.isArray(project.testDataSets) ? project.testDataSets : [],
    caseTemplates: Array.isArray(project.caseTemplates) ? project.caseTemplates : [],
    automationScripts: Array.isArray(project.automationScripts)
      ? project.automationScripts
      : [],
    automationSteps:
      project.automationSteps && typeof project.automationSteps === "object"
        ? project.automationSteps
        : {},
    automationBindings: Array.isArray(project.automationBindings)
      ? project.automationBindings
      : [],
    automationExecutions: Array.isArray(project.automationExecutions)
      ? project.automationExecutions
      : [],
    automationArtifacts: Array.isArray(project.automationArtifacts)
      ? project.automationArtifacts
      : [],
    automationReusableBlocks: Array.isArray(project.automationReusableBlocks)
      ? project.automationReusableBlocks
      : [],
    automationSelectorPresets: Array.isArray(project.automationSelectorPresets)
      ? project.automationSelectorPresets
      : [],
    automationEnvironmentBindings: Array.isArray(project.automationEnvironmentBindings)
      ? project.automationEnvironmentBindings
      : [],
    activeAutomationEnvironmentId:
      typeof project.activeAutomationEnvironmentId === "string"
        ? project.activeAutomationEnvironmentId
        : "",
    generationFeedbackLog: Array.isArray(project.generationFeedbackLog)
      ? project.generationFeedbackLog
      : [],
    viewPreferences:
      project.viewPreferences && typeof project.viewPreferences === "object"
        ? project.viewPreferences
        : {},
    savedViews:
      project.savedViews && typeof project.savedViews === "object"
        ? project.savedViews
        : { cases: [], runs: [] },
    lastGeneratedChangeImpactSignature:
      typeof project.lastGeneratedChangeImpactSignature === "string"
        ? project.lastGeneratedChangeImpactSignature
        : null,
  } as Project;
}

function readBrowserProjects() {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(BROWSER_PROJECTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    const projects =
      Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object"
          ? (parsed as { projects?: unknown }).projects
          : [];
    return Array.isArray(projects)
      ? projects.filter(
          (project): project is ProjectLike =>
            Boolean(project && typeof project === "object" && !Array.isArray(project)),
        )
      : [];
  } catch {
    return [];
  }
}

async function readProjectsResponse(response: Response) {
  const text = await response.text();
  try {
    return text ? (JSON.parse(text) as { projects?: Project[]; error?: string }) : {};
  } catch {
    return { error: "Project sync returned an invalid response." };
  }
}

export async function ensureBrowserProjectSynced(projectRef: string) {
  if (typeof window === "undefined") return false;
  const normalizedRef = normalizeRef(projectRef);
  if (!normalizedRef) return false;

  const browserProject = readBrowserProjects().find((project) =>
    projectMatchesRef(project, normalizedRef),
  );
  if (!browserProject) return false;

  const hydratedProject = hydrateBrowserProject(browserProject);
  const response = await fetch("/api/projects", { cache: "no-store" });
  const payload = await readProjectsResponse(response);
  if (!response.ok) {
    throw new Error(payload.error || "Could not load projects before automation sync.");
  }

  const serverProjects = Array.isArray(payload.projects) ? payload.projects : [];
  const serverHasProject = serverProjects.some((project) =>
    projectMatchesRef(project, normalizedRef),
  );
  if (serverHasProject) return true;

  const nextProjects = [
    hydratedProject,
    ...serverProjects.filter((project) => project.id !== hydratedProject.id),
  ];
  const saveResponse = await fetch("/api/projects", {
    body: JSON.stringify({ projects: nextProjects }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const savePayload = await readProjectsResponse(saveResponse);
  if (!saveResponse.ok) {
    throw new Error(savePayload.error || "Could not save project before automation sync.");
  }

  if (Array.isArray(savePayload.projects)) {
    window.localStorage.setItem(BROWSER_PROJECTS_KEY, JSON.stringify(savePayload.projects));
  }

  return true;
}
