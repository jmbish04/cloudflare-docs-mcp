/**
 * @file src/workflows/research.ts
 * @description Defines the "ResearchWorkflow" class. This workflow
 * orchestrates the parallel execution of various data-gathering tasks.
 */

import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import type { WorkerEnv } from '../env';
import { queryCuratedKnowledge } from '../data/d1';
import { searchCodeExamples } from '../data/vectorize';
import { ToolService } from '../tools';

// Define the shape of the input for this workflow
// This matches what ChatSessionActor sends
export type ResearchInput = {
  sessionId: string;
  query: string;
};

// Define the shape of the output for this workflow
export type ResearchOutput = {
  curatedResults: any[];
  codeResults: any[];
  liveDocsResult: any;
};

/**
 * The main research workflow definition.
 * This orchestrates the parallel fetching of data from all our sources.
 */
export class ResearchWorkflow extends WorkflowEntrypoint<WorkerEnv, ResearchInput> {
  async run(event: WorkflowEvent<ResearchInput>, step: WorkflowStep): Promise<ResearchOutput> {
    const { sessionId, query } = event.payload;

    console.log(`[Workflow ${sessionId}] Starting parallel research for query: "${query}"`);

    // We use step.do to ensure this block is checkpointed.
    // If the workflow sleeps or retries, it won't re-run this part if it succeeded.
    const results = await step.do('parallel-research-tasks', async () => {
      // In the class-based model, 'this.env' gives access to your bindings
      const [curatedResults, codeResults, liveDocsResult] = await Promise.all([
        queryCuratedKnowledge(this.env, query),
        searchCodeExamples(this.env, query),
        new ToolService(this.env).runTool('cloudflare_docs', { query }, this.env),
      ]);

      return {
        curatedResults,
        codeResults,
        liveDocsResult,
      };
    });

    console.log(`[Workflow ${sessionId}] Completed parallel research.`);

    return results;
  }
}
