export function isClerkAuthActive() {
  const hasPublishableKey = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  const requireAuth = process.env.CASEFORGE_REQUIRE_AUTH === "true";
  const allowPublicWorkspace =
    !requireAuth ||
    process.env.CASEFORGE_PUBLIC_WORKSPACE === "true" ||
    process.env.NODE_ENV === "development" ||
    (process.env.VERCEL === "1" &&
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_"));

  return requireAuth && hasPublishableKey && !allowPublicWorkspace;
}
