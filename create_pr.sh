#!/bin/bash

# This script creates a pull request for the feature/vision-refactor branch.

# --- Pull Request Details ---
PR_TITLE="feat: Implement Vision Refactor and Orchestration Plan"
PR_BODY="This pull request combines the foundational architectural refactor from Gemini with the strategic planning roadmap from Codex, superseding PRs #8 and #11.

### Gemini's Implementation (\`feature/vision-refactor\`)

This portion of the work focused on the foundational implementation of the new agent-based architecture.

- **Architectural Shift:** Rewrote the \`ChatSessionActor\` into a stateful agent capable of a \"Plan -> Execute -> Synthesize\" workflow.
- **New Tooling:** Introduced dedicated, typed tool classes for interacting with external services:
    - \`src/tools/browser.ts\` (\`BrowserRender\`)
    - \`src/tools/sandbox.ts\` (\`SandboxTool\`)
- **Cleanup:** Removed the previous, flawed \`ToolService\".

### Codex's Planning (\`feat/orchestrator-mcp\`)

This portion of the work provides the strategic roadmap for completing the project vision.

- **Project Roadmap (\`TODO.md\`):** A comprehensive \`TODO.md\` file was created, breaking down the remaining work into actionable tasks across all areas of the project (D1, Routing, Agents, Observability, etc.).
- **Documentation:** Added contribution comparison documents to clarify the work sequence.

### Next Steps

With this PR merged, the team can begin executing the tasks outlined in \`TODO.md\"."

# --- Create PR using a file for the body ---
echo "Creating pull request..."

# Write body to a temporary file
echo "$PR_BODY" > pr_body.txt

# Create the pull request using the correct flags
gh pr create \
  --base main \
  --head feature/vision-refactor \
  --title "$PR_TITLE" \
  --body-file pr_body.txt

# Clean up temporary file
rm pr_body.txt

echo "Pull request created successfully."