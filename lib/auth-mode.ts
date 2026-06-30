export function isClerkAuthActive() {
  const hasPublishableKey = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  const hasSecretKey = Boolean(process.env.CLERK_SECRET_KEY);

  return hasPublishableKey && hasSecretKey;
}
