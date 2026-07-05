export const ACCESS_PENDING_PATH = "/access-pending";

type AccessControlDecision = {
  allowed: boolean;
  configured: boolean;
  reason:
    | "allowlist_not_configured"
    | "email_allowed"
    | "domain_allowed"
    | "missing_email"
    | "email_not_allowed";
};

function parseAccessList(value: string | undefined) {
  return (value || "")
    .split(/[\s,;]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function getCaseForgeAccessConfig() {
  const emails = new Set(parseAccessList(process.env.CASEFORGE_ALLOWED_EMAILS));
  const owners = getCaseForgeOwnerEmails();
  const domains = new Set(
    parseAccessList(process.env.CASEFORGE_ALLOWED_DOMAINS).map((entry) =>
      entry.replace(/^@/, ""),
    ),
  );

  return {
    configured: emails.size > 0 || domains.size > 0 || owners.size > 0,
    emails,
    owners,
    domains,
  };
}

export function getCaseForgeOwnerEmails() {
  const configuredOwners = parseAccessList(
    process.env.CASEFORGE_OWNER_EMAILS ||
      process.env.CASEFORGE_ACCESS_REQUEST_EMAIL_TO,
  );
  const owners = configuredOwners.length
    ? configuredOwners
    : ["shivora.ai.tech@gmail.com"];

  return new Set(owners);
}

export function getAccessRequestNotificationEmails() {
  const configuredRecipients = parseAccessList(
    process.env.CASEFORGE_ACCESS_REQUEST_EMAIL_TO ||
      process.env.CASEFORGE_OWNER_EMAILS,
  );
  return configuredRecipients.length
    ? configuredRecipients
    : ["shivora.ai.tech@gmail.com"];
}

export function normalizeAccessEmail(email: string | null | undefined) {
  const normalized = (email || "").trim().toLowerCase();
  return normalized.includes("@") ? normalized : null;
}

export function evaluateCaseForgeAccess(
  email: string | null | undefined,
): AccessControlDecision {
  const config = getCaseForgeAccessConfig();
  if (!config.configured) {
    const shouldFailClosed =
      process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

    return {
      allowed: !shouldFailClosed,
      configured: false,
      reason: "allowlist_not_configured",
    };
  }

  const normalizedEmail = normalizeAccessEmail(email);
  if (!normalizedEmail) {
    return { allowed: false, configured: true, reason: "missing_email" };
  }

  if (config.emails.has(normalizedEmail) || config.owners.has(normalizedEmail)) {
    return { allowed: true, configured: true, reason: "email_allowed" };
  }

  const domain = normalizedEmail.split("@").pop();
  if (domain && config.domains.has(domain)) {
    return { allowed: true, configured: true, reason: "domain_allowed" };
  }

  return { allowed: false, configured: true, reason: "email_not_allowed" };
}

export function extractEmailFromSessionClaims(claims: unknown) {
  if (!claims || typeof claims !== "object") return null;

  const record = claims as Record<string, unknown>;
  const directCandidates = [
    record.email,
    record.email_address,
    record.emailAddress,
    record.primary_email_address,
    record.primaryEmailAddress,
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === "string") {
      const email = normalizeAccessEmail(candidate);
      if (email) return email;
    }
  }

  const emailAddresses = record.email_addresses || record.emailAddresses;
  if (Array.isArray(emailAddresses)) {
    for (const entry of emailAddresses) {
      if (typeof entry === "string") {
        const email = normalizeAccessEmail(entry);
        if (email) return email;
      }
      if (entry && typeof entry === "object") {
        const emailRecord = entry as Record<string, unknown>;
        const email = normalizeAccessEmail(
          typeof emailRecord.email_address === "string"
            ? emailRecord.email_address
            : typeof emailRecord.emailAddress === "string"
              ? emailRecord.emailAddress
              : null,
        );
        if (email) return email;
      }
    }
  }

  return null;
}
