import type {
  AutomationLocatorCandidate,
  AutomationLocatorStrategy,
} from "./types";

const preferredOrder: AutomationLocatorStrategy[] = [
  "role",
  "label",
  "text",
  "alt",
  "title",
  "testid",
  "placeholder",
  "css",
  "xpath",
];

const strategyAliases: Record<string, AutomationLocatorStrategy> = {
  "aria-label": "label",
  "data-*": "testid",
  "data-cy": "testid",
  "data-qa": "testid",
  "data-testid": "testid",
  id: "css",
  label: "label",
  placeholder: "placeholder",
  role: "role",
  text: "text",
  title: "title",
  css: "css",
  xpath: "xpath",
};

function normalizeStrategy(value: string): AutomationLocatorStrategy {
  return strategyAliases[value] ?? "css";
}

export function normalizeLocatorScore(value: unknown) {
  const score = Number(value ?? 0);
  if (!Number.isFinite(score)) return 0;
  const scaledScore = score > 0 && score <= 1 ? score * 100 : score;
  return Math.max(0, Math.min(100, Math.round(scaledScore)));
}

export function normalizeLocatorCandidates(
  candidates: Array<
    Partial<AutomationLocatorCandidate> & { type?: string; unique?: boolean }
  > = [],
) {
  const normalized = candidates
    .flatMap((candidate): AutomationLocatorCandidate[] => {
      const value = String(candidate.value ?? "").trim();
      if (!value) return [];

      const strategy = normalizeStrategy(
        String(candidate.strategy ?? candidate.type ?? "css"),
      );

      return [
        {
          isUnique: Boolean(candidate.isUnique ?? candidate.unique),
          metadata: candidate.metadata ?? {},
          score: normalizeLocatorScore(candidate.score),
          source: candidate.source ?? "recorded",
          strategy,
          value,
        },
      ];
    })
    .sort((left, right) => {
      const leftPreferred = preferredOrder.indexOf(left.strategy);
      const rightPreferred = preferredOrder.indexOf(right.strategy);
      return (
        leftPreferred - rightPreferred ||
        Number(right.isUnique) - Number(left.isUnique) ||
        right.score - left.score
      );
    });

  return normalized.map((candidate, index) => ({
    ...candidate,
    rank: index + 1,
  }));
}
