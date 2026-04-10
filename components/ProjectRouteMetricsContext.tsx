"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ProjectRouteMetricsContextValue = {
  caseCount: number;
  issueCount: number;
  setCaseCount: (count: number) => void;
  setIssueCount: (count: number) => void;
};

const ProjectRouteMetricsContext =
  createContext<ProjectRouteMetricsContextValue | null>(null);

type ProjectRouteMetricsProviderProps = {
  initialCaseCount: number;
  initialIssueCount: number;
  children: ReactNode;
};

export function ProjectRouteMetricsProvider({
  initialCaseCount,
  initialIssueCount,
  children,
}: ProjectRouteMetricsProviderProps) {
  const [caseCount, setCaseCount] = useState(initialCaseCount);
  const [issueCount, setIssueCount] = useState(initialIssueCount);

  const value = useMemo(
    () => ({
      caseCount,
      issueCount,
      setCaseCount,
      setIssueCount,
    }),
    [caseCount, issueCount]
  );

  return (
    <ProjectRouteMetricsContext.Provider value={value}>
      {children}
    </ProjectRouteMetricsContext.Provider>
  );
}

export const useProjectRouteMetrics = () => useContext(ProjectRouteMetricsContext);
