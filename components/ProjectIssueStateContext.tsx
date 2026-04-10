"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type SharedIssueRecord = {
  id: string;
  projectId: string;
  projectKey: string;
  issueKey: string;
  issueNumber: number;
  type: "epic" | "story" | "task" | "bug" | "test-case" | "test-plan" | "test-run";
  summary: string;
  description: string;
  status: "backlog" | "todo" | "in-progress" | "blocked" | "in-review" | "done";
  priority: "highest" | "high" | "medium" | "low";
  reporterId: string | null;
  assigneeId: string | null;
  sprintId: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
};

type ProjectIssueStateContextValue = {
  issues: SharedIssueRecord[];
  setIssues: (issues: SharedIssueRecord[]) => void;
};

const ProjectIssueStateContext =
  createContext<ProjectIssueStateContextValue | null>(null);

type ProjectIssueStateProviderProps = {
  initialIssues: SharedIssueRecord[];
  children: ReactNode;
};

export function ProjectIssueStateProvider({
  initialIssues,
  children,
}: ProjectIssueStateProviderProps) {
  const [issues, setIssues] = useState(initialIssues);

  const value = useMemo(
    () => ({
      issues,
      setIssues,
    }),
    [issues]
  );

  return (
    <ProjectIssueStateContext.Provider value={value}>
      {children}
    </ProjectIssueStateContext.Provider>
  );
}

export const useProjectIssueState = () => useContext(ProjectIssueStateContext);
