# Task 7: Implement Sandboxed Verification

## Objective
Integrate the `SandboxTool` to allow the agent to write and execute code in a secure, isolated environment. This is critical for verifying code snippets, testing hypotheses, and running small scripts.

## Context
The `SandboxTool` class was created in `src/tools/sandbox.ts`, but it needs to be fully integrated into the agent's workflow. The agent should be able to decide when code execution is necessary, write a script to the sandbox, execute it, and use the output to inform its final answer.

## Requirements

### 1. Enhance the Research Plan Schema
- Open `src/actors/ChatSessionActor.ts`.
- Modify the `ResearchPlanSchema` to allow for more complex tool calls, specifically for the sandbox. The `args` should be able to contain a block of code.

### Example `ResearchPlanSchema` update:

```typescript
// src/actors/ChatSessionActor.ts

const ToolCallSchema = z.object({
  tool: z.string().describe("The name of the tool to call (e.g., 'sandbox', 'github_api')."),
  args: z.object({
    subcommand: z.string().optional().describe("For tools with multiple functions (e.g., 'github_api')."),
    query: z.string().optional(),
    // Add fields for sandbox
    filename: z.string().optional().describe("The name of the file to write in the sandbox (e.g., 'test.js')."),
    code: z.string().optional().describe("The code to write to the file."),
    command: z.string().optional().describe("The shell command to execute in the sandbox."),
    // ... other potential args
  }).passthrough(),
});
```

### 2. Enhance the `SandboxTool`
- Open `src/tools/sandbox.ts`.
- Add a new high-level method `runScript` to simplify the process of writing and executing a file.

### Example `runScript` method:

```typescript
// src/tools/sandbox.ts

export class SandboxTool {
  // ... existing methods

  /**
   * Writes a script to a file and executes it with node.
   * @param filename The name of the script file (e.g., 'script.js').
   * @param code The JavaScript/TypeScript code to execute.
   * @returns The execution result.
   */
  async runScript(filename: string, code: string): Promise<ExecResult> {
    // 1. Write the code to a file in the sandbox
    await this.writeFile(filename, code);

    // 2. Execute the file using node
    // (This assumes the sandbox has node available)
    const result = await this.exec(`node ${filename}`);

    // 3. (Optional) Clean up the file
    await this.deleteFile(filename);

    return result;
  }
}
```

### 3. Integrate Sandbox Logic into `ChatSessionActor`
- Open `src/actors/ChatSessionActor.ts`.
- Update the `executeTool` method to handle the `'sandbox'` tool call. It should be able to differentiate between running a simple command and executing a script.

### Example `ChatSessionActor.ts` Sandbox Integration:

```typescript
// src/actors/ChatSessionActor.ts

// ... in executeTool method
case 'sandbox':
  // If code is provided, it's a script execution
  if (args.code && args.filename) {
    return this.sandbox.runScript(args.filename, args.code);
  }
  // Otherwise, it's a simple shell command
  else if (args.command) {
    return this.sandbox.exec(args.command);
  }
  return { error: 'Sandbox tool requires either a `command` or `code` and `filename`.' };
```

### 4. Update the Planning Prompt
- The prompt that generates the research plan needs to be updated to make the agent aware of this powerful new capability.
- Instruct the agent that it can write and run code to verify facts, test API endpoints, or transform data.

### Example Prompt Snippet:

```
...
You have access to a `sandbox` tool. You can use it in two ways:
1.  Execute a shell command: `{"tool": "sandbox", "args": {"command": "ls -l"}}`
2.  Write and run a script: `{"tool": "sandbox", "args": {"filename": "verify.js", "code": "console.log(1+1);"}}`

Use the sandbox to verify information or perform calculations when necessary.
...
```

## Acceptance Criteria
- The agent can generate a research plan that includes steps to write and execute code in the sandbox.
- The `ChatSessionActor` correctly identifies these steps and uses the `SandboxTool` to perform the file write and execution.
- The `stdout` or `stderr` from the sandbox execution is captured and used in the final synthesis phase.
- For example, if asked "What is the result of this JS code: `[1,2,3].map(n => n*2)`?", the agent should create a plan to run this code in the sandbox and return the correct output.
