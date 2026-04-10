"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Project } from "../utils/workspace";

type ProjectDataStateContextValue = {
  project: Project | null;
  setProject: (project: Project | null) => void;
};

const ProjectDataStateContext =
  createContext<ProjectDataStateContextValue | null>(null);

type ProjectDataStateProviderProps = {
  initialProject: Project | null;
  children: ReactNode;
};

export function ProjectDataStateProvider({
  initialProject,
  children,
}: ProjectDataStateProviderProps) {
  const [project, setProject] = useState<Project | null>(initialProject);

  const value = useMemo(
    () => ({
      project,
      setProject,
    }),
    [project]
  );

  return (
    <ProjectDataStateContext.Provider value={value}>
      {children}
    </ProjectDataStateContext.Provider>
  );
}

export const useProjectDataState = () => useContext(ProjectDataStateContext);
