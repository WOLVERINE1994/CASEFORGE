type ParsedRow = {
  id: string;
  type: string;
  title: string;
  preconditions: string;
  steps: string;
  expectedResult: string;
  testData?: string;
};

const sanitizeInlineText = (value: string) =>
  value
    .replace(/```/g, "")
    .replace(/^[\s>*-]+/, "")
    .replace(/^"+|"+$/g, "")
    .replace(/^'+|'+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

const toSentenceCase = (value: string) => {
  if (!value) {
    return "";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
};

const cleanListField = (
  value: string,
  options?: {
    preserveOrder?: boolean;
  }
) => {
  const segments = value
    .replace(/\r/g, "\n")
    .split(/\n|;/)
    .flatMap((segment) =>
      segment
        .split(/(?<!\d)\s+-\s+|(?<!\d)\s+\u2022\s+|(?<!\d)\s+\*\s+|(?<!\d)\s+\u2022\s+/)
        .map((item) => item.trim())
    )
    .map((segment) =>
      sanitizeInlineText(
        segment
          .replace(/^\s*\d+[\).\s-]*/, "")
          .replace(/^(preconditions?|steps?|expected result|test data)\s*:\s*/i, "")
      )
    )
    .filter(Boolean);

  if (segments.length === 0) {
    return "";
  }

  const uniqueSegments: string[] = [];
  const seen = new Set<string>();

  segments.forEach((segment) => {
    const normalized = segment.toLowerCase();
    if (seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    uniqueSegments.push(toSentenceCase(segment));
  });

  return (options?.preserveOrder === false
    ? Array.from(uniqueSegments).sort((left, right) => left.localeCompare(right))
    : uniqueSegments
  ).join("; ");
};

const cleanExpectedResult = (value: string) =>
  toSentenceCase(
    sanitizeInlineText(
      value.replace(/^(expected result|result|outcome)\s*:\s*/i, "")
    )
  );

const cleanTitle = (value: string) =>
  toSentenceCase(
    sanitizeInlineText(
      value
        .replace(/^(title|scenario|test case)\s*:\s*/i, "")
        .replace(/^\d+[\).\s-]*/, "")
    )
  );

const isLikelyHeaderRow = (cols: string[]) => {
  if (cols.length < 5) {
    return false;
  }

  const normalized = cols.map((col) => sanitizeInlineText(col).toLowerCase());

  return (
    ["id", "type", "title"].every((label, index) => normalized[index] === label) &&
    normalized.some((value) => value === "steps") &&
    normalized.some((value) => value === "expected result")
  );
};

const normalizeTypeLabel = (value: string) => {
  const normalized = value.trim().toLowerCase();

  switch (normalized) {
    case "functional":
      return "Functional";
    case "regression":
      return "Regression";
    case "api":
      return "API";
    case "ui":
      return "UI";
    case "negative":
      return "Negative";
    case "edge":
      return "Edge";
    case "integration":
      return "Integration";
    case "security":
      return "Security";
    case "performance":
      return "Performance";
    default:
      return "";
  }
};

export const inferTestCaseType = (row: {
  title?: string;
  preconditions?: string;
  steps?: string;
  expectedResult?: string;
}) => {
  const content = [
    row.title ?? "",
    row.preconditions ?? "",
    row.steps ?? "",
    row.expectedResult ?? "",
  ]
    .join(" ")
    .toLowerCase();

  if (
    /\b(api|endpoint|request|response|status code|json|payload|token|bearer|header|schema)\b/.test(
      content
    )
  ) {
    return "API";
  }

  if (
    /\b(sql injection|xss|csrf|authorization|authentication|permission|access control|secure|encrypt|session hijack)\b/.test(
      content
    )
  ) {
    return "Security";
  }

  if (
    /\b(load|stress|performance|latency|throughput|response time|concurrent|scalability)\b/.test(
      content
    )
  ) {
    return "Performance";
  }

  if (
    /\b(integration|webhook|third-party|third party|service-to-service|sync between|data flow between)\b/.test(
      content
    )
  ) {
    return "Integration";
  }

  if (
    /\b(ui|button|field|label|modal|dialog|layout|screen|page|dropdown|checkbox|tooltip|placeholder|alignment|visibility)\b/.test(
      content
    )
  ) {
    return "UI";
  }

  if (
    /\b(boundary|limit|max|min|maximum|minimum|large value|empty state|zero|very long|overflow|truncat)\b/.test(
      content
    )
  ) {
    return "Edge";
  }

  if (
    /\b(invalid|error|reject|negative|fail|denied|prevent|blocked|unsupported|required field missing|incorrect)\b/.test(
      content
    )
  ) {
    return "Negative";
  }

  if (
    /\b(regression|existing flow|previously working|should still|unchanged behavior|backward compatibility)\b/.test(
      content
    )
  ) {
    return "Regression";
  }

  return "Functional";
};

const resolveType = (value: string, row: {
  title?: string;
  preconditions?: string;
  steps?: string;
  expectedResult?: string;
}) => normalizeTypeLabel(value) || inferTestCaseType(row);

export const parseResultToRows = (text: string): ParsedRow[] => {
  return text
    .replace(/```[\s\S]*?```/g, (block) =>
      block
        .replace(/```(?:plaintext|text)?/gi, "")
        .replace(/```/g, "")
    )
    .split("\n")
    .map((line) => sanitizeInlineText(line))
    .filter((line) => line !== "")
    .filter((line) => line.includes("|"))
    .flatMap((line, index) => {
      const cols = line.split("|").map((col) => col.trim());

      if (isLikelyHeaderRow(cols)) {
        return [];
      }

      if (cols.length >= 6) {
        const expectedResult =
          cols.length >= 7 ? cols.slice(5, -1).join(" | ") : cols[5] || "";
        const testData = cols.length >= 7 ? cols[cols.length - 1] || "" : "";

        const row = {
          title: cleanTitle(cols[2] || ""),
          preconditions: cleanListField(cols[3] || ""),
          steps: cleanListField(cols[4] || ""),
          expectedResult: cleanExpectedResult(expectedResult),
          testData: cleanListField(testData || ""),
        };

        return [{
          id: sanitizeInlineText(cols[0]) || `TC${String(index + 1).padStart(3, "0")}`,
          type: resolveType(cols[1] || "", row),
          ...row,
        }];
      }

      const expectedResult =
        cols.length >= 6 ? cols.slice(4, -1).join(" | ") : cols[4] || "";
      const testData = cols.length >= 6 ? cols[cols.length - 1] || "" : "";

      const row = {
        title: cleanTitle(cols[1] || ""),
        preconditions: cleanListField(cols[2] || ""),
        steps: cleanListField(cols[3] || ""),
        expectedResult: cleanExpectedResult(expectedResult),
        testData: cleanListField(testData || ""),
      };

      return [{
        id: sanitizeInlineText(cols[0]) || `TC${String(index + 1).padStart(3, "0")}`,
        type: inferTestCaseType(row),
        ...row,
      }];
    });
};

export const rowsToText = (rows: ParsedRow[]) => {
  return rows
    .map(
      (row) =>
        `${row.id} | ${row.type} | ${row.title} | ${row.preconditions} | ${row.steps} | ${row.expectedResult} | ${row.testData ?? ""}`
    )
    .join("\n");
};

export const splitCaseSteps = (steps: string) =>
  steps
    .split(/\n|;/)
    .map((step) => step.replace(/^\s*\d+[\).\s-]*/, "").trim())
    .filter(Boolean);
