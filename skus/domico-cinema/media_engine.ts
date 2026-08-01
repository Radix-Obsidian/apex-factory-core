import OpenAI from "openai";
import type { GenerationRequest, MediaEngine } from "./types.js";

const STYLE_SYSTEM_PROMPT = `You are the Voco Factory's culinary cinematographer. Every prompt you produce creates restaurant-grade food photography that is viscerally appetizing, rich with depth of field, warm professional lighting, and the visual energy of a Michelin editorial spread. The subject is always the food. The background is clean, purposeful, and never distracting.`;

function buildClient(): OpenAI {
  const apiKey = process.env["OPENAI_GENERIC_API_KEY"];
  if (!apiKey) {
    throw new Error("OPENAI_GENERIC_API_KEY must be set in the environment");
  }
  return new OpenAI({ apiKey });
}

export async function buildCinematicPrompt(
  dishName: string,
  dishDescription: string,
  cuisineStyle: string,
  styleDirective: string
): Promise<string> {
  const client = buildClient();

  const userMessage = `Build a DALL-E 3 image generation prompt for the following food asset.

Dish: ${dishName}
Description: ${dishDescription}
Cuisine Style: ${cuisineStyle}
Style Directive: ${styleDirective}

Return ONLY the final image generation prompt. No commentary, no preamble, no explanation.`;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: STYLE_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    max_tokens: 300,
    temperature: 0.7,
  });

  const prompt = response.choices[0]?.message?.content?.trim();
  if (!prompt) {
    throw new Error("media_engine: GPT-4o-mini returned an empty prompt");
  }
  return prompt;
}

export async function generateFoodAsset(
  request: GenerationRequest
): Promise<{ imageBuffer: Buffer; promptUsed: string; engineUsed: MediaEngine }> {
  const client = buildClient();

  const cinematicPrompt = await buildCinematicPrompt(
    request.dishName,
    request.dishDescription,
    request.cook.cuisineStyle,
    request.styleDirective
  );

  const imageResponse = await client.images.generate({
    model: "dall-e-3",
    prompt: cinematicPrompt,
    n: 1,
    size: "1024x1024",
    quality: "hd",
    response_format: "b64_json",
  });

  const firstItem = imageResponse.data?.[0];
  const b64 = firstItem?.b64_json;
  if (!b64) {
    throw new Error("media_engine: DALL-E 3 returned no image data");
  }

  const imageBuffer = Buffer.from(b64, "base64");

  return {
    imageBuffer,
    promptUsed: cinematicPrompt,
    engineUsed: "dall-e-3",
  };
}

export function buildObjectKey(cookId: string, assetId: string, assetKind: string): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const kindSlug = assetKind.toLowerCase().replace(/_/g, "");
  return `cooks/${cookId}/${datePart}/${kindSlug}_${assetId}.png`;
}
