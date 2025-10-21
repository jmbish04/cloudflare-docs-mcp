# Task 3: Enhance GitHub Tool Adapter

## Objective
Expand the existing `GitHubTool` to include methods for searching repositories and issues, and reading file contents, making it a comprehensive adapter for all necessary GitHub interactions.

## Context
The `feature/vision-refactor` branch created a `src/tools/github.ts` file with a `GitHubTool` class that has a basic `getRepoContents` method. To fulfill the research agent's needs, this tool must be expanded to support searching for relevant repositories and issues, and fetching specific file content.

## Requirements

### 1. Enhance the `GitHubTool` Class
- Open `src/tools/github.ts`.
- Add the following new public methods to the `GitHubTool` class.
- Ensure all methods use the authenticated Octokit instance (`this.client`).

### 2. Implement `searchRepositories` Method
- **Signature:** `async searchRepositories(query: string, language?: string, limit: number = 10): Promise<Repository[]>`
- **Logic:**
    - Use `this.client.rest.search.repos()` to search for repositories.
    - Construct a search query (`q`) that can include the main query and optionally a `language:` filter.
    - Use the `per_page` parameter to limit results.
    - Map the response items to a simplified `Repository` interface.
- **`Repository` Interface:**
    ```typescript
    export interface Repository {
      owner: string;
      repo: string;
      fullName: string;
      description: string | null;
      stars: number;
      url: string;
    }
    ```

### 3. Implement `searchIssues` Method
- **Signature:** `async searchIssues(query: string, repoFullName?: string, limit: number = 10): Promise<Issue[]>`
- **Logic:**
    - Use `this.client.rest.search.issuesAndPullRequests()` to search.
    - Construct a search query (`q`) that can include the main query and optionally a `repo:` filter.
    - Map the response items to a simplified `Issue` interface.
- **`Issue` Interface:**
    ```typescript
    export interface Issue {
      title: string;
      url: string;
      number: number;
      state: 'open' | 'closed';
      author: string;
      body: string | null;
    }
    ```

### 4. Implement `getFileContent` Method
- **Signature:** `async getFileContent(owner: string, repo: string, path: string): Promise<{ content: string; path: string } | null>`
- **Logic:**
    - Use `this.client.rest.repos.getContent()` to fetch file data.
    - The response content will be Base64 encoded. You must decode it to a UTF-8 string.
    - Handle cases where the path does not exist or is a directory. Return `null` in these cases.

### 5. Integrate New Methods into `ChatSessionActor`
- Open `src/actors/ChatSessionActor.ts`.
- Update the `executeTool` method to handle new tool calls that use these GitHub methods.
- You might have a single `'github_api'` tool name with a `subcommand` argument, or create distinct tool names like `'github_search_repos'`. A subcommand approach is more scalable.

### Example `ChatSessionActor.ts` Integration:

```typescript
// src/actors/ChatSessionActor.ts

// ... in executeTool method
case 'github_api':
  switch (args.subcommand) {
    case 'search_repos':
      return this.github.searchRepositories(args.query, args.language);
    case 'search_issues':
      return this.github.searchIssues(args.query, args.repo);
    case 'get_file_content':
      return this.github.getFileContent(args.owner, args.repo, args.path);
    case 'get_repo_contents': // Existing method
      return this.github.getRepoContents(args.owner, args.repo, args.path);
    default:
      return { error: `GitHub subcommand ${args.subcommand} not found.` };
  }
```

## Acceptance Criteria
- The `GitHubTool` class in `src/tools/github.ts` is updated with the new `searchRepositories`, `searchIssues`, and `getFileContent` methods.
- The `ChatSessionActor` can successfully call these new methods via its `executeTool` function.
- The agent's research plan can now include steps to search GitHub for repositories and issues.
