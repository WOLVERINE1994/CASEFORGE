type TestCaseRow = {
  id?: string;
  type?: string;
  title?: string;
  preconditions?: string;
  steps?: string;
  expectedResult?: string;
  testData?: string;
};

const hasPattern = (content: string, pattern: RegExp) => pattern.test(content);

const addUnique = (items: string[], value: string) => {
  if (!items.includes(value)) {
    items.push(value);
  }
};

export const suggestTestData = (row: TestCaseRow) => {
  if (row.testData?.trim()) {
    return row.testData.trim();
  }

  const content = [
    row.type ?? "",
    row.title ?? "",
    row.preconditions ?? "",
    row.steps ?? "",
    row.expectedResult ?? "",
  ]
    .join(" ")
    .toLowerCase();

  const suggestions: string[] = [];

  if (hasPattern(content, /\bemail\b/)) {
    addUnique(suggestions, 'Valid email: "qa.user@example.com"');
    addUnique(suggestions, 'Invalid email: "qa.user@"');
    addUnique(suggestions, 'Unregistered email: "missing.user@example.com"');
  }

  if (hasPattern(content, /\bphone\b|\bmobile\b/)) {
    addUnique(suggestions, 'Valid phone: "+1 2025550187"');
    addUnique(suggestions, 'Invalid phone: "123"');
  }

  if (hasPattern(content, /\bpassword\b/)) {
    addUnique(suggestions, 'Valid password: "Reset@1234"');
    addUnique(suggestions, 'Minimum-length password: "Ab1!xyz8"');
    addUnique(suggestions, 'Empty password: ""');
  }

  if (hasPattern(content, /\btoken\b|\bauth\b|\bbearer\b|\bsession\b/)) {
    addUnique(suggestions, 'Valid token: "token_valid_123"');
    addUnique(suggestions, 'Expired token: "token_expired_123"');
    addUnique(suggestions, 'Missing token/header');
  }

  if (hasPattern(content, /\bapi\b|\bendpoint\b|\bpayload\b|\bjson\b|\brequest\b|\bresponse\b/)) {
    addUnique(
      suggestions,
      'Valid payload: {"email":"qa.user@example.com","channel":"email"}'
    );
    addUnique(
      suggestions,
      'Malformed payload: {"email":123,"channel":true}'
    );
    addUnique(suggestions, "Missing required field payload");
  }

  if (hasPattern(content, /\brole\b|\bpermission\b|\bauthori[sz]ed\b|\bunauthori[sz]ed\b|\badmin\b|\bguest\b/)) {
    addUnique(suggestions, 'Authorized user: "admin.user"');
    addUnique(suggestions, 'Unauthorized user: "viewer.user"');
  }

  if (hasPattern(content, /\btimeout\b|\bexpired\b|\bretry\b|\bfailure\b|\berror\b/)) {
    addUnique(suggestions, "Simulated timeout after 30 seconds");
    addUnique(suggestions, "Service unavailable / 503 response");
  }

  if (hasPattern(content, /\bempty\b|\bblank\b|\bmissing\b|\bnull\b/)) {
    addUnique(suggestions, 'Empty value: ""');
    addUnique(suggestions, "Null value");
  }

  if (hasPattern(content, /\bminimum\b|\bmin\b|\bboundary\b/)) {
    addUnique(suggestions, "Minimum boundary value");
  }

  if (hasPattern(content, /\bmaximum\b|\bmax\b|\blimit\b|\boverflow\b/)) {
    addUnique(suggestions, "Maximum boundary value");
    addUnique(suggestions, "Over-limit value");
  }

  if (hasPattern(content, /\bdate\b|\btime\b|\bschedule\b|\bexpiry\b/)) {
    addUnique(suggestions, 'Past date/time value: "2026-03-21T09:00:00Z"');
    addUnique(suggestions, 'Future date/time value: "2026-04-21T09:00:00Z"');
  }

  if (hasPattern(content, /\bsearch\b|\bname\b|\btext\b|\binput\b|\bfield\b/)) {
    addUnique(suggestions, 'Valid text input: "Sample QA Value"');
    addUnique(suggestions, 'Special characters: "@#$%^&*()"');
    addUnique(suggestions, 'Very long text input');
  }

  if (suggestions.length === 0) {
    suggestions.push('Happy-path data set: "valid business input"');
    suggestions.push('Negative-path data set: "invalid or incomplete input"');
    suggestions.push("Boundary data set: minimum, maximum, and empty values");
  }

  return suggestions.join("; ");
};
