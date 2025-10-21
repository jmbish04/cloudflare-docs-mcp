/**
 * @file src/data/d1.ts
 * @description This module provides a well-lit path for all interactions with the D1 database.
 * It includes functions for logging transactions and querying the curated knowledge base.
 */

import type { CoreEnv } from '../env';
import { DataAccessLayer, type TransactionEventType } from './dal';

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
  eventType: TransactionEventType,
  eventData: object
): Promise<void> {
  try {
    const dal = new DataAccessLayer(env.DB);
    await dal.createTransaction({
      session_id: sessionId,
      event_type: eventType,
      event_data: JSON.stringify(eventData),
      status: 'SUCCESS',
      error_message: null,
      duration_ms: null,
    });
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
  const dal = new DataAccessLayer(env.DB);
  return dal.searchCuratedKnowledge(query);
}