/**
 * @file src/data/kv.ts
 * @description This module provides a well-lit path for all interactions with a KV namespace,
 * which is used for caching expensive or frequently accessed data.
 */

import type { CoreEnv } from '../env';

/**
 * @function getFromCache
 * @description Retrieves a value from the AGENT_CACHE KV namespace.
 *
 * @param {CoreEnv} env - The worker environment containing the KV binding.
 * @param {string} key - The key to look up in the cache.
 * @returns {Promise<T | null>} The cached value, or null if not found.
 */
export async function getFromCache<T>(env: CoreEnv, key: string): Promise<T | null> {
  try {
    // Assuming the AGENT_CACHE binding is available on the CoreEnv for simplicity.
    // A stricter implementation might have a dedicated CacheEnv type.
    const cache = (env as any).AGENT_CACHE as KVNamespace;
    return await cache.get<T>(key, 'json');
  } catch (error) {
    console.error(`Failed to read from cache for key ${key}:`, error);
    return null;
  }
}

/**
 * @function putInCache
 * @description Stores a value in the AGENT_CACHE KV namespace.
 *
 * @param {CoreEnv} env - The worker environment containing the KV binding.
 * @param {string} key - The key to store the value under.
 * @param {T} value - The value to store. It must be JSON-serializable.
 * @param {number} [expirationTtl] - The time to live for the cache entry, in seconds.
 * @returns {Promise<void>}
 */
export async function putInCache<T>(
  env: CoreEnv,
  key: string,
  value: T,
  expirationTtl?: number
): Promise<void> {
  try {
    const cache = (env as any).AGENT_CACHE as KVNamespace;
    await cache.put(key, JSON.stringify(value), { expirationTtl });
  } catch (error) {
    console.error(`Failed to write to cache for key ${key}:`, error);
  }
}
