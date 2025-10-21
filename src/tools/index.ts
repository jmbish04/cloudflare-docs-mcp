/**
 * @file src/tools/index.ts
 * @description Provides the ToolService orchestrator used to list and execute tools.
 */

import type { WorkerEnv } from '../env';
import { DataAccessLayer } from '../data/dal';
import { VectorizeService } from '../data/vectorize_service';
import toolsConfig from '../../tools.config.json';
import { GitHubTool } from './github';
import { CloudflareDocsTool } from './cloudflare_docs';
import { BrowserRender } from './browser';
import { RAGTool } from './rag_tool';
import { SandboxTool } from './sandbox';

type ToolConfigEntry = (typeof toolsConfig)['tools'][string];

export type ToolDefinition = ToolConfigEntry & {
  name: string;
  source: 'internal' | 'config';
};

const INTERNAL_TOOLS: ToolDefinition[] = [
  {
    name: 'github_api',
    type: 'internal',
    description: 'GitHub REST API adapter for repository and issue lookups.',
    source: 'internal',
  },
  {
    name: 'cloudflare_docs',
    type: 'internal',
    description: 'Vector-backed search across Cloudflare documentation.',
    source: 'internal',
  },
  {
    name: 'browser',
    type: 'internal',
    description: 'Wrapper around the Cloudflare Browser Rendering APIs.',
    source: 'internal',
  },
  {
    name: 'rag_tool',
    type: 'internal',
    description: 'Retrieval-augmented generation helper for curated knowledge.',
    source: 'internal',
  },
  {
    name: 'sandbox',
    type: 'internal',
    description: 'Cloudflare Sandbox Durable Object integration.',
    source: 'internal',
  },
];

function mergeToolDefinitions(): ToolDefinition[] {
  const combined = new Map<string, ToolDefinition>();

  for (const tool of INTERNAL_TOOLS) {
    combined.set(tool.name, tool);
  }

  const configEntries = toolsConfig?.tools ?? {};
  for (const [name, definition] of Object.entries(configEntries)) {
    const existing = combined.get(name);
    combined.set(name, {
      name,
      type: definition.type ?? existing?.type ?? 'config',
      description: definition.description ?? existing?.description ?? 'External tool',
      endpoint: definition.endpoint ?? existing?.endpoint,
      command: definition.command ?? existing?.command,
      args: definition.args ?? existing?.args,
      env_vars: definition.env_vars ?? existing?.env_vars,
      source: existing?.source ?? 'config',
    });
  }

  return Array.from(combined.values());
}

export class ToolService {
  private readonly tools: ToolDefinition[];

  constructor(private readonly env: WorkerEnv) {
    this.tools = mergeToolDefinitions();
  }

  listTools(): ToolDefinition[] {
    return [...this.tools];
  }

  async runTool(toolName: string, args: any = {}, env: WorkerEnv = this.env): Promise<any> {
    try {
      switch (toolName) {
        case 'github_api':
          return this.runGitHubTool(args, env);
        case 'cloudflare_docs':
          return this.runCloudflareDocsTool(args, env);
        case 'browser':
          return this.runBrowserTool(args, env);
        case 'rag_tool':
          return this.runRagTool(args, env);
        case 'sandbox':
          return this.runSandboxTool(args, env);
        default:
          return {
            status: 'error',
            message: `Tool "${toolName}" is not registered in ToolService.`,
          };
      }
    } catch (error) {
      console.error(`Tool execution failed for ${toolName}:`, error);
      return {
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private runGitHubTool(args: any, env: WorkerEnv): Promise<any> {
    const github = new GitHubTool(env);
    const operation = (args?.operation ?? args?.subcommand) as string | undefined;

    switch (operation) {
      case 'searchRepositories':
      case 'search_repos':
        return github.searchRepositories(args?.query ?? '', args?.language, args?.limit);
      case 'searchIssues':
      case 'search_issues':
        return github.searchIssues(args?.query ?? '', args?.repo, args?.limit);
      case 'getFileContent':
      case 'get_file_content':
        return github.getFileContent(args?.owner, args?.repo, args?.path ?? '');
      case 'getRepoContents':
      case 'get_repo_contents':
        return github.getRepoContents(args?.owner, args?.repo, args?.path ?? '');
      case 'getPullRequestDiff':
      case 'get_pr_diff':
        return github.getPullRequestDiff(args?.owner, args?.repo, args?.prNumber ?? args?.pull_number);
      default:
        throw new Error(`Unsupported GitHub operation: ${operation ?? 'unknown'}.`);
    }
  }

  private runCloudflareDocsTool(args: any, env: WorkerEnv): Promise<any> {
    if (!args?.query || typeof args.query !== 'string') {
      throw new Error('cloudflare_docs tool requires a string "query" argument.');
    }

    const docsTool = new CloudflareDocsTool(env.AI);
    return docsTool.search(args.query);
  }

  private runBrowserTool(args: any, env: WorkerEnv): Promise<any> {
    const accountId = (env as any).CLOUDFLARE_ACCOUNT_ID as string | undefined;
    const apiToken = (env as any).CLOUDFLARE_API_TOKEN as string | undefined;

    if (!accountId) {
      throw new Error('Browser tool requires CLOUDFLARE_ACCOUNT_ID in the environment.');
    }

    const browser = new BrowserRender(accountId, apiToken);
    const action = (args?.action ?? 'scrape') as string;

    switch (action) {
      case 'screenshot':
        return browser.takeScreenshot(args);
      case 'pdf':
        return browser.generatePdf(args);
      case 'snapshot':
        return browser.takeSnapshot(args);
      case 'json':
        return browser.extractJson(args);
      case 'links':
        return browser.getLinks(args);
      case 'markdown':
        return browser.getMarkdown(args);
      case 'scrape':
      default:
        if (!args?.elements) {
          throw new Error('Browser scrape action requires an "elements" array.');
        }
        return browser.scrape(args);
    }
  }

  private runRagTool(args: any, env: WorkerEnv): Promise<any> {
    if (!args?.query || typeof args.query !== 'string') {
      throw new Error('rag_tool requires a string "query" argument.');
    }

    const vectorizeService = new VectorizeService(env.VECTORIZE_INDEX, env.AI, env.DEFAULT_MODEL_EMBEDDING);
    const dal = new DataAccessLayer(env.DB);
    const ragTool = new RAGTool(vectorizeService, dal);
    return ragTool.searchKnowledgeBase(args.query);
  }

  private async runSandboxTool(args: any, env: WorkerEnv): Promise<any> {
    const namespace = (env as any).SANDBOX;
    if (!namespace) {
      throw new Error('Sandbox tool requires the SANDBOX Durable Object binding.');
    }

    const sandboxId = typeof args?.sandboxId === 'string' ? args.sandboxId : 'default';
    const sandbox = new SandboxTool(namespace, sandboxId);

    if (typeof args?.command === 'string') {
      return sandbox.exec(args.command);
    }

    if (typeof args?.code === 'string' && typeof args?.filename === 'string') {
      return sandbox.runScript(args.filename, args.code);
    }

    throw new Error('Sandbox tool requires either a "command" or both "code" and "filename" arguments.');
  }
}
