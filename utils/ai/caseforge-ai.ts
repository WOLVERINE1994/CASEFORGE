import { getGroqClient } from "../groq-client";

export type CaseForgeAiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type CaseForgeAiTextRequest = {
  messages: CaseForgeAiMessage[];
  model?: string;
  temperature?: number;
};

export type CaseForgeAiTextResponse = {
  text: string;
  provider: string;
  model: string;
};

const DEFAULT_GROQ_MODEL = "llama-3.1-8b-instant";

const configuredProvider = () =>
  (process.env.CASEFORGE_AI_PROVIDER || "groq").trim().toLowerCase();

const configuredModel = (fallback: string) =>
  process.env.CASEFORGE_AI_MODEL?.trim() ||
  process.env.GROQ_MODEL?.trim() ||
  fallback;

export async function generateCaseForgeAiText(
  request: CaseForgeAiTextRequest,
): Promise<CaseForgeAiTextResponse> {
  const provider = configuredProvider();

  if (provider === "groq") {
    const model = request.model?.trim() || configuredModel(DEFAULT_GROQ_MODEL);
    const completion = await getGroqClient().chat.completions.create({
      messages: request.messages,
      model,
      temperature: request.temperature ?? 0.15,
    });

    return {
      model,
      provider,
      text: completion.choices[0]?.message?.content?.trim() || "",
    };
  }

  if (provider === "openai-compatible" || provider === "custom") {
    const endpoint = process.env.CASEFORGE_AI_BASE_URL?.trim();
    const apiKey = process.env.CASEFORGE_AI_API_KEY?.trim();
    const model = request.model?.trim() || configuredModel("local-model");

    if (!endpoint) {
      throw new Error("CASEFORGE_AI_BASE_URL is required for the configured AI provider.");
    }

    const response = await fetch(`${endpoint.replace(/\/$/, "")}/chat/completions`, {
      body: JSON.stringify({
        messages: request.messages,
        model,
        temperature: request.temperature ?? 0.15,
      }),
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`AI provider request failed with ${response.status}.`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    return {
      model,
      provider,
      text: data.choices?.[0]?.message?.content?.trim() || "",
    };
  }

  throw new Error(`Unsupported CASEFORGE_AI_PROVIDER "${provider}".`);
}
