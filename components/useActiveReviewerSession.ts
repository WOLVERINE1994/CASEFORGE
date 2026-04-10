"use client";

import { useCallback, useEffect, useState } from "react";

export type ActiveReviewerSession = {
  id?: string;
  name?: string;
  email?: string;
};

export function useActiveReviewerSession() {
  const [reviewer, setReviewer] = useState<ActiveReviewerSession | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshReviewer = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch("/api/session/reviewer", { cache: "no-store" });
      const payload = (await response.json()) as {
        reviewer?: ActiveReviewerSession | null;
      };

      setReviewer(payload.reviewer ?? null);
    } catch {
      setReviewer(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshReviewer();
  }, [refreshReviewer]);

  return {
    reviewer,
    setReviewer,
    loading,
    refreshReviewer,
  };
}
