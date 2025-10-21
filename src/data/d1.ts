/**
 * @file src/data/d1.ts
 * @description This module provides a well-lit path for all interactions with the D1 database.
 * It includes functions for logging transactions and querying the curated knowledge base.
 */

import type { CoreEnv } from '../env';

/**
 * @function logTransaction
 * @description Logs a significant agent action to the 'transactions' table in D1.
 * This creates an audit trail for every step the agent takes.
 *
 * @param {CoreEnv} env - The worker environment containing the D1 binding.
 * @param {string} sessionId - The ID of the current chat session.
 * @param {string} eventType - The type of event being logged (e.g., 'VECTOR_SEARCH').
 * @param {object} eventData - A JSON object containing data relevant to the event.
 * @returns {Promise<void>}
 */
export async function logTransaction(
  env: CoreEnv,
  sessionId: string,
  eventType: string,
  eventData: object
): Promise<void> {
  try {
    const stmt = env.DB.prepare(
      'INSERT INTO transactions (session_id, event_type, event_data, status) VALUES (?, ?, ?, ?)'
    );
    await stmt.bind(sessionId, eventType, JSON.stringify(eventData), 'SUCCESS').run();
  } catch (error) {
    console.error(`Failed to log transaction for session ${sessionId}:`, error);
    // In a real-world scenario, you might want to have a fallback logging mechanism.
  }
}

/**
 * @function queryCuratedKnowledge
 * @description Searches the 'curated_knowledge' table for best practices and gotchas.
 *
 * @param {CoreEnv} env - The worker environment containing the D1 binding.
 * @param {string} query - The search query.
 * @returns {Promise<Array<any>>} A promise that resolves to an array of matching knowledge entries.
 */
export async function queryCuratedKnowledge(env: CoreEnv, query: string): Promise<Array<any>> {
  // This is a placeholder for a more sophisticated search.
  // A real implementation would use full-text search or keyword matching against tags.
  const stmt = env.DB.prepare('SELECT * FROM curated_knowledge WHERE content LIKE ? OR tags LIKE ?');
  const { results } = await stmt.bind(`%${query}%`, `%${query}%`).all();
  return results;
}