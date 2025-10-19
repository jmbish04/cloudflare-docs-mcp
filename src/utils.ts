/**
 * @file src/utils.ts
 * @description This module provides utility functions for common tasks such as sanitizing
 * AI model outputs, formatting data, or other helper operations that are used across
 * the application.
 */

/**
 * @function sanitizeAIResponse
 * @description Cleans up the raw text output from an AI model. This function specifically
 * targets common markdown artifacts, such as code fences, that are often included in
 * model responses but are not desired in the final, clean output.
 *
 * @param {string} rawResponse - The raw string response from the AI model.
 * @returns {string} A sanitized string with unwanted artifacts removed.
 *
 * @example
 * const raw = "Here is the code:\n```json\n{\"key\": \"value\"}\n```";
 * const clean = sanitizeAIResponse(raw);
 * // clean is now: "Here is the code:\n{\"key\": \"value\"}"
 */
export function sanitizeAIResponse(rawResponse: string): string {
  if (!rawResponse) {
    return '';
  }

  // Remove markdown code fences (```) and the language identifier if present.
  // This regex handles multiline code blocks.
  const cleanedResponse = rawResponse.replace(/```[\w\s]*\n/g, '').replace(/\n```/g, '');

  return cleanedResponse.trim();
}

