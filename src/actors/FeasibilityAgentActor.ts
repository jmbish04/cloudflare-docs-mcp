/**
 * @file src/actors/FeasibilityAgentActor.ts
 * @description Defines the FeasibilityAgentActor, the entry point for long-running,
 * proactive research jobs.
 */

import { Actor } from '@cloudflare/actors';
import type { FeasibilityAgentActorEnv } from '../env';
import { DataAccessLayer } from '../data/dal';

/**
 * @class FeasibilityAgentActor
 * @description This actor receives a feasibility research request, creates a job record in D1,
 * and dispatches the job to a queue for asynchronous processing.
 */
export class FeasibilityAgentActor extends Actor<FeasibilityAgentActorEnv> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/test') {
      return this.test();
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    try {
      const { prompt } = (await request.json()) as { prompt: string };
      if (!prompt) {
        return Response.json({ error: 'A research prompt is required.' }, { status: 400 });
      }

      const uuid = crypto.randomUUID();

      // 1. Create a job record in the D1 database
      const dal = new DataAccessLayer(this.env.DB);
      const job = await dal.createFeasibilityJob(prompt, uuid);
      const jobId = job.id;

      // 2. Dispatch the job to the queue for processing
      await this.env.FEASIBILITY_QUEUE.send({
        jobId,
        uuid,
        prompt,
      });

      // 3. Return the job ID and UUID to the client immediately
      return Response.json({
        message: 'Feasibility research job has been queued.',
        jobId,
        uuid,
      });

    } catch (error) {
      console.error('Error in FeasibilityAgentActor:', error);
      return Response.json({ error: 'Failed to queue feasibility job.' }, { status: 500 });
    }
  }

  /**
   * @method test
   * @description A dedicated method for running a health check on the actor's dependencies (D1, KV).
   */
  async test(): Promise<Response> {
    try {
      const dal = new DataAccessLayer(this.env.DB);
      await dal.ping();
      const testKey = `health_check_feasibility`;
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
