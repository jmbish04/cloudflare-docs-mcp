/// <reference types="@cloudflare/workers-types" />

/**
 * @file src/env.ts
 * @description Shared environment contracts used across the worker and actors.
 * This file defines the shape of the bindings and environment variables.
 */

import type { CfProperties } from '@cloudflare/workers-types';

// --- Generic & External Service Interfaces ---

export interface DurableObjectNamespaceLike {
  getByName(name: string): DurableObjectStubLike;
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStubLike;
}

export interface DurableObjectStubLike {
  fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
}

export interface QueueLike<T = any> {
  send(message: T): Promise<void>;
}

// --- Core Environment ---

/**
 * @interface CoreEnv
 * @description The core environment bindings and variables available to all parts of the application.
 */
export interface CoreEnv {
  AI: CfProperties['AI'];
  DB: D1Database;
  VECTORIZE_INDEX: VectorizeIndex;

  DEFAULT_MODEL_REASONING: string;
  DEFAULT_MODEL_STRUCTURED_RESPONSE: string;
  DEFAULT_MODEL_EMBEDDING: string;
}

// --- Actor-Specific Environments ---

export type ChatSessionActorEnv = CoreEnv;
export type CodeIngestionActorEnv = CoreEnv & {
  CODE_INGESTION_QUEUE: QueueLike;
};

// --- Main Worker Environment ---

/**
 * @interface WorkerEnv
 * @description The complete set of bindings available to the main worker entry point.
 */
export interface WorkerEnv extends CoreEnv {
  CHAT_SESSION_ACTOR: DurableObjectNamespaceLike;
  CODE_INGESTION_ACTOR: DurableObjectNamespaceLike;
  CODE_INGESTION_QUEUE: QueueLike;
}