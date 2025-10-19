/**
 * @file src/utils.ts
 * @description This module provides utility functions for common tasks such as sanitizing
 * AI model outputs and generating structured responses.
 */

import { createWorkersAI } from 'workers-ai-provider';
import { generateObject } from 'ai';
import { z } from 'zod';
import type { CoreEnv } from './env';

/**
 * @function sanitizeAIResponse
 * @description Cleans up the raw text output from an AI model.
 */
export function sanitizeAIResponse(rawResponse: string): string {
  if (!rawResponse) {
    return '';
  }
  const cleanedResponse = rawResponse.replace(/```[\w\s]*\n/g, '').replace(/\n```/g, '');
  return cleanedResponse.trim();
}

/**
 * @function getStructuredResponse
 * @description Uses the Vercel AI SDK and a Zod schema to get a structured,
 * validated JSON object from a language model.
 *
 * @param {CoreEnv} env - The worker environment.
 * @param {string} prompt - The prompt to send to the model.
 * @param {T} schema - The Zod schema to validate the response against.
 * @returns {Promise<z.infer<T>>} A promise that resolves to the validated object.
 */
export async function getStructuredResponse<T extends z.ZodTypeAny>(
  env: CoreEnv,
  prompt: string,
  schema: T
): Promise<z.infer<T>> {
  const workersai = createWorkersAI({ binding: env.AI });
  const model = workersai(env.DEFAULT_MODEL_STRUCTURED_RESPONSE as any);

  const { object } = await generateObject({
    model,
    prompt,
    schema,
  });

  return object;
}