import {
  inferAutomationGenerationDomain,
  mapGeneratedIntentsToAutomationSteps,
  type GeneratedAutomationIntent,
} from "../../../../utils/automation-step-generation";
import { getGroqClient } from "../../../../utils/groq-client";
import type { TestCaseRow } from "../../../../utils/workspace";

const buildDomainInstructions = (domain: string, row: TestCaseRow) => {
  if (domain === "api") {
    return "Model this as an API automation flow. Prefer endpoint navigation, request-style logical actions, waits for responses, and assertions against response text or payload placeholders.";
  }
  if (domain === "salesforce") {
    return `Model this as a Salesforce automation flow. Use Lightning-style logical targets such as app launcher, object tab, record form, related list, save action, toast, approval banner, or search results. Reference Salesforce context like ${row.salesforceModule || "Salesforce module"} and ${row.salesforceObjectType || "object"} when helpful.`;
  }
  return "Model this as a UI automation flow. Use logical screen names, labels, buttons, form fields, banners, or route placeholders instead of concrete selectors.";
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const row = body?.row as TestCaseRow | undefined;

    if (!row?.id || !row.title?.trim()) {
      return Response.json(
        { error: "A valid test case row is required." },
        { status: 400 }
      );
    }

    const domain = inferAutomationGenerationDomain(row);
    const domainInstructions = buildDomainInstructions(domain, row);

    const completion = await getGroqClient().chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a senior QA automation designer. Convert manual QA cases into structured low-code automation intents. Never generate raw code or real CSS/XPath selectors.",
        },
        {
          role: "user",
          content: `Generate automation step intents for this test case.

Case ID: ${row.id}
Title: ${row.title}
Preconditions: ${row.preconditions || "None"}
Manual Steps: ${row.steps || "None"}
Expected Result: ${row.expectedResult || "None"}
Test Data: ${row.testData || "None"}
Test Domain: ${row.testDomain || "ui"}
Case Type: ${row.type || "Functional"}
Platform Domain: ${row.platformDomain || "generic"}
Salesforce Module: ${row.salesforceModule || "None"}
Salesforce Object: ${row.salesforceObjectType || "None"}

Domain Guidance:
${domainInstructions}

Rules:
- Do not generate raw code.
- Do not generate real DOM selectors, IDs, or XPath.
- Use logical target names and placeholders only.
- Keep the steps compatible with a generic provider-based automation system.
- Use only these actionType values: navigate, click, fill, assert, wait
- Each step must include: actionType, target, value, expectedResult, description
- value can be an empty string when not needed
- expectedResult should describe the intended verification or visible outcome for that step
- Keep the output practical and ordered from launch/navigation through final verification
- Prefer 4 to 8 steps depending on the case
- For API flows, use endpoint or request placeholders instead of UI targets
- For Salesforce flows, use logical Lightning app/object/page labels, not selectors
- Return JSON only
- Return this exact shape:
{
  "intents": [
    {
      "actionType": "navigate",
      "target": "logical target",
      "value": "",
      "expectedResult": "what should happen",
      "description": "why this step exists"
    }
  ]
}`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content?.trim() || "";
    const normalizedContent = content
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    const parsed = JSON.parse(normalizedContent) as { intents?: GeneratedAutomationIntent[] };
    const intents = Array.isArray(parsed.intents) ? parsed.intents : [];

    if (intents.length === 0) {
      return Response.json(
        { error: "No structured automation steps were generated." },
        { status: 422 }
      );
    }

    const steps = mapGeneratedIntentsToAutomationSteps({
      intents,
      rowId: row.id,
      domain,
    });

    return Response.json({ domain, intents, steps });
  } catch (error) {
    console.error("AUTOMATION GENERATION ERROR:", error);
    return Response.json(
      { error: "Failed to generate automation steps." },
      { status: 500 }
    );
  }
}
