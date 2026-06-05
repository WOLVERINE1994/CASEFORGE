import Groq from "groq-sdk";

let groqClient: Groq | null = null;

export const getGroqClient = () => {
  const apiKey = process.env.GROQ_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is required for AI generation requests.");
  }

  groqClient ??= new Groq({ apiKey });
  return groqClient;
};
