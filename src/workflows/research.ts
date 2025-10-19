/**
 * @file src/workflows/research.ts
 * @description Defines the "research-workflow" using Cloudflare Workflows. This workflow
 * orchestrates the parallel execution of various data-gathering tasks.
 */

import { workflow } from '@cloudflare/workflows';
import { queryCuratedKnowledge } from '../data/d1';
import { searchCodeExamples } from '../data/vectorize';
import { ToolService } from '../tools';

// Define the shape of the input for this workflow
type ResearchInput = {
  sessionId: string;
  query: string;
};

// Define the shape of the output for this workflow
type ResearchOutput = {
  curatedResults: any[];
  codeResults: any[];
  liveDocsResult: any;
};

/**
 * The main research workflow definition.
 * This orchestrates the parallel fetching of data from all our sources.
 */
export const researchWorkflow = workflow(async (input: ResearchInput): Promise<ResearchOutput> => {
  // Note: In a real workflow, you would need a way to pass the environment/bindings
  // to these tasks. Workflows have a specific context for this. For now, this
  // structure outlines the intended logic. A real implementation will require
  // activities or task handlers that have access to the worker environment.

  const { sessionId, query } = input;

  // This is a conceptual representation. We will need to refactor this to use
  // workflow-compatible tasks/activities that can access the worker's environment.
  console.log(`[Workflow ${sessionId}] Starting parallel research for query: "${query}"`);

  const [curatedResults, codeResults, liveDocsResult] = await Promise.all([
    // These would be workflow.executeChild() calls in a more complex setup
    queryCuratedKnowledge(workflow.env, query),
    searchCodeExamples(workflow.env, query),
    new ToolService(workflow.env).runTool('cloudflare_docs', { query }, workflow.env),
  ]);

  console.log(`[Workflow ${sessionId}] Completed parallel research.`);

  return {
    curatedResults,
    codeResults,
    liveDocsResult,
  };
});
