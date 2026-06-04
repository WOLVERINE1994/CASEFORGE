"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Project } from "../utils/workspace";

type DeleteProjectButtonProps = {
  projectId: string;
  projectName: string;
};

export default function DeleteProjectButton({
  projectId,
  projectName,
}: DeleteProjectButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteProject = async () => {
    const confirmed = window.confirm(
      `Delete "${projectName}" from the saved project library?`
    );

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);

    try {
      const projectsResponse = await fetch("/api/projects", {
        cache: "no-store",
      });
      const projectsData = (await projectsResponse
        .json()
        .catch(() => ({}))) as { projects?: Project[]; error?: string };

      if (!projectsResponse.ok || !Array.isArray(projectsData.projects)) {
        throw new Error(projectsData.error || "Failed to load projects.");
      }

      const updatedProjects = projectsData.projects.filter(
        (project) => project.id !== projectId
      );

      if (updatedProjects.length === projectsData.projects.length) {
        throw new Error("Project was not found in the saved library.");
      }

      const saveResponse = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projects: updatedProjects }),
      });
      const saveData = (await saveResponse
        .json()
        .catch(() => ({}))) as { error?: string };

      if (!saveResponse.ok) {
        throw new Error(saveData.error || "Failed to delete project.");
      }

      router.refresh();
    } catch (error) {
      console.error("Delete project from card error:", error);
      window.alert(
        error instanceof Error && error.message.trim()
          ? error.message
          : "Failed to delete project."
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void deleteProject()}
      disabled={isDeleting}
      aria-label={`Delete project ${projectName}`}
      className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
    >
      {isDeleting ? "Deleting..." : "Delete"}
    </button>
  );
}
