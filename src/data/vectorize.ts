/**
 * @file src/data/vectorize.ts
 * @description This module provides a well-lit path for all interactions with the
 * Cloudflare Vectorize index. It's used to find relevant code examples.
 */

import type { CoreEnv } from '../env';

/**
 * @function searchCodeExamples
 * @description Searches for code examples in the Vectorize index based on a query embedding.
 *
 * @param {CoreEnv} env - The worker environment containing the Vectorize and AI bindings.
 * @param {string} query - The user's search query.
 * @returns {Promise<Array<any>>} A promise that resolves to an array of matching code examples.
 */
export async function searchCodeExamples(env: CoreEnv, query: string): Promise<Array<any>> {
  try {
    // Step 1: Generate an embedding for the user's query.
    const model = env.DEFAULT_MODEL_EMBEDDING as keyof AiModels;
    const embeddingResponse = await env.AI.run(model, {
      text: [query],
    });

    // Safely handle the unknown response type for embeddings
    let queryVector: number[] | undefined;
    if (
      typeof embeddingResponse === 'object' &&
      embeddingResponse !== null &&
      'data' in embeddingResponse &&
      Array.isArray(embeddingResponse.data) &&
      embeddingResponse.data.length > 0 &&
      Array.isArray(embeddingResponse.data[0])
    ) {
      queryVector = embeddingResponse.data[0];
    }

    if (!queryVector) {
      throw new Error('Failed to generate a query embedding.');
    }

    // Step 2: Use the embedding to query the Vectorize index.
    const matches = await env.VECTORIZE_INDEX.query(queryVector, { topK: 5 });

    // In a real implementation, you would likely fetch the full code snippets
    // from another source (like D1 or R2) using the IDs from the vector matches.
    return matches.matches;
  } catch (error) {
    console.error('Failed to search code examples in Vectorize:', error);
    return [];
  }
}
