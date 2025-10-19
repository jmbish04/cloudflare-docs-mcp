/**
 * Shared environment contracts used across the worker, actors, and agents.
 */

import type { DocsAgentEnv } from './agents/docsAgent';

export interface DurableObjectNamespaceLike {
  getByName(name: string): DurableObjectStubLike;
}

export interface DurableObjectStubLike {
  fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
  setName?: (id: string) => Promise<void> | void;
}

export interface ProductSyncActorEnv extends DocsAgentEnv {
  /** Cron expression controlling automatic sync cadence. */
  PRODUCT_SYNC_CRON?: string;
}

export type ChatSessionActorEnv = DocsAgentEnv;

export interface WorkerEnv extends DocsAgentEnv {
  PRODUCT_SYNC_ACTOR: DurableObjectNamespaceLike;
  CHAT_SESSION_ACTOR: DurableObjectNamespaceLike;
}
