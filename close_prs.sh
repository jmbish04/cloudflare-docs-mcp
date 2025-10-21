#!/bin/bash

# This script closes the now-obsolete pull requests #8 and #11,
# adding a comment to each for clarity.

echo "Closing obsolete pull requests..."

# Close PR #8
echo "Closing PR #8..."
gh pr close 8 --comment "Superseded by the new, consolidated pull request that combines all work from feature/vision-refactor and feat/orchestrator-mcp."

# Close PR #11
echo "Closing PR #11..."
gh pr close 11 --comment "Superseded by the new, consolidated pull request that combines all work from feature/vision-refactor and feat/orchestrator-mcp."

echo "Obsolete pull requests have been closed successfully."
