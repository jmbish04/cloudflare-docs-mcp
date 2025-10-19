import { getSandbox, type Sandbox, type DurableObjectNamespace, type ExecResult, type FileInfo, type Process, type ExposedPort, type CodeContext, type CodeExecutionResult } from '@cloudflare/sandbox';

// --- Parameter & Response Interfaces ---

export interface WriteFileOptions { encoding?: 'utf8' | 'base64'; }
export interface StartProcessOptions { cwd?: string; env?: Record<string, string>; }
export interface CloneRepoOptions { branch?: string; depth?: number; targetDir?: string; }
export interface ExposePortOptions { name?: string; }
export interface CreateCodeContextOptions { language: 'python' | 'javascript'; }

export class SandboxTool {
  private sandbox: Sandbox;
  public readonly sandboxId: string;

  constructor(ns: DurableObjectNamespace<Sandbox>, sandboxId: string) {
    if (!ns || !sandboxId) { throw new Error("Sandbox namespace and ID are required."); }
    this.sandboxId = sandboxId;
    this.sandbox = getSandbox(ns, this.sandboxId);
  }

  public async exec(command: string): Promise<ExecResult> { return this.sandbox.exec(command); }
  public async execStream(command: string): Promise<ReadableStream> { return this.sandbox.execStream(command); }
  public async writeFile(path: string, content: string, options?: WriteFileOptions): Promise<void> { await this.sandbox.writeFile(path, content, options); }
  public async readFile(path: string, options?: WriteFileOptions): Promise<FileInfo> { return this.sandbox.readFile(path, options); }
  public async mkdir(path: string): Promise<void> { await this.sandbox.mkdir(path, { recursive: true }); }
  public async deleteFile(path: string): Promise<void> { await this.sandbox.deleteFile(path); }
  public async startProcess(command: string, options?: StartProcessOptions): Promise<Process> { return this.sandbox.startProcess(command, options); }
  public async listProcesses(): Promise<Process[]> { return this.sandbox.listProcesses(); }
  public async killProcess(processId: string): Promise<void> { await this.sandbox.killProcess(processId); }
  public async killAllProcesses(): Promise<void> { await this.sandbox.killAllProcesses(); }
  public async exposePort(port: number, options?: ExposePortOptions): Promise<ExposedPort> { return this.sandbox.exposePort(port, options); }
  public async unexposePort(port: number): Promise<void> { await this.sandbox.unexposePort(port); }
  public async createCodeContext(options: CreateCodeContextOptions): Promise<CodeContext> { return this.sandbox.createCodeContext(options); }
  public async runCode(contextId: string, code: string): Promise<CodeExecutionResult> { return this.sandbox.runCode(contextId, code); }
  public async deleteCodeContext(contextId: string): Promise<void> { await this.sandbox.deleteCodeContext(contextId); }
  public async cloneRepo(repoUrl: string, options?: CloneRepoOptions): Promise<void> { await this.sandbox.gitCheckout(repoUrl, options); }
}
