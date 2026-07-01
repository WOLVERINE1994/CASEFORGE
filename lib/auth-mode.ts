type ClerkAuthStatus = {
  active: boolean;
  hasPublishableKey: boolean;
  hasSecretKey: boolean;
  usesTestPublishableKey: boolean;
  usesTestSecretKey: boolean;
  reason: "active" | "missingKeys";
};

export function getClerkAuthStatus(): ClerkAuthStatus {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "";
  const secretKey = process.env.CLERK_SECRET_KEY || "";
  const hasPublishableKey = Boolean(publishableKey);
  const hasSecretKey = Boolean(secretKey);
  const usesTestPublishableKey = publishableKey.startsWith("pk_test_");
  const usesTestSecretKey = secretKey.startsWith("sk_test_");

  if (!hasPublishableKey || !hasSecretKey) {
    return {
      active: false,
      hasPublishableKey,
      hasSecretKey,
      usesTestPublishableKey,
      usesTestSecretKey,
      reason: "missingKeys",
    };
  }

  return {
    active: true,
    hasPublishableKey,
    hasSecretKey,
    usesTestPublishableKey,
    usesTestSecretKey,
    reason: "active",
  };
}

export function isClerkAuthActive() {
  return getClerkAuthStatus().active;
}
