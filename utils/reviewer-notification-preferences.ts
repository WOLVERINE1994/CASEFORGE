export type ReviewerNotificationPreferences = {
  mentionAlerts: boolean;
  watchAlerts: boolean;
  templateAlerts: boolean;
  templateAlertMinimumSeverity: "low" | "medium" | "high";
  templateImportAlertMinimumSeverity: "low" | "medium" | "high";
  templateExportAlertMinimumSeverity: "low" | "medium" | "high";
  templateLocalAlertMinimumSeverity: "low" | "medium" | "high";
  templateExternalAlertMinimumSeverity: "low" | "medium" | "high";
  templateAlertAllowedSources: string[];
  templateAlertBlockedSources: string[];
  templateAlertHighPrioritySources: string[];
  templateImportHighPrioritySources: string[];
  templateExportHighPrioritySources: string[];
  unreadOnlyDefault: boolean;
};

export const defaultReviewerNotificationPreferences: ReviewerNotificationPreferences = {
  mentionAlerts: true,
  watchAlerts: true,
  templateAlerts: true,
  templateAlertMinimumSeverity: "low",
  templateImportAlertMinimumSeverity: "low",
  templateExportAlertMinimumSeverity: "low",
  templateLocalAlertMinimumSeverity: "low",
  templateExternalAlertMinimumSeverity: "low",
  templateAlertAllowedSources: [],
  templateAlertBlockedSources: [],
  templateAlertHighPrioritySources: [],
  templateImportHighPrioritySources: [],
  templateExportHighPrioritySources: [],
  unreadOnlyDefault: true,
};

const resolveTemplateSeverityPreference = (
  parsedValue: unknown,
  fallbackValue: ReviewerNotificationPreferences["templateAlertMinimumSeverity"]
) =>
  parsedValue === "low" || parsedValue === "medium" || parsedValue === "high"
    ? parsedValue
    : fallbackValue;

const normalizeSourceList = (value: unknown) =>
  Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
            .filter(Boolean)
        )
      )
    : [];

const buildStorageKey = (projectId: string, reviewerId: string) =>
  `caseforge:reviewer-notification-preferences:${projectId}:${reviewerId}`;

const buildGlobalStorageKey = (reviewerId: string) =>
  `caseforge:reviewer-notification-preferences:global:${reviewerId}`;

export const loadGlobalReviewerNotificationPreferences = (
  reviewerId: string
): ReviewerNotificationPreferences => {
  if (typeof window === "undefined") {
    return defaultReviewerNotificationPreferences;
  }

  try {
    const rawValue = window.localStorage.getItem(buildGlobalStorageKey(reviewerId));
    if (!rawValue) {
      return defaultReviewerNotificationPreferences;
    }

    const parsed = JSON.parse(rawValue) as Partial<ReviewerNotificationPreferences>;

    return {
      mentionAlerts:
        typeof parsed.mentionAlerts === "boolean"
          ? parsed.mentionAlerts
          : defaultReviewerNotificationPreferences.mentionAlerts,
      watchAlerts:
        typeof parsed.watchAlerts === "boolean"
          ? parsed.watchAlerts
          : defaultReviewerNotificationPreferences.watchAlerts,
      templateAlerts:
        typeof parsed.templateAlerts === "boolean"
          ? parsed.templateAlerts
          : defaultReviewerNotificationPreferences.templateAlerts,
      templateAlertMinimumSeverity:
        resolveTemplateSeverityPreference(
          parsed.templateAlertMinimumSeverity,
          defaultReviewerNotificationPreferences.templateAlertMinimumSeverity
        ),
      templateImportAlertMinimumSeverity: resolveTemplateSeverityPreference(
        parsed.templateImportAlertMinimumSeverity,
        resolveTemplateSeverityPreference(
          parsed.templateAlertMinimumSeverity,
          defaultReviewerNotificationPreferences.templateImportAlertMinimumSeverity
        )
      ),
      templateExportAlertMinimumSeverity: resolveTemplateSeverityPreference(
        parsed.templateExportAlertMinimumSeverity,
        resolveTemplateSeverityPreference(
          parsed.templateAlertMinimumSeverity,
          defaultReviewerNotificationPreferences.templateExportAlertMinimumSeverity
        )
      ),
      templateLocalAlertMinimumSeverity: resolveTemplateSeverityPreference(
        parsed.templateLocalAlertMinimumSeverity,
        resolveTemplateSeverityPreference(
          parsed.templateAlertMinimumSeverity,
          defaultReviewerNotificationPreferences.templateLocalAlertMinimumSeverity
        )
      ),
      templateExternalAlertMinimumSeverity: resolveTemplateSeverityPreference(
        parsed.templateExternalAlertMinimumSeverity,
        resolveTemplateSeverityPreference(
          parsed.templateAlertMinimumSeverity,
          defaultReviewerNotificationPreferences.templateExternalAlertMinimumSeverity
        )
      ),
      templateAlertAllowedSources: normalizeSourceList(parsed.templateAlertAllowedSources),
      templateAlertBlockedSources: normalizeSourceList(parsed.templateAlertBlockedSources),
      templateAlertHighPrioritySources: normalizeSourceList(
        parsed.templateAlertHighPrioritySources
      ),
      templateImportHighPrioritySources: normalizeSourceList(
        parsed.templateImportHighPrioritySources
      ),
      templateExportHighPrioritySources: normalizeSourceList(
        parsed.templateExportHighPrioritySources
      ),
      unreadOnlyDefault:
        typeof parsed.unreadOnlyDefault === "boolean"
          ? parsed.unreadOnlyDefault
          : defaultReviewerNotificationPreferences.unreadOnlyDefault,
    };
  } catch {
    return defaultReviewerNotificationPreferences;
  }
};

export const loadReviewerNotificationPreferences = (
  projectId: string,
  reviewerId: string
): ReviewerNotificationPreferences => {
  if (typeof window === "undefined") {
    return defaultReviewerNotificationPreferences;
  }

  try {
    const rawValue = window.localStorage.getItem(buildStorageKey(projectId, reviewerId));
    if (!rawValue) {
      return loadGlobalReviewerNotificationPreferences(reviewerId);
    }

    const parsed = JSON.parse(rawValue) as Partial<ReviewerNotificationPreferences>;

    return {
      mentionAlerts:
        typeof parsed.mentionAlerts === "boolean"
          ? parsed.mentionAlerts
          : defaultReviewerNotificationPreferences.mentionAlerts,
      watchAlerts:
        typeof parsed.watchAlerts === "boolean"
          ? parsed.watchAlerts
          : defaultReviewerNotificationPreferences.watchAlerts,
      templateAlerts:
        typeof parsed.templateAlerts === "boolean"
          ? parsed.templateAlerts
          : defaultReviewerNotificationPreferences.templateAlerts,
      templateAlertMinimumSeverity:
        resolveTemplateSeverityPreference(
          parsed.templateAlertMinimumSeverity,
          defaultReviewerNotificationPreferences.templateAlertMinimumSeverity
        ),
      templateImportAlertMinimumSeverity: resolveTemplateSeverityPreference(
        parsed.templateImportAlertMinimumSeverity,
        resolveTemplateSeverityPreference(
          parsed.templateAlertMinimumSeverity,
          defaultReviewerNotificationPreferences.templateImportAlertMinimumSeverity
        )
      ),
      templateExportAlertMinimumSeverity: resolveTemplateSeverityPreference(
        parsed.templateExportAlertMinimumSeverity,
        resolveTemplateSeverityPreference(
          parsed.templateAlertMinimumSeverity,
          defaultReviewerNotificationPreferences.templateExportAlertMinimumSeverity
        )
      ),
      templateLocalAlertMinimumSeverity: resolveTemplateSeverityPreference(
        parsed.templateLocalAlertMinimumSeverity,
        resolveTemplateSeverityPreference(
          parsed.templateAlertMinimumSeverity,
          defaultReviewerNotificationPreferences.templateLocalAlertMinimumSeverity
        )
      ),
      templateExternalAlertMinimumSeverity: resolveTemplateSeverityPreference(
        parsed.templateExternalAlertMinimumSeverity,
        resolveTemplateSeverityPreference(
          parsed.templateAlertMinimumSeverity,
          defaultReviewerNotificationPreferences.templateExternalAlertMinimumSeverity
        )
      ),
      templateAlertAllowedSources: normalizeSourceList(parsed.templateAlertAllowedSources),
      templateAlertBlockedSources: normalizeSourceList(parsed.templateAlertBlockedSources),
      templateAlertHighPrioritySources: normalizeSourceList(
        parsed.templateAlertHighPrioritySources
      ),
      templateImportHighPrioritySources: normalizeSourceList(
        parsed.templateImportHighPrioritySources
      ),
      templateExportHighPrioritySources: normalizeSourceList(
        parsed.templateExportHighPrioritySources
      ),
      unreadOnlyDefault:
        typeof parsed.unreadOnlyDefault === "boolean"
          ? parsed.unreadOnlyDefault
          : defaultReviewerNotificationPreferences.unreadOnlyDefault,
    };
  } catch {
    return loadGlobalReviewerNotificationPreferences(reviewerId);
  }
};

export const saveGlobalReviewerNotificationPreferences = (
  reviewerId: string,
  preferences: ReviewerNotificationPreferences
) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      buildGlobalStorageKey(reviewerId),
      JSON.stringify(preferences)
    );
  } catch {
    // Ignore localStorage failures and keep the app usable.
  }
};

export const saveReviewerNotificationPreferences = (
  projectId: string,
  reviewerId: string,
  preferences: ReviewerNotificationPreferences
) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      buildStorageKey(projectId, reviewerId),
      JSON.stringify(preferences)
    );
  } catch {
    // Ignore localStorage failures and keep the app usable.
  }
};
