/**
 * @file src/health.ts
 * @description Implements the comprehensive, multi-stage health check logic.
 */

import type { WorkerEnv } from './env';
import { sanitizeAIResponse } from './utils';
import { ToolService } from './tools';

type CheckResult = {
  component: string;
  status: 'PASS' | 'FAIL';
  error?: string;
  details?: any;
};

/**
 * @function runHealthCheck
 * @description Performs a series of tests against every major component, finishing with an AI-powered summary.
 * @param {WorkerEnv} env - The worker environment containing all necessary bindings.
 * @returns {Promise<{ overall_status: 'PASS' | 'FAIL', results: CheckResult[], ai_summary: string }>}
 */
export async function runHealthCheck(env: WorkerEnv): Promise<{ overall_status: 'PASS' | 'FAIL', results: CheckResult[], ai_summary: string }> {
  // Run foundational checks first.
  const foundationalChecks: Promise<CheckResult>[] = [
    checkD1(env),
    checkKV(env),
    checkQueues(env),
  ];
  const foundationalResults = await Promise.all(foundationalChecks);

  // Run actor and external tool checks in parallel.
  const dependencyResults = await Promise.all([
    checkActors(env),
    checkExternalTools(env),
  ]);
  const actorResults = dependencyResults[0];
  const toolResults = dependencyResults[1];

  const allResults = [...foundationalResults, ...actorResults, ...toolResults];
  
  // Finally, run the AI check, passing in the results so far.
  const aiResult = await checkAIModelsAndSummarize(env, allResults);
  allResults.push(aiResult);

  const overall_status = allResults.every(r => r.status === 'PASS') ? 'PASS' : 'FAIL';
  const ai_summary = aiResult.status === 'PASS' ? aiResult.details.summary : "AI health check failed. No summary available.";

  // Store the result in D1
  try {
    const stmt = env.DB.prepare('INSERT INTO health_checks (overall_status, results_data) VALUES (?, ?)');
    await stmt.bind(overall_status, JSON.stringify({ results: allResults, ai_summary })).run();
  } catch (dbError) {
    console.error("Failed to store health check results in D1:", dbError);
    allResults.push({ component: 'HealthCheckStorage', status: 'FAIL', error: dbError.message });
  }

  return { overall_status, results: allResults, ai_summary };
}

// --- Individual Check Functions ---

async function checkD1(env: WorkerEnv): Promise<CheckResult> {
  try {
    await env.DB.prepare('SELECT 1').run();
    return { component: 'D1 Database', status: 'PASS' };
  } catch (e) {
    return { component: 'D1 Database', status: 'FAIL', error: e.message };
  }
}

async function checkKV(env: WorkerEnv): Promise<CheckResult> {
  try {
    const testKey = 'health_check_test';
    await (env as any).AGENT_CACHE.put(testKey, 'ok');
    const value = await (env as any).AGENT_CACHE.get(testKey);
    await (env as any).AGENT_CACHE.delete(testKey);
    if (value !== 'ok') throw new Error('Read value did not match written value.');
    return { component: 'KV Namespace (AGENT_CACHE)', status: 'PASS' };
  } catch (e) {
    return { component: 'KV Namespace (AGENT_CACHE)', status: 'FAIL', error: e.message };
  }
}

async function checkQueues(env: WorkerEnv): Promise<CheckResult> {
  try {
    await env.CODE_INGESTION_QUEUE.send({ health_check: true });
    await env.FEASIBILITY_QUEUE.send({ health_check: true });
    return { component: 'Queues', status: 'PASS' };
  } catch (e) {
    return { component: 'Queues', status: 'FAIL', error: e.message };
  }
}

async function checkActors(env: WorkerEnv): Promise<CheckResult[]> {
  const actorChecks = [
    { name: 'ChatSessionActor', ns: env.CHAT_SESSION_ACTOR },
    { name: 'CodeIngestionActor', ns: env.CODE_INGESTION_ACTOR },
    { name: 'FeasibilityAgentActor', ns: env.FEASIBILITY_AGENT_ACTOR },
  ];

  return Promise.all(actorChecks.map(async ({ name, ns }) => {
    try {
      const stub = ns.get(ns.idFromName('health_check'));
      const res = await stub.fetch('https://actor.local/test', { method: 'POST' });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Actor returned status ${res.status}: ${errorText}`);
      }
      const result = await res.json();
      if (result.status !== 'PASS') {
        throw new Error(result.error || 'Actor self-test failed.');
      }
      return { component: name, status: 'PASS' as const };
    } catch (e) {
      return { component: name, status: 'FAIL' as const, error: e.message };
    }
  }));
}

async function checkExternalTools(env: WorkerEnv): Promise<CheckResult[]> {
  const toolService = new ToolService(env);
  const tools = toolService.listTools();

  return Promise.all(tools.map(async (tool) => {
    const component = `External Tool: ${tool.name}`;
    try {
      let result;
      if (tool.name === 'github_api') {
        // Use a non-destructive, simple operation for the health check
        result = await toolService.runTool(tool.name, { operation: 'getRepoContents', owner: 'cloudflare', repo: 'workers-sdk' }, env);
        if (result.status === 'error') throw new Error(result.message);
      } else {
        // For MCP tools, a simple ping/empty query is usually sufficient
        result = await toolService.runTool(tool.name, { query: 'health_check' }, env);
        if (result.status === 'error') throw new Error(result.message);
      }
      return { component, status: 'PASS' as const };
    } catch (e) {
      return { component, status: 'FAIL' as const, error: e.message };
    }
  }));
}

async function checkAIModelsAndSummarize(env: WorkerEnv, previousResults: CheckResult[]): Promise<CheckResult> {
  try {
    const healthReport = JSON.stringify(previousResults, null, 2);
    const prompt = `The following is a JSON report of a system health check. Please provide a brief, one-sentence human-readable summary of the overall status.\n\nReport:\n${healthReport}`;
    
    const model = env.DEFAULT_MODEL_REASONING as keyof AiModels;
    const response = await env.AI.run(model, { prompt });

    const summary = sanitizeAIResponse((response as { response?: string }).response || '');
    if (!summary) {
      throw new Error('AI model returned an empty summary.');
    }

    return { component: 'Workers AI Summary', status: 'PASS', details: { summary } };
  } catch (e) {
    return { component: 'Workers AI Summary', status: 'FAIL', error: e.message };
  }
}
