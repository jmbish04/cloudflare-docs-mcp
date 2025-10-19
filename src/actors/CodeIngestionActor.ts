/**
 * @file src/actors/CodeIngestionActor.ts
 * @description This file defines the CodeIngestionActor, a Durable Object responsible for
 * handling on-demand vectorization of code from sources like GitHub or raw text.
 * It will use a queue and workflow to manage the ingestion process asynchronously.
 */

import { Actor } from '@cloudflare/actors';
import type { CodeIngestionActorEnv } from '../env';

/**
 * @class CodeIngestionActor
 * @description A stateful actor that manages the asynchronous ingestion and vectorization
 * of code snippets. It receives requests, queues them for processing, and tracks the status.
 */
export class CodeIngestionActor extends Actor<CodeIngestionActorEnv> {
  /**
   * @method fetch
   * @description The entry point for requests to this actor. It expects a POST request
   * with the code to be ingested.
   * @param {Request} request - The incoming HTTP request.
   * @returns {Promise<Response>} A response acknowledging the ingestion request.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/test') {
      return this.test();
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    try {
      const { sourceUrl, rawCode } = (await request.json()) as { sourceUrl?: string; rawCode?: string };
      if (!sourceUrl && !rawCode) {
        return Response.json({ error: 'Either sourceUrl or rawCode is required.' }, { status: 400 });
      }

      const ingestionId = crypto.randomUUID();
      const job = {
        id: ingestionId,
        sourceUrl,
        rawCode,
        status: 'queued',
        submittedAt: new Date().toISOString(),
      };

      // In the future, this will be a more complex workflow.
      // For now, we send it to the queue.
      await this.env.CODE_INGESTION_QUEUE.send(job);

      return Response.json({
        message: 'Code ingestion request received and queued.',
        ingestionId,
      });
    } catch (error) {
      console.error('Error in CodeIngestionActor:', error);
      return Response.json({ error: 'Failed to process ingestion request.' }, { status: 500 });
    }
  }

  /**
   * @method test
   * @description A dedicated method for running a health check on the actor's dependencies (D1, KV).
   */
  async test(): Promise<Response> {
    try {
      await this.env.DB.prepare('SELECT 1').run();
      const testKey = `health_check_ingestion`;
      await (this.env as any).AGENT_CACHE.put(testKey, 'ok');
      const value = await (this.env as any).AGENT_CACHE.get(testKey);
      await (this.env as any).AGENT_CACHE.delete(testKey);
      if (value !== 'ok') throw new Error('KV read/write check failed.');
      return Response.json({ status: 'PASS' });
    } catch (e) {
      return Response.json({ status: 'FAIL', error: e.message }, { status: 500 });
    }
  }
}
